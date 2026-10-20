'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled Android Force Update System
 * Covers validation, policy evaluation, the public version-check API, the
 * enforcement guard on sensitive routes, and admin permissions / audit logging.
 * The settings collection and admin users are stubbed in memory.
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
const WithdrawalRequest = require('../../src/models/withdrawal-request.model');
const service = require('../../src/services/app-update-settings.service');
const app = require('../../src/app');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── Stubs ───────────────────────────────────────────────────────────────────

let settings;       // key -> value
let settingsError;  // when set, settings reads throw
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
WithdrawalRequest.create = async () => { writes.push('WithdrawalRequest'); return {}; };

const realInfo = logger.info.bind(logger);
logger.info = (msg, ...rest) => { if (typeof msg === 'string' && msg.includes('[android-app-update]')) auditLines.push(msg); return realInfo(msg, ...rest); };

const PLAY = 'https://play.google.com/store/apps/details?id=com.example.trade';
const POLICY = {
  update_policy_enabled: true,
  force_update_enabled: true,
  latest_version_name: '2.5.0',
  latest_version_code: 20500,
  minimum_supported_version_code: 20400,
  update_message: 'Please update to keep trading safely.',
  optional_update_enabled: true,
  optional_update_message: 'A better version is available.',
  play_store_url: PLAY,
};

function reset(policy = POLICY) {
  settings = policy ? { [service.SETTINGS_KEY]: { ...policy } } : {};
  settingsError = null;
  writes = [];
  auditLines = [];
}

// ─── Validation ──────────────────────────────────────────────────────────────

describe('validation', () => {
  test('version codes must be positive whole numbers', () => {
    assert.equal(service.parseVersionCode('20500'), 20500);
    assert.equal(service.parseVersionCode(7), 7);
    for (const bad of ['', '0', '-1', '1.5', '1e5', 'abc', ' 12 a', 0, 1.5, '99999999999', '2100000001']) {
      assert.equal(service.parseVersionCode(bad), null, String(bad));
    }
  });

  test('only Google Play app listings are accepted, normalised', () => {
    assert.deepEqual(service.parsePlayStoreUrl(PLAY), { url: PLAY, packageName: 'com.example.trade' });
    assert.equal(service.parsePlayStoreUrl(`${PLAY}&hl=en_IN`).url, PLAY);
    const rejected = [
      'http://play.google.com/store/apps/details?id=com.example.trade',
      'https://play.google.com.evil.com/store/apps/details?id=com.example.trade',
      'https://evil.com/?u=https://play.google.com/store/apps/details?id=com.example.trade',
      'https://user:pw@play.google.com/store/apps/details?id=com.example.trade',
      'https://play.google.com:8443/store/apps/details?id=com.example.trade',
      'https://play.google.com/store/apps/dev?id=123',
      'https://play.google.com/store/apps/details',
      'https://play.google.com/store/apps/details?id=noDots',
      'https://play.google.com/store/apps/details?id=com.example.trade&redirect=https://evil.com',
      'https://probtrade.com/admin/public/prob.apk',
      'javascript:alert(1)',
      'not a url',
    ];
    rejected.forEach((url) => assert.ok(service.parsePlayStoreUrl(url).error, url));
  });

  test('validate() checks every field and the version range', () => {
    const ok = service.validate({ ...POLICY, latest_version_code: '20500', minimum_supported_version_code: '20400', update_policy_enabled: 'on' });
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.values.latest_version_code, 20500);
    assert.equal(ok.values.update_policy_enabled, true);

    const bad = service.validate({
      update_policy_enabled: true,
      latest_version_name: 'v2.5-beta',
      latest_version_code: '20400',
      minimum_supported_version_code: '20500',
      update_message: '<b>update</b> now please',
      optional_update_message: 'short',
      play_store_url: '',
    });
    assert.deepEqual(Object.keys(bad.errors).sort(), ['latest_version_name', 'minimum_supported_version_code', 'optional_update_message', 'play_store_url', 'update_message']);

    const missing = service.validate({});
    assert.ok(missing.errors.latest_version_name && missing.errors.latest_version_code && missing.errors.minimum_supported_version_code);
    assert.equal(missing.errors.play_store_url, undefined, 'store URL is optional while the policy is off');
    assert.equal(missing.values.update_message, service.DEFAULTS.update_message, 'default message is used when empty');
  });

  test('malformed stored values fall back to safe defaults', async () => {
    reset({ update_policy_enabled: 'yes', latest_version_code: 'abc', play_store_url: 'https://evil.com', update_message: '<script>' });
    const s = await service.getSettings();
    assert.equal(s.update_policy_enabled, false);
    assert.equal(s.latest_version_code, null);
    assert.equal(s.play_store_url, null);
    assert.equal(s.update_message, service.DEFAULTS.update_message);
  });

  test('initializeDefaults is repeatable and never overwrites', async () => {
    reset(null);
    await service.initializeDefaults();
    assert.equal(settings[service.SETTINGS_KEY].update_policy_enabled, false);
    settings[service.SETTINGS_KEY] = { ...POLICY };
    await service.initializeDefaults();
    assert.equal(settings[service.SETTINGS_KEY].latest_version_code, 20500);
  });
});

