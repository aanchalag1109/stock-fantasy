'use strict';
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const s = require('../controllers/sessions.controller');

const sessionUploadDir = path.join(__dirname, '../../../public/uploads/sessions');
const sessionImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(sessionUploadDir, { recursive: true });
      cb(null, sessionUploadDir);
    },
    filename: (req, file, cb) => {
      const base = path.basename(file.originalname || 'image').replace(/[/\\]/g, '');
      cb(null, `${Math.floor(Date.now() / 1000)}_${base}`);
    },
  }),
  limits: { fileSize: 2048 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okExt = ['.jpeg', '.jpg', '.png', '.gif'].includes(ext);
    const okMime = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'].includes(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    cb(new Error('The session image must be a file of type: jpeg, png, jpg, gif.'));
  },
}).single('session_image');

function withSessionImage(req, res, next) {
  sessionImageUpload(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'The session image must not be greater than 2048 kilobytes.'
      : (err.message || 'The session image failed to upload.');
    req.flash('error', message);
    res.redirect('/league_sessions/create');
  });
}

// Sessions
router.get('/', requireAdmin, requirePermission('sessions.view'), s.index);
router.get('/create', requireAdmin, requirePermission('sessions.create'), s.create);
router.get('/template/:id', requireAdmin, requirePermission('sessions.create'), s.getTemplate);
router.post('/', requireAdmin, requirePermission('sessions.create'), withSessionImage, s.store);
router.post('/update-status', requireAdmin, requirePermission('sessions.edit'), s.updateStatus);
router.post('/bulk-delete', requireAdmin, requirePermission('sessions.delete'), s.bulkDelete);
router.get('/:id', requireAdmin, requirePermission('sessions.view'), s.show);
router.get('/:id/edit', requireAdmin, requirePermission('sessions.edit'), s.edit);
router.put('/:id', requireAdmin, requirePermission('sessions.edit'), s.update);
router.delete('/:id', requireAdmin, requirePermission('sessions.delete'), s.destroy);
module.exports = router;
