'use strict';

const axios = require('axios');
const config = require('../config/env');
const User = require('../models/user.model');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const LeagueSession = require('../models/league-session.model');
const SavedBasket = require('../models/saved-basket.model');
const Transaction = require('../models/transaction.model');
const Payment = require('../models/payment.model');
const ContestPerformancePrize = require('../models/contest-performance-prize.model');
const {
  keysOf, publicId, sqlDate, num, findByPublicId, scoreAssets, priceMaps, buildDynamicPrizeDistribution,
} = require('../helpers/mobile-compat');

function input(req, name) {
  if (req.body && req.body[name] != null && req.body[name] !== '') return req.body[name];
  if (req.query && req.query[name] != null && req.query[name] !== '') return req.query[name];
  return undefined;
}

async function stockQuote(symbol) {
  const response = await axios.get(
    'https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote',
    {
      headers: {
        'x-rapidapi-key': config.RAPIDAPI_KEY,
        'x-rapidapi-host': 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
      },
      params: { tradingSymbol: symbol, exchange: 'NSE' },
      timeout: 30000,
    }
  );
  return response.data || null;
}

async function cryptoListings() {
  const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
    headers: { 'X-CMC_PRO_API_KEY': config.CMC_API_KEY },
    params: { limit: 100, convert: 'USD' },
    timeout: (config.PRICE_FETCH_TIMEOUT || 10) * 1000,
  });
  return (response.data?.data || []).map((crypto) => ({
    symbol: crypto.symbol || '',
    price: num(crypto.quote && crypto.quote.USD && crypto.quote.USD.price),
  }));
}

async function savePrices(req, res, kind) {
  try {
    const contestId = input(req, 'contest_id');
    const contest = await findByPublicId(Contest, contestId);
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });
    const session = await findByPublicId(LeagueSession, contest.league_session_id);
    const assets = (session && session.assets) || [];
    const collection = kind === 'start' ? 'conteststartprices' : 'contestendprices';
    const priceField = kind === 'start' ? 'start_price' : 'end_price';
    await Contest.db.collection(collection).deleteMany({ contest_id: { $in: keysOf(contest) } });
    let listings = [];
    try { listings = await cryptoListings(); } catch { listings = []; }
    let savedCount = 0;
    const docs = [];
    for (const asset of assets) {
      const symbol = asset.asset_symbol;
      if (!symbol) continue;
      let price = 0;
      if (String(symbol).includes('-USD')) {
        const cryptoSymbol = String(symbol).replace('-USD', '');
        const row = listings.find((item) => item.symbol === cryptoSymbol);
        if (row) price = row.price;
      } else {
        try {
          const quote = await stockQuote(symbol);
          price = num(quote && (quote.lastPrice != null ? quote.lastPrice : quote.price));
        } catch { price = 0; }
      }
      if (price > 0) {
        docs.push({
          contest_id: publicId(contest),
          symbol,
          [priceField]: price,
          timestamp: new Date(),
          created_at: new Date(),
        });
        savedCount += 1;
      }
    }
    if (docs.length) await Contest.db.collection(collection).insertMany(docs);
    const message = kind === 'start' ? 'Start prices saved successfully' : 'End prices saved successfully';
    return res.json({ success: true, message, count: savedCount });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

const saveStartPrices = (req, res) => savePrices(req, res, 'start');
const saveEndPrices = (req, res) => savePrices(req, res, 'end');

function extractRankStart(label) {
  const prize = String(label || '').match(/^(\d+)(st|nd|rd|th) Prize$/);
  if (prize) return parseInt(prize[1], 10);
  const ranks = String(label || '').match(/Ranks (\d+)-/);
  if (ranks) return parseInt(ranks[1], 10);
  return 1;
}

function extractRankEnd(label) {
  const prize = String(label || '').match(/^(\d+)(st|nd|rd|th) Prize$/);
  if (prize) return parseInt(prize[1], 10);
  const ranks = String(label || '').match(/Ranks \d+-(\d+)/);
  if (ranks) return parseInt(ranks[1], 10);
  return 1;
}

