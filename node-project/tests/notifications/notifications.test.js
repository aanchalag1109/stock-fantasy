'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Tests the notification service (dedupe, settings, preferences, FCM outcomes,
 * retries), the session reminder job, and the real event sources (LG Pay callback,
 * withdrawals, admin decisions, prize crediting, KYC) against an in-memory store.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // unstubbed DB calls fail fast

const logger = require('../../src/config/logger');
const models = {
  User: require('../../src/models/user.model'),
  Notification: require('../../src/models/notification.model'),
  Setting: require('../../src/models/setting.model'),
  LeagueSession: require('../../src/models/league-session.model'),
  Contest: require('../../src/models/contest.model'),
  ContestEntry: require('../../src/models/contest-entry.model'),
  SavedBasket: require('../../src/models/saved-basket.model'),
  ContestPerformancePrize: require('../../src/models/contest-performance-prize.model'),
  Transaction: require('../../src/models/transaction.model'),
  WithdrawalRequest: require('../../src/models/withdrawal-request.model'),
  Payment: require('../../src/models/payment.model'),
  KycSubmission: require('../../src/models/kyc-submission.model'),
};
const fcm = require('../../src/services/notifications/fcm.service');
const notifications = require('../../src/services/notifications/notification.service');
const settingsService = require('../../src/services/notifications/notification-settings.service');
const { runSessionReminders } = require('../../src/services/notifications/session-reminder.job');
const paymentController = require('../../src/controllers/payment.controller');
const mobileApi = require('../../src/controllers/mobile-api.controller');
const legacy = require('../../src/controllers/mobile-legacy.controller');
const adminWithdrawals = require('../../src/admin/controllers/withdrawals.controller');
const adminTransactions = require('../../src/admin/controllers/transactions.controller');
const adminKyc = require('../../src/admin/controllers/kyc.controller');
const adminUsers = require('../../src/admin/controllers/users.controller');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
const getPath = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
const cmp = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : Number(a) - Number(b));
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const val = getPath(doc, key);
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        switch (op) {
          case '$ne': return !same(val, arg);
          case '$in': return arg.some((a) => same(val, a));
          case '$gt': return val != null && cmp(val, arg) > 0;
          case '$gte': return val != null && cmp(val, arg) >= 0;
          case '$lt': return val != null && cmp(val, arg) < 0;
          case '$lte': return val != null && cmp(val, arg) <= 0;
          case '$exists': return (val !== undefined) === arg;
          case '$type': return typeof val === 'number';
          default: throw new Error(`unsupported operator ${op}`);
        }
      });
    }
    return same(val, cond);
  });
}
function query(value, { copy = false } = {}) {
  const resolve = () => (copy && value && !Array.isArray(value) ? { ...value } : value);
  const q = {
    select: () => q, sort: () => q, session: () => q, populate: () => q, limit: () => q, skip: () => q,
    lean: () => { copy = true; return q; },
    then: (a, b) => Promise.resolve(resolve()).then(a, b),
  };
  return q;
}
function applyUpdate(doc, update) {
  const set = update.$set || (update.$inc || update.$unset ? {} : update);
  Object.entries(set).forEach(([path, v]) => {
    const keys = path.split('.');
    let target = doc;
    keys.slice(0, -1).forEach((k) => { target[k] = target[k] || {}; target = target[k]; });
    target[keys[keys.length - 1]] = v;
  });
  Object.entries(update.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
}
function withSave(doc) {
  if (doc && !doc.save) Object.defineProperty(doc, 'save', { value: async () => doc, enumerable: false });
  return doc;
}
function stub(name) {
  const Model = models[name];
  const all = () => db[name];
  const find = (f) => withSave(all().find((d) => matches(d, f)) || null);
  Model.findById = (id) => query(find({ _id: id }));
  Model.findOne = (f) => query(find(f));
  Model.find = (f) => query(all().filter((d) => matches(d, f)).map((d) => ({ ...d })));
  Model.exists = async (f) => (find(f) ? { _id: find(f)._id } : null);
  Model.countDocuments = async (f) => all().filter((d) => matches(d, f)).length;
  Model.distinct = async (field, f) => [...new Map(all().filter((d) => matches(d, f)).map((d) => [String(d[field]), d[field]])).values()];
  Model.create = async (input) => {
    const make = (doc) => {
      if (name === 'Notification' && doc.dedupe_key && all().some((d) => d.dedupe_key === doc.dedupe_key)) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      const d = withSave({ _id: new ObjectId(), created_at: new Date(), push_attempts: 0, ...doc });
      all().push(d);
      return d;
    };
    return Array.isArray(input) ? input.map(make) : make(input);
  };
  Model.insertMany = async (docs) => docs.map((d) => { all().push({ _id: new ObjectId(), ...d }); return d; });
  Model.updateOne = async (f, u) => { const d = find(f); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
  Model.updateMany = async (f, u) => { const docs = all().filter((d) => matches(d, f)); docs.forEach((d) => applyUpdate(d, u)); return { modifiedCount: docs.length }; };
  Model.findByIdAndUpdate = async (id, u) => { const d = find({ _id: id }); const before = d ? { ...d } : null; if (d) applyUpdate(d, u); return before; };
  Model.aggregate = async () => [];
}
Object.keys(models).forEach(stub);
models.Setting.find = (f) => query(Object.entries(db.Setting).map(([key, value]) => ({ key, value })).filter((r) => matches(r, f)));
models.Setting.findOne = (f) => query(db.Setting[f.key] === undefined ? null : { key: f.key, value: db.Setting[f.key] });
models.Setting.findOneAndUpdate = async (f, doc) => { db.Setting[f.key] = doc.value; return doc; };
mongoose.startSession = async () => ({ startTransaction() {}, async abortTransaction() {}, async commitTransaction() {}, endSession() {} });

// FCM stub: records pushes; `fcmResult` decides the outcome.
let pushes;
let fcmResult;
fcm.isConfigured = () => true;
fcm.send = async (token, message) => { pushes.push({ token, ...message }); return typeof fcmResult === 'function' ? fcmResult() : fcmResult; };

const ids = {};
function reset() {
  pushes = [];
  fcmResult = { status: 'sent' };
  db = Object.fromEntries(Object.keys(models).map((n) => [n, []]));
  db.Setting = { min_deposit_amount: 100, max_deposit_amount: 50000, min_withdrawal_amount: 500, max_withdrawal_amount: 20000 };
  const user = (key, extra = {}) => {
    ids[key] = new ObjectId();
    db.User.push({ _id: ids[key], name: key, fcm_token: `token-${key}`, deposit_balance: 1000, winnings_balance: 50000, ...extra });
  };
  user('alice', { old_id: 7, payment_details: { usdt_wallet_address: 'TWallet', usdt_network: 'TRC20' } });
  user('bob', { old_id: 8 });
  user('bot', { is_test_user: true });
  user('quiet', { notification_preferences: { session_reminders: false, transactions: false } });
  user('notoken', { fcm_token: null });
}
const notesFor = (key, event) => db.Notification.filter((n) => same(n.user_id, ids[key]) && (!event || n.event === event));
async function settle() { await notifications.idle(); await notifications.idle(); }
const fakeRes = () => {
  const res = { statusCode: 200, body: null, redirected: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.redirect = (u) => { res.redirected = u; return res; };
  return res;
};
const fakeReq = (extra) => ({ params: {}, body: {}, query: {}, flash() {}, adminAccess: { userId: String(new ObjectId()), email: 'admin@test' }, ...extra });

// ─── Notification service ────────────────────────────────────────────────────

describe('notify()', () => {
  beforeEach(reset);

  test('stores an in-app notification and pushes it with navigation data', async () => {
    const result = await notifications.notify('deposit_success', { user: ids.alice, dedupeKey: 'k1', params: { amount: 1500, reference: 'ORD1' }, data: { order_id: 'ORD1' } });
    assert.equal(result.status, 'created');
    const [note] = notesFor('alice');
    assert.equal(note.title, 'Deposit successful');
    assert.equal(note.description, '₹1,500 has been added to your wallet (Ref: ORD1).');
    assert.equal(note.type, 'transaction');
    assert.equal(note.push_status, 'sent');
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].token, 'token-alice');
    assert.equal(pushes[0].data.order_id, 'ORD1');
    assert.equal(pushes[0].data.event, 'deposit_success');
  });

  test('the same dedupe key never notifies twice (webhook retries, concurrent workers)', async () => {
    const results = await Promise.all([1, 2, 3].map(() => notifications.notify('deposit_success', { user: ids.alice, dedupeKey: 'same', params: { amount: 1 } })));
    assert.deepEqual(results.map((r) => r.status).sort(), ['created', 'duplicate', 'duplicate']);
    assert.equal(notesFor('alice').length, 1);
    assert.equal(pushes.length, 1);
  });

  test('events switched off by the admin are not created', async () => {
    db.Setting.notification_settings = { events: { deposit_success: false } };
    const result = await notifications.notify('deposit_success', { user: ids.alice, dedupeKey: 'k', params: { amount: 1 } });
    assert.equal(result.status, 'disabled');
    assert.equal(db.Notification.length, 0);
    // deposit_initiated is off by default
    assert.equal((await notifications.notify('deposit_initiated', { user: ids.alice, dedupeKey: 'k2', params: { amount: 1 } })).status, 'disabled');
  });

  test('push off, user opt-out and missing token keep the in-app record but skip push', async () => {
    db.Setting.notification_settings = { push_enabled: false };
    await notifications.notify('deposit_success', { user: ids.alice, dedupeKey: 'a', params: { amount: 1 } });
    db.Setting.notification_settings = {};
    await notifications.notify('deposit_success', { user: ids.quiet, dedupeKey: 'b', params: { amount: 1 } });
    await notifications.notify('deposit_success', { user: ids.notoken, dedupeKey: 'c', params: { amount: 1 } });
    assert.equal(notesFor('alice')[0].push_status, 'disabled');
    assert.equal(notesFor('quiet')[0].push_status, 'skipped');
    assert.equal(notesFor('notoken')[0].push_status, 'skipped');
    assert.equal(pushes.length, 0);
  });

  test('an unregistered device token is removed', async () => {
    fcmResult = { status: 'invalid_token', error: 'UNREGISTERED' };
    await notifications.notify('kyc_approved', { user: ids.alice, dedupeKey: 'k' });
    assert.equal(db.User.find((u) => same(u._id, ids.alice)).fcm_token, null);
    assert.equal(notesFor('alice')[0].push_status, 'failed');
  });

  test('transient push failures are retried, then given up after 3 attempts', async () => {
    fcmResult = { status: 'failed', retryable: true, error: 'HTTP 503' };
    await notifications.notify('kyc_approved', { user: ids.alice, dedupeKey: 'k' });
    const note = notesFor('alice')[0];
    assert.equal(note.push_status, 'retry');
    await notifications.retryPendingPushes();
    assert.equal(note.push_status, 'retry');
    await notifications.retryPendingPushes();
    assert.equal(note.push_status, 'failed');
    assert.equal(note.push_attempts, 3);

    reset();
    fcmResult = { status: 'failed', retryable: true, error: 'timeout' };
    await notifications.notify('kyc_approved', { user: ids.alice, dedupeKey: 'k' });
    fcmResult = { status: 'sent' };
    await notifications.retryPendingPushes();
    assert.equal(notesFor('alice')[0].push_status, 'sent');
  });

  test('users can be referenced by legacy numeric id; failures never throw', async () => {
    assert.equal((await notifications.notify('kyc_approved', { user: 7, dedupeKey: 'k' })).status, 'created');
    assert.equal(notesFor('alice').length, 1);
    assert.equal((await notifications.notify('kyc_approved', { user: 99999, dedupeKey: 'k2' })).status, 'no_user');
    assert.equal((await notifications.notify('nonsense', { user: ids.alice, dedupeKey: 'k3' })).status, 'error');
  });

  test('templates include safe reasons and never the admin-only wallet reason', () => {
    const rejected = notifications.TEMPLATES.withdrawal_rejected({ amount: 2500.5, reason: '  Wallet   address invalid ' });
    assert.equal(rejected.description, 'Your withdrawal of ₹2,500.5 was rejected and the amount has been refunded to your winnings balance. Reason: Wallet address invalid');
    const adjusted = notifications.TEMPLATES.wallet_adjusted({ amount: 100, credit: false, balance: 'winnings', reason: 'fraud check' });
    assert.doesNotMatch(adjusted.description, /fraud/);
  });
});

describe('notification settings', () => {
  test('reminder minutes are validated and normalised', () => {
    assert.deepEqual(settingsService.parseReminderMinutes('5, 30,30'), { minutes: [30, 5] });
    assert.ok(settingsService.parseReminderMinutes('').error);
    assert.ok(settingsService.parseReminderMinutes('abc').error);
    assert.ok(settingsService.parseReminderMinutes('0').error);
    assert.ok(settingsService.parseReminderMinutes('1,2,3,4,5,6').error);
    const { values } = settingsService.validate({ session_reminder_minutes: '15', events: ['winnings_credited'], push_enabled: '1' });
    assert.deepEqual(values.session_reminder_minutes, [15]);
    assert.equal(values.events.winnings_credited, true);
    assert.equal(values.events.deposit_success, false);
  });
});

// ─── Session reminders ───────────────────────────────────────────────────────

describe('session reminders', () => {
  const NOW = new Date('2026-10-20T12:00:00Z');
  const minutes = (m) => new Date(NOW.getTime() + m * 60000);

  function addSession(key, startInMinutes, extra = {}) {
    ids[key] = new ObjectId();
    db.LeagueSession.push({ _id: ids[key], name: `Session ${key}`, start_time: minutes(startInMinutes), end_time: minutes(startInMinutes + 60), status: 'upcoming', active: true, ...extra });
    return ids[key];
  }
  function addContest(sessionId, status = 'upcoming') {
    const id = new ObjectId();
    db.Contest.push({ _id: id, league_session_id: sessionId, status, category: 'mega' });
    return id;
  }
  const enter = (contestId, userKey) => db.ContestEntry.push({ _id: new ObjectId(), contest_id: contestId, user_id: ids[userKey] });

  beforeEach(() => {
    reset();
    const s1 = addSession('s1', 28);
    const c1 = addContest(s1);
    const cancelled = addContest(s1, 'cancelled');
    ['alice', 'bot', 'quiet'].forEach((u) => enter(c1, u));
    enter(c1, 'alice'); // second entry, still one reminder
    db.ContestEntry.push({ _id: new ObjectId(), contest_id: c1, user_id: 8 }); // bob by legacy id
    enter(cancelled, 'notoken'); // only in a cancelled contest
    for (const [key, extra] of [['cancelledSession', { status: 'cancelled' }], ['draft', { status: 'draft' }], ['inactive', { active: false }], ['live', { status: 'live' }]]) {
      enter(addContest(addSession(key, 10, extra)), 'alice');
    }
    enter(addContest(addSession('later', 45)), 'alice'); // beyond the largest offset
  });

  test('reminds only eligible entrants of upcoming, active sessions', async () => {
    const result = await runSessionReminders(NOW);
    await settle();
    assert.equal(result.queued, 2);
    assert.equal(notesFor('alice', 'session_reminder').length, 1);
    assert.equal(notesFor('bob', 'session_reminder').length, 1);
    for (const key of ['bot', 'quiet', 'notoken']) assert.equal(notesFor(key, 'session_reminder').length, 0, key);

    const note = notesFor('alice', 'session_reminder')[0];
    assert.equal(note.title, 'Session s1 starts in 28 min');
    assert.match(note.description, /starts at 20 Oct, 05:58 pm IST/i);
    assert.equal(note.data.reminder_minutes, 30);
    assert.equal(String(note.data.session_id), String(ids.s1));
  });

  test('repeated ticks do not resend; the next offset sends once more', async () => {
    await runSessionReminders(NOW);
    await runSessionReminders(minutes(1));
    await settle();
    assert.equal(notesFor('alice', 'session_reminder').length, 1);
    await runSessionReminders(minutes(24)); // 4 minutes before start → 5-minute reminder
    await runSessionReminders(minutes(25));
    await settle();
    // (by now the "later" session has entered its own 30-minute window, so look at s1 only)
    const sent = notesFor('alice', 'session_reminder').filter((n) => same(n.data.session_id, ids.s1)).map((n) => n.data.reminder_minutes);
    assert.deepEqual(sent, [30, 5]);
  });

  test('a session first seen inside the smallest window gets a single reminder', async () => {
    db.LeagueSession.find((s) => same(s._id, ids.s1)).start_time = minutes(3);
    await runSessionReminders(NOW);
    await settle();
    const sent = notesFor('alice', 'session_reminder');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].data.reminder_minutes, 5);
    assert.equal(sent[0].title, 'Session s1 starts in 3 min');
  });

  test('rescheduling a session re-arms its reminders', async () => {
    await runSessionReminders(NOW);
    db.LeagueSession.find((s) => same(s._id, ids.s1)).start_time = minutes(29);
    await runSessionReminders(NOW);
    await settle();
    assert.equal(notesFor('alice', 'session_reminder').length, 2);
  });

  test('admin-configured timings and the on/off switch are respected', async () => {
    db.Setting.notification_settings = { session_reminder_minutes: [10] };
    await runSessionReminders(NOW); // 28 minutes away, beyond the only 10-minute offset
    await settle();
    assert.equal(notesFor('alice', 'session_reminder').length, 0);

    db.Setting.notification_settings = { events: { session_reminder: false } };
    await runSessionReminders(minutes(20));
    await settle();
    assert.equal(db.Notification.length, 0);
  });
});

