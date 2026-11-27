'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): "the prize pool should be accurate for the actual
 * joins" — checked on the APIs that used to do their own sums:
 *   GET /api/v1/sessions/user-joined          (only mega / equal were recalculated; numeric ids crashed)
 *   GET /api/v1/contests/user                 (missed entries saved with the old numeric contest id)
 *   GET /api/v1/api/user-contest-baskets      (always the advertised pool)
 *   admin lists (withCurrentPools)            (always the advertised pool)
 * Every one must show cardPrize(): the advertised pool before the start, actual joins once live.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);
require('../../src/config/logger').silent = true;

const { ObjectId } = mongoose.Types;
const MODELS = {
  Contest: require('../../src/models/contest.model'),
  ContestEntry: require('../../src/models/contest-entry.model'),
  LeagueSession: require('../../src/models/league-session.model'),
  SavedBasket: require('../../src/models/saved-basket.model'),
  User: require('../../src/models/user.model'),
  Notification: require('../../src/models/notification.model'),
};

// ─── tiny in-memory store ────────────────────────────────────────────────────
let db;
const same = (a, b) => String(a) === String(b);
function matches(doc, query = {}) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((q) => matches(doc, q));
    const value = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date)) {
      if ('$in' in cond) return cond.$in.some((c) => same(c, value));
      if ('$ne' in cond) return !same(cond.$ne, value);
      if ('$nin' in cond) return !cond.$nin.some((c) => same(c, value));
      if ('$size' in cond) return Array.isArray(value) && value.length === cond.$size;
      return true;
    }
    return same(cond, value);
  });
}
const withToObject = (d) => (d ? { ...d, toObject() { return { ...d }; } } : null);
function chain(result) {
  const c = {
    select: () => c, sort: () => c, skip: () => c, limit: () => c, populate: () => c,
    lean: async () => (Array.isArray(result) ? result.map((d) => ({ ...d })) : (result ? { ...result } : null)),
    then: (ok, fail) => Promise.resolve(Array.isArray(result) ? result.map(withToObject) : withToObject(result)).then(ok, fail),
  };
  return c;
}
for (const [name, Model] of Object.entries(MODELS)) {
  const rows = () => db[name] || [];
  Model.find = (q) => chain(rows().filter((d) => matches(d, q)));
  Model.findOne = (q) => chain(rows().find((d) => matches(d, q)) || null);
  Model.findById = (id) => chain(rows().find((d) => same(d._id, id)) || null);
  Model.countDocuments = async (q) => rows().filter((d) => matches(d, q)).length;
  Model.aggregate = async (pipeline) => {
    const match = (pipeline.find((s) => s.$match) || {}).$match || {};
    const counts = new Map();
    rows().filter((d) => matches(d, match)).forEach((d) => counts.set(String(d.contest_id), (counts.get(String(d.contest_id)) || 0) + 1));
    return [...counts].map(([id, count]) => ({ _id: /^\d+$/.test(id) ? Number(id) : id, count }));
  };
}

// A live session (old numeric id 301) with a winner-takes-all contest (old id 77, ₹50 entry, 10% fee,
// advertised ₹4,500 for a full house of 100). 6 players joined, saved under the old numeric contest id.
function reset({ status = 'live' } = {}) {
  const userId = new ObjectId();
  db = {
    User: [{ _id: userId, old_id: 9, name: 'Asha' }],
    LeagueSession: [{ _id: new ObjectId(), old_id: 301, name: 'Morning', status, start_time: new Date(), end_time: new Date(), assets: [] }],
    Contest: [{
      _id: new ObjectId(), old_id: 77, league_session_id: 301, category: 'winner_takes_all', status: 'live',
      participants: 100, entry_fee: 50, platform_fee: 10, prize_pool: 4500,
      prize_distribution: [{ rank_start: 1, rank_end: 1, winners: 1, per_winner: 4500, percent: 100 }],
    }],
    ContestEntry: Array.from({ length: 6 }, (_, i) => ({
      _id: new ObjectId(), old_id: 500 + i, contest_id: 77, session_id: 301, basket_id: 800 + i,
      user_id: i === 0 ? 9 : 100 + i, total_score: 10 - i,
    })),
    SavedBasket: [{ _id: new ObjectId(), old_id: 800, user_id: 9, contest_id: 77, session_id: 301, assets: [], multipliers: [] }],
    Notification: [],
  };
  return { userId };
}
const LIVE_POOL = 6 * 50 * 0.9; // 270
const call = async (handler, req) => {
  let body;
  let code = 200;
  await handler({ params: {}, query: {}, protocol: 'http', get: () => 'localhost', ...req }, {
    json(b) { body = b; return this; },
    status(c) { code = c; return this; },
  });
  return { body, code };
};