const saveApiStructure = async (req, res) => {
  try {
    const contestId = input(req, 'contest_id');
    const apiData = input(req, 'api_data');
    if (!apiData || !Array.isArray(apiData.distribution)) {
      return res.status(400).json({ success: false, error: 'No distribution data' });
    }
    const contest = await findByPublicId(Contest, contestId);
    const contestKeys = contest ? keysOf(contest) : [contestId];
    await ContestPerformancePrize.deleteMany({ contest_id: { $in: contestKeys } });
    const docs = apiData.distribution.map((item) => {
      const perWinner = num(item.perWinner);
      const winners = parseInt(item.winners == null ? 1 : item.winners, 10) || 1;
      const label = item.label || 'Rank';
      return {
        contest_id: contest ? publicId(contest) : contestId,
        contest_old_id: contest && contest.old_id != null ? contest.old_id : (Number(contestId) || null),
        rank_label: label,
        rank_start: extractRankStart(label),
        rank_end: extractRankEnd(label),
        winners_count: winners,
        percentage: num(item.percent),
        prize_amount: perWinner * winners,
        per_winner_amount: perWinner,
        total_pool: num(apiData.totalPool),
        platform_fee: num(apiData.platformFeeAmount),
        prize_pool: num(apiData.totalPrizePool),
        total_participants: parseInt(input(req, 'participants') || 0, 10) || 0,
        total_winners: parseInt(apiData.totalWinners || 0, 10) || 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
    });
    if (docs.length) await ContestPerformancePrize.insertMany(docs);
    return res.json({ success: true, message: 'API structure saved successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

async function prizesFor(contest) {
  let prizes = await ContestPerformancePrize.find({
    $or: [{ contest_id: { $in: keysOf(contest) } }, { contest_old_id: contest.old_id }],
  }).sort({ rank_start: 1 }).lean();
  if (prizes.length) return prizes;
  const stored = Array.isArray(contest.prize_distribution) ? contest.prize_distribution : [];
  const rows = stored.length
    ? stored.map((row) => ({
      rank_label: row.rank_label || row.label || 'Rank',
      rank_start: parseInt(row.rank_start || 1, 10),
      rank_end: parseInt(row.rank_end || row.rank_start || 1, 10),
      winners_count: parseInt(row.winners || row.winners_count || 1, 10),
      percentage: num(row.percent || row.percentage),
      per_winner_amount: num(row.per_winner || row.perWinner || row.per_winner_amount),
    }))
    : buildDynamicPrizeDistribution(
      Math.max(1, Math.round((num(contest.participants) * num(contest.winning_percentage || 30)) / 100)),
      num(contest.prize_pool),
      contest.category || 'mega'
    );
  if (!rows.length) return [];
  await ContestPerformancePrize.insertMany(rows.map((row) => ({
    ...row,
    contest_id: publicId(contest),
    contest_old_id: contest.old_id,
    prize_amount: num(row.per_winner_amount) * num(row.winners_count || 1),
    created_at: new Date(),
    updated_at: new Date(),
  })));
  return ContestPerformancePrize.find({ contest_id: publicId(contest) }).sort({ rank_start: 1 }).lean();
}

function prizeForRank(prizes, rank) {
  const row = prizes.find((dist) => rank >= dist.rank_start && rank <= dist.rank_end);
  return row ? num(row.per_winner_amount) : 0;
}

const calculateResults = async (req, res) => {
  try {
    const contestId = input(req, 'contest_id');
    const creditWallet = input(req, 'credit_wallet');
    const shouldCredit = creditWallet == null ? true : Boolean(creditWallet) && creditWallet !== '0';
    const contest = await findByPublicId(Contest, contestId);
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });
    const session = await findByPublicId(LeagueSession, contest.league_session_id);
    const prices = priceMaps(session);
    if (!Object.keys(prices.start).length || !Object.keys(prices.end).length) {
      return res.status(400).json({ success: false, error: 'Start or end prices not available' });
    }
    const entries = await ContestEntry.find({ contest_id: { $in: keysOf(contest) } }).lean();
    let resultsCalculated = 0;
    for (const entry of entries) {
      const basket = await findByPublicId(SavedBasket, entry.basket_id);
      const scored = scoreAssets(basket && basket.assets, basket && basket.multipliers, prices);
      await ContestEntry.updateOne({ _id: entry._id }, { $set: { total_score: scored.total, updated_at: new Date() } });
      entry.total_score = scored.total;
      resultsCalculated += 1;
    }
    const ranked = entries.slice().sort((a, b) => num(b.total_score) - num(a.total_score));
    let currentRank = 1;
    let previousScore = null;
    for (let index = 0; index < ranked.length; index += 1) {
      const entry = ranked[index];
      if (previousScore !== null && num(entry.total_score) === num(previousScore)) {
        // keep currentRank
      } else {
        currentRank = index + 1;
      }
      await ContestEntry.updateOne({ _id: entry._id }, { $set: { rank: currentRank } });
      entry.rank = currentRank;
      previousScore = entry.total_score;
    }
    const prizes = await prizesFor(contest);
    if (shouldCredit && prizes.length && !contest.is_calculated) {
      const seen = new Set();
      for (const entry of ranked) {
        if (seen.has(entry.rank)) continue;
        seen.add(entry.rank);
        const tied = ranked.filter((row) => row.rank === entry.rank);
        let amount = 0;
        if (tied.length > 1) {
          let totalPrize = 0;
          for (let rank = entry.rank; rank < entry.rank + tied.length; rank += 1) totalPrize += prizeForRank(prizes, rank);
          amount = Math.floor(Math.round((totalPrize / tied.length) * 100) / 100);
        } else {
          amount = Math.floor(prizeForRank(prizes, entry.rank));
        }
        if (amount <= 0) continue;
        for (const winner of tied) {
          const txId = `CONTEST_${publicId(contest)}_ENTRY_${winner.old_id != null ? winner.old_id : winner._id}`;
          const exists = await Transaction.findOne({ transaction_id: txId }).select('_id').lean();
          if (exists) continue;
          const user = await findByPublicId(User, winner.user_id);
          if (user) await User.updateOne({ _id: user._id }, { $inc: { winnings_balance: amount } });
          await Transaction.create({
            user_id: user ? publicId(user) : winner.user_id,
            type: 'winnings',
            amount,
            status: 'success',
            transaction_id: txId,
            description: `Prize for ${String(contest.category || '').toUpperCase()} contest ${publicId(contest)}, entry ${winner.old_id != null ? winner.old_id : winner._id}`,
          });
        }
      }
      await Contest.updateOne({ _id: contest._id }, { $set: { is_calculated: true } });
    }
    return res.json({
      success: true,
      message: `Results calculated and prizes distributed for ${resultsCalculated} entries`,
      entries_processed: resultsCalculated,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

function contestBlock(contest, sessionEntries, prizes) {
  const entries = sessionEntries.slice().sort((a, b) => num(b.total_score) - num(a.total_score));
  const prizeCalculation = [];
  const transactions = [];
  entries.forEach((entry) => {
    const prize = prizeForRank(prizes, entry.rank);
    const entryId = entry.old_id != null ? entry.old_id : entry._id;
    prizeCalculation.push({
      entry_id: entryId,
      user_id: entry.user_id,
      rank: entry.rank,
      total_score: entry.total_score,
      prize_amount: prize,
    });
    if (prize > 0) {
      transactions.push({
        user_id: entry.user_id,
        type: 'winnings',
        amount: prize,
        transaction_id: `CONTEST_${publicId(contest)}_ENTRY_${entryId}`,
        description: `Prize for ${String(contest.category || '').toUpperCase()} contest ${publicId(contest)}, entry ${entryId}`,
      });
    }
  });
  return {
    contest_id: publicId(contest),
    contest_category: contest.category || null,
    contest_status: contest.status,
    entry_fee: contest.entry_fee,
    prize_pool: contest.prize_pool,
    total_spots: contest.participants || 0,
    filled_spots: entries.length,
    prizes,
    entries,
    prize_calculation: prizeCalculation,
    transactions,
  };
}

async function sessionResult(session) {
  const contests = await Contest.find({ league_session_id: { $in: keysOf(session) } }).sort({ old_id: 1 }).lean();
  const blocks = [];
  for (const contest of contests) {
    const prizes = await ContestPerformancePrize.find({
      $or: [{ contest_id: { $in: keysOf(contest) } }, { contest_old_id: contest.old_id }],
    }).sort({ rank_start: 1 }).lean();
    const entries = await ContestEntry.find({ contest_id: { $in: keysOf(contest) } }).lean();
    blocks.push(contestBlock(contest, entries, prizes));
  }
  return {
    session_id: publicId(session),
    session_name: session.name,
    session_status: session.status,
    start_time: sqlDate(session.start_time),
    end_time: sqlDate(session.end_time),
    contests: blocks,
  };
}

const debugCalculateContest = async (req, res) => {
  try {
    const contestId = req.query.contest_id;
    if (contestId) {
      const contest = await findByPublicId(Contest, contestId);
      if (!contest) return res.status(404).json({ error: 'Contest not found' });
      const session = await findByPublicId(LeagueSession, contest.league_session_id);
      if (!session) return res.status(404).json({ error: 'Contest not found' });
      return res.json(await sessionResult(session));
    }
    const sessions = await LeagueSession.find({ status: 'completed' }).sort({ old_id: -1 }).lean();
    const result = [];
    for (const session of sessions) result.push(await sessionResult(session));
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, trace: err.stack });
  }
};

const testCalculateContest = async (req, res) => {
  try {
    const contestId = req.query.contest_id;
    if (!contestId) return res.status(400).json({ success: false, error: 'contest_id is required' });
    const contest = await findByPublicId(Contest, contestId);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    const session = await findByPublicId(LeagueSession, contest.league_session_id);
    if (!session) return res.status(404).json({ error: 'Contest not found' });
    const result = await sessionResult(session);
    for (const block of result.contests) {
      const fakeReq = { body: { contest_id: block.contest_id, credit_wallet: true }, query: {} };
      const payload = await new Promise((resolve) => {
        const fakeRes = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          json(body) { resolve({ status: this.statusCode, body }); },
        };
        calculateResults(fakeReq, fakeRes);
      });
      block.calculation_result = payload.body;
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, trace: err.stack });
  }
};

const debugPayment = async (req, res) => {
  const data = req.query.data;
  try {
    const urlDecoded = decodeURIComponent(data || '');
    const base64Decoded = Buffer.from(urlDecoded, 'base64').toString('utf8');
    const parsed = JSON.parse(base64Decoded);
    const user = await findByPublicId(User, parsed.user_id || 0);
    const nowMs = Date.now();
    return res.json({
      step1_encrypted: data,
      step2_url_decoded: urlDecoded,
      step3_base64_decoded: base64Decoded,
      step4_json_parsed: parsed,
      step5_user_exists: Boolean(user),
      step6_user_data: user ? { id: publicId(user), name: user.name } : null,
      step7_timestamp_diff: parsed.timestamp != null ? (nowMs - Number(parsed.timestamp)) : null,
      step8_timestamp_valid: parsed.timestamp != null ? ((nowMs - Number(parsed.timestamp)) < 600000) : false,
      logs: [],
    });
  } catch (err) {
    return res.json({ error: err.message, trace: err.stack });
  }
};

const checkWallet = async (req, res) => {
  const orderId = req.query.order_id;
  const user = await findByPublicId(User, req.query.user_id);
  const payment = orderId ? await Payment.findOne({ order_id: orderId }).lean() : null;
  const transaction = orderId ? await Transaction.findOne({ transaction_id: orderId }).lean() : null;
  return res.json({
    payment,
    user_wallet: user ? {
      deposit_balance: user.deposit_balance,
      winnings_balance: user.winnings_balance,
      total: num(user.deposit_balance) + num(user.winnings_balance),
    } : null,
    transaction,
    callback_logs: payment,
  });
};

const checkLatestPayment = async (req, res) => {
  const user = await findByPublicId(User, req.query.user_id);
  const payment = user
    ? await Payment.findOne({ user_id: { $in: keysOf(user) } }).sort({ created_at: -1 }).lean()
    : null;
  return res.json({
    payment_status: payment ? payment.payment_status : 0,
    amount: payment ? payment.amount : 0,
    order_id: payment ? payment.order_id : null,
  });
};

const testPaymentAdd = async (req, res) => {
  const userId = req.query.user_id == null ? 272 : req.query.user_id;
  const amount = req.query.amount == null ? 200 : num(req.query.amount);
  const orderId = `TEST_${Math.floor(Date.now() / 1000)}`;
  try {
    await Payment.create({ order_id: orderId, user_id: Number(userId) || userId, amount, payment_status: 1 });
    const user = await findByPublicId(User, userId);
    if (user) await User.updateOne({ _id: user._id }, { $inc: { deposit_balance: amount } });
    await Transaction.create({
      user_id: user ? publicId(user) : userId,
      type: 'deposit',
      amount,
      transaction_id: orderId,
      description: 'Test deposit',
      status: 'success',
    });
    if (!user) return res.json({ error: 'User not found' });
    const fresh = await User.findById(user._id).lean();
    return res.json({
      success: true,
      order_id: orderId,
      amount_added: amount,
      new_balance: num(fresh.deposit_balance) + num(fresh.winnings_balance),
    });
  } catch (err) {
    return res.json({ error: err.message });
  }
};

const triggerCallback = async (req, res) => {
  const orderId = req.query.order_id;
  if (!orderId) return res.json({ error: 'order_id required' });
  const order = await Payment.findOne({ order_id: orderId });
  if (!order) return res.json({ error: 'Order not found' });
  if (Number(order.payment_status) !== 0) return res.json({ error: 'Already processed' });
  try {
    order.payment_status = 1;
    await order.save();
    const user = await findByPublicId(User, order.user_id);
    if (user) await User.updateOne({ _id: user._id }, { $inc: { deposit_balance: num(order.amount) } });
    await Transaction.create({
      user_id: user ? publicId(user) : order.user_id,
      type: 'deposit',
      amount: num(order.amount),
      transaction_id: orderId,
      description: 'Deposit via LG Pay',
      status: 'success',
    });
    return res.json({ success: true, message: 'Callback processed' });
  } catch (err) {
    return res.json({ error: err.message });
  }
};

module.exports = {
  saveStartPrices,
  saveEndPrices,
  calculateResults,
  saveApiStructure,
  debugPayment,
  checkWallet,
  checkLatestPayment,
  testPaymentAdd,
  triggerCallback,
  testCalculateContest,
  debugCalculateContest,
};
