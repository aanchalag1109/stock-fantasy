'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Credit a user exactly once for a refund or prize.
 * Origin: Newly implemented in node-project.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * The transaction is written FIRST with a deterministic transaction_id, which has a
 * unique index. A repeat (job re-run, double click, second process) hits the index and
 * is skipped before any balance changes, so nobody can be paid twice.
 * (The deployment's MongoDB is not a replica set, so multi-document transactions are
 * not relied on; a credit interrupted between the writes is finished by the next attempt.)
 */

const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const logger = require('../../config/logger');

async function resolveUser(userRef) {
  if (userRef == null) return null;
  const id = String(userRef);
  if (id.length === 24 && mongoose.isValidObjectId(id)) return User.findById(id).select('_id old_id').lean();
  if (/^\d+$/.test(id)) return User.findOne({ old_id: Number(id) }).select('_id old_id').lean();
  return null;
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: a credit can be finished, but never applied twice.
 * The ledger row is written first (unique transaction_id) with credit_pending. The balance change and
 * a marker (users.credit_marks) are ONE atomic update that only matches while the marker is absent;
 * then the row is settled. Before this, a failed balance update left a "success" row and no money,
 * and every retry was treated as "already credited".
 *   - balance update failed → row shows 'failed', credit_pending stays; a retry finishes it;
 *   - applied but the reply was lost → the marker is there, so a retry only settles the row;
 *   - cancelPendingCredit() writes the marker without money, so the credit can never happen later.
 * Rows from before this have no credit_pending and are treated as settled, as before.
 */
const MAX_MARKS = 200;
const markPush = (key) => ({ credit_marks: { $each: [key], $slice: -MAX_MARKS } });
const keyOf = (row) => row.transaction_id || String(row._id);

async function settleRow(row) {
  try {
    await Transaction.updateOne({ _id: row._id }, { $set: { status: 'success', credit_pending: false } });
  } catch (err) {
    // Money is in; the row keeps credit_pending and is settled by the next attempt.
    logger.warn(`[ledger] ${keyOf(row)} credited but not settled: ${err.message}`);
  }
}

/** Applies the row's credit if it has not been applied yet. Resolves to true when money moved now. */
async function applyCredit(row, userId, inc) {
  const key = keyOf(row);
  let error = null;
  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await User.updateOne({ _id: userId, credit_marks: { $ne: key } }, { $inc: inc, $push: markPush(key) });
      error = null;
      break;
    } catch (err) { error = err; } // safe to repeat: the marker makes a second apply a no-op
  }
  if (error) {
    await Transaction.updateOne({ _id: row._id, credit_pending: true }, { $set: { status: 'failed' } }).catch(() => {});
    throw error;
  }
  await settleRow(row);
  return !!(result && result.modifiedCount);
}

/**
 * @returns {Promise<{credited: boolean, duplicate?: boolean, existing?: object, user?: object, transaction?: object}>}
 */
async function creditOnce({ userRef, balance, amount, transaction, split = null }) {
  const user = await resolveUser(userRef);
  if (!user) return { credited: false, missingUser: true };
  // `split` ({ winnings_balance: x, deposit_balance: y }) credits several wallets under the one
  // transaction (contest refunds back to where the fee came from).
  const inc = split || { [balance]: amount };
  let created;
  try {
    created = await Transaction.create({ ...transaction, user_id: user._id, amount, status: 'success', credit_pending: true, credit_inc: inc });
  } catch (err) {
    if (!(err && err.code === 11000)) throw err;
    const existing = await Transaction.findOne({ transaction_id: transaction.transaction_id }).lean();
    if (existing && existing.credit_pending) {
      // An earlier attempt did not finish: finish it, exactly once, with what that attempt recorded.
      const now = await applyCredit(existing, existing.user_id, existing.credit_inc || inc);
      if (now) return { credited: true, resumed: true, user, transaction: existing };
      return { credited: false, duplicate: true, existing: { ...existing, status: 'success' }, user };
    }
    return { credited: false, duplicate: true, existing: existing || null, user };
  }
  await applyCredit(created, user._id, inc);
  return { credited: true, user, transaction: created };
}

/**
 * Makes sure an unfinished credit never happens (admin Reject).
 * @returns {Promise<{ state: 'none'|'voided'|'applied'|'settled', row: object|null }>}
 *   voided: stopped for good, row marked failed · applied: the money had already reached the wallet
 *   settled: an ordinary finished row · none: no such row
 */
async function cancelPendingCredit(transactionId, set = {}) {
  const row = await Transaction.findOne({ transaction_id: transactionId }).lean();
  if (!row) return { state: 'none', row: null };
  if (!row.credit_pending) return { state: 'settled', row };
  const key = keyOf(row);
  const burned = await User.updateOne({ _id: row.user_id, credit_marks: { $ne: key } }, { $push: markPush(key) });
  if (!burned.modifiedCount && await User.exists({ _id: row.user_id })) {
    await settleRow(row);
    return { state: 'applied', row };
  }
  await Transaction.updateOne({ _id: row._id }, { $set: { ...set, status: 'failed', credit_pending: false } });
  return { state: 'voided', row };
}

module.exports = { creditOnce, cancelPendingCredit, resolveUser };
