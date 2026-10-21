'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT/INR to ProbCoin Conversion Settings
 * Purpose: Allow authorized administrators to configure conversion rates.
 * Origin: Newly implemented in node-project.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Admin-configured application rates (NOT market prices or external FX rates):
 *   usdt_to_probcoin_rate — ProbCoin received for 1 USDT
 *   inr_to_probcoin_rate  — ProbCoin received for ₹1 INR
 *   ProbCoin amount = input currency amount × configured rate
 *
 * Stored as one object under the `probcoin_conversion` key of the existing settings
 * collection (its unique `key` index prevents duplicate global records). There are
 * no default rates: until an admin saves them, getRates() reports configured=false
 * and convert() refuses to run, so no arbitrary rate can ever be applied.
 *
 * Not yet wired into deposits/withdrawals: today an LG Pay deposit credits the INR
 * amount 1:1 into deposit_balance. convert() is provided for those future integrations.
 */

const Setting = require('../models/setting.model');

const SETTINGS_KEY = 'probcoin_conversion';
const RATE_DECIMALS = 6;
const MAX_RATE = 1000000;
const SCALE = 10n ** BigInt(RATE_DECIMALS);
const RATE_PATTERN = new RegExp(`^\\d{1,7}(\\.\\d{1,${RATE_DECIMALS}})?$`);

const CURRENCIES = {
  USDT: { key: 'usdt_to_probcoin_rate', label: 'USDT to ProbCoin conversion rate', amountDecimals: 6 },
  INR: { key: 'inr_to_probcoin_rate', label: 'INR to ProbCoin conversion rate', amountDecimals: 2 },
};

/** Decimal string → scaled BigInt (value × 10^6), or null when malformed. */
function toScaled(str, decimals = RATE_DECIMALS) {
  const text = String(str).trim();
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${decimals}})?$`).test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(RATE_DECIMALS, '0'));
}

/** Returns the normalised rate as a Number, or { error }. */
function parseRate(value, label) {
  const str = value === undefined || value === null ? '' : String(value).trim();
  if (str === '') return { error: `${label} is required.` };
  if (!RATE_PATTERN.test(str)) return { error: `${label} must be a positive number with at most ${RATE_DECIMALS} decimal places.` };
  const scaled = toScaled(str);
  if (scaled <= 0n) return { error: `${label} must be greater than 0.` };
  if (scaled > BigInt(MAX_RATE) * SCALE) return { error: `${label} cannot exceed ${MAX_RATE.toLocaleString('en-IN')}.` };
  return { rate: Number(str) };
}

// A stored value is used only if it is still a valid rate; otherwise treated as unset.
const storedRate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseRate(value, 'rate');
  return parsed.error ? null : parsed.rate;
};

/**
 * { usdt_to_probcoin_rate, inr_to_probcoin_rate, configured, created_at, updated_at }.
 * Rates are null until an admin saves them.
 */
async function getRates() {
  const row = await Setting.findOne({ key: SETTINGS_KEY }).lean();
  const value = (row && row.value && typeof row.value === 'object') ? row.value : {};
  const rates = {
    usdt_to_probcoin_rate: storedRate(value.usdt_to_probcoin_rate),
    inr_to_probcoin_rate: storedRate(value.inr_to_probcoin_rate),
  };
  return {
    ...rates,
    configured: rates.usdt_to_probcoin_rate !== null && rates.inr_to_probcoin_rate !== null,
    created_at: row ? row.created_at || null : null,
    updated_at: value.updated_at || (row ? row.updated_at || null : null),
  };
}

/** Validates admin input. Accepts camelCase or snake_case keys. Returns { values, errors }. */
function validate(body = {}) {
  const values = {};
  const errors = {};
  const input = {
    usdt_to_probcoin_rate: body.usdt_to_probcoin_rate !== undefined ? body.usdt_to_probcoin_rate : body.usdtToProbCoinRate,
    inr_to_probcoin_rate: body.inr_to_probcoin_rate !== undefined ? body.inr_to_probcoin_rate : body.inrToProbCoinRate,
  };
  Object.values(CURRENCIES).forEach(({ key, label }) => {
    if (typeof input[key] === 'object' && input[key] !== null) { errors[key] = `${label} must be a number.`; return; }
    const parsed = parseRate(input[key], label);
    if (parsed.error) errors[key] = parsed.error;
    else values[key] = parsed.rate;
  });
  return { values, errors };
}

// Only the two rates and a timestamp are stored: the existing mobile GET /settings
// returns every settings row, so the updating admin is recorded in the audit log.
async function saveRates(values) {
  await Setting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { key: SETTINGS_KEY, value: { ...values, updated_at: new Date().toISOString() } },
    { upsert: true },
  );
  return getRates();
}

/**
 * Converts a currency amount to ProbCoin using the configured rate.
 * Exact decimal arithmetic; the result is rounded DOWN to 2 decimals so a user is
 * never credited more than the configured rate allows.
 * Returns { probcoin, rate } or { error } (unknown currency, invalid amount, or the
 * rate is not configured yet).
 */
async function convert(currency, amount) {
  const meta = CURRENCIES[String(currency || '').toUpperCase()];
  if (!meta) return { error: `Unsupported currency "${currency}".` };
  const scaledAmount = toScaled(amount === undefined || amount === null ? '' : amount, meta.amountDecimals);
  if (scaledAmount === null || scaledAmount <= 0n) return { error: 'Amount must be a positive number.' };

  const rates = await getRates();
  const rate = rates[meta.key];
  if (rate === null) return { error: `${meta.label} has not been configured.` };

  const product = scaledAmount * toScaled(String(rate)); // scaled by 10^12
  const cents = product / (SCALE * SCALE / 100n);        // floor to 2 decimals
  return { probcoin: Number(cents) / 100, rate };
}

module.exports = {
  SETTINGS_KEY, CURRENCIES, RATE_DECIMALS, MAX_RATE,
  getRates, validate, saveRates, convert,
};
