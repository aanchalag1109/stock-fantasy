'use strict';

const mongoose = require('mongoose');
const Contest = require('../../models/contest.model');
const LeagueSession = require('../../models/league-session.model');
const ContestEntry = require('../../models/contest-entry.model');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const { render } = require('../helpers/render');
// PHP PARITY: contest cancel + refund (also sends refund notifications) — shared with session cancel
const { cancelContest: cancelContestService, refundBeforeDelete } = require('../../services/contest-cancellation.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — list filters
const { parseListFilters, withStatus } = require('../helpers/list-filters');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Fantasy contest formats (H2H, Winner Takes All, 2x–10x)
const formats = require('../../services/contest-formats');
const { advertisedPerWinner } = require('../../services/contest-automation/contest-scoring');
const contestSettings = require('../../services/contest-settings.service');
const { ensureOldId, keysOf, findByPublicId, buildDynamicPrizeDistribution } = require('../../helpers/mobile-compat');

// NEW IMPLEMENTATION — NODE.JS PROJECT: admin review (Priority 1) — a contest that is live, scored,
// paid or cancelled, or whose session has started, cannot be edited at all: refunds and payouts are
// computed from the contest's current entry fee / prize pool, and its baskets belong to its session.
async function editLock(contest) {
  if (['live', 'completed', 'cancelled'].includes(contest.status)) return `This contest is ${contest.status} and can no longer be edited.`;
  if (contest.prizes_distributed) return 'Prizes for this contest have been paid; it can no longer be edited.';
  if (contest.is_calculated) return 'Results for this contest have been calculated; it can no longer be edited.';
  const session = contest.league_session_id != null ? await findByPublicId(LeagueSession, contest.league_session_id) : null;
  if (session && ['live', 'completing', 'completed', 'cancelled'].includes(session.status)) {
    return `Its session is ${session.status}; the contest can no longer be edited.`;
  }
  return null;
}

const sameMoney = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

const CONTEST_STATUSES = ['live', 'upcoming', 'completed', 'cancelled'];

const PAGE_SIZE = 8;
const CATEGORIES = formats.CATEGORIES; // NEW IMPLEMENTATION — NODE.JS PROJECT: + h2h, winner_takes_all, multiplier

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

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the advertised prize table is built by the same
 * shared builder the app and the payout use once the contest is live (whole numbers, adds up to the pool),
 * stored in the admin's row shape.
 */
function generateDefaultPrizeDistribution(totalWinners, prizePool, category = 'mega') {
  return buildDynamicPrizeDistribution(totalWinners, prizePool, category).map((row) => ({
    label: `Rank ${row.rank_start} to ${row.rank_end}`,
    rank_start: row.rank_start,
    rank_end: row.rank_end,
    winners: row.winners_count,
    per_winner: row.per_winner_amount,
    prize: row.prize_amount,
    percent: row.percentage,
  }));
}

function buildPrizeDistribution(body, category, totalWinners, prizePool) {
  // NEW IMPLEMENTATION — NODE.JS PROJECT: H2H / WTA / Nx — winners share the pool equally
  if (formats.isNewFormat({ category })) return formats.equalSplitRows(totalWinners, prizePool);
  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): mega / equal (flexible pools) — always built on
  // the server, so what admin saves is exactly what the app shows and the payout pays (the table posted by
  // the form is only its preview).
  if (!formats.isFixedPool({ category })) return generateDefaultPrizeDistribution(totalWinners, prizePool, category);
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
  return generateDefaultPrizeDistribution(totalWinners, prizePool);
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
  const newFormat = formats.isNewFormat({ category: body.category });
  let winning = parseFloat(body.winning_percentage);
  // NEW IMPLEMENTATION — NODE.JS PROJECT: H2H / WTA / Nx decide their winners themselves
  if (!newFormat && (!Number.isFinite(winning) || winning < 0 || winning > 100)) errors.push('The winning percentage must be between 0 and 100.');
  let maxEntries = parseInt(body.max_entries_per_user, 10);
  if (body.max_entries_per_user === undefined || body.max_entries_per_user === '' || !Number.isFinite(maxEntries) || maxEntries < 1) {
    errors.push('The max entries per user field is required.');
  }
  // NEW IMPLEMENTATION — NODE.JS PROJECT: type rules (H2H = 2 spots / 1 entry, Nx spots a multiple of N, minimum players)
  const format = formats.validateFormat(body, { participants, maxEntries });
  errors.push(...format.errors);
  const spots = format.participants;
  maxEntries = format.maxEntries;
  if (newFormat && Number.isFinite(spots) && spots > 0) {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Nx winners depend on the platform fee (each winner gets N × entry)
    const contestLike = { category: body.category, multiplier: format.multiplier, entry_fee: entryFee, platform_fee: platformFee };
    winning = Math.round((formats.winnersFor(contestLike, spots) / spots) * 100 * 10000) / 10000;
  }
  return {
    errors, sessionIds, entryFee, participants: spots, platformFee, winning, maxEntries,
    multiplier: format.multiplier, minParticipants: format.minParticipants,
  };
}