// ─── Policy evaluation ───────────────────────────────────────────────────────

describe('evaluate()', () => {
  const at = (code, overrides = {}) => service.evaluate({ ...service.DEFAULTS, ...POLICY, ...overrides }, code);

  test('force update blocks builds below the minimum', () => {
    const r = at(20399);
    assert.equal(r.status, 'required');
    assert.equal(r.update_required, true);
    assert.equal(r.is_supported, false);
    assert.equal(r.message, POLICY.update_message);
    assert.equal(r.store_url, PLAY);
  });

  test('without force update, old builds are prompted but not blocked', () => {
    const r = at(20399, { force_update_enabled: false });
    assert.equal(r.status, 'recommended');
    assert.equal(r.update_required, false);
    assert.equal(r.show_prompt, true);
  });

  test('supported but older builds get the optional prompt (when enabled)', () => {
    assert.equal(at(20400).status, 'optional');
    assert.equal(at(20400).message, POLICY.optional_update_message);
    const quiet = at(20499, { optional_update_enabled: false });
    assert.equal(quiet.status, 'up_to_date');
    assert.equal(quiet.update_available, true);
    assert.equal(quiet.show_prompt, false);
  });

  test('latest and newer builds are up to date; numbers, not strings, are compared', () => {
    assert.equal(at(20500).status, 'up_to_date');
    assert.equal(at(100000).status, 'up_to_date');
    assert.equal(at(9, { minimum_supported_version_code: 10, latest_version_code: 10 }).status, 'required'); // "9" > "10" as strings
  });

  test('a disabled policy never prompts or blocks; no version code returns the policy only', () => {
    assert.equal(at(1, { update_policy_enabled: false }).status, 'disabled');
    assert.equal(at(1, { update_policy_enabled: false }).update_required, false);
    assert.equal(at(null).status, 'unknown');
  });
});

// ─── Public API ──────────────────────────────────────────────────────────────

