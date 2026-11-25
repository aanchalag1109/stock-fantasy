'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Payout details (client feedback: bank details in the profile next to USDT): bank, UPI and USDT saved
 * and removed separately, OTP on every change, Bank / UPI choice on INR withdrawals, USDT address
 * checked against the admin's network, account number masked, older endpoints under the same rules.
 * Runs the real Express app on in-memory models.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const ejs = require('ejs');
const request = require('supertest');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const Setting = require('../../src/models/setting.model');
const models = {
  User: require('../../src/models/user.model'),
  Otp: require('../../src/models/otp-verification.model'),
  WithdrawalRequest: require('../../src/models/withdrawal-request.model'),
  Transaction: require('../../src/models/transaction.model'),
  Notification: require('../../src/models/notification.model'),
};
const payouts = require('../../src/services/payments/payout-details.service');
const app = require('../../src/app');

logger.silent = true;
config.SMS.enabled = false; // static OTP
const OTP = config.OTP_STATIC_CODE;
const { ObjectId } = mongoose.Types;

const TRC = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const EVM = '0x55d398326f99059fF775485246999027B3197955';
const BANK = { account_holder_name: 'Asha Rao', account_number: '123456789012', ifsc_code: 'hdfc0001234', bank_name: 'HDFC' };

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
const at = (o, k) => k.split('.').reduce((v, p) => (v == null ? v : v[p]), o);
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
const plain = (c) => c && typeof c === 'object' && !(c instanceof ObjectId) && !(c instanceof Date);
const matches = (doc, f = {}) => Object.entries(f).every(([k, c]) => {
  if (k === '$or') return c.some((x) => matches(doc, x));
  const v = at(doc, k);
  if (!plain(c)) return same(v, c);
  return Object.entries(c).every(([op, arg]) => {
    if (op === '$in') return arg.some((a) => same(v, a));
    if (op === '$gte') return Number(v) >= Number(arg);
    if (op === '$gt') return v != null && v > arg;
    if (op === '$ne') return Array.isArray(v) ? !v.includes(arg) : !same(v, arg);
    if (op === '$type') return typeof v === 'number';
    if (op === '$regex') return new RegExp(arg).test(String(v ?? ''));
    throw new Error(`unsupported ${op}`);
  });
});
function update(doc, u) {
  const set = u.$set || (Object.keys(u).some((k) => k.startsWith('$')) ? {} : u);
  Object.entries(set).forEach(([k, v]) => {
    if (!k.includes('.')) { doc[k] = v; return; }
    const [a, b] = k.split('.');
    if (doc[a] == null) throw new Error(`Cannot create field '${b}' in element {${a}: null}`); // as MongoDB does
    doc[a][b] = v;
  });
  Object.entries(u.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
  Object.entries(u.$push || {}).forEach(([k, v]) => { doc[k] = [...(doc[k] || []), ...(v && v.$each ? v.$each : [v])]; });
}
const chain = (value) => {
  const q = { select: () => q, lean: () => q, sort: () => q, limit: () => q, populate: () => q, session: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
};
Object.entries(models).forEach(([name, M]) => {
  const rows = (f) => db[name].filter((d) => matches(d, f));
  const doc = (d) => { if (d) d.save = async () => d; return d || null; };
  M.find = (f) => chain(rows(f));
  M.findOne = (f) => chain(doc(rows(f).at(-1)));
  M.findById = (id) => chain(doc(rows({ _id: id })[0]));
  M.countDocuments = async (f) => rows(f).length;
  M.create = async (d) => { const row = { _id: new ObjectId(), created_at: new Date(), consumed_at: null, attempts: 0, ...d }; db[name].push(row); return row; };
  M.updateOne = async (f, u) => { const d = rows(f)[0]; if (d) update(d, u); return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 }; };
  M.updateMany = async (f, u) => { rows(f).forEach((d) => update(d, u)); return {}; };
  M.deleteMany = async (f) => { db[name] = db[name].filter((d) => !matches(d, f)); return {}; };
  M.deleteOne = M.deleteMany;
  M.findOneAndUpdate = (f, u) => { const d = rows(f)[0]; if (!d) return chain(null); const before = { ...d }; update(d, u); return chain(before); };
});
Setting.find = (f) => ({ lean: async () => Object.entries(db.settings).filter(([k]) => f.key.$in.includes(k)).map(([key, value]) => ({ key, value })) });
Setting.findOne = (f) => chain(f.key === 'probcoin_conversion' ? { key: f.key, value: { inr_to_probcoin_rate: 10, usdt_to_probcoin_rate: 100 } } : null);

function reset() {
  config.PAYOUT_DETAILS_OTP = true;
  db = {
    settings: { min_withdrawal_amount: 100, max_withdrawal_amount: 20000, usdt_min_withdrawal_amount: 5, usdt_max_withdrawal_amount: 1000, usdt_withdrawal_network: 'TRC20' },
    User: [{ _id: new ObjectId(), old_id: 41, name: 'Asha', mobile: '9876543210', deposit_balance: 0, winnings_balance: 50000, payment_details: {} }],
    Otp: [], WithdrawalRequest: [], Transaction: [], Notification: [],
  };
}
const user = () => db.User[0];
const pd = () => user().payment_details;
const post = (url, body) => request(app).post(`/api/v1${url}`).send({ user_id: '41', ...body });
const details = async () => (await request(app).get('/api/v1/payout-details?user_id=41')).body;
async function sendOtp(mobile = '9876543210') {
  db.Otp = []; // no resend wait between tests' steps
  const res = await request(app).post('/api/v1/send-otp').send({ mobile, purpose: 'payout_details' });
  assert.equal(res.status, 200, res.text);
}
async function save(url, body) { await sendOtp(); return post(url, { ...body, otp: OTP }); }
const withdraw = (body) => post('/withdraw/request', { probcoins: '5000', ...body });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('saving and removing', () => {
  beforeEach(reset);

  test('bank, UPI and USDT are saved separately and never wipe each other', async () => {
    let res = await save('/payout-details/bank', BANK);
    assert.equal(res.status, 200, res.text);
    res = await save('/payout-details/upi', { upi_id: 'asha@okhdfc', name: 'Asha R' });
    assert.equal(res.status, 200, res.text);
    res = await save('/payout-details/usdt', { usdt_wallet_address: TRC });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.inr.methods, ['BANK', 'UPI']);
    assert.deepEqual(res.body.inr.bank, { account_holder_name: 'Asha Rao', account_number_masked: '••••••••9012', ifsc_code: 'HDFC0001234', bank_name: 'HDFC' });
    assert.deepEqual(res.body.inr.upi, { upi_id: 'asha@okhdfc', name: 'Asha R' });
    assert.deepEqual(res.body.usdt, { ready: true, usdt_wallet_address: TRC, network: 'TRC20', problem: null });
    assert.deepEqual(await details(), { success: true, otp_required: res.body.otp_required, otp_purpose: 'payout_details', inr: res.body.inr, usdt: res.body.usdt });
    assert.equal(pd().account_number, '123456789012', 'stored in full for the admin');
  });

  test('each one can be removed on its own', async () => {
    user().payment_details = { ...BANK, upi_id: 'asha@okhdfc', upi_holder_name: 'Asha', usdt_wallet_address: TRC };
    let res = await save('/payout-details/remove', { type: 'bank' });
    assert.deepEqual([res.status, res.body.inr.bank, res.body.inr.methods, res.body.usdt.ready], [200, null, ['UPI'], true]);
    res = await save('/payout-details/remove', { type: 'UPI' });
    assert.deepEqual([res.body.inr.ready, res.body.usdt.ready], [false, true]);
    res = await save('/payout-details/remove', { type: 'usdt' });
    assert.deepEqual([res.body.usdt.ready, res.body.usdt.usdt_wallet_address], [false, null]);
    assert.equal((await post('/payout-details/remove', { type: 'card' })).status, 400);
  });

  test('the older form saves what it is given and keeps the rest; a masked account number is refused', async () => {
    user().payment_details = { ...BANK };
    let res = await save('/payout-details/inr', { upi_id: 'asha@okhdfc', account_holder_name: 'Asha' });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([pd().account_number, pd().account_holder_name, pd().upi_id, pd().upi_holder_name], ['123456789012', 'Asha Rao', 'asha@okhdfc', 'Asha']);
    res = await post('/payout-details/inr', { ...BANK, account_number: '••••••••9012' });
    assert.deepEqual([res.status, Boolean(res.body.errors.account_number)], [422, true]);
    assert.equal((await post('/payout-details/inr', {})).status, 422);
  });

  test('a UPI saved with the old shared name keeps that name when a bank account is added', async () => {
    user().payment_details = { upi_id: 'asha@okhdfc', account_holder_name: 'Asha UPI' };
    const res = await save('/payout-details/bank', BANK);
    assert.deepEqual([res.body.inr.upi.name, res.body.inr.bank.account_holder_name], ['Asha UPI', 'Asha Rao']);
  });

  test('players whose payment_details is null', async () => {
    user().payment_details = null;
    assert.equal((await details()).inr.ready, false);
    assert.equal((await save('/payout-details/bank', BANK)).status, 200);
    assert.equal(pd().ifsc_code, 'HDFC0001234');
  });

  test('wrong values: field errors, nothing saved, and the OTP is not used up', async () => {
    await sendOtp();
    const bad = async (url, body, field) => {
      const res = await post(url, { ...body, otp: OTP });
      assert.equal(res.status, 422, res.text);
      assert.ok(res.body.errors[field], `${field}: ${res.text}`);
    };
    await bad('/payout-details/bank', { ...BANK, account_number: '12' }, 'account_number');
    await bad('/payout-details/bank', { ...BANK, ifsc_code: 'HDFC1234' }, 'ifsc_code');
    await bad('/payout-details/bank', { ...BANK, account_holder_name: '' }, 'account_holder_name');
    await bad('/payout-details/bank', { ...BANK, account_number_confirmation: '123456789013' }, 'account_number_confirmation');
    await bad('/payout-details/upi', { upi_id: 'asha' }, 'upi_id');
    await bad('/payout-details/usdt', { usdt_wallet_address: EVM }, 'usdt_wallet_address');
    assert.deepEqual(pd(), {});
    assert.equal((await post('/payout-details/bank', { ...BANK, otp: OTP })).status, 200);
  });
});

