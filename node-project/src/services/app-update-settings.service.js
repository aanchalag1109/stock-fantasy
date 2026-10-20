'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled Android Force Update System
 * Purpose: Manage Android version requirements and update policies
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * The policy is one object under the `android_app_update` key of the existing
 * settings collection (same pattern as deposit limits / notification settings).
 * It is read fresh on every call so admin changes apply to the next request.
 * Versions are compared by integer version code only — never by version name.
 */

const Setting = require('../models/setting.model');
const {
  MESSAGE_MAX, DEFAULT_UPDATE_MESSAGE, DEFAULT_OPTIONAL_MESSAGE, toBool, parseMessage, decide,
} = require('./app-update-common');

const SETTINGS_KEY = 'android_app_update';

const MAX_VERSION_CODE = 2100000000; // Google Play's upper limit for versionCode
const VERSION_NAME_PATTERN = /^\d{1,4}(\.\d{1,4}){1,3}$/; // e.g. 2.5 / 2.5.0 / 2.5.0.1
const PACKAGE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
// Safe first-run state: nothing is enforced until an admin configures and enables the policy.
const DEFAULTS = {
  update_policy_enabled: false,
  force_update_enabled: false,
  latest_version_name: null,
  latest_version_code: null,
  minimum_supported_version_code: null,
  update_message: DEFAULT_UPDATE_MESSAGE,
  optional_update_enabled: true,
  optional_update_message: DEFAULT_OPTIONAL_MESSAGE,
  play_store_url: null,
  updated_at: null,
};

const FIELD_LABELS = {
  latest_version_name: 'Latest version name',
  latest_version_code: 'Latest version code',
  minimum_supported_version_code: 'Minimum supported version code',
  update_message: 'Update message',
  optional_update_message: 'Optional update message',
  play_store_url: 'Google Play Store URL',
};

// ─── Parsing helpers ─────────────────────────────────────────────────────────

/** Strict positive integer parser ("20500" or 20500). Returns the number or null. */
function parseVersionCode(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 && value <= MAX_VERSION_CODE ? value : null;
  const str = value === undefined || value === null ? '' : String(value).trim();
  if (!/^\d{1,10}$/.test(str)) return null;
  const num = Number(str);
  return num > 0 && num <= MAX_VERSION_CODE ? num : null;
}

/**
 * Accepts only https://play.google.com/store/apps/details?id=<package>[&hl=..].
 * Returns { url, packageName } with a normalised URL, or { error }.
 */
function parsePlayStoreUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch (e) {
    return { error: 'Google Play Store URL must be a valid URL.' };
  }
  if (url.protocol !== 'https:') return { error: 'Google Play Store URL must use HTTPS.' };
  if (url.hostname !== 'play.google.com' || url.port || url.username || url.password) {
    return { error: 'Google Play Store URL must point to play.google.com.' };
  }
  if (url.pathname.replace(/\/+$/, '') !== '/store/apps/details') {
    return { error: 'Google Play Store URL must be an app listing (https://play.google.com/store/apps/details?id=...).' };
  }
  const packageName = url.searchParams.get('id') || '';
  if (!PACKAGE_PATTERN.test(packageName) || packageName.length > 255) {
    return { error: 'Google Play Store URL must include a valid Android package name (id=com.example.app).' };
  }
  const unexpected = [...url.searchParams.keys()].filter((k) => !['id', 'hl', 'gl'].includes(k));
  if (unexpected.length || url.hash) return { error: 'Google Play Store URL must not contain extra parameters.' };
  return { url: `https://play.google.com/store/apps/details?id=${packageName}`, packageName };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/** Merges whatever is stored with DEFAULTS, ignoring malformed stored values. */
