const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, default: 'update' },
  is_read: { type: Boolean, default: false, index: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

notificationSchema.index({ user_id: 1, is_read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
