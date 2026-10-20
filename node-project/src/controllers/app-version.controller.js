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
 * GET /api/v1/app-version/android?version_code=20400
 *   (or header X-App-Version-Code: 20400)
 *
 * Public and read-only: no login, no user data, never writes. Returns the current
 * Android update policy plus a decision for the reported build (see
 * services/app-update-settings.service.js evaluate()). Uses the flat
 * { success: true, ... } shape of utils/api-response.js like other mobile APIs.
 */

const ApiResponse = require('../utils/api-response');
const logger = require('../config/logger');
const service = require('../services/app-update-settings.service');
const {
  readVersionCode, VERSION_HEADER,
  readIosVersion, IOS_VERSION_HEADER, // NEW IMPLEMENTATION — NODE.JS PROJECT: iOS force update
} = require('../middleware/app-version.middleware');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled iOS Force Update System
const iosService = require('../services/ios-app-update-settings.service');

const checkAndroidVersion = async (req, res) => {
  const version = readVersionCode(req, { allowQuery: true });
  if (version.invalid) {
    return ApiResponse.error(res, `version_code (or ${VERSION_HEADER}) must be a positive whole number.`, 400);
  }
  try {
    const decision = service.evaluate(await service.getSettings(), version.present ? version.code : null);
    res.set('Cache-Control', 'no-store'); // policy changes must reach apps immediately
    return ApiResponse.success(res, decision);
  } catch (err) {
    logger.error(`[android-app-update] version check failed: ${err.message}`);
    return ApiResponse.error(res, 'Unable to check the app version right now. Please try again later.', 503);
  }
};

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled iOS Force Update System
 * GET /api/v1/app-version/ios?version=2.5.0  (or header X-App-Version: 2.5.0)
 * Public and read-only, same response shape as the Android check.
 */
const checkIosVersion = async (req, res) => {
  const version = readIosVersion(req, { allowQuery: true });
  if (version.invalid) {
    return ApiResponse.error(res, `version (or ${IOS_VERSION_HEADER}) must be a version like 2.5.0.`, 400);
  }
  try {
    const decision = iosService.evaluate(await iosService.getSettings(), version.present ? version.version : null);
    res.set('Cache-Control', 'no-store');
    return ApiResponse.success(res, decision);
  } catch (err) {
    logger.error(`[ios-app-update] version check failed: ${err.message}`);
    return ApiResponse.error(res, 'Unable to check the app version right now. Please try again later.', 503);
  }
};

module.exports = { checkAndroidVersion, checkIosVersion };
