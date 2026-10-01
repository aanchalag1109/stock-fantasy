const mongoose = require('mongoose');

const contestPerformancePrizeSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, index: true },
  contest_old_id: { type: Number, index: true },
  rank_label: { type: String, default: '' },
  rank_start: { type: Number, default: 0 },
  rank_end: { type: Number, default: 0 },
  winners_count: { type: Number, default: 0 },
  percentage: { type: mongoose.Schema.Types.Mixed, default: 0 },
  prize_amount: { type: Number, default: 0 },
  per_winner_amount: { type: Number, default: 0 },
  total_pool: { type: Number, default: 0 },
  platform_fee: { type: Number, default: 0 },
  prize_pool: { type: Number, default: 0 },
  total_participants: { type: Number, default: 0 },
  total_winners: { type: Number, default: 0 },
}, {
  collection: 'contestperformanceprizes',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

module.exports = mongoose.model('ContestPerformancePrize', contestPerformancePrizeSchema);