function poolFrom(body, fields) {
  const isFixed = formats.isFixedPool({ category: body.category });
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
  const contestLike = { category: body.category, multiplier: fields.multiplier, entry_fee: fields.entryFee, platform_fee: fields.platformFee };
  const totalWinners = formats.isNewFormat({ category: body.category })
    ? formats.winnersFor(contestLike, fields.participants)
    : Math.max(1, Math.floor(fields.participants * (fields.winning / 100)));
  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): Nx — every winner gets exactly N × entry fee;
  // what is not paid out stays with the platform.
  if (!isFixed) {
    const paid = formats.payablePool(contestLike, fields.participants, prizePool);
    if (paid !== prizePool) { platformFeeAmount = totalPool - paid; prizePool = paid; }
  }
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
    // NEW IMPLEMENTATION — NODE.JS PROJECT: create a fresh copy when this contest fills up
    auto_create_on_full: isPinned(body.auto_create_on_full),
    prize_distribution: buildPrizeDistribution(body, body.category, pools.totalWinners, pools.prizePool),
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Fantasy contest formats
    multiplier: fields.multiplier,
    min_participants: fields.minParticipants,
  };
}

// NEW IMPLEMENTATION — NODE.JS PROJECT: data the create/edit forms need for the contest types
async function formViewData() {
  const settings = await contestSettings.getSettings();
  return { platformFees: settings.platform_fee, multipliers: formats.MULTIPLIERS };
}

