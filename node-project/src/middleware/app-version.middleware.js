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
 * Clients report their build with the `X-App-Version-Code` header (and optionally
 * `X-App-Platform: android`). The guard only refuses a request (HTTP 426 Upgrade
 * Required) when the client reports a version code below the minimum AND force
 * update is on. Requests without the header are allowed: Android builds released
 * before this feature never send it, so they cannot be identified server-side.
 * The guard runs in addition to — never instead of — each endpoint's own checks.
 */

const ApiResponse = require('../utils/api-response');
const logger = require('../config/logger');
const service = require('../services/app-update-settings.service');

const VERSION_HEADER = 'X-App-Version-Code';
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

const isOtherPlatform = (req) => {
  const platform = String(req.get(PLATFORM_HEADER) || '').trim().toLowerCase();
  return platform !== '' && platform !== 'android';
};

async function requireSupportedAppVersion(req, res, next) {
  if (isOtherPlatform(req)) return next();
  const version = readVersionCode(req);
  if (!version.present) return next();
  if (version.invalid) {
    return ApiResponse.error(res, `${VERSION_HEADER} must be a positive whole number.`, 400);
  }

  let decision;
  try {
    decision = service.evaluate(await service.getSettings(), version.code);
  } catch (err) {
    // Version enforcement is a compatibility control; a settings outage must not stop
    // deposits/withdrawals, which keep their own validation and fail-safe checks.
    logger.error(`[android-app-update] could not evaluate version policy: ${err.message}`);
    return next();
  }
  if (decision.status !== 'required') return next();

  return res.status(426).json({
    success: false,
    error: decision.message,
    message: decision.message,
    update_required: true,
    current_version_code: decision.current_version_code,
    minimum_supported_version_code: decision.minimum_supported_version_code,
    latest_version_name: decision.latest_version_name,
    latest_version_code: decision.latest_version_code,
    store_url: decision.store_url,
  });
}
requireSupportedAppVersion.appVersionGuard = true;

module.exports = { requireSupportedAppVersion, readVersionCode, isOtherPlatform, VERSION_HEADER, PLATFORM_HEADER };
