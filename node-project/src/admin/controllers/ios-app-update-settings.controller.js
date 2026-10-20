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
 * iOS settings page. Handlers come from app-update-controller.factory.js,
 * shared with the Android page.
 */

const service = require('../../services/ios-app-update-settings.service');
const { createAppUpdateController } = require('./app-update-controller.factory');

// A version just below `version` (e.g. 2.5.0 -> 2.4.99), for the "what apps see" preview.
function justBelow(version) {
  const parts = version.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i] > 0) {
      parts[i] -= 1;
      for (let j = i + 1; j < parts.length; j += 1) parts[j] = 99;
      return parts.join('.');
    }
  }
  return null;
}

module.exports = createAppUpdateController({
  service,
  basePath: '/ios-app-update',
  view: 'settings/ios_app_update',
  title: 'iOS App Update Settings',
  auditTag: 'ios-app-update',
  label: 'iOS',
  auditedFields: [
    'update_policy_enabled', 'force_update_enabled', 'latest_version', 'minimum_supported_version',
    'optional_update_enabled', 'update_message', 'optional_update_message', 'app_store_url',
  ],
  viewLocals: (settings) => {
    const below = settings.minimum_supported_version && justBelow(settings.minimum_supported_version);
    const behind = settings.latest_version && justBelow(settings.latest_version);
    return {
      preview: {
        below: below ? service.evaluate(settings, below) : null,
        behind: behind && service.compareVersions(behind, settings.minimum_supported_version) >= 0 ? service.evaluate(settings, behind) : null,
      },
    };
  },
});
