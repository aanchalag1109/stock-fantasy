'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Login with OTP or password (client feedback): signup verifies the mobile with an OTP and may set a
 * password; login by OTP or password; set / reset password with an OTP; lockout after 5 wrong
 * passwords; update-profile cannot set a password with just a user_id any more.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const config = require('../../src/config/env');
const User = require('../../src/models/user.model');
const OtpVerification = require('../../src/models/otp-verification.model');
const Notification = require('../../src/models/notification.model');
const app = require('../../src/app');

logger.silent = true;
config.SMS.enabled = false; // static OTP
const OTP = config.OTP_STATIC_CODE;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, f = {}) {
  return Object.entries(f).every(([k, c]) => {
    if (k === '$or') return c.some((x) => matches(doc, x));
    const v = doc[k];
    if (c && typeof c === 'object' && !(c instanceof ObjectId) && !(c instanceof Date)) {
      return Object.entries(c).every(([op, arg]) => {
        if (op === '$ne') return !same(v, arg);
        if (op === '$gt') return v != null && v > arg;
        if (op === '$type') return typeof v === 'number';
        if (op === '$regex') return new RegExp(arg).test(String(v ?? ''));
        if (op === '$in') return arg.some((a) => same(v, a));
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(v, c);
  });
}
const query = (getRows, one) => {
  let rows = null;
  let sortSpec = null;
  let lim = null;
  const resolve = () => {
    rows = getRows();
    if (sortSpec) {
      const [[key, dir]] = Object.entries(sortSpec);
      rows = [...rows].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    if (lim) rows = rows.slice(0, lim);
    return one ? rows[0] || null : rows;
  };
  const q = {
    sort: (s) => { sortSpec = s; return q; }, select: () => q, lean: () => q, limit: (n) => { lim = n; return q; },
    then: (a, b) => Promise.resolve().then(resolve).then(a, b),
  };
  return q;
};
const hydrate = (name, d) => {
  if (!d) return d;
  Object.defineProperty(d, 'save', { value: async function save() { return this; }, enumerable: false, configurable: true });
  Object.defineProperty(d, 'toObject', { value: function toObject() { return { ...this }; }, enumerable: false, configurable: true });
  return d;
};
function apply(doc, u) {
  Object.assign(doc, u.$set || (u.$inc ? {} : u));
  Object.entries(u.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
}
[[User, 'users'], [OtpVerification, 'otps']].forEach(([M, name]) => {
  M.find = (f) => query(() => db[name].filter((d) => matches(d, f)).map((d) => hydrate(name, d)));
  M.findOne = (f) => query(() => db[name].filter((d) => matches(d, f)).map((d) => hydrate(name, d)), true);
  M.findById = (id) => query(() => db[name].filter((d) => same(d._id, id)).map((d) => hydrate(name, d)), true);
  M.create = async (doc) => { const d = { _id: new ObjectId(), created_at: new Date(), consumed_at: null, attempts: 0, ...doc }; db[name].push(d); return hydrate(name, d); };
  M.updateOne = async (f, u) => { const d = db[name].find((x) => matches(x, f)); if (d) apply(d, u); return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 }; };
  M.updateMany = async (f, u) => { db[name].filter((x) => matches(x, f)).forEach((d) => apply(d, u)); return {}; };
  M.deleteMany = async (f) => { db[name] = db[name].filter((x) => !matches(x, f)); return {}; };
  M.deleteOne = async (f) => { db[name] = db[name].filter((x) => !matches(x, f)); return {}; };
  M.findOneAndUpdate = (f, u, opts = {}) => {
    const run = async () => {
      const d = db[name].find((x) => matches(x, f));
      if (!d) return null;
      const before = { ...d };
      apply(d, u);
      return opts.new ? { ...d } : before;
    };
    return { lean: run, then: (a, b) => run().then(a, b) };
  };
});
Notification.countDocuments = async () => 0;

const MOBILE = '9876543210';
const user = () => db.users.find((u) => u.mobile === MOBILE);
const reset = () => { db = { users: [], otps: [] }; };

const api = (path, body) => request(app).post(`/api/v1${path}`).send(body);
async function otp(purpose, mobile = MOBILE) {
  db.otps = db.otps.filter((r) => !(r.mobile === mobile && r.purpose === purpose)); // skip the resend cooldown
  const res = await api('/send-otp', { mobile, purpose });
  assert.equal(res.status, 200, res.text);
}
async function signup(extra = {}) {
  await otp('signup');
  return api('/register', { name: 'Asha', email: 'asha@x.com', mobile: MOBILE, otp: OTP, ...extra });
}

describe('signup: OTP always, password optional', () => {
  beforeEach(reset);
  test('signup with a password stores a bcrypt hash and enables password login', async () => {
    const res = await signup({ password: 'secret123', password_confirmation: 'secret123' });
    assert.equal(res.status, 200, res.text);
    assert.ok(await bcrypt.compare('secret123', user().password));
    assert.equal(JSON.stringify(res.body).includes(user().password), false, 'hash never returned');
    const check = await request(app).get(`/api/v1/check-user?mobile=${MOBILE}`);
    assert.deepEqual([check.body.has_password, check.body.login_methods], [true, ['otp', 'password']]);
  });

  test('signup without a password (OTP only) still works', async () => {
    const res = await signup();
    assert.equal(res.status, 200, res.text);
    assert.equal(user().password, null);
    const check = await request(app).get(`/api/v1/check-user?mobile=${MOBILE}`);
    assert.deepEqual(check.body.login_methods, ['otp']);
  });

  test('a weak or mismatched password is rejected before the OTP is used', async () => {
    await otp('signup');
    let res = await api('/register', { name: 'Asha', email: 'asha@x.com', mobile: MOBILE, otp: OTP, password: 'short' });
    assert.equal(res.status, 400);
    assert.match(res.body.errors.password[0], /8–64 characters/);
    res = await api('/register', { name: 'Asha', email: 'asha@x.com', mobile: MOBILE, otp: OTP, password: 'secret123', password_confirmation: 'other123' });
    assert.equal(res.body.errors.password[0], 'Password confirmation does not match.');
    res = await api('/register', { name: 'Asha', email: 'asha@x.com', mobile: MOBILE, otp: OTP, password: 'secret123' });
    assert.equal(res.status, 200, 'the same OTP still works after rejected forms');
  });

  test('signup without the OTP is refused even with a password', async () => {
    const res = await api('/register', { name: 'Asha', email: 'asha@x.com', mobile: MOBILE, password: 'secret123' });
    assert.equal(res.status, 400);
    assert.equal(db.users.length, 0);
  });
});

describe('login: OTP or password', () => {
  beforeEach(reset);
  test('password login returns the same response as OTP login', async () => {
    await signup({ password: 'secret123' });
    const byPassword = await api('/password-login', { mobile: MOBILE, password: 'secret123', fcm_token: 'tok-1' });
    assert.equal(byPassword.status, 200, byPassword.text);
    await otp('login');
    const byOtp = await api('/login', { mobile: MOBILE, otp: OTP });
    assert.deepEqual(Object.keys(byPassword.body).sort(), Object.keys(byOtp.body).sort());
    assert.deepEqual(byPassword.body.user, byOtp.body.user);
    assert.equal(user().fcm_token, 'tok-1');
  });

  test('wrong password, unknown user, account without password', async () => {
    await signup();
    let res = await api('/password-login', { mobile: MOBILE, password: 'secret123' });
    assert.equal(res.status, 409);
    assert.equal(res.body.password_not_set, true);
    res = await api('/password-login', { mobile: '9000000000', password: 'secret123' });
    assert.equal(res.status, 404);
    user().password = await bcrypt.hash('secret123', 4);
    res = await api('/password-login', { mobile: MOBILE, password: 'wrong123' });
    assert.equal(res.status, 401);
    assert.equal(res.body.attempts_remaining, 4);
  });

  test('5 wrong passwords lock password login for 15 minutes; OTP login still works; reset clears it', async () => {
    await signup({ password: 'secret123' });
    for (let i = 0; i < 4; i += 1) assert.equal((await api('/password-login', { mobile: MOBILE, password: 'wrong123' })).status, 401);
    let res = await api('/password-login', { mobile: MOBILE, password: 'wrong123' });
    assert.equal(res.status, 429);
    assert.equal(res.body.retry_after, 900);
    res = await api('/password-login', { mobile: MOBILE, password: 'secret123' });
    assert.equal(res.status, 429, 'even the right password is refused while locked');
    await otp('login');
    assert.equal((await api('/login', { mobile: MOBILE, otp: OTP })).status, 200, 'OTP login unaffected');
    await otp('password');
    assert.equal((await api('/set-password', { mobile: MOBILE, otp: OTP, password: 'newpass123', password_confirmation: 'newpass123' })).status, 200);
    assert.equal((await api('/password-login', { mobile: MOBILE, password: 'newpass123' })).status, 200);
  });

  test('passwords from the PHP system ($2y$) are accepted', async () => {
    await signup();
    user().password = (await bcrypt.hash('legacy123', 4)).replace(/^\$2a\$/, '$2y$');
    assert.equal((await api('/password-login', { mobile: MOBILE, password: 'legacy123' })).status, 200);
  });
});

describe('set / reset password with OTP', () => {
  beforeEach(reset);
  test('an OTP-only user adds a password, then logs in with it', async () => {
    await signup();
    const sent = await api('/send-otp', { mobile: MOBILE, purpose: 'password' });
    assert.equal(sent.status, 200);
    const res = await api('/set-password', { mobile: MOBILE, otp: OTP, password: 'secret123', password_confirmation: 'secret123' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.message, 'Password saved. You can now login with your password.');
    assert.ok(res.body.user && res.body.user.id, 'logged in');
    assert.equal((await api('/password-login', { mobile: MOBILE, password: 'secret123' })).status, 200);
  });

  test('without a valid OTP nothing changes; unknown mobile gets 404 on send-otp', async () => {
    await signup({ password: 'secret123' });
    const before = user().password;
    let res = await api('/set-password', { mobile: MOBILE, otp: '000000', password: 'hacked123' });
    assert.equal(res.status, 400);
    assert.equal(user().password, before);
    res = await api('/send-otp', { mobile: '9000000000', purpose: 'reset_password' });
    assert.equal(res.status, 404);
  });

  test('the /auth/* paths work too', async () => {
    await signup({ password: 'secret123' });
    assert.equal((await request(app).post('/api/v1/auth/login/password').send({ mobile: MOBILE, password: 'secret123' })).status, 200);
  });
});

describe('update-profile can no longer set a password with only a user_id', () => {
  beforeEach(reset);
  const profile = (extra) => request(app).post('/api/v1/update-profile').field('user_id', String(user().old_id))
    .field('name', 'Asha').field('email', 'asha@x.com').field('mobile', MOBILE)
    .field('password', 'hacked123')
    .field('current_password', extra.current_password || '');

  test('account without a password → must use OTP', async () => {
    await signup();
    const res = await profile({});
    assert.equal(res.status, 403);
    assert.equal(res.body.password_not_set, true);
    assert.equal(user().password, null);
  });

  test('wrong current password → refused; right one → changed', async () => {
    await signup({ password: 'secret123' });
    assert.equal((await profile({ current_password: 'nope1234' })).status, 403);
    assert.ok(await bcrypt.compare('secret123', user().password));
    assert.equal((await profile({ current_password: 'secret123' })).status, 200);
    assert.ok(await bcrypt.compare('hacked123', user().password));
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): mobile / email change only with OTP
describe('changing mobile or email needs OTP', () => {
  beforeEach(reset);
  const NEW_MOBILE = '9123456780';
  const profile = (fields) => {
    let req = request(app).post('/api/v1/update-profile').field('user_id', String(user().old_id));
    Object.entries({ name: 'Asha', email: 'asha@x.com', mobile: MOBILE, ...fields }).forEach(([k, v]) => { req = req.field(k, v); });
    return req;
  };

  test('update-profile keeps working with the current mobile/email, but refuses to change them', async () => {
    await signup();
    assert.equal((await profile({ name: 'Asha K', mobile: `+91${MOBILE}` })).status, 200, 'same number in another format is not a change');
    assert.equal(user().name, 'Asha K');
    let res = await profile({ mobile: NEW_MOBILE });
    assert.equal(res.status, 403);
    assert.deepEqual([res.body.otp_required, res.body.field], [true, 'mobile']);
    res = await profile({ email: 'new@x.com' });
    assert.deepEqual([res.status, res.body.field], [403, 'email']);
    assert.deepEqual([user().mobile, user().email], [MOBILE, 'asha@x.com']);
  });

  test('change email: OTP to the registered mobile', async () => {
    await signup();
    const uid = user().old_id;
    let res = await api('/change-email', { user_id: uid, new_email: 'new@x.com', otp: '000000' });
    assert.equal(res.status, 400, 'no OTP requested yet');
    await otp('change_email');
    res = await api('/change-email', { user_id: uid, new_email: 'new@x.com', otp: OTP });
    assert.equal(res.status, 200, res.text);
    assert.equal(user().email, 'new@x.com');
  });

  test('change mobile: OTP to the current number AND to the new number', async () => {
    await signup();
    const uid = user().old_id;
    await otp('change_mobile');
    await otp('new_mobile', NEW_MOBILE);
    let res = await api('/change-mobile', { user_id: uid, new_mobile: NEW_MOBILE, otp_current: OTP });
    assert.equal(res.status, 400, 'both OTPs required');
    res = await api('/change-mobile', { user_id: uid, new_mobile: NEW_MOBILE, otp_current: OTP, otp_new: OTP });
    assert.equal(res.status, 200, res.text);
    assert.equal(db.users[0].mobile, NEW_MOBILE);
    assert.equal(res.body.user.mobile, NEW_MOBILE);
  });

  test('a number or email already used by another account is refused', async () => {
    await signup();
    db.users.push({ _id: new ObjectId(), old_id: 999, name: 'Other', email: 'other@x.com', mobile: NEW_MOBILE });
    assert.equal((await api('/send-otp', { mobile: NEW_MOBILE, purpose: 'new_mobile' })).status, 409);
    await otp('change_email');
    assert.equal((await api('/change-email', { user_id: user().old_id, new_email: 'other@x.com', otp: OTP })).status, 409);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the profile photo comes with the user everywhere
describe('profile photo in auth responses', () => {
  beforeEach(reset);
  test('login, password login and check-user return the full profile_image URL', async () => {
    config.APP_URL = 'http://206.189.133.192:8000';
    await signup({ password: 'secret123' });
    user().profile_image = 'uploads/profiles/profile_5_1.jpg';
    const url = 'http://206.189.133.192:8000/uploads/profiles/profile_5_1.jpg';
    assert.equal((await api('/password-login', { mobile: MOBILE, password: 'secret123' })).body.user.profile_image, url);
    await otp('login');
    assert.equal((await api('/login', { mobile: MOBILE, otp: OTP })).body.user.profile_image, url);
    assert.equal((await request(app).get(`/api/v1/check-user?mobile=${MOBILE}`)).body.user.profile_image, url);
    user().profile_image = null;
    assert.equal((await api('/password-login', { mobile: MOBILE, password: 'secret123' })).body.user.profile_image, null);
  });
});
