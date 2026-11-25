'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: League Contests (client feedback) — read-only, league-wise contest details for the admin:
 *          leagues → contests of a league (or of all leagues) → players of a contest.
 *
 *   - Contests, entries and transactions may point to a document by ObjectId, its string, or the legacy
 *     numeric id; everything here matches all of them.
 *   - Bots (users with is_test_user) are counted separately and never included in collection, prizes paid,
 *     refunds or platform earning.
 *   - Prizes and refunds are what was actually credited (successful transactions), not estimates.
 *   - "Current" prizes use cardPrize(), the same calculation the app shows and the payout pays.
 */

const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const LeagueSession = require('../models/league-session.model');
const SavedBasket = require('../models/saved-basket.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const formats = require('./contest-formats');
const markets = require('./markets');
const { cardPrize } = require('./contest-automation/contest-scoring');
const { docsByIds } = require('./admin-user-profile.service');
const { istDay, csvCell, istDateTime } = require('./admin-user-export.service');
const { num, round2, publicId, scoreAssets, asPrizeArray } = require('../helpers/mobile-compat');

const PAGE_SIZES = [20, 50, 100];
const EXPORT_BATCH = 200;

const STATES = {
  upcoming: 'Upcoming',
  live: 'Live',
  result_pending: 'Result pending',
  paid: 'Prizes paid',
  cancelled: 'Cancelled',
  ended: 'Ended without players',
};
const SESSION_STATUSES = { upcoming: 'Upcoming', live: 'Live', completed: 'Completed', cancelled: 'Cancelled', draft: 'Draft' };
const TYPES = {
  mega: 'Mega',
  equal: 'Equal',
  h2h: 'Head to Head',
  winner_takes_all: 'Winner Takes All',
  ...Object.fromEntries(formats.MULTIPLIERS.map((n) => [`x${n}`, `${n}x`])),
  guaranteed: 'Guaranteed',
  practice: 'Practice',
};
const FILLS = { empty: 'Empty (0 joined)', filling: 'Filling', full: 'Full' };
const WARNINGS = { below_min: 'Below minimum players' };
const CONTEST_SORTS = { newest: 'Newest first', oldest: 'Oldest first', joined: 'Most joined', fill: 'Most filled (%)', fee_high: 'Entry fee: high to low', fee_low: 'Entry fee: low to high', pool: 'Biggest prize pool' };
const SESSION_SORTS = { newest: 'Latest start first', oldest: 'Earliest start first', joined: 'Most entries', contests: 'Most contests' };
const KINDS = { real: 'Real players', bot: 'Bots' };
const RESULTS = { won: 'Prize paid', none: 'No prize', refunded: 'Refunded' };
const PLAYER_SORTS = { rank: 'Rank', newest: 'Joined: latest first', oldest: 'Joined: earliest first', score: 'Highest score', prize: 'Highest prize', name: 'Name' };
const MARKETS = Object.fromEntries(Object.keys(markets.ALL_MARKETS).map((k) => [k, markets.labelOf(k)]));

// ── Ids ─────────────────────────────────────────────────────────────────────

/** Every value another document may hold for this one. */
const idsOf = (d) => [d._id, String(d._id), ...(d.old_id != null ? [d.old_id, String(d.old_id)] : [])];
/** String(any id) → the document, for a list of documents. */
function indexOf(docs) {
  const map = new Map();
  docs.forEach((d) => { map.set(String(d._id), d); if (d.old_id != null) map.set(String(d.old_id), d); });
  return map;
}
const idOf = (d) => (d.old_id != null ? d.old_id : String(d._id));

async function findById(Model, id, select) {
  const text = String(id == null ? '' : id).trim();
  const find = (filter) => { const q = Model.findOne(filter); return (select ? q.select(select) : q).lean(); };
  if (/^[0-9a-f]{24}$/i.test(text)) return find({ _id: text });
  if (/^\d{1,15}$/.test(text)) return find({ old_id: Number(text) });
  return null;
}

// ── Filters ─────────────────────────────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const pick = (query, name, allowed) => (own(allowed, str(query[name])) ? str(query[name]) : '');
const day = (query, name) => (istDay(str(query[name])) ? str(query[name]) : '');
function days(f) { if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from]; return f; }
const amount = (query, name) => { const t = str(query[name]); return /^\d{1,9}(\.\d{1,2})?$/.test(t) ? t : ''; };
const perPage = (query) => (PAGE_SIZES.includes(Number(query.per_page)) ? Number(query.per_page) : PAGE_SIZES[0]);
const inRange = (value, f) => {
  if (!f.from && !f.to) return true;
  const t = value ? new Date(value).getTime() : NaN;
  if (Number.isNaN(t)) return false;
  return (!f.from || t >= istDay(f.from, false).getTime()) && (!f.to || t <= istDay(f.to, true).getTime());
};

