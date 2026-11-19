const mongoose = require('mongoose');

// NEW IMPLEMENTATION — NODE.JS PROJECT: Assets are an independent master list (client feedback).
// An asset belongs to a market (indian_stock | us_stock | crypto; uk = legacy) but to no category:
// assets are assigned to categories per session (league_sessions.assets). A symbol is unique per
// market. The old global `category_id` was removed by scripts/migration/redesign-asset-categories.js.
const assetSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  symbol: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['stock', 'crypto'], required: true },
  market: { type: String, enum: ['indian_stock', 'us_stock', 'crypto', 'uk'], default: null, index: true },
  image_url: { type: String, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

assetSchema.index({ market: 1, symbol: 1 });

module.exports = mongoose.model('Asset', assetSchema);
