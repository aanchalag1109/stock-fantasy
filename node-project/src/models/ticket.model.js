const mongoose = require('mongoose');

const ticketReplySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.Mixed, default: null },
  admin_id: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
}, { _id: true });

const ticketSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed', 'pending'], default: 'open', index: true },
  category: { type: String, default: 'general' },
  replies: [ticketReplySchema]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Ticket', ticketSchema);
