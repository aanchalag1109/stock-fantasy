const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  admin_message: { type: String, default: null },
  usdt_wallet_address: { type: String, default: null },
  usdt_network: { type: String, default: 'TRC20' },
  message: { type: String, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
