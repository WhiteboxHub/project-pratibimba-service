/**
 * fix-enddate.js
 * Shows all users in authuser and their enddate.
 * Run with --fix to extend all expired/near-expiry accounts by 1 year.
 *
 * Usage:
 *   node src/db/fix-enddate.js           -- just show
 *   node src/db/fix-enddate.js --fix     -- update enddate
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     parseInt(process.env.DB_PORT || '3306'),
  });

  const [rows] = await pool.execute(
    'SELECT id, uname, status, enddate FROM authuser ORDER BY id'
  );

  console.log('\n--- authuser accounts ---');
  const now = new Date();
  for (const r of rows) {
    const expired = r.enddate && new Date(r.enddate) < now;
    console.log(
      `  id=${r.id}  uname=${r.uname}  status=${r.status}  enddate=${r.enddate || 'NULL'}${expired ? '  ⚠️  EXPIRED' : ''}`
    );
  }

  if (process.argv.includes('--fix')) {
    const oneYearOut = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10); // YYYY-MM-DD

    const [result] = await pool.execute(
      `UPDATE authuser SET enddate = ? WHERE enddate IS NOT NULL AND enddate < NOW()`,
      [oneYearOut]
    );
    console.log(`\n✅ Updated ${result.affectedRows} expired account(s). New enddate: ${oneYearOut}`);
  } else {
    console.log('\nRun with --fix to extend expired accounts by 1 year.');
  }

  await pool.end();
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
