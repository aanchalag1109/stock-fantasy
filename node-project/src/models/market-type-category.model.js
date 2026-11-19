const mongoose = require('mongoose');

const marketTypeCategorySchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  category_type: { type: String, enum: ['stock', 'crypto'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: dynamic market categories (client feedback).
  // market: indian_stock | us_stock | crypto (uk = legacy, kept inactive). category_type is
  // derived from it. min_assets: assets an admin must assign to this category in a session.
  market: { type: String, enum: ['indian_stock', 'us_stock', 'crypto', 'uk'], default: null, index: true },
  description: { type: String, default: '' },
  min_assets: { type: Number, default: 1, min: 1 },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: most assets a session may assign to this category
  // (client feedback). null = no limit (categories saved before this field existed).
  max_assets: { type: Number, default: null, min: 1 },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('MarketTypeCategory', marketTypeCategorySchema);
