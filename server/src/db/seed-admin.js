/**
 * seed-admin.js
 * Run this ONCE on the server to create your first admin user.
 *
 * Usage:
 *   node src/db/seed-admin.js <username> <password>
 *
 * Example:
 *   node src/db/seed-admin.js admin mySecurePassword123
 */

require('dotenv').config();
const { db } = require('./index');
const { hashPassword } = require('../routes/auth');

const [,, username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: node src/db/seed-admin.js <username> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
if (existing) {
  console.error(`User "${username}" already exists.`);
  process.exit(1);
}

const hash = hashPassword(password);
db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);

console.log(`✅ Admin user "${username}" created successfully.`);
console.log('   You can now log in at https://yourdomain.com/login');
db.close();