describe('GET /api/v1/app-version/android', () => {
  beforeEach(() => reset());

  test('returns the decision for a query parameter or header, uncached', async () => {
    const res = await request(app).get('/api/v1/app-version/android?version_code=20000');
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, 'required');
    assert.equal(res.body.update_required, true);
    assert.equal(res.body.latest_version_name, '2.5.0');
    assert.equal(res.body.store_url, PLAY);

    const viaHeader = await request(app).get('/api/v1/app-version/android').set('X-App-Version-Code', '20500');
    assert.equal(viaHeader.body.status, 'up_to_date');
  });

  test('exposes only policy fields', async () => {
    settings[service.SETTINGS_KEY].updated_at = '2026-10-20T00:00:00.000Z';
    const res = await request(app).get('/api/v1/app-version/android?version_code=20450');
    assert.deepEqual(Object.keys(res.body).sort(), [
      'current_version_code', 'force_update_enabled', 'is_supported', 'latest_version_code', 'latest_version_name',
      'message', 'minimum_supported_version_code', 'platform', 'show_prompt', 'status', 'store_url', 'success',
      'update_available', 'update_policy_enabled', 'update_required',
    ]);
  });

  test('rejects malformed version codes and reports outages', async () => {
    assert.equal((await request(app).get('/api/v1/app-version/android?version_code=2.5.0')).status, 400);
    settingsError = new Error('db down');
    const res = await request(app).get('/api/v1/app-version/android?version_code=20500');
    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
  });

  test('is read-only', async () => {
    await request(app).get('/api/v1/app-version/android?version_code=1');
    assert.deepEqual(writes, []);
    assert.equal((await request(app).post('/api/v1/app-version/android')).status, 404);
  });
});

// ─── Enforcement on sensitive routes ─────────────────────────────────────────

describe('requireSupportedAppVersion guard', () => {
  beforeEach(() => reset());

  const SENSITIVE = [
    ['post', '/api/v1/deposit-amount'],
    ['post', '/api/v1/withdraw-amount'],
    ['post', '/api/v1/bulk-join-contest'],
    ['post', '/api/v1/wallet/deposit'],
    ['post', '/api/v1/wallet/withdraw'],
    ['post', '/api/wallet/withdraw'],
    ['post', '/api/v1/contests/bulk-join'],
  ];

  test('blocks unsupported builds with 426 before any write', async () => {
    for (const [method, path] of SENSITIVE) {
      writes = [];
      const res = await request(app)[method](path).set('X-App-Version-Code', '20000').send({ user_id: '7', amount: 1000, wallet_balance: 1000 });
      assert.equal(res.status, 426, path);
      assert.equal(res.body.update_required, true);
      assert.equal(res.body.error, POLICY.update_message);
      assert.equal(res.body.store_url, PLAY);
      assert.deepEqual(writes, [], `${path} must not write`);
    }
  });

  test('lets the request through when it should not be blocked', async () => {
    const path = '/api/v1/withdraw-amount';
    const cases = [
      [{}, null],                                             // legacy build without the header
      [{ 'X-App-Version-Code': '20400' }, null],              // supported
      [{ 'X-App-Version-Code': '20000' }, { force_update_enabled: false }],
      [{ 'X-App-Version-Code': '20000' }, { update_policy_enabled: false }],
      [{ 'X-App-Version-Code': '20000', 'X-App-Platform': 'ios' }, null],
    ];
    for (const [headers, overrides] of cases) {
      reset({ ...POLICY, ...(overrides || {}) });
      const res = await request(app).post(path).set(headers).send({ user_id: '7', amount: 1000 });
      assert.notEqual(res.status, 426, JSON.stringify({ headers, overrides }));
    }
    settingsError = new Error('db down'); // outage: fail open, endpoint keeps its own checks
    assert.notEqual((await request(app).post(path).set('X-App-Version-Code', '1').send({})).status, 426);
  });

  test('rejects a malformed version header', async () => {
    const res = await request(app).post('/api/v1/deposit-amount').set('X-App-Version-Code', 'abc').send({});
    assert.equal(res.status, 400);
  });

  test('every deposit, withdrawal and contest-join route carries the guard', () => {
    const routes = [];
    const walk = (stack) => stack.forEach((layer) => {
      if (layer.route) routes.push({ path: layer.route.path, methods: Object.keys(layer.route.methods), handles: layer.route.stack.map((l) => l.handle) });
      else if (layer.handle && layer.handle.stack) walk(layer.handle.stack);
    });
    walk(app._router.stack);
    const sensitive = routes.filter((r) => r.methods.includes('post') && /(deposit|withdraw|join)/.test(r.path));
    assert.ok(sensitive.length >= 5);
    sensitive.forEach((r) => assert.ok(r.handles.some((h) => h.appVersionGuard), `${r.path} is unguarded`));
  });
});

