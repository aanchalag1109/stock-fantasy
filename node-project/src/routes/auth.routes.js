'use strict';

const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/auth.controller');

// Multer for profile image
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads/profiles')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

// Auth routes
// NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
router.post('/send-otp', require('../controllers/otp.controller').sendOtp);
router.post('/login', ctrl.login);
router.post('/login/password', ctrl.passwordLogin);
router.post('/register', ctrl.register);
router.get('/check-user', ctrl.checkUser);
router.get('/settings', ctrl.getSettings);
router.get('/profile', ctrl.getUserProfile);
router.post('/profile/update', upload.single('profile_image'), ctrl.updateProfile);
router.get('/payment-details', ctrl.getPaymentDetails);
router.post('/payment-details/update', ctrl.updatePaymentDetails);
router.post('/fcm-token', ctrl.updateFcmToken);

// Also accept user_id-based profile fetch
router.get('/user-profile', ctrl.getUserProfile);

module.exports = router;
