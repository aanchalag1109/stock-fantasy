'use strict';

const mongoose = require('mongoose');
const Contest = require('../../models/contest.model');
const LeagueSession = require('../../models/league-session.model');
const ContestEntry = require('../../models/contest-entry.model');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const { render } = require('../helpers/render');

const PAGE_SIZE = 8;
const CATEGORIES = ['mega', 'equal', 'practice', 'guaranteed'];

const PRIZE_TABLES = {
  10: [[1, 1, 30], [2, 2, 18], [3, 3, 11], [4, 5, 13.5], [6, 10, 27.5]],
  25: [[1, 1, 24], [2, 2, 14], [3, 3, 9], [4, 5, 12.375], [6, 10, 18.125], [11, 25, 22.5]],
  50: [[1, 1, 23], [2, 2, 13], [3, 3, 9], [4, 5, 8.1], [6, 10, 15], [11, 25, 16.4], [26, 50, 15.5]],
  100: [[1, 1, 18], [2, 2, 10], [3, 3, 8], [4, 5, 6.576], [6, 10, 10], [11, 25, 15.4], [26, 50, 16.524], [51, 100, 15.5]],
  250: [[1, 1, 14], [2, 2, 9], [3, 3, 7], [4, 5, 5.169], [6, 10, 8.602], [11, 25, 13.323], [26, 50, 13.031], [51, 100, 13.375], [101, 250, 16.5]],
  500: [[1, 1, 14], [2, 2, 9], [3, 3, 7], [4, 5, 3.1], [6, 10, 6.628], [11, 25, 10.576], [26, 50, 10.102], [51, 100, 12.469], [101, 250, 13.625], [251, 500, 13.5]],
  1000: [[1, 1, 12], [2, 2, 8], [3, 3, 5], [4, 5, 2.399], [6, 10, 4.931], [11, 25, 9.11], [26, 50, 8.813], [51, 100, 10.418], [101, 250, 11.891], [251, 500, 12.188], [501, 1000, 15.25]],
  2500: [[1, 1, 10], [2, 2, 7], [3, 3, 5], [4, 5, 1.8], [6, 10, 3.5], [11, 25, 7.386], [26, 50, 7.229], [51, 100, 8.972], [101, 250, 10.629], [251, 500, 11.172], [501, 1000, 12.562], [1001, 2500, 14.75]],
  5000: [[1, 1, 10], [2, 2, 7], [3, 3, 5], [4, 5, 1.75], [6, 10, 3], [11, 25, 5.314], [26, 50, 5.355], [51, 100, 7.14], [101, 250, 8.853], [251, 500, 9.471], [501, 1000, 10.961], [1001, 2500, 12.281], [2501, 5000, 13.875]],
  10000: [[1, 1, 10], [2, 2, 7], [3, 3, 5], [4, 5, 1.6], [6, 10, 2.049], [11, 25, 4.283], [26, 50, 4.31], [51, 100, 5.08], [101, 500, 8.774], [501, 1000, 10.365], [1001, 2500, 12.82], [2501, 5000, 12.094], [5001, 10000, 16.625]],
  25000: [[1, 1, 8], [2, 2, 6], [3, 3, 4.5], [4, 5, 1.4], [6, 10, 1.7], [11, 25, 3.164], [26, 50, 3.422], [51, 100, 4.229], [101, 500, 6.262], [501, 1000, 7.339], [1001, 5000, 12.172], [5001, 10000, 12.562], [10001, 25000, 29.25]],
  50000: [[1, 1, 8], [2, 2, 6], [3, 3, 4.5], [4, 5, 1.2], [6, 10, 1.7], [11, 25, 2.903], [26, 50, 3.043], [51, 100, 3.89], [101, 500, 6.187], [501, 1000, 6.916], [1001, 5000, 8.555], [5001, 10000, 10], [10001, 25000, 17.431], [25001, 50000, 19.675]],
  100000: [[1, 1, 8], [2, 2, 6], [3, 3, 4.5], [4, 5, 1.052], [6, 10, 1.502], [11, 25, 2.737], [26, 50, 2.65], [51, 100, 3.533], [101, 500, 5.377], [501, 1000, 5.1], [1001, 5000, 7.893], [5001, 10000, 8.45], [10001, 25000, 11.031], [25001, 50000, 12.375], [50001, 100000, 19.8]],
  250000: [[1, 1, 6.5], [2, 2, 5], [3, 3, 4], [4, 5, 1.076], [6, 10, 1.8], [11, 25, 2.53], [26, 50, 2.507], [51, 100, 3.11], [101, 500, 5], [501, 1000, 6], [1001, 5000, 7.075], [5001, 10000, 7.766], [10001, 25000, 8.355], [25001, 100000, 13.281], [100001, 250000, 26]],
  500000: [[1, 1, 6.5], [2, 2, 5], [3, 3, 4], [4, 5, 1.005], [6, 10, 1.673], [11, 25, 2.831], [26, 50, 2.375], [51, 100, 2.9], [101, 500, 4.6], [501, 1000, 5.6], [1001, 5000, 6.788], [5001, 10000, 7.532], [10001, 25000, 7.734], [25001, 100000, 9.312], [100001, 250000, 12.75], [250001, 500000, 19.4]],
  1000000: [[1, 1, 5.5], [2, 2, 4.2], [3, 3, 3.5], [4, 5, 0.941], [6, 10, 1.621], [11, 25, 2.194], [26, 50, 2.159], [51, 100, 2.812], [101, 500, 4.538], [501, 1000, 5.2], [1001, 5000, 6.555], [5001, 10000, 7.407], [10001, 25000, 7.709], [25001, 100000, 8.945], [100001, 250000, 11.594], [250001, 500000, 13.125], [500001, 1000000, 12]],
};

