'use strict';
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/kyc.controller');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads/kyc')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `kyc_${file.fieldname}_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const kycFields = upload.fields([
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'pan_front', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

router.post('/submit', kycFields, ctrl.submitKyc);
router.get('/status', ctrl.getKycStatus);

module.exports = router;
