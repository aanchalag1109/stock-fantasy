'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Client feedback: "after live, prize and structure don't change with actual joins (flexible)".
 * Checks that the app's contest detail (GET /api/v1/contests/:id) shows the same pool and prize
 * rows the payout will use once the session has started, and the stored rows before that.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);
require('../../src/config/logger').silent = true;

const Contest = require('../../src/models/contest.model');
const ContestEntry = require('../../src/models/contest-entry.model');
const LeagueSession = require('../../src/models/league-session.model');
const User = require('../../src/models/user.model');
const SavedBasket = require('../../src/models/saved-basket.model');
const { getContest } = require('../../src/controllers/mobile-api.controller');
const { dynamicPrizeRows } = require('../../src/services/contest-automation/contest-scoring');

const { ObjectId } = mongoose.Types;
let db;
const withToObject = (d) => (d ? { ...d, toObject() { return { ...d }; } } : null);
const list = (rows) => ({ lean: async () => rows, select() { return this; } });
Contest.findOne = async () => withToObject(db.contest);
LeagueSession.findOne = async () => withToObject(db.session);
ContestEntry.find = () => list(db.entries);
User.find = () => list([]);
SavedBasket.find = () => list([]);

// 100-spot mega contest, ₹100 entry, 10% fee; admin rows saved for a full house (₹9,000 pool).
function reset({ joined = 40, sessionStatus = 'live', ended = true } = {}) {
  db = {
    session: {
      _id: new ObjectId(), old_id: 5, status: sessionStatus,
      assets: [{ asset_symbol: 'AAA', start_price: 10, ...(ended ? { end_price: 11 } : {}) }],
    },
    entries: Array.from({ length: joined }, (_, i) => ({ _id: new ObjectId(), contest_id: 50, user_id: i + 1, basket_id: i + 1, total_score: joined - i })),
  };
  db.contest = {
    _id: new ObjectId(), old_id: 50, league_session_id: 5, category: 'mega', status: 'active',
    participants: 100, entry_fee: 100, platform_fee: 10, winning_percentage: 30,
    total_pool: 10000, platform_fee_amount: 1000, prize_pool: 9000,
    prize_distribution: [
      { label: 'Rank 1', rank_start: 1, rank_end: 1, winners: 1, per_winner: 2700, prize: 2700, percent: 30 },
      { label: 'Rank 2 to 30', rank_start: 2, rank_end: 30, winners: 29, per_winner: 217.24, prize: 6300, percent: 70 },
    ],
  };
}

async function fetchContest() {
  let body;
  await getContest({ params: { id: '50' }, query: {} }, { json: (b) => { body = b; }, status() { return this; } });
  return body;
}

describe('live contest detail follows actual joins', () => {
  beforeEach(() => reset());

  test('live mega contest: pool and prize rows match the payout for 40 joins', async () => {
    const body = await fetchContest();
    const payout = dynamicPrizeRows(db.contest, 40);
    assert.equal(body.contest.prize_pool, 3600);
    assert.equal(body.contest.total_pool, 4000);
    assert.equal(body.contest.platform_fee_amount, 400);
    assert.equal(body.contest.is_flexible_prize, true);
    assert.deepEqual(body.prize_distribution || body.contest.prize_distribution, payout.rows);
    const rows = body.prize_distribution || body.contest.prize_distribution;
    assert.ok(rows.every((r) => r.prize_amount > 0), 'no ₹0 prize amounts');
    assert.ok(rows[0].per_winner_amount < 2700, 'not the full-house rank-1 prize');
  });

  test('live session without end prices: leaderboard uses the live prices and saved scores', async () => {
    reset({ joined: 3, sessionStatus: 'live', ended: false });
    db.session.assets[0].live_price = 12; // start 10 → +20%
    db.entries.forEach((e, i) => { e.total_score = [50, 300, -20][i]; });
    const body = await fetchContest();
    assert.equal(body.contest.calculation_started, true);
    assert.deepEqual(body.participants.map((p) => p.total_score), [300, 50, -20], 'sorted by saved live score');
    assert.deepEqual(body.participants.map((p) => p.rank), [1, 2, 3]);
  });

  test('live prices never replace real end prices, and are ignored once the session is completed', () => {
    const { priceMaps } = require('../../src/helpers/mobile-compat');
    const assets = [{ asset_symbol: 'AAA', start_price: 10, live_price: 12 }];
    assert.deepEqual(priceMaps({ status: 'live', assets }).end, { AAA: 12 });
    assert.equal(priceMaps({ status: 'completed', assets }).started, false);
    assert.deepEqual(priceMaps({ status: 'live', assets: [{ ...assets[0], end_price: 11 }] }).end, { AAA: 11 });
  });

  test('before the session starts the saved structure is shown unchanged', async () => {
    reset({ sessionStatus: 'upcoming', ended: false });
    const body = await fetchContest();
    const rows = body.prize_distribution || body.contest.prize_distribution;
    assert.equal(body.contest.prize_pool, 9000);
    assert.equal(rows[0].per_winner_amount, 2700);
    assert.equal(body.contest.is_flexible_prize, false);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the contest CARD (list) shows the same prize as
// the detail screen — e.g. a live winner-takes-all card used to keep its old full-house prize.
describe('contest cards show the same prize as the detail screen', () => {
  const { contestsBySession } = require('../../src/controllers/mobile-api.controller');
  const { cardPrize } = require('../../src/services/contest-automation/contest-scoring');
  Contest.find = () => list([db.contest]);

  async function card() {
    let body;
    await contestsBySession({ params: { sessionId: '5' }, query: {} }, { json: (b) => { body = b; }, status() { return this; } });
    return body.contests[0];
  }
  const FORMATS = [
    ['winner_takes_all', { category: 'winner_takes_all', participants: 10 }, 5],
    ['h2h', { category: 'h2h', participants: 2 }, 2],
    ['4x multiplier', { category: 'multiplier', multiplier: 4, participants: 12 }, 9],
    ['equal', { category: 'equal', participants: 20, winning_percentage: 50 }, 8],
    ['mega', {}, 40],
  ];

  for (const [name, extra, joined] of FORMATS) {
    test(`live ${name}: card prize pool and first prize = detail screen = payout`, async () => {
      reset({ joined });
      Object.assign(db.contest, extra, { prize_distribution: [{ rank_start: 1, rank_end: 1, winners: 1, per_winner: 9000, percent: 100 }] });
      const detail = await fetchContest();
      const rows = detail.prize_distribution || detail.contest.prize_distribution;
      const c = await card();
      const payout = dynamicPrizeRows(db.contest, joined);
      assert.equal(c.prize_pool, detail.contest.prize_pool);
      assert.equal(c.prize_pool, payout.prizePool);
      assert.equal(c.first_prize, rows[0].per_winner_amount);
      assert.equal(c.is_live_prize, true);
      assert.ok(c.prize_pool < 9000, 'not the old full-house prize');
    });
  }

  test('upcoming flexible contest: the card shows the advertised prize, like the detail screen', async () => {
    reset({ sessionStatus: 'upcoming', ended: false });
    const c = await card();
    assert.deepEqual([c.prize_pool, c.first_prize, c.is_live_prize], [9000, 2700, false]);
  });

  test('fixed-prize (guaranteed) contest: the stored prize, live or not', async () => {
    reset({ joined: 3 });
    db.contest.category = 'guaranteed';
    const c = await card();
    assert.deepEqual([c.prize_pool, c.first_prize, c.is_fixed_prize], [9000, 2700, true]);
    assert.deepEqual(cardPrize(db.contest, 'upcoming', 3).prize_pool, 9000);
  });
});
