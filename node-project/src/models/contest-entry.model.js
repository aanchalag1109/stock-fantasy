const mongoose = require('mongoose');

const contestEntrySchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  basket_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  session_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  total_score: { type: Number, default: 0, index: true },
  rank: { type: Number, default: null },
  starting_prices: { type: mongoose.Schema.Types.Mixed, default: null },
  ending_prices: { type: mongoose.Schema.Types.Mixed, default: null },
  prize_amount: { type: Number, default: 0 },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: which wallet paid the entry fee, so a cancellation refunds
  // each part to the wallet it came from. null on entries made before this was recorded.
  fee_from_winnings: { type: Number, default: null },
  fee_from_deposit: { type: Number, default: null },
  results_calculated_at: { type: Date, default: null },
  contest_started_at: { type: Date, default: null },
  contest_ended_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

contestEntrySchema.index({ contest_id: 1, total_score: -1 });
contestEntrySchema.index({ contest_id: 1, user_id: 1 });
contestEntrySchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('ContestEntry', contestEntrySchema);
