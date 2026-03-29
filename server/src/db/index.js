const Database = require('better-sqlite3');
const config = require('../config');
const path = require('path');
const fs = require('fs');

const storageDir = path.resolve(process.cwd(), config.STORAGE_DIR);
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const dbPath = path.resolve(process.cwd(), config.DB_PATH);
const db = new Database(dbPath);

db.exec(\`
  CREATE TABLE IF NOT EXISTS snapshots_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
\`);

module.exports = { db };
