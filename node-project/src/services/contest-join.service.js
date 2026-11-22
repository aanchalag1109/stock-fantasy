'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Fantasy Contest Formats — safe contest joining
 * Purpose: One join flow for POST /api/v1/bulk-join-contest and
 *          POST /api/v1/contests/bulk-join (same request and response as before).
 * Origin: Replaces the two converted join handlers; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Fixes over the previous handlers:
 *   - the entry fee is the contest's own fee; the app's `entry_fee` is only compared
 *     with it (a mismatch means the app shows a stale fee → 409, nothing charged);
 *   - joining closes when the session starts (status upcoming and start_time in the future);
 *   - joins to one contest are serialised with a short lease on the contest
 *     (join_lock_at), so spots can never be overbooked — an H2H never gets 3 players;
 *   - the wallet is debited with one atomic, conditional update (winnings first, then
 *     deposit — client feedback; it was deposit first), so two requests can never spend the
 *     same balance; a failed entry is refunded exactly as it was charged, and the split is
 *     saved on the entry and its transaction so a cancellation refunds each wallet its part.
 * MongoDB here is not a replica set, so multi-document transactions are not used.
 */

const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const LeagueSession = require('../models/league-session.model');
const SavedBasket = require('../models/saved-basket.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const logger = require('../config/logger');
const { createNextIfFull } = require('./contest-auto-create.service');
const sessionAssets = require('./session-assets.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT: basket pick limits
const {
  keysOf, publicId, num, round2, walletOf, findByPublicId, ensureOldId, unreadCount,
} = require('../helpers/mobile-compat');

const LOCK_MS = 15000;      // a crashed request frees the contest after this
const LOCK_WAIT_MS = 5000;  // how long a join waits for another join to finish
const LOCK_POLL_MS = 100;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const fail = (status, message, extra = {}) => ({ status, body: { success: false, message, ...extra } });

async function acquireLock(contestId) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const now = new Date();
    const res = await Contest.updateOne(
      { _id: contestId, $or: [{ join_lock_at: null }, { join_lock_at: { $lt: new Date(now.getTime() - LOCK_MS) } }] },
      { $set: { join_lock_at: now } },
    );
    if (res.modifiedCount) return now;
    if (Date.now() >= deadline) return null;
    await sleep(LOCK_POLL_MS);
  }
}

const releaseLock = (contestId, token) => Contest.updateOne({ _id: contestId, join_lock_at: token }, { $set: { join_lock_at: null } });

const ifNull0 = (field) => ({ $ifNull: [field, 0] });

/**
 * Atomically takes `fee` from the user's winnings balance first, then deposit.
 * (NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — was deposit first, then winnings.)
 * Returns { fromDeposit, fromWinnings } or null when the balance is too low.
 */
async function debit(userId, fee) {
  if (!(fee > 0)) return { fromDeposit: 0, fromWinnings: 0 };
  const winnings = { $max: [0, ifNull0('$winnings_balance')] };
  const before = await User.findOneAndUpdate(
    { _id: userId, $expr: { $gte: [{ $add: [winnings, ifNull0('$deposit_balance')] }, fee] } },
    [{
      $set: {
        // take only what is there: a negative winnings balance stays as it is (never reset to 0)
        winnings_balance: { $subtract: [ifNull0('$winnings_balance'), { $min: [winnings, fee] }] },
        deposit_balance: { $subtract: [ifNull0('$deposit_balance'), { $max: [0, { $subtract: [fee, winnings] }] }] },
      },
    }],
    { new: false, updatePipeline: true },
  ).lean();
  if (!before) return null;
  const fromWinnings = Math.min(Math.max(0, num(before.winnings_balance)), fee);
  return { fromWinnings: round2(fromWinnings), fromDeposit: round2(fee - fromWinnings) };
}

const refund = (userId, charge) => (charge.fromDeposit || charge.fromWinnings
  ? User.updateOne({ _id: userId }, { $inc: { deposit_balance: charge.fromDeposit, winnings_balance: charge.fromWinnings } })
  : null);

