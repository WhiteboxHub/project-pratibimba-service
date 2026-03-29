const { recordDomMutation } = require('../db/tracker');
const { saveCanvasSnapshot } = require('../utils/storage');

/**
 * Message Router
 * Differentiates strictly between payload types and routes appropriately.
 */
function routeMessage(ws, sessionManager, sessionId, message) {
  const { type, payload } = message;

  switch (type) {
    case 'TYPE_PING':
      // Client pinged to keep-alive
      sessionManager.updateLastSeen(sessionId);
      ws.send(JSON.stringify({ type: 'TYPE_PONG' }));
      break;

    case 'TYPE_DOM_MUTATION':
      // Store in timeline (SQLite buffer DB)
      sessionManager.updateLastSeen(sessionId);
      recordDomMutation(sessionId, payload);
      break;

    case 'TYPE_CANVAS_SNAPSHOT':
      // Write directly to file system to keep DB lean
      sessionManager.updateLastSeen(sessionId);
      saveCanvasSnapshot(sessionId, payload);
      break;

    default:
      console.warn(\`[Router] Unknown message type \${type} from \${sessionId}\`);
      break;
  }
}

module.exports = { routeMessage };