const sessionFilters = (q = {}) => days({
  status: pick(q, 'status', SESSION_STATUSES),
  search: str(q.search).slice(0, 100),
  market: pick(q, 'market', MARKETS),
  from: day(q, 'from'),
  to: day(q, 'to'),
  sort: pick(q, 'sort', SESSION_SORTS) || 'newest',
  per_page: perPage(q),
});
const contestFilters = (q = {}) => days({
  session: /^(\d{1,15}|[0-9a-f]{24})$/i.test(str(q.session)) ? str(q.session) : '',
  state: pick(q, 'state', STATES),
  search: str(q.search).slice(0, 100),
  type: pick(q, 'type', TYPES),
  fee_min: amount(q, 'fee_min'),
  fee_max: amount(q, 'fee_max'),
  fill: pick(q, 'fill', FILLS),
  warning: pick(q, 'warning', WARNINGS),
  from: day(q, 'from'),
  to: day(q, 'to'),
  sort: pick(q, 'sort', CONTEST_SORTS) || 'newest',
  per_page: perPage(q),
});
const playerFilters = (q = {}) => days({
  search: str(q.search).slice(0, 100),
  kind: pick(q, 'kind', KINDS),
  result: pick(q, 'result', RESULTS),
  from: day(q, 'from'),
  to: day(q, 'to'),
  sort: pick(q, 'sort', PLAYER_SORTS) || 'rank',
  per_page: perPage(q),
});

/** Query string of the filters; `changes` override them. Empty values are left out. */
function queryString(filters, changes = {}) {
  const params = new URLSearchParams();
  Object.entries({ ...filters, ...changes }).forEach(([k, v]) => {
    if (v === '' || v == null || (k === 'per_page' && v === PAGE_SIZES[0])) return;
    params.set(k, String(v));
  });
  return params.toString();
}

function paginate(rows, query, size) {
  const pages = Math.max(Math.ceil(rows.length / size), 1);
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), pages);
  return { page, pages, total: rows.length, slice: rows.slice((page - 1) * size, page * size) };
}

// ── Loading ─────────────────────────────────────────────────────────────────

const SESSION_FIELDS = 'old_id name market market_type status active start_time end_time user_joining_start_time created_at';
const CONTEST_FIELDS = 'old_id name league_session_id category multiplier min_participants status participants max_entries_per_user entry_fee platform_fee winning_percentage prize_pool fixed_prize_pool is_fixed_prize is_pinned is_calculated prizes_distributed prize_distribution created_at';

const sessionStatus = (s) => (s.status === 'completing' ? 'completed' : s.status || 'upcoming');
const allSessions = () => LeagueSession.find({}).select(SESSION_FIELDS).lean();
const marketOf = (s) => s.market || (s.market_type === 'crypto' ? 'crypto' : '');
const marketLabel = (s) => markets.labelOf(s.market) || (s.market_type ? s.market_type.charAt(0).toUpperCase() + s.market_type.slice(1) : '');

/** Entries per contest: Map(String(contest._id) → count). */
async function joinedCounts(contests) {
  const index = indexOf(contests);
  const counts = new Map();
  if (!contests.length) return counts;
  const rows = await ContestEntry.aggregate([
    { $match: { contest_id: { $in: contests.flatMap(idsOf) } } },
    { $group: { _id: '$contest_id', n: { $sum: 1 } } },
  ]);
  rows.forEach((r) => {
    const c = index.get(String(r._id));
    if (c) counts.set(String(c._id), (counts.get(String(c._id)) || 0) + r.n);
  });
  return counts;
}

/** Older prize / refund transactions have no contest_id; the contest and entry are in the transaction id. */
const TXN = /^(?:MP|CONTEST|PRIZE|REFUND)_([0-9a-f]{24}|\d+)_(?:ENTRY_|E)?([0-9a-f]{24}|\d+)/i;

