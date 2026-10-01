'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/market.controller');
router.get('/assets', ctrl.getAssets);
router.get('/assets/grouped', ctrl.getAssetsGrouped);
router.get('/categories', ctrl.getCategories);
module.exports = router;