// ─── Admin panel ─────────────────────────────────────────────────────────────

describe('admin Android App Update Settings', () => {
  const HASH = bcrypt.hashSync('secret123', 4);
  const roles = {};
  const admins = {};
  function seedAdmins() {
    roles.viewer = { _id: new ObjectId(), name: 'Viewer', permissions: ['app_update_settings.view'] };
    roles.editor = { _id: new ObjectId(), name: 'Editor', permissions: ['app_update_settings.edit'] };
    roles.other = { _id: new ObjectId(), name: 'Other', permissions: ['users.view'] };
    for (const key of Object.keys(roles)) {
      admins[key] = { _id: new ObjectId(), name: key, email: `${key}@test.local`, password: HASH, is_admin: true, admin_role_id: roles[key]._id };
    }
  }
  const allAdmins = () => Object.values(admins);
  const q = (value) => { const o = { select: () => o, lean: () => o, then: (a, b) => Promise.resolve(value).then(a, b) }; return o; };
  User.findOne = (f) => q(allAdmins().find((a) => a.email === (f.$or ? f.$or[0].email : f.email)) || null);
  User.findById = (id) => q(allAdmins().find((a) => String(a._id) === String(id)) || null);
  AdminRole.findById = (id) => q(Object.values(roles).find((r) => String(r._id) === String(id)) || null);

  async function loginAs(key) {
    const agent = request.agent(adminApp);
    const res = await agent.post('/login').type('form').send({ email: `${key}@test.local`, password: 'secret123' });
    assert.equal(res.status, 302);
    return agent;
  }
  const VALID = { ...POLICY, latest_version_name: '2.6.0', latest_version_code: '20600', minimum_supported_version_code: '20500' };

  beforeEach(() => { reset(); seedAdmins(); });

  test('view permission can read but not change the policy', async () => {
    const viewer = await loginAs('viewer');
    const page = await viewer.get('/android-app-update');
    assert.equal(page.status, 200);
    assert.match(page.text, /Android App Update Settings/);
    assert.match(page.text, /<fieldset disabled>/);
    assert.equal((await viewer.get('/android-app-update/data')).body.data.latest_version_code, 20500);

    const save = await viewer.post('/android-app-update').set('Accept', 'application/json').send(VALID);
    assert.equal(save.status, 403);
    assert.deepEqual(writes, []);
  });

  test('admins without the module cannot read it either', async () => {
    const other = await loginAs('other');
    assert.equal((await other.get('/android-app-update')).status, 403);
    assert.equal((await other.get('/android-app-update/data')).status, 403);
    assert.equal((await request(adminApp).post('/android-app-update').send(VALID)).status, 302, 'anonymous → login');
  });

  test('edit permission saves valid settings and the change is audited', async () => {
    const editor = await loginAs('editor');
    const res = await editor.post('/android-app-update').set('Accept', 'application/json').send(VALID);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.latest_version_code, 20600);
    assert.equal(settings[service.SETTINGS_KEY].minimum_supported_version_code, 20500);
    assert.ok(settings[service.SETTINGS_KEY].updated_at);
    assert.equal(settings[service.SETTINGS_KEY].updated_by, undefined, 'no admin identity in the public settings row');

    const line = auditLines.find((l) => l.includes('updated the Android update policy'));
    assert.match(line, /editor@test\.local/);
    assert.match(line, /latest_version_code: 20500 -> 20600/);

    const check = await request(app).get('/api/v1/app-version/android?version_code=20450');
    assert.equal(check.body.status, 'required', 'new minimum applies to the next check');
  });

  test('invalid input is rejected with field errors and nothing is saved', async () => {
    const editor = await loginAs('editor');
    const res = await editor.post('/android-app-update').set('Accept', 'application/json')
      .send({ ...VALID, minimum_supported_version_code: '30000', play_store_url: 'https://evil.example/app' });
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.minimum_supported_version_code);
    assert.ok(res.body.errors.play_store_url);
    assert.deepEqual(writes, []);
  });
});
