const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  order_id: { type: String, required: true, unique: true, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  amount: { type: Number, required: true }, // rupees charged by LG Pay (total payable)
  payment_status: { type: Number, default: 0, index: true }, // 0: pending, 1: success, 3: needs review, 4: processing, -1: failed
  // NEW IMPLEMENTATION — NODE.JS PROJECT: INR ProbCoin purchases (client feedback). Orders created
  // before this have none of these fields and are credited 1:1 as before.
  currency: { type: String, default: null },        // 'INR'
  probcoins: { type: Number, default: null },        // ProbCoins credited on success
  rate: { type: Number, default: null },             // ProbCoins per ₹1, locked at creation
  base_amount: { type: Number, default: null },      // price of the ProbCoins before charges
  charges: { type: Number, default: 0 },             // gateway charges
  charges_bearer: { type: String, default: null },   // 'user' | 'platform'
  paid_amount: { type: Number, default: null },      // amount LG Pay reported as paid
  review_reason: { type: String, default: null },
  credited_at: { type: Date, default: null },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: the admin's decision (Deposit Orders → View)
  decision: { type: String, default: null },         // 'approved' | 'rejected'
  decided_by: { type: String, default: null },
  decided_at: { type: Date, default: null },
  admin_note: { type: String, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Payment', paymentSchema);
