'use strict';

/**
 * Session / template image upload (field "session_image" → public/uploads/sessions).
 * PHP rules: jpeg, png, jpg or gif, at most 2048 KB.
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT: shared by Create Session, Edit Session and Edit Template
 * (client feedback: the image can be changed when editing). Moved here from sessions.routes.js.
 *
 * withSessionImage(redirectTo) → middleware; on an upload error it flashes the PHP message and
 * redirects to redirectTo(req). A request that is not multipart passes through unchanged.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../../../public/uploads/sessions');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
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
    return cb(new Error('The session image must be a file of type: jpeg, png, jpg, gif.'));
  },
}).single('session_image');

function withSessionImage(redirectTo) {
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'The session image must not be greater than 2048 kilobytes.'
        : (err.message || 'The session image failed to upload.');
      req.flash('error', message);
      return res.redirect(redirectTo(req));
    });
  };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: the image change an edit form asks for.
 * { image_url: 'uploads/sessions/<file>' } for a new upload, { image_url: null } when "remove" is
 * ticked, {} when the image stays as it is.
 */
function imageChange(req) {
  if (req.file) return { image_url: `uploads/sessions/${req.file.filename}` };
  const remove = req.body && req.body.remove_image;
  if (remove === '1' || remove === 'on' || remove === true) return { image_url: null };
  return {};
}

module.exports = { withSessionImage, imageChange, UPLOAD_DIR };
