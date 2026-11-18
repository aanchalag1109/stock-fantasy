'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Fantasy Contest Formats — admin Contest Settings
 * Purpose: Default platform fee % per contest type (pre-filled on the create form, can
 *          be changed per contest) and whether results are declared and prizes paid
 *          automatically when a session ends.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Stored as one object under the `contest_settings` key of the settings collection and
 * read fresh on every use, so changes apply to the next contest / results run.
 */

const Setting = require('../models/setting.model');
const { CATEGORIES } = require('./contest-formats');

const SETTINGS_KEY = 'contest_settings';
const DEFAULT_PLATFORM_FEE = 10;

const DEFAULTS = {
  auto_declare_results: true,
  platform_fee: Object.fromEntries(CATEGORIES.map((c) => [c, c === 'practice' ? 0 : DEFAULT_PLATFORM_FEE])),
};

const toBool = (v) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on';

function parseFee(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const fee = Number(text);
  return fee >= 0 && fee <= 100 ? fee : null;
}

function merge(stored) {
  const value = stored && typeof stored === 'object' ? stored : {};
  const out = { auto_declare_results: DEFAULTS.auto_declare_results, platform_fee: { ...DEFAULTS.platform_fee }, updated_at: value.updated_at || null };
  if (typeof value.auto_declare_results === 'boolean') out.auto_declare_results = value.auto_declare_results;
  const fees = value.platform_fee && typeof value.platform_fee === 'object' ? value.platform_fee : {};
  CATEGORIES.forEach((c) => {
    const fee = parseFee(fees[c]);
    if (fee != null) out.platform_fee[c] = fee;
  });
  return out;
}

async function getSettings() {
  const row = await Setting.findOne({ key: SETTINGS_KEY }).lean();
  return merge(row && row.value);
}

/** Returns { values, errors } (errors keyed by field). */
function validate(body = {}) {
  const errors = {};
  const values = { auto_declare_results: toBool(body.auto_declare_results), platform_fee: {} };
  const fees = body.platform_fee && typeof body.platform_fee === 'object' ? body.platform_fee : {};
  CATEGORIES.forEach((c) => {
    const fee = parseFee(fees[c]);
    if (fee == null) errors[`platform_fee.${c}`] = 'Enter a platform fee between 0 and 100 (up to 2 decimals).';
    else values.platform_fee[c] = fee;
  });
  return { values, errors };
}

async function saveSettings(values) {
  const value = { ...values, updated_at: new Date().toISOString() };
  await Setting.findOneAndUpdate({ key: SETTINGS_KEY }, { key: SETTINGS_KEY, value }, { upsert: true });
  return getSettings();
}

module.exports = { SETTINGS_KEY, DEFAULTS, getSettings, validate, saveSettings, merge };
