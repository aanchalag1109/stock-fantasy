'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Login with OTP or password (client feedback)
 * Purpose: Password rules, hashing and brute-force protection for the app's password login.
 *   - Signup always verifies the mobile number with one OTP; the user may also set a password then.
 *   - Login: OTP (POST /login) or password (POST /password-login), the user's choice.
 *   - A password is set / reset only with an OTP (POST /set-password, OTP purpose "password"),
 *     or changed in update-profile with the current password — never with just a user_id.
 *   - 5 wrong passwords lock password login for 15 minutes (OTP login still works).
 * Passwords from the PHP system ($2y$ bcrypt) are accepted.
 */

const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

const MIN_LENGTH = 8;
const MAX_LENGTH = 64;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RULE_TEXT = `Password must be ${MIN_LENGTH}–${MAX_LENGTH} characters and contain at least one letter and one number.`;

/** null when the password is acceptable, otherwise the message to show. */
function validatePassword(password, confirmation) {
  const value = typeof password === 'string' ? password : '';
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH || !/[A-Za-z]/.test(value) || !/\d/.test(value)) return RULE_TEXT;
  if (confirmation !== undefined && confirmation !== null && confirmation !== value) return 'Password confirmation does not match.';
  return null;
}

const hashPassword = (password) => bcrypt.hash(password, 10);

/** Compares with the stored bcrypt hash (PHP's $2y$ is the same algorithm as $2a$). */
async function matches(password, hash) {
  if (typeof password !== 'string' || !password || typeof hash !== 'string' || !/^\$2[aby]\$/.test(hash)) return false;
  try {
    return await bcrypt.compare(password, hash.replace(/^\$2y\$/, '$2a$'));
  } catch (err) {
    return false;
  }
}

const hasPassword = (user) => !!(user && typeof user.password === 'string' && /^\$2[aby]\$/.test(user.password));

/**
 * Checks a password login attempt with lockout.
 * @returns {Promise<{ ok:true } | { ok:false, status:number, message:string, password_not_set?:boolean, retry_after?:number, attempts_remaining?:number }>}
 */
async function checkLogin(user, password) {
  if (!hasPassword(user)) {
    return { ok: false, status: 409, password_not_set: true, message: 'No password is set for this account. Please login with OTP, or set a password with OTP.' };
  }
  const lockedUntil = user.password_locked_until ? new Date(user.password_locked_until) : null;
  if (lockedUntil && lockedUntil > new Date()) {
    return {
      ok: false,
      status: 429,
      retry_after: Math.ceil((lockedUntil - Date.now()) / 1000),
      message: `Too many wrong passwords. Try again in ${Math.ceil((lockedUntil - Date.now()) / 60000)} minutes, or login with OTP.`,
    };
  }
  if (await matches(password, user.password)) {
    if (user.password_failed_attempts || user.password_locked_until) {
      await User.updateOne({ _id: user._id }, { $set: { password_failed_attempts: 0, password_locked_until: null } });
    }
    return { ok: true };
  }
  const after = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { password_failed_attempts: 1 } },
    { new: true, projection: { password_failed_attempts: 1 } },
  ).lean();
  const failed = (after && after.password_failed_attempts) || 1;
  if (failed >= MAX_FAILED) {
    await User.updateOne({ _id: user._id }, { $set: { password_failed_attempts: 0, password_locked_until: new Date(Date.now() + LOCK_MINUTES * 60000) } });
    return { ok: false, status: 429, retry_after: LOCK_MINUTES * 60, message: `Too many wrong passwords. Password login is locked for ${LOCK_MINUTES} minutes. You can still login with OTP.` };
  }
  return { ok: false, status: 401, attempts_remaining: MAX_FAILED - failed, message: 'Incorrect password. Please try again.' };
}

/** Saves a new password (already validated) and clears any lockout. */
async function setPassword(userId, password) {
  await User.updateOne({ _id: userId }, {
    $set: { password: await hashPassword(password), password_set_at: new Date(), password_failed_attempts: 0, password_locked_until: null },
  });
}

module.exports = { validatePassword, hashPassword, matches, hasPassword, checkLogin, setPassword, RULE_TEXT, MIN_LENGTH, MAX_LENGTH, MAX_FAILED, LOCK_MINUTES };
