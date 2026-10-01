'use strict';

const User = require('../models/user.model');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const Transaction = require('../models/transaction.model');
const LeagueSession = require('../models/league-session.model');
const logger = require('../config/logger');

/**
 * GET /api/v1/stats/user?user_id=
 */
const getUserStats = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const user = await User.findById(userId).select('deposit_balance winnings_balance portfolio_score kyc_status').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const totalContests = await ContestEntry.countDocuments({ user_id: userId });
    const totalWinnings = await Transaction.aggregate([
      { $match: { user_id: userId.toString(), type: 'winnings', status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const winningsAmount = totalWinnings[0]?.total || 0;

    return res.json({
      success: true,
      stats: {
        total_contests_joined: totalContests,
        total_winnings: winningsAmount,
        wallet_balance: parseFloat(((user.deposit_balance || 0) + (user.winnings_balance || 0)).toFixed(2)),
        portfolio_score: user.portfolio_score || 0,
        kyc_status: user.kyc_status,
      },
    });
  } catch (err) {
    logger.error('getUserStats error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

/**
 * GET /api/v1/stats/leaderboard?contest_id=
 */
const getLeaderboard = async (req, res) => {
  try {
    const { contest_id, limit = 50 } = req.query;
    if (!contest_id) return res.status(400).json({ success: false, message: 'contest_id required' });

    const entries = await ContestEntry.find({ contest_id })
      .sort({ total_score: -1 })
      .limit(parseInt(limit))
      .populate({ path: 'user_id', model: 'User', select: 'name profile_image' })
      .populate({ path: 'basket_id', model: 'SavedBasket', select: 'serial_no' })
      .lean();

    const leaderboard = entries.map((e, idx) => ({
      rank: idx + 1,
      user_id: e.user_id?._id || e.user_id,
      user_name: e.user_id?.name || 'Unknown',
      profile_image: e.user_id?.profile_image || null,
      basket_serial: e.basket_id?.serial_no || null,
      total_score: e.total_score || 0,
      prize_amount: e.prize_amount || 0,
    }));

    return res.json({ success: true, leaderboard });
  } catch (err) {
    logger.error('getLeaderboard error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
};

module.exports = { getUserStats, getLeaderboard };
