'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Full player profile on the admin User Profile page: sections follow the admin's permissions,
 * user_id is matched as ObjectId and legacy numeric id, KYC numbers are masked.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Transaction = require('../../src/models/transaction.model');
const ContestEntry = require('../../src/models/contest-entry.model');
const Contest = require('../../src/models/contest.model');
const LeagueSession = require('../../src/models/league-session.model');
const Payment = require('../../src/models/payment.model');
const PayramDeposit = require('../../src/models/payram-deposit.model');
const WithdrawalRequest = require('../../src/models/withdrawal-request.model');
const KycSubmission = require('../../src/models/kyc-submission.model');
const Ticket = require('../../src/models/ticket.model');
const { loadProfile, mask } = require('../../src/services/admin-user-profile.service');

const q = (v) => {
  const o = { select: () => o, sort: () => o, limit: () => o, lean: () => o, then: (a, b) => Promise.resolve(v).then(a, b) };
  return o;
};

const contestId = new mongoose.Types.ObjectId();
let queried;
function stub(Model, name, rows) {
  Model.find = (filter) => { queried.push(name); queried.filters[name] = filter; return q(rows); };
  Model.findOne = () => q(null);
  Model.countDocuments = async () => rows.length;
  Model.aggregate = async () => [{ _id: null, total: 10, count: 1 }];
}

function reset() {
  queried = [];
  queried.filters = {};
  stub(Transaction, 'transactions', [{ type: 'deposit' }]);
  stub(ContestEntry, 'entries', [{ contest_id: String(contestId), session_id: 7, prize_amount: 5 }]);
  stub(Contest, 'contests', [{ _id: contestId, name: 'Mega' }]);
  stub(LeagueSession, 'sessions', [{ _id: new mongoose.Types.ObjectId(), old_id: 7, name: 'Morning' }]);
  stub(Payment, 'payments', []);
  stub(PayramDeposit, 'usdt', []);
  stub(WithdrawalRequest, 'withdrawals', []);
  stub(KycSubmission, 'kyc', [{ aadhar_number: '123456789012', pan_number: 'ABCDE1234F' }]);
  stub(Ticket, 'tickets', []);
}

const user = { _id: new mongoose.Types.ObjectId(), old_id: 42, aadhar: '999988887777' };

describe('Admin → User Profile (full profile)', () => {
  beforeEach(reset);

  test('all sections load for an admin with every permission', async () => {
    const p = await loadProfile(user, () => true);
    assert.ok(p.transactions && p.inrOrders && p.usdtDeposits && p.withdrawals && p.kyc && p.tickets && p.finance);
    assert.equal(p.contests.stats.played, 1);
    assert.equal(p.contests.rows[0].contest.name, 'Mega');
    assert.equal(p.contests.rows[0].session.name, 'Morning', 'legacy numeric session id resolved');
  });

  test('sections the admin may not open are not even queried', async () => {
    const p = await loadProfile(user, (perm) => perm === 'kyc.view');
    assert.equal(p.transactions, null);
    assert.equal(p.inrOrders, null);
    assert.equal(p.usdtDeposits, null);
    assert.equal(p.withdrawals, null);
    assert.equal(p.tickets, null);
    assert.equal(p.finance, null);
    assert.ok(p.kyc);
    assert.deepEqual(queried.filter((n) => ['transactions', 'payments', 'usdt', 'withdrawals', 'tickets'].includes(n)), []);
  });

  test('matches user_id as ObjectId and legacy numeric id', async () => {
    await loadProfile(user, () => true);
    const keys = queried.filters.transactions.user_id.$in.map(String);
    assert.ok(keys.includes(String(user._id)));
    assert.ok(keys.includes('42'));
  });

  test('KYC numbers are masked', async () => {
    const p = await loadProfile(user, () => true);
    assert.equal(p.kyc.rows[0].aadhar_masked, '••••••••9012');
    assert.equal(p.kyc.rows[0].pan_masked, '••••••234F');
    assert.equal(p.masked.aadhar, '••••••••7777');
    assert.equal(mask(''), null);
  });
});
