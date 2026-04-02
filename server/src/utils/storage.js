const fs = require('fs');
const path = require('path');

const config = require('../config');
const logger = require('./logger');

const snapshotsDir = path.resolve(process.cwd(), config.STORAGE_DIR, 'snapshots');
if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

function saveCanvasSnapshot(sessionId, payload, systemId = 'unknown-system') {
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

  const targetDir = path.join(snapshotsDir, systemId, sessionId);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filename = `${timestamp}.${ext}`;
  const filePath = path.join(targetDir, filename);

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

async function cleanupOldSnapshots(daysToKeep = 7) {
  const maxAgeMs = daysToKeep * 24 * 60 * 60 * 1000;
  const now = Date.now();

  async function walkAndClean(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code !== 'ENOENT') logger.error({ err, dir }, 'Failed to read dir for cleanup');
      return false;
    }

    let isEmpty = true;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const isChildEmpty = await walkAndClean(fullPath);
        if (isChildEmpty) {
          try { await fs.promises.rmdir(fullPath); } catch(e) {}
        } else {
          isEmpty = false;
        }
      } else {
        if (!/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
          isEmpty = false;
          continue;
        }
        
        try {
          const stats = await fs.promises.stat(fullPath);
          if (now - Math.round(stats.mtimeMs) > maxAgeMs) {
            await fs.promises.unlink(fullPath);
            logger.info({ filePath: fullPath }, `Deleted snapshot older than ${daysToKeep} days`);
          } else {
            isEmpty = false; // still has fresh files
          }
        } catch (e) {
          isEmpty = false;
        }
      }
    }
    return isEmpty;
  }

  await walkAndClean(snapshotsDir);
}

module.exports = { saveCanvasSnapshot, cleanupOldSnapshots };
