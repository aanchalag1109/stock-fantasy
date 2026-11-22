'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Fantasy Contest Formats (H2H, Winner Takes All, 2x–10x) and safe joining.
 * Unit tests for services/contest-formats.js and services/contest-join.service.js,
 * the join flow running against an in-memory store (no database needed).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const logger = require('../../src/config/logger');
const formats = require('../../src/services/contest-formats');
const { buildDynamicPrizeDistribution } = require('../../src/helpers/mobile-compat');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── Formats ─────────────────────────────────────────────────────────────────

describe('contest formats', () => {
  test('winners per type', () => {
    assert.equal(formats.winnersFor({ category: 'h2h' }, 2), 1);
    assert.equal(formats.winnersFor({ category: 'winner_takes_all' }, 37), 1);
    assert.equal(formats.winnersFor({ category: 'multiplier', multiplier: 4 }, 20), 5);
    assert.equal(formats.winnersFor({ category: 'multiplier', multiplier: 4 }, 9), 2);
    assert.equal(formats.winnersFor({ category: 'multiplier', multiplier: 3 }, 9), 3, 'no floating-point rounding down');
    assert.equal(formats.winnersFor({ category: 'multiplier', multiplier: 4 }, 3), 0);
    assert.equal(formats.winnersFor({ category: 'mega', winning_percentage: 30 }, 10), 3, 'existing rule unchanged');
    assert.equal(formats.winnersFor({ category: 'mega' }, 10, 50), 5, 'fallback % when unset');
    assert.equal(formats.winnersFor({ category: 'mega', winning_percentage: 30 }, 0), 0);
  });

  test('minimum players: legacy 10, format floors, admin value never below the floor', () => {
    assert.equal(formats.minParticipantsFor({ category: 'mega' }), 10);
    assert.equal(formats.minParticipantsFor({ category: 'guaranteed' }), 10);
    assert.equal(formats.minParticipantsFor({ category: 'mega', min_participants: 3 }), 3);
    assert.equal(formats.minParticipantsFor({ category: 'h2h' }), 2);
    assert.equal(formats.minParticipantsFor({ category: 'winner_takes_all' }), 2);
    assert.equal(formats.minParticipantsFor({ category: 'multiplier', multiplier: 8 }), 8);
    assert.equal(formats.minParticipantsFor({ category: 'multiplier', multiplier: 4, min_participants: 2 }), 4);
    assert.equal(formats.minParticipantsFor({ category: 'winner_takes_all', min_participants: 5 }), 5);
  });

  test('labels, badges and fixed pools', () => {
    assert.equal(formats.labelFor({ category: 'multiplier', multiplier: 8 }), '8x');
    assert.equal(formats.labelFor({ category: 'h2h' }), 'Head to Head');
    assert.equal(formats.appBadge({ category: 'h2h' }), 'H2H');
    assert.equal(formats.appBadge({ category: 'h2h', is_pinned: true }), 'Featured');
    assert.equal(formats.appBadge({ category: 'mega' }), null);
    assert.equal(formats.appBadge({ category: 'guaranteed' }), 'Guaranteed', 'existing badge unchanged');
    assert.equal(formats.isFixedPool({ category: 'practice' }), true);
    assert.equal(formats.isFixedPool({ category: 'multiplier' }), false);
    assert.equal(formats.isFixedPool({ category: 'flexible' }), false, 'legacy value behaves like mega');
  });

  test('new types split the pool equally', () => {
    assert.deepEqual(buildDynamicPrizeDistribution(1, 170, 'h2h').map((r) => [r.rank_start, r.rank_end, r.per_winner_amount]), [[1, 1, 170]]);
    assert.deepEqual(buildDynamicPrizeDistribution(5, 1700, 'multiplier').map((r) => [r.rank_start, r.rank_end, r.per_winner_amount]), [[1, 5, 340]]);
    assert.deepEqual(formats.equalSplitRows(5, 1700), [{ label: 'Rank 1 to 5', rank_start: 1, rank_end: 5, winners: 5, per_winner: 340, prize: 1700, percent: 100 }]);
  });

  test('admin validation', () => {
    const h2h = formats.validateFormat({ category: 'h2h' }, { participants: 50, maxEntries: 3 });
    assert.deepEqual([h2h.participants, h2h.maxEntries, h2h.errors], [2, 1, []]);
    assert.match(formats.validateFormat({ category: 'multiplier', multiplier: '7' }, { participants: 20, maxEntries: 1 }).errors[0], /Choose a multiplier/);
    assert.match(formats.validateFormat({ category: 'multiplier', multiplier: '4' }, { participants: 18, maxEntries: 1 }).errors[0], /multiple of 4/);
    assert.equal(formats.validateFormat({ category: 'multiplier', multiplier: '4' }, { participants: 20, maxEntries: 1 }).multiplier, 4);
    assert.match(formats.validateFormat({ category: 'multiplier', multiplier: '4', min_participants: '2' }, { participants: 20, maxEntries: 1 }).errors[0], /at least 4/);
    assert.match(formats.validateFormat({ category: 'mega', min_participants: '200' }, { participants: 100, maxEntries: 1 }).errors[0], /cannot be more/);
    assert.equal(formats.validateFormat({ category: 'mega', min_participants: '5' }, { participants: 100, maxEntries: 1 }).minParticipants, 5);
  });
});