describe('OTP', () => {
  beforeEach(reset);
  const everyChange = [
    ['/payout-details/bank', BANK], ['/payout-details/upi', { upi_id: 'xyz@okhdfc' }], ['/payout-details/usdt', { usdt_wallet_address: TRC }],
    ['/payout-details/inr', { upi_id: 'xyz@okhdfc' }], ['/payout-details/remove', { type: 'bank' }],
    ['/payment-details/update', { usdt_wallet_address: TRC }], ['/payment-details/update', { usdt_wallet_address: '' }],
  ];

  test('no change without it, on any endpoint', async () => {
    user().payment_details = { ...BANK };
    for (const [url, body] of everyChange) {
      const res = await post(url, body);
      assert.deepEqual([res.status, res.body.otp_required, res.body.otp_purpose], [403, true, 'payout_details'], url);
    }
    assert.deepEqual(pd(), BANK);
  });

  test('wrong, reused, other-purpose and other-mobile codes are refused', async () => {
    await sendOtp();
    let res = await post('/payout-details/bank', { ...BANK, otp: '000000' });
    assert.deepEqual([res.status, res.body.otp_invalid, res.body.attempts_remaining], [400, true, 4]);
    assert.equal((await post('/payout-details/bank', { ...BANK, otp: OTP })).status, 200);
    res = await post('/payout-details/upi', { upi_id: 'xyz@okhdfc', otp: OTP });
    assert.deepEqual([res.status, res.body.otp_invalid], [400, true], 'one code, one change');
    db.Otp = [];
    await request(app).post('/api/v1/send-otp').send({ mobile: '9876543210', purpose: 'login' });
    assert.equal((await post('/payout-details/upi', { upi_id: 'xyz@okhdfc', otp: OTP })).status, 400);
    db.User.push({ _id: new ObjectId(), old_id: 42, mobile: '9000000000', payment_details: {} });
    await sendOtp('9000000000');
    assert.equal((await post('/payout-details/upi', { upi_id: 'xyz@okhdfc', otp: OTP })).status, 400, "another player's code");
    assert.equal(pd().upi_id, undefined);
  });

  test('no account for the mobile → no code; no mobile on the account → told to add one', async () => {
    assert.equal((await request(app).post('/api/v1/send-otp').send({ mobile: '9111111111', purpose: 'payout_details' })).status, 404);
    user().mobile = null;
    const res = await post('/payout-details/bank', { ...BANK, otp: OTP });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /mobile/);
  });

  test('PAYOUT_DETAILS_OTP=false: the current app keeps working', async () => {
    config.PAYOUT_DETAILS_OTP = false;
    assert.equal((await post('/payout-details/bank', BANK)).status, 200);
    assert.equal((await details()).otp_required, false);
  });
});