function merge(stored) {
  const value = stored && typeof stored === 'object' ? stored : {};
  const out = { ...DEFAULTS };
  ['update_policy_enabled', 'force_update_enabled', 'optional_update_enabled'].forEach((k) => {
    if (typeof value[k] === 'boolean') out[k] = value[k];
  });
  if (typeof value.latest_version_name === 'string' && VERSION_NAME_PATTERN.test(value.latest_version_name)) out.latest_version_name = value.latest_version_name;
  ['latest_version_code', 'minimum_supported_version_code'].forEach((k) => {
    const code = parseVersionCode(value[k]);
    if (code) out[k] = code;
  });
  ['update_message', 'optional_update_message'].forEach((k) => {
    const parsed = parseMessage(value[k], k);
    if (!parsed.error) out[k] = parsed.text;
  });
  if (value.play_store_url) {
    const parsed = parsePlayStoreUrl(value.play_store_url);
    if (!parsed.error) out.play_store_url = parsed.url;
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

/** Validates admin input. Returns { values, errors } (errors keyed by field). */
function validate(body = {}) {
  const errors = {};
  const values = {
    update_policy_enabled: toBool(body.update_policy_enabled),
    force_update_enabled: toBool(body.force_update_enabled),
    optional_update_enabled: toBool(body.optional_update_enabled),
  };

  const name = String(body.latest_version_name === undefined || body.latest_version_name === null ? '' : body.latest_version_name).trim();
  if (!name) errors.latest_version_name = `${FIELD_LABELS.latest_version_name} is required.`;
  else if (!VERSION_NAME_PATTERN.test(name)) errors.latest_version_name = `${FIELD_LABELS.latest_version_name} must look like 2.5.0 (2–4 numeric parts).`;
  else values.latest_version_name = name;

  ['latest_version_code', 'minimum_supported_version_code'].forEach((key) => {
    const raw = body[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') errors[key] = `${FIELD_LABELS[key]} is required.`;
    else {
      const code = parseVersionCode(raw);
      if (!code) errors[key] = `${FIELD_LABELS[key]} must be a whole number between 1 and ${MAX_VERSION_CODE}.`;
      else values[key] = code;
    }
  });
  if (values.latest_version_code && values.minimum_supported_version_code
      && values.minimum_supported_version_code > values.latest_version_code) {
    errors.minimum_supported_version_code = 'Minimum supported version code cannot be greater than the latest version code.';
  }

  const message = parseMessage(body.update_message || DEFAULT_UPDATE_MESSAGE, FIELD_LABELS.update_message);
  if (message.error) errors.update_message = message.error;
  else values.update_message = message.text;

  const optional = parseMessage(body.optional_update_message || DEFAULT_OPTIONAL_MESSAGE, FIELD_LABELS.optional_update_message);
  if (optional.error) errors.optional_update_message = optional.error;
  else values.optional_update_message = optional.text;

  const rawUrl = String(body.play_store_url === undefined || body.play_store_url === null ? '' : body.play_store_url).trim();
  if (rawUrl) {
    const parsed = parsePlayStoreUrl(rawUrl);
    if (parsed.error) errors.play_store_url = parsed.error;
    else values.play_store_url = parsed.url;
  } else {
    values.play_store_url = null;
    // Prompting users to update with nowhere to update from would strand them.
    if (values.update_policy_enabled) errors.play_store_url = 'A Google Play Store URL is required while the update policy is enabled.';
  }
  return { values, errors };
}

// Note: the existing mobile GET /settings returns every settings row, so nothing
// admin-identifying is stored here — who changed what goes to the audit log instead.
async function saveSettings(values) {
  const value = { ...values, updated_at: new Date().toISOString() };
  await Setting.findOneAndUpdate({ key: SETTINGS_KEY }, { key: SETTINGS_KEY, value }, { upsert: true });
  return getSettings();
}

// ─── Policy evaluation ───────────────────────────────────────────────────────

/**
 * Decides what an installed Android app should do (rules in app-update-common.js).
 * `versionCode` may be null when the client did not report one; then only the
 * policy is returned (status "unknown").
 */
function evaluate(settings, versionCode) {
  const s = settings;
  return decide({
    base: {
      platform: 'android',
      update_policy_enabled: !!s.update_policy_enabled,
      force_update_enabled: !!s.force_update_enabled,
      latest_version_name: s.latest_version_name,
      latest_version_code: s.latest_version_code,
      minimum_supported_version_code: s.minimum_supported_version_code,
      current_version_code: versionCode || null,
      store_url: s.play_store_url,
    },
    configured: !!(s.update_policy_enabled && s.latest_version_code && s.minimum_supported_version_code),
    settings: s,
    hasCurrent: !!versionCode,
    belowMinimum: !!versionCode && versionCode < s.minimum_supported_version_code,
    behindLatest: !!versionCode && versionCode < s.latest_version_code,
  });
}

module.exports = {
  SETTINGS_KEY, DEFAULTS, MAX_VERSION_CODE, MESSAGE_MAX,
  getSettings, initializeDefaults, validate, saveSettings, evaluate,
  parseVersionCode, parsePlayStoreUrl,
};