// ─── Event sources ───────────────────────────────────────────────────────────

describe('deposits', () => {
  beforeEach(reset);

  test('LG Pay success callback notifies once even if the callback and return page both fire', async () => {
    db.Payment.push({ _id: new ObjectId(), order_id: 'ORD1', user_id: ids.alice, amount: 2000, payment_status: 0 });
    await paymentController.lgpayCallback(fakeReq({ body: { order_sn: 'ORD1', status: '1', sign: 'x' } }), fakeRes());
    await paymentController.lgpayCallback(fakeReq({ body: { order_sn: 'ORD1', status: '1', sign: 'x' } }), fakeRes()); // retry
    await settle();
    const notes = notesFor('alice', 'deposit_success');
    assert.equal(notes.length, 1);
    assert.match(notes[0].description, /₹2,000 has been added/);
    assert.equal(db.User.find((u) => same(u._id, ids.alice)).deposit_balance, 3000, 'balance logic unchanged');
  });

  test('a non-success callback sends nothing', async () => {
    db.Payment.push({ _id: new ObjectId(), order_id: 'ORD2', user_id: ids.alice, amount: 2000, payment_status: 0 });
    await paymentController.lgpayCallback(fakeReq({ body: { order_sn: 'ORD2', status: '2', sign: 'x' } }), fakeRes());
    await settle();
    assert.equal(db.Notification.length, 0);
  });

  test('manual deposit API notifies; rejected amounts do not', async () => {
    await mobileApi.depositAmount(fakeReq({ body: { user_id: '7', wallet_balance: '500' } }), fakeRes());
    await mobileApi.depositAmount(fakeReq({ body: { user_id: '7', wallet_balance: '5' } }), fakeRes()); // below limit
    await settle();
    assert.equal(notesFor('alice', 'deposit_success').length, 1);
  });

  test('admin approving / rejecting a pending deposit transaction notifies the user', async () => {
    const t1 = new ObjectId();
    const t2 = new ObjectId();
    db.Transaction.push({ _id: t1, old_id: 501, user_id: ids.alice, type: 'deposit', amount: 300, status: 'pending' });
    db.Transaction.push({ _id: t2, old_id: 502, user_id: 7, type: 'deposit', amount: 400, status: 'pending' });
    await adminTransactions.approve(fakeReq({ params: { id: '501' } }), fakeRes());
    await adminTransactions.reject(fakeReq({ params: { id: '502' } }), fakeRes());
    await adminTransactions.approve(fakeReq({ params: { id: '501' } }), fakeRes()); // no longer pending
    await settle();
    assert.equal(notesFor('alice', 'deposit_success').length, 1);
    assert.equal(notesFor('alice', 'deposit_failed').length, 1);
  });
});

