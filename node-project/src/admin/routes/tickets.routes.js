'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const { tickets } = require('../controllers/misc.controller');
router.get('/', requireAdmin, requirePermission('tickets.view'), tickets.index);
router.get('/:id', requireAdmin, requirePermission('tickets.view'), tickets.show);
router.post('/:id/close', requireAdmin, requirePermission('tickets.reply'), tickets.close);
router.post('/:id/reply', requireAdmin, requirePermission('tickets.reply'), tickets.reply);
module.exports = router;
