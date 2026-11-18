'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Fantasy Contest Formats (H2H, Winner Takes All, 2x–10x multipliers)
 * Purpose: One place for the rules of every contest type — how many players win,
 *          how the prize pool is split, how many players a contest needs to run,
 *          and the labels/badges shown in the app and admin.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Types (stored in contest.category):
 *   mega             ranked prize tiers; pool = entries × fee − platform fee     (existing)
 *   equal            every winner gets the same amount; winners = winning %       (existing)
 *   guaranteed       fixed prize table set by admin                               (existing)
 *   practice         free / fixed prize table                                     (existing)
 *   h2h              2 spots, 1 winner takes the pool                              (new)
 *   winner_takes_all any size, only rank 1 is paid                                 (new)
 *   multiplier       1 in N wins (N = 2,3,4,5,8,10); winners split the pool equally (new)
 *
 * Pools of the new types grow with actual joins (like mega/equal). A multiplier contest
 * that does not fill pays floor(joined / N) winners, who share the whole prize pool, so
 * each winner gets at least N × entry fee less the platform fee.
 *
 * This module is pure (no database access) so the app APIs, admin, results job and
 * payout all use the same rules.
 */

const LEGACY_MIN_PARTICIPANTS = 10; // PHP rule kept for existing contest types
const MULTIPLIERS = [2, 3, 4, 5, 8, 10];

const FORMATS = {
  mega: { label: 'Mega', badge: null, equalSplit: false, fixedPool: false },
  equal: { label: 'Equal Prize', badge: null, equalSplit: true, fixedPool: false },
  guaranteed: { label: 'Guaranteed', badge: 'Guaranteed', equalSplit: false, fixedPool: true },
  practice: { label: 'Practice', badge: 'Practice', equalSplit: false, fixedPool: true },
  h2h: { label: 'Head to Head', badge: 'H2H', equalSplit: true, fixedPool: false, singleWinner: true, spots: 2, minPlayers: 2 },
  winner_takes_all: { label: 'Winner Takes All', badge: 'Winner Takes All', equalSplit: true, fixedPool: false, singleWinner: true, minPlayers: 2 },
  multiplier: { label: 'Multiplier', badge: null, equalSplit: true, fixedPool: false },
};
const CATEGORIES = Object.keys(FORMATS);
const NEW_FORMATS = ['h2h', 'winner_takes_all', 'multiplier'];

const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

/** The contest's type; unknown/legacy values (e.g. "flexible") behave like mega. */
function formatOf(contest) {
  const key = String((contest && contest.category) || '').toLowerCase().trim();
  return FORMATS[key] ? key : 'mega';
}

function multiplierOf(contest) {
  const n = parseInt(contest && contest.multiplier, 10);
  return MULTIPLIERS.includes(n) ? n : null;
}

const isNewFormat = (contest) => NEW_FORMATS.includes(formatOf(contest));
const isEqualSplitCategory = (category) => !!(FORMATS[String(category || '').toLowerCase().trim()] || {}).equalSplit;
/** Fixed prize table (guaranteed / practice); everything else grows with joins. */
const isFixedPool = (contest) => !!(contest && contest.is_fixed_prize) || !!FORMATS[formatOf(contest)].fixedPool;

/**
 * Number of paid ranks for `joined` entries.
 * Existing types keep their winning-% rule exactly (fallbackPct when unset).
 */
function winnersFor(contest, joined, fallbackPct = 30) {
  const count = Math.max(0, Math.floor(Number(joined) || 0));
  if (!count) return 0;
  const format = formatOf(contest);
  if (FORMATS[format].singleWinner) return 1;
  if (format === 'multiplier') return Math.floor(count / (multiplierOf(contest) || 2));
  const raw = contest && contest.winning_percentage;
  const pct = raw == null || raw === '' || Number.isNaN(Number(raw)) ? fallbackPct : Number(raw);
  return Math.max(1, Math.floor(count * (pct / 100)));
}

/** Smallest number of players a format can ever run with. */
function formatFloor(contest) {
  const format = formatOf(contest);
  if (format === 'multiplier') return multiplierOf(contest) || 2;
  return FORMATS[format].minPlayers || 1;
}

