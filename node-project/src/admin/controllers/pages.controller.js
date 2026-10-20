'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SessionTemplate = require('../../models/session-template.model');
const LeagueSession = require('../../models/league-session.model');
const Contest = require('../../models/contest.model');
const MarketTypeCategory = require('../../models/market-type-category.model');
const Payment = require('../../models/payment.model');
const User = require('../../models/user.model');
const Asset = require('../../models/asset.model');
const Transaction = require('../../models/transaction.model');
const ContestEntry = require('../../models/contest-entry.model');
const ContestPerformancePrize = require('../../models/contest-performance-prize.model');
const { render, renderStandalone } = require('../helpers/render');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../../services/notifications/notification.service');

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const templates = {
  index: async (req, res) => {
    const items = await SessionTemplate.find().sort({ created_at: -1 }).lean();
    await render(res, 'templates/index', { title: 'Saved Templates', templates: items, admin: req.session.admin });
  },
  edit: async (req, res) => {
    const template = await SessionTemplate.findById(req.params.id).lean();
    if (!template) { req.flash('error', 'Template not found'); return res.redirect('/templates'); }
    render(res, 'templates/edit', { title: 'Edit Template', template, admin: req.session.admin });
  },
  update: async (req, res) => {
    await SessionTemplate.findByIdAndUpdate(req.params.id, {
      template_name: req.body.template_name,
      name: req.body.name,
      market_type: req.body.market_type,
      max_stocks: parseInt(req.body.max_stocks, 10) || 5,
    });
    req.flash('success', 'Template updated successfully!');
    res.redirect('/templates');
  },
  destroy: async (req, res) => {
    await SessionTemplate.findByIdAndDelete(req.params.id);
    req.flash('success', 'Template deleted successfully!');
    res.redirect('/templates');
  },
};

async function findSession(id) {
  const mongoose = require('mongoose');
  if (mongoose.isValidObjectId(id)) {
    const session = await LeagueSession.findById(id).lean();
    if (session) return session;
  }
  if (/^\d+$/.test(String(id))) {
    return LeagueSession.findOne({ old_id: Number(id) }).lean();
  }
  return null;
}

