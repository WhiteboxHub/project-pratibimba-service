const { db } = require('../db');

// Insert DOM mutation into the database timeline
const insertTimelineStmt = db.prepare(\`
  INSERT INTO snapshots_buffer (session_id, payload)
  VALUES (?, ?)
\`);

function recordDomMutation(sessionId, payload) {
  try {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    insertTimelineStmt.run(sessionId, payloadStr);
  } catch (error) {
    console.error('[DB Tracker] Failed to record DOM mutation:', error);
  }
}

module.exports = { recordDomMutation };
