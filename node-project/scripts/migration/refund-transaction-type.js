'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Marks existing refund ledger rows as type 'refund' (as PHP did). Node used to save them as
 * 'deposit', so the app showed refunds as deposits. Only these rows are changed, and only their
 * `type` (and payment_method when empty):
 *   - contest / session cancellation refunds   transaction_id REFUND_<contest>_E<entry>
 *   - withdrawal rejection refunds              transaction_id WDREFUND_<id>, TXNREFUND_<id>
 *                                               or payment_method 'Withdrawal refund'
 * Balances, amounts, statuses and ids are never touched. Safe to run more than once.
 *
 * Dry run (default, writes nothing):  node scripts/migration/refund-transaction-type.js
 * Apply:                              node scripts/migration/refund-transaction-type.js --apply
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const CONTEST_REFUND = { type: 'deposit', transaction_id: { $regex: '^REFUND_' } };
const WITHDRAWAL_REFUND = {
  type: 'deposit',
  $or: [{ transaction_id: { $regex: '^(WD|TXN)REFUND_' } }, { payment_method: 'Withdrawal refund' }],
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob');
  const tx = mongoose.connection.db.collection('transactions');
  const host = mongoose.connection.host;

  const [contestCount, withdrawalCount] = await Promise.all([tx.countDocuments(CONTEST_REFUND), tx.countDocuments(WITHDRAWAL_REFUND)]);
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} on ${host}:`);
  console.log(`  contest / session cancellation refunds to mark 'refund': ${contestCount}`);
  console.log(`  withdrawal rejection refunds to mark 'refund':           ${withdrawalCount}`);
  const sample = await tx.find({ $or: [CONTEST_REFUND, WITHDRAWAL_REFUND] }).project({ transaction_id: 1, description: 1, amount: 1 }).limit(5).toArray();
  sample.forEach((t) => console.log(`    e.g. ${t.transaction_id || '(no id)'}  ${t.amount}  ${t.description || ''}`));

  if (APPLY) {
    const a = await tx.updateMany(CONTEST_REFUND, [{ $set: { type: 'refund', payment_method: { $ifNull: ['$payment_method', 'Contest refund'] } } }]);
    const b = await tx.updateMany(WITHDRAWAL_REFUND, [{ $set: { type: 'refund', payment_method: { $ifNull: ['$payment_method', 'Withdrawal refund'] } } }]);
    console.log(`Done: ${a.modifiedCount} contest refund(s) and ${b.modifiedCount} withdrawal refund(s) marked as 'refund'.`);
  } else {
    console.log('Nothing written. Re-run with --apply to save.');
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