const performance = {
  index: async (req, res) => {
    const sessions = await LeagueSession.find().sort({ created_at: -1, old_id: -1 }).lean();
    await render(res, 'performance/index', { title: 'Performance - Sessions', sessions, admin: req.session.admin });
  },
  session: async (req, res) => {
    const session = await findSession(req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/performance'); }
    const keys = [session._id];
    if (session.old_id != null) keys.push(session.old_id);
    const contests = await Contest.find({ league_session_id: { $in: keys } })
      .select('old_id category prize_pool entry_fee participants status')
      .lean();
    const contestKeys = contests.flatMap((contest) => [contest._id, contest.old_id].filter((id) => id != null));
    const joined = contestKeys.length
      ? await ContestEntry.aggregate([
        { $match: { contest_id: { $in: contestKeys } } },
        { $group: { _id: '$contest_id', count: { $sum: 1 } } },
      ])
      : [];
    const joinedByKey = new Map(joined.map((row) => [String(row._id), row.count]));
    contests.forEach((contest) => {
      contest.joined_count = (joinedByKey.get(String(contest._id)) || 0)
        + (contest.old_id != null ? (joinedByKey.get(String(contest.old_id)) || 0) : 0);
      contest.max_participants = contest.participants || 0;
    });
    await render(res, 'performance/session', {
      title: 'Session Details',
      session,
      contests,
      admin: req.session.admin,
    });
  },
  // Contest Calculation Details — mirrors PHP PerformanceController::show($contestId)
  show: async (req, res) => {
    try {
      const contestId = String(req.params.id);
      // Resolve contest by ObjectId or old_id
      let contest = null;
      if (mongoose.isValidObjectId(contestId)) {
        contest = await Contest.findById(contestId).lean();
      }
      if (!contest && /^\d+$/.test(contestId)) {
        contest = await Contest.findOne({ old_id: Number(contestId) }).lean();
      }
      if (!contest) {
        req.flash('error', 'Contest not found');
        return res.redirect('/performance');
      }

      // Resolve session
      const sessionRef = contest.league_session_id;
      const sessionClauses = [];
      if (sessionRef != null && String(sessionRef).length === 24) sessionClauses.push({ _id: sessionRef });
      if (sessionRef != null && /^\d+$/.test(String(sessionRef)) && String(sessionRef).length < 24) {
        sessionClauses.push({ old_id: Number(sessionRef) });
      }
      const session = sessionClauses.length
        ? await LeagueSession.findOne({ $or: sessionClauses }).lean()
        : null;

      contest.session_name   = session ? session.name : '';
      contest.session_status = session ? session.status : 'upcoming';
      contest.session_id     = session ? String(session._id) : '';

      // Prices stored on session assets array (MongoDB schema)
      const sessionAssets = session ? (session.assets || []) : [];
      const startPrices = {};
      const endPrices   = {};
      sessionAssets.forEach(a => {
        if (a.start_price != null) startPrices[a.asset_symbol] = a.start_price;
        if (a.end_price   != null) endPrices[a.asset_symbol]   = a.end_price;
      });

      // Participants
      const contestKeys = [contest._id];
      if (contest.old_id != null) contestKeys.push(contest.old_id);
      const entries = await ContestEntry.find({ contest_id: { $in: contestKeys } })
        .sort({ total_score: -1 }).lean();

      const entryUserIds = [...new Set(entries.map(e => String(e.user_id)))];
      const people = entryUserIds.length
        ? await User.find({
            $or: [
              { _id: { $in: entryUserIds.filter(id => id.length === 24) } },
              { old_id: { $in: entryUserIds.filter(id => /^\d+$/.test(id) && id.length < 24).map(Number) } },
            ],
          }).select('old_id name mobile winnings_balance').lean()
        : [];
      const peopleByKey = new Map();
      people.forEach(p => {
        peopleByKey.set(String(p._id), p);
        if (p.old_id != null) peopleByKey.set(String(p.old_id), p);
      });

      const participants = entries.map(e => {
        const person = peopleByKey.get(String(e.user_id));
        return {
          ...e,
          user_name:        person ? person.name : null,
          user_mobile:      person ? person.mobile : null,
          winnings_balance: person ? (person.winnings_balance || 0) : 0,
        };
      });

      const actualParticipantsCount = participants.length;
      const entryFee          = Number(contest.entry_fee || 0);
      const platformFeePercent = Number(contest.platform_fee || 0);
      const winningPercent    = Number(contest.winning_percentage || 30);
      const totalPool         = actualParticipantsCount * entryFee;
      const platformFeeAmount = totalPool * (platformFeePercent / 100);
      const actualPrizePool   = totalPool - platformFeeAmount;
      let actualWinnersCount  = Math.floor(actualParticipantsCount * (winningPercent / 100));
      if (actualWinnersCount < 1 && actualParticipantsCount > 0) actualWinnersCount = 1;
      if (actualParticipantsCount === 0) actualWinnersCount = 0;

      const contestCategory  = (contest.category || '').toLowerCase().trim();
      const sessionStatus    = contest.session_status;

      let flexibleDistribution = [];
      if (sessionStatus === 'upcoming') {
        let prizeDistJson = contest.prize_distribution;
        if (typeof prizeDistJson === 'string') {
          try { prizeDistJson = JSON.parse(prizeDistJson); } catch { prizeDistJson = []; }
        }
        if (Array.isArray(prizeDistJson)) {
          flexibleDistribution = prizeDistJson.map(item => {
            const rankStart = item.rank_start || 1;
            const rankEnd   = item.rank_end   || 1;
            const winners   = item.winners || 1;
            const percent   = item.prize_percent || 0;
            const perWinner = item.prize_per_user || 0;
            return {
              label:     `Ranks ${rankStart}-${rankEnd}`,
              winners,
              percent,
              prize:     perWinner * winners,
              perWinner,
            };
          });
        }
      } else if (contestCategory === 'equal' && sessionStatus === 'live') {
        let prizeDistJson = contest.prize_distribution;
        if (typeof prizeDistJson === 'string') {
          try { prizeDistJson = JSON.parse(prizeDistJson); } catch { prizeDistJson = []; }
        }
        if (Array.isArray(prizeDistJson)) {
          flexibleDistribution = prizeDistJson.map(item => {
            const rankStart = item.rank_start || 1;
            const rankEnd   = item.rank_end   || 1;
            const percent   = Number(item.prize_percent || 0);
            const winners   = Number(item.winners || 1);
            const groupPrize = actualPrizePool * (percent / 100);
            const perWinner  = winners > 0 ? Math.floor(groupPrize / winners) : 0;
            return { label: `Ranks ${rankStart}-${rankEnd}`, winners, percent, prize: groupPrize, perWinner };
          });
        }
      } else {
        flexibleDistribution = getSimplePrizeTable(actualWinnersCount, actualPrizePool);
      }

      const stats = {
        total_participants:    actualParticipantsCount,
        profitable_users:      participants.filter(p => Number(p.total_score) > 0).length,
        avg_score:             actualParticipantsCount ? (participants.reduce((s, p) => s + Number(p.total_score || 0), 0) / actualParticipantsCount).toFixed(2) : 0,
        highest_score:         participants.reduce((m, p) => Math.max(m, Number(p.total_score || 0)), 0),
        total_pool_generated:  totalPool,
        platform_fee_collected: platformFeeAmount,
        actual_prize_pool:     actualPrizePool,
        actual_winners:        actualWinnersCount,
        start_prices_count:    Object.keys(startPrices).length,
        end_prices_count:      Object.keys(endPrices).length,
      };

      await render(res, 'performance/contest', {
        title: `Contest #${contest.old_id || contest._id} — Calculation`,
        contest,
        session,
        startPrices,
        endPrices,
        participants,
        stats,
        flexibleDistribution,
        admin: req.session.admin,
      });
    } catch (err) {
      console.error('performance.show error:', err);
      req.flash('error', 'Error loading contest data: ' + err.message);
      res.redirect('/performance');
    }
  },
};

// ── Prize table helper (mirrors PHP getSimplePrizeTable) ──────────────────
function getSimplePrizeTable(totalWinners, prizePool) {
  if (totalWinners <= 0 || prizePool <= 0) return [];
  const prizeDistributionTable = {
    10: [
      { start: 1, end: 1,   percent: 30 },
      { start: 2, end: 2,   percent: 18 },
      { start: 3, end: 3,   percent: 11 },
      { start: 4, end: 5,   percent: 13.5 },
      { start: 6, end: 10,  percent: 27.5 },
    ],
    25: [
      { start: 1,  end: 1,  percent: 24 },
      { start: 2,  end: 2,  percent: 14 },
      { start: 3,  end: 3,  percent: 9 },
      { start: 4,  end: 5,  percent: 12.375 },
      { start: 6,  end: 10, percent: 18.125 },
      { start: 11, end: 25, percent: 22.5 },
    ],
    50: [
      { start: 1,  end: 1,  percent: 23 },
      { start: 2,  end: 2,  percent: 13 },
      { start: 3,  end: 3,  percent: 9 },
      { start: 4,  end: 5,  percent: 8.1 },
      { start: 6,  end: 10, percent: 15 },
      { start: 11, end: 25, percent: 16.4 },
      { start: 26, end: 50, percent: 15.5 },
    ],
    100: [
      { start: 1,  end: 1,   percent: 18 },
      { start: 2,  end: 2,   percent: 10 },
      { start: 3,  end: 3,   percent: 8 },
      { start: 4,  end: 5,   percent: 6.576 },
      { start: 6,  end: 10,  percent: 10 },
      { start: 11, end: 25,  percent: 15.4 },
      { start: 26, end: 50,  percent: 16.524 },
      { start: 51, end: 100, percent: 15.5 },
    ],
  };
  const keys = Object.keys(prizeDistributionTable).map(Number).sort((a, b) => a - b);
  let chosen = keys[0];
  let minDiff = Infinity;
  keys.forEach(k => {
    const diff = Math.abs(k - totalWinners);
    if (diff < minDiff) { minDiff = diff; chosen = k; }
  });
  const groups = prizeDistributionTable[chosen];
  const distribution = [];
  for (const group of groups) {
    if (group.start > totalWinners) break;
    const end = Math.min(group.end, totalWinners);
    const groupPrize = prizePool * (group.percent / 100);
    const numInGroup = end - group.start + 1;
    distribution.push({
      label:     `Ranks ${group.start}-${end}`,
      winners:   numInGroup,
      percent:   group.percent,
      prize:     groupPrize,
      perWinner: Math.floor(groupPrize / numInGroup),
    });
    if (end >= totalWinners) break;
  }
  return distribution;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function istBounds(from, to) {
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00+05:30`);
  if (to) range.$lte = new Date(`${to}T23:59:59.999+05:30`);
  return Object.keys(range).length ? range : null;
}

function formatIst(date, style) {
  if (!date) return '';
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(dt);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  const hour = get('hour').padStart(2, '0');
  const clock = `${hour}:${get('minute')} ${String(get('dayPeriod')).toUpperCase()}`;
  const day = `${get('day')} ${get('month')} ${get('year')}`;
  if (style === 'date') return day;
  if (style === 'short') return `${get('day')} ${get('month')}, ${clock}`;
  return `${day}, ${clock}`;
}

function money2(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function docKeys(doc) {
  if (!doc) return [];
  return [doc._id, doc.old_id].filter((id) => id != null);
}

function mappedTotal(map, doc) {
  let total = 0;
  if (map.has(String(doc._id))) total += map.get(String(doc._id));
  if (doc.old_id != null && map.has(String(doc.old_id))) total += map.get(String(doc.old_id));
  return total;
}

async function findDoc(Model, id) {
  const mongoose = require('mongoose');
  const value = String(id);
  if (value.length === 24 && mongoose.isValidObjectId(value)) {
    const doc = await Model.findById(value).lean();
    if (doc) return doc;
  }
  if (/^\d+$/.test(value)) return Model.findOne({ old_id: Number(value) }).lean();
  return null;
}

function latestMatch(match) {
  return [
    { $match: match },
    { $addFields: { created_missing: { $cond: [{ $ifNull: ['$created_at', false] }, 1, 0] } } },
    { $sort: { created_missing: -1, created_at: -1 } },
    { $project: { created_missing: 0 } },
  ];
}

const contestAnalysis = {
  index: async (req, res) => {
    const { from_date = '', to_date = '', status = '' } = req.query;
    const match = {};
    if (status) match.status = status;
    const bounds = istBounds(from_date, to_date);
    if (bounds) match.start_time = bounds;
    const sessions = await LeagueSession.aggregate(latestMatch(match));
    await render(res, 'contest_analysis/index', {
      title: 'Contest Analysis',
      sessions,
      from_date,
      to_date,
      status,
      formatIst,
      admin: req.session.admin,
    });
  },
  users: async (req, res) => {
    const { search = '', from_date = '', to_date = '' } = req.query;
    const match = { is_admin: { $ne: true } };
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ name: pattern }, { mobile: pattern }, { email: pattern }];
    }
    const bounds = istBounds(from_date, to_date);
    if (bounds) match.created_at = bounds;
    const users = await User.aggregate(latestMatch(match));
    const [entryRows, winRows] = await Promise.all([
      ContestEntry.aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }]),
      Transaction.aggregate([
        { $match: { type: 'winnings' } },
        { $group: { _id: '$user_id', total: { $sum: '$amount' } } },
      ]),
    ]);
    const contestsByUser = new Map(entryRows.map((row) => [String(row._id), row.count]));
    const winningsByUser = new Map(winRows.map((row) => [String(row._id), row.total]));
    users.forEach((user) => {
      user.total_contests = mappedTotal(contestsByUser, user);
      user.total_winnings = mappedTotal(winningsByUser, user);
    });
    await render(res, 'contest_analysis/users', {
      title: 'Users Analysis',
      users,
      search,
      from_date,
      to_date,
      formatIst,
      money2,
      admin: req.session.admin,
    });
  },
  session: async (req, res) => {
    const session = await findDoc(LeagueSession, req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/contest-analysis'); }
    const contests = await Contest.find({ league_session_id: { $in: docKeys(session) } }).sort({ old_id: 1 }).lean();
    const contestKeys = contests.flatMap(docKeys);
    const [playerRows, winRows] = contestKeys.length
      ? await Promise.all([
        ContestEntry.aggregate([
          { $match: { contest_id: { $in: contestKeys } } },
          { $group: { _id: '$contest_id', count: { $sum: 1 } } },
        ]),
        Transaction.aggregate([
          { $match: { contest_id: { $in: contestKeys }, type: 'contest_winning' } },
          { $group: { _id: '$contest_id', total: { $sum: '$amount' } } },
        ]),
      ])
      : [[], []];
    const players = new Map(playerRows.map((row) => [String(row._id), row.count]));
    const winnings = new Map(winRows.map((row) => [String(row._id), row.total]));
    const contestsData = contests.map((contest) => ({
      id: contest.old_id || contest._id,
      category: contest.category,
      entry_fee: contest.entry_fee,
      prize_pool: contest.prize_pool,
      status: contest.status,
      total_players: mappedTotal(players, contest),
      total_winnings: mappedTotal(winnings, contest),
    }));
    await render(res, 'contest_analysis/session', {
      title: session.name,
      session,
      contestsData,
      money2,
      admin: req.session.admin,
    });
  },
  contest: async (req, res) => {
    const contest = await findDoc(Contest, req.params.id);
    if (!contest) { req.flash('error', 'Contest not found'); return res.redirect('/contest-analysis'); }
    const sessionRef = contest.league_session_id;
    const sessionClause = [];
    if (sessionRef != null && String(sessionRef).length === 24) sessionClause.push({ _id: sessionRef });
    if (sessionRef != null && /^\d+$/.test(String(sessionRef)) && String(sessionRef).length < 24) {
      sessionClause.push({ old_id: Number(sessionRef) });
    }
    const session = sessionClause.length
      ? await LeagueSession.findOne({ $or: sessionClause }).select('old_id name').lean()
      : null;
    contest.session_name = session ? session.name : '';
    contest.session_ref = session ? (session.old_id || session._id) : '';

    const userFilter = req.query.user_id ? String(req.query.user_id) : '';
    let userKeys = null;
    if (userFilter) {
      const person = await findDoc(User, userFilter);
      userKeys = person ? docKeys(person) : [userFilter];
    }

    const entryMatch = { contest_id: { $in: docKeys(contest) } };
    if (userKeys) entryMatch.user_id = { $in: userKeys };
    const entries = await ContestEntry.find(entryMatch).sort({ rank: 1 }).lean();
    const entryUserIds = [...new Set(entries.map((entry) => String(entry.user_id)))];
    const people = entryUserIds.length
      ? await User.find({
        $or: [
          { _id: { $in: entryUserIds.filter((id) => id.length === 24) } },
          { old_id: { $in: entryUserIds.filter((id) => /^\d+$/.test(id)).map(Number) } },
        ],
      }).select('old_id name mobile').lean()
      : [];
    const peopleByKey = new Map();
    people.forEach((person) => {
      peopleByKey.set(String(person._id), person);
      if (person.old_id != null) peopleByKey.set(String(person.old_id), person);
    });
    const leaderboard = entries.map((entry) => {
      const person = peopleByKey.get(String(entry.user_id));
      return {
        rank: entry.rank,
        name: person ? person.name : null,
        mobile: person ? person.mobile : null,
        total_score: entry.total_score,
        user_id: person && person.old_id != null ? person.old_id : entry.user_id,
      };
    });

    const txnMatch = { contest_id: { $in: docKeys(contest) }, type: 'winnings' };
    if (userKeys) txnMatch.user_id = { $in: userKeys };
    const txns = await Transaction.find(txnMatch).sort({ amount: -1 }).lean();
    const txnUserIds = [...new Set(txns.map((txn) => String(txn.user_id)))];
    const txnPeople = txnUserIds.length
      ? await User.find({
        $or: [
          { _id: { $in: txnUserIds.filter((id) => id.length === 24) } },
          { old_id: { $in: txnUserIds.filter((id) => /^\d+$/.test(id)).map(Number) } },
        ],
      }).select('old_id name mobile').lean()
      : [];
    txnPeople.forEach((person) => {
      peopleByKey.set(String(person._id), person);
      if (person.old_id != null) peopleByKey.set(String(person.old_id), person);
    });
    const winningTransactions = txns.map((txn) => {
      const person = peopleByKey.get(String(txn.user_id));
      return {
        name: person ? person.name : null,
        mobile: person ? person.mobile : null,
        amount: txn.amount,
        description: txn.description,
        created_at: txn.created_at,
      };
    });

    const prizeMatch = [{ contest_id: { $in: docKeys(contest) } }];
    if (contest.old_id != null) prizeMatch.push({ contest_old_id: contest.old_id });
    const prizeStructure = await ContestPerformancePrize.find({ $or: prizeMatch }).sort({ rank_start: 1 }).lean();

    const stats = {
      total_players: leaderboard.length,
      total_prize_distributed: winningTransactions.reduce((sum, txn) => sum + Number(txn.amount || 0), 0),
      winners_count: winningTransactions.length,
      entry_fee: contest.entry_fee,
      total_pool: leaderboard.length * Number(contest.entry_fee || 0),
    };

    await render(res, 'contest_analysis/contest', {
      title: `Contest #${contest.old_id || contest._id}`,
      contest,
      leaderboard,
      winningTransactions,
      prizeStructure,
      stats,
      user_id: userFilter,
      formatIst,
      money2,
      admin: req.session.admin,
    });
  },
  user: async (req, res) => {
    const user = await findDoc(User, req.params.id);
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/contest-analysis/users'); }
    const { from_date = '', to_date = '' } = req.query;
    const match = { user_id: { $in: docKeys(user) } };
    const bounds = istBounds(from_date, to_date);
    if (bounds) match.created_at = bounds;
    const entries = await ContestEntry.aggregate([
      { $match: match },
      { $addFields: { created_missing: { $cond: [{ $ifNull: ['$created_at', false] }, 1, 0] } } },
      { $sort: { created_missing: -1, created_at: -1 } },
    ]);
    const contestIds = entries.map((entry) => entry.contest_id).filter((id) => id != null);
    const contestObjectIds = contestIds.filter((id) => String(id).length === 24);
    const contestNumbers = contestIds
      .filter((id) => /^\d+$/.test(String(id)) && String(id).length < 24)
      .map(Number);
    const contestClauses = [];
    if (contestObjectIds.length) contestClauses.push({ _id: { $in: contestObjectIds } });
    if (contestNumbers.length) contestClauses.push({ old_id: { $in: contestNumbers } });
    const contests = contestClauses.length ? await Contest.find({ $or: contestClauses }).lean() : [];
    const contestByKey = new Map();
    contests.forEach((contest) => {
      contestByKey.set(String(contest._id), contest);
      if (contest.old_id != null) contestByKey.set(String(contest.old_id), contest);
    });
    const sessionIds = contests.map((contest) => contest.league_session_id).filter((id) => id != null);
    const sessionObjectIds = sessionIds.filter((id) => String(id).length === 24);
    const sessionNumbers = sessionIds
      .filter((id) => /^\d+$/.test(String(id)) && String(id).length < 24)
      .map(Number);
    const sessionClauses = [];
    if (sessionObjectIds.length) sessionClauses.push({ _id: { $in: sessionObjectIds } });
    if (sessionNumbers.length) sessionClauses.push({ old_id: { $in: sessionNumbers } });
    const sessions = sessionClauses.length
      ? await LeagueSession.find({ $or: sessionClauses }).select('old_id name').lean()
      : [];
    const sessionByKey = new Map();
    sessions.forEach((session) => {
      sessionByKey.set(String(session._id), session);
      if (session.old_id != null) sessionByKey.set(String(session.old_id), session);
    });
    const winTxns = await Transaction.find({
      user_id: { $in: docKeys(user) },
      type: 'winnings',
    }).sort({ old_id: 1 }).select('contest_id amount').lean();
    const winningByContest = new Map();
    winTxns.forEach((txn) => {
      const key = String(txn.contest_id);
      if (!winningByContest.has(key)) winningByContest.set(key, Number(txn.amount || 0));
    });

    const contestsData = entries.map((entry) => {
      const contest = contestByKey.get(String(entry.contest_id));
      const session = contest ? sessionByKey.get(String(contest.league_session_id)) : null;
      const winning = winningByContest.get(String(entry.contest_id))
        || (contest && contest.old_id != null ? winningByContest.get(String(contest.old_id)) : 0)
        || (contest ? winningByContest.get(String(contest._id)) : 0)
        || 0;
      return {
        contest_id: contest && contest.old_id != null ? contest.old_id : entry.contest_id,
        session_name: session ? session.name : '',
        category: contest ? contest.category : '',
        entry_fee: contest ? contest.entry_fee : 0,
        rank: entry.rank,
        score: entry.total_score,
        winning,
        created_at: entry.created_at,
      };
    });
    const totalWinnings = contestsData.reduce((sum, row) => sum + Number(row.winning || 0), 0);
    const totalSpent = contestsData.reduce((sum, row) => sum + Number(row.entry_fee || 0), 0);
    const stats = {
      total_contests: contestsData.length,
      total_winnings: totalWinnings,
      total_spent: totalSpent,
      net_profit: totalWinnings - totalSpent,
    };
    await render(res, 'contest_analysis/user', {
      title: user.name,
      user,
      contestsData,
      stats,
      from_date,
      to_date,
      formatIst,
      money2,
      admin: req.session.admin,
    });
  },
};

