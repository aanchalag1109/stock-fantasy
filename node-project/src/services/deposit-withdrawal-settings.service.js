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
 *
 * Client feedback — INR and USDT configured separately:
 *   - min/max deposit and withdrawal, in that currency (₹ / USDT). The INR keys keep their
 *     original names (min_deposit_amount, …) so existing values carry over.
 *   - deposit gateway charges: percent + fixed amount, and who pays them (user or platform).
 *   - USDT withdrawal network (what users must send their USDT address for).
 *   - INR withdrawals on / off. Never saved = on. Off stops new requests; the limits are kept, and
 *     requests already made can still be accepted or rejected.
 */

const Setting = require('../models/setting.model');
const logger = require('../config/logger');

const CURRENCIES = ['INR', 'USDT'];
const UNIT = { INR: '₹', USDT: 'USDT' };

const LIMIT_KEYS = {
  INR: { min_deposit: 'min_deposit_amount', max_deposit: 'max_deposit_amount', min_withdrawal: 'min_withdrawal_amount', max_withdrawal: 'max_withdrawal_amount' },
  USDT: { min_deposit: 'usdt_min_deposit_amount', max_deposit: 'usdt_max_deposit_amount', min_withdrawal: 'usdt_min_withdrawal_amount', max_withdrawal: 'usdt_max_withdrawal_amount' },
};
const CHARGE_KEYS = {
  INR: { percent: 'inr_deposit_charge_percent', fixed: 'inr_deposit_charge_fixed', bearer: 'inr_deposit_charge_bearer' },
  USDT: { percent: 'usdt_deposit_charge_percent', fixed: 'usdt_deposit_charge_fixed', bearer: 'usdt_deposit_charge_bearer' },
};
const WITHDRAWAL_NETWORK_KEY = 'usdt_withdrawal_network';
const WITHDRAWAL_NETWORKS = ['TRC20', 'BEP20', 'ERC20'];
const INR_WITHDRAWAL_KEY = 'inr_withdrawal_status';
const SWITCH_VALUES = ['enabled', 'disabled'];

// Labels of the limit keys. INR labels are unchanged from the original module.
const KEYS = {
  min_deposit_amount: 'Minimum deposit amount',
  max_deposit_amount: 'Maximum deposit amount',
  min_withdrawal_amount: 'Minimum withdrawal amount',
  max_withdrawal_amount: 'Maximum withdrawal amount',
  usdt_min_deposit_amount: 'USDT minimum deposit amount',
  usdt_max_deposit_amount: 'USDT maximum deposit amount',
  usdt_min_withdrawal_amount: 'USDT minimum withdrawal amount',
  usdt_max_withdrawal_amount: 'USDT maximum withdrawal amount',
};

// Pre-fill for the admin form only: min_withdrawal_amount mirrors the 500 that used to be
// hard-coded in the wallet controllers. Enforcement (below) never falls back to these.
const DEFAULTS = {
  min_deposit_amount: null,
  max_deposit_amount: null,
  min_withdrawal_amount: 500,
  max_withdrawal_amount: null,
  usdt_min_deposit_amount: null,
  usdt_max_deposit_amount: null,
  usdt_min_withdrawal_amount: null,
  usdt_max_withdrawal_amount: null,
  inr_deposit_charge_percent: 0,
  inr_deposit_charge_fixed: 0,
  inr_deposit_charge_bearer: 'user',
  usdt_deposit_charge_percent: 0,
  usdt_deposit_charge_fixed: 0,
  usdt_deposit_charge_bearer: 'user',
  usdt_withdrawal_network: 'TRC20',
  inr_withdrawal_status: 'enabled',
};

const ALL_KEYS = Object.keys(DEFAULTS);
const MAX_ALLOWED_AMOUNT = 10000000;
const MAX_CHARGE_PERCENT = 50;

async function readRows(keys) {
  const rows = await Setting.find({ key: { $in: keys } }).lean();
  const stored = {};
  rows.forEach((row) => { stored[row.key] = row.value; });
  return stored;
}

/** Every setting of this module, with defaults for the ones never saved (for the admin page). */
async function getLimits() {
  const stored = await readRows(ALL_KEYS);
  const limits = { ...DEFAULTS };
  Object.entries(stored).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (typeof DEFAULTS[key] === 'string') { limits[key] = String(value); return; }
    const num = Number(value);
    if (Number.isFinite(num)) limits[key] = num;
  });
  return limits;
}

const decimal = (str) => /^\d+(\.\d{1,2})?$/.test(str);

/**
 * Returns { values, errors }. errors is keyed by field; empty when input is valid.
 * INR limits are required. USDT limits are optional as a group: all four blank keeps the
 * defaults from .env (PAYRAM_MIN/MAX_DEPOSIT_USDT) and USDT withdrawals off; any one filled
 * means all four are required. Charges default to 0 (paid by the user).
 */
