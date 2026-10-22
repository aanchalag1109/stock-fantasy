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
 * not relied on; a crash between the two writes leaves a visible transaction for review.)
 */

const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');

async function resolveUser(userRef) {
  if (userRef == null) return null;
  const id = String(userRef);
  if (id.length === 24 && mongoose.isValidObjectId(id)) return User.findById(id).select('_id old_id').lean();
  if (/^\d+$/.test(id)) return User.findOne({ old_id: Number(id) }).select('_id old_id').lean();
  return null;
}

/**
 * @returns {Promise<{credited: boolean, duplicate?: boolean, user?: object, transaction?: object}>}
 */
async function creditOnce({ userRef, balance, amount, transaction }) {
  const user = await resolveUser(userRef);
  if (!user) return { credited: false, missingUser: true };
  let created;
  try {
    created = await Transaction.create({ ...transaction, user_id: user._id, amount, status: 'success' });
  } catch (err) {
    if (err && err.code === 11000) return { credited: false, duplicate: true, user };
    throw err;
  }
  await User.updateOne({ _id: user._id }, { $inc: { [balance]: amount } });
  return { credited: true, user, transaction: created };
}

module.exports = { creditOnce, resolveUser };
