'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Fantasy Contest Formats — admin Contest Settings page
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/contest-settings.controller');

router.get('/', requireAdmin, requirePermission('contest_settings.view'), ctrl.index);
router.post('/', requireAdmin, requirePermission('contest_settings.edit'), ctrl.update);

module.exports = router;
