/**
 * auth.js
 * Dashboard login — unified with extension auth.
 * Uses the same MySQL `authuser` table and MD5 password verification
 * as extension-auth.js, so one company account works for both.
 *
 * Sessions stored in SQLite admin_sessions (lightweight, no extra MySQL table needed).
 */

const crypto = require('crypto');
const { db } = require('../db');
const { getPool } = require('../db/mysql');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prathibimba — Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 40px;
      width: 360px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; color: #f1f5f9; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 28px; }
    label {
      display: block; font-size: 12px; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
    }
    input {
      width: 100%; padding: 10px 14px; background: #0f172a;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
      color: #e2e8f0; font-size: 14px; margin-bottom: 16px;
      outline: none; transition: border-color 0.15s;
    }
    input:focus { border-color: #3b82f6; }
    button {
      width: 100%; padding: 12px; background: #3b82f6; color: #fff;
      border: none; border-radius: 8px; font-size: 14px;
      font-weight: 600; cursor: pointer; transition: background 0.15s; margin-top: 4px;
    }
    button:hover { background: #2563eb; }
    .error {
      background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
      color: #f87171; padding: 10px 14px; border-radius: 8px;
      font-size: 13px; margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔒 Prathibimba</h1>
    <p class="subtitle">Sign in with your company account</p>
    {{ERROR}}
    <form method="POST" action="/login">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" autocomplete="username" required autofocus />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    (cookieHeader || '').split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
}

/**
 * Middleware: require a valid dashboard session.
 * Call this on any route that needs protection.
 */
async function requireSession(request, reply) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies['session_token'];
  if (!token) return reply.redirect('/login');

  const session = db.prepare(
    "SELECT s.id, s.user_id, s.expires_at, u.uname FROM dashboard_sessions s JOIN authuser_cache u ON s.user_id = u.mysql_id WHERE s.token = ? LIMIT 1"
  ).get(token);

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) db.prepare('DELETE FROM dashboard_sessions WHERE token = ?').run(token);
    reply.header('Set-Cookie', 'session_token=; Path=/; HttpOnly; Max-Age=0');
    return reply.redirect('/login');
  }

  request.dashboardUser = { id: session.user_id, uname: session.uname };
}

function registerAuthRoutes(fastify) {
  // Ensure local session cache table exists (just stores user_id + uname for cookie lookups)
  db.exec(`
    CREATE TABLE IF NOT EXISTS authuser_cache (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      mysql_id INTEGER UNIQUE NOT NULL,
      uname    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dashboard_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      token      TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // GET /login
  fastify.get('/login', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    if (cookies['session_token']) {
      const session = db.prepare(
        "SELECT id FROM dashboard_sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1"
      ).get(cookies['session_token']);
      if (session) return reply.redirect('/snapshots');
    }
    reply.type('text/html').send(LOGIN_PAGE.replace('{{ERROR}}', ''));
  });

  // POST /login — validate against MySQL authuser (same as extension)
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.type('text/html').send(
        LOGIN_PAGE.replace('{{ERROR}}', '<div class="error">Username and password are required.</div>')
      );
    }

    let user = null;
    try {
      const mysqlDb = getPool();
      const [rows] = await mysqlDb.execute(
        'SELECT id, uname, passwd, status, enddate, role FROM authuser WHERE uname = ? LIMIT 1',
        [username.trim()]
      );
      user = rows[0] || null;
    } catch (err) {
      return reply.type('text/html').send(
        LOGIN_PAGE.replace('{{ERROR}}', '<div class="error">Database error. Please try again.</div>')
      );
    }

    // Verify credentials (MD5 — same as company backend)
    if (!user || user.passwd !== md5(password)) {
      return reply.type('text/html').send(
        LOGIN_PAGE.replace('{{ERROR}}', '<div class="error">Invalid username or password.</div>')
      );
    }

    // Enforce Employee-only access for the Dashboard
    const unameClean = username.trim();
    const [empRows] = await mysqlDb.execute(
      `SELECT id, name, email FROM employee
       WHERE (email = ? OR email LIKE CONCAT(?, '@%') OR CONCAT(?, '@%') LIKE CONCAT(email, '%'))
         AND status = 1
       LIMIT 1`,
      [unameClean, unameClean, unameClean]
    );

    if (!empRows[0]) {
      return reply.type('text/html').send(
        LOGIN_PAGE.replace('{{ERROR}}', '<div class="error">Access denied. No active employee record found for this account.</div>')
      );
    }

    // Check account expiry — only block if enddate is set AND in the past
    // if (user.enddate && new Date(user.enddate) < new Date()) {
    //   return reply.type('text/html').send(
    //     LOGIN_PAGE.replace('{{ERROR}}', '<div class="error">Account expired. Contact your administrator.</div>')
    //   );
    // }

    // Cache user locally so session lookups don't need MySQL
    db.prepare('INSERT OR REPLACE INTO authuser_cache (mysql_id, uname) VALUES (?, ?)').run(user.id, user.uname);

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);

    db.prepare('DELETE FROM dashboard_sessions WHERE user_id = ?').run(user.id); // one session per user
    db.prepare('INSERT INTO dashboard_sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

    reply.header('Set-Cookie', `session_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return reply.redirect('/snapshots');
  });

  // GET /logout
  fastify.get('/logout', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    if (cookies['session_token']) {
      db.prepare('DELETE FROM dashboard_sessions WHERE token = ?').run(cookies['session_token']);
    }
    reply.header('Set-Cookie', 'session_token=; Path=/; HttpOnly; Max-Age=0');
    return reply.redirect('/login');
  });
}

// hashPassword kept for backwards compat with seed-admin.js
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

module.exports = { registerAuthRoutes, requireSession, hashPassword };
