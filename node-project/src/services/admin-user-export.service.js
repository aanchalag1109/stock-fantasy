'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Export players from the admin panel (client feedback)
 * Purpose: Download the players matching the Players page filters (search, user type, KYC status,
 *          joined date range) as a CSV file that opens directly in Excel / Google Sheets.
 *
 *   - One row per player: profile, KYC, balances and lifetime totals (contests joined, deposited,
 *     withdrawn, winnings).
 *   - Totals are computed with grouped aggregations per batch of players, not one query per player.
 *   - Cells that a spreadsheet would run as a formula (=, +, -, @ …) are prefixed with ' (CSV
 *     injection), and the file starts with a UTF-8 BOM so Excel shows names correctly.
 *   - At most MAX_ROWS players per file; the admin narrows the date range for more.
 */

const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const ContestEntry = require('../models/contest-entry.model');
const WithdrawalRequest = require('../models/withdrawal-request.model');

const MAX_ROWS = 50000;
const BATCH = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' (India time) → Date at the start / end of that day, or null. */
function istDay(value, endOfDay) {
  const text = String(value || '').trim();
  if (!DATE_RE.test(text)) return null;
  const d = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** created_at range from ?from=&to= (either may be empty). */
function dateRange(query = {}) {
  const from = istDay(query.from, false);
  const to = istDay(query.to, true);
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return range;
}

function istDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  // 2026-11-22 14:05 (India time) — sorts correctly and Excel reads it as a date.
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString();
  return `${ist.slice(0, 10)} ${ist.slice(11, 16)}`;
}

function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (cells) => cells.map(csvCell).join(',') + '\r\n';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** { key → total } for one grouped aggregation over user ids (ObjectId + legacy numeric). */
async function totalsBy(Model, match, keys, field) {
  const rows = await Model.aggregate([
    { $match: { ...match, user_id: { $in: keys } } },
    { $group: { _id: '$user_id', total: field ? { $sum: field } : { $sum: 1 } } },
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(String(r._id), r.total));
  return map;
}

const keysOf = (u) => (u.old_id != null ? [u._id, u.old_id] : [u._id]);
const pick = (map, u) => keysOf(u).reduce((s, k) => s + (Number(map.get(String(k))) || 0), 0);

async function statsFor(users) {
  const keys = users.flatMap(keysOf);
  const [contests, deposited, winnings, withdrawn] = await Promise.all([
    totalsBy(ContestEntry, {}, keys, null),
    totalsBy(Transaction, { type: 'deposit', status: 'success', payment_method: { $ne: 'Withdrawal refund' } }, keys, '$amount'),
    totalsBy(Transaction, { type: 'winnings', status: 'success' }, keys, '$amount'),
    totalsBy(WithdrawalRequest, { status: 'approved' }, keys, '$amount'),
  ]);
  return { contests, deposited, winnings, withdrawn };
}

const HEADER = [
  'User ID', 'Name', 'Email', 'Mobile', 'Gender', 'Age', 'KYC Status', 'Email Verified',
  'Deposit Balance', 'Winnings Balance', 'Total Balance',
  'Contests Joined', 'Total Deposited', 'Total Winnings', 'Total Withdrawn',
  'UPI ID', 'USDT Wallet', 'Joined (IST)', 'Last Updated (IST)',
];

function row(u, s) {
  const pd = u.payment_details || {};
  const dep = round2(u.deposit_balance);
  const win = round2(u.winnings_balance);
  return [
    u.old_id != null ? u.old_id : String(u._id), u.name || '', u.email || '', u.mobile || '',
    u.gender || '', u.age != null ? u.age : '', u.kyc_status || 'pending', u.email_verified_at ? 'Yes' : 'No',
    dep, win, round2(dep + win),
    pick(s.contests, u), round2(pick(s.deposited, u)), round2(pick(s.winnings, u)), round2(pick(s.withdrawn, u)),
    pd.upi_id || '', pd.usdt_wallet_address || '', istDateTime(u.created_at), istDateTime(u.updated_at),
  ];
}

/**
 * Writes the CSV for players matching `match` to `write` (called with string chunks).
 * @returns {Promise<{ rows:number, truncated:boolean }>}
 */
async function exportPlayers(match, write) {
  const total = await User.countDocuments(match);
  const limit = Math.min(total, MAX_ROWS);
  write('﻿' + csvLine(HEADER));
  let done = 0;
  while (done < limit) {
    // eslint-disable-next-line no-await-in-loop
    const users = await User.find(match)
      .sort({ created_at: -1, _id: -1 })
      .skip(done)
      .limit(Math.min(BATCH, limit - done))
      .select('-password -remember_token -fcm_token -aadhar -pan')
      .lean();
    if (!users.length) break;
    // eslint-disable-next-line no-await-in-loop
    const stats = await statsFor(users);
    write(users.map((u) => csvLine(row(u, stats))).join(''));
    done += users.length;
  }
  return { rows: done, truncated: total > MAX_ROWS };
}

module.exports = { exportPlayers, dateRange, istDay, csvCell, istDateTime, HEADER, MAX_ROWS };
