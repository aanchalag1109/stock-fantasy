const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, default: 'update' },
  is_read: { type: Boolean, default: false, index: true },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications and Notification Management.
  // Set only on automated notifications; admin-sent and migrated rows leave them empty.
  event: { type: String, default: null, index: true },          // e.g. deposit_success, session_reminder
  dedupe_key: { type: String, default: undefined },            // one notification per real-world event
  data: { type: mongoose.Schema.Types.Mixed, default: null },  // navigation payload, also sent as FCM data
  push_status: { type: String, enum: ['sent', 'failed', 'retry', 'skipped', 'disabled', null], default: null, index: true },
  push_error: { type: String, default: null },
  push_attempts: { type: Number, default: 0 },
  pushed_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

notificationSchema.index({ user_id: 1, is_read: 1 });
// NEW IMPLEMENTATION — NODE.JS PROJECT: duplicate-proof inserts (webhook retries, two schedulers)
notificationSchema.index({ dedupe_key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
