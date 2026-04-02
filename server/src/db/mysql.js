
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || '3306'),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

/**
 * Creates the extension_keys table in MySQL if it does not already exist.
 * Called once on server boot.
 */
async function initExtensionKeysTable() {
  const db = getPool();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS extension_keys (
      id          INT PRIMARY KEY AUTO_INCREMENT,
      user_id     INT NOT NULL,
      uname       VARCHAR(50) NOT NULL,
      api_key     VARCHAR(64) UNIQUE NOT NULL,
      device_name VARCHAR(100) DEFAULT NULL,
      is_active   TINYINT(1) DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used   DATETIME DEFAULT NULL,
      expires_at  DATETIME DEFAULT NULL,
      CONSTRAINT fk_authuser FOREIGN KEY (user_id) REFERENCES authuser(id)
    )
  `);
  // Safe migration: add expires_at if this table existed before the column was added
  try {
    await db.execute('ALTER TABLE extension_keys ADD COLUMN expires_at DATETIME DEFAULT NULL');
  } catch (e) {
    if (e.errno !== 1060) throw e; // 1060 = duplicate column, already exists — safe to ignore
  }
}

module.exports = { getPool, initExtensionKeysTable };
