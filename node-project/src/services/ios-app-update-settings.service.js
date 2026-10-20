'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled iOS Force Update System
 * Purpose: Manage iOS version requirements and update policies
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * iOS counterpart of app-update-settings.service.js (Android). Stored as one object
 * under the `ios_app_update` key of the existing settings collection.
 *
 * iOS apps are compared by their marketing version (CFBundleShortVersionString,
 * e.g. "2.5.0"), component by component as numbers — never as strings — so 2.10.0
 * is newer than 2.9.0 and 2.5 equals 2.5.0. The build number (CFBundleVersion) is
 * not used because it commonly restarts at 1 for every new marketing version.
 */

const Setting = require('../models/setting.model');
const {
  MESSAGE_MAX, DEFAULT_UPDATE_MESSAGE, DEFAULT_OPTIONAL_MESSAGE, toBool, parseMessage, decide,
} = require('./app-update-common');

const SETTINGS_KEY = 'ios_app_update';
const VERSION_PATTERN = /^\d{1,4}(\.\d{1,4}){0,2}$/; // CFBundleShortVersionString: 1–3 integers

const DEFAULTS = {
  update_policy_enabled: false,
  force_update_enabled: false,
  latest_version: null,
  minimum_supported_version: null,
  update_message: DEFAULT_UPDATE_MESSAGE,
  optional_update_enabled: true,
  optional_update_message: DEFAULT_OPTIONAL_MESSAGE,
  app_store_url: null,
  updated_at: null,
};

const FIELD_LABELS = {
  latest_version: 'Latest version',
  minimum_supported_version: 'Minimum supported version',
  update_message: 'Update message',
  optional_update_message: 'Optional update message',
  app_store_url: 'App Store URL',
};

// ─── Parsing helpers ─────────────────────────────────────────────────────────

/** Returns the normalised version string ("2.5.0") or null when malformed. */
function parseVersion(value) {
  const str = value === undefined || value === null ? '' : String(value).trim();
  if (!VERSION_PATTERN.test(str)) return null;
  const parts = str.split('.').map(Number);
  if (parts.every((n) => n === 0)) return null;
  return parts.join('.');
}

/** Numeric, component-wise comparison: <0 if a < b, 0 if equal, >0 if a > b. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Accepts only App Store listings: https://apps.apple.com/[cc/]app/[name/]id<digits>.
 * Returns { url, appId } with a normalised URL, or { error }.
 */
function parseAppStoreUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch (e) {
    return { error: 'App Store URL must be a valid URL.' };
  }
  if (url.protocol !== 'https:') return { error: 'App Store URL must use HTTPS.' };
  if (url.hostname !== 'apps.apple.com' || url.port || url.username || url.password) {
    return { error: 'App Store URL must point to apps.apple.com.' };
  }
  const match = url.pathname.replace(/\/+$/, '').match(/^(?:\/[a-z]{2})?\/app(?:\/[^/]{1,200})?\/id(\d{5,12})$/i);
  if (!match) return { error: 'App Store URL must be an app listing (https://apps.apple.com/app/id123456789).' };
  if (url.search || url.hash) return { error: 'App Store URL must not contain extra parameters.' };
  return { url: `https://apps.apple.com/app/id${match[1]}`, appId: match[1] };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function merge(stored) {
  const value = stored && typeof stored === 'object' ? stored : {};
  const out = { ...DEFAULTS };
  ['update_policy_enabled', 'force_update_enabled', 'optional_update_enabled'].forEach((k) => {
    if (typeof value[k] === 'boolean') out[k] = value[k];
  });
  ['latest_version', 'minimum_supported_version'].forEach((k) => {
    const version = parseVersion(value[k]);
    if (version) out[k] = version;
  });
  ['update_message', 'optional_update_message'].forEach((k) => {
    const parsed = parseMessage(value[k], k);
    if (!parsed.error) out[k] = parsed.text;
  });
  if (value.app_store_url) {
    const parsed = parseAppStoreUrl(value.app_store_url);
    if (!parsed.error) out.app_store_url = parsed.url;
  }
  if (value.updated_at) out.updated_at = value.updated_at;
  return out;
}

