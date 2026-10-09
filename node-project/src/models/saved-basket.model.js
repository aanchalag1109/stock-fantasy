const mongoose = require('mongoose');

const basketAssetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  symbol: { type: String, default: '' },
  sector: { type: String, default: 'Other' },
  category_id: { type: mongoose.Schema.Types.Mixed, default: null },
  prediction: { type: String, enum: ['UP', 'DOWN', 'NONE'], default: 'UP' }
}, { _id: false });

basketAssetSchema.pre('validate', function setSymbolFromName() {
  if (!this.symbol && this.name) this.symbol = this.name;
  if (!this.name && this.symbol) this.name = this.symbol;
});

const basketMultiplierSchema = new mongoose.Schema({
  index: { type: Number, default: 0 },
  asset_name: { type: String, default: '' },
  multiplier: { type: Number, default: 1 },
  prediction: { type: String, enum: ['UP', 'DOWN', 'NONE'], default: 'UP' },
  selected: { type: Boolean, default: true }
}, { _id: false });

const savedBasketSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  session_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  serial_no: { type: String, default: 'B1' },
  is_standalone: { type: Boolean, default: true, index: true },
  assets: [basketAssetSchema],
  multipliers: [basketMultiplierSchema],
  total_score: { type: Number, default: 0 },
  rank: { type: Number, default: null },
  starting_prices: { type: mongoose.Schema.Types.Mixed, default: null },
  ending_prices: { type: mongoose.Schema.Types.Mixed, default: null },
  contest_started_at: { type: Date, default: null },
  contest_ended_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

savedBasketSchema.index({ user_id: 1, session_id: 1 });

module.exports = mongoose.model('SavedBasket', savedBasketSchema);
