const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  order_id: { type: String, required: true, unique: true, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  amount: { type: Number, required: true },
  payment_status: { type: Number, default: 0, index: true }, // 0: pending, 1: success, 4: processing, -1: failed
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Payment', paymentSchema);
