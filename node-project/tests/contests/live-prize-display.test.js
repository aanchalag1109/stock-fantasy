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

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): before live the app shows exactly the admin structure.
describe('before live: the app shows exactly what the admin form saved', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const script = fs.readFileSync(path.join(__dirname, '../../src/admin/views/contests/prize-script.ejs'), 'utf8').replace(/<[/]?script>/g, '');

  // Runs the real admin create/edit form script and returns the structure it saves.
  function adminRows(values) {
    const els = {};
    const document = {
      getElementById: (id) => {
        els[id] = els[id] || { value: values[id] == null ? '' : String(values[id]), classList: { toggle() {} }, appendChild() {} };
        return els[id];
      },
      createElement: () => ({}),
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    vm.runInNewContext(`${script};recalc();`, { document, window: {} });
    return JSON.parse(els.prize_distribution_hidden.value || '[]');
  }
  async function upcoming(category, participants, entryFee, platformFee, winning) {
    reset({ joined: 3, sessionStatus: 'upcoming', ended: false });
    const rows = adminRows({ category, participants, entry_fee: entryFee, platform_fee: platformFee, winning_percentage: winning });
    Object.assign(db.contest, {
      category, participants, entry_fee: entryFee, platform_fee: platformFee, winning_percentage: winning,
      prize_pool: participants * entryFee * (1 - platformFee / 100), prize_distribution: rows,
    });
    const { contestsBySession } = require('../../src/controllers/mobile-api.controller');
    Contest.find = () => list([db.contest]);
    let cards;
    await contestsBySession({ params: { sessionId: '5' }, query: {} }, { json: (b) => { cards = b; }, status() { return this; } });
    return { rows, app: (await fetchContest()).contest.prize_distribution, card: cards.contests[0] };
  }

  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): whole-number prizes that add up to the whole pool.
  // 6 winners of 1,800 used to get 540 / 324 / 198 / 121 / 99 — 1,403 in all, 397 never paid.
  test('6 winners of a 1,800 pool: whole numbers that add up to 1,800', async () => {
    const { app } = await upcoming('mega', 20, 100, 10, 30);
    assert.deepEqual(app.map((r) => r.per_winner_amount), [688, 410, 250, 153, 146]);
    assert.equal(app[4].prize_amount, 146, 'group total is what the group is paid');
    assert.equal(app.reduce((sum, r) => sum + r.prize_amount, 0), 1800);
  });

  test('mega and equal: ranks, winners, % and prize per winner equal the admin structure for 1–400 winners', async () => {
    for (const category of ['mega', 'equal']) {
      for (let n = 1; n <= 400; n += 1) {
        const { rows, app, card } = await upcoming(category, n, 100, 10, 100);
        assert.deepEqual(
          app.map((r) => [r.rank_start, r.rank_end, r.winners_count, r.percentage, r.per_winner_amount]),
          rows.map((r) => [r.rank_start, r.rank_end, r.winners, r.percent, r.per_winner]),
          `${category}, ${n} winners`,
        );
        assert.equal(card.first_prize, rows[0].per_winner, `${category} card, ${n} winners`);
      }
    }
  });

  test('admin Contest Details shows the same prize per winner as the app (was 0 per winner)', async () => {
    const { app } = await upcoming('mega', 20, 100, 10, 30);
    const ejs = require('ejs');
    const helper = require('../../src/admin/helpers/render');
    const contestModel = { findOne: Contest.findOne, sessionFind: LeagueSession.findOne, count: ContestEntry.countDocuments };
    Contest.findOne = async () => ({ ...db.contest, toObject: () => ({ ...db.contest }) });
    LeagueSession.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Morning' }) }) });
    ContestEntry.countDocuments = async () => 3;
    try {
      const original = helper.render;
      let locals;
      helper.render = async (_res, _view, data) => { locals = data; };
      const id = require.resolve('../../src/admin/controllers/contests.controller');
      delete require.cache[id];
      const controller = require(id);
      helper.render = original;
      await controller.show({ params: { id: '50' }, session: {}, flash() {} }, { redirect() {}, status() { return this; }, send(m) { throw new Error(m); } });
      const file = path.join(__dirname, '../../src/admin/views/contests/show.ejs');
      const html = await ejs.renderFile(file, locals);
      const shown = [...html.matchAll(/([0-9,]+) per winner/g)].map((m) => Number(m[1].replace(/,/g, '')));
      assert.deepEqual(shown, app.map((r) => r.per_winner_amount));
      assert.deepEqual(shown, [688, 410, 250, 153, 146]);
      delete require.cache[id];
    } finally {
      Contest.findOne = contestModel.findOne;
      LeagueSession.findOne = contestModel.sessionFind;
      ContestEntry.countDocuments = contestModel.count;
    }
  });

  test('a full contest never pays less than the app showed', async () => {
    for (let n = 1; n <= 400; n += 1) {
      const { app } = await upcoming('mega', n, 100, 10, 100);
      const payout = dynamicPrizeRows(db.contest, n).rows;
      app.forEach((row, i) => {
        const diff = payout[i].per_winner_amount - row.per_winner_amount;
        assert.ok(diff >= 0 && diff <= 1.01, `${n} winners, rank ${row.rank_start}: shown ${row.per_winner_amount}, paid ${payout[i].per_winner_amount}`);
      });
    }
  });

  test('old contests saved without an amount keep the % calculation', async () => {
    reset({ sessionStatus: 'upcoming', ended: false });
    db.contest.prize_distribution = [{ rank_start: 1, rank_end: 1, winners: 1, percent: 30 }, { rank_start: 2, rank_end: 3, winners: 2, percent: 20 }];
    const rows = (await fetchContest()).contest.prize_distribution;
    assert.deepEqual(rows.map((r) => r.per_winner_amount), [2700, 900]);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): leaderboard rows carry the player's photo
describe('leaderboard profile photos', () => {
  test('each participant has profile_image (full URL, or null)', async () => {
    require('../../src/config/env').APP_URL = 'http://206.189.133.192:8000';
    reset({ joined: 2 });
    User.find = () => list([
      { _id: new ObjectId(), old_id: 1, name: 'Asha', profile_image: 'uploads/profiles/p1.jpg' },
      { _id: new ObjectId(), old_id: 2, name: 'Ravi', profile_image: null },
    ]);
    const body = await fetchContest();
    const byName = Object.fromEntries(body.participants.map((p) => [p.user_name, p.profile_image]));
    assert.deepEqual(byName, { Asha: 'http://206.189.133.192:8000/uploads/profiles/p1.jpg', Ravi: null });
    User.find = () => list([]);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): "after live, no paise in the prize structure — like
// admin — and the prize pool accurate for the actual joins". Prizes are whole coins, the rows add up to the
// whole pool (the rounding leftover goes to rank 1), and every API shows the same table.
describe('whole-number prizes that add up to the pool', () => {
  const { buildDynamicPrizeDistribution } = require('../../src/helpers/mobile-compat');

  test('the client\'s contest: 1,000 joined × 50, 50% fee, 380 winners → 25,000 paid in whole coins', () => {
    const rows = buildDynamicPrizeDistribution(380, 25000, 'mega');
    assert.equal(rows.reduce((sum, r) => sum + r.prize_amount, 0), 25000, 'was 23,380.55');
    assert.deepEqual(rows.map((r) => [r.rank_start, r.rank_end, r.per_winner_amount]), [
      [1, 1, 3686], [2, 2, 2302], [3, 3, 1790], [4, 5, 396], [6, 10, 339], [11, 25, 180],
      [26, 50, 103], [51, 100, 63], [101, 250, 23], [251, 380, 22],
    ]);
  });

  test('1–3,000 winners, many pools: whole numbers, never more for a lower rank, total = the pool', () => {
    for (let winners = 1; winners <= 3000; winners += (winners < 300 ? 1 : 37)) {
      for (const pool of [winners * 9, winners * 45 + 0.5, 25000, 123456.78]) {
        const rows = buildDynamicPrizeDistribution(winners, pool, 'mega');
        const label = `${winners} winners, pool ${pool}`;
        assert.ok(rows.length, label);
        assert.ok(rows.every((r) => Number.isInteger(r.per_winner_amount) && r.per_winner_amount > 0), label);
        assert.ok(rows.every((r, i) => i === 0 || r.per_winner_amount <= rows[i - 1].per_winner_amount), `${label}: order`);
        assert.equal(rows[rows.length - 1].rank_end, winners, `${label}: every winner has a prize`);
        assert.equal(rows.reduce((sum, r) => sum + r.prize_amount, 0), Math.floor(pool), label);
      }
    }
  });

  test('equal-split formats: the same whole amount for everyone; the leftover stays with the platform', () => {
    for (const category of ['equal', 'h2h', 'winner_takes_all', 'multiplier']) {
      const rows = buildDynamicPrizeDistribution(3, 100, category);
      assert.deepEqual(rows.map((r) => [r.rank_start, r.rank_end, r.per_winner_amount, r.prize_amount]), [[1, 3, 33, 99]], category);
    }
  });

  test('live card: prize_distribution is the live table (was the full-house one saved at creation)', async () => {
    reset({ joined: 40 });
    Contest.find = () => list([db.contest]);
    const { contestsBySession } = require('../../src/controllers/mobile-api.controller');
    let body;
    await contestsBySession({ params: { sessionId: '5' }, query: {} }, { json: (b) => { body = b; }, status() { return this; } });
    const cardRows = JSON.parse(body.contests[0].prize_distribution);
    const payout = dynamicPrizeRows(db.contest, 40).rows;
    assert.deepEqual(cardRows.map((r) => [r.rank_start, r.rank_end, r.winners, r.per_winner]), payout.map((r) => [r.rank_start, r.rank_end, r.winners_count, r.per_winner_amount]));
    assert.equal(cardRows.reduce((sum, r) => sum + r.prize, 0), 3600);
    assert.equal(body.contests[0].first_prize, cardRows[0].per_winner);
  });

  test('live detail: every prize, including a tie share, is a whole number', async () => {
    reset({ joined: 40 });
    db.entries[1].total_score = db.entries[2].total_score; // ranks 2 and 3 tie
    const body = await fetchContest();
    assert.ok(body.participants.every((p) => Number.isInteger(p.prize_amount)), JSON.stringify(body.participants.slice(0, 4)));
    const rows = body.prize_distribution || body.contest.prize_distribution;
    assert.equal(rows.reduce((sum, r) => sum + r.prize_amount, 0), 3600);
  });

  test('a contest paid before this change keeps showing what its winners were paid', async () => {
    const ContestPerformancePrize = require('../../src/models/contest-performance-prize.model');
    const original = ContestPerformancePrize.find;
    const paid = [
      { contest_id: 50, rank_start: 1, rank_end: 1, winners_count: 1, per_winner_amount: 1000.5, prize_amount: 1000.5 },
      { contest_id: 50, rank_start: 2, rank_end: 12, winners_count: 11, per_winner_amount: 120.25, prize_amount: 1322.75 },
    ];
    ContestPerformancePrize.find = () => ({ sort: () => ({ lean: async () => paid }) });
    try {
      reset({ joined: 40, sessionStatus: 'completed' });
      db.contest.prizes_distributed = true;
      const body = await fetchContest();
      const rows = body.prize_distribution || body.contest.prize_distribution;
      assert.deepEqual(rows.map((r) => r.per_winner_amount), [1000.5, 120.25]);
      assert.equal(body.participants[0].prize_amount, 1000.5);
      // not paid yet → the new whole-number table
      db.contest.prizes_distributed = false;
      const unpaid = await fetchContest();
      assert.deepEqual(unpaid.prize_distribution || unpaid.contest.prize_distribution, dynamicPrizeRows(db.contest, 40).rows);
    } finally {
      ContestPerformancePrize.find = original;
    }
  });

  test('admin save: flexible tables are built on the server, whatever the form posts', () => {
    const { buildPrizeDistribution } = require('../../src/admin/controllers/contests.controller');
    const tampered = JSON.stringify([{ rank_start: 1, rank_end: 1, winners: 1, per_winner: 999999, prize: 999999, percent: 100 }]);
    const rows = buildPrizeDistribution({ prize_distribution: tampered }, 'mega', 6, 1800);
    assert.deepEqual(rows.map((r) => r.per_winner), [688, 410, 250, 153, 146]);
    assert.equal(rows.reduce((sum, r) => sum + r.prize, 0), 1800);
    // fixed-prize contests keep the admin's own table
    const fixed = buildPrizeDistribution({ prize_distribution: tampered }, 'guaranteed', 1, 999999);
    assert.equal(fixed[0].per_winner, 999999);
  });
});