function categoryError(body) {
  const name = String(body.name || '').trim();
  if (!name || name.length > 255) return 'The name field is required.';
  if (!['stock', 'crypto'].includes(body.category_type)) return 'The selected category type is invalid.';
  if (!['active', 'inactive'].includes(body.status)) return 'The selected status is invalid.';
  return null;
}

const categories = {
  index: async (req, res) => {
    const type = req.query.type || '';
    const categories = await MarketTypeCategory.aggregate([
      { $addFields: { created_missing: { $cond: [{ $ifNull: ['$created_at', false] }, 0, 1] } } },
      { $sort: { created_missing: 1, created_at: -1, old_id: 1 } },
      { $project: { created_missing: 0 } },
    ]);
    await render(res, 'market_type_categories/index', {
      title: 'Market Categories',
      categories,
      allCount: categories.length,
      stockCount: categories.filter((c) => c.category_type === 'stock').length,
      cryptoCount: categories.filter((c) => c.category_type === 'crypto').length,
      type,
      admin: req.session.admin,
    });
  },
  create: async (req, res) => {
    await render(res, 'market_type_categories/form', { title: 'Create Market Category', category: null, admin: req.session.admin });
  },
  store: async (req, res) => {
    const error = categoryError(req.body);
    if (error) {
      req.flash('error', error);
      return res.redirect('/market_type_categories/create');
    }
    await MarketTypeCategory.create({
      name: String(req.body.name).trim(),
      category_type: req.body.category_type,
      status: req.body.status,
    });
    req.flash('success', 'Category created successfully');
    res.redirect('/market_type_categories');
  },
  edit: async (req, res) => {
    const category = await findDoc(MarketTypeCategory, req.params.id);
    if (!category) { req.flash('error', 'Not found'); return res.redirect('/market_type_categories'); }
    await render(res, 'market_type_categories/form', { title: 'Edit Market Category', category, admin: req.session.admin });
  },
  update: async (req, res) => {
    const category = await findDoc(MarketTypeCategory, req.params.id);
    if (!category) { req.flash('error', 'Not found'); return res.redirect('/market_type_categories'); }
    const error = categoryError(req.body);
    if (error) {
      req.flash('error', error);
      return res.redirect('/market_type_categories/' + category._id + '/edit');
    }
    await MarketTypeCategory.findByIdAndUpdate(category._id, {
      name: String(req.body.name).trim(),
      category_type: req.body.category_type,
      status: req.body.status,
    });
    req.flash('success', 'Category updated successfully');
    res.redirect('/market_type_categories');
  },
  destroy: async (req, res) => {
    const category = await findDoc(MarketTypeCategory, req.params.id);
    if (category) await MarketTypeCategory.findByIdAndDelete(category._id);
    req.flash('success', 'Category deleted successfully');
    res.redirect('/market_type_categories');
  },
};