/**
 * Entries needed for the contest to run when the session ends; below this the contest
 * is cancelled and every entry fee refunded. Admin value, never below the format floor.
 */
function minParticipantsFor(contest) {
  const own = parseInt(contest && contest.min_participants, 10);
  const floor = formatFloor(contest);
  if (Number.isFinite(own) && own >= 1) return Math.max(own, floor);
  return isNewFormat(contest) ? floor : LEGACY_MIN_PARTICIPANTS;
}

/** "Head to Head", "Winner Takes All", "4x", "Mega", … */
function labelFor(contest) {
  if (formatOf(contest) === 'multiplier') return `${multiplierOf(contest) || 2}x`;
  return FORMATS[formatOf(contest)].label;
}

/** Type badge for the app ("H2H", "4x", …); null for plain mega/equal contests. */
function formatBadge(contest) {
  if (formatOf(contest) === 'multiplier') return `${multiplierOf(contest) || 2}x`;
  return FORMATS[formatOf(contest)].badge;
}

/** The single `badge` the app has always shown: Featured wins over the type badge. */
const appBadge = (contest) => (contest && contest.is_pinned ? 'Featured' : formatBadge(contest));

/** One equal-split row: ranks 1..winners share the pool. Admin/stored shape. */
function equalSplitRows(winners, prizePool) {
  if (!(winners > 0) || !(prizePool > 0)) return [];
  return [{
    label: winners === 1 ? 'Rank 1' : `Rank 1 to ${winners}`,
    rank_start: 1,
    rank_end: winners,
    winners,
    per_winner: round2(prizePool / winners),
    prize: round2(prizePool),
    percent: 100,
  }];
}

/** Extra contest fields every contest API returns. */
function publicFields(contest) {
  const spots = parseInt(contest && contest.participants, 10) || 0;
  return {
    contest_format: formatOf(contest),
    format_label: labelFor(contest),
    format_badge: formatBadge(contest),
    multiplier: multiplierOf(contest),
    min_participants: minParticipantsFor(contest),
    total_winners: winnersFor(contest, spots),
  };
}

/**
 * Checks and normalises the type-specific admin inputs. Returns
 * { category, multiplier, participants, maxEntries, minParticipants, errors }.
 */
function validateFormat(body, { participants, maxEntries }) {
  const errors = [];
  const category = String(body.category || '').toLowerCase().trim();
  const out = { category, multiplier: null, participants, maxEntries, minParticipants: null, errors };
  if (!FORMATS[category]) return out; // the caller reports an invalid category

  if (category === 'h2h') {
    out.participants = 2;   // head to head is always 1 vs 1
    out.maxEntries = 1;     // a player cannot fill both spots
  }
  if (category === 'multiplier') {
    const n = parseInt(body.multiplier, 10);
    if (!MULTIPLIERS.includes(n)) errors.push(`Choose a multiplier: ${MULTIPLIERS.map((m) => `${m}x`).join(', ')}.`);
    else {
      out.multiplier = n;
      if (Number.isFinite(participants) && participants >= 2 && (participants < n || participants % n !== 0)) {
        errors.push(`Total spots for a ${n}x contest must be a multiple of ${n} (e.g. ${n * 5}).`);
      }
    }
  }

  const rawMin = body.min_participants;
  if (rawMin !== undefined && rawMin !== null && String(rawMin).trim() !== '') {
    const min = parseInt(rawMin, 10);
    const floor = formatFloor({ category, multiplier: out.multiplier });
    if (!Number.isFinite(min) || String(min) !== String(rawMin).trim()) errors.push('Minimum players must be a whole number.');
    else if (min < floor) errors.push(`Minimum players for this contest type must be at least ${floor}.`);
    else if (Number.isFinite(out.participants) && min > out.participants) errors.push('Minimum players cannot be more than the total spots.');
    else out.minParticipants = min;
  }
  return out;
}

module.exports = {
  FORMATS, CATEGORIES, NEW_FORMATS, MULTIPLIERS, LEGACY_MIN_PARTICIPANTS,
  formatOf, multiplierOf, isNewFormat, isEqualSplitCategory, isFixedPool,
  winnersFor, formatFloor, minParticipantsFor, labelFor, formatBadge, appBadge,
  equalSplitRows, publicFields, validateFormat,
};
