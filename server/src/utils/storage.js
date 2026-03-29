const fs = require('fs');
const path = require('path');
const config = require('../config');

// Ensure directories exist
const snapshotsDir = path.resolve(process.cwd(), config.STORAGE_DIR, 'snapshots');
if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

function saveCanvasSnapshot(sessionId, payload) {
  // Payload should contain { filename, data: <base64 or binary buffer> }
  // Assuming payload.data is a base64 string for simplicity, or binary buffer.
  const timestamp = Date.now();
  const filename = \`\${sessionId}_\${timestamp}.webp\`;
  const filePath = path.join(snapshotsDir, filename);

  // If payload is base64
  if (typeof payload === 'string' && payload.startsWith('data:image')) {
    const base64Data = payload.replace(/^data:image\/\\w+;base64,/, '');
    fs.writeFile(filePath, base64Data, { encoding: 'base64' }, (err) => {
      if (err) console.error('[Storage] Error saving canvas snapshot', err);
    });
  } else if (Buffer.isBuffer(payload)) {
    fs.writeFile(filePath, payload, (err) => {
      if (err) console.error('[Storage] Error saving canvas snapshot buffer', err);
    });
  }
}

module.exports = { saveCanvasSnapshot };
