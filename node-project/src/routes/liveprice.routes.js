'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/liveprice.controller');
router.get('/live', ctrl.getLivePrices);
router.get('/stock', ctrl.getStockLivePrice);
router.get('/crypto', ctrl.getCryptoLivePrice);
router.get('/optimized', ctrl.getOptimizedPrices);
module.exports = router;
