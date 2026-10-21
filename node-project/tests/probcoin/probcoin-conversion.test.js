'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT/INR to ProbCoin Conversion Settings
 * Purpose: Allow authorized administrators to configure conversion rates.
 * Origin: Newly implemented in node-project.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Validation, exact conversion, uninitialised behaviour, admin permissions,
 * the HTTP contract and audit logging. Settings and admin users are stubbed.
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
const service = require('../../src/services/probcoin-conversion.service');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let row;        // the stored settings row, or null
let readError;
let writes;
let auditLines;
Setting.findOne = (f) => ({
  lean: async () => {
    if (readError) throw readError;
    return f.key === service.SETTINGS_KEY ? row : null;
  },
});
Setting.findOneAndUpdate = async (f, doc) => {
  writes.push(f.key);
  row = { key: f.key, value: doc.value, created_at: (row && row.created_at) || new Date('2026-10-01T00:00:00Z'), updated_at: new Date() };
  return row;
};
const realInfo = logger.info.bind(logger);
logger.info = (msg, ...rest) => { if (typeof msg === 'string' && msg.includes('[probcoin-conversion]')) auditLines.push(msg); return realInfo(msg, ...rest); };

function reset(value) {
  row = value ? { key: service.SETTINGS_KEY, value, created_at: new Date('2026-10-01T00:00:00Z') } : null;
  readError = null;
  writes = [];
  auditLines = [];
}

// ─── Service ─────────────────────────────────────────────────────────────────

describe('validation', () => {
  test('accepts positive decimals up to 6 places, snake or camel case', () => {
    assert.deepEqual(service.validate({ usdt_to_probcoin_rate: '100', inr_to_probcoin_rate: 1 }), {
      values: { usdt_to_probcoin_rate: 100, inr_to_probcoin_rate: 1 }, errors: {},
    });
    assert.deepEqual(service.validate({ usdtToProbCoinRate: '84.123456', inrToProbCoinRate: '0.000001' }).values, {
      usdt_to_probcoin_rate: 84.123456, inr_to_probcoin_rate: 0.000001,
    });
  });

  test('rejects missing, zero, negative, non-numeric, too precise, too large and object values', () => {
    for (const bad of [undefined, null, '', '   ', '0', '0.000000', '-5', 'abc', '1e3', '1.1234567', '1000001', 'NaN', { $gt: 0 }, [1]]) {
      const { errors } = service.validate({ usdt_to_probcoin_rate: bad, inr_to_probcoin_rate: '1' });
      assert.ok(errors.usdt_to_probcoin_rate, JSON.stringify(bad));
      assert.equal(errors.inr_to_probcoin_rate, undefined);
    }
  });
});

describe('getRates / convert', () => {
  test('uninitialised: no arbitrary defaults and conversion refuses to run', async () => {
    reset(null);
    const rates = await service.getRates();
    assert.equal(rates.usdt_to_probcoin_rate, null);
    assert.equal(rates.inr_to_probcoin_rate, null);
    assert.equal(rates.configured, false);
    assert.match((await service.convert('USDT', 10)).error, /not been configured/);
    assert.deepEqual(writes, [], 'reading never creates a record');
  });

  test('partially configured or corrupted values are treated as not configured', async () => {
    reset({ usdt_to_probcoin_rate: 100, inr_to_probcoin_rate: 'abc' });
    const rates = await service.getRates();
    assert.equal(rates.usdt_to_probcoin_rate, 100);
    assert.equal(rates.inr_to_probcoin_rate, null);
    assert.equal(rates.configured, false);
    assert.equal((await service.convert('USDT', 10)).probcoin, 1000);
    assert.ok((await service.convert('INR', 500)).error);
  });

  test('ProbCoin = amount × rate, exact and rounded down to 2 decimals', async () => {
    reset({ usdt_to_probcoin_rate: 100, inr_to_probcoin_rate: 1 });
    assert.deepEqual(await service.convert('USDT', 10), { probcoin: 1000, rate: 100 });
    assert.deepEqual(await service.convert('inr', '500'), { probcoin: 500, rate: 1 });

    reset({ usdt_to_probcoin_rate: 0.1, inr_to_probcoin_rate: 0.011764 });
    assert.equal((await service.convert('USDT', '0.3')).probcoin, 0.03);    // 0.1 × 0.3, no float drift
    assert.equal((await service.convert('INR', '999.99')).probcoin, 11.76); // 11.7638... floored
    assert.equal((await service.convert('USDT', '1.234567')).probcoin, 0.12);
  });

  test('rejects unknown currencies and invalid amounts', async () => {
    reset({ usdt_to_probcoin_rate: 100, inr_to_probcoin_rate: 1 });
    assert.ok((await service.convert('BTC', 1)).error);
    for (const bad of [0, -1, '', 'abc', '1.234', null]) {
      assert.ok((await service.convert('INR', bad)).error, String(bad)); // INR allows 2 decimals
    }
    assert.ok((await service.convert('USDT', '1.1234567')).error); // USDT allows 6 decimals
  });
});

// ─── Admin HTTP ──────────────────────────────────────────────────────────────

