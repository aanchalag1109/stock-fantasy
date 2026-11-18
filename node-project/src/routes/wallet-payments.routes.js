'use strict';

// NEW IMPLEMENTATION — NODE.JS PROJECT: INR & USDT deposits / withdrawals (mounted at /api/v1 and /api)
const router = require('express').Router();
const ctrl = require('../controllers/wallet-payments.controller');
const { requireSupportedAppVersion } = require('../middleware/app-version.middleware');

router.get('/payments/options', ctrl.options);
router.post('/deposit/quote', requireSupportedAppVersion, ctrl.depositQuote);
router.post('/deposit/quotes', requireSupportedAppVersion, ctrl.depositQuotes);
router.post('/deposit/inr/create', requireSupportedAppVersion, ctrl.inrCreate);
router.get('/deposit/inr/status/:order_id', ctrl.inrStatus);
router.get('/deposit/inr/history', ctrl.inrHistory);
router.post('/withdraw/quote', requireSupportedAppVersion, ctrl.withdrawQuote);
router.post('/withdraw/request', requireSupportedAppVersion, ctrl.withdrawRequest);
router.get('/withdraw/history', ctrl.withdrawHistory);
router.get('/payout-details', ctrl.payoutDetails);
router.post('/payout-details/inr', ctrl.saveInrPayoutDetails);

module.exports = router;
