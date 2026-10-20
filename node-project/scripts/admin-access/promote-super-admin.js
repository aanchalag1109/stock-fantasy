'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin User Access Control
 * Purpose: Manage admin users, roles, and feature-level permissions
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Recovery tool: makes an existing admin an active super admin (e.g. if the only
 * super admin account was lost). Run:
 *   npm run admin:promote-super -- admin@example.com
 */

const mongoose = require('mongoose');
const { connectDB } = require('../../src/config/database');
const User = require('../../src/models/user.model');

async function run() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run admin:promote-super -- <admin-email>');
    process.exit(1);
  }
  await connectDB();
  const user = await User.findOne({ email, is_admin: true });
  if (!user) {
    console.error(`No admin user found with email ${email}. Only existing admins can be promoted.`);
    process.exit(1);
  }
  user.is_super_admin = true;
  user.admin_status = 'active';
  user.admin_role_id = null;
  await user.save();
  console.log(`${user.name} <${user.email}> is now an active super admin.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error('Error:', e.message); process.exit(1); });