describe('prize pool from actual joins on every API', () => {
  beforeEach(() => reset());

  test('GET /api/v1/sessions/user-joined: a live winner-takes-all contest (old numeric ids) → 270, not 4,500', async () => {
    const { getUserJoinedSessions } = require('../../src/controllers/session.controller');
    const { body, code } = await call(getUserJoinedSessions, { query: { user_id: 9 } });
    assert.equal(code, 200, JSON.stringify(body));
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].total_prize_pool, LIVE_POOL);
    assert.equal(body.sessions[0].total_entries, 1);
    assert.equal(body.sessions[0].contests_joined, 1);
  });

  test('GET /api/v1/sessions/user-joined: before the start → the advertised 4,500', async () => {
    reset({ status: 'upcoming' });
    const { getUserJoinedSessions } = require('../../src/controllers/session.controller');
    const { body } = await call(getUserJoinedSessions, { query: { user_id: 9 } });
    assert.equal(body.sessions[0].total_prize_pool, 4500);
  });

  test('GET /api/v1/contests/user: joins saved under the old numeric id are counted', async () => {
    const contest = db.Contest[0];
    // this older API populates the contest of each entry
    MODELS.ContestEntry.find = (q) => chain(db.ContestEntry.filter((d) => matches(d, q)).map((e) => ({ ...e, contest_id: contest, basket_id: null })));
    try {
      const { getUserContests } = require('../../src/controllers/contest.controller');
      MODELS.LeagueSession.findById = () => chain(db.LeagueSession[0]);
      const { body } = await call(getUserContests, { query: { user_id: 9 } });
      const card = body.sessions[0].contests[0];
      assert.equal(card.spots_joined, 6);
      assert.equal(card.prize_pool, LIVE_POOL);
      assert.equal(card.is_flexible_prize, true);
    } finally {
      MODELS.ContestEntry.find = (q) => chain(db.ContestEntry.filter((d) => matches(d, q)));
      MODELS.LeagueSession.findById = (id) => chain(db.LeagueSession.find((d) => same(d._id, id)) || null);
    }
  });

  test('GET /api/user-contest-baskets: the basket\'s contest shows the live pool', async () => {
    const { getUserContestBaskets } = require('../../src/controllers/mobile-api.controller');
    const { body, code } = await call(getUserContestBaskets, { query: { user_id: 9 } });
    assert.equal(code, 200, JSON.stringify(body));
    const baskets = body.baskets || body.data;
    assert.equal(baskets.length, 1);
    assert.equal(baskets[0].prize_pool, LIVE_POOL);
  });

  test('admin lists (withCurrentPools): live → actual joins, upcoming → advertised, cancelled → 0', async () => {
    const { withCurrentPools } = require('../../src/services/contest-automation/contest-scoring');
    const live = { ...db.Contest[0] };
    await withCurrentPools([live]);
    assert.deepEqual([live.prize_pool, live.advertised_prize_pool, live.joined_count, live.is_live_prize], [LIVE_POOL, 4500, 6, true]);

    reset({ status: 'upcoming' });
    const upcoming = { ...db.Contest[0] };
    await withCurrentPools([upcoming]);
    assert.deepEqual([upcoming.prize_pool, upcoming.is_live_prize], [4500, false]);

    reset();
    const cancelled = { ...db.Contest[0], status: 'cancelled' };
    await withCurrentPools([cancelled]);
    assert.equal(cancelled.prize_pool, 0);
  });
});