const liveManagement = {
  index: async (req, res) => {
    const sessions = await LeagueSession.find({ status: { $in: ['live', 'upcoming', 'completing'] } }).sort({ start_time: 1 }).lean();
    const contests = await Contest.find({ status: { $in: ['live', 'upcoming'] } }).sort({ created_at: -1 }).limit(200).lean();
    render(res, 'live_management/index', { title: 'Live Contest Management', sessions, contests, admin: req.session.admin });
  },
};

const pendingPrizes = {
  index: async (req, res) => {
    const filter = req.query.filter || 'pending';
    const days = parseInt(req.query.days, 10) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const contestFilter = { created_at: { $gte: since } };
    if (filter === 'pending') contestFilter.prizes_distributed = { $ne: true };
    if (filter === 'paid') contestFilter.prizes_distributed = true;
    const contests = await Contest.find(contestFilter).sort({ created_at: -1 }).limit(200).lean();
    const sessionIds = [...new Set(contests.map(c => String(c.league_session_id)).filter(Boolean))];
    const sessions = await LeagueSession.find({ _id: { $in: sessionIds } }).lean();
    const byId = Object.fromEntries(sessions.map(s => [String(s._id), s]));
    const grouped = {};
    contests.forEach(c => {
      const key = String(c.league_session_id || 'none');
      if (!grouped[key]) grouped[key] = { session: byId[key] || { name: 'Unassigned', _id: key }, contests: [], has_pending: false };
      grouped[key].contests.push(c);
      if (!c.prizes_distributed) grouped[key].has_pending = true;
    });
    render(res, 'pending_prizes/index', {
      title: 'Pending Prize Distribution', filter, days, groups: Object.values(grouped), admin: req.session.admin,
    });
  },
  distributeContest: async (req, res) => {
    res.json({ success: false, message: 'Manual prize payout is not enabled on this server yet. Review winners from Performance.' });
  },
  distributeSession: async (req, res) => {
    res.json({ success: false, message: 'Manual prize payout is not enabled on this server yet. Review winners from Performance.' });
  },
};

