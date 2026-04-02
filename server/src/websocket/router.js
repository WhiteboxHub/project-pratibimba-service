const logger = require('../utils/logger');
const { recordDomMutation } = require('../db/tracker');
const { saveCanvasSnapshot } = require('../utils/storage');

/**
 * Message Router
 * Differentiates strictly between payload types and routes appropriately.
 */
function routeMessage(ws, sessionManager, sessionId, message, systemId) {
  const { type, payload } = message;

  switch (type) {
    case 'TYPE_PING':
      sessionManager.updateLastSeen(sessionId);
      ws.send(JSON.stringify({ type: 'TYPE_PONG' }));
      break;

    case 'TYPE_DOM_MUTATION':
      sessionManager.updateLastSeen(sessionId);
      recordDomMutation(sessionId, payload);
      break;

    case 'TYPE_CANVAS_SNAPSHOT':
      sessionManager.updateLastSeen(sessionId);
      saveCanvasSnapshot(sessionId, payload, systemId);
      break;

    default:
      logger.warn({ type, sessionId }, 'Unknown message type');
      break;
  }
}

module.exports = { routeMessage };
