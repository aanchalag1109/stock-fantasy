'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/stats.controller');
router.get('/user', ctrl.getUserStats);
router.get('/leaderboard', ctrl.getLeaderboard);
module.exports = router;