/**
 * Credited winnings or refunds of the contests.
 * @returns {Promise<Array<{ contest:object, user_id, amount:number, entry:string }>>}
 */
async function credits(contests, kind) {
  if (!contests.length) return [];
  const index = indexOf(contests);
  const prefixes = kind === 'winnings' ? ['MP', 'CONTEST', 'PRIZE'] : ['REFUND'];
  // Few contests: one exact prefix each (uses the transaction_id index). Many: every such transaction.
  const patterns = contests.length <= 100
    ? contests.flatMap((c) => [...new Set([String(c._id), String(idOf(c))])].flatMap((id) => prefixes.map((p) => new RegExp(`^${p}_${id}_`))))
    : prefixes.map((p) => new RegExp(`^${p}_`));
  const rows = await Transaction.find({
    status: 'success',
    amount: { $gt: 0 },
    type: kind === 'winnings' ? 'winnings' : { $in: ['refund', 'deposit'] }, // older refunds were saved as deposits
    $or: [{ contest_id: { $in: contests.flatMap(idsOf) } }, { contest_id: null, transaction_id: { $in: patterns } }],
  }).select('contest_id user_id amount type transaction_id').lean();
  return rows.map((t) => {
    const m = TXN.exec(t.transaction_id || '');
    const contest = index.get(String(t.contest_id != null ? t.contest_id : (m && m[1])));
    if (!contest) return null;
    if (kind === 'refund' && t.type === 'deposit' && !/^REFUND_/.test(t.transaction_id || '')) return null;
    return { contest, user_id: t.user_id, amount: num(t.amount), entry: m ? m[2] : '' };
  }).filter(Boolean);
}

// ── State ───────────────────────────────────────────────────────────────────

/** Upcoming / Live / Result pending / Prizes paid / Cancelled / Ended, from the contest, its league and payments. */
function stateOf(contest, session, joined, paid) {
  if (contest.status === 'cancelled') return 'cancelled';
  if (contest.prizes_distributed || paid) return 'paid';
  const status = session ? session.status : contest.status;
  if (status === 'live') return 'live';
  if (status === 'completed' || status === 'completing') return joined > 0 ? 'result_pending' : 'ended';
  if (status === 'cancelled') return 'cancelled';
  return 'upcoming';
}

function typeOf(contest) {
  const format = formats.formatOf(contest);
  return format === 'multiplier' ? `x${formats.multiplierOf(contest) || 2}` : format;
}

/** The contest's facts that need only the joined count (cheap: used for filtering every contest). */
function lightRow(contest, session, joined, paid) {
  const spots = parseInt(contest.participants, 10) || 0;
  const state = stateOf(contest, session, joined, paid);
  const minimum = formats.minParticipantsFor(contest);
  const open = state === 'upcoming' || state === 'live';
  return {
    contest,
    session,
    id: idOf(contest),
    type: typeOf(contest),
    type_label: formats.labelFor(contest),
    state,
    joined,
    spots,
    spots_left: Math.max(0, spots - joined),
    fill: spots > 0 ? Math.min(100, (joined / spots) * 100) : 0,
    minimum,
    needs: open ? Math.max(0, minimum - joined) : 0,
  };
}

/** Rows for every contest matching `match`, newest data first loaded. */
async function lightRows(match, sessions) {
  const contests = await Contest.find(match).select(CONTEST_FIELDS).lean();
  const bySession = indexOf(sessions);
  const sessionOf = (c) => (c.league_session_id != null ? bySession.get(String(c.league_session_id)) || null : null);
  const unsure = contests.filter((c) => { // ended, but not marked as paid (e.g. paid by the old system)
    const s = sessionOf(c);
    return !c.prizes_distributed && c.status !== 'cancelled' && ['completed', 'completing'].includes(s ? s.status : c.status);
  });
  const [counts, paid] = await Promise.all([joinedCounts(contests), credits(unsure, 'winnings')]);
  const paidIds = new Set(paid.map((p) => String(p.contest._id)));
  return contests.map((c) => lightRow(c, sessionOf(c), counts.get(String(c._id)) || 0, paidIds.has(String(c._id))));
}

// ── Money and players ───────────────────────────────────────────────────────

