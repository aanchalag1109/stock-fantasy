const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  key: { type: String, required: true, unique: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Setting', settingSchema);
