'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled iOS Force Update System
 * Covers iOS version parsing/comparison, App Store URL validation, policy
 * evaluation, the public iOS check API, the guard for iOS clients (independent of
 * the Android policy), and the admin page permissions / audit logging.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // unstubbed DB calls fail fast

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const Setting = require('../../src/models/setting.model');
const User = require('../../src/models/user.model');
const AdminRole = require('../../src/models/admin-role.model');
const Transaction = require('../../src/models/transaction.model');
const ios = require('../../src/services/ios-app-update-settings.service');
const android = require('../../src/services/app-update-settings.service');
const app = require('../../src/app');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── Stubs ───────────────────────────────────────────────────────────────────

let settings;
let settingsError;
let writes;
let auditLines;
Setting.findOne = (f) => ({
  lean: async () => {
    if (settingsError) throw settingsError;
    return settings[f.key] === undefined ? null : { key: f.key, value: settings[f.key] };
  },
});
Setting.find = () => ({ lean: async () => { throw new Error('not stubbed'); } });
Setting.findOneAndUpdate = async (f, doc) => { settings[f.key] = doc.value; writes.push(f.key); return doc; };
Setting.updateOne = async (f, update, opts) => {
  if (settings[f.key] === undefined && opts && opts.upsert) settings[f.key] = update.$setOnInsert.value;
  return {};
};
Transaction.create = async () => { writes.push('Transaction'); return {}; };

const realInfo = logger.info.bind(logger);
logger.info = (msg, ...rest) => { if (typeof msg === 'string' && msg.includes('[ios-app-update]')) auditLines.push(msg); return realInfo(msg, ...rest); };

const STORE = 'https://apps.apple.com/app/id1234567890';
const POLICY = {
  update_policy_enabled: true,
  force_update_enabled: true,
  latest_version: '2.10.0',
  minimum_supported_version: '2.9.0',
  update_message: 'Please update to keep trading safely.',
  optional_update_enabled: true,
  optional_update_message: 'A better version is available.',
  app_store_url: STORE,
};

function reset(iosPolicy = POLICY, androidPolicy = null) {
  settings = {};
  if (iosPolicy) settings[ios.SETTINGS_KEY] = { ...iosPolicy };
  if (androidPolicy) settings[android.SETTINGS_KEY] = { ...androidPolicy };
  settingsError = null;
  writes = [];
  auditLines = [];
}

// ─── Versions & URLs ─────────────────────────────────────────────────────────

describe('iOS versions', () => {
  test('parseVersion accepts 1–3 numeric parts and normalises', () => {
    assert.equal(ios.parseVersion('2.5.0'), '2.5.0');
    assert.equal(ios.parseVersion(' 2.05 '), '2.5');
    assert.equal(ios.parseVersion('3'), '3');
    for (const bad of ['', '0', '0.0.0', '2.5.0.1', 'v2.5', '2.5-beta', '2..5', '-1.0', 'abc', '12345.0']) {
      assert.equal(ios.parseVersion(bad), null, bad);
    }
  });

  test('compareVersions compares numbers, not strings', () => {
    assert.ok(ios.compareVersions('2.10.0', '2.9.0') > 0);
    assert.ok(ios.compareVersions('2.9', '2.10') < 0);
    assert.equal(ios.compareVersions('2.5', '2.5.0'), 0);
    assert.ok(ios.compareVersions('10.0', '9.99.99') > 0);
  });

  test('only App Store listings are accepted, normalised', () => {
    for (const ok of [STORE, 'https://apps.apple.com/in/app/probtrade/id1234567890', 'https://apps.apple.com/us/app/id1234567890/']) {
      assert.equal(ios.parseAppStoreUrl(ok).url, STORE, ok);
    }
    const rejected = [
      'http://apps.apple.com/app/id1234567890',
      'https://apps.apple.com.evil.com/app/id1234567890',
      'https://itunes.apple.com.attacker.io/app/id1234567890',
      'https://user:pw@apps.apple.com/app/id1234567890',
      'https://apps.apple.com:444/app/id1234567890',
      'https://apps.apple.com/developer/id1234567890',
      'https://apps.apple.com/app/probtrade',
      'https://apps.apple.com/app/id1234567890?redirect=https://evil.com',
      'https://play.google.com/store/apps/details?id=com.example.trade',
      'javascript:alert(1)',
    ];
    rejected.forEach((url) => assert.ok(ios.parseAppStoreUrl(url).error, url));
  });

  test('validate() checks fields and the version range', () => {
    assert.deepEqual(ios.validate({ ...POLICY }).errors, {});
    const bad = ios.validate({ update_policy_enabled: 'on', latest_version: '2.9.0', minimum_supported_version: '2.10.0', update_message: 'hi', app_store_url: '' });
    assert.deepEqual(Object.keys(bad.errors).sort(), ['app_store_url', 'minimum_supported_version', 'update_message']);
    const missing = ios.validate({});
    assert.ok(missing.errors.latest_version && missing.errors.minimum_supported_version);
    assert.equal(missing.errors.app_store_url, undefined, 'store URL optional while the policy is off');
  });

  test('defaults are safe, malformed stored values ignored, init is repeatable', async () => {
    reset({ update_policy_enabled: 'yes', latest_version: '2.5-beta', app_store_url: 'https://evil.com' });
    const s = await ios.getSettings();
    assert.equal(s.update_policy_enabled, false);
    assert.equal(s.latest_version, null);
    assert.equal(s.app_store_url, null);

    reset(null);
    await ios.initializeDefaults();
    assert.equal(settings[ios.SETTINGS_KEY].update_policy_enabled, false);
    settings[ios.SETTINGS_KEY] = { ...POLICY };
    await ios.initializeDefaults();
    assert.equal(settings[ios.SETTINGS_KEY].latest_version, '2.10.0');
  });
});

