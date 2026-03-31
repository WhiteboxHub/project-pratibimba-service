const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

const snapshotsDir = path.resolve(process.cwd(), config.STORAGE_DIR, 'snapshots');
if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

function saveCanvasSnapshot(sessionId, payload) {
  const timestamp = Date.now();

  // Detect actual image format from the data URL header
  let ext = 'jpg';
  if (typeof payload === 'string') {
    const match = payload.match(/^data:image\/(\w+);/);
    if (match) ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  } else if (payload && typeof payload === 'object' && typeof payload.data === 'string') {
    const match = payload.data.match(/^data:image\/(\w+);/);
    if (match) ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  }

  const filename = `${sessionId}_${timestamp}.${ext}`;
  const filePath = path.join(snapshotsDir, filename);

  // Normalize: support both raw data and { data: ... } object payloads
  let data = payload;
  if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload) && payload.data) {
    data = payload.data;
  }

  if (typeof data === 'string' && data.startsWith('data:image')) {
    const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFile(filePath, base64Data, { encoding: 'base64' }, (err) => {
      if (err) logger.error({ err, filePath }, 'Error saving canvas snapshot');
      else logger.info({ filePath, sessionId }, 'Saved canvas snapshot');
    });
  } else if (Buffer.isBuffer(data)) {
    fs.writeFile(filePath, data, (err) => {
      if (err) logger.error({ err, filePath }, 'Error saving canvas snapshot buffer');
      else logger.info({ filePath, sessionId }, 'Saved canvas snapshot');
    });
  } else {
    logger.warn({ sessionId, payloadType: typeof data }, 'Unhandled snapshot payload format');
  }
}

module.exports = { saveCanvasSnapshot };