const emptyStats = () => ({ entries: 0, real_entries: 0, bot_entries: 0, players: new Set(), bots: new Set(), collection: 0, prizes_paid: 0, bot_prizes: 0, winners_paid: 0, refunded: 0 });

/** Map(String(contest._id) → players, bots, collection, prizes and refunds). */
async function statsFor(rows) {
  const contests = rows.map((r) => r.contest);
  const stats = new Map(contests.map((c) => [String(c._id), emptyStats()]));
  if (!contests.length) return stats;
  const index = indexOf(contests);
  const missing = (field) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] });
  const [groups, prizes, refunds] = await Promise.all([
    ContestEntry.aggregate([
      { $match: { contest_id: { $in: contests.flatMap(idsOf) } } },
      {
        $group: {
          _id: { c: '$contest_id', u: '$user_id' },
          n: { $sum: 1 },
          recorded: { $sum: { $add: [{ $ifNull: ['$fee_from_winnings', 0] }, { $ifNull: ['$fee_from_deposit', 0] }] } },
          unrecorded: { $sum: { $cond: [{ $and: [missing('fee_from_winnings'), missing('fee_from_deposit')] }, 1, 0] } },
        },
      },
    ]),
    credits(rows.filter((r) => r.state === 'paid').map((r) => r.contest), 'winnings'),
    credits(rows.filter((r) => r.state === 'cancelled').map((r) => r.contest), 'refund'),
  ]);
  const users = await docsByIds(User, [...groups.map((g) => g._id.u), ...prizes.map((p) => p.user_id), ...refunds.map((r) => r.user_id)], 'is_test_user');
  const isBot = (ref) => Boolean((users.get(String(ref)) || {}).is_test_user);
  const userKey = (ref) => { const u = users.get(String(ref)); return u ? String(u._id) : String(ref); };

  groups.forEach((g) => {
    const contest = index.get(String(g._id.c));
    if (!contest) return;
    const s = stats.get(String(contest._id));
    s.entries += g.n;
    if (isBot(g._id.u)) {
      s.bot_entries += g.n;
      s.bots.add(userKey(g._id.u));
    } else {
      s.real_entries += g.n;
      s.players.add(userKey(g._id.u));
      s.collection += num(g.recorded) + g.unrecorded * num(contest.entry_fee);
    }
  });
  prizes.forEach((p) => {
    const s = stats.get(String(p.contest._id));
    if (isBot(p.user_id)) s.bot_prizes += p.amount;
    else { s.prizes_paid += p.amount; s.winners_paid += 1; }
  });
  refunds.forEach((r) => { if (!isBot(r.user_id)) stats.get(String(r.contest._id)).refunded += r.amount; });
  stats.forEach((s) => ['collection', 'prizes_paid', 'bot_prizes', 'refunded'].forEach((k) => { s[k] = round2(s[k]); }));
  return stats;
}

/** Paid ranks: the saved table for fixed prizes, otherwise the format's rule. */
function winnersOf(row) {
  const c = row.contest;
  if (formats.isFixedPool(c)) {
    const ranks = asPrizeArray(c.prize_distribution).map((r) => parseInt(r.rank_end || r.rank_start, 10) || 0);
    if (ranks.length) return Math.max(...ranks);
  }
  return formats.winnersFor(c, row.state === 'upcoming' ? row.spots : row.joined);
}

const SETTLED = ['paid', 'cancelled'];
/** Everything a contest row shows. */
function fullRow(row, s) {
  const settled = SETTLED.includes(row.state);
  const status = row.state === 'upcoming' ? 'upcoming' : row.state === 'live' ? 'live' : 'completed';
  const prize = row.state === 'cancelled' ? null : cardPrize(row.contest, status, row.joined);
  return {
    ...row,
    entry_fee: num(row.contest.entry_fee),
    platform_fee: formats.platformFeePct(row.contest),
    advertised_pool: round2(row.contest.prize_pool),
    current_pool: prize ? prize.prize_pool : null,
    first_prize: prize ? prize.first_prize : null,
    winners: row.state === 'cancelled' ? null : winnersOf(row),
    players: s.players.size,
    bots: s.bots.size,
    real_entries: s.real_entries,
    bot_entries: s.bot_entries,
    collection: s.collection,
    prizes_paid: s.prizes_paid,
    bot_prizes: s.bot_prizes,
    refunded: s.refunded,
    // Known only once the prizes are paid or the fees are refunded.
    earning: settled ? round2(s.collection - s.prizes_paid - s.refunded) : null,
  };
}

