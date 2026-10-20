'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Purpose: Send session reminders, winning amount notifications,
 *          and deposit/withdrawal notifications.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Session reminders, run every minute by src/scheduler.js.
 *
 * Session entity: LeagueSession (start_time stored in UTC; shown in IST like the
 * rest of the app). Eligible: sessions with status "upcoming" and active !== false —
 * draft, live, completing, completed and cancelled sessions never get reminders.
 * Recipients: users with a ContestEntry in a non-cancelled contest of the session,
 * excluding test users and users who turned session reminders off.
 *
 * For each session the smallest configured offset that still applies is used, so a
 * session created 4 minutes before start gets a single "5 min" reminder rather than
 * both the 30 and 5 minute ones. The dedupe key includes the start time, so moving a
 * session re-arms its reminders while repeated ticks never send twice.
 */

const mongoose = require('mongoose');
const LeagueSession = require('../../models/league-session.model');
const Contest = require('../../models/contest.model');
const ContestEntry = require('../../models/contest-entry.model');
const User = require('../../models/user.model');
const Notification = require('../../models/notification.model');
const { getSettings } = require('./notification-settings.service');
const { notify } = require('./notification.service');

const keysOf = (doc) => (doc.old_id != null ? [doc._id, doc.old_id] : [doc._id]);
const publicId = (doc) => (doc.old_id != null ? Number(doc.old_id) : String(doc._id));

async function eligibleUsers(session) {
  const contests = await Contest.find({ league_session_id: { $in: keysOf(session) }, status: { $ne: 'cancelled' } })
    .select('_id old_id').lean();
  if (!contests.length) return [];
  const userIds = await ContestEntry.distinct('user_id', { contest_id: { $in: contests.flatMap(keysOf) } });
  const objectIds = userIds.filter((id) => String(id).length === 24 && mongoose.isValidObjectId(String(id)));
  const oldIds = userIds.filter((id) => /^\d+$/.test(String(id)) && String(id).length < 24).map(Number);
  const clauses = [];
  if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
  if (oldIds.length) clauses.push({ old_id: { $in: oldIds } });
  if (!clauses.length) return [];
  return User.find({
    $or: clauses,
    is_test_user: { $ne: true },
    'notification_preferences.session_reminders': { $ne: false },
  }).select('_id').lean();
}

async function runSessionReminders(now = new Date()) {
  const settings = await getSettings();
  if (!settings.events.session_reminder) return { sessions: 0, queued: 0 };
  const offsets = settings.session_reminder_minutes.slice().sort((a, b) => a - b);
  const horizon = new Date(now.getTime() + offsets[offsets.length - 1] * 60000);

  const sessions = await LeagueSession.find({
    status: 'upcoming',
    active: { $ne: false },
    start_time: { $gt: now, $lte: horizon },
  }).select('_id old_id name start_time').lean();

  let queued = 0;
  for (const session of sessions) {
    const start = new Date(session.start_time);
    const minutesLeft = (start.getTime() - now.getTime()) / 60000;
    const offset = offsets.find((o) => o >= minutesLeft);
    const users = await eligibleUsers(session);
    if (!users.length) continue;

    const keyFor = (user) => `session_reminder:${session._id}:${start.getTime()}:${offset}:${user._id}`;
    const already = new Set(await Notification.distinct('dedupe_key', { dedupe_key: { $in: users.map(keyFor) } }));
    for (const user of users) {
      if (already.has(keyFor(user))) continue;
      notify('session_reminder', {
        user,
        dedupeKey: keyFor(user),
        params: { sessionName: session.name, startTime: start, minutesLeft: Math.max(1, Math.round(minutesLeft)) },
        data: { screen: 'session', session_id: publicId(session), reminder_minutes: offset },
      });
      queued += 1;
    }
  }
  return { sessions: sessions.length, queued };
}

module.exports = { runSessionReminders };
