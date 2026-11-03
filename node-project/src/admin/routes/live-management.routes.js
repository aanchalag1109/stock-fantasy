'use strict';

/**
 * PHP PARITY — Live Management routes (PHP routes/web.php: live-management, session-contests/{id},
 * live-contest-detail/{id}, api/live-sessions-data, admin/api/start-session/{id},
 * admin/api/manual-complete-session/{id}, admin/api/fix-orphaned-contests,
 * admin/api/contest-details/{id}, admin/api/portfolio-details/{id}, api/cron/start-contests,
 * api/cron/update-scores).
 * NEW IMPLEMENTATION — NODE.JS PROJECT: POST /api/cancel-session/:id (client request).
 * Mounted at '/' in src/admin/app.js.
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/live-management.controller');

const view = requirePermission('live_management.view');
const manage = requirePermission('live_management.manage');

router.get('/live-management', requireAdmin, view, ctrl.index);
router.get('/session-contests/:id', requireAdmin, view, ctrl.sessionContestsPage);
router.get('/live-contest-detail/:id', requireAdmin, view, ctrl.contestDetailPage);

router.get('/api/live-sessions-data', requireAdmin, view, ctrl.liveSessionsData);
router.get('/api/contest-details/:id', requireAdmin, view, ctrl.contestDetails);
router.get('/api/portfolio-details/:id', requireAdmin, view, ctrl.portfolioDetails);

router.post('/api/start-session/:id', requireAdmin, manage, ctrl.startSession);
router.post('/api/manual-complete-session/:id', requireAdmin, manage, ctrl.endAndDistribute);
router.post('/api/fix-orphaned-contests', requireAdmin, manage, ctrl.fixOrphanedContests);
router.post('/api/live/start-contests', requireAdmin, manage, ctrl.startContests);
router.post('/api/live/update-scores', requireAdmin, manage, ctrl.updateScores);
router.post('/api/cancel-session/:id', requireAdmin, requirePermission('sessions.cancel'), ctrl.cancelSession);

module.exports = router;
