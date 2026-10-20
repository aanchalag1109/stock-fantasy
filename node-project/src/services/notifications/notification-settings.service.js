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
 * Admin-configurable settings, stored as one object under the `notification_settings`
 * key of the existing settings collection. Read fresh on every use so admin changes
 * apply immediately. Missing or partial values fall back to DEFAULTS.
 */

const Setting = require('../../models/setting.model');

const SETTINGS_KEY = 'notification_settings';

// Event catalogue: label, user preference category and default on/off.
const EVENTS = {
  session_reminder: { label: 'Session reminders', group: 'Sessions', preference: 'session_reminders', default: true },
  winnings_credited: { label: 'Winnings credited', group: 'Winnings', preference: 'winnings', default: true },
  deposit_initiated: { label: 'Deposit order created (pending payment)', group: 'Deposits', preference: 'transactions', default: false },
  deposit_success: { label: 'Deposit successful', group: 'Deposits', preference: 'transactions', default: true },
  deposit_failed: { label: 'Deposit failed / rejected', group: 'Deposits', preference: 'transactions', default: true },
  withdrawal_submitted: { label: 'Withdrawal request submitted', group: 'Withdrawals', preference: 'transactions', default: true },
  withdrawal_approved: { label: 'Withdrawal approved', group: 'Withdrawals', preference: 'transactions', default: true },
  withdrawal_completed: { label: 'Withdrawal marked successful', group: 'Withdrawals', preference: 'transactions', default: true },
  withdrawal_rejected: { label: 'Withdrawal rejected (refunded)', group: 'Withdrawals', preference: 'transactions', default: true },
  refund_credited: { label: 'Contest cancelled — entry fee refunded', group: 'Other', preference: 'transactions', default: true },
  wallet_adjusted: { label: 'Wallet adjusted by admin', group: 'Other', preference: 'transactions', default: true },
  kyc_approved: { label: 'KYC approved', group: 'Other', preference: 'account', default: true },
  kyc_rejected: { label: 'KYC rejected', group: 'Other', preference: 'account', default: true },
};

const MAX_REMINDERS = 5;
const MAX_REMINDER_MINUTES = 1440;

const DEFAULTS = {
  push_enabled: true,
  session_reminder_minutes: [30, 5],
  events: Object.fromEntries(Object.entries(EVENTS).map(([key, e]) => [key, e.default])),
};

// Accepts "30, 5", [30, 5] or ["30","5"]. Returns { minutes } or { error }.
function parseReminderMinutes(input) {
  const parts = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[\s,]+/);
  const values = parts.map((p) => String(p).trim()).filter(Boolean);
  if (!values.length) return { error: 'Enter at least one reminder time.' };
  if (values.some((v) => !/^\d+$/.test(v))) return { error: 'Reminder times must be whole numbers of minutes.' };
  const minutes = [...new Set(values.map(Number))].sort((a, b) => b - a);
  if (minutes.some((m) => m < 1 || m > MAX_REMINDER_MINUTES)) return { error: `Reminder times must be between 1 and ${MAX_REMINDER_MINUTES} minutes.` };
  if (minutes.length > MAX_REMINDERS) return { error: `At most ${MAX_REMINDERS} reminder times are allowed.` };
  return { minutes };
}

function merge(stored) {
  const value = stored && typeof stored === 'object' ? stored : {};
  const parsed = parseReminderMinutes(value.session_reminder_minutes);
  const events = { ...DEFAULTS.events };
  Object.keys(EVENTS).forEach((key) => {
    if (value.events && typeof value.events[key] === 'boolean') events[key] = value.events[key];
  });
  return {
    push_enabled: typeof value.push_enabled === 'boolean' ? value.push_enabled : DEFAULTS.push_enabled,
    session_reminder_minutes: parsed.minutes || DEFAULTS.session_reminder_minutes.slice(),
    events,
  };
}

async function getSettings() {
  const row = await Setting.findOne({ key: SETTINGS_KEY }).lean();
  return merge(row && row.value);
}

/** Validates the admin form body. Returns { values, errors }. */
function validate(body = {}) {
  const errors = {};
  const parsed = parseReminderMinutes(body.session_reminder_minutes);
  if (parsed.error) errors.session_reminder_minutes = parsed.error;
  const enabled = new Set([].concat(body.events || []).map(String));
  const values = {
    push_enabled: body.push_enabled === '1' || body.push_enabled === 'on' || body.push_enabled === true,
    session_reminder_minutes: parsed.minutes || [],
    events: Object.fromEntries(Object.keys(EVENTS).map((key) => [key, enabled.has(key)])),
  };
  return { values, errors };
}

async function saveSettings(values) {
  await Setting.findOneAndUpdate({ key: SETTINGS_KEY }, { key: SETTINGS_KEY, value: values }, { upsert: true });
  return getSettings();
}

module.exports = { SETTINGS_KEY, EVENTS, DEFAULTS, getSettings, validate, saveSettings, parseReminderMinutes };
