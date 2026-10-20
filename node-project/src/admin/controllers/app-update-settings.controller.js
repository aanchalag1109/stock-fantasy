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
 * Android settings page. Handlers come from app-update-controller.factory.js,
 * shared with the iOS page.
 */

const service = require('../../services/app-update-settings.service');
const { createAppUpdateController } = require('./app-update-controller.factory');

module.exports = createAppUpdateController({
  service,
  basePath: '/android-app-update',
  view: 'settings/android_app_update',
  title: 'Android App Update Settings',
  auditTag: 'android-app-update',
  label: 'Android',
  auditedFields: [
    'update_policy_enabled', 'force_update_enabled', 'latest_version_name', 'latest_version_code',
    'minimum_supported_version_code', 'optional_update_enabled', 'update_message', 'optional_update_message', 'play_store_url',
  ],
  viewLocals: (settings) => ({
    maxVersionCode: service.MAX_VERSION_CODE,
    preview: {
      below: settings.minimum_supported_version_code ? service.evaluate(settings, settings.minimum_supported_version_code - 1) : null,
      behind: settings.latest_version_code ? service.evaluate(settings, Math.max(settings.minimum_supported_version_code || 1, settings.latest_version_code - 1)) : null,
    },
  }),
});
