const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  symbol: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['stock', 'crypto'], required: true },
  category_id: { type: mongoose.Schema.Types.Mixed, default: null },
  image_url: { type: String, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Asset', assetSchema);
