'use strict';
const router = require('express').Router();
const { getBanners } = require('../controllers/banner.controller');
router.get('/', getBanners);
module.exports = router;
