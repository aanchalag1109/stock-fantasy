'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT/INR to ProbCoin Conversion Settings
 * Purpose: Allow authorized administrators to configure conversion rates.
 * Origin: Newly implemented in node-project.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Thin HTTP layer; validation, storage and conversion live in
 * services/probcoin-conversion.service.js. JSON requests get 422 with field errors;
 * plain form posts fall back to flash + redirect (same as the other settings pages).
 */

const logger = require('../../config/logger');
const { render } = require('../helpers/render');
const service = require('../../services/probcoin-conversion.service');

const BASE_PATH = '/probcoin-conversion';

const wantsJson = (req) => req.xhr
  || (req.get('Accept') || '').includes('application/json')
  || (req.get('Content-Type') || '').includes('application/json');

const index = async (req, res) => {
  try {
    render(res, 'settings/probcoin_conversion', {
      title: 'ProbCoin Conversion Settings',
      rates: await service.getRates(),
      rateDecimals: service.RATE_DECIMALS,
      maxRate: service.MAX_RATE,
    });
  } catch (e) {
    logger.error(`[probcoin-conversion] page load failed: ${e.message}`);
    req.flash('error', 'Failed to load ProbCoin conversion settings.');
    res.redirect('/dashboard');
  }
};

const show = async (req, res) => {
  try {
    res.json({ success: true, data: await service.getRates() });
  } catch (e) {
    logger.error(`[probcoin-conversion] read failed: ${e.message}`);
    res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
};

const update = async (req, res) => {
  const json = wantsJson(req);
  const { values, errors } = service.validate(req.body);

  if (Object.keys(errors).length) {
    if (json) return res.status(422).json({ success: false, message: 'Please correct the highlighted fields.', errors });
    req.flash('error', Object.values(errors)[0]);
    return res.redirect(BASE_PATH);
  }

  try {
    const before = await service.getRates();
    const data = await service.saveRates(values);
    const changes = Object.values(service.CURRENCIES)
      .map(({ key }) => key)
      .filter((key) => before[key] !== data[key])
      .map((key) => `${key}: ${before[key]} -> ${data[key]}`);
    const actor = req.adminAccess ? `${req.adminAccess.email} (${req.adminAccess.userId})` : 'unknown admin';
    logger.info(`[probcoin-conversion] ${actor} updated ProbCoin conversion rates${changes.length ? `: ${changes.join('; ')}` : ' (no changes)'}`);

    const message = 'ProbCoin conversion settings saved successfully.';
    if (json) return res.json({ success: true, message, data });
    req.flash('success', message);
    return res.redirect(BASE_PATH);
  } catch (e) {
    logger.error(`[probcoin-conversion] save failed: ${e.message}`);
    if (json) return res.status(500).json({ success: false, message: 'Failed to save settings. Please try again.' });
    req.flash('error', 'Failed to save settings. Please try again.');
    return res.redirect(BASE_PATH);
  }
};

module.exports = { index, show, update };
