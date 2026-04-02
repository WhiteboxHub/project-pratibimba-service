/**
 * seed-extension-key.js
 * Seeds a dev API key directly into the extension_keys table.
 * Run ONCE to unblock WebSocket connections during development.
 *
 * Usage:
 *   node src/db/seed-extension-key.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function seed() {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     parseInt(process.env.DB_PORT || '3306'),
  });

  const DEV_API_KEY  = 'my-super-secret-key';
  const DEV_DEVICE   = 'dev-machine';

  // Ensure extension_keys table exists (without FK for dev seed simplicity)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS extension_keys (
      id          INT PRIMARY KEY AUTO_INCREMENT,
      user_id     INT NOT NULL,
      uname       VARCHAR(50) NOT NULL,
      api_key     VARCHAR(64) UNIQUE NOT NULL,
      device_name VARCHAR(100) DEFAULT NULL,
      is_active   TINYINT(1) DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used   DATETIME DEFAULT NULL
    )
  `);

  // Grab the first available user from authuser
  const [users] = await pool.execute('SELECT id, uname FROM authuser LIMIT 1');
  if (!users.length) {
    console.error('❌ No users found in authuser table. Please create a user first.');
    await pool.end();
    process.exit(1);
  }
  const { id: DEV_USER_ID, uname: DEV_UNAME } = users[0];
  console.log(`Using authuser: id=${DEV_USER_ID}, uname=${DEV_UNAME}`);

  // Check if key already exists
  const [rows] = await pool.execute(
    'SELECT id FROM extension_keys WHERE api_key = ? LIMIT 1',
    [DEV_API_KEY]
  );

  if (rows.length > 0) {
    console.log('✅ Dev key already exists in extension_keys — nothing to do.');
  } else {
    await pool.execute(
      'INSERT INTO extension_keys (user_id, uname, api_key, device_name, is_active) VALUES (?, ?, ?, ?, 1)',
      [DEV_USER_ID, DEV_UNAME, DEV_API_KEY, DEV_DEVICE]
    );
    console.log(`✅ Inserted dev api_key "${DEV_API_KEY}" for user "${DEV_UNAME}" into extension_keys.`);
  }

  await pool.end();
  console.log('Done.');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
