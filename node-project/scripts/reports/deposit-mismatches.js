'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * READ-ONLY report: INR deposit orders whose status and wallet history disagree, and credits or
 * withdrawal refunds that did not finish. It never writes. Whether the money reached the wallet cannot
 * be told from these records for rows made before credit markers existed, so check each listed
 * player's wallet by hand.
 *
 *   node scripts/reports/deposit-mismatches.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const STATUS = { 0: 'Pending', 1: 'Success', 3: 'Needs review', 4: 'Processing', '-1': 'Failed' };

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const rows = await db.collection('payments').aggregate([
    { $lookup: { from: 'transactions', localField: 'order_id', foreignField: 'transaction_id', as: 'tx' } },
    { $project: { order_id: 1, user_id: 1, amount: 1, probcoins: 1, payment_status: 1, updated_at: 1, tx: { $first: '$tx' } } },
  ]).toArray();
  const list = (title, items) => {
    console.log(`\n${title}: ${items.length}`);
    items.slice(0, 100).forEach((p) => console.log(`  ${p.order_id}  user ${p.user_id}  Rs ${p.amount}  order ${STATUS[p.payment_status] || p.payment_status}  history ${p.tx ? p.tx.status : 'none'}`));
    if (items.length > 100) console.log(`  … and ${items.length - 100} more`);
  };
  console.log(`Read-only, database ${db.databaseName}`);
  list('Order NOT successful but history says success', rows.filter((p) => p.payment_status !== 1 && p.tx && p.tx.status === 'success'));
  list('Order successful but history is missing or failed', rows.filter((p) => p.payment_status === 1 && (!p.tx || p.tx.status !== 'success')));
  const open = await db.collection('transactions').find({ credit_pending: true }).project({ transaction_id: 1, user_id: 1, type: 1, amount: 1, status: 1, created_at: 1 }).toArray();
  console.log(`\nUnfinished credits (deposits, refunds, prizes): ${open.length}`);
  open.forEach((t) => console.log(`  ${t.transaction_id}  user ${t.user_id}  ${t.type}  ${t.amount}  ${t.status}`));
  const refunds = await db.collection('withdrawalrequests').find({ status: 'rejected', refund_state: 'pending' }).project({ user_id: 1, amount: 1, old_id: 1 }).toArray();
  console.log(`\nRejected withdrawals whose refund did not finish: ${refunds.length}`);
  refunds.forEach((w) => console.log(`  #${w.old_id != null ? w.old_id : w._id}  user ${w.user_id}  ${w.amount}`));
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err.message); process.exit(1); });
