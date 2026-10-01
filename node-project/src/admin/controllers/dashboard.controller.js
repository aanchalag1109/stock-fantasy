'use strict';

const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Contest = require('../../models/contest.model');
const LeagueSession = require('../../models/league-session.model');
const Transaction = require('../../models/transaction.model');
const KycSubmission = require('../../models/kyc-submission.model');
const WithdrawalRequest = require('../../models/withdrawal-request.model');
const Ticket = require('../../models/ticket.model');
const Announcement = require('../../models/announcement.model');
const SavedBasket = require('../../models/saved-basket.model');
const Setting = require('../../models/setting.model');
const { render } = require('../helpers/render');

function dateRange(startDate, endDate) {
  if (!startDate || !endDate) return {};
  return {
    created_at: {
      $gte: new Date(`${startDate}T00:00:00+05:30`),
      $lte: new Date(`${endDate}T23:59:59.999+05:30`),
    },
  };
}

function diffForHumans(date) {
  if (!date || Number.isNaN(date.getTime())) return 'Never';
  let value = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const steps = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let unit = 'second';
  for (let i = 0; i < steps.length; i++) {
    const [size, name] = steps[i];
    unit = name;
    if (value < size) break;
    value = Math.floor(value / size);
  }
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

function latestPipeline(match, limit) {
  return [
    { $match: match },
    {
      $addFields: {
        created_missing: {
          $cond: [{ $eq: [{ $ifNull: ['$created_at', null] }, null] }, 1, 0],
        },
      },
    },
    { $sort: { created_missing: 1, created_at: -1 } },
    { $limit: limit },
    { $project: { created_missing: 0 } },
  ];
}

function sessionKeys(sessions) {
  const keys = [];
  sessions.forEach((session) => {
    keys.push(session._id);
    if (session.old_id != null) keys.push(session.old_id);
  });
  return keys;
}

function isObjectId(value) {
  return mongoose.isValidObjectId(value) && String(value).length === 24;
}

const index = async (req, res) => {
  try {
    const { start_date, end_date, contest_status } = req.query;
    const range = dateRange(start_date, end_date);
    // PHP counts the users table. Node also stores admin-panel logins in this collection.
    const userFilter = { is_admin: { $ne: true }, ...range };

    const [
      userCount,
      withdrawalRequestCount,
      upcomingSessionCount,
      kycPendingCount,
      openTicketsCount,
      totalEntries,
      activeAnnouncementsCount,
    ] = await Promise.all([
      User.countDocuments(userFilter),
      WithdrawalRequest.countDocuments({ status: 'pending', ...range }),
      LeagueSession.countDocuments({ status: 'upcoming', ...range }),
      KycSubmission.countDocuments({ status: 'pending', ...range }),
      Ticket.countDocuments({ status: { $ne: 'closed' }, ...range }),
      SavedBasket.countDocuments(range),
      Announcement.countDocuments({
        end_date: { $gte: new Date() },
        ...range,
      }),
    ]);

    const liveSessions = await LeagueSession.find({ status: { $ne: 'completed' } }).select('_id old_id').lean();
    const openSessionKeys = sessionKeys(liveSessions);
    const contestCount = openSessionKeys.length
      ? await Contest.countDocuments({ league_session_id: { $in: openSessionKeys }, ...range })
      : 0;

    const walletAgg = await User.aggregate([
      { $match: userFilter },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: [
                { $ifNull: ['$deposit_balance', 0] },
                { $ifNull: ['$winnings_balance', 0] },
              ],
            },
          },
        },
      },
    ]);
    const totalWalletBalance = walletAgg[0]?.total || 0;

    const recentTransactions = await Transaction.aggregate(latestPipeline(range, 5));

    const txUserIds = recentTransactions.map((tx) => tx.user_id).filter((id) => id != null);
    const txObjectIds = txUserIds.filter(isObjectId);
    const txOldIds = txUserIds
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id));
    const txUserQuery = [];
    if (txObjectIds.length) txUserQuery.push({ _id: { $in: txObjectIds } });
    if (txOldIds.length) txUserQuery.push({ old_id: { $in: txOldIds } });
    const txUsers = txUserQuery.length
      ? await User.find({ $or: txUserQuery }).select('name old_id').lean()
      : [];
    const txUserByKey = new Map();
    txUsers.forEach((user) => {
      txUserByKey.set(String(user._id), user);
      if (user.old_id != null) txUserByKey.set(String(user.old_id), user);
    });
    recentTransactions.forEach((tx) => {
      const user = tx.user_id != null ? txUserByKey.get(String(tx.user_id)) : null;
      tx.user_name = user ? user.name : '';
    });

    const recentUsers = await User.aggregate(latestPipeline(userFilter, 10));

    const contestFilter = { ...range };
    if (contest_status) {
      const matchingSessions = await LeagueSession.find({ status: contest_status }).select('_id old_id').lean();
      contestFilter.league_session_id = { $in: sessionKeys(matchingSessions) };
    }

    const recentContests = await Contest.aggregate(latestPipeline(contestFilter, 10));

    const contestSessionIds = recentContests.map((contest) => contest.league_session_id).filter((id) => id != null);
    const contestSessionObjectIds = contestSessionIds.filter(isObjectId);
    const contestSessionOldIds = contestSessionIds
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id));
    const sessionQuery = [];
    if (contestSessionObjectIds.length) sessionQuery.push({ _id: { $in: contestSessionObjectIds } });
    if (contestSessionOldIds.length) sessionQuery.push({ old_id: { $in: contestSessionOldIds } });
    const sessions = sessionQuery.length
      ? await LeagueSession.find({ $or: sessionQuery }).select('_id old_id status').lean()
      : [];
    const sessionByKey = new Map();
    sessions.forEach((session) => {
      sessionByKey.set(String(session._id), session);
      if (session.old_id != null) sessionByKey.set(String(session.old_id), session);
    });

    const basketKeys = recentContests.flatMap((contest) => [contest._id, contest.old_id].filter((id) => id != null));
    const basketCounts = basketKeys.length
      ? await SavedBasket.aggregate([
        { $match: { contest_id: { $ne: null, $in: basketKeys } } },
        { $group: { _id: '$contest_id', count: { $sum: 1 } } },
      ])
      : [];
    const basketCountByKey = new Map(basketCounts.map((row) => [String(row._id), row.count]));

    recentContests.forEach((contest) => {
      const session = contest.league_session_id != null
        ? sessionByKey.get(String(contest.league_session_id))
        : null;
      contest.session_status = session ? session.status : 'upcoming';
      contest.participants_count = (basketCountByKey.get(String(contest._id)) || 0)
        + (contest.old_id != null ? (basketCountByKey.get(String(contest.old_id)) || 0) : 0);
      contest.display_name = contest.name || `Contest #${contest.old_id || contest._id}`;
    });

    const heartbeat = await Setting.findOne({ key: 'cron_last_run' }).lean();
    const lastRunAt = heartbeat && heartbeat.value ? new Date(heartbeat.value) : null;
    const cronRunning = !!(lastRunAt && lastRunAt.getTime() > Date.now() - (3 * 60 * 1000));
    const cronStatus = {
      is_running: cronRunning,
      last_run: lastRunAt ? diffForHumans(lastRunAt) : 'Never',
    };
    const todayLabel = new Date().toLocaleDateString('en-US', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });

    render(res, 'dashboard/index', {
      title: 'Dashboard',
      userCount,
      contestCount,
      withdrawalRequestCount,
      upcomingSessionCount,
      kycPendingCount,
      openTicketsCount,
      totalEntries,
      activeAnnouncementsCount,
      totalWalletBalance: Number(totalWalletBalance).toFixed(2),
      recentTransactions,
      recentUsers,
      recentContests,
      cronStatus,
      todayLabel,
      start_date: start_date || '',
      end_date: end_date || '',
      contest_status: contest_status || '',
      admin: req.session.admin,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
};

module.exports = { index };