const contestKeys = (contest) => [contest._id, contest.old_id].filter((k) => k != null);

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
      format_label: formats.labelFor(contest), // NEW IMPLEMENTATION — NODE.JS PROJECT
      total_winners_display: formats.winnersFor(contest, spots),
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
    // NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — working filters.
    //   Live / Upcoming / Completed: the contest's session is in that state (contest not cancelled)
    //   Cancelled: the contest itself was cancelled
    //   Date: the session's start date (IST); Latest/Oldest: by creation date, pinned stay on top.
    // Tab counts cover every matching contest, not just the current page.
    const filters = parseListFilters(req.query, CONTEST_STATUSES);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const sessionKeys = async (sessionStatus) => {
      const match = {};
      if (sessionStatus) match.status = sessionStatus;
      if (filters.range) match.start_time = filters.range;
      const sessions = await LeagueSession.find(match).select('_id old_id').lean();
      return sessions.flatMap((s) => (s.old_id != null ? [s._id, s.old_id] : [s._id]));
    };
    const dateClause = filters.range ? { league_session_id: { $in: await sessionKeys(null) } } : {};
    const filterFor = async (value) => {
      if (value === 'cancelled') return { ...dateClause, status: 'cancelled' };
      if (value) return { status: { $ne: 'cancelled' }, league_session_id: { $in: await sessionKeys(value) } };
      return dateClause;
    };
    const filter = await filterFor(filters.status);
    const dir = filters.sort === 'oldest' ? 1 : -1;
    const [total, rows, ...tabCounts] = await Promise.all([
      Contest.countDocuments(filter),
      Contest.find(filter)
        .sort({ is_pinned: -1, pin_order: 1, created_at: dir, _id: dir })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      Contest.aggregate([
        { $match: filter },
        { $group: { _id: null, pool: { $sum: { $convert: { input: '$prize_pool', to: 'double', onError: 0, onNull: 0 } } } } },
      ]),
      ...['', ...CONTEST_STATUSES].map(async (value) => Contest.countDocuments(await filterFor(value))),
    ]);
    const [poolRow] = tabCounts.shift();
    const counts = { pool: poolRow ? poolRow.pool : 0 };
    ['all', ...CONTEST_STATUSES].forEach((key, i) => { counts[key] = tabCounts[i]; });
    const contests = await attachListMeta(rows);
    await render(res, 'contests/index', {
      title: 'Contest Management',
      contests,
      total,
      pages: Math.ceil(total / PAGE_SIZE),
      page,
      status: filters.status,
      filters,
      counts,
      statusLink: (value) => withStatus(filters, value),
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
      values: {},
      ...(await formViewData()),
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
        values: req.body,
        ...(await formViewData()),
        admin: req.session.admin,
      });
    }
    const pools = poolFrom(req.body, fields);
    const payload = contestPayload(req.body, fields, pools);
    const created = [];
    for (const session of sessions) {
      const contest = await Contest.create({
        ...payload,
        league_session_id: session._id,
        status: 'active',
      });
      // NEW IMPLEMENTATION — NODE.JS PROJECT: numeric public id, so the app's contest APIs (which route
      // numeric ids) find it — without one, the contest detail showed 0 joined / all spots left.
      await ensureOldId(Contest, contest);
      created.push(contest);
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
      // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the saved amount, as the app shows before live (was always 0)
      perWinner: (row) => advertisedPerWinner(row || {}, Number(lean.prize_pool) || 0, formats.isFixedPool(lean)),
      formatLabel: formats.labelFor(lean), // NEW IMPLEMENTATION — NODE.JS PROJECT
      minPlayers: formats.minParticipantsFor(lean),
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
    const locked = await editLock(contest);
    if (locked) {
      req.flash('error', locked);
      return res.redirect('/contests/' + publicId(contest));
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
      joined: await ContestEntry.countDocuments({ contest_id: { $in: contestKeys(contest) } }),
      ...(await formViewData()),
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
    const locked = await editLock(contest);
    if (locked) {
      req.flash('error', locked);
      return res.redirect('/contests/' + publicId(contest));
    }
    const fields = validateFields(req.body, false);
    let session = null;
    if (req.body.league_session_id) {
      const matches = await sessionsByIds([req.body.league_session_id]);
      session = matches[0];
      if (!session) fields.errors.push('The selected session does not exist.');
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: once players have joined, the contest type and
    // multiplier are locked and spots cannot drop below the players already in.
    const joined = await ContestEntry.countDocuments({ contest_id: { $in: contestKeys(contest) } });
    if (joined > 0) {
      if (req.body.category !== contest.category) fields.errors.push(`The contest type cannot be changed after players have joined (${joined} joined).`);
      else if (contest.category === 'multiplier' && fields.multiplier !== contest.multiplier) fields.errors.push('The multiplier cannot be changed after players have joined.');
      if (Number.isFinite(fields.participants) && fields.participants < joined) fields.errors.push(`Total spots cannot be less than the ${joined} players already joined.`);
      // NEW IMPLEMENTATION — NODE.JS PROJECT: players paid this fee for this prize structure in this
      // session, so these are locked too once anyone has joined.
      if (!sameMoney(fields.entryFee, contest.entry_fee)) fields.errors.push(`The entry fee cannot be changed after players have joined (${joined} joined).`);
      if (!sameMoney(fields.platformFee, contest.platform_fee)) fields.errors.push('The platform fee cannot be changed after players have joined.');
      if (!formats.isNewFormat({ category: contest.category }) && !sameMoney(fields.winning, contest.winning_percentage)) fields.errors.push('The winning percentage cannot be changed after players have joined.');
      if (formats.isFixedPool(contest) && req.body.fixed_prize_pool !== undefined && req.body.fixed_prize_pool !== '' && !sameMoney(req.body.fixed_prize_pool, contest.prize_pool)) fields.errors.push('The fixed prize pool cannot be changed after players have joined.');
      if (Number.isFinite(fields.maxEntries) && fields.maxEntries < Number(contest.max_entries_per_user || 1)) fields.errors.push('Max entries per user cannot be lowered after players have joined.');
      if (session && !keysOf(session).map(String).includes(String(contest.league_session_id))) fields.errors.push('The session cannot be changed after players have joined.');
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
        joined,
        ...(await formViewData()),
        admin: req.session.admin,
      });
    }
    const pools = poolFrom(req.body, fields);
    const payload = contestPayload(req.body, fields, pools);
    if (session) payload.league_session_id = session._id;
    // NEW IMPLEMENTATION — NODE.JS PROJECT: a fixed prize table that players joined for stays as it is.
    if (joined > 0 && formats.isFixedPool(contest) && Array.isArray(contest.prize_distribution) && contest.prize_distribution.length) {
      payload.prize_distribution = contest.prize_distribution;
      payload.prize_pool = contest.prize_pool;
    }
    if (joined > 0) payload.league_session_id = contest.league_session_id;
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
    // NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — open contests are refunded before deletion
    let deleted = 0;
    let refunds = 0;
    const failed = [];
    const contests = clauses.length ? await Contest.find({ $or: clauses, status: { $ne: 'live' } }).lean() : [];
    for (const contest of contests) {
      const result = await refundBeforeDelete(contest, { actor: actorOf(req) });
      if (!result.ok) { failed.push(result.message); continue; }
      await Contest.deleteOne({ _id: contest._id });
      deleted += 1;
      refunds += result.refunded;
    }
    req.flash('success', `Deleted ${deleted} contests.` + (refunds ? ` ${refunds} entry fee(s) refunded.` : ''));
    if (failed.length) req.flash('error', `Not deleted: ${failed.join('; ')}`);
    res.redirect('/contests');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/contests');
  }
};

