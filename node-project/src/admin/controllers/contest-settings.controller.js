'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Fantasy Contest Formats — admin Contest Settings page
 * Purpose: Default platform fee % per contest type and automatic result declaration.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 */

const logger = require('../../config/logger');
const { render } = require('../helpers/render');
const settingsService = require('../../services/contest-settings.service');
const formats = require('../../services/contest-formats');

const BASE_PATH = '/contest-settings';

const TYPE_ROWS = [
  ['mega', 'Mega', 'Ranked prizes; pool grows with joins'],
  ['equal', 'Equal', 'Top winners share the pool equally'],
  ['h2h', 'Head to Head', '1 vs 1; winner takes the pool'],
  ['winner_takes_all', 'Winner Takes All', 'Only rank 1 is paid'],
  ['multiplier', 'Multiplier (2x – 10x)', '1 in N wins; winners share the pool'],
  ['guaranteed', 'Guaranteed', 'Fixed prize table'],
  ['practice', 'Practice', 'Free / fixed prize table'],
].filter(([key]) => formats.CATEGORIES.includes(key));

const view = (res, values, errors) => render(res, 'contest_settings/index', {
  title: 'Contest Settings',
  values,
  errors,
  types: TYPE_ROWS,
});

const index = async (req, res, next) => {
  try {
    await view(res, await settingsService.getSettings(), {});
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { values, errors } = settingsService.validate(req.body);
    if (Object.keys(errors).length) {
      res.status(422);
      const fees = req.body.platform_fee && typeof req.body.platform_fee === 'object' ? req.body.platform_fee : {};
      return view(res, { auto_declare_results: values.auto_declare_results, platform_fee: { ...values.platform_fee, ...fees } }, errors);
    }
    await settingsService.saveSettings(values);
    logger.info(`[contest-settings] ${req.adminAccess ? req.adminAccess.email : 'admin'} updated contest settings`, values);
    req.flash('success', 'Contest settings saved.');
    return res.redirect(BASE_PATH);
  } catch (err) { return next(err); }
};

module.exports = { index, update };
