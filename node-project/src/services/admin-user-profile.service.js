'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Full player profile in the admin panel (client feedback)
 * Purpose: Everything about one player on the admin "User Profile" page — public profile, stats,
 *          transactions, INR / USDT deposits, withdrawals, contests, KYC and support tickets.
 *
 * Each section is loaded only when the admin may see it (same permission as that section's own
 * admin page), so a role without e.g. `transactions.view` does not see the ledger here either.
 * Most collections store user_id as Mixed (ObjectId, or the legacy numeric id), so every query
 * matches both.
 */

const mongoose = require('mongoose');
const Transaction = require('../models/transaction.model');
const ContestEntry = require('../models/contest-entry.model');
const Contest = require('../models/contest.model');
const LeagueSession = require('../models/league-session.model');
const Payment = require('../models/payment.model');
const PayramDeposit = require('../models/payram-deposit.model');
const WithdrawalRequest = require('../models/withdrawal-request.model');
const KycSubmission = require('../models/kyc-submission.model');
const Ticket = require('../models/ticket.model');

const LIST_LIMIT = 25;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Every value user_id may hold for this user (ObjectId and legacy numeric id). */
function keysOf(user) {
  const keys = [user._id, String(user._id)];
  if (user.old_id != null) keys.push(user.old_id, String(user.old_id));
  return keys;
}

/** Docs of `Model` whose _id or old_id is in `ids`, keyed by String(id). */
async function docsByIds(Model, ids, select) {
  const unique = [...new Set(ids.filter((id) => id != null).map(String))];
  const oids = unique.filter((id) => id.length === 24 && mongoose.isValidObjectId(id));
  const olds = unique.filter((id) => /^\d+$/.test(id) && id.length < 24).map(Number);
  const or = [];
  if (oids.length) or.push({ _id: { $in: oids } });
  if (olds.length) or.push({ old_id: { $in: olds } });
  const docs = or.length ? await Model.find({ $or: or }).select(`${select} old_id`).lean() : [];
  const map = new Map();
  docs.forEach((d) => { map.set(String(d._id), d); if (d.old_id != null) map.set(String(d.old_id), d); });
  return map;
}

async function sum(Model, match, field = '$amount') {
  const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: field }, count: { $sum: 1 } } }]);
  return { total: row ? num(row.total) : 0, count: row ? row.count : 0 };
}

/** "1234 5678 9012" → "•••• •••• 9012" — enough for an admin to match a document. */
function mask(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  return s.length <= 4 ? s : '•'.repeat(Math.min(s.length - 4, 8)) + s.slice(-4);
}

async function contestsSection(keys) {
  const match = { user_id: { $in: keys } };
  const [entries, played, prizes, best] = await Promise.all([
    ContestEntry.find(match).sort({ created_at: -1 }).limit(LIST_LIMIT).lean(),
    ContestEntry.countDocuments(match),
    sum(ContestEntry, { ...match, prize_amount: { $gt: 0 } }, '$prize_amount'),
    ContestEntry.findOne({ ...match, rank: { $gte: 1 } }).sort({ rank: 1 }).select('rank').lean(),
  ]);
  const [contests, sessions] = await Promise.all([
    docsByIds(Contest, entries.map((e) => e.contest_id), 'name entry_fee status'),
    docsByIds(LeagueSession, entries.map((e) => e.session_id), 'name start_time'),
  ]);
  const rows = entries.map((e) => ({
    ...e,
    contest: contests.get(String(e.contest_id)) || null,
    session: sessions.get(String(e.session_id)) || null,
  }));
  return {
    rows,
    stats: { played, won: prizes.count, prize_total: prizes.total, best_rank: best ? best.rank : null },
  };
}

/**
 * @param {object} user  lean User
 * @param {(perm:string)=>boolean} can  the admin's permission check (res.locals.can)
 */
async function loadProfile(user, can) {
  const keys = keysOf(user);
  const byUser = { user_id: { $in: keys } };
  const job = (allowed, fn) => (allowed ? fn() : Promise.resolve(null));

  const [contests, finance, transactions, inrOrders, usdtDeposits, withdrawals, kyc, tickets] = await Promise.all([
    contestsSection(keys),
    job(can('transactions.view') || can('withdrawals.view'), async () => {
      const [deposited, entryFees, winnings, referrals, withdrawn, pendingWd] = await Promise.all([
        sum(Transaction, { ...byUser, type: 'deposit', status: 'success', payment_method: { $ne: 'Withdrawal refund' } }),
        sum(Transaction, { ...byUser, type: 'contest_entry', status: 'success' }),
        sum(Transaction, { ...byUser, type: 'winnings', status: 'success' }),
        sum(Transaction, { ...byUser, type: 'referral', status: 'success' }),
        sum(WithdrawalRequest, { ...byUser, status: { $in: ['approved', 'accepted'] } }), // Node + PHP rows
        sum(WithdrawalRequest, { ...byUser, status: 'pending' }),
      ]);
      return { deposited, entryFees, winnings, referrals, withdrawn, pendingWd };
    }),
    job(can('transactions.view'), () => Transaction.find(byUser).sort({ created_at: -1 }).limit(LIST_LIMIT).lean()),
    job(can('payments.view'), () => Payment.find(byUser).sort({ created_at: -1 }).limit(LIST_LIMIT).lean()),
    job(can('usdt_deposits.view'), () => PayramDeposit.find({ user_id: user._id }).sort({ created_at: -1 }).limit(LIST_LIMIT).lean()),
    job(can('withdrawals.view'), () => WithdrawalRequest.find(byUser).sort({ created_at: -1 }).limit(LIST_LIMIT).lean()),
    job(can('kyc.view'), () => KycSubmission.find(byUser).sort({ created_at: -1 }).limit(5).lean()),
    job(can('tickets.view'), () => Ticket.find(byUser).sort({ created_at: -1 }).limit(LIST_LIMIT).select('-replies').lean()),
  ]);

  return {
    contests,
    finance,
    transactions,
    inrOrders,
    usdtDeposits,
    withdrawals,
    kyc: kyc && {
      rows: kyc.map((k) => ({ ...k, aadhar_masked: mask(k.aadhar_number), pan_masked: mask(k.pan_number) })),
    },
    tickets,
    masked: { aadhar: mask(user.aadhar), pan: mask(user.pan) },
  };
}

module.exports = { loadProfile, mask, docsByIds };
