'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/contest.controller');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled Android Force Update System
const { requireSupportedAppVersion } = require('../middleware/app-version.middleware');

router.get('/session/:sessionId', ctrl.contestsBySession);
router.get('/session-details/:sessionId', ctrl.getSessionDetails);
router.get('/active-session', ctrl.getActiveSession);
router.get('/user', ctrl.getUserContests);
router.post('/bulk-join', requireSupportedAppVersion, ctrl.bulkJoinContest); // NEW IMPLEMENTATION — NODE.JS PROJECT: Android/iOS app version guard
router.post('/calculate-results', ctrl.calculateResults);
router.get('/', ctrl.contests);
router.get('/:id', ctrl.getContest);

module.exports = router;