/** Same "joining is open" rule joinContest applies. */
function isJoinOpen(contest, session) {
  if (!contest || ['cancelled', 'completed', 'live'].includes(contest.status)) return false;
  return !!session && session.status === 'upcoming' && new Date(session.start_time) > new Date();
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: how many baskets the user may select when joining now —
 * the smaller of their remaining entries and the contest's spots left (0 when joining is closed).
 * joinContest rejects anything above this, so the app can cap its basket selection with it.
 */
function selectionLimit(contest, session, joinedCount, userEntryCount) {
  const maxEntries = parseInt(contest.max_entries_per_user || 1, 10);
  const remainingEntries = Math.max(0, maxEntries - (userEntryCount || 0));
  const spotsLeft = Math.max(0, parseInt(contest.participants || 100, 10) - (joinedCount || 0));
  return {
    remaining_entries: remainingEntries,
    spots_left: spotsLeft,
    max_selectable: isJoinOpen(contest, session) ? Math.min(remainingEntries, spotsLeft) : 0,
  };
}

/**
 * @param {{ userRef, contestRef, basketIds: Array, clientEntryFee? }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function joinContest({ userRef, contestRef, basketIds, clientEntryFee }) {
  const ids = [...new Set([].concat(basketIds || []).filter((id) => id != null && id !== '').map(String))];
  const [user, contest] = await Promise.all([findByPublicId(User, userRef), findByPublicId(Contest, contestRef)]);
  if (!user || !contest || !ids.length) return fail(400, 'Invalid input');
  const plain = contest.toObject ? contest.toObject() : contest;

  if (['cancelled', 'completed', 'live'].includes(plain.status)) return fail(400, 'This contest is closed for joining.');
  const session = await findByPublicId(LeagueSession, plain.league_session_id);
  if (!isJoinOpen(plain, session)) {
    return fail(400, 'Joining is closed — this session has already started.');
  }

  const fee = round2(num(plain.entry_fee));
  if (clientEntryFee !== undefined && clientEntryFee !== null && String(clientEntryFee).trim() !== ''
      && Math.abs(num(clientEntryFee) - fee) > 0.009) {
    return fail(409, 'The entry fee for this contest has changed. Please refresh and try again.', { entry_fee: fee });
  }

  const token = await acquireLock(contest._id);
  if (!token) return fail(409, 'Many players are joining this contest right now. Please try again.');
  const userKeys = keysOf(user).map(String);
  let successCount = 0;
  let joinedUsers = 0;
  let userEntryCount = 0;
  const errors = [];
  const maxParticipants = parseInt(plain.participants || 100, 10);
  const maxEntries = parseInt(plain.max_entries_per_user || 1, 10);
  try {
    const existing = await ContestEntry.find({ contest_id: { $in: keysOf(plain) } }).lean();
    const available = maxParticipants - existing.length;
    if (available <= 0) return fail(400, 'This contest is full.');
    if (ids.length > available) return fail(400, `Only ${available} spots available in this contest`);
    const userEntries = existing.filter((entry) => userKeys.includes(String(entry.user_id)));
    const remaining = maxEntries - userEntries.length;
    if (ids.length > remaining) return fail(400, `You can only select ${Math.max(0, remaining)} more baskets`);
    if (walletOf(user) < fee * ids.length) return fail(400, 'Insufficient balance');

    const joinedBaskets = new Set(userEntries.map((entry) => String(entry.basket_id)));
    for (const basketId of ids) {
      const basket = await findByPublicId(SavedBasket, basketId);
      if (!basket || !userKeys.includes(String(basket.user_id)) || !basket.is_standalone) {
        errors.push(`Basket ${basketId}: Not found`);
        continue;
      }
      if (keysOf(basket).some((key) => joinedBaskets.has(String(key)))) {
        errors.push(`Basket ${basketId}: Already joined`);
        continue;
      }
      // NEW IMPLEMENTATION — NODE.JS PROJECT: per-category pick limits (client feedback) — a basket saved
      // before the limits, or by an older app, can't join until it is edited to fit them. Nothing charged.
      const limitErrors = sessionAssets.checkBasket(session, basket.assets || []);
      if (limitErrors.length) {
        errors.push(`Basket ${basket.serial_no || basketId}: ${limitErrors.join(' ')}`);
        continue;
      }
      const charge = await debit(user._id, fee);
      if (!charge) {
        errors.push(`Basket ${basketId}: Insufficient balance`);
        break;
      }
      let entry;
      try {
        entry = await ContestEntry.create({
          user_id: user._id,
          contest_id: contest._id,
          basket_id: basket._id,
          session_id: plain.league_session_id,
          total_score: 0,
          // NEW IMPLEMENTATION — NODE.JS PROJECT: refunds go back to the wallet each part came from
          fee_from_winnings: charge.fromWinnings,
          fee_from_deposit: charge.fromDeposit,
        });
      } catch (err) {
        await refund(user._id, charge);
        logger.error(`[contest-join] entry for contest ${publicId(plain)} failed, fee refunded: ${err.message}`);
        errors.push(`Basket ${basketId}: Could not join, please try again`);
        continue;
      }
      await ensureOldId(ContestEntry, entry);
      await Transaction.create({
        user_id: user._id,
        contest_id: contest._id,
        type: 'contest_entry',
        amount: fee,
        status: 'success',
        transaction_id: `ENTRY_${publicId(plain)}_${publicId(entry)}_${Math.floor(Date.now() / 1000)}_${Math.floor(1000 + Math.random() * 9000)}`,
        description: `Entry fee for Contest #${publicId(plain)}, entry ${publicId(entry)}`,
        from_winnings: charge.fromWinnings,
        from_deposit: charge.fromDeposit,
      });
      keysOf(basket).forEach((key) => joinedBaskets.add(String(key)));
      successCount += 1;
    }
    joinedUsers = existing.length + successCount;
    userEntryCount = userEntries.length + successCount;
  } finally {
    await releaseLock(contest._id, token).catch((err) => logger.error(`[contest-join] lock release failed: ${err.message}`));
  }

  // NEW IMPLEMENTATION — NODE.JS PROJECT: this join filled the contest → open a fresh copy if enabled
  if (plain.auto_create_on_full && successCount > 0 && joinedUsers >= maxParticipants) {
    await createNextIfFull(contest._id);
  }

  const fresh = await User.findById(user._id).lean();
  return {
    status: 200,
    body: {
      success: true,
      message: `Joined with ${successCount} basket(s)`,
      success_count: successCount,
      errors,
      wallet_balance: walletOf(fresh || user),
      contest_updated: {
        id: publicId(plain),
        joined_users: joinedUsers,
        spots_left: Math.max(0, maxParticipants - joinedUsers),
        user_entry_count: userEntryCount,
        remaining_entries: Math.max(0, maxEntries - userEntryCount),
      },
      should_refresh: true,
      unread_notifications: await unreadCount(fresh || user),
    },
  };
}

module.exports = { joinContest, debit, acquireLock, releaseLock, LOCK_MS, isJoinOpen, selectionLimit };