describe('withdrawals', () => {
  beforeEach(reset);

  test('submitting a withdrawal notifies "pending approval"', async () => {
    const res = fakeRes();
    await mobileApi.withdrawAmount(fakeReq({ body: { user_id: '7', amount: '1000' } }), res);
    await settle();
    assert.equal(res.body.success, true);
    const [note] = notesFor('alice', 'withdrawal_submitted');
    assert.match(note.description, /₹1,000 .* pending approval/);
  });

  test('a withdrawal over the limit is rejected without a notification', async () => {
    await mobileApi.withdrawAmount(fakeReq({ body: { user_id: '7', amount: '999999' } }), fakeRes());
    await settle();
    assert.equal(db.Notification.length, 0);
  });

  test('admin approval and rejection (with reason) notify; re-processing does not', async () => {
    const w1 = new ObjectId();
    const w2 = new ObjectId();
    db.WithdrawalRequest.push({ _id: w1, user_id: ids.alice, amount: 800, status: 'pending' });
    db.WithdrawalRequest.push({ _id: w2, user_id: ids.alice, amount: 900, status: 'pending' });
    await adminWithdrawals.update(fakeReq({ params: { id: w1 }, body: { status: 'accepted', admin_message: 'ok' } }), fakeRes());
    await adminWithdrawals.update(fakeReq({ params: { id: w2 }, body: { status: 'rejected', admin_message: 'Wallet address is invalid' } }), fakeRes());
    await adminWithdrawals.update(fakeReq({ params: { id: w2 }, body: { status: 'rejected' } }), fakeRes()); // already processed
    await settle();
    const approved = notesFor('alice', 'withdrawal_approved');
    const rejected = notesFor('alice', 'withdrawal_rejected');
    assert.equal(approved.length, 1);
    assert.doesNotMatch(approved[0].description, /ok/);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].description, /refunded .* Reason: Wallet address is invalid/);
  });
});

