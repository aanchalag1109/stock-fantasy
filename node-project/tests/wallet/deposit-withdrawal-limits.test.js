'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Enforce Deposit and Withdrawal Limits in Mobile APIs
 * Exercises every deposit/withdrawal entry point through the real Express app.
 * Mongoose models are stubbed in memory, so no database is needed; the stubs record
 * every write so tests can assert that rejected requests touch nothing.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // any unstubbed DB call fails fast instead of hanging

const request = require('supertest');
const axios = require('axios');
const logger = require('../../src/config/logger');
const Setting = require('../../src/models/setting.model');
const User = require('../../src/models/user.model');
const Transaction = require('../../src/models/transaction.model');
const WithdrawalRequest = require('../../src/models/withdrawal-request.model');
const Payment = require('../../src/models/payment.model');
const Notification = require('../../src/models/notification.model');
const limitsService = require('../../src/services/deposit-withdrawal-settings.service');
const adminSettingsController = require('../../src/admin/controllers/deposit-withdrawal-settings.controller');
const app = require('../../src/app');

logger.silent = true;

// ─── In-memory stubs ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  min_deposit_amount: 100,
  max_deposit_amount: 50000,
  min_withdrawal_amount: 500,
  max_withdrawal_amount: 20000,
};

const state = {};

function resetState() {
  state.settings = { ...DEFAULT_SETTINGS };
  state.settingsError = null;
  state.writes = [];
  state.gatewayCalls = 0;
  state.user = {
    _id: new mongoose.Types.ObjectId(),
    old_id: 7,
    deposit_balance: 1000,
    winnings_balance: 100000,
    payment_details: { usdt_wallet_address: 'TXYZwallet', usdt_network: 'TRC20' },
    async save() { state.writes.push(['User.save']); },
  };
}

// Chainable, awaitable stand-in for a mongoose Query.
function query(value) {
  const promise = Promise.resolve(value);
  const q = {
    session: () => q, select: () => q, lean: () => q, sort: () => q, populate: () => q,
    then: (ok, fail) => promise.then(ok, fail),
  };
  return q;
}

Setting.find = () => ({
  lean: async () => {
    if (state.settingsError) throw state.settingsError;
    return Object.entries(state.settings).map(([key, value]) => ({ key, value }));
  },
});
Setting.findOneAndUpdate = async (filter, doc) => { state.settings[filter.key] = doc.value; return doc; };

User.findById = () => query(state.user);
User.findOne = () => query(state.user);
User.updateOne = async (filter, update) => { state.writes.push(['User.updateOne', update]); return {}; };

Transaction.create = async (doc) => { state.writes.push(['Transaction.create', doc]); return doc; };
Payment.create = async (doc) => { state.writes.push(['Payment.create', doc]); return doc; };
WithdrawalRequest.create = async (doc) => {
  state.writes.push(['WithdrawalRequest.create', doc]);
  const make = (d) => ({ _id: new mongoose.Types.ObjectId(), old_id: 1, ...d });
  return Array.isArray(doc) ? doc.map(make) : make(doc);
};
Notification.countDocuments = async () => 0;

mongoose.startSession = async () => ({
  startTransaction() {}, async abortTransaction() {}, async commitTransaction() {}, endSession() {},
});

axios.post = async () => {
  state.gatewayCalls += 1;
  return { status: 200, data: { status: 1, data: { pay_url: 'https://pay.example/checkout' } } };
};

// ─── Endpoint catalogue ─────────────────────────────────────────────────────

const encodePaymentData = (amount) => {
  const payload = { user_id: String(state.user._id), timestamp: Date.now() };
  if (amount !== undefined) payload.amount = amount;
  return encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString('base64'));
};

const DEPOSIT_ENDPOINTS = [
  {
    name: 'POST /api/v1/deposit-amount',
    okStatus: 200,
    send: (amount) => request(app).post('/api/v1/deposit-amount').send({ user_id: '7', wallet_balance: amount }),
  },
  {
    name: 'POST /api/v1/wallet/deposit',
    okStatus: 200,
    send: (amount) => request(app).post('/api/v1/wallet/deposit').send({ user_id: String(state.user._id), amount }),
  },
  {
    name: 'POST /api/wallet/deposit',
    okStatus: 200,
    send: (amount) => request(app).post('/api/wallet/deposit').send({ user_id: String(state.user._id), wallet_balance: amount }),
  },
  {
    name: 'GET /api/v1/payment/create-order',
    okStatus: 302,
    send: (amount) => request(app).get(`/api/v1/payment/create-order?data=${encodePaymentData(amount)}`),
  },
  {
    name: 'GET /api/payment/create-order',
    okStatus: 302,
    send: (amount) => request(app).get(`/api/payment/create-order?data=${encodePaymentData(amount)}`),
  },
  {
    name: 'GET /api/v1/test-payment-add',
    okStatus: 200,
    send: (amount) => request(app).get('/api/v1/test-payment-add').query({ user_id: '7', amount: amount == null ? '' : amount }),
  },
];

