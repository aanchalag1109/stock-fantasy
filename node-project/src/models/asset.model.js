const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  // The same symbol is listed in several categories (e.g. AAPL in Small/Mid/Large Cap US), so the
  // symbol is not unique on its own; Admin → Assets keeps it unique per category.
  symbol: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['stock', 'crypto'], required: true },
  category_id: { type: mongoose.Schema.Types.Mixed, default: null },
  image_url: { type: String, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Asset', assetSchema);