function validate(input = {}) {
  const values = {};
  const errors = {};
  const text = (key) => (input[key] === undefined || input[key] === null ? '' : String(input[key]).trim());

  const usdtGiven = Object.values(LIMIT_KEYS.USDT).some((key) => text(key) !== '');
  Object.entries(KEYS).forEach(([key, label]) => {
    const str = text(key);
    const optional = key.startsWith('usdt_') && !usdtGiven;
    if (str === '') { if (optional) values[key] = null; else errors[key] = `${label} is required.`; return; }
    if (!decimal(str)) { errors[key] = `${label} must be a positive number with at most 2 decimal places.`; return; }
    const num = Number(str);
    if (num <= 0) { errors[key] = `${label} must be greater than 0.`; return; }
    if (num > MAX_ALLOWED_AMOUNT) { errors[key] = `${label} cannot exceed ${MAX_ALLOWED_AMOUNT.toLocaleString('en-IN')}.`; return; }
    values[key] = num;
  });

  CURRENCIES.forEach((currency) => {
    const k = LIMIT_KEYS[currency];
    const prefix = currency === 'INR' ? 'Maximum' : 'USDT maximum';
    if (!errors[k.min_deposit] && !errors[k.max_deposit] && values[k.min_deposit] != null && values[k.min_deposit] > values[k.max_deposit]) {
      errors[k.max_deposit] = `${prefix} deposit amount must be greater than or equal to the minimum deposit amount.`;
    }
    if (!errors[k.min_withdrawal] && !errors[k.max_withdrawal] && values[k.min_withdrawal] != null && values[k.min_withdrawal] > values[k.max_withdrawal]) {
      errors[k.max_withdrawal] = `${prefix} withdrawal amount must be greater than or equal to the minimum withdrawal amount.`;
    }

    const c = CHARGE_KEYS[currency];
    const pct = text(c.percent);
    if (pct === '') values[c.percent] = 0;
    else if (!decimal(pct) || Number(pct) > MAX_CHARGE_PERCENT) errors[c.percent] = `${currency} charge percent must be between 0 and ${MAX_CHARGE_PERCENT}, with at most 2 decimal places.`;
    else values[c.percent] = Number(pct);
    const fixed = text(c.fixed);
    if (fixed === '') values[c.fixed] = 0;
    else if (!decimal(fixed) || Number(fixed) > MAX_ALLOWED_AMOUNT) errors[c.fixed] = `${currency} fixed charge must be 0 or a positive number with at most 2 decimal places.`;
    else values[c.fixed] = Number(fixed);
    const bearer = text(c.bearer) || 'user';
    if (!['user', 'platform'].includes(bearer)) errors[c.bearer] = `${currency} charges must be paid by "user" or "platform".`;
    else values[c.bearer] = bearer;
  });

  const network = text(WITHDRAWAL_NETWORK_KEY).toUpperCase() || 'TRC20';
  if (!WITHDRAWAL_NETWORKS.includes(network)) errors[WITHDRAWAL_NETWORK_KEY] = `USDT withdrawal network must be one of ${WITHDRAWAL_NETWORKS.join(', ')}.`;
  else values[WITHDRAWAL_NETWORK_KEY] = network;

  // Not sent → left as it is, so a save that does not know the switch can never turn it back on.
  const inrSwitch = text(INR_WITHDRAWAL_KEY).toLowerCase();
  if (inrSwitch !== '') {
    if (!SWITCH_VALUES.includes(inrSwitch)) errors[INR_WITHDRAWAL_KEY] = 'INR withdrawals must be enabled or disabled.';
    else values[INR_WITHDRAWAL_KEY] = inrSwitch;
  }

  return { values, errors };
}

async function saveLimits(values) {
  await Promise.all(ALL_KEYS.filter((key) => key in values).map((key) =>
    Setting.findOneAndUpdate({ key }, { key, value: values[key] }, { upsert: true })
  ));
  return getLimits();
}

/**
 * Deposit charges for one currency.
 * @returns {Promise<{ percent:number, fixed:number, bearer:'user'|'platform' }>}
 */
async function getCharges(currency) {
  const c = CHARGE_KEYS[currency];
  const stored = await readRows(Object.values(c));
  const pct = Number(stored[c.percent]);
  const fixed = Number(stored[c.fixed]);
  return {
    percent: Number.isFinite(pct) && pct >= 0 && pct <= MAX_CHARGE_PERCENT ? pct : 0,
    fixed: Number.isFinite(fixed) && fixed >= 0 ? fixed : 0,
    bearer: stored[c.bearer] === 'platform' ? 'platform' : 'user',
  };
}

/** False when the admin switched this currency's withdrawals off (INR only). Throws when it cannot be read. */
async function isWithdrawalAllowed(currency) {
  if (currency !== 'INR') return true;
  const stored = await readRows([INR_WITHDRAWAL_KEY]);
  return stored[INR_WITHDRAWAL_KEY] !== 'disabled';
}

