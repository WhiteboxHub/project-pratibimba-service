const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getAndClearBuffer } = require('./index');

function startWorker(logger) {
  const storageDir = path.resolve(process.cwd(), config.STORAGE_DIR);
  
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
    logger.info(`Created storage directory at ${storageDir}`);
  }

  logger.info(`Starting async flush worker... Interval: ${config.FLUSH_INTERVAL_MS}ms`);

  setInterval(() => {
    try {
      const records = getAndClearBuffer();
      if (records.length === 0) return;

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = path.join(storageDir, `snapshots_${dateStr}.jsonl`);
      
      const stream = fs.createWriteStream(filename, { flags: 'a' });
      for (const record of records) {
        stream.write(JSON.stringify(record) + '\n');
      }
      stream.end();

      logger.info(`Flushed ${records.length} records to ${filename}`);
    } catch (err) {
      logger.error({ err }, 'Failed to flush buffer to storage');
    }
  }, config.FLUSH_INTERVAL_MS);
}

module.exports = { startWorker };
