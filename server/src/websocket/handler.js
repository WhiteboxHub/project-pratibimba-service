const zlib = require('zlib');
const { promisify } = require('util');
const inflateRaw = promisify(zlib.inflateRaw);
const logger = require('../utils/logger');
const sessionManager = require('./sessionManager');
const { routeMessage } = require('./router');
const { validateMessage } = require('./validator');
const { getPool } = require('../db/mysql');

async function handleConnection(ws, req) {
  const query = new URL(`http://localhost${req.url}`).searchParams;
  const apiKey = query.get('api_key');
  const sessionId = query.get('session_id');
  const systemId = query.get('system_id') || 'unknown-system';

  if (!apiKey) {
    logger.error('Missing api_key, closing connection');
    ws.close(1008, 'Missing api_key');
    return;
  }

  // Validate api_key against MySQL extension_keys table
  let authorizedUser = null;
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT ek.uname, ek.device_name FROM extension_keys ek
       WHERE ek.api_key = ? AND ek.is_active = 1
         AND (ek.expires_at IS NULL OR ek.expires_at > NOW())
       LIMIT 1`,
      [apiKey]
    );
    authorizedUser = rows[0] || null;
    if (authorizedUser) {
      // Update last_used timestamp
      await db.execute('UPDATE extension_keys SET last_used = NOW() WHERE api_key = ?', [apiKey]);
    }
  } catch (err) {
    logger.error({ err }, 'MySQL error during api_key validation');
    ws.close(1011, 'Server error during authentication');
    return;
  }

  if (!authorizedUser) {
    logger.error({ apiKey: apiKey.substring(0, 8) + '...' }, 'Invalid api_key, closing connection');
    ws.close(1008, 'Unauthorized - Invalid API Key');
    return;
  }

  logger.info({ uname: authorizedUser.uname, device: authorizedUser.device_name, sessionId }, 'Extension connected');

  if (!sessionId) {
    logger.error('Missing Session ID, closing connection');
    ws.close(1008, 'Missing Session ID');
    return;
  }

  sessionManager.addSession(sessionId, ws);
  sessionManager.sendThemeConfig(sessionId, { themeMode: 'dark', accentColor: '#3b82f6' });

  // ── Periodic re-validation (every 60s) ──────────────────────────────────────
  // If the api_key is changed/deactivated/expired in the DB while the socket is
  // open, the connection is closed immediately — screenshots stop right away.
  const revalidateInterval = setInterval(async () => {
    try {
      const db = getPool();
      const [rows] = await db.execute(
        `SELECT id FROM extension_keys
         WHERE api_key = ? AND is_active = 1
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [apiKey]
      );
      if (!rows[0]) {
        logger.warn({ sessionId, apiKey: apiKey.substring(0, 8) + '...' }, 'api_key revoked or expired — closing connection');
        ws.close(1008, 'API key revoked');
      }
    } catch (err) {
      logger.error({ err }, 'Re-validation DB error');
    }
  }, 60 * 1000);

  ws.on('message', async (message, isBinary) => {
    try {
      let payloadStr = message;

      if (isBinary) {
        try {
          const decompressed = await inflateRaw(message);
          payloadStr = decompressed.toString('utf-8');
        } catch (zlibErr) {
          logger.error({ err: zlibErr, sessionId }, 'Decompression failed');
          return;
        }
      }

      const parsedMessage = JSON.parse(payloadStr);

      const validationError = validateMessage(parsedMessage);
      if (validationError) {
        logger.warn({ sessionId, error: validationError }, 'Invalid message rejected');
        return;
      }

      routeMessage(ws, sessionManager, sessionId, parsedMessage, systemId);
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to process message');
    }
  });

  ws.on('close', () => {
    clearInterval(revalidateInterval);
    logger.info({ sessionId }, 'Connection closed by client');
    sessionManager.removeSession(sessionId);
  });

  ws.on('error', (error) => {
    logger.error({ err: error, sessionId }, 'Socket error');
  });
}

module.exports = { handleConnection };
