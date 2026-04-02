require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306'),
  });

  const [tables] = await pool.execute('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  process.stdout.write('TABLES: ' + tableNames.join(', ') + '\n');

  // authuser columns
  const [authCols] = await pool.execute('DESCRIBE authuser');
  process.stdout.write('AUTHUSER_COLS: ' + authCols.map(c => c.Field).join(', ') + '\n');

  await pool.end();
}
run().catch(e => { process.stdout.write('ERR: ' + e.message + '\n'); process.exit(1); });
