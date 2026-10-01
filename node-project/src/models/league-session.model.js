const mongoose = require('mongoose');

const sessionAssetSchema = new mongoose.Schema({
  category_id: { type: mongoose.Schema.Types.Mixed, default: null },
  category_name: { type: String, default: null },
  asset_symbol: { type: String, required: true },
  asset_name: { type: String, default: null },
  start_price: { type: Number, default: null },
  end_price: { type: Number, default: null },
  start_price_fetched_at: { type: Date, default: null },
  end_price_fetched_at: { type: Date, default: null }
}, { _id: false });

const leagueSessionSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  market_type: { type: String, default: 'stock' }, // 'stock' or 'crypto'
  max_stocks: { type: Number, default: 5 },
  user_joining_start_time: { type: Date, default: null },
  start_time: { type: Date, required: true, index: true },
  end_time: { type: Date, required: true, index: true },
  status: { 
    type: String, 
    enum: ['upcoming', 'live', 'completing', 'completed', 'draft', 'cancelled'], 
    default: 'upcoming',
    index: true 
  },
  active: { type: Boolean, default: true },
  image_url: { type: String, default: null },
  stocks: { type: mongoose.Schema.Types.Mixed, default: null },
  cryptos: { type: mongoose.Schema.Types.Mixed, default: null },
  assets: [sessionAssetSchema]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

leagueSessionSchema.index({ status: 1, start_time: 1 });
leagueSessionSchema.index({ status: 1, end_time: 1 });

module.exports = mongoose.model('LeagueSession', leagueSessionSchema);
