const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  type: { 
    type: String, 
    enum: ['deposit', 'winnings', 'contest_entry', 'withdrawal', 'referral', 'manual_adjustment'], 
    required: true,
    index: true 
  },
  amount: { type: Number, required: true },
  description: { type: String, default: null },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  payment_method: { type: String, default: null },
  transaction_id: { type: String, unique: true, sparse: true },
  transaction_reference: { type: String, default: null, index: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

transactionSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
