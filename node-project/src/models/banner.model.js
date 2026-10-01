const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  title: { type: String, required: true },
  image: { type: String, required: true },
  link: { type: String, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Banner', bannerSchema);