const WITHDRAWAL_ENDPOINTS = [
  {
    name: 'POST /api/v1/withdraw-amount',
    okStatus: 200,
    send: (amount) => request(app).post('/api/v1/withdraw-amount').send({ user_id: '7', amount }),
  },
  {
    name: 'POST /api/v1/wallet/withdraw',
    okStatus: 200,
    send: (amount) => request(app).post('/api/v1/wallet/withdraw').send({ user_id: String(state.user._id), amount }),
  },
  {
    name: 'POST /api/wallet/withdraw',
    okStatus: 200,
    send: (amount) => request(app).post('/api/wallet/withdraw').send({ user_id: String(state.user._id), amount }),
  },
];

const INVALID_AMOUNTS = [undefined, null, '', '   ', 'abc', '12abc', 0, '0', '0.00', -50, '-50', '10.123', 'NaN', 'Infinity', '1e3'];

function snapshotBalances() {
  return { deposit: state.user.deposit_balance, winnings: state.user.winnings_balance };
}

function assertNothingWritten(res, before) {
  assert.deepEqual(state.writes, [], `expected no DB writes, got ${JSON.stringify(state.writes)}`);
  assert.equal(state.gatewayCalls, 0, 'payment gateway must not be called');
  assert.deepEqual(snapshotBalances(), before, 'balances must be unchanged');
}

function errorText(res) {
  return res.body && typeof res.body === 'object' && Object.keys(res.body).length ? res.body.error : res.text;
}

function runEndpointSuite(kind, endpoints, limits) {
  const label = kind === 'deposit' ? 'Deposit' : 'Withdrawal';
  const { min, max } = limits;

  for (const ep of endpoints) {
    describe(`${ep.name} — ${kind} limits`, () => {
      beforeEach(resetState);

      test('rejects an amount below the minimum without writing anything', async () => {
        const before = snapshotBalances();
        const res = await ep.send((min - 0.01).toFixed(2));
        assert.equal(res.status, 400);
        assert.equal(errorText(res), `${label} amount must be at least ${min}.`);
        assertNothingWritten(res, before);
      });

      for (const [caseName, amount] of [['exactly the minimum', min], ['between min and max', (min + max) / 2], ['exactly the maximum', max]]) {
        test(`accepts ${caseName}`, async () => {
          const res = await ep.send(amount);
          assert.equal(res.status, ep.okStatus, `body: ${res.text}`);
          assert.ok(state.writes.length > 0, 'an accepted request should proceed to create records');
        });
      }

      test('rejects an amount above the maximum without writing anything', async () => {
        const before = snapshotBalances();
        const res = await ep.send((max + 0.01).toFixed(2));
        assert.equal(res.status, 400);
        assert.equal(errorText(res), `${label} amount cannot exceed ${max}.`);
        assertNothingWritten(res, before);
      });

      test('rejects missing and invalid amounts without writing anything', async () => {
        for (const amount of INVALID_AMOUNTS) {
          resetState();
          const before = snapshotBalances();
          const res = await ep.send(amount);
          assert.equal(res.status, 400, `amount ${JSON.stringify(amount)} should be rejected; body: ${res.text}`);
          assertNothingWritten(res, before);
        }
      });

      test('fails closed (503) when the limits are not configured', async () => {
        delete state.settings[`max_${kind}_amount`];
        const before = snapshotBalances();
        const res = await ep.send(min);
        assert.equal(res.status, 503);
        assertNothingWritten(res, before);
      });

      test('fails closed (503) when the settings cannot be read', async () => {
        state.settingsError = new Error('connection lost');
        const before = snapshotBalances();
        const res = await ep.send(min);
        assert.equal(res.status, 503);
        assertNothingWritten(res, before);
      });

      test('fails closed (503) when stored limits are invalid (min > max, non-numeric)', async () => {
        for (const bad of [{ min: max + 1, max }, { min: 'abc', max }, { min: 0, max }, { min, max: -1 }]) {
          resetState();
          state.settings[`min_${kind}_amount`] = bad.min;
          state.settings[`max_${kind}_amount`] = bad.max;
          const before = snapshotBalances();
          const res = await ep.send(min);
          assert.equal(res.status, 503, `settings ${JSON.stringify(bad)}`);
          assertNothingWritten(res, before);
        }
      });
    });
  }
}