describe('admin ProbCoin Conversion Settings', () => {
  const HASH = bcrypt.hashSync('secret123', 4);
  const roles = {};
  const admins = {};
  const q = (value) => { const o = { select: () => o, lean: () => o, then: (a, b) => Promise.resolve(value).then(a, b) }; return o; };
  User.findOne = (f) => q(Object.values(admins).find((a) => a.email === (f.$or ? f.$or[0].email : f.email)) || null);
  User.findById = (id) => q(Object.values(admins).find((a) => String(a._id) === String(id)) || null);
  AdminRole.findById = (id) => q(Object.values(roles).find((r) => String(r._id) === String(id)) || null);

  beforeEach(() => {
    reset(null);
    roles.viewer = { _id: new ObjectId(), name: 'Viewer', permissions: ['probcoin_conversion.view'] };
    roles.editor = { _id: new ObjectId(), name: 'Editor', permissions: ['probcoin_conversion.edit'] };
    roles.other = { _id: new ObjectId(), name: 'Other', permissions: ['deposit_withdrawal_settings.edit'] };
    Object.keys(roles).forEach((key) => {
      admins[key] = { _id: new ObjectId(), name: key, email: `${key}@test.local`, password: HASH, is_admin: true, admin_role_id: roles[key]._id };
    });
  });

  async function loginAs(key) {
    const agent = request.agent(adminApp);
    await agent.post('/login').type('form').send({ email: `${key}@test.local`, password: 'secret123' });
    return agent;
  }
  const putJson = (agent, body) => agent.put('/probcoin-conversion').set('Accept', 'application/json').send(body);

  test('the page shows the not-configured state, then the saved rates', async () => {
    const editor = await loginAs('editor');
    let page = await editor.get('/probcoin-conversion');
    assert.equal(page.status, 200);
    assert.match(page.text, /ProbCoin Conversion Settings/);
    assert.match(page.text, /have not been configured yet/);
    assert.match(page.text, /href="\/probcoin-conversion"/, 'sidebar link');

    await putJson(editor, { usdt_to_probcoin_rate: '100', inr_to_probcoin_rate: '1' });
    page = await editor.get('/probcoin-conversion');
    assert.match(page.text, /1 USDT = 100 ProbCoin/);
    assert.match(page.text, /10 USDT = 1,000 ProbCoin/);
    assert.match(page.text, /₹1 INR = 1 ProbCoin/);
    assert.match(page.text, /₹500 INR = 500 ProbCoin/);
    assert.doesNotMatch(page.text, /have not been configured yet/);
  });

  test('GET /data returns only the conversion settings', async () => {
    reset({ usdt_to_probcoin_rate: 100, inr_to_probcoin_rate: 1, updated_at: '2026-10-21T10:00:00.000Z' });
    const viewer = await loginAs('viewer');
    const res = await viewer.get('/probcoin-conversion/data');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data).sort(), ['configured', 'created_at', 'inr_to_probcoin_rate', 'updated_at', 'usdt_to_probcoin_rate']);
    assert.equal(res.body.data.configured, true);
  });

  test('edit permission saves, the change is audited, and both rates are independent', async () => {
    reset({ usdt_to_probcoin_rate: 90, inr_to_probcoin_rate: 1 });
    const editor = await loginAs('editor');
    const res = await putJson(editor, { usdt_to_probcoin_rate: '95.5', inr_to_probcoin_rate: '1' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.usdt_to_probcoin_rate, 95.5);
    assert.equal(res.body.data.inr_to_probcoin_rate, 1);
    assert.deepEqual(Object.keys(row.value).sort(), ['inr_to_probcoin_rate', 'updated_at', 'usdt_to_probcoin_rate'], 'no admin identity stored in the public settings row');
    const line = auditLines.find((l) => l.includes('updated ProbCoin conversion rates'));
    assert.match(line, /editor@test\.local/);
    assert.match(line, /usdt_to_probcoin_rate: 90 -> 95\.5/);
    assert.doesNotMatch(line, /inr_to_probcoin_rate/, 'unchanged rate is not reported');
  });

  test('malformed payloads return 422 with field errors and never touch the database', async () => {
    const editor = await loginAs('editor');
    for (const body of [{}, { usdt_to_probcoin_rate: '0', inr_to_probcoin_rate: '1' }, { usdt_to_probcoin_rate: '100', inr_to_probcoin_rate: { $set: 5 } }, { usdt_to_probcoin_rate: '-1', inr_to_probcoin_rate: 'x' }]) {
      const res = await putJson(editor, body);
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.equal(res.body.success, false);
      assert.ok(Object.keys(res.body.errors).length);
    }
    assert.deepEqual(writes, []);
  });

  test('view-only, unrelated and anonymous admins cannot change rates', async () => {
    const viewer = await loginAs('viewer');
    const page = await viewer.get('/probcoin-conversion');
    assert.equal(page.status, 200);
    assert.match(page.text, /<fieldset disabled>/);
    assert.equal((await putJson(viewer, { usdt_to_probcoin_rate: '1', inr_to_probcoin_rate: '1' })).status, 403);

    const other = await loginAs('other');
    assert.equal((await other.get('/probcoin-conversion')).status, 403);
    assert.equal((await other.get('/probcoin-conversion/data')).status, 403);
    assert.equal((await putJson(other, { usdt_to_probcoin_rate: '1', inr_to_probcoin_rate: '1' })).status, 403);

    const anon = await putJson(request(adminApp), { usdt_to_probcoin_rate: '1', inr_to_probcoin_rate: '1' });
    assert.equal(anon.status, 302); // existing requireAdmin convention: redirect to login
    assert.equal(anon.headers.location, '/login');
    assert.deepEqual(writes, []);
  });

  test('a plain form post (method override) works and read failures are reported', async () => {
    const editor = await loginAs('editor');
    const res = await editor.post('/probcoin-conversion?_method=PUT').type('form').send({ usdt_to_probcoin_rate: '100', inr_to_probcoin_rate: '2' });
    assert.equal(res.status, 302);
    assert.equal(row.value.inr_to_probcoin_rate, 2);

    readError = new Error('db down');
    const data = await editor.get('/probcoin-conversion/data');
    assert.equal(data.status, 500);
    assert.equal(data.body.success, false);
  });
});
