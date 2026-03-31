require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '127.0.0.1',
  API_KEY: process.env.X_API_KEY || 'my-super-secret-key',
  DB_PATH: process.env.DB_PATH || 'buffer.db',
  STORAGE_DIR: process.env.STORAGE_DIR || 'storage',
  FLUSH_INTERVAL_MS: process.env.FLUSH_INTERVAL_MS || 10000,
  SCREENSHOT_INTERVAL_MS: process.env.SCREENSHOT_INTERVAL_MS || 10000,
};
