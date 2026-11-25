'use strict';
const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/kyc.controller');

// NEW IMPLEMENTATION — NODE.JS PROJECT: images / PDF only, and file names that cannot be guessed
const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf'];
const BY_TYPE = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf' };
/** Extension from the file name, or from the type when the name has none. */
const extensionOf = (file) => path.extname(file.originalname || '').toLowerCase() || BY_TYPE[file.mimetype] || '';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads/kyc')),
  filename: (req, file, cb) => cb(null, `kyc_${file.fieldname}_${Date.now()}_${crypto.randomBytes(12).toString('hex')}${extensionOf(file)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (ALLOWED.includes(extensionOf(file))
    ? cb(null, true)
    : cb(new Error('Documents must be JPG, PNG, WEBP, HEIC or PDF.'))),
});

const fields = upload.fields([
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'pan_front', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);
const kycFields = (req, res, next) => fields(req, res, (err) => {
  if (!err) return next();
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each document must be 5 MB or smaller.' : err.message;
  return res.status(422).json({ success: false, message });
});

router.post('/submit', kycFields, ctrl.submitKyc);
router.get('/status', ctrl.getKycStatus);

module.exports = router;
