'use strict';

/**
 * PHP PARITY — Performance contest page actions missed in the conversion (PHP routes/web.php +
 * routes/admin.php): admin/api/run-all/{contestId}, admin/api/run-all-log/{contestId},
 * admin/api/run-all-stop/{contestId}, admin/api/verify-historical-prices/{sessionId},
 * admin/api/analyze-price-errors/{sessionId}, and the page's "Calculate Results" button
 * (PHP called /api/v1/calculate-results on the same host; the Node admin runs on its own port,
 * so it gets an admin route that runs the same routine).
 * Mounted at '/' in src/admin/app.js.
 */

const router = require('express').Router();
const mongoose = require('mongoose');
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const logger = require('../../config/logger');
const Contest = require('../../models/contest.model');
const runAll = require('../../services/run-all.service');
const tools = require('../../services/performance-tools.service');
const legacy = require('../../controllers/mobile-legacy.controller');
const { publicId } = require('../../helpers/mobile-compat');

const view = requirePermission('performance.view');
const manage = requirePermission('performance.manage');
const actor = (req) => (req.adminAccess ? req.adminAccess.email : 'admin');

router.post('/api/run-all/:contestId', requireAdmin, manage, async (req, res) => {
  try {
    const result = await runAll.start(req.params.contestId, req.body || {}, { actor: actor(req) });
    res.status(result.status).json(result.body);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/api/run-all-log/:contestId', requireAdmin, view, async (req, res) => {
  try { res.json(await runAll.getLog(req.params.contestId)); } catch (err) { res.status(500).json({ status: 'failed', log: [err.message] }); }
});

router.post('/api/run-all-stop/:contestId', requireAdmin, manage, async (req, res) => {
  try {
    const result = await runAll.stop(req.params.contestId, { actor: actor(req) });
    res.status(result.success ? 200 : 404).json(result);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/api/verify-historical-prices/:sessionId', requireAdmin, view, async (req, res) => {
  try { res.json(await tools.verifyHistoricalPrices(req.params.sessionId)); } catch (err) { res.status(500).json({ success: false, error: 'Verification failed: ' + err.message }); }
});

router.post('/api/analyze-price-errors/:sessionId', requireAdmin, view, async (req, res) => {
  try { res.json(await tools.analyzePriceErrors(req.params.sessionId)); } catch (err) { res.json({ success: false, error: err.message }); }
});

// PHP "Calculate Results": same routine as POST /api/v1/calculate-results (scores, ranks and — if the
// contest is not calculated yet — credits prizes; see controllers/mobile-legacy.controller.js).
router.post('/api/performance/:contestId/calculate-results', requireAdmin, manage, async (req, res) => {
  const id = String(req.params.contestId);
  const contest = mongoose.isValidObjectId(id) && id.length === 24
    ? await Contest.findById(id).select('_id old_id').lean()
    : await Contest.findOne({ old_id: Number(id) }).select('_id old_id').lean();
  if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });
  logger.info(`[performance] ${actor(req)} ran Calculate Results for contest ${publicId(contest)}`);
  return legacy.calculateResults({ body: { contest_id: String(publicId(contest)) }, query: {} }, res);
});

module.exports = router;