// ─── Join flow against an in-memory store ───────────────────────────────────

const models = {
  User: require('../../src/models/user.model'),
  Contest: require('../../src/models/contest.model'),
  ContestEntry: require('../../src/models/contest-entry.model'),
  LeagueSession: require('../../src/models/league-session.model'),
  SavedBasket: require('../../src/models/saved-basket.model'),
  Transaction: require('../../src/models/transaction.model'),
  Notification: require('../../src/models/notification.model'),
};
const { joinContest } = require('../../src/services/contest-join.service');

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
const copy = (d) => (d ? { ...d } : d);

function evalExpr(expr, doc) {
  if (typeof expr === 'string' && expr.startsWith('$')) return doc[expr.slice(1)];
  if (expr === null || typeof expr !== 'object') return expr;
  const [op, args] = Object.entries(expr)[0];
  const v = (Array.isArray(args) ? args : [args]).map((a) => evalExpr(a, doc));
  switch (op) {
    case '$ifNull': return v[0] == null ? v[1] : v[0];
    case '$max': return Math.max(...v);
    case '$min': return Math.min(...v);
    case '$add': return v.reduce((s, x) => s + x, 0);
    case '$subtract': return v[0] - v[1];
    case '$gte': return v[0] >= v[1];
    default: throw new Error(`unsupported expression ${op}`);
  }
}
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    if (key === '$expr') return !!evalExpr(cond, doc);
    const val = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]) => {
        switch (op) {
          case '$in': return arg.some((a) => same(val, a));
          case '$ne': return !same(val, arg);
          case '$lt': return val != null && new Date(val) < new Date(arg);
          case '$type': return typeof val === 'number';
          default: throw new Error(`unsupported operator ${op}`);
        }
      });
    }
    if (cond instanceof Date) return val != null && new Date(val).getTime() === cond.getTime();
    return same(val, cond);
  });
}
const tick = () => new Promise((resolve) => { setImmediate(resolve); });
function query(value) {
  const q = { select: () => q, sort: () => q, lean: () => q, then: (a, b) => tick().then(() => value).then(a, b) };
  return q;
}
function stub(name) {
  const Model = models[name];
  const all = () => db[name];
  const find = (f) => all().find((d) => matches(d, f)) || null;
  const doc = (d) => (d ? { ...d, toObject() { return { ...this }; } } : null);
  Model.find = (f) => query(all().filter((d) => matches(d, f)).map(copy));
  Model.findOne = (f) => query(doc(find(f)));
  Model.findById = (id) => query(doc(find({ _id: id })));
  Model.countDocuments = async (f) => all().filter((d) => matches(d, f)).length;
  Model.create = async (input) => { await tick(); const d = { _id: new ObjectId(), created_at: new Date(), ...input }; all().push(d); return d; };
  Model.updateOne = async (f, u) => {
    await tick();
    const d = find(f);
    if (!d) return { modifiedCount: 0 };
    Object.assign(d, u.$set || {});
    Object.entries(u.$inc || {}).forEach(([k, v]) => { d[k] = (d[k] || 0) + v; });
    return { modifiedCount: 1 };
  };
  Model.findOneAndUpdate = (f, pipeline, opts = {}) => {
    const run = async () => {
      await tick();
      const d = find(f);
      if (!d) return null;
      const before = copy(d);
      pipeline.forEach((stage) => {
        const next = Object.fromEntries(Object.entries(stage.$set).map(([k, e]) => [k, evalExpr(e, d)]));
        Object.assign(d, next);
      });
      return opts.new ? copy(d) : before;
    };
    return { lean: () => run(), then: (a, b) => run().then(a, b) };
  };
}
Object.keys(models).forEach(stub);