const payments = {
  index: async (req, res) => {
    const { search = '', status = '', page = 1 } = req.query;
    const filter = {};
    if (status !== '') filter.payment_status = Number(status);
    if (search) filter.order_id = { $regex: search, $options: 'i' };
    const limit = 20;
    const skip = (Number(page) - 1) * limit;
    const [items, total] = await Promise.all([
      Payment.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(filter),
    ]);
    const userIds = [...new Set(items.map(p => p.user_id).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } }).select('name mobile email').lean();
    const userMap = Object.fromEntries(users.map(u => [String(u._id), u]));
    items.forEach(p => { p.user = userMap[String(p.user_id)] || null; });
    render(res, 'payments/index', {
      title: 'Payment Orders', payments: items, total, pages: Math.ceil(total / limit), page: Number(page), search, status, admin: req.session.admin,
    });
  },
  setStatus: (status) => async (req, res) => {
    const previous = await Payment.findByIdAndUpdate(req.params.id, { payment_status: status });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — admin rejected an order that was never credited.
    // "Approve" only flips payment_status (no wallet credit), so it does not send a success notification.
    if (status === -1 && previous && ![1, -1].includes(Number(previous.payment_status))) {
      notify('deposit_failed', { user: previous.user_id, dedupeKey: `deposit_failed:payment:${previous.order_id}`, params: { amount: previous.amount, reference: previous.order_id }, data: { order_id: previous.order_id } });
    }
    const labels = { 1: 'Payment approved', 4: 'Payment marked for verification', '-1': 'Payment rejected' };
    req.flash('success', labels[status] || 'Payment updated');
    res.redirect('/payments');
  },
};

