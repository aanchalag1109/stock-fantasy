'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/session.controller');

router.get('/upcoming', ctrl.upcomingSessions);
router.get('/live', ctrl.liveSessions);
router.get('/completed', ctrl.completedSessions);
router.get('/all', ctrl.getAllSessions);
router.get('/user-joined', ctrl.getUserJoinedSessions);
router.get('/:id', ctrl.getSession);

module.exports = router;
