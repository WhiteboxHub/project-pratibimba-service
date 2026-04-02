const { db } = require('../db');

/**
 * Parses cookies from the raw Cookie header string.
 */
function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
}

/**
 * Fastify middleware: protects any route it is applied to.
 * If the request has no valid session cookie, redirect to /login.
 */
async function authGuard(request, reply) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies['session_token'];

  if (!token) {
    return reply.redirect('/login');
  }

  const session = db.prepare(`
    SELECT s.*, u.username
    FROM admin_sessions s
    JOIN admin_users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) {
    // Token expired or invalid — clear cookie and send to login
    reply.header('Set-Cookie', 'session_token=; Path=/; HttpOnly; Max-Age=0');
    return reply.redirect('/login');
  }

  // Attach user info to request for use in route handlers if needed
  request.adminUser = { id: session.user_id, username: session.username };
}

module.exports = { authGuard };
