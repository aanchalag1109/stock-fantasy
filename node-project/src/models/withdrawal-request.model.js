const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  amount: { type: Number, required: true }, // ProbCoins deducted from the winnings balance
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  admin_message: { type: String, default: null },
  usdt_wallet_address: { type: String, default: null },
  usdt_network: { type: String, default: 'TRC20' },
  message: { type: String, default: null },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: withdrawals paid out in INR or USDT (client feedback).
  // Rows created before this have no currency: they are USDT, with no payout amount recorded.
  currency: { type: String, default: null },          // 'INR' | 'USDT'
  rate: { type: Number, default: null },              // ProbCoins per 1 unit of currency, locked at request
  payout_amount: { type: Number, default: null },     // amount to send, in currency
  payout_details: { type: mongoose.Schema.Types.Mixed, default: null }, // INR: UPI or bank snapshot
  payout_reference: { type: String, default: null },  // UTR / tx hash entered by the admin
  processed_at: { type: Date, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
