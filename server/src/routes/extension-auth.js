/**
 * extension-auth.js
 * POST /auth/extension-login
 *
 * Auth flow:
 *  1. Validate uname + password against `authuser` (MD5 — same as company backend)
 *  2. Confirm uname belongs to an active employee (employee.email matches uname)
 *  3. Upsert a record in `extension_keys` with a 24-hour expiry
 *  4. Return api_key to the extension — no re-login for 24h unless logged out
 *
 * POST /auth/extension-logout  — invalidates the key immediately
 */

const crypto = require('crypto');
const { getPool } = require('../db/mysql');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function registerExtensionAuthRoute(fastify) {

  // ── LOGIN ───────────────────────────────────────────────────────────────────
  fastify.post('/auth/extension-login', async (request, reply) => {
    const { uname, password, device_name } = request.body || {};

    if (!uname || !password) {
      return reply.code(400).send({ error: 'uname and password are required' });
    }

    const db = getPool();

    // 1. Validate credentials against authuser (MD5)
    const [authRows] = await db.execute(
      'SELECT id, uname, passwd, enddate FROM authuser WHERE uname = ? LIMIT 1',
      [uname.trim()]
    );
    const user = authRows[0];

    if (!user || user.passwd !== md5(password)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Check account expiry (null / zero-date means no expiry)
    if (user.enddate && String(user.enddate) !== '0000-00-00' && new Date(user.enddate) < new Date()) {
      return reply.code(403).send({ error: 'Account expired. Contact your administrator.' });
    }

    // 2. Confirm this uname belongs to an active employee
    //    Tries: exact email match, prefix match (uname@anything), or uname contains @
    const unameClean = uname.trim();
    const [empRows] = await db.execute(
      `SELECT id, name, email FROM employee
       WHERE (email = ? OR email LIKE CONCAT(?, '@%') OR CONCAT(?, '@%') LIKE CONCAT(email, '%'))
         AND status = 1
       LIMIT 1`,
      [unameClean, unameClean, unameClean]
    );
    const employee = empRows[0];

    // If you want hard enforcement, uncomment below:
    // if (!employee) return reply.code(403).send({ error: 'No active employee record found for this account.' });
    const employeeName = employee ? employee.name : unameClean;

    // 3. Ensure extension_keys table has expires_at column (safe migration)
    try {
      await db.execute('ALTER TABLE extension_keys ADD COLUMN expires_at DATETIME DEFAULT NULL');
    } catch (e) {
      if (e.errno !== 1060) throw e; // 1060 = duplicate column, already exists — safe to ignore
    }

    // 4. Upsert: one active key per user+device, valid 24 hours
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    const deviceKey = device_name ? device_name.trim() : 'default';

    // Check for an existing non-expired key for this user+device
    const [existing] = await db.execute(
      `SELECT api_key FROM extension_keys
       WHERE user_id = ? AND device_name = ? AND is_active = 1
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [user.id, deviceKey]
    );

    let apiKey;
    if (existing[0]) {
      // Refresh the expiry — extend by another 24h on re-login
      apiKey = existing[0].api_key;
      await db.execute(
        'UPDATE extension_keys SET last_used = NOW(), expires_at = ? WHERE api_key = ?',
        [expires, apiKey]
      );
    } else {
      // Deactivate any old/expired keys for this user+device first
      await db.execute(
        'UPDATE extension_keys SET is_active = 0 WHERE user_id = ? AND device_name = ?',
        [user.id, deviceKey]
      );
      // Issue a fresh 64-char hex key
      apiKey = crypto.randomBytes(32).toString('hex');
      await db.execute(
        `INSERT INTO extension_keys
           (user_id, uname, api_key, device_name, is_active, last_used, expires_at)
         VALUES (?, ?, ?, ?, 1, NOW(), ?)`,
        [user.id, user.uname, apiKey, deviceKey, expires]
      );
    }

    return reply.send({
      api_key: apiKey,
      uname: user.uname,
      employee_name: employeeName,
      expires_at: expires,
      message: 'Authenticated. Key valid for 24 hours.'
    });
  });

  // ── LOGOUT ──────────────────────────────────────────────────────────────────
  fastify.post('/auth/extension-logout', async (request, reply) => {
    const { api_key } = request.body || {};
    if (!api_key) return reply.code(400).send({ error: 'api_key required' });

    const db = getPool();
    await db.execute(
      'UPDATE extension_keys SET is_active = 0, expires_at = NOW() WHERE api_key = ?',
      [api_key]
    );
    return reply.send({ message: 'Logged out. Key invalidated.' });
  });
}

module.exports = { registerExtensionAuthRoute };
