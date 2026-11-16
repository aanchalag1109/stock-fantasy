'use strict';

// NEW IMPLEMENTATION — NODE.JS PROJECT: USDT deposits via PayRam (mounted at /api/v1/payram and /api/payram).
// The webhook (POST /webhook) is registered in app.js with express.raw() so its signature can be verified.
const router = require('express').Router();
const ctrl = require('../controllers/payram.controller');
const { requireSupportedAppVersion } = require('../middleware/app-version.middleware');

router.get('/config', ctrl.getConfig);
router.post('/quote', ctrl.getQuote);
router.post('/deposit', requireSupportedAppVersion, ctrl.createDeposit);
router.get('/deposit/:deposit_id', ctrl.getDeposit);
router.get('/deposits', ctrl.listDeposits);

module.exports = router;