async function getSettings() {
  const row = await Setting.findOne({ key: SETTINGS_KEY }).lean();
  return merge(row && row.value);
}

/** Idempotent first-run initialisation: creates the defaults only if nothing is stored. */
async function initializeDefaults() {
  await Setting.updateOne(
    { key: SETTINGS_KEY },
    { $setOnInsert: { key: SETTINGS_KEY, value: { ...DEFAULTS } } },
    { upsert: true },
  );
}

function validate(body = {}) {
  const errors = {};
  const values = {
    update_policy_enabled: toBool(body.update_policy_enabled),
    force_update_enabled: toBool(body.force_update_enabled),
    optional_update_enabled: toBool(body.optional_update_enabled),
  };

  ['latest_version', 'minimum_supported_version'].forEach((key) => {
    const raw = body[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') errors[key] = `${FIELD_LABELS[key]} is required.`;
    else {
      const version = parseVersion(raw);
      if (!version) errors[key] = `${FIELD_LABELS[key]} must look like 2.5.0 (1–3 numbers separated by dots).`;
      else values[key] = version;
    }
  });
  if (values.latest_version && values.minimum_supported_version
      && compareVersions(values.minimum_supported_version, values.latest_version) > 0) {
    errors.minimum_supported_version = 'Minimum supported version cannot be newer than the latest version.';
  }

  const message = parseMessage(body.update_message || DEFAULT_UPDATE_MESSAGE, FIELD_LABELS.update_message);
  if (message.error) errors.update_message = message.error;
  else values.update_message = message.text;

  const optional = parseMessage(body.optional_update_message || DEFAULT_OPTIONAL_MESSAGE, FIELD_LABELS.optional_update_message);
  if (optional.error) errors.optional_update_message = optional.error;
  else values.optional_update_message = optional.text;

  const rawUrl = String(body.app_store_url === undefined || body.app_store_url === null ? '' : body.app_store_url).trim();
  if (rawUrl) {
    const parsed = parseAppStoreUrl(rawUrl);
    if (parsed.error) errors.app_store_url = parsed.error;
    else values.app_store_url = parsed.url;
  } else {
    values.app_store_url = null;
    if (values.update_policy_enabled) errors.app_store_url = 'An App Store URL is required while the update policy is enabled.';
  }
  return { values, errors };
}

// The existing mobile GET /settings returns every settings row, so nothing
// admin-identifying is stored here — who changed what goes to the audit log instead.
async function saveSettings(values) {
  const value = { ...values, updated_at: new Date().toISOString() };
  await Setting.findOneAndUpdate({ key: SETTINGS_KEY }, { key: SETTINGS_KEY, value }, { upsert: true });
  return getSettings();
}

// ─── Policy evaluation ───────────────────────────────────────────────────────

/** Decides what an installed iOS app should do. `version` is a parsed version string or null. */
function evaluate(settings, version) {
  const s = settings;
  return decide({
    base: {
      platform: 'ios',
      update_policy_enabled: !!s.update_policy_enabled,
      force_update_enabled: !!s.force_update_enabled,
      latest_version: s.latest_version,
      minimum_supported_version: s.minimum_supported_version,
      current_version: version || null,
      store_url: s.app_store_url,
    },
    configured: !!(s.update_policy_enabled && s.latest_version && s.minimum_supported_version),
    settings: s,
    hasCurrent: !!version,
    belowMinimum: !!version && compareVersions(version, s.minimum_supported_version) < 0,
    behindLatest: !!version && compareVersions(version, s.latest_version) < 0,
  });
}

module.exports = {
  SETTINGS_KEY, DEFAULTS, MESSAGE_MAX,
  getSettings, initializeDefaults, validate, saveSettings, evaluate,
  parseVersion, compareVersions, parseAppStoreUrl,
};
