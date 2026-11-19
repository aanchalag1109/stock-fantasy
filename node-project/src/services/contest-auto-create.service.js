'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Auto-create a contest when it fills up
 * Purpose: When a contest with `auto_create_on_full` reaches its `participants` limit, create a
 *          fresh copy (same session, same settings, empty pool) so players can keep joining.
 * Origin: New — the original PHP implementation had no such feature.
 *
 * Exactly-once: the full contest is first claimed by atomically setting `auto_created_contest_id`
 * (only while it is still null); the copy is then created with that same _id. If creating the
 * copy fails, the claim is released so a later join can retry.
 */

const mongoose = require('mongoose');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const LeagueSession = require('../models/league-session.model');
const logger = require('../config/logger');
const { keysOf, publicId, findByPublicId, ensureOldId } = require('../helpers/mobile-compat');

// Per-contest runtime state that must start fresh on the copy.
const RESET_FIELDS = [
  '_id', 'old_id', '__v', 'created_at', 'updated_at',
  'join_lock_at', 'bots_joined', 'is_calculated', 'prizes_distributed',
  'payout_started_at', 'refunds_started_at', 'auto_created_contest_id', 'auto_created_from',
];

/**
 * Creates the follow-up contest if `contestId` has auto-create on and is now full.
 * Never throws — a failure here must not affect the join that triggered it.
 * @returns {Promise<object|null>} the new contest, or null when nothing was created
 */
async function createNextIfFull(contestId) {
  try {
    const contest = await Contest.findById(contestId).lean();
    if (!contest || !contest.auto_create_on_full || contest.auto_created_contest_id) return null;
    if (['cancelled', 'completed', 'live'].includes(contest.status)) return null;

    const capacity = parseInt(contest.participants || 100, 10);
    const joined = await ContestEntry.countDocuments({ contest_id: { $in: keysOf(contest) } });
    if (joined < capacity) return null;

    const session = await findByPublicId(LeagueSession, contest.league_session_id);
    if (!session || session.status !== 'upcoming' || !(new Date(session.start_time) > new Date())) return null;

    const newId = new mongoose.Types.ObjectId();
    const claim = await Contest.updateOne(
      { _id: contest._id, auto_created_contest_id: null },
      { $set: { auto_created_contest_id: newId } },
    );
    if (!claim.modifiedCount) return null; // another call already made the copy

    const copy = { ...contest };
    RESET_FIELDS.forEach((field) => { delete copy[field]; });
    try {
      const created = await Contest.create({
        ...copy,
        _id: newId,
        auto_created_from: contest._id,
        bots_joined: false,
      });
      await ensureOldId(Contest, created); // numeric public id, like every other contest the app sees
      logger.info(`[contest-auto-create] contest ${publicId(contest)} is full — created contest ${publicId(created)}`);
      return created;
    } catch (err) {
      await Contest.updateOne({ _id: contest._id, auto_created_contest_id: newId }, { $set: { auto_created_contest_id: null } });
      throw err;
    }
  } catch (err) {
    logger.error(`[contest-auto-create] contest ${contestId}: ${err.message}`);
    return null;
  }
}

module.exports = { createNextIfFull };