function publicId(doc) {
  return doc && doc.old_id != null ? doc.old_id : (doc ? String(doc._id) : '');
}

function ucfirst(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function money0(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function dec2(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function istParts(date) {
  if (!date) return null;
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return { month: get('month'), day: get('day'), year: get('year'), hour, minute: get('minute') };
}

function scheduleDt(date) {
  const parts = istParts(date);
  if (!parts) return '';
  return `${parts.month} ${parts.day}, ${parts.hour}:${parts.minute}`;
}

function timelineDt(date) {
  if (!date) return '';
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(dt);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  return `${get('month')} ${get('day')}, ${get('year')} ${get('hour')}:${get('minute')} ${String(get('dayPeriod')).toUpperCase()}`;
}

function datetimeLocal(date) {
  if (!date) return '';
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

function sessionOption(session) {
  const start = istParts(session.start_time);
  const end = istParts(session.end_time);
  if (!start) return session.name || '';
  const day = String(start.day).padStart(2, '0');
  const endClock = end ? `${end.hour}:${end.minute}` : '';
  return `${session.name} (${day} ${start.month} ${start.year} ${start.hour}:${start.minute} - ${endClock})`;
}

function formSessions(rows) {
  return rows.map((session) => ({
    id: session.old_id != null ? session.old_id : String(session._id),
    _id: String(session._id),
    old_id: session.old_id,
    display_name: sessionOption(session),
  }));
}

function phpInt(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
}

function isPinned(value) {
  return value === true || value === 1 || value === '1' || value === 'on' || value === 'true';
}

function asRows(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function generateDefaultPrizeDistribution(totalWinners, prizePool) {
  if (totalWinners <= 0) return [];
  const keys = Object.keys(PRIZE_TABLES).map(Number).sort((a, b) => a - b);
  let chosenKey = keys[0];
  keys.forEach((key) => {
    if (key <= totalWinners) chosenKey = key;
  });
  const tiers = PRIZE_TABLES[chosenKey];
  const dist = [];
  tiers.forEach(([start, endRank, percent], index) => {
    if (start > totalWinners) return;
    const isLast = index === tiers.length - 1;
    const end = isLast ? totalWinners : Math.min(endRank, totalWinners);
    if (end < start) return;
    const count = end - start + 1;
    const prize = round2(prizePool * percent / 100);
    const perWinner = count > 0 ? round2(prize / count) : 0;
    dist.push({
      label: `Rank ${start} to ${end}`,
      rank_start: start,
      rank_end: end,
      winners: count,
      per_winner: perWinner,
      prize,
      percent,
    });
  });
  const trimmed = [];
  for (const row of dist) {
    trimmed.push(row);
    if (row.rank_end >= totalWinners) break;
  }
  const last = trimmed[trimmed.length - 1];
  if (last && last.rank_end < totalWinners) {
    const start = last.rank_end + 1;
    const end = totalWinners;
    const count = end - start + 1;
    const percent = tiers[tiers.length - 1][2];
    const prize = round2(prizePool * percent / 100);
    trimmed.push({
      label: `Rank ${start} to ${end}`,
      rank_start: start,
      rank_end: end,
      winners: count,
      per_winner: count > 0 ? round2(prize / count) : 0,
      prize,
      percent,
    });
  }
  return trimmed;
}

function buildPrizeDistribution(body, category, totalWinners, prizePool) {
  const treeRows = asRows(body.tree_rows);
  if (treeRows.length) {
    return treeRows.map((row) => {
      const rankStart = phpInt(row.rank_start, 1) || 1;
      const rankEnd = phpInt(row.rank_end, rankStart) || rankStart;
      const perWinner = parseFloat(row.per_winner) || 0;
      const winners = rankEnd - rankStart + 1;
      const prize = perWinner * winners;
      const percent = prizePool > 0 ? Math.round(((prize / prizePool) * 100) * 10000) / 10000 : 0;
      return {
        label: `Rank ${rankStart}${rankEnd > rankStart ? ` to ${rankEnd}` : ''}`,
        rank_start: rankStart,
        rank_end: rankEnd,
        winners,
        per_winner: perWinner,
        prize,
        percent,
      };
    });
  }

  const existing = body.prize_distribution;
  if (existing && existing !== '[]') {
    try {
      const decoded = typeof existing === 'string' ? JSON.parse(existing) : existing;
      if (Array.isArray(decoded) && decoded.length) return decoded;
    } catch (err) {
      /* fall through to the category default */
    }
  }

  if (category === 'equal') {
    return [{
      label: `Rank 1 to ${totalWinners}`,
      rank_start: 1,
      rank_end: totalWinners,
      winners: totalWinners,
      per_winner: totalWinners > 0 ? round2(prizePool / totalWinners) : 0,
      prize: prizePool,
      percent: 100,
    }];
  }

  if (['mega', 'guaranteed', 'practice'].includes(category)) {
    return generateDefaultPrizeDistribution(totalWinners, prizePool);
  }
  return [];
}

function validateFields(body, multiSession) {
  const errors = [];
  const sessionIds = [].concat(body.league_session_ids || []).filter((id) => id !== '' && id != null);
  if (multiSession && !sessionIds.length) errors.push('The league session ids field is required.');
  if (!CATEGORIES.includes(body.category)) errors.push('The selected category is invalid.');
  const entryFee = parseFloat(body.entry_fee);
  if (!Number.isFinite(entryFee) || entryFee < 0) errors.push('The entry fee must be a number greater than or equal to 0.');
  const participants = parseInt(body.participants, 10);
  if (!Number.isFinite(participants) || participants < 2) errors.push('The participants must be an integer greater than or equal to 2.');
  const platformFee = parseFloat(body.platform_fee);
  if (!Number.isFinite(platformFee) || platformFee < 0 || platformFee > 100) errors.push('The platform fee must be between 0 and 100.');
  const winning = parseFloat(body.winning_percentage);
  if (!Number.isFinite(winning) || winning < 0 || winning > 100) errors.push('The winning percentage must be between 0 and 100.');
  const maxEntries = parseInt(body.max_entries_per_user, 10);
  if (body.max_entries_per_user === undefined || body.max_entries_per_user === '' || !Number.isFinite(maxEntries) || maxEntries < 1) {
    errors.push('The max entries per user field is required.');
  }
  return { errors, sessionIds, entryFee, participants, platformFee, winning, maxEntries };
}

function poolFrom(body, fields) {
  const isFixed = ['guaranteed', 'practice'].includes(body.category);
  const fixedPool = parseFloat(body.fixed_prize_pool);
  const totalPool = fields.entryFee * fields.participants;
  let platformFeeAmount;
  let prizePool;
  if (isFixed && Number.isFinite(fixedPool) && fixedPool > 0) {
    prizePool = fixedPool;
    platformFeeAmount = totalPool > 0 ? (totalPool * fields.platformFee) / 100 : 0;
  } else {
    platformFeeAmount = (totalPool * fields.platformFee) / 100;
    prizePool = totalPool - platformFeeAmount;
  }
  const totalWinners = Math.max(1, Math.floor(fields.participants * (fields.winning / 100)));
  return { isFixed, totalPool, platformFeeAmount, prizePool, totalWinners };
}

async function sessionsByIds(ids) {
  const numbers = ids.filter((id) => /^\d+$/.test(String(id))).map(Number);
  const objectIds = ids.filter((id) => String(id).length === 24 && mongoose.isValidObjectId(String(id)));
  const clauses = [];
  if (numbers.length) clauses.push({ old_id: { $in: numbers } });
  if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
  if (!clauses.length) return [];
  const rows = await LeagueSession.find({ $or: clauses }).lean();
  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row._id), row);
    if (row.old_id != null) map.set(String(row.old_id), row);
  });
  return ids.map((id) => map.get(String(id)) || null);
}

async function findContest(id) {
  const value = String(id || '');
  if (value.length === 24 && mongoose.isValidObjectId(value)) {
    const doc = await Contest.findById(value);
    if (doc) return doc;
  }
  if (/^\d+$/.test(value)) return Contest.findOne({ old_id: Number(value) });
  return null;
}

async function findUser(id) {
  const value = String(id || '');
  if (value.length === 24 && mongoose.isValidObjectId(value)) {
    const doc = await User.findById(value);
    if (doc) return doc;
  }
  if (/^\d+$/.test(value)) return User.findOne({ old_id: Number(value) });
  return null;
}

function contestPayload(body, fields, pools) {
  return {
    category: body.category,
    entry_fee: fields.entryFee,
    participants: fields.participants,
    platform_fee: fields.platformFee,
    winning_percentage: fields.winning,
    max_entries_per_user: fields.maxEntries,
    total_pool: pools.totalPool,
    platform_fee_amount: pools.platformFeeAmount,
    prize_pool: pools.prizePool,
    total_winners: pools.totalWinners,
    is_fixed_prize: pools.isFixed,
    is_pinned: isPinned(body.is_pinned),
    pin_order: phpInt(body.pin_order, 0),
    bot_count: phpInt(body.bot_count, 0),
    bot_join_minutes_before: phpInt(body.bot_join_minutes_before, 30),
    prize_distribution: buildPrizeDistribution(body, body.category, pools.totalWinners, pools.prizePool),
  };
}

async function attachListMeta(contests) {
  const contestIds = contests.map((contest) => contest._id);
  const sessionIds = contests.map((contest) => contest.league_session_id).filter((id) => id != null);
  const objectIds = sessionIds.filter((id) => String(id).length === 24 && mongoose.isValidObjectId(String(id)));
  const numbers = sessionIds.filter((id) => /^\d+$/.test(String(id))).map(Number);
  const sessionClauses = [];
  if (objectIds.length) sessionClauses.push({ _id: { $in: objectIds } });
  if (numbers.length) sessionClauses.push({ old_id: { $in: numbers } });

  const [entryCounts, sessions] = await Promise.all([
    contestIds.length
      ? ContestEntry.aggregate([
        { $match: { contest_id: { $in: contestIds } } },
        { $group: { _id: '$contest_id', count: { $sum: 1 } } },
      ])
      : [],
    sessionClauses.length
      ? LeagueSession.find({ $or: sessionClauses }).select('old_id name status start_time end_time').lean()
      : [],
  ]);

  const joined = new Map(entryCounts.map((row) => [String(row._id), row.count]));
  const sessionMap = new Map();
  sessions.forEach((session) => {
    sessionMap.set(String(session._id), session);
    if (session.old_id != null) sessionMap.set(String(session.old_id), session);
  });

  return contests.map((contest) => {
    const session = sessionMap.get(String(contest.league_session_id)) || null;
    const participantsCount = joined.get(String(contest._id)) || 0;
    const spots = Number(contest.participants) || 0;
    const progress = spots > 0 ? Math.min(100, (participantsCount / spots) * 100) : 0;
    return {
      ...contest,
      display_id: publicId(contest),
      participants_count: participantsCount,
      progress_percentage: progress,
      session_name: session ? session.name : '',
      session_status: session ? (session.status || 'upcoming') : 'upcoming',
      start_label: session ? scheduleDt(session.start_time) : '',
      end_label: session ? scheduleDt(session.end_time) : '',
    };
  });
}

const index = async (req, res) => {
  try {
    const status = req.query.status || '';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const filter = {};
    if (status) {
      const sessions = await LeagueSession.find({ status }).select('_id old_id').lean();
      const keys = [];
      sessions.forEach((session) => {
        keys.push(session._id);
        if (session.old_id != null) keys.push(session.old_id);
      });
      filter.league_session_id = { $in: keys };
    }
    const total = await Contest.countDocuments(filter);
    const rows = await Contest.find(filter)
      .sort({ is_pinned: -1, pin_order: 1, old_id: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();
    const contests = await attachListMeta(rows);
    await render(res, 'contests/index', {
      title: 'Contest Management',
      contests,
      total,
      pages: Math.ceil(total / PAGE_SIZE),
      page,
      status,
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const create = async (req, res) => {
  try {
    const sessions = formSessions(await LeagueSession.find({ status: 'upcoming' }).sort({ start_time: 1 }).lean());
    await render(res, 'contests/create', {
      title: 'Create Contest',
      sessions,
      errors: [],
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const store = async (req, res) => {
  try {
    const fields = validateFields(req.body, true);
    const sessions = fields.errors.length ? [] : await sessionsByIds(fields.sessionIds);
    if (!fields.errors.length && sessions.some((session) => !session)) {
      fields.errors.push('One or more selected sessions do not exist.');
    }
    if (fields.errors.length) {
      const upcoming = formSessions(await LeagueSession.find({ status: 'upcoming' }).sort({ start_time: 1 }).lean());
      return await render(res, 'contests/create', {
        title: 'Create Contest',
        sessions: upcoming,
        errors: fields.errors,
        admin: req.session.admin,
      });
    }
    const pools = poolFrom(req.body, fields);
    const payload = contestPayload(req.body, fields, pools);
    const created = [];
    for (const session of sessions) {
      created.push(await Contest.create({
        ...payload,
        league_session_id: session._id,
        status: 'active',
      }));
    }
    req.flash('success', `${created.length} contest(s) created successfully.`);
    res.redirect('/contests');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/contests/create');
  }
};

const show = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) {
      req.flash('error', 'Not found');
      return res.redirect('/contests');
    }
    const lean = contest.toObject();
    const sessionOr = [];
    if (String(lean.league_session_id || '').length === 24 && mongoose.isValidObjectId(String(lean.league_session_id))) {
      sessionOr.push({ _id: lean.league_session_id });
    }
    if (/^\d+$/.test(String(lean.league_session_id || ''))) sessionOr.push({ old_id: Number(lean.league_session_id) });
    const session = sessionOr.length
      ? await LeagueSession.findOne({ $or: sessionOr }).select('name').lean()
      : null;
    const joined = await ContestEntry.countDocuments({ contest_id: contest._id });
    let prizes = lean.prize_distribution;
    let prizeState = 'hidden';
    if (typeof prizes === 'string') {
      if (prizes.trim()) {
        try {
          prizes = JSON.parse(prizes);
          prizeState = Array.isArray(prizes) ? 'list' : 'invalid';
        } catch (err) {
          prizeState = 'invalid';
          prizes = [];
        }
      }
    } else if (Array.isArray(prizes) && prizes.length) {
      prizeState = 'list';
    } else if (prizes && typeof prizes === 'object') {
      prizeState = 'invalid';
    }
    await render(res, 'contests/show', {
      title: 'Contest Details',
      contest: lean,
      sessionName: session ? session.name : 'N/A',
      joined,
      prizeState,
      prizes: Array.isArray(prizes) ? prizes : [],
      money0,
      dec2,
      ucfirst,
      timelineDt,
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const edit = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) {
      req.flash('error', 'Not found');
      return res.redirect('/contests');
    }
    const sessions = formSessions(await LeagueSession.find().sort({ old_id: 1 }).lean());
    const selected = String(contest.league_session_id || '');
    await render(res, 'contests/edit', {
      title: `Edit Contest #${publicId(contest)}`,
      contest: contest.toObject(),
      displayId: publicId(contest),
      sessions,
      selectedSession: selected,
      botJoinAtLocal: datetimeLocal(contest.bot_join_at),
      existingTree: JSON.stringify(Array.isArray(contest.prize_distribution) ? contest.prize_distribution : []).replace(/</g, '\\u003c'),
      errors: [],
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const update = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) {
      req.flash('error', 'Not found');
      return res.redirect('/contests');
    }
    const fields = validateFields(req.body, false);
    let session = null;
    if (req.body.league_session_id) {
      const matches = await sessionsByIds([req.body.league_session_id]);
      session = matches[0];
      if (!session) fields.errors.push('The selected session does not exist.');
    }
    if (fields.errors.length) {
      const sessions = formSessions(await LeagueSession.find().sort({ old_id: 1 }).lean());
      return await render(res, 'contests/edit', {
        title: `Edit Contest #${publicId(contest)}`,
        contest: { ...contest.toObject(), ...req.body },
        displayId: publicId(contest),
        sessions,
        selectedSession: String(req.body.league_session_id || ''),
        botJoinAtLocal: datetimeLocal(contest.bot_join_at),
        existingTree: JSON.stringify(Array.isArray(contest.prize_distribution) ? contest.prize_distribution : []).replace(/</g, '\\u003c'),
        errors: fields.errors,
        admin: req.session.admin,
      });
    }
    const pools = poolFrom(req.body, fields);
    const payload = contestPayload(req.body, fields, pools);
    if (session) payload.league_session_id = session._id;
    contest.set(payload);
    await contest.save();
    req.flash('success', 'Contest updated successfully.');
    res.redirect('/contests');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/contests/' + req.params.id + '/edit');
  }
};

const bulkDelete = async (req, res) => {
  try {
    const ids = [].concat(req.body.contest_ids || []).filter(Boolean);
    const objectIds = ids.filter((id) => String(id).length === 24 && mongoose.isValidObjectId(String(id)));
    const numbers = ids.filter((id) => /^\d+$/.test(String(id))).map(Number);
    const clauses = [];
    if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
    if (numbers.length) clauses.push({ old_id: { $in: numbers } });
    let deleted = 0;
    if (clauses.length) {
      const result = await Contest.deleteMany({ $or: clauses, status: { $ne: 'live' } });
      deleted = result.deletedCount || 0;
    }
    req.flash('success', `Deleted ${deleted} contests.`);
    res.redirect('/contests');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/contests');
  }
};

const cancel = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) return res.status(404).json({ success: false, message: 'Not found' });
    if (contest.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Already cancelled' });
    }
    const entryFee = Number(contest.entry_fee || 0);
    const keys = [contest._id];
    if (contest.old_id != null) keys.push(contest.old_id);
    const entries = await ContestEntry.find({ contest_id: { $in: keys } }).select('user_id').lean();
    const label = publicId(contest);
    for (const entry of entries) {
      const user = await findUser(entry.user_id);
      if (!user) continue;
      user.deposit_balance = Number(user.deposit_balance || 0) + entryFee;
      await user.save();
      await Transaction.create({
        user_id: user._id,
        type: 'deposit',
        amount: entryFee,
        status: 'success',
        description: `Contest #${label} cancelled - Entry fee refunded`,
      });
    }
    contest.status = 'cancelled';
    await contest.save();
    return res.json({ success: true, message: 'Contest cancelled and users refunded' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const togglePin = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) return res.status(404).json({ success: false, message: 'Not found' });
    contest.is_pinned = !contest.is_pinned;
    contest.pin_order = contest.is_pinned ? phpInt(req.body.pin_order, 0) : 0;
    await contest.save();
    return res.json({
      success: true,
      is_pinned: !!contest.is_pinned,
      message: contest.is_pinned ? 'Contest pinned to top.' : 'Contest unpinned.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const destroy = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (contest) await contest.deleteOne();
    req.flash('success', 'Contest deleted!');
    res.redirect('/contests');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/contests');
  }
};

module.exports = { index, create, store, show, edit, update, destroy, bulkDelete, cancel, togglePin };
