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

const KEYS = {
  min_deposit_amount: 'Minimum deposit amount',
  max_deposit_amount: 'Maximum deposit amount',
  min_withdrawal_amount: 'Minimum withdrawal amount',
  max_withdrawal_amount: 'Maximum withdrawal amount',
};

// min_withdrawal_amount mirrors the 500 currently hard-coded in wallet.controller.js.
// The rest have no existing rule, so they stay empty until an admin saves them.
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

module.exports = { KEYS, DEFAULTS, MAX_ALLOWED_AMOUNT, getLimits, validate, saveLimits };
