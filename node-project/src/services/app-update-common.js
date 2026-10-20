'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled Android & iOS Force Update System
 * Purpose: Manage mobile app version requirements and update policies
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Pieces shared by the Android and iOS update policies: message validation,
 * boolean parsing and the decision rules. Each platform service decides how
 * versions are compared and passes the comparison results to decide().
 */

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 500;

const DEFAULT_UPDATE_MESSAGE = 'A new version is available. Please update your application to continue using the latest features and improvements.';
const DEFAULT_OPTIONAL_MESSAGE = 'A new version of the app is available with the latest features and improvements.';

const toBool = (value) => value === true || value === 'true' || value === '1' || value === 1 || value === 'on';

/** Plain-text message check. Returns { text } or { error }. */
function parseMessage(value, label) {
  const text = String(value === undefined || value === null ? '' : value).replace(/\r\n/g, '\n').trim();
  if (text.length < MESSAGE_MIN) return { error: `${label} must be at least ${MESSAGE_MIN} characters.` };
  if (text.length > MESSAGE_MAX) return { error: `${label} must be at most ${MESSAGE_MAX} characters.` };
  if (/[<>]/.test(text)) return { error: `${label} must be plain text (no HTML).` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(text)) return { error: `${label} contains invalid characters.` };
  return { text };
}

/**
 * Decision rules, identical for every platform.
 *
 * status:
 *   disabled    — policy off / not configured: never prompt or block
 *   unknown     — the client did not report its version
 *   required    — below minimum and force update on: block until updated
 *   recommended — below minimum but force update off: prompt, do not block
 *   optional    — supported but older than latest, optional prompt on
 *   up_to_date  — latest (or newer), or optional prompts off
 */
function decide({ base, configured, settings, hasCurrent, belowMinimum, behindLatest }) {
  const result = (status, extra = {}) => ({
    ...base,
    status,
    update_available: false,
    update_required: false,
    is_supported: true,
    show_prompt: false,
    message: null,
    ...extra,
  });
  if (!configured) return result('disabled');
  if (!hasCurrent) return result('unknown', { message: settings.update_message });
  if (belowMinimum && settings.force_update_enabled) {
    return result('required', { update_available: true, update_required: true, is_supported: false, show_prompt: true, message: settings.update_message });
  }
  if (belowMinimum) {
    return result('recommended', { update_available: true, is_supported: false, show_prompt: true, message: settings.update_message });
  }
  if (behindLatest && settings.optional_update_enabled) {
    return result('optional', { update_available: true, show_prompt: true, message: settings.optional_update_message });
  }
  return result('up_to_date', { update_available: behindLatest });
}

module.exports = { MESSAGE_MIN, MESSAGE_MAX, DEFAULT_UPDATE_MESSAGE, DEFAULT_OPTIONAL_MESSAGE, toBool, parseMessage, decide };
