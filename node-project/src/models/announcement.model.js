const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['update', 'alert', 'promo'], default: 'update' },
  end_date: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Announcement', announcementSchema);