/** Totals over contest rows. */
function totalsOf(rows, stats) {
  const players = new Set();
  const bots = new Set();
  const t = { contests: rows.length, states: {}, entries: 0, real_entries: 0, bot_entries: 0, spots: 0, spots_joined: 0, collection: 0, prize_pool: 0, prizes_paid: 0, bot_prizes: 0, refunded: 0, earning: 0, settled: 0, unsettled: 0, below_min: 0 };
  Object.keys(STATES).forEach((k) => { t.states[k] = 0; });
  rows.forEach((row) => {
    const s = stats.get(String(row.contest._id));
    s.players.forEach((p) => players.add(p));
    s.bots.forEach((b) => bots.add(b));
    t.states[row.state] += 1;
    ['entries', 'real_entries', 'bot_entries', 'collection', 'prizes_paid', 'bot_prizes', 'refunded'].forEach((k) => { t[k] += s[k]; });
    if (row.state !== 'cancelled') {
      t.spots += row.spots;
      t.spots_joined += row.joined;
      t.prize_pool += fullRow(row, s).current_pool;
    }
    if (SETTLED.includes(row.state)) { t.earning += s.collection - s.prizes_paid - s.refunded; t.settled += 1; }
    else if (row.joined > 0) t.unsettled += 1;
    if (row.needs > 0) t.below_min += 1;
  });
  ['collection', 'prize_pool', 'prizes_paid', 'bot_prizes', 'refunded', 'earning'].forEach((k) => { t[k] = round2(t[k]); });
  if (!t.settled) t.earning = null; // nothing paid or refunded yet
  return { ...t, players: players.size, bots: bots.size };
}

// ── Level 1: leagues ────────────────────────────────────────────────────────

const byTime = (a, b) => (new Date(a || 0).getTime() || 0) - (new Date(b || 0).getTime() || 0);

