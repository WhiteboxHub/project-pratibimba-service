const zlib = require('zlib');
const { promisify } = require('util');
const inflateRaw = promisify(zlib.inflateRaw);
const config = require('../config');
const logger = require('../utils/logger');
const sessionManager = require('./sessionManager');
const { routeMessage } = require('./router');
const { validateMessage } = require('./validator');

function handleConnection(ws, req) {
  const query = new URL(`http://localhost${req.url}`).searchParams;
  const apiKey = query.get('api_key');
  const sessionId = query.get('session_id');

  if (apiKey !== config.API_KEY) {
    logger.error({ apiKey }, 'Invalid API key, closing connection');
    ws.close(1008, 'Unauthorized - Invalid Theme Engine Key');
    return;
  }

  if (!sessionId) {
    logger.error('Missing Session ID, closing connection');
    ws.close(1008, 'Missing Session ID');
    return;
  }

  sessionManager.addSession(sessionId, ws);
  sessionManager.sendThemeConfig(sessionId, { themeMode: 'dark', accentColor: '#3b82f6' });

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

      routeMessage(ws, sessionManager, sessionId, parsedMessage);
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to process message');
    }
  });

  ws.on('close', () => {
    logger.info({ sessionId }, 'Connection closed by client');
    sessionManager.removeSession(sessionId);
  });

  ws.on('error', (error) => {
    logger.error({ err: error, sessionId }, 'Socket error');
  });
}

module.exports = { handleConnection };
