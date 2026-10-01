'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/contest.controller');

router.get('/session/:sessionId', ctrl.contestsBySession);
router.get('/session-details/:sessionId', ctrl.getSessionDetails);
router.get('/active-session', ctrl.getActiveSession);
router.get('/user', ctrl.getUserContests);
router.post('/bulk-join', ctrl.bulkJoinContest);
router.post('/calculate-results', ctrl.calculateResults);
router.get('/', ctrl.contests);
router.get('/:id', ctrl.getContest);

module.exports = router;
