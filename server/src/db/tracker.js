const logger = require('../utils/logger');
const { db } = require('../db');

const insertTimelineStmt = db.prepare(`
  INSERT INTO snapshots_buffer (session_id, payload)
  VALUES (?, ?)
`);

function recordDomMutation(sessionId, payload) {
  try {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    insertTimelineStmt.run(sessionId, payloadStr);
  } catch (error) {
    logger.error({ err: error }, 'Failed to record DOM mutation');
  }
}

module.exports = { recordDomMutation };
