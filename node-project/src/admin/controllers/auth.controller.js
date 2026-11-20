'use strict';

const bcrypt = require('bcryptjs');
const User = require('../../models/user.model');
const { renderStandalone } = require('../helpers/render');

const showLogin = (req, res) => {
  // NEW IMPLEMENTATION — NODE.JS PROJECT: app.js already moved the flash messages into res.locals
  // (reading them empties them), so the login errors were never shown. Use those first.
  const pick = (key) => {
    const fromLocals = Array.isArray(res.locals[key]) ? res.locals[key] : [];
    return fromLocals.length ? fromLocals : req.flash(key);
  };
  renderStandalone(res, 'auth/login', {
    error: pick('error'),
    success: pick('success'),
  });
};

// NEW IMPLEMENTATION — NODE.JS PROJECT: admin review (Priority 1) — login hardening.
//   - email/password are forced to strings, so a crafted body such as email[$ne]=x can no longer
//     turn into a MongoDB operator that matches the first admin;
//   - email matching is case-insensitive (emails are saved lowercased);
//   - one message for every failure, so the form does not reveal which emails are admins;
//   - failed attempts are throttled per account and per IP (in memory, per process);
//   - the session id is regenerated on login (no session fixation).
const MAX_FAILS_PER_ACCOUNT = 5;
const MAX_FAILS_PER_IP = 20;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // key -> { count, first }

function tooMany(key, max, now = Date.now()) {
  const f = failures.get(key);
  if (!f) return false;
  if (now - f.first > LOCK_MS) { failures.delete(key); return false; }
  return f.count >= max;
}
function recordFailure(key, now = Date.now()) {
  const f = failures.get(key);
  if (!f || now - f.first > LOCK_MS) failures.set(key, { count: 1, first: now });
  else f.count += 1;
  if (failures.size > 10000) failures.delete(failures.keys().next().value); // bound memory
}
const INVALID = 'Invalid credentials or not an admin.';

const login = async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const accountKey = `acct:${email.toLowerCase()}`;
  const ipKey = `ip:${req.ip}`;
  try {
    if (tooMany(accountKey, MAX_FAILS_PER_ACCOUNT) || tooMany(ipKey, MAX_FAILS_PER_IP)) {
      req.flash('error', 'Too many failed login attempts. Please wait 15 minutes and try again.');
      return res.redirect('/login');
    }
    const user = email && password ? await User.findOne({
      $or: [{ email: email.toLowerCase() }, { email }, { mobile: email }],
      is_admin: true,
    }) : null;
    const valid = user ? await bcrypt.compare(password, user.password || '') : false;
    if (!user || !valid) {
      recordFailure(accountKey);
      recordFailure(ipKey);
      req.flash('error', INVALID);
      return res.redirect('/login');
    }

    // NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control — disabled admins cannot log in.
    if (user.admin_status === 'disabled') {
      req.flash('error', 'Your admin account has been disabled. Please contact a super admin.');
      return res.redirect('/login');
    }
    failures.delete(accountKey);

    const admin = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };
    req.session.regenerate((err) => {
      if (err) { req.flash('error', 'Login failed. Please try again.'); return res.redirect('/login'); }
      req.session.admin = admin;
      req.flash('success', `Welcome back, ${user.name}!`);
      req.session.save(() => res.redirect('/dashboard'));
    });
  } catch (err) {
    req.flash('error', 'Login failed. Please try again.');
    res.redirect('/login');
  }
};

const logout = (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
};

module.exports = { showLogin, login, logout, _resetLoginThrottle: () => failures.clear() };