let session;
let contest;
function reset({ category = 'mega', participants = 10, fee = 100, maxEntries = 1, start = 60 } = {}) {
  db = Object.fromEntries(Object.keys(models).map((n) => [n, []]));
  session = { _id: new ObjectId(), old_id: 7, status: 'upcoming', start_time: new Date(Date.now() + start * 60000) };
  contest = { _id: new ObjectId(), old_id: 70, league_session_id: session._id, category, participants, entry_fee: fee, max_entries_per_user: maxEntries, status: 'active', join_lock_at: null };
  db.LeagueSession.push(session);
  db.Contest.push(contest);
}
function player(deposit, winnings = 0) {
  const user = { _id: new ObjectId(), deposit_balance: deposit, winnings_balance: winnings };
  const basket = { _id: new ObjectId(), user_id: user._id, is_standalone: true };
  db.User.push(user);
  db.SavedBasket.push(basket);
  return { user, basket };
}
const join = (p, extra = {}) => joinContest({ userRef: String(p.user._id), contestRef: String(contest._id), basketIds: [String(p.basket._id)], ...extra });
const userOf = (p) => db.User.find((u) => same(u._id, p.user._id));

describe('contest join', () => {
  beforeEach(() => reset());

  // NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — winnings first, then deposit
  test('charges the contest fee from winnings first and records the entry', async () => {
    const p = player(30, 100);
    const res = await join(p);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success_count, 1);
    assert.deepEqual([userOf(p).deposit_balance, userOf(p).winnings_balance], [30, 0]);
    assert.equal(res.body.wallet_balance, 30);
    assert.equal(db.ContestEntry.length, 1);
    assert.deepEqual([db.ContestEntry[0].fee_from_winnings, db.ContestEntry[0].fee_from_deposit], [100, 0]);
    assert.equal(db.Transaction[0].amount, 100);
    assert.deepEqual([db.Transaction[0].from_winnings, db.Transaction[0].from_deposit], [100, 0]);
    assert.equal(contest.join_lock_at, null, 'lock released');
  });

  test('when winnings run out the rest comes from deposit, and the split is recorded', async () => {
    const p = player(80, 30);
    assert.equal((await join(p)).status, 200);
    assert.deepEqual([userOf(p).deposit_balance, userOf(p).winnings_balance], [10, 0]);
    assert.deepEqual([db.ContestEntry[0].fee_from_winnings, db.ContestEntry[0].fee_from_deposit], [30, 70]);
    assert.deepEqual([db.Transaction[0].from_winnings, db.Transaction[0].from_deposit], [30, 70]);
  });

  test('deposit only, and a negative winnings balance is never charged further', async () => {
    const p = player(150, -5);
    assert.equal((await join(p)).status, 200);
    assert.deepEqual([userOf(p).deposit_balance, userOf(p).winnings_balance], [50, -5]);
    assert.deepEqual([db.ContestEntry[0].fee_from_winnings, db.ContestEntry[0].fee_from_deposit], [0, 100]);
  });

  test("the app's entry_fee cannot lower the price", async () => {
    const p = player(500);
    const res = await join(p, { clientEntryFee: 0 });
    assert.equal(res.status, 409);
    assert.equal(res.body.entry_fee, 100);
    assert.equal(userOf(p).deposit_balance, 500);
    assert.equal(db.ContestEntry.length, 0);
    assert.equal((await join(p, { clientEntryFee: '100.00' })).status, 200);
  });

  test('joining closes when the session starts, and for cancelled contests', async () => {
    const p = player(500);
    session.start_time = new Date(Date.now() - 1000);
    assert.match((await join(p)).body.message, /already started/);
    session.start_time = new Date(Date.now() + 60000);
    contest.status = 'cancelled';
    assert.match((await join(p)).body.message, /closed/);
    assert.equal(userOf(p).deposit_balance, 500);
  });

  test('insufficient balance and per-user entry limit', async () => {
    const poor = player(50, 49);
    assert.equal((await join(poor)).body.message, 'Insufficient balance');
    const p = player(1000);
    assert.equal((await join(p)).status, 200);
    assert.match((await join(p)).body.message, /only select 0 more/);
  });

  test('H2H: three players racing for two spots — exactly two get in', async () => {
    reset({ category: 'h2h', participants: 2 });
    const players = [player(100), player(100), player(100)];
    const results = await Promise.all(players.map((p) => join(p)));
    const joined = results.filter((r) => r.status === 200 && r.body.success_count === 1);
    assert.equal(joined.length, 2);
    assert.equal(db.ContestEntry.length, 2);
    const rejected = results.find((r) => r.status !== 200);
    assert.match(rejected.body.message, /full|spots/);
    const charged = players.filter((p) => userOf(p).deposit_balance === 0).length;
    assert.equal(charged, 2, 'only the two players who got in were charged');
  });

  test('the same balance cannot pay for two contests at once', async () => {
    const p = player(100);
    const other = { ...contest, _id: new ObjectId(), old_id: 71, join_lock_at: null };
    db.Contest.push(other);
    const basket2 = { _id: new ObjectId(), user_id: p.user._id, is_standalone: true };
    db.SavedBasket.push(basket2);
    const [a, b] = await Promise.all([
      join(p),
      joinContest({ userRef: String(p.user._id), contestRef: String(other._id), basketIds: [String(basket2._id)] }),
    ]);
    const ok = [a, b].filter((r) => r.status === 200 && r.body.success_count === 1).length;
    assert.equal(ok, 1);
    assert.equal(userOf(p).deposit_balance, 0);
    assert.equal(db.ContestEntry.length, 1);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT: basket selection cap shown to the app
describe('selection limit', () => {
  const { selectionLimit } = require('../../src/services/contest-join.service');
  const open = { status: 'upcoming', start_time: new Date(Date.now() + 60000) };

  test('smaller of remaining entries and spots left; 0 when joining is closed', () => {
    const c = { status: 'active', participants: 10, max_entries_per_user: 5 };
    assert.deepEqual(selectionLimit(c, open, 0, 2), { remaining_entries: 3, spots_left: 10, max_selectable: 3 });
    assert.equal(selectionLimit(c, open, 8, 0).max_selectable, 2, 'spots left is smaller');
    assert.equal(selectionLimit(c, open, 4, 5).max_selectable, 0, 'limit used up');
    assert.equal(selectionLimit(c, { ...open, start_time: new Date(Date.now() - 1000) }, 0, 0).max_selectable, 0, 'session started');
    assert.equal(selectionLimit({ ...c, status: 'cancelled' }, open, 0, 0).max_selectable, 0, 'contest closed');
  });

  test('the join accepts exactly max_selectable baskets and rejects one more', async () => {
    reset({ participants: 10, maxEntries: 3 });
    const p = player(1000);
    const extra = [1, 2, 3].map(() => {
      const b = { _id: new ObjectId(), user_id: p.user._id, is_standalone: true };
      db.SavedBasket.push(b);
      return String(b._id);
    });
    assert.equal((await join(p)).body.success_count, 1);
    const { max_selectable: cap } = selectionLimit(contest, session, db.ContestEntry.length, 1);
    assert.equal(cap, 2);
    const tooMany = await joinContest({ userRef: String(p.user._id), contestRef: String(contest._id), basketIds: extra });
    assert.match(tooMany.body.message, /only select 2 more/);
    const ok = await joinContest({ userRef: String(p.user._id), contestRef: String(contest._id), basketIds: extra.slice(0, cap) });
    assert.equal(ok.body.success_count, 2);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT: auto-create a fresh contest when one fills up
describe('auto-create on full', () => {
  const { createNextIfFull } = require('../../src/services/contest-auto-create.service');
  const copies = () => db.Contest.filter((c) => same(c.auto_created_from, contest._id));

  test('filling a contest with the flag on creates exactly one fresh copy', async () => {
    reset({ category: 'h2h', participants: 2 });
    contest.auto_create_on_full = true;
    contest.bots_joined = true;
    await join(player(100));
    assert.equal(copies().length, 0, 'not full yet');
    await join(player(100));
    assert.equal(copies().length, 1);
    const next = copies()[0];
    assert.equal(next.old_id, 71, 'gets the next numeric public id');
    assert.ok(same(next.league_session_id, session._id));
    assert.deepEqual([next.category, next.participants, next.entry_fee, next.auto_create_on_full], ['h2h', 2, 100, true]);
    assert.equal(next.bots_joined, false);
    assert.ok(same(contest.auto_created_contest_id, next._id));

    await createNextIfFull(contest._id);
    assert.equal(copies().length, 1, 'never a second copy');

    const res = await joinContest({ userRef: String(player(100).user._id), contestRef: String(next._id), basketIds: [String(db.SavedBasket.at(-1)._id)] });
    assert.equal(res.body.success_count, 1, 'players can join the copy');
  });

  test('flag off, or the session has started → nothing is created', async () => {
    reset({ category: 'h2h', participants: 2 });
    await Promise.all([join(player(100)), join(player(100))]);
    assert.equal(db.Contest.length, 1);

    reset({ category: 'h2h', participants: 1 });
    contest.auto_create_on_full = true;
    db.ContestEntry.push({ _id: new ObjectId(), contest_id: contest._id });
    session.start_time = new Date(Date.now() - 1000);
    assert.equal(await createNextIfFull(contest._id), null);
    assert.equal(db.Contest.length, 1);
  });
});
