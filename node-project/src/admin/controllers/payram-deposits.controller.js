'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin → USDT Deposits (PayRam) — the USDT counterpart of Deposit Orders (LG Pay, INR),
 *          which is unchanged.
 *   GET  /usdt-deposits                     list: status / date / search filters, totals
 *   GET  /usdt-deposits/:deposit_id         full record: amounts, rate, PayRam reference,
 *                                           verification, tx hashes, ledger transaction, event log
 *   POST /usdt-deposits/:deposit_id/check   ask PayRam now (credits if it is paid)
 *   POST /usdt-deposits/:deposit_id/approve credit a deposit held for review (credit-once path)
 *   POST /usdt-deposits/:deposit_id/reject  close it without crediting
 */

const mongoose = require('mongoose');
const PayramDeposit = require('../../models/payram-deposit.model');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const { render } = require('../helpers/render');
const { parseListFilters, withStatus } = require('../helpers/list-filters');
const logger = require('../../config/logger');
const config = require('../../config/env');
const payramDeposits = require('../../services/payram/payram-deposit.service');
const payram = require('../../services/payram/payram.client');

const STATUSES = ['pending', 'partially_paid', 'credited', 'review', 'cancelled', 'failed'];
const PAGE_SIZE = 20;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const adminName = (req) => (req.adminAccess && req.adminAccess.email) || (req.session.admin && req.session.admin.email) || 'admin';

async function usersById(ids) {
  const unique = [...new Set(ids.map(String))].filter((id) => mongoose.isValidObjectId(id));
  const users = unique.length ? await User.find({ _id: { $in: unique } }).select('name mobile email old_id').lean() : [];
  return new Map(users.map((u) => [String(u._id), u]));
}

const index = async (req, res) => {
  try {
    const filters = parseListFilters(req.query, STATUSES);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const base = {};
    if (filters.range) base.created_at = filters.range;
    // NEW IMPLEMENTATION — NODE.JS PROJECT: mainnet / testnet filter (deposits before the field are mainnet)
    const environment = ['mainnet', 'testnet'].includes(req.query.environment) ? req.query.environment : '';
    if (environment === 'testnet') base.environment = 'testnet';
    if (environment === 'mainnet') base.environment = { $in: ['mainnet', null] };
    if (search) {
      const like = new RegExp(escapeRegex(search), 'i');
      const users = await User.find({ $or: [{ name: like }, { mobile: like }, { email: like }] }).select('_id').limit(500).lean();
      base.$or = [{ deposit_id: like }, { reference_id: like }, ...(users.length ? [{ user_id: { $in: users.map((u) => u._id) } }] : [])];
    }
    const filter = filters.status ? { ...base, status: filters.status } : base;
    const dir = filters.sort === 'oldest' ? 1 : -1;

    const [rows, total, byStatus] = await Promise.all([
      PayramDeposit.find(filter).sort({ created_at: dir, _id: dir }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      PayramDeposit.countDocuments(filter),
      PayramDeposit.aggregate([
        { $match: base },
        { $group: { _id: '$status', count: { $sum: 1 }, usdt: { $sum: '$amount' }, probcoins: { $sum: '$probcoins' } } },
      ]),
    ]);
    const counts = { all: 0 };
    const totals = { credited_usdt: 0, credited_probcoins: 0, open_usdt: 0 };
    byStatus.forEach((row) => {
      counts[row._id] = row.count;
      counts.all += row.count;
      if (row._id === 'credited') { totals.credited_usdt = row.usdt; totals.credited_probcoins = row.probcoins; }
      if (row._id === 'pending' || row._id === 'partially_paid') totals.open_usdt += row.usdt;
    });
    const users = await usersById(rows.map((r) => r.user_id));
    const queryString = new URLSearchParams([
      ...new URLSearchParams(filters.queryString), ...(search ? [['search', search]] : []), ...(environment ? [['environment', environment]] : []),
    ]).toString();

    await render(res, 'payram_deposits/index', {
      title: 'USDT Deposits (PayRam)',
      deposits: rows.map((d) => ({ ...d, user: users.get(String(d.user_id)) || null })),
      total, page, pages: Math.ceil(total / PAGE_SIZE), pageSize: PAGE_SIZE,
      filters, search, counts, totals, queryString, environment,
      activeEnvironment: payram.activeEnvironment(),
      statusLink: (value) => {
        const qs = withStatus(filters, value).replace(/^\?/, '');
        const params = new URLSearchParams(qs);
        if (search) params.set('search', search);
        if (environment) params.set('environment', environment);
        const out = params.toString();
        return out ? `?${out}` : '?';
      },
      configured: payram.isConfigured(),
      admin: req.session.admin,
    });
  } catch (err) {
    logger.error(`[admin] USDT deposits list failed: ${err.message}`);
    res.status(500).send(err.message);
  }
};

const show = async (req, res) => {
  try {
    const deposit = await PayramDeposit.findOne({ deposit_id: String(req.params.deposit_id) }).lean();
    if (!deposit) { req.flash('error', 'Deposit not found'); return res.redirect('/usdt-deposits'); }
    const [user, transaction] = await Promise.all([
      User.findById(deposit.user_id).select('name mobile email old_id deposit_balance winnings_balance').lean(),
      Transaction.findOne({ transaction_id: `PAYRAM_${deposit.deposit_id}` }).lean(),
    ]);
    await render(res, 'payram_deposits/show', {
      title: `USDT Deposit ${deposit.deposit_id}`,
      deposit, user, transaction,
      payramUrl: payram.connection(deposit.environment || 'mainnet').url,
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

/** check | approve | reject — flash the result and go back to the detail page. */
const action = (name) => async (req, res) => {
  const id = String(req.params.deposit_id);
  const note = String(req.body.note || '').trim().slice(0, 300);
  let result;
  try {
    if (name === 'check') result = await payramDeposits.adminRefresh(id);
    else if (name === 'approve') result = await payramDeposits.adminApprove(id, { admin: adminName(req), note });
    else result = await payramDeposits.adminReject(id, { admin: adminName(req), note });
  } catch (err) {
    result = { type: 'error', message: err.message };
  }
  logger.info(`[admin] ${adminName(req)} USDT deposit ${id} ${name}: ${result.message}`);
  req.flash(result.type === 'warning' ? 'warning' : result.type, result.message);
  res.redirect(`/usdt-deposits/${encodeURIComponent(id)}`);
};

module.exports = { index, show, action, STATUSES };