describe('winnings', () => {
  beforeEach(() => {
    reset();
    ids.session = new ObjectId();
    ids.contest = new ObjectId();
    db.LeagueSession.push({ _id: ids.session, name: 'Morning League', assets: [{ asset_symbol: 'AAA', start_price: 100, end_price: 110 }] });
    db.Contest.push({ _id: ids.contest, old_id: 11, league_session_id: ids.session, category: 'mega', is_calculated: false });
    db.ContestPerformancePrize.push({ contest_id: 11, rank_start: 1, rank_end: 1, per_winner_amount: 50 });
    const basket = (prediction) => { const id = new ObjectId(); db.SavedBasket.push({ _id: id, assets: [{ symbol: 'AAA' }], multipliers: [{ multiplier: 1, prediction }] }); return id; };
    db.ContestEntry.push({ _id: new ObjectId(), old_id: 1, contest_id: 11, user_id: 7, basket_id: basket('UP') });
    db.ContestEntry.push({ _id: new ObjectId(), old_id: 2, contest_id: 11, user_id: 8, basket_id: basket('DOWN') });
  });

  test('only credited prizes are notified, once, with the confirmed amount', async () => {
    await legacy.calculateResults(fakeReq({ body: { contest_id: '11', credit_wallet: '0' } }), fakeRes()); // ranks only, no credit
    await settle();
    assert.equal(db.Notification.length, 0);

    await legacy.calculateResults(fakeReq({ body: { contest_id: '11' } }), fakeRes());
    await legacy.calculateResults(fakeReq({ body: { contest_id: '11' } }), fakeRes()); // re-run: already calculated
    await settle();
    const notes = notesFor('alice', 'winnings_credited');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, 'You won ₹50!');
    assert.match(notes[0].description, /MEGA contest #11 \(Morning League\)/);
    assert.equal(notes[0].data.transaction_id, 'CONTEST_11_ENTRY_1');
    assert.equal(notesFor('bob').length, 0, 'losing entries get nothing');
    assert.equal(db.User.find((u) => same(u._id, ids.alice)).winnings_balance, 50050, 'prize logic unchanged');
  });
});

