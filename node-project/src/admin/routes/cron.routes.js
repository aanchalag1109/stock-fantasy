'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { cron } = require('../controllers/misc.controller');
router.get('/', requireAdmin, cron.index);
router.delete('/clear', requireAdmin, cron.clear);
module.exports = router;