describe('iOS evaluate()', () => {
  const at = (version, overrides = {}) => ios.evaluate({ ...ios.DEFAULTS, ...POLICY, ...overrides }, version);

  test('covers every outcome', () => {
    assert.equal(at('2.8.9').status, 'required');
    assert.equal(at('2.8.9').update_required, true);
    assert.equal(at('2.8.9', { force_update_enabled: false }).status, 'recommended');
    assert.equal(at('2.9').status, 'optional'); // 2.9 == 2.9.0, supported
    assert.equal(at('2.9.5', { optional_update_enabled: false }).status, 'up_to_date');
    assert.equal(at('2.10').status, 'up_to_date');
    assert.equal(at('3.0.0').status, 'up_to_date');
    assert.equal(at('2.8.9', { update_policy_enabled: false }).status, 'disabled');
    assert.equal(at(null).status, 'unknown');
    assert.equal(at('2.8.9').store_url, STORE);
    assert.equal(at('2.8.9').platform, 'ios');
  });
});

// ─── Public API ──────────────────────────────────────────────────────────────

describe('GET /api/v1/app-version/ios', () => {
  beforeEach(() => reset());

  test('returns the decision for a query parameter or header, uncached', async () => {
    const res = await request(app).get('/api/v1/app-version/ios?version=2.8.0');
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body.status, 'required');
    assert.equal(res.body.latest_version, '2.10.0');
    assert.equal(res.body.store_url, STORE);
    const viaHeader = await request(app).get('/api/v1/app-version/ios').set('X-App-Version', '2.10.0');
    assert.equal(viaHeader.body.status, 'up_to_date');
  });

  test('exposes only policy fields; rejects malformed versions; reports outages', async () => {
    const res = await request(app).get('/api/v1/app-version/ios?version=2.9.1');
    assert.deepEqual(Object.keys(res.body).sort(), [
      'current_version', 'force_update_enabled', 'is_supported', 'latest_version', 'message',
      'minimum_supported_version', 'platform', 'show_prompt', 'status', 'store_url', 'success',
      'update_available', 'update_policy_enabled', 'update_required',
    ]);
    assert.equal((await request(app).get('/api/v1/app-version/ios?version=2.5-beta')).status, 400);
    settingsError = new Error('db down');
    assert.equal((await request(app).get('/api/v1/app-version/ios?version=2.9.0')).status, 503);
    assert.deepEqual(writes, []);
  });
});

// ─── Guard for iOS clients ───────────────────────────────────────────────────

describe('requireSupportedAppVersion for iOS clients', () => {
  beforeEach(() => reset());
  const SENSITIVE = ['/api/v1/deposit-amount', '/api/v1/withdraw-amount', '/api/v1/bulk-join-contest', '/api/v1/wallet/deposit', '/api/v1/wallet/withdraw', '/api/v1/contests/bulk-join'];
  const iosClient = (path, version) => request(app).post(path).set('X-App-Platform', 'ios').set('X-App-Version', version).send({ user_id: '7', amount: 1000 });

  test('blocks unsupported iOS versions with 426 before any write', async () => {
    for (const path of SENSITIVE) {
      writes = [];
      const res = await iosClient(path, '2.8.9');
      assert.equal(res.status, 426, path);
      assert.equal(res.body.platform, 'ios');
      assert.equal(res.body.current_version, '2.8.9');
      assert.equal(res.body.minimum_supported_version, '2.9.0');
      assert.equal(res.body.store_url, STORE);
      assert.deepEqual(writes, []);
    }
  });

  test('lets supported, unidentified, unforced or disabled iOS requests through', async () => {
    const path = '/api/v1/withdraw-amount';
    assert.notEqual((await iosClient(path, '2.10.0')).status, 426);
    assert.notEqual((await iosClient(path, '2.9')).status, 426);
    assert.notEqual((await request(app).post(path).set('X-App-Platform', 'ios').send({})).status, 426, 'no version header');
    reset({ ...POLICY, force_update_enabled: false });
    assert.notEqual((await iosClient(path, '1.0.0')).status, 426);
    reset({ ...POLICY, update_policy_enabled: false });
    assert.notEqual((await iosClient(path, '1.0.0')).status, 426);
  });

  test('rejects a malformed iOS version header', async () => {
    assert.equal((await iosClient('/api/v1/deposit-amount', 'latest')).status, 400);
  });

  test('iOS and Android policies are independent', async () => {
    // iOS forced, Android disabled: an Android client is not affected by the iOS policy
    reset(POLICY, { update_policy_enabled: false });
    assert.notEqual((await request(app).post('/api/v1/withdraw-amount').set('X-App-Version-Code', '1').send({})).status, 426);
    // Android forced, iOS disabled: an iOS client is not affected by the Android policy
    reset({ ...POLICY, update_policy_enabled: false }, {
      update_policy_enabled: true, force_update_enabled: true, latest_version_name: '2.5.0', latest_version_code: 20500,
      minimum_supported_version_code: 20400, play_store_url: 'https://play.google.com/store/apps/details?id=com.example.trade',
    });
    assert.notEqual((await iosClient('/api/v1/withdraw-amount', '1.0.0').set('X-App-Version-Code', '1')).status, 426);
    assert.equal((await request(app).post('/api/v1/withdraw-amount').set('X-App-Version-Code', '1').send({})).status, 426);
  });
});

