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
 * Builds the index/show/update handlers shared by the Android and iOS update
 * settings pages. Same request conventions as the Deposit & Withdrawal Settings
 * module: the page submits JSON via fetch (422 with field errors), plain form
 * posts fall back to flash + redirect. Every save is written to the audit log
 * with the admin's identity and the before/after value of each changed field.
 */

const logger = require('../../config/logger');
const { render } = require('../helpers/render');

const wantsJson = (req) => req.xhr || (req.get('Accept') || '').includes('application/json');

/**
 * @param {object} opts
 * @param {object} opts.service     platform settings service (getSettings/validate/saveSettings)
 * @param {string} opts.basePath    e.g. '/android-app-update'
 * @param {string} opts.view        EJS view path
 * @param {string} opts.title       page title
 * @param {string} opts.auditTag    log prefix, e.g. 'android-app-update'
 * @param {string} opts.label       human name used in messages, e.g. 'Android'
 * @param {string[]} opts.auditedFields
 * @param {(settings: object) => object} [opts.viewLocals] extra locals for the page
 */
function createAppUpdateController(opts) {
  const { service, basePath, view, title, auditTag, label, auditedFields, viewLocals = () => ({}) } = opts;

  const index = async (req, res) => {
    try {
      const settings = await service.getSettings();
      render(res, view, { title, settings, messageMax: service.MESSAGE_MAX, ...viewLocals(settings) });
    } catch (e) {
      req.flash('error', e.message);
      res.redirect('/dashboard');
    }
  };

  const show = async (req, res) => {
    try {
      res.json({ success: true, data: await service.getSettings() });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Failed to load settings.' });
    }
  };

  const update = async (req, res) => {
    const json = wantsJson(req);
    const { values, errors } = service.validate(req.body);

    if (Object.keys(errors).length) {
      if (json) return res.status(422).json({ success: false, message: 'Please correct the highlighted fields.', errors });
      req.flash('error', Object.values(errors)[0]);
      return res.redirect(basePath);
    }

    try {
      const before = await service.getSettings();
      const data = await service.saveSettings(values);
      const changes = auditedFields
        .filter((k) => String(before[k]) !== String(data[k]))
        .map((k) => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(data[k])}`);
      const actor = req.adminAccess ? `${req.adminAccess.email} (${req.adminAccess.userId})` : 'unknown admin';
      logger.info(`[${auditTag}] ${actor} updated the ${label} update policy${changes.length ? `: ${changes.join('; ')}` : ' (no changes)'}`);

      const message = `${label} app update settings saved. The new policy applies to the next app check.`;
      if (json) return res.json({ success: true, message, data });
      req.flash('success', message);
      return res.redirect(basePath);
    } catch (e) {
      logger.error(`[${auditTag}] save failed: ${e.message}`);
      if (json) return res.status(500).json({ success: false, message: 'Failed to save settings. Please try again.' });
      req.flash('error', 'Failed to save settings. Please try again.');
      return res.redirect(basePath);
    }
  };

  return { index, show, update };
}

module.exports = { createAppUpdateController };
