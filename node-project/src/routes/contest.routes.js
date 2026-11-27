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
// NEW IMPLEMENTATION — NODE.JS PROJECT (security): rewrote every entry's score without a login — removed
router.post('/calculate-results', (req, res) => res.status(410).json({ success: false, error: 'This endpoint has been removed.' }));
router.get('/', ctrl.contests);
router.get('/:id', ctrl.getContest);

module.exports = router;