describe('account & other events', () => {
  beforeEach(reset);

  test('KYC approval and rejection notify the user', async () => {
    const k1 = new ObjectId();
    db.KycSubmission.push({ _id: k1, user_id: ids.alice, status: 'pending' });
    await adminKyc.reject(fakeReq({ params: { id: k1 }, body: { reason: 'PAN image unreadable' } }), fakeRes());
    await adminKyc.approve(fakeReq({ params: { id: k1 } }), fakeRes());
    await settle();
    assert.match(notesFor('alice', 'kyc_rejected')[0].description, /PAN image unreadable/);
    assert.equal(notesFor('alice', 'kyc_approved').length, 1);
  });

  test('admin wallet adjustments notify without exposing the internal reason', async () => {
    await adminUsers.adjustWallet(fakeReq({ params: { id: ids.alice }, body: { type: 'add_winnings', amount: '250', reason: 'goodwill after complaint #44' } }), fakeRes());
    await settle();
    const [note] = notesFor('alice', 'wallet_adjusted');
    assert.equal(note.description, '₹250 has been added to your winnings balance.');
  });
});

describe('mobile notification preferences & history', () => {
  beforeEach(reset);

  test('preferences can be read and updated; invalid values are rejected', async () => {
    let res = fakeRes();
    await mobileApi.getNotificationPreferences(fakeReq({ query: { user_id: '7' } }), res);
    assert.deepEqual(res.body.preferences, { session_reminders: true, winnings: true, transactions: true, account: true });

    res = fakeRes();
    await mobileApi.updateNotificationPreferences(fakeReq({ body: { user_id: '7', session_reminders: 'false' } }), res);
    assert.equal(res.body.preferences.session_reminders, false);

    res = fakeRes();
    await mobileApi.updateNotificationPreferences(fakeReq({ body: { user_id: '7', winnings: 'maybe' } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('history includes event and navigation data, and old rows stay compatible', async () => {
    await notifications.notify('kyc_approved', { user: ids.alice, dedupeKey: 'k', data: { screen: 'kyc' } });
    db.Notification.push({ _id: new ObjectId(), user_id: 7, title: 'Old', description: 'Legacy row', type: 'update', is_read: true, created_at: new Date(0) });
    const res = fakeRes();
    await mobileApi.getUserNotifications(fakeReq({ query: { user_id: '7' } }), res);
    const [fresh, old] = res.body.notifications;
    assert.equal(fresh.event, 'kyc_approved');
    assert.equal(fresh.data.screen, 'kyc');
    assert.equal(old.event, null);
    assert.equal(old.data, null);
  });
});
