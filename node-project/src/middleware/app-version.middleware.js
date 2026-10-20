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
 * Shared helpers for reading the installed app version from a request, and the
 * requireSupportedAppVersion guard for sensitive endpoints (deposits, withdrawals,
 * contest joins).
 *
 * Android clients report their build with `X-App-Version-Code` (optionally with
 * `X-App-Platform: android`); iOS clients send `X-App-Platform: ios` and their
 * marketing version in `X-App-Version` (iOS support added with the iOS policy). The guard only refuses a request (HTTP 426 Upgrade
 * Required) when the client reports a version code below the minimum AND force
 * update is on. Requests without the header are allowed: Android builds released
 * before this feature never send it, so they cannot be identified server-side.
 * The guard runs in addition to — never instead of — each endpoint's own checks.
 */

const ApiResponse = require('../utils/api-response');
const logger = require('../config/logger');
const service = require('../services/app-update-settings.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled iOS Force Update System
const iosService = require('../services/ios-app-update-settings.service');

const VERSION_HEADER = 'X-App-Version-Code';
const IOS_VERSION_HEADER = 'X-App-Version';
const PLATFORM_HEADER = 'X-App-Platform';

/**
 * Returns { present: false } | { present: true, code } | { present: true, invalid: true }.
 * The query parameter is only consulted when allowQuery is set (the public check API).
 */
function readVersionCode(req, { allowQuery = false } = {}) {
  let raw = req.get(VERSION_HEADER);
  if ((raw === undefined || raw === '') && allowQuery) raw = req.query.version_code;
  if (raw === undefined || raw === null || String(raw).trim() === '') return { present: false };
  const code = service.parseVersionCode(raw);
  return code ? { present: true, code } : { present: true, invalid: true };
}

/** iOS: { present: false } | { present: true, version } | { present: true, invalid: true }. */
function readIosVersion(req, { allowQuery = false } = {}) {
  let raw = req.get(IOS_VERSION_HEADER);
  if ((raw === undefined || raw === '') && allowQuery) raw = req.query.version;
  if (raw === undefined || raw === null || String(raw).trim() === '') return { present: false };
  const version = iosService.parseVersion(raw);
  return version ? { present: true, version } : { present: true, invalid: true };
}

const platformOf = (req) => String(req.get(PLATFORM_HEADER) || '').trim().toLowerCase();

// Without a platform header the client is treated as Android (the original behaviour).
const PLATFORMS = {
  android: {
    tag: 'android-app-update',
    read: (req) => readVersionCode(req),
    current: (v) => v.code,
    invalidMessage: `${VERSION_HEADER} must be a positive whole number.`,
    service,
    fields: ['current_version_code', 'minimum_supported_version_code', 'latest_version_name', 'latest_version_code'],
  },
  ios: {
    tag: 'ios-app-update',
    read: (req) => readIosVersion(req),
    current: (v) => v.version,
    invalidMessage: `${IOS_VERSION_HEADER} must be a version like 2.5.0.`,
    service: iosService,
    fields: ['current_version', 'minimum_supported_version', 'latest_version'],
  },
};

async function requireSupportedAppVersion(req, res, next) {
  const platform = PLATFORMS[platformOf(req) || 'android'];
  if (!platform) return next(); // unknown platform: no policy applies
  const version = platform.read(req);
  if (!version.present) return next();
  if (version.invalid) return ApiResponse.error(res, platform.invalidMessage, 400);

  let decision;
  try {
    decision = platform.service.evaluate(await platform.service.getSettings(), platform.current(version));
  } catch (err) {
    // Version enforcement is a compatibility control; a settings outage must not stop
    // deposits/withdrawals, which keep their own validation and fail-safe checks.
    logger.error(`[${platform.tag}] could not evaluate version policy: ${err.message}`);
    return next();
  }
  if (decision.status !== 'required') return next();

  const body = {
    success: false,
    error: decision.message,
    message: decision.message,
    update_required: true,
    platform: decision.platform,
  };
  platform.fields.forEach((key) => { body[key] = decision[key]; });
  body.store_url = decision.store_url;
  return res.status(426).json(body);
}
requireSupportedAppVersion.appVersionGuard = true;

module.exports = {
  requireSupportedAppVersion, readVersionCode, readIosVersion,
  VERSION_HEADER, IOS_VERSION_HEADER, PLATFORM_HEADER,
};
