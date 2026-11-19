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
    entries: Array.from({ length: joined }, (_, i) => ({ _id: new ObjectId(), user_id: i + 1, basket_id: i + 1, total_score: joined - i })),
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

  test('before the session starts the saved structure is shown unchanged', async () => {
    reset({ sessionStatus: 'upcoming', ended: false });
    const body = await fetchContest();
    const rows = body.prize_distribution || body.contest.prize_distribution;
    assert.equal(body.contest.prize_pool, 9000);
    assert.equal(rows[0].per_winner_amount, 2700);
    assert.equal(body.contest.is_flexible_prize, false);
  });
});
