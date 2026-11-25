const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  type: { 
    type: String, 
    // NEW IMPLEMENTATION — NODE.JS PROJECT: 'refund' (as PHP) — withdrawal rejections and contest /
    // session cancellations, so the app shows them as refunds, not deposits
    enum: ['deposit', 'winnings', 'contest_entry', 'withdrawal', 'referral', 'manual_adjustment', 'refund'],
    required: true,
    index: true 
  },
  amount: { type: Number, required: true },
  description: { type: String, default: null },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  payment_method: { type: String, default: null },
  transaction_id: { type: String, unique: true, sparse: true },
  transaction_reference: { type: String, default: null, index: true },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: `amount` is ProbCoins; for purchases and withdrawals these
  // record the real-money side (e.g. 5000 ProbCoins for ₹500).
  currency: { type: String, default: null },
  currency_amount: { type: Number, default: null },
  rate: { type: Number, default: null },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: contest entry fees and their refunds — the part taken from /
  // returned to each wallet (amount = from_winnings + from_deposit).
  from_winnings: { type: Number, default: null },
  from_deposit: { type: Number, default: null },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: only while a credit is unfinished (contest-automation/ledger.js)
  credit_pending: { type: Boolean },
  credit_inc: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

transactionSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
