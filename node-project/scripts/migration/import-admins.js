'use strict';
// Run: node scripts/migration/import-admins.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    database: process.env.MYSQL_DATABASE || 'proborzs_prob',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob');
  const db = mongoose.connection.db;

  const [admins] = await conn.execute('SELECT * FROM admins');
  console.log('Found', admins.length, 'admins in MySQL admins table');

  for (const a of admins) {
    console.log('\nProcessing:', a.email, '(' + a.name + ')');
    const existing = await db.collection('users').findOne({ email: a.email });
    if (existing) {
      await db.collection('users').updateOne(
        { email: a.email },
        { $set: { is_admin: true } }
      );
      console.log('  -> Updated existing user: is_admin = true');
    } else {
      await db.collection('users').insertOne({
        _id: new mongoose.Types.ObjectId(),
        name: a.name || 'Admin',
        email: a.email,
        mobile: a.mobile || null,
        password: a.password, // already bcrypt from Laravel
        deposit_balance: 0,
        winnings_balance: 0,
        kyc_status: 'approved',
        is_admin: true,
        is_test_user: false,
        created_at: a.created_at || new Date(),
        updated_at: new Date(),
      });
      console.log('  -> Inserted new admin user');
    }
  }

  const allAdmins = await db.collection('users').find({ is_admin: true }).project({ name: 1, email: 1 }).toArray();
  console.log('\n=== Admin users in MongoDB ===');
  allAdmins.forEach(u => console.log(' -', u.name, '|', u.email));
  console.log('\nLogin at: http://localhost:8001/login');
  console.log('Use the same password as your Laravel admin site.');

  await conn.end();
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