async function sessionRows(f) {
  const sessions = await allSessions();
  const needle = f.search.toLowerCase();
  const matching = sessions.filter((s) => (!needle || String(s.name || '').toLowerCase().includes(needle) || String(idOf(s)) === f.search.replace(/^#/, '') || String(s._id) === f.search)
    && (!f.market || marketOf(s) === f.market)
    && inRange(s.start_time, f));
  const counts = { '': matching.length };
  Object.keys(SESSION_STATUSES).forEach((k) => { counts[k] = matching.filter((s) => sessionStatus(s) === k).length; });
  const list = f.status ? matching.filter((s) => sessionStatus(s) === f.status) : matching;

  const bySession = new Map(list.map((s) => [String(s._id), []]));
  const light = list.length ? await lightRows({ league_session_id: { $in: list.flatMap(idsOf) } }, list) : [];
  light.forEach((r) => { if (r.session) bySession.get(String(r.session._id)).push(r); });
  const rows = list.map((s) => {
    const contests = bySession.get(String(s._id));
    return { session: s, id: idOf(s), status: sessionStatus(s), market: marketLabel(s), contests, joined: contests.reduce((n, r) => n + r.joined, 0) };
  });
  const newest = (a, b) => byTime(b.session.start_time, a.session.start_time) || String(b.session._id).localeCompare(String(a.session._id));
  rows.sort({
    newest,
    oldest: (a, b) => -newest(a, b),
    joined: (a, b) => b.joined - a.joined || newest(a, b),
    contests: (a, b) => b.contests.length - a.contests.length || newest(a, b),
  }[f.sort]);
  return { rows, counts };
}

async function withTotals(rows) {
  const stats = await statsFor(rows.flatMap((r) => r.contests));
  return rows.map((r) => ({ ...r, totals: totalsOf(r.contests, stats) }));
}

async function listSessions(query) {
  const f = sessionFilters(query);
  const { rows, counts } = await sessionRows(f);
  const { slice, ...paging } = paginate(rows, query, f.per_page);
  return { filters: f, counts, rows: await withTotals(slice), ...paging };
}

// ── Level 2: contests ───────────────────────────────────────────────────────

async function contestRows(f) {
  const sessions = await allSessions();
  const session = f.session ? indexOf(sessions).get(f.session.toLowerCase()) || null : null;
  if (f.session && !session) return { sessions, session: null, notFound: true, all: [], matching: [], rows: [], counts: {} };
  const all = await lightRows(session ? { league_session_id: { $in: idsOf(session) } } : {}, sessions);
  const needle = f.search.replace(/^#/, '').toLowerCase();
  const matching = all.filter((r) => (!needle || String(r.id) === needle || String(r.contest._id) === needle || String(r.contest.name || '').toLowerCase().includes(needle))
    && (!f.type || r.type === f.type)
    && (f.fee_min === '' || num(r.contest.entry_fee) >= Number(f.fee_min))
    && (f.fee_max === '' || num(r.contest.entry_fee) <= Number(f.fee_max))
    && (!f.fill || f.fill === (r.joined === 0 ? 'empty' : r.spots > 0 && r.joined >= r.spots ? 'full' : 'filling'))
    && (!f.warning || r.needs > 0)
    && (session || inRange(r.session && r.session.start_time, f)));
  const counts = { '': matching.length };
  Object.keys(STATES).forEach((k) => { counts[k] = matching.filter((r) => r.state === k).length; });
  const rows = f.state ? matching.filter((r) => r.state === f.state) : [...matching];
  const newest = (a, b) => byTime(b.contest.created_at, a.contest.created_at) || String(b.contest._id).localeCompare(String(a.contest._id));
  const fee = (r) => num(r.contest.entry_fee);
  rows.sort({
    newest,
    oldest: (a, b) => -newest(a, b),
    joined: (a, b) => b.joined - a.joined || newest(a, b),
    fill: (a, b) => b.fill - a.fill || newest(a, b),
    fee_high: (a, b) => fee(b) - fee(a) || newest(a, b),
    fee_low: (a, b) => fee(a) - fee(b) || newest(a, b),
    pool: (a, b) => num(b.contest.prize_pool) - num(a.contest.prize_pool) || newest(a, b),
  }[f.sort]);
  return { sessions, session, all, matching, rows, counts };
}

async function listContests(query) {
  const f = contestFilters(query);
  const { sessions, session, notFound, all, rows, counts } = await contestRows(f);
  const { slice, ...paging } = paginate(rows, query, f.per_page);
  // The summary covers the whole selected league, whatever the other filters.
  const stats = await statsFor(session ? all : slice);
  return {
    filters: f,
    counts,
    session,
    notFound: Boolean(notFound),
    summary: session ? totalsOf(all, stats) : null,
    rows: slice.map((r) => fullRow(r, stats.get(String(r.contest._id)))),
    sessions: [...sessions].sort((a, b) => byTime(b.start_time, a.start_time)),
    ...paging,
  };
}

// ── Level 3: players ────────────────────────────────────────────────────────

async function contestWithRows(id, f) {
  const contest = await findById(Contest, id, CONTEST_FIELDS);
  if (!contest) return null;
  const session = contest.league_session_id != null ? await findById(LeagueSession, contest.league_session_id, SESSION_FIELDS) : null;
  const [light] = await lightRows({ _id: contest._id }, session ? [session] : []);
  if (!light) return null;
  const [stats, entries, prizes, refunds] = await Promise.all([
    statsFor([light]),
    ContestEntry.find({ contest_id: { $in: idsOf(contest) } }).select('old_id user_id basket_id total_score rank fee_from_winnings fee_from_deposit created_at').lean(),
    light.state === 'paid' ? credits([contest], 'winnings') : [],
    light.state === 'cancelled' ? credits([contest], 'refund') : [],
  ]);
  const users = await docsByIds(User, entries.map((e) => e.user_id), 'name mobile email is_test_user');

  // Money per entry: by the entry in the transaction id; otherwise one of the player's entries, best rank first.
  const personOf = (ref) => { const u = users.get(String(ref)); return u ? String(u._id) : String(ref); };
  const assign = (list) => {
    const byEntry = indexOf(entries);
    const out = new Map();
    const rest = [];
    const add = (e, n) => out.set(String(e._id), round2((out.get(String(e._id)) || 0) + n));
    list.forEach((c) => { const e = byEntry.get(c.entry); if (e && personOf(e.user_id) === personOf(c.user_id)) add(e, c.amount); else rest.push(c); });
    const ranked = [...entries].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
    rest.forEach((c) => {
      const mine = ranked.filter((e) => personOf(e.user_id) === personOf(c.user_id));
      const e = mine.find((x) => !out.has(String(x._id))) || mine[0];
      if (e) add(e, c.amount);
    });
    return out;
  };
  const prizeOf = assign(prizes);
  const refundOf = assign(refunds);
  const started = light.state !== 'upcoming';

  const everyone = entries.map((e) => {
    const user = users.get(String(e.user_id)) || null;
    const recorded = e.fee_from_winnings != null || e.fee_from_deposit != null;
    return {
      entry: e,
      entry_id: idOf(e),
      user,
      is_bot: Boolean(user && user.is_test_user),
      joined_at: e.created_at || null,
      fee: recorded ? round2(num(e.fee_from_winnings) + num(e.fee_from_deposit)) : num(contest.entry_fee),
      fee_recorded: recorded,
      fee_from_winnings: recorded ? round2(e.fee_from_winnings) : null,
      fee_from_deposit: recorded ? round2(e.fee_from_deposit) : null,
      score: started ? round2(e.total_score) : null,
      rank: started && e.rank > 0 ? e.rank : null,
      prize: prizeOf.get(String(e._id)) || 0,
      refund: refundOf.get(String(e._id)) || 0,
    };
  });
  const needle = f.search.toLowerCase();
  const found = (u) => u && [u.name, u.mobile, u.email].some((v) => String(v || '').toLowerCase().includes(needle));
  const isId = (u) => u && (String(idOf(u)) === needle.replace(/^#/, '') || String(u._id) === needle);
  const rows = everyone.filter((r) => (!needle || found(r.user) || isId(r.user) || String(r.entry_id) === needle.replace(/^#/, ''))
    && (!f.kind || (f.kind === 'bot') === r.is_bot)
    && (!f.result || { won: r.prize > 0, refunded: r.refund > 0, none: !(r.prize > 0) && !(r.refund > 0) }[f.result])
    && inRange(r.joined_at, f));
  const earliest = (a, b) => byTime(a.joined_at, b.joined_at) || String(a.entry._id).localeCompare(String(b.entry._id));
  rows.sort({
    rank: (a, b) => ((a.rank || Infinity) === (b.rank || Infinity) ? 0 : (a.rank || Infinity) - (b.rank || Infinity)) || earliest(a, b),
    newest: (a, b) => -earliest(a, b),
    oldest: earliest,
    score: (a, b) => num(b.score) - num(a.score) || earliest(a, b),
    prize: (a, b) => b.prize - a.prize || earliest(a, b),
    name: (a, b) => String((a.user && a.user.name) || '').localeCompare(String((b.user && b.user.name) || '')) || earliest(a, b),
  }[f.sort]);
  return { row: fullRow(light, stats.get(String(contest._id))), session, rows, everyone: everyone.length };
}

/** Adds the basket's name and picks ("INFY ↑ 2x"). */
async function withBaskets(rows) {
  const baskets = await docsByIds(SavedBasket, rows.map((r) => r.entry.basket_id), 'serial_no assets multipliers');
  return rows.map((r) => {
    const b = baskets.get(String(r.entry.basket_id));
    const picks = b ? scoreAssets(b.assets, b.multipliers, { start: {}, end: {}, started: false }).rows : [];
    return {
      ...r,
      basket: b ? b.serial_no || `#${idOf(b)}` : null,
      picks: picks.map((p) => `${p.symbol || p.name || '?'} ${p.prediction === 'DOWN' ? '↓' : '↑'}${p.multiplier !== 1 ? ` ${p.multiplier}x` : ''}`),
    };
  });
}

async function contestPlayers(id, query) {
  const f = playerFilters(query);
  const data = await contestWithRows(id, f);
  if (!data) return null;
  const { slice, ...paging } = paginate(data.rows, query, f.per_page);
  return { filters: f, row: data.row, session: data.session, everyone: data.everyone, rows: await withBaskets(slice), ...paging };
}

// ── Export ──────────────────────────────────────────────────────────────────

const line = (cells) => `${cells.map(csvCell).join(',')}\r\n`;
const BOM = '﻿';
const pct = (n) => Math.round(n * 10) / 10;

async function inBatches(rows, fn) {
  for (let i = 0; i < rows.length; i += EXPORT_BATCH) await fn(rows.slice(i, i + EXPORT_BATCH)); // eslint-disable-line no-await-in-loop
  return rows.length;
}

async function exportSessions(query, write) {
  const { rows } = await sessionRows(sessionFilters(query));
  write(BOM + line(['League ID', 'League', 'Market', 'Status', 'Starts (IST)', 'Ends (IST)', 'Contests', 'Upcoming', 'Live', 'Result pending', 'Prizes paid', 'Cancelled', 'Entries', 'Player entries', 'Bot entries', 'Unique players', 'Spots joined', 'Total spots', 'Collection', 'Prizes paid to players', 'Refunded', 'Platform earning (settled)', 'Contests not settled']));
  return inBatches(rows, async (batch) => {
    (await withTotals(batch)).forEach(({ session: s, totals: t, ...r }) => write(line([
      r.id, s.name, r.market, r.status, istDateTime(s.start_time), istDateTime(s.end_time), t.contests, t.states.upcoming, t.states.live, t.states.result_pending, t.states.paid, t.states.cancelled,
      t.entries, t.real_entries, t.bot_entries, t.players, t.spots_joined, t.spots, t.collection, t.prizes_paid, t.refunded, t.earning, t.unsettled,
    ])));
  });
}

async function exportContests(query, write) {
  const { rows } = await contestRows(contestFilters(query));
  write(BOM + line(['Contest ID', 'League ID', 'League', 'League starts (IST)', 'Type', 'Status', 'Entry fee', 'Platform fee %', 'Joined', 'Total spots', 'Filled %', 'Spots left', 'Unique players', 'Player entries', 'Bot entries', 'Minimum players', 'Players needed', 'Collection', 'Advertised prize pool', 'Current prize pool', 'First prize', 'Winners', 'Prizes paid to players', 'Prizes to bots', 'Refunded', 'Platform earning', 'Created (IST)']));
  return inBatches(rows, async (batch) => {
    const stats = await statsFor(batch);
    batch.map((r) => fullRow(r, stats.get(String(r.contest._id)))).forEach((r) => write(line([
      r.id, r.session ? idOf(r.session) : '', r.session ? r.session.name : '', r.session ? istDateTime(r.session.start_time) : '', r.type_label, STATES[r.state], r.entry_fee, r.platform_fee,
      r.joined, r.spots, pct(r.fill), r.spots_left, r.players, r.real_entries, r.bot_entries, r.minimum, r.needs, r.collection, r.advertised_pool, r.current_pool, r.first_prize, r.winners,
      r.prizes_paid, r.bot_prizes, r.refunded, r.earning, istDateTime(r.contest.created_at),
    ])));
  });
}

async function exportPlayers(id, query, write) {
  const data = await contestWithRows(id, playerFilters(query));
  if (!data) return null;
  write(BOM + line(['Contest ID', 'League', 'Entry ID', 'Player ID', 'Name', 'Mobile', 'Player / Bot', 'Basket', 'Picks', 'Joined (IST)', 'Fee', 'From deposit', 'From winnings', 'Score', 'Rank', 'Prize paid', 'Refunded']));
  return inBatches(data.rows, async (batch) => {
    (await withBaskets(batch)).forEach((r) => write(line([
      data.row.id, data.session ? data.session.name : '', r.entry_id, r.user ? idOf(r.user) : String(r.entry.user_id), r.user ? r.user.name : 'Player not found', r.user ? r.user.mobile : '',
      r.is_bot ? 'Bot' : 'Player', r.basket, r.picks.join('; '), istDateTime(r.joined_at), r.fee, r.fee_from_deposit, r.fee_from_winnings, r.score, r.rank, r.prize, r.refund,
    ])));
  });
}

module.exports = {
  STATES, SESSION_STATUSES, TYPES, FILLS, WARNINGS, CONTEST_SORTS, SESSION_SORTS, KINDS, RESULTS, PLAYER_SORTS, MARKETS, PAGE_SIZES,
  listSessions, listContests, contestPlayers, exportSessions, exportContests, exportPlayers,
  findContest: (id) => findById(Contest, id, '_id old_id'),
  queryString, stateOf, idOf, publicId,
};
