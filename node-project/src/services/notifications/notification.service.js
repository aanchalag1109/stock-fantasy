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
 * notify(event, { user, dedupeKey, params, data }) is called by existing flows
 * AFTER their own work (and DB transaction) has completed. It:
 *   1. skips events the admin has switched off;
 *   2. stores the in-app notification (the existing `notifications` collection)
 *      with a unique dedupe_key, so webhook retries / repeated status updates /
 *      two schedulers can never create the same notification twice;
 *   3. pushes it through FCM unless push is off, the user opted out of that
 *      category, or the user has no device token.
 * It never throws and is not awaited by callers, so it cannot break or slow down
 * deposits, withdrawals or result processing.
 */

const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Notification = require('../../models/notification.model');
const logger = require('../../config/logger');
const fcm = require('./fcm.service');
const { EVENTS, getSettings } = require('./notification-settings.service');

const MAX_PUSH_ATTEMPTS = 3;
const RETRY_WINDOW_MS = 60 * 60 * 1000;
const USER_FIELDS = '_id old_id fcm_token notification_preferences';

// ─── Message templates ───────────────────────────────────────────────────────

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const istTime = (d) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
}).format(new Date(d));
// Admin-entered reasons are already user-facing (shown in the app); trim and cap them.
const reasonText = (r) => {
  const text = String(r || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return text ? ` Reason: ${text}` : '';
};
const ref = (r) => (r ? ` (Ref: ${r})` : '');

const TEMPLATES = {
  session_reminder: (p) => ({
    type: 'session',
    title: `${p.sessionName} starts in ${p.minutesLeft} min`,
    description: `${p.sessionName} starts at ${istTime(p.startTime)} IST. Your contest entries are ready.`,
  }),
  winnings_credited: (p) => ({
    type: 'winning',
    title: `You won ${money(p.amount)}!`,
    description: `${money(p.amount)} from ${p.contestLabel}${p.sessionName ? ` (${p.sessionName})` : ''} has been credited to your winnings balance.`,
  }),
  deposit_initiated: (p) => ({
    type: 'transaction',
    title: 'Deposit pending',
    description: `Your deposit of ${money(p.amount)}${ref(p.reference)} is awaiting payment confirmation.`,
  }),
  deposit_success: (p) => ({
    type: 'transaction',
    title: 'Deposit successful',
    description: `${money(p.amount)} has been added to your wallet${ref(p.reference)}.`,
  }),
  deposit_failed: (p) => ({
    type: 'transaction',
    title: 'Deposit failed',
    description: `Your deposit of ${money(p.amount)}${ref(p.reference)} could not be completed. No amount was added to your wallet.`,
  }),
  withdrawal_submitted: (p) => ({
    type: 'transaction',
    title: 'Withdrawal requested',
    description: `Your withdrawal request of ${money(p.amount)} has been submitted and is pending approval.`,
  }),
  withdrawal_approved: (p) => ({
    type: 'transaction',
    title: 'Withdrawal approved',
    description: `Your withdrawal of ${money(p.amount)} has been approved. The payout will be sent to your registered wallet.`,
  }),
  withdrawal_completed: (p) => ({
    type: 'transaction',
    title: 'Withdrawal successful',
    description: `Your withdrawal of ${money(p.amount)} has been completed.`,
  }),
  withdrawal_rejected: (p) => ({
    type: 'transaction',
    title: 'Withdrawal rejected',
    description: `Your withdrawal of ${money(p.amount)} was rejected and the amount has been refunded to your winnings balance.${reasonText(p.reason)}`,
  }),
  refund_credited: (p) => ({
    type: 'transaction',
    title: 'Entry fee refunded',
    description: `Contest #${p.contestLabel} was cancelled. ${money(p.amount)} has been refunded to your deposit balance.`,
  }),
  wallet_adjusted: (p) => ({
    type: 'transaction',
    title: p.credit ? 'Wallet credited' : 'Wallet debited',
    description: p.credit
      ? `${money(p.amount)} has been added to your ${p.balance} balance.`
      : `${money(p.amount)} has been deducted from your ${p.balance} balance.`,
  }),
  kyc_approved: () => ({
    type: 'account',
    title: 'KYC approved',
    description: 'Your KYC verification has been approved.',
  }),
  kyc_rejected: (p) => ({
    type: 'account',
    title: 'KYC rejected',
    description: `Your KYC verification was rejected.${reasonText(p.reason)} Please resubmit your documents.`,
  }),
};

// ─── Delivery ────────────────────────────────────────────────────────────────

const inFlight = new Set();
function track(promise) {
  inFlight.add(promise);
  promise.finally(() => inFlight.delete(promise));
  return promise;
}
/** Resolves once every notification started so far has finished (used by tests and shutdown). */
const idle = () => Promise.allSettled([...inFlight]);

async function resolveUser(userRef) {
  if (userRef == null) return null;
  const id = userRef._id != null ? userRef._id : userRef;
  const text = String(id);
  if (text.length === 24 && mongoose.isValidObjectId(text)) return User.findById(text).select(USER_FIELDS).lean();
  if (/^\d+$/.test(text)) return User.findOne({ old_id: Number(text) }).select(USER_FIELDS).lean();
  return null;
}

async function deliver(note, user, settings) {
  const category = EVENTS[note.event] && EVENTS[note.event].preference;
  let outcome;
  if (!settings.push_enabled) outcome = { push_status: 'disabled', push_error: 'Push disabled by admin' };
  else if (user.notification_preferences && user.notification_preferences[category] === false) outcome = { push_status: 'skipped', push_error: 'User opted out' };
  else if (!user.fcm_token) outcome = { push_status: 'skipped', push_error: 'No device token' };
  else {
    const result = await fcm.send(user.fcm_token, { title: note.title, body: note.description, data: { ...(note.data || {}), notification_id: note._id, event: note.event } });
    if (result.status === 'sent') outcome = { push_status: 'sent', push_error: null, pushed_at: new Date() };
    else if (result.status === 'disabled') outcome = { push_status: 'disabled', push_error: 'FCM not configured' };
    else if (result.status === 'invalid_token') {
      // Same clean-up as the PHP FCMService: forget tokens FCM reports as unregistered.
      await User.updateOne({ _id: user._id, fcm_token: user.fcm_token }, { $set: { fcm_token: null } });
      outcome = { push_status: 'failed', push_error: `Device token removed: ${result.error}` };
    } else {
      const attempts = (note.push_attempts || 0) + 1;
      outcome = { push_status: result.retryable && attempts < MAX_PUSH_ATTEMPTS ? 'retry' : 'failed', push_error: result.error };
    }
  }
  const attempted = outcome.push_status === 'sent' || outcome.push_status === 'retry' || outcome.push_status === 'failed';
  await Notification.updateOne({ _id: note._id }, { $set: outcome, ...(attempted ? { $inc: { push_attempts: 1 } } : {}) });
  return outcome.push_status;
}

async function run(event, { user: userRef, dedupeKey, params = {}, data = {} }) {
  const template = TEMPLATES[event];
  if (!template || !EVENTS[event]) throw new Error(`Unknown notification event "${event}"`);
  if (!dedupeKey) throw new Error(`notify(${event}) requires a dedupeKey`);

  const settings = await getSettings();
  if (!settings.events[event]) return { status: 'disabled' };

  const user = await resolveUser(userRef);
  if (!user) return { status: 'no_user' };

  const message = template(params);
  let note;
  try {
    note = await Notification.create({
      user_id: user._id,
      title: message.title,
      description: message.description,
      type: message.type,
      is_read: false,
      event,
      dedupe_key: dedupeKey,
      data: { screen: message.type, ...data },
    });
  } catch (err) {
    if (err && err.code === 11000) return { status: 'duplicate' };
    throw err;
  }
  const pushStatus = await deliver(note.toObject ? note.toObject() : note, user, settings);
  return { status: 'created', id: note._id, push_status: pushStatus };
}

/** Fire-and-forget entry point for existing flows. Never rejects. */
function notify(event, options) {
  return track(run(event, options).catch((err) => {
    logger.error(`notify(${event}) failed: ${err.message}`);
    return { status: 'error', error: err.message };
  }));
}

/** Re-attempts pushes that failed for a transient reason (scheduler, every minute). */
async function retryPendingPushes(now = new Date()) {
  const settings = await getSettings();
  const notes = await Notification.find({
    push_status: 'retry',
    push_attempts: { $lt: MAX_PUSH_ATTEMPTS },
    created_at: { $gte: new Date(now.getTime() - RETRY_WINDOW_MS) },
  }).limit(100).lean();
  let retried = 0;
  for (const note of notes) {
    const user = await resolveUser(note.user_id);
    if (!user) {
      await Notification.updateOne({ _id: note._id }, { $set: { push_status: 'failed', push_error: 'User not found' } });
      continue;
    }
    await deliver(note, user, settings);
    retried += 1;
  }
  // Pushes that are still waiting after the window are given up on.
  await Notification.updateMany(
    { push_status: 'retry', created_at: { $lt: new Date(now.getTime() - RETRY_WINDOW_MS) } },
    { $set: { push_status: 'failed', push_error: 'Gave up after retry window' } },
  );
  return { retried };
}

module.exports = { notify, idle, retryPendingPushes, TEMPLATES, money, istTime };