describe('INR withdrawal: bank or UPI', () => {
  beforeEach(reset);
  const last = () => db.WithdrawalRequest.at(-1);

  test('nothing saved → payment_details_required', async () => {
    const res = await withdraw({ currency: 'INR' });
    assert.deepEqual([res.status, res.body.payment_details_required, db.WithdrawalRequest.length], [400, true, 0]);
  });

  test('only one saved → used without asking', async () => {
    user().payment_details = { ...BANK, ifsc_code: 'HDFC0001234' };
    const res = await withdraw({ currency: 'INR' });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([last().payout_details.method, last().payout_details.account_number], ['BANK', '123456789012'], 'the admin gets the full number');
    assert.equal(res.body.withdrawal.payout_details.account_number, '••••••••9012', 'the app does not');
    const history = await request(app).get('/api/v1/withdraw/history?user_id=41');
    assert.doesNotMatch(history.text, /123456789012/);
    const older = await request(app).get('/api/v1/wallet/withdrawal-requests?user_id=41');
    assert.equal(older.body.withdrawal_requests.length, 1, older.text);
    assert.doesNotMatch(older.text, /123456789012/);
  });

  test('both saved → the player chooses; not choosing deducts nothing', async () => {
    user().payment_details = { ...BANK, upi_id: 'asha@okhdfc', upi_holder_name: 'Asha' };
    let res = await withdraw({ currency: 'INR' });
    assert.deepEqual([res.status, res.body.payout_method_required, res.body.payout_methods], [400, true, ['BANK', 'UPI']]);
    assert.deepEqual([user().winnings_balance, db.WithdrawalRequest.length], [50000, 0]);
    res = await withdraw({ currency: 'INR', payout_method: 'CARD' });
    assert.equal(res.status, 400);
    assert.equal((await withdraw({ currency: 'INR', payout_method: 'bank' })).status, 200);
    assert.equal(last().payout_details.method, 'BANK');
    assert.equal((await withdraw({ currency: 'INR', payout_method: 'UPI' })).status, 200);
    assert.deepEqual([last().payout_details.method, last().payout_details.upi_id, last().payout_details.account_holder_name], ['UPI', 'asha@okhdfc', 'Asha']);
    assert.equal(user().winnings_balance, 40000);
  });

  test('choosing the one that is not saved is refused', async () => {
    user().payment_details = { upi_id: 'asha@okhdfc' };
    const res = await withdraw({ currency: 'INR', payout_method: 'BANK' });
    assert.deepEqual([res.status, res.body.payment_details_required, user().winnings_balance], [400, true, 50000]);
  });
});