// ─── Admin page ──────────────────────────────────────────────────────────────

describe('admin iOS App Update Settings', () => {
  const HASH = bcrypt.hashSync('secret123', 4);
  const roles = {};
  const admins = {};
  const q = (value) => { const o = { select: () => o, lean: () => o, then: (a, b) => Promise.resolve(value).then(a, b) }; return o; };
  User.findOne = (f) => q(Object.values(admins).find((a) => a.email === (f.$or ? f.$or[0].email : f.email)) || null);
  User.findById = (id) => q(Object.values(admins).find((a) => String(a._id) === String(id)) || null);
  AdminRole.findById = (id) => q(Object.values(roles).find((r) => String(r._id) === String(id)) || null);

  beforeEach(() => {
    reset();
    roles.viewer = { _id: new ObjectId(), name: 'Viewer', permissions: ['app_update_settings.view'] };
    roles.editor = { _id: new ObjectId(), name: 'Editor', permissions: ['app_update_settings.edit'] };
    roles.other = { _id: new ObjectId(), name: 'Other', permissions: ['users.view'] };
    Object.keys(roles).forEach((key) => {
      admins[key] = { _id: new ObjectId(), name: key, email: `${key}@test.local`, password: HASH, is_admin: true, admin_role_id: roles[key]._id };
    });
  });

  async function loginAs(key) {
    const agent = request.agent(adminApp);
    await agent.post('/login').type('form').send({ email: `${key}@test.local`, password: 'secret123' });
    return agent;
  }
  const VALID = { ...POLICY, latest_version: '2.11.0', minimum_supported_version: '2.10.0' };

  test('view permission reads, cannot save; other admins are refused', async () => {
    const viewer = await loginAs('viewer');
    const page = await viewer.get('/ios-app-update');
    assert.equal(page.status, 200);
    assert.match(page.text, /iOS App Update Settings/);
    assert.match(page.text, /<fieldset disabled>/);
    assert.match(page.text, /Version <strong>2\.8\.99<\/strong> \(below minimum\): Blocked/);
    assert.match(page.text, /href="\/ios-app-update"/, 'sidebar link');
    assert.equal((await viewer.post('/ios-app-update').set('Accept', 'application/json').send(VALID)).status, 403);
    assert.deepEqual(writes, []);

    const other = await loginAs('other');
    assert.equal((await other.get('/ios-app-update')).status, 403);
    assert.equal((await other.get('/ios-app-update/data')).status, 403);
  });

  test('edit permission saves, the change is audited and applies immediately', async () => {
    const editor = await loginAs('editor');
    const res = await editor.post('/ios-app-update').set('Accept', 'application/json').send(VALID);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.message, 'iOS app update settings saved. The new policy applies to the next app check.');
    assert.equal(settings[ios.SETTINGS_KEY].minimum_supported_version, '2.10.0');
    assert.equal(settings[android.SETTINGS_KEY], undefined, 'Android settings untouched');

    const line = auditLines.find((l) => l.includes('updated the iOS update policy'));
    assert.match(line, /editor@test\.local/);
    assert.match(line, /minimum_supported_version: "2\.9\.0" -> "2\.10\.0"/);

    assert.equal((await request(app).get('/api/v1/app-version/ios?version=2.9.5')).body.status, 'required');
  });

  test('invalid input returns field errors and saves nothing', async () => {
    const editor = await loginAs('editor');
    const res = await editor.post('/ios-app-update').set('Accept', 'application/json')
      .send({ ...VALID, minimum_supported_version: '3.0', app_store_url: 'https://apps.apple.com.evil.com/app/id1234567890' });
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.minimum_supported_version);
    assert.ok(res.body.errors.app_store_url);
    assert.deepEqual(writes, []);
  });
});
