const mongoose = require('mongoose');

const marketTypeCategorySchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  category_type: { type: String, enum: ['stock', 'crypto'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('MarketTypeCategory', marketTypeCategorySchema);
