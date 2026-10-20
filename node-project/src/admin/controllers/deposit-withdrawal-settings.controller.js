'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Deposit and Withdrawal Settings Module
 * Purpose: Manage minimum and maximum deposit and withdrawal limits
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 */

const { render } = require('../helpers/render');
const limitsService = require('../../services/deposit-withdrawal-settings.service');

const BASE_PATH = '/deposit-withdrawal-settings';

const wantsJson = (req) => req.xhr || (req.get('Accept') || '').includes('application/json');

const index = async (req, res) => {
  try {
    const limits = await limitsService.getLimits();
    render(res, 'settings/deposit_withdrawal', {
      title: 'Deposit & Withdrawal Settings',
      limits,
      maxAllowed: limitsService.MAX_ALLOWED_AMOUNT,
      admin: req.session.admin,
    });
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/dashboard');
  }
};

const show = async (req, res) => {
  try {
    res.json({ success: true, data: await limitsService.getLimits() });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
};

// Accepts the AJAX JSON submit from the page; falls back to flash + redirect for plain form posts.
const update = async (req, res) => {
  const json = wantsJson(req);
  const { values, errors } = limitsService.validate(req.body);

  if (Object.keys(errors).length) {
    if (json) return res.status(422).json({ success: false, message: 'Please correct the highlighted fields.', errors });
    req.flash('error', Object.values(errors)[0]);
    return res.redirect(BASE_PATH);
  }

  try {
    const data = await limitsService.saveLimits(values);
    if (json) return res.json({ success: true, message: 'Deposit & withdrawal settings saved successfully.', data });
    req.flash('success', 'Deposit & withdrawal settings saved successfully.');
    return res.redirect(BASE_PATH);
  } catch (e) {
    if (json) return res.status(500).json({ success: false, message: 'Failed to save settings. Please try again.' });
    req.flash('error', 'Failed to save settings. Please try again.');
    return res.redirect(BASE_PATH);
  }
};

module.exports = { index, show, update };
