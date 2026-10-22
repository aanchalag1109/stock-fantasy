const mongoose = require('mongoose');

const prizeTierSchema = new mongoose.Schema({
  rank_label: { type: String, default: '' },
  rank_start: { type: Number, required: true },
  rank_end: { type: Number, required: true },
  winners_count: { type: Number, required: true },
  percentage: { type: Number, default: 0 },
  prize_amount: { type: Number, default: 0 },
  per_winner_amount: { type: Number, default: 0 },
  total_pool: { type: Number, default: 0 },
  platform_fee: { type: Number, default: 0 },
  prize_pool: { type: Number, default: 0 },
  total_participants: { type: Number, default: 0 },
  total_winners: { type: Number, default: 0 }
}, { _id: false });

const contestSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, default: '' },
  league_session_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  category: { 
    type: String, 
    enum: ['mega', 'equal', 'practice', 'guaranteed'], 
    required: true,
    index: true 
  },
  contest_type: { type: String, enum: ['dynamic', 'fixed'], default: 'dynamic' },
  type: { type: String, default: 'dynamic' },
  status: { 
    type: String, 
    enum: ['upcoming', 'live', 'completed', 'cancelled', 'active'], 
    default: 'upcoming', 
    index: true 
  },
  participants: { type: Number, default: 100 },
  max_entries_per_user: { type: Number, default: 1 },
  entry_fee: { type: Number, required: true, default: 0 },
  platform_fee: { type: Number, default: 0 },
  winning_percentage: { type: Number, default: 30 },
  rank_1_prize_percent: { type: Number, default: 0 },
  rank_2_prize_percent: { type: Number, default: 0 },
  group_size: { type: Number, default: 0 },
  prize_pool: { type: Number, default: 0 },
  fixed_prize_pool: { type: Number, default: 0 },
  total_pool: { type: Number, default: 0 },
  platform_fee_amount: { type: Number, default: 0 },
  total_winners: { type: Number, default: 0 },
  is_pinned: { type: Boolean, default: false },
  pin_order: { type: Number, default: 0 },
  is_fixed_prize: { type: Boolean, default: false },
  bot_count: { type: Number, default: 0 },
  bot_join_minutes_before: { type: Number, default: 30 },
  bots_joined: { type: Boolean, default: false },
  bot_join_at: { type: Date, default: null },
  is_calculated: { type: Boolean, default: false },
  prizes_distributed: { type: Boolean, default: false },
  prize_distribution: { type: mongoose.Schema.Types.Mixed, default: null },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Contest Automation — lease taken while a prize payout runs
  payout_started_at: { type: Date, default: null },
  prizes: [prizeTierSchema]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

contestSchema.index({ league_session_id: 1, status: 1 });
contestSchema.index({ is_pinned: -1, pin_order: 1 });

module.exports = mongoose.model('Contest', contestSchema);
