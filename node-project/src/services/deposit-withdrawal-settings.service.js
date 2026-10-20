'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Deposit and Withdrawal Settings Module
 * Purpose: Manage minimum and maximum deposit and withdrawal limits
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Values live in the existing `settings` key/value collection (Setting model),
 * so they are also returned by the mobile GET settings endpoint.
 */

const Setting = require('../models/setting.model');
const logger = require('../config/logger');

const KEYS = {
  min_deposit_amount: 'Minimum deposit amount',
  max_deposit_amount: 'Maximum deposit amount',
  min_withdrawal_amount: 'Minimum withdrawal amount',
  max_withdrawal_amount: 'Maximum withdrawal amount',
};

// Pre-fill for the admin form only: min_withdrawal_amount mirrors the 500 that used to be
// hard-coded in the wallet controllers. Enforcement (below) never falls back to these.
const DEFAULTS = {
  min_deposit_amount: null,
  max_deposit_amount: null,
  min_withdrawal_amount: 500,
  max_withdrawal_amount: null,
};

const MAX_ALLOWED_AMOUNT = 10000000;

async function getLimits() {
  const rows = await Setting.find({ key: { $in: Object.keys(KEYS) } }).lean();
  const limits = { ...DEFAULTS };
  rows.forEach((row) => {
    const num = Number(row.value);
    if (row.value !== null && row.value !== '' && Number.isFinite(num)) limits[row.key] = num;
  });
  return limits;
}

/**
 * Returns { values, errors }. errors is keyed by field; empty when input is valid.
 */
function validate(input = {}) {
  const values = {};
  const errors = {};

  Object.entries(KEYS).forEach(([key, label]) => {
    const raw = input[key];
    const str = raw === undefined || raw === null ? '' : String(raw).trim();
    if (str === '') { errors[key] = `${label} is required.`; return; }
    if (!/^\d+(\.\d{1,2})?$/.test(str)) { errors[key] = `${label} must be a positive number with at most 2 decimal places.`; return; }
    const num = Number(str);
    if (num <= 0) { errors[key] = `${label} must be greater than 0.`; return; }
    if (num > MAX_ALLOWED_AMOUNT) { errors[key] = `${label} cannot exceed ${MAX_ALLOWED_AMOUNT.toLocaleString('en-IN')}.`; return; }
    values[key] = num;
  });

  if (!errors.min_deposit_amount && !errors.max_deposit_amount && values.min_deposit_amount > values.max_deposit_amount) {
    errors.max_deposit_amount = 'Maximum deposit amount must be greater than or equal to the minimum deposit amount.';
  }
  if (!errors.min_withdrawal_amount && !errors.max_withdrawal_amount && values.min_withdrawal_amount > values.max_withdrawal_amount) {
    errors.max_withdrawal_amount = 'Maximum withdrawal amount must be greater than or equal to the minimum withdrawal amount.';
  }

  return { values, errors };
}

async function saveLimits(values) {
  await Promise.all(Object.keys(KEYS).map((key) =>
    Setting.findOneAndUpdate({ key }, { key, value: values[key] }, { upsert: true })
  ));
  return getLimits();
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Enforce Deposit and Withdrawal Limits in Mobile APIs
 * Purpose: Single server-side check used by every mobile/API flow that initiates a
 *          deposit or withdrawal, before any record is created, balance changed or
 *          payment gateway called.
 *
 * Limits are read fresh from the settings collection on every call, so admin changes
 * apply to the next request. If a limit is missing or invalid the check fails closed
 * (503) instead of allowing an unrestricted transaction.
 */

const LIMIT_RULES = {
  deposit: { label: 'Deposit', minKey: 'min_deposit_amount', maxKey: 'max_deposit_amount' },
  withdrawal: { label: 'Withdrawal', minKey: 'min_withdrawal_amount', maxKey: 'max_withdrawal_amount' },
};

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

class LimitsUnavailableError extends Error {}

// Accepts only plain positive decimals with up to 2 places; returns the normalised string or null.
function parseAmountString(value) {
  const str = value === undefined || value === null ? '' : String(value).trim();
  return AMOUNT_PATTERN.test(str) ? str : null;
}

// Compare in minor units (paise) so values like 99.99 vs 100 never hit float rounding.
function toMinorUnits(str) {
  const [whole, frac = ''] = str.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

async function getEnforcedLimits(kind) {
  const rule = LIMIT_RULES[kind];
  const rows = await Setting.find({ key: { $in: [rule.minKey, rule.maxKey] } }).lean();
  const stored = {};
  rows.forEach((row) => { stored[row.key] = row.value; });

  const min = parseAmountString(stored[rule.minKey]);
  const max = parseAmountString(stored[rule.maxKey]);
  if (!min || !max || toMinorUnits(min) <= 0 || toMinorUnits(min) > toMinorUnits(max)) {
    throw new LimitsUnavailableError(`${kind} limits are missing or invalid (min=${stored[rule.minKey]}, max=${stored[rule.maxKey]})`);
  }
  return { min: Number(min), max: Number(max), minMinor: toMinorUnits(min), maxMinor: toMinorUnits(max) };
}

/**
 * kind: 'deposit' | 'withdrawal'. Never throws.
 * Returns { ok: true, amount } or { ok: false, status, message, min_amount?, max_amount? }.
 */
async function checkTransactionAmount(kind, rawAmount) {
  const rule = LIMIT_RULES[kind];
  const fail = (status, message, limits) => ({
    ok: false,
    status,
    message,
    ...(limits ? { min_amount: limits.min, max_amount: limits.max } : {}),
  });

  const raw = rawAmount === undefined || rawAmount === null ? '' : String(rawAmount).trim();
  if (raw === '') return fail(400, `${rule.label} amount is required.`);
  const str = parseAmountString(raw);
  if (!str) return fail(400, `${rule.label} amount must be a valid positive number with at most 2 decimal places.`);
  const minor = toMinorUnits(str);
  if (minor <= 0) return fail(400, `${rule.label} amount must be greater than 0.`);

  let limits;
  try {
    limits = await getEnforcedLimits(kind);
  } catch (err) {
    logger.error(`checkTransactionAmount(${kind}): ${err.message}`);
    return fail(503, `${rule.label}s are temporarily unavailable. Please try again later.`);
  }

  if (minor < limits.minMinor) return fail(400, `${rule.label} amount must be at least ${limits.min}.`, limits);
  if (minor > limits.maxMinor) return fail(400, `${rule.label} amount cannot exceed ${limits.max}.`, limits);
  return { ok: true, amount: Number(str) };
}

// JSON body for a failed check. Keeps the mobile `error` key and adds `message`.
function limitErrorBody(check) {
  const body = { success: false, error: check.message, message: check.message };
  if (check.min_amount !== undefined) {
    body.min_amount = check.min_amount;
    body.max_amount = check.max_amount;
  }
  return body;
}

module.exports = {
  KEYS, DEFAULTS, MAX_ALLOWED_AMOUNT, getLimits, validate, saveLimits,
  checkTransactionAmount, limitErrorBody,
};
