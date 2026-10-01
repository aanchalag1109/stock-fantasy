'use strict';

const LeagueSession = require('../models/league-session.model');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const Notification = require('../models/notification.model');
const logger = require('../config/logger');

async function getUnreadCount(userId) {
  if (!userId) return 0;
  return Notification.countDocuments({ user_id: userId, is_read: false });
}

/**
 * GET /api/v1/sessions/upcoming
 */
const upcomingSessions = async (req, res) => {
  try {
    const sessions = await LeagueSession.find({ status: 'upcoming' })
      .sort({ start_time: 1 })
      .lean();

    // Attach total prize pool from contests
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const enriched = await Promise.all(sessions.map(async (s) => {
      const contests = await Contest.find({ league_session_id: s._id }).select('prize_pool').lean();
      s.total_prize_pool = contests.reduce((sum, c) => sum + (c.prize_pool || 0), 0);
      if (s.image_url) s.image_url = `${baseUrl}/${s.image_url}`;
      return s;
    }));

    return res.json({
      success: true,
      sessions: enriched,
      unread_notifications: await getUnreadCount(req.query.user_id),
    });
  } catch (err) {
    logger.error('upcomingSessions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/sessions/live
 */
const liveSessions = async (req, res) => {
  try {
    const sessions = await LeagueSession.find({ status: 'live' })
      .sort({ start_time: 1 })
      .lean();

    return res.json({
      success: true,
      sessions,
      unread_notifications: await getUnreadCount(req.query.user_id),
    });
  } catch (err) {
    logger.error('liveSessions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/sessions/completed
 */
const completedSessions = async (req, res) => {
  try {
    const sessions = await LeagueSession.find({ status: 'completed' })
      .sort({ end_time: -1 })
      .lean();

    return res.json({ success: true, sessions });
  } catch (err) {
    logger.error('completedSessions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/sessions/:id
 */
const getSession = async (req, res) => {
  try {
    const session = await LeagueSession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ success: true, session });
  } catch (err) {
    logger.error('getSession error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/sessions/user-joined?user_id=&status=
 */
const getUserJoinedSessions = async (req, res) => {
  try {
    const { user_id, status, debug } = req.query;
    const userId = user_id || req.userId;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'user_id is required' });
    }

    // Debug mode
    if (debug === 'true' || debug === '1') {
      const entries = await ContestEntry.find({ user_id: userId }).lean();
      return res.json({
        debug: true,
        user_id: userId,
        contest_entries_count: entries.length,
        contest_entries: entries,
      });
    }

    // Get all contest entries for user
    const contestFilter = { user_id: userId };
    const entries = await ContestEntry.find(contestFilter).select('contest_id basket_id').lean();
    const contestIds = [...new Set(entries.map((e) => e.contest_id?.toString()))];

    if (contestIds.length === 0) {
      return res.json({ success: true, sessions: [], total: 0, unread_notifications: await getUnreadCount(userId) });
    }

    // Get all contests
    const contestQuery = { _id: { $in: contestIds } };
    const contests = await Contest.find(contestQuery)
      .select('league_session_id category prize_pool entry_fee platform_fee')
      .lean();

    const sessionIds = [...new Set(contests.map((c) => c.league_session_id?.toString()))];

    const sessionFilter = { _id: { $in: sessionIds } };
    if (status) sessionFilter.status = status;

    const sessions = await LeagueSession.find(sessionFilter)
      .sort({ start_time: -1 })
      .lean();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const enriched = await Promise.all(sessions.map(async (session) => {
      const sessionContests = contests.filter((c) => c.league_session_id?.toString() === session._id.toString());
      
      let totalPrizePool = 0;
      for (const contest of sessionContests) {
        let prizePool = contest.prize_pool || 0;
        if (['live', 'completed'].includes(session.status) &&
            ['mega', 'equal', 'flexible'].includes((contest.category || '').toLowerCase())) {
          const joinCount = await ContestEntry.countDocuments({ contest_id: contest._id });
          const entryFee = contest.entry_fee || 0;
          const platformFeePercent = contest.platform_fee || 0;
          const totalPool = joinCount * entryFee;
          prizePool = totalPool - (totalPool * platformFeePercent) / 100;
        }
        totalPrizePool += prizePool;
      }

      const sessionEntries = entries.filter((e) => {
        const c = contests.find((c) => c._id.toString() === e.contest_id?.toString());
        return c && c.league_session_id?.toString() === session._id.toString();
      });

      return {
        ...session,
        total_prize_pool: totalPrizePool,
        total_entries: sessionEntries.length,
        contests_joined: [...new Set(sessionEntries.map((e) => e.contest_id?.toString()))].length,
        image_url: session.image_url ? `${baseUrl}/${session.image_url}` : null,
      };
    }));

    return res.json({
      success: true,
      sessions: enriched,
      total: enriched.length,
      unread_notifications: await getUnreadCount(userId),
    });
  } catch (err) {
    logger.error('getUserJoinedSessions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/sessions/all
 */
const getAllSessions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const sessions = await LeagueSession.find(filter)
      .sort({ start_time: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await LeagueSession.countDocuments(filter);
    return res.json({ success: true, sessions, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error('getAllSessions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { upcomingSessions, liveSessions, completedSessions, getSession, getUserJoinedSessions, getAllSessions };