async function getWithdrawalNetwork() {
  const stored = await readRows([WITHDRAWAL_NETWORK_KEY]);
  return WITHDRAWAL_NETWORKS.includes(stored[WITHDRAWAL_NETWORK_KEY]) ? stored[WITHDRAWAL_NETWORK_KEY] : 'TRC20';
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
  deposit: { label: 'Deposit', min: 'min_deposit', max: 'max_deposit' },
  withdrawal: { label: 'Withdrawal', min: 'min_withdrawal', max: 'max_withdrawal' },
};

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

class LimitsUnavailableError extends Error {}

// Accepts only plain positive decimals with up to 2 places; returns the normalised string or null.
function parseAmountString(value) {
  const str = value === undefined || value === null ? '' : String(value).trim();
  return AMOUNT_PATTERN.test(str) ? str : null;
}

// Compare in minor units (paise / cents) so values like 99.99 vs 100 never hit float rounding.
function toMinorUnits(str) {
  const [whole, frac = ''] = str.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/**
 * @param {{ min:number, max:number }} [fallback] used when the currency's limits were never saved
 *        (USDT deposits fall back to PAYRAM_MIN/MAX_DEPOSIT_USDT from .env)
 */
async function getEnforcedLimits(kind, currency, fallback) {
  const rule = LIMIT_RULES[kind];
  const minKey = LIMIT_KEYS[currency][rule.min];
  const maxKey = LIMIT_KEYS[currency][rule.max];
  const stored = await readRows([minKey, maxKey]);
  const unset = (v) => v === undefined || v === null || v === '';
  if (fallback && unset(stored[minKey]) && unset(stored[maxKey])) {
    stored[minKey] = String(fallback.min);
    stored[maxKey] = String(fallback.max);
  }

  const min = parseAmountString(stored[minKey]);
  const max = parseAmountString(stored[maxKey]);
  if (!min || !max || toMinorUnits(min) <= 0 || toMinorUnits(min) > toMinorUnits(max)) {
    throw new LimitsUnavailableError(`${currency} ${kind} limits are missing or invalid (min=${stored[minKey]}, max=${stored[maxKey]})`);
  }
  return { min: Number(min), max: Number(max), minMinor: toMinorUnits(min), maxMinor: toMinorUnits(max) };
}

/**
 * kind: 'deposit' | 'withdrawal'; currency: 'INR' (default, the original limits) | 'USDT'.
 * The amount is in that currency. Never throws.
 * Returns { ok: true, amount } or { ok: false, status, message, min_amount?, max_amount? }.
 */
async function checkTransactionAmount(kind, rawAmount, currency = 'INR', { fallback } = {}) {
  const rule = LIMIT_RULES[kind];
  const unit = currency === 'INR' ? '' : ` ${UNIT[currency]}`;
  const fail = (status, message, limits) => ({
    ok: false,
    status,
    message,
    ...(limits ? { min_amount: limits.min, max_amount: limits.max } : {}),
  });
  if (!LIMIT_KEYS[currency]) return fail(400, `Unsupported currency "${currency}".`);

  const raw = rawAmount === undefined || rawAmount === null ? '' : String(rawAmount).trim();
  if (raw === '') return fail(400, `${rule.label} amount is required.`);
  const str = parseAmountString(raw);
  if (!str) return fail(400, `${rule.label} amount must be a valid positive number with at most 2 decimal places.`);
  const minor = toMinorUnits(str);
  if (minor <= 0) return fail(400, `${rule.label} amount must be greater than 0.`);

  let limits;
  try {
    limits = await getEnforcedLimits(kind, currency, fallback);
  } catch (err) {
    logger.error(`checkTransactionAmount(${kind}): ${err.message}`);
    const what = currency === 'INR' ? `${rule.label}s` : `${currency} ${rule.label.toLowerCase()}s`;
    return fail(503, `${what} are temporarily unavailable. Please try again later.`);
  }

  if (minor < limits.minMinor) return fail(400, `${rule.label} amount must be at least ${limits.min}${unit}.`, limits);
  if (minor > limits.maxMinor) return fail(400, `${rule.label} amount cannot exceed ${limits.max}${unit}.`, limits);
  return { ok: true, amount: Number(str) };
}

/** { min, max } for display (deposit/withdrawal screens), or null when not configured. Never throws. */
async function limitsFor(kind, currency, { fallback } = {}) {
  try {
    const limits = await getEnforcedLimits(kind, currency, fallback);
    return { min: limits.min, max: limits.max };
  } catch (err) {
    return null;
  }
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
  KEYS, DEFAULTS, MAX_ALLOWED_AMOUNT, MAX_CHARGE_PERCENT, CURRENCIES, UNIT, LIMIT_KEYS, CHARGE_KEYS,
  WITHDRAWAL_NETWORK_KEY, WITHDRAWAL_NETWORKS, getLimits, validate, saveLimits, getCharges, getWithdrawalNetwork, isWithdrawalAllowed,
  checkTransactionAmount, limitErrorBody, limitsFor,
};