// PHP PARITY — Contests → Cancel: refunds every entry fee and marks the contest cancelled.
// Logic lives in services/contest-cancellation.service.js (shared with session cancel).
const cancel = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await cancelContestService(contest, { reason: `admin ${req.adminAccess ? req.adminAccess.email : ''}`.trim() });
    return res.status(result.success ? 200 : (result.already ? 400 : 409)).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const togglePin = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    if (!contest) return res.status(404).json({ success: false, message: 'Not found' });
    // Atomic update instead of save(): works for migrated contests that fail full validation.
    const isPinnedNow = !contest.is_pinned;
    await Contest.updateOne({ _id: contest._id }, { $set: { is_pinned: isPinnedNow, pin_order: isPinnedNow ? phpInt(req.body.pin_order, 0) : 0 } });
    return res.json({
      success: true,
      is_pinned: isPinnedNow,
      message: isPinnedNow ? 'Contest pinned to top.' : 'Contest unpinned.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const destroy = async (req, res) => {
  try {
    const contest = await findContest(req.params.id);
    let refunded = 0;
    if (contest) {
      // NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — refund an open contest before deleting it
      const result = await refundBeforeDelete(contest.toObject ? contest.toObject() : contest, { actor: actorOf(req) });
      if (!result.ok) { req.flash('error', `Contest not deleted: ${result.message}`); return res.redirect('/contests'); }
      refunded = result.refunded;
      await Contest.deleteOne({ _id: contest._id });
    }
    req.flash('success', 'Contest deleted!' + (refunded ? ` ${refunded} entry fee(s) refunded.` : ''));
    res.redirect('/contests');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/contests');
  }
};

const actorOf = (req) => (req.adminAccess && req.adminAccess.email) || 'admin';

module.exports = { index, create, store, show, edit, update, destroy, bulkDelete, cancel, togglePin, buildPrizeDistribution };
