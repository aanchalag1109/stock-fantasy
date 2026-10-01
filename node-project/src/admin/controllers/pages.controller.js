'use strict';

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
  show: async (req, res) => {
    const session = await findSession(req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/performance'); }
    return performance.session({ ...req, params: { id: String(session._id) } }, res);
  },
};

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
    await Payment.findByIdAndUpdate(req.params.id, { payment_status: status });
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
    if (ids.length) await User.deleteMany({ _id: { $in: ids }, is_test_user: true });
    req.flash('success', 'Selected test users deleted');
    res.redirect('/testing/test-users');
  },
  user: async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/testing'); }
    render(res, 'testing/user', { title: user.name || 'User', user, admin: req.session.admin });
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
