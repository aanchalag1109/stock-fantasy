'use strict';
const router = require('express').Router();
const { cronAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/cron.controller');

router.post('/run', cronAuth, ctrl.runCron);
router.get('/logs', cronAuth, ctrl.getCronLogs);

module.exports = router;
