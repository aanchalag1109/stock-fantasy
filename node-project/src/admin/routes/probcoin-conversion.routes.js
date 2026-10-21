'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT/INR to ProbCoin Conversion Settings
 * Purpose: Allow authorized administrators to configure conversion rates.
 * Origin: Newly implemented in node-project.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Mounted at /probcoin-conversion in the admin app (admin routes have no /api/admin
 * prefix in this project):
 *   GET  /probcoin-conversion        settings page            (probcoin_conversion.view)
 *   GET  /probcoin-conversion/data   current rates as JSON    (probcoin_conversion.view)
 *   PUT  /probcoin-conversion        validate + save rates    (probcoin_conversion.edit)
 * Plain HTML forms reach PUT via the existing method-override (?_method=PUT).
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const controller = require('../controllers/probcoin-conversion.controller');

router.get('/', requireAdmin, requirePermission('probcoin_conversion.view'), controller.index);
router.get('/data', requireAdmin, requirePermission('probcoin_conversion.view'), controller.show);
router.put('/', requireAdmin, requirePermission('probcoin_conversion.edit'), controller.update);

module.exports = router;