runEndpointSuite('deposit', DEPOSIT_ENDPOINTS, { min: DEFAULT_SETTINGS.min_deposit_amount, max: DEFAULT_SETTINGS.max_deposit_amount });
runEndpointSuite('withdrawal', WITHDRAWAL_ENDPOINTS, { min: DEFAULT_SETTINGS.min_withdrawal_amount, max: DEFAULT_SETTINGS.max_withdrawal_amount });

// ─── Other business rules still apply ───────────────────────────────────────

describe('existing withdrawal rules still apply after the limit check passes', () => {
  beforeEach(resetState);

  test('insufficient winnings is still rejected', async () => {
    state.user.winnings_balance = 600;
    const res = await request(app).post('/api/v1/withdraw-amount').send({ user_id: '7', amount: 1000 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Insufficient winnings/);
    assert.deepEqual(state.writes, []);
  });

  test('missing USDT address is still rejected', async () => {
    state.user.payment_details = {};
    const res = await request(app).post('/api/v1/wallet/withdraw').send({ user_id: String(state.user._id), amount: 1000 });
    assert.equal(res.status, 400);
    assert.equal(res.body.payment_details_required, true);
    assert.deepEqual(state.writes, []);
  });

  test('a successful withdrawal deducts exactly the requested amount', async () => {
    const res = await request(app).post('/api/v1/withdraw-amount').send({ user_id: '7', amount: '1234.56' });
    assert.equal(res.status, 200);
    assert.equal(state.user.winnings_balance, 100000 - 1234.56);
  });
});

// ─── Admin updates propagate ────────────────────────────────────────────────

describe('admin limit updates apply to the next request', () => {
  beforeEach(resetState);

  async function adminSave(values) {
    const req = { body: values, xhr: true, get: () => 'application/json' };
    let status = 200;
    let body;
    const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
    await adminSettingsController.update(req, res);
    return { status, body };
  }

  test('raising the withdrawal minimum rejects an amount that was previously accepted', async () => {
    let res = await request(app).post('/api/v1/withdraw-amount').send({ user_id: '7', amount: 600 });
    assert.equal(res.status, 200);

    const saved = await adminSave({ ...DEFAULT_SETTINGS, min_withdrawal_amount: '1000' });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    resetState();
    state.settings.min_withdrawal_amount = 1000; // resetState restores defaults; re-apply the saved value
    res = await request(app).post('/api/v1/withdraw-amount').send({ user_id: '7', amount: 600 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Withdrawal amount must be at least 1000.');
  });

  test('lowering the deposit maximum is enforced immediately on every deposit route', async () => {
    const saved = await adminSave({ ...DEFAULT_SETTINGS, max_deposit_amount: '2000' });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(state.settings.max_deposit_amount, 2000);

    for (const ep of DEPOSIT_ENDPOINTS) {
      const settings = { ...state.settings };
      resetState();
      state.settings = settings;
      const res = await ep.send(2500);
      assert.equal(res.status, 400, `${ep.name}: ${res.text}`);
      assert.equal(errorText(res), 'Deposit amount cannot exceed 2000.');
      assert.deepEqual(state.writes, []);
    }
  });
});

// ─── Service-level precision checks ─────────────────────────────────────────

describe('checkTransactionAmount precision', () => {
  beforeEach(resetState);

  test('compares in minor units, avoiding floating-point errors', async () => {
    state.settings.min_deposit_amount = 0.3;
    state.settings.max_deposit_amount = 100.1;
    assert.equal((await limitsService.checkTransactionAmount('deposit', '0.3')).ok, true);
    assert.equal((await limitsService.checkTransactionAmount('deposit', '0.30')).ok, true);
    assert.equal((await limitsService.checkTransactionAmount('deposit', '0.29')).ok, false);
    assert.equal((await limitsService.checkTransactionAmount('deposit', '100.10')).ok, true);
    assert.equal((await limitsService.checkTransactionAmount('deposit', '100.11')).ok, false);
  });

  test('returns the parsed numeric amount and limit details', async () => {
    assert.deepEqual(await limitsService.checkTransactionAmount('withdrawal', ' 750.5 '), { ok: true, amount: 750.5 });
    const below = await limitsService.checkTransactionAmount('withdrawal', 10);
    assert.equal(below.min_amount, 500);
    assert.equal(below.max_amount, 20000);
  });
});