const priceFeeds = {
  index: (req, res) => renderStandalone(res, 'live_price_feeds', { title: 'Live Price Feeds' }),
  stocks: async (req, res) => {
    const assets = await Asset.find({ type: { $in: ['stock', 'equity'] } }).limit(30).lean();
    const rows = assets.length ? assets.map(a => ({
      symbol: a.symbol || a.asset_symbol || a.name,
      name: a.name || a.symbol,
      price: a.price || a.last_price || 0,
      change_percent: a.change_percent || 0,
      volume: a.volume || 0,
      status: 'db',
    })) : [
      { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2500, change_percent: 1.2, volume: 1000000, status: 'fallback' },
      { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3200, change_percent: -0.8, volume: 800000, status: 'fallback' },
    ];
    res.json(rows);
  },
  cryptos: async (req, res) => {
    const assets = await Asset.find({ type: 'crypto' }).limit(20).lean();
    const rows = assets.length ? assets.map(a => ({
      symbol: a.symbol || a.name,
      name: a.name || a.symbol,
      price: a.price || a.last_price || 0,
      change_percent: a.change_percent || 0,
      market_cap: a.market_cap || 0,
      status: 'db',
    })) : [
      { symbol: 'BTC', name: 'Bitcoin', price: 45000, change_percent: 2.5, market_cap: 900000000000, status: 'fallback' },
      { symbol: 'ETH', name: 'Ethereum', price: 3000, change_percent: 1.8, market_cap: 360000000000, status: 'fallback' },
    ];
    res.json(rows);
  },
};

const SavedBasket = require('../../models/saved-basket.model');

