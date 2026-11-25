'use strict';
// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): Session Stocks (read-only)
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/session-stocks.controller');

router.get('/', requireAdmin, requirePermission('session_stocks.view'), ctrl.sessions);
router.get('/:id', requireAdmin, requirePermission('session_stocks.view'), ctrl.stocks);
router.get('/:id/stock', requireAdmin, requirePermission('session_stocks.view'), ctrl.stock);
router.get('/:id/export', requireAdmin, requirePermission('session_stocks.export'), ctrl.exportStocks);
router.get('/:id/history/export', requireAdmin, requirePermission('session_stocks.export'), ctrl.exportHistory);

module.exports = router;
