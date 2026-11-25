'use strict';
// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): League Contests (read-only)
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/league-contests.controller');

router.get('/', requireAdmin, requirePermission('league_contests.view'), ctrl.sessions);
router.get('/export', requireAdmin, requirePermission('league_contests.export'), ctrl.exportSessions);
router.get('/contests', requireAdmin, requirePermission('league_contests.view'), ctrl.contests);
router.get('/contests/export', requireAdmin, requirePermission('league_contests.export'), ctrl.exportContests);
router.get('/contests/:id', requireAdmin, requirePermission('league_contests.view'), ctrl.players);
router.get('/contests/:id/export', requireAdmin, requirePermission('league_contests.export'), ctrl.exportPlayers);

module.exports = router;