const testing = {
  index: async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = 20;
    const [users, total] = await Promise.all([
      User.find().sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(),
    ]);
    render(res, 'testing/index', { title: 'Testing', users, total, pages: Math.ceil(total / limit), page, admin: req.session.admin });
  },
  testUsers: async (req, res) => {
    const users = await User.find({ is_test_user: true }).sort({ created_at: -1 }).limit(300).lean();
    render(res, 'testing/test_users', { title: 'Test Users', users, admin: req.session.admin });
  },
  myGame: async (req, res) => {
    const sessions = await LeagueSession.find({ status: 'upcoming' }).sort({ start_time: 1 }).lean();
    render(res, 'testing/my_game', { title: 'My Game - Upcoming Sessions', sessions, admin: req.session.admin });
  },
  sessionContests: async (req, res) => {
    const session = await findDoc(LeagueSession, req.params.sessionId);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/testing'); }
    const keys = [session._id];
    if (session.old_id != null) keys.push(session.old_id);
    const contests = await Contest.find({ league_session_id: { $in: keys } })
      .select('old_id category entry_fee participants status prize_pool created_at').sort({ created_at: -1 }).lean();
    render(res, 'testing/session_contests', { title: `Contests - ${session.name}`, session, contests, admin: req.session.admin });
  },
  contestDetail: async (req, res) => {
    const contest = await findDoc(Contest, req.params.contestId);
    if (!contest) { req.flash('error', 'Contest not found'); return res.redirect('/testing'); }

    // Resolve session
    const sessionRef = contest.league_session_id;
    const sessionClauses = [];
    if (sessionRef != null && String(sessionRef).length === 24) sessionClauses.push({ _id: sessionRef });
    if (sessionRef != null && /^\d+$/.test(String(sessionRef)) && String(sessionRef).length < 24) {
      sessionClauses.push({ old_id: Number(sessionRef) });
    }
    const session = sessionClauses.length ? await LeagueSession.findOne({ $or: sessionClauses }).lean() : null;

    contest.session_name = session ? session.name : '';
    contest.session_id = session ? String(session._id) : '';

    const contestKeys = [contest._id];
    if (contest.old_id != null) contestKeys.push(contest.old_id);

    // Entries with user and basket info
    const entries = await ContestEntry.find({ contest_id: { $in: contestKeys } })
      .sort({ created_at: -1 }).lean();
    const entryUserIds = [...new Set(entries.map(e => String(e.user_id)))];
    const entryBasketIds = [...new Set(entries.map(e => e.basket_id).filter(Boolean))];
    const [entryUsers, entryBaskets] = await Promise.all([
      entryUserIds.length ? User.find({
        $or: [
          { _id: { $in: entryUserIds.filter(id => id.length === 24) } },
          { old_id: { $in: entryUserIds.filter(id => /^\d+$/.test(id) && id.length < 24).map(Number) } },
        ],
      }).select('old_id name mobile').lean() : [],
      entryBasketIds.length ? SavedBasket.find({ _id: { $in: entryBasketIds } }).select('serial_no assets').lean() : [],
    ]);
    const userByKey = new Map();
    entryUsers.forEach(u => { userByKey.set(String(u._id), u); if (u.old_id) userByKey.set(String(u.old_id), u); });
    const basketByKey = new Map(entryBaskets.map(b => [String(b._id), b]));
    const enrichedEntries = entries.map(e => {
      const u = userByKey.get(String(e.user_id));
      const b = e.basket_id ? basketByKey.get(String(e.basket_id)) : null;
      return {
        ...e,
        user_name: u ? u.name : null,
        user_mobile: u ? u.mobile : null,
        serial_no: b ? b.serial_no : null,
        asset_names: b ? (b.assets || []).map(a => a.symbol || a.name) : [],
      };
    });

    // Available test users (not yet in this contest)
    const alreadyJoinedUserIds = entries.map(e => String(e.user_id));
    const availableUsers = await User.find({ is_test_user: true })
      .select('old_id name mobile').sort({ name: 1 }).lean();
    const filteredAvailableUsers = availableUsers.filter(u =>
      !alreadyJoinedUserIds.includes(String(u._id)) && !alreadyJoinedUserIds.includes(String(u.old_id))
    );

    // Available baskets
    const sessionId = session ? String(session._id) : null;
    let availableBaskets = [];
    if (sessionId) {
      const usedBasketIds = entries.map(e => String(e.basket_id)).filter(Boolean);
      const testUserIds = availableUsers.map(u => u._id);
      const rawBaskets = await SavedBasket.find({
        session_id: { $in: session ? [session._id, ...(session.old_id != null ? [session.old_id] : [])] : [] },
        user_id: { $in: testUserIds },
        _id: { $nin: usedBasketIds },
      }).sort({ created_at: -1 }).lean();
      const basketUserMap = new Map(availableUsers.map(u => [String(u._id), u]));
      availableBaskets = rawBaskets.map(b => ({
        ...b,
        user_name: (basketUserMap.get(String(b.user_id)) || {}).name || null,
        asset_names: (b.assets || []).map(a => a.symbol || a.name),
      }));
    }

    render(res, 'testing/contest_detail', {
      title: `Contest Detail`,
      contest,
      session,
      entries: enrichedEntries,
      availableUsers: filteredAvailableUsers,
      availableBaskets,
      admin: req.session.admin,
    });
  },
  generate: async (req, res) => {
    const docs = [];
    const hash = await bcrypt.hash('password', 8);
    const stamp = Date.now();
    for (let i = 0; i < 100; i++) {
      docs.push({
        name: `Test User ${stamp}-${i + 1}`,
        email: `test${stamp}${i}@probtrade.local`,
        mobile: `9${String(stamp).slice(-8)}${String(i).padStart(2, '0')}`.slice(0, 15),
        password: hash,
        is_test_user: true,
        deposit_balance: 10000,
        winnings_balance: 0,
      });
    }
    await User.insertMany(docs, { ordered: false }).catch(() => {});
    req.flash('success', 'Generated test users');
    res.redirect('/testing/test-users');
  },
  bulkDelete: async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length) {
      await ContestEntry.deleteMany({ user_id: { $in: ids } });
      await SavedBasket.deleteMany({ user_id: { $in: ids } });
      await User.deleteMany({ _id: { $in: ids }, is_test_user: true });
    }
    req.flash('success', 'Selected test users deleted');
    res.redirect('/testing/test-users');
  },
  bulkDeleteJson: async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.json({ success: false, message: 'No users selected' });
    try {
      await ContestEntry.deleteMany({ user_id: { $in: ids } });
      await SavedBasket.deleteMany({ user_id: { $in: ids } });
      const result = await User.deleteMany({ _id: { $in: ids }, is_test_user: true });
      res.json({ success: true, message: `${result.deletedCount} test user(s) deleted` });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  user: async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/testing'); }
    render(res, 'testing/user', { title: user.name || 'User', user, admin: req.session.admin });
  },
  userDetail: async (req, res) => {
    const user = await User.findById(req.params.userId).lean();
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/testing/test-users'); }
    const upcomingSessions = await LeagueSession.find({ status: 'upcoming' })
      .select('old_id name start_time end_time status').sort({ start_time: 1 }).lean();
    render(res, 'testing/user_detail', { title: `User - ${user.name}`, user, upcomingSessions, admin: req.session.admin });
  },
  userSessionContests: async (req, res) => {
    const [user, session] = await Promise.all([
      User.findById(req.params.userId).lean(),
      findDoc(LeagueSession, req.params.sessionId),
    ]);
    if (!user || !session) { req.flash('error', 'User or session not found'); return res.redirect('/testing/test-users'); }
    const sessionKeys = [session._id];
    if (session.old_id != null) sessionKeys.push(session.old_id);
    const [contests, baskets] = await Promise.all([
      Contest.find({ league_session_id: { $in: sessionKeys } })
        .select('old_id category entry_fee participants created_at').sort({ created_at: -1 }).lean(),
      SavedBasket.find({ user_id: user._id, session_id: { $in: sessionKeys } })
        .sort({ created_at: -1 }).lean(),
    ]);
    render(res, 'testing/user_session_contests', {
      title: `${user.name} - ${session.name}`,
      user, session, contests, baskets, admin: req.session.admin,
    });
  },
  createBasket: async (req, res) => {
    const { user_id, session_id, assets, multipliers } = req.body;
    if (!user_id || !session_id || !Array.isArray(assets) || !assets.length) {
      return res.json({ success: false, message: 'Invalid parameters' });
    }
    try {
      const session = await findDoc(LeagueSession, session_id);
      const sessionRef = session ? session._id : session_id;
      const lastBasket = await SavedBasket.findOne({ user_id, session_id: sessionRef })
        .sort({ created_at: -1 }).select('serial_no').lean();
      let nextNum = 1;
      if (lastBasket && lastBasket.serial_no) {
        const match = String(lastBasket.serial_no).match(/^B(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const basket = await SavedBasket.create({
        user_id,
        session_id: sessionRef,
        contest_id: null,
        serial_no: 'B' + nextNum,
        assets: assets.map(a => ({ name: a.symbol || a.name, symbol: a.symbol || a.name, sector: a.sector || 'Other', category_id: a.category_id || null, prediction: a.prediction || 'UP' })),
        multipliers: Array.isArray(multipliers) ? multipliers : [],
        total_score: 0,
        is_standalone: true,
      });
      res.json({ success: true, message: 'Basket created', basket_id: basket._id, serial_no: basket.serial_no });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  deleteBasket: async (req, res) => {
    try {
      await SavedBasket.findByIdAndDelete(req.params.basketId);
      res.json({ success: true, message: 'Basket deleted' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getBaskets: async (req, res) => {
    try {
      const { userId, sessionId } = req.params;
      const session = await findDoc(LeagueSession, sessionId);
      const sessionKeys = session ? [session._id, ...(session.old_id != null ? [session.old_id] : [])] : [sessionId];
      const baskets = await SavedBasket.find({ user_id: userId, session_id: { $in: sessionKeys } })
        .sort({ created_at: -1 }).lean();
      res.json(baskets);
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  bulkJoinContest: async (req, res) => {
    const { user_ids, contest_id, session_id } = req.body;
    if (!Array.isArray(user_ids) || !user_ids.length || !contest_id || !session_id) {
      return res.json({ success: false, message: 'Invalid parameters' });
    }
    try {
      const [contest, session] = await Promise.all([
        findDoc(Contest, contest_id),
        findDoc(LeagueSession, session_id),
      ]);
      if (!contest) return res.json({ success: false, message: 'Contest not found' });
      if (!session) return res.json({ success: false, message: 'Session not found' });

      const maxStocks = session.max_stocks || 3;
      const sessionAssets = session.assets || [];
      if (!sessionAssets.length) return res.json({ success: false, message: 'No assets found for session' });

      // Group assets by category
      const byCategory = {};
      sessionAssets.forEach(a => {
        const cat = a.category_name || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(a);
      });
      const categories = Object.keys(byCategory);

      let joined = 0;
      const contestRef = contest._id;
      const sessionRef = session._id;

      for (const userId of user_ids) {
        const selected = [];

        // At least 1 from each category
        for (const cat of categories) {
          const arr = byCategory[cat];
          selected.push({ ...arr[Math.floor(Math.random() * arr.length)], prediction: Math.random() > 0.5 ? 'UP' : 'DOWN' });
        }

        // Fill remaining slots
        const allFlat = sessionAssets.slice();
        while (selected.length < maxStocks && allFlat.length) {
          const idx = Math.floor(Math.random() * allFlat.length);
          const asset = allFlat.splice(idx, 1)[0];
          if (!selected.find(s => s.asset_symbol === asset.asset_symbol)) {
            selected.push({ ...asset, prediction: Math.random() > 0.5 ? 'UP' : 'DOWN' });
          }
        }
        const trimmed = selected.slice(0, maxStocks);

        // Multipliers: 1 alpha (2x), 1 beta (1.5x), rest 1x
        const alphaIdx = Math.floor(Math.random() * trimmed.length);
        const betaIdx = (alphaIdx + 1) % trimmed.length;
        const multipliers = trimmed.map((a, i) => ({
          index: i, asset_name: a.asset_symbol,
          multiplier: i === alphaIdx ? 2 : i === betaIdx ? 1.5 : 1,
          prediction: a.prediction, selected: true,
        }));
        const assets = trimmed.map(a => ({
          name: a.asset_symbol, symbol: a.asset_symbol,
          sector: a.category_name || 'Other', category_id: a.category_id || null, prediction: a.prediction,
        }));

        // Serial number
        const lastBasket = await SavedBasket.findOne({ user_id: userId, session_id: sessionRef })
          .sort({ created_at: -1 }).select('serial_no').lean();
        let nextNum = 1;
        if (lastBasket && lastBasket.serial_no) {
          const m = String(lastBasket.serial_no).match(/^B(\d+)$/);
          if (m) nextNum = parseInt(m[1], 10) + 1;
        }

        const basket = await SavedBasket.create({
          user_id: userId, session_id: sessionRef, contest_id: null,
          serial_no: 'B' + nextNum, assets, multipliers, total_score: 0, is_standalone: true,
        });

        await ContestEntry.create({
          user_id: userId, contest_id: contestRef,
          basket_id: basket._id, session_id: sessionRef,
          total_score: 0, rank: null,
        });
        joined++;
      }

      res.json({ success: true, message: 'Users joined successfully', joined });
    } catch (e) {
      console.error('bulkJoinContest error:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  },
};

const profile = {
  show: async (req, res) => {
    const adminUser = await User.findById(req.session.admin.id).lean();
    render(res, 'profile/show', { title: 'My Profile', adminUser: adminUser || req.session.admin, admin: req.session.admin });
  },
  update: async (req, res) => {
    const { name, email } = req.body;
    await User.findByIdAndUpdate(req.session.admin.id, { name, email });
    req.session.admin.name = name;
    req.session.admin.email = email;
    req.flash('success', 'Profile updated');
    res.redirect('/profile');
  },
  password: async (req, res) => {
    const user = await User.findById(req.session.admin.id);
    if (!user) { req.flash('error', 'Admin not found'); return res.redirect('/profile'); }
    const ok = await bcrypt.compare(req.body.current_password || '', user.password || '');
    if (!ok) { req.flash('error', 'Current password is incorrect'); return res.redirect('/profile'); }
    if (!req.body.password || req.body.password !== req.body.password_confirmation) {
      req.flash('error', 'New passwords do not match');
      return res.redirect('/profile');
    }
    user.password = await bcrypt.hash(req.body.password, 10);
    await user.save();
    req.flash('success', 'Password updated');
    res.redirect('/profile');
  },
};

const referrals = {
  index: async (req, res) => {
    const bonus = await Transaction.aggregate([
      { $match: { type: 'referral' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const stats = {
      total_referrals: bonus[0]?.count || 0,
      total_referrers: bonus[0]?.count || 0,
      total_bonus_paid: bonus[0]?.total || 0,
    };
    const transactions = await Transaction.find({ type: 'referral' }).sort({ created_at: -1 }).limit(50)
      .populate({ path: 'user_id', model: 'User', select: 'name mobile' }).lean();
    render(res, 'referrals/index', { title: 'Referral Management', stats, transactions, admin: req.session.admin });
  },
};

module.exports = {
  templates, performance, contestAnalysis, categories, liveManagement,
  pendingPrizes, payments, priceFeeds, testing, profile, referrals, fmt,
};