describe('USDT network', () => {
  beforeEach(reset);

  test('address formats, including the TRC20 checksum', () => {
    const valid = (a, n) => payouts.addressProblem(a, n) === null;
    assert.deepEqual([valid(TRC, 'TRC20'), valid(EVM, 'TRC20'), valid(`${TRC.slice(0, -1)}u`, 'TRC20'), valid('', 'TRC20')], [true, false, false, false]);
    for (const n of ['BEP20', 'ERC20']) assert.deepEqual([valid(EVM, n), valid(TRC, n), valid(EVM.slice(0, -1), n)], [true, false, false], n);
  });

  test("the admin's network everywhere, not BEP20", async () => {
    user().payment_details = { usdt_wallet_address: TRC, usdt_network: 'BEP20' };
    assert.equal((await details()).usdt.network, 'TRC20');
    for (const url of ['/payment-details/41', '/auth/payment-details?user_id=41']) {
      const res = await request(app).get(`/api/v1${url}`);
      assert.equal(res.status, 200, url);
      assert.equal(res.body.data.usdt_network, 'TRC20', url);
    }
    db.settings.usdt_withdrawal_network = 'ERC20';
    assert.equal((await details()).usdt.network, 'ERC20');
  });

  test('a saved address that does not fit: shown as not ready, withdrawal refused, nothing deducted', async () => {
    user().payment_details = { usdt_wallet_address: EVM, usdt_network: 'BEP20' };
    assert.equal((await details()).usdt.ready, false);
    const res = await withdraw({ currency: 'USDT', probcoins: '1000' });
    assert.deepEqual([res.status, res.body.payment_details_required, res.body.network], [400, true, 'TRC20']);
    assert.deepEqual([user().winnings_balance, db.WithdrawalRequest.length], [50000, 0]);
    assert.equal((await save('/payout-details/usdt', { usdt_wallet_address: TRC })).status, 200);
    assert.equal((await withdraw({ currency: 'USDT', probcoins: '1000' })).status, 200);
    assert.deepEqual([db.WithdrawalRequest[0].usdt_wallet_address, db.WithdrawalRequest[0].usdt_network], [TRC, 'TRC20']);
  });

  test('admin changes BEP20 → ERC20: same format, so the player must confirm the address again', async () => {
    db.settings.usdt_withdrawal_network = 'BEP20';
    await save('/payout-details/usdt', { usdt_wallet_address: EVM });
    assert.equal((await details()).usdt.ready, true);
    db.settings.usdt_withdrawal_network = 'ERC20';
    const res = await withdraw({ currency: 'USDT', probcoins: '1000' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /saved for BEP20.*ERC20/);
    await save('/payout-details/usdt', { usdt_wallet_address: EVM });
    assert.equal((await withdraw({ currency: 'USDT', probcoins: '1000' })).status, 200);
  });

  test('addresses saved before this keep working when they fit', async () => {
    user().payment_details = { usdt_wallet_address: TRC, usdt_network: 'BEP20' };
    assert.equal((await withdraw({ currency: 'USDT', probcoins: '1000' })).status, 200);
  });
});

describe('older endpoints', () => {
  beforeEach(reset);

  test('POST /payment-details/update: OTP + network check; only USDT changes', async () => {
    user().payment_details = { ...BANK };
    let res = await save('/payment-details/update', { usdt_wallet_address: EVM });
    assert.deepEqual([res.status, res.body.status], [422, 'error']);
    res = await save('/payment-details/update', { usdt_wallet_address: TRC });
    assert.deepEqual([res.status, res.body.status, res.body.data.usdt_network], [200, 'success', 'TRC20']);
    assert.deepEqual([pd().usdt_wallet_address, pd().account_number], [TRC, '123456789012']);
  });

  test('the auth controller pair: masked, OTP, numeric ids', async () => {
    const auth = require('../../src/controllers/auth.controller');
    const call = async (fn, req) => {
      const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
      await fn({ params: {}, query: {}, body: {}, ...req }, res);
      return res;
    };
    user().payment_details = { ...BANK };
    const ids = { params: { user_id: '41', userId: '41', id: '41' }, query: { user_id: '41' } };
    const got = await call(auth.getPaymentDetails, ids);
    assert.deepEqual([got.code, got.body.data.account_number], [200, '••••••••9012']);
    const denied = await call(auth.updatePaymentDetails, { ...ids, body: { user_id: '41', upi_id: 'xyz@okhdfc' } });
    assert.deepEqual([denied.code, denied.body.otp_required], [403, true]);
    await sendOtp();
    const saved = await call(auth.updatePaymentDetails, { ...ids, body: { user_id: '41', upi_id: 'xyz@okhdfc', otp: OTP } });
    assert.equal(saved.code, 200);
    assert.deepEqual([pd().upi_id, pd().account_number], ['xyz@okhdfc', '123456789012']);
  });
});

describe('admin', () => {
  const page = (req, addressProblem) => ejs.renderFile(path.join(__dirname, '../../src/admin/views/withdrawals/show.ejs'), {
    request: { _id: 'w1', status: 'pending', amount: 1000, currency: 'USDT', user_id: { payment_details: { usdt_network: 'BEP20' } }, ...req }, history: [], can: () => true, addressProblem,
  });
  test('warns before paying an address that does not fit, and never guesses BEP20', async () => {
    assert.match(await page({ usdt_wallet_address: EVM, usdt_network: 'TRC20' }, payouts.addressProblem(EVM, 'TRC20')), /Do not pay yet/);
    const ok = await page({ usdt_wallet_address: TRC, usdt_network: 'TRC20' }, null);
    assert.doesNotMatch(ok, /Do not pay yet/);
    const old = await page({ usdt_wallet_address: TRC, usdt_network: null }, null);
    assert.match(old, /not recorded/);
    assert.doesNotMatch(old, /BEP20/);
  });

  test('the schema keeps the new fields and the OTP purpose', () => {
    const u = new models.User({ payment_details: { upi_holder_name: 'A', usdt_saved_network: 'TRC20' } });
    assert.deepEqual([u.payment_details.upi_holder_name, u.payment_details.usdt_saved_network], ['A', 'TRC20']);
    assert.ok(models.Otp.schema.path('purpose').enumValues.includes('payout_details'));
  });
});
