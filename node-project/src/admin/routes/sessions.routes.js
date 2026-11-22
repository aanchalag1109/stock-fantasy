'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const s = require('../controllers/sessions.controller');
// NEW IMPLEMENTATION — NODE.JS PROJECT: shared session image upload (create + edit)
const { withSessionImage } = require('../helpers/session-image-upload');

// Sessions
router.get('/', requireAdmin, requirePermission('sessions.view'), s.index);
router.get('/create', requireAdmin, requirePermission('sessions.create'), s.create);
router.get('/template/:id', requireAdmin, requirePermission('sessions.create'), s.getTemplate);
router.post('/', requireAdmin, requirePermission('sessions.create'), withSessionImage(() => '/league_sessions/create'), s.store);
router.post('/update-status', requireAdmin, requirePermission('sessions.edit'), s.updateStatus);
router.post('/bulk-delete', requireAdmin, requirePermission('sessions.delete'), s.bulkDelete);
router.get('/:id', requireAdmin, requirePermission('sessions.view'), s.show);
router.get('/:id/edit', requireAdmin, requirePermission('sessions.edit'), s.edit);
// NEW IMPLEMENTATION — NODE.JS PROJECT: the edit form can change or remove the session image
router.put('/:id', requireAdmin, requirePermission('sessions.edit'), withSessionImage((req) => `/league_sessions/${req.params.id}/edit`), s.update);
router.delete('/:id', requireAdmin, requirePermission('sessions.delete'), s.destroy);
// PHP PARITY: "Refetch Missing Prices" (PHP league_sessions/{id}/refetch-prices)
router.post('/:id/refetch-prices', requireAdmin, requirePermission('sessions.edit'), s.refetchPrices);
// NEW IMPLEMENTATION — NODE.JS PROJECT: cancel session + refund all joined users (client request)
router.post('/:id/cancel', requireAdmin, requirePermission('sessions.cancel'), s.cancel);
module.exports = router;
