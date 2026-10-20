'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const api = require('../controllers/mobile-api.controller');
const legacy = require('../controllers/mobile-legacy.controller');
const payment = require('../controllers/payment.controller');

const profileDir = path.join(__dirname, '../../public/uploads/profiles');
const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(profileDir, { recursive: true });
      cb(null, profileDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '.jpg');
      cb(null, `profile_${req.body.user_id || 'user'}_${Math.floor(Date.now() / 1000)}${ext}`);
    },
  }),
  limits: { fileSize: 2048 * 1024 },
}).single('profile_image');

router.post('/payment/lgpay-callback', api.lgpayCallback);
router.get('/payment-return', payment.paymentReturn);

// NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
// Step 1 of login/signup; /login and /register then require the OTP.
router.post('/send-otp', require('../controllers/otp.controller').sendOtp);

router.post('/login', api.login);
router.post('/register', api.register);
router.post('/password-login', api.passwordLogin);
router.get('/check-user', api.checkUser);
router.post('/check-user', api.checkUser);

router.get('/banners', api.banners);
router.get('/upcoming-sessions', api.upcomingSessions);
router.get('/sessions/:sessionId(\\d+)', api.getSession);
router.get('/contests/session/:sessionId', api.contestsBySession);
router.get('/my-contests/session/:sessionId', api.myContestsBySession);
router.get('/user-contests', api.getUserContests);
router.get('/user-joined-sessions', api.getUserJoinedSessions);
router.get('/contests/:id(\\d+)', api.getContest);
router.post('/bulk-join-contest', api.bulkJoinContest);

router.get('/sessions', api.getUserSessions);
router.get('/sessions/active', api.getActiveSession);
router.get('/league-session-assets/:sessionId', api.getSessionAssets);
router.get('/session-assets-grouped/:sessionId', api.getSessionAssetsGrouped);

router.delete('/saved-baskets/:id', api.destroyBasket);
router.post('/cleanup-empty-baskets', api.cleanupEmptyBaskets);
router.get('/saved-baskets', api.savedBaskets);
router.get('/contest-baskets', api.getContestBaskets);
router.get('/api/user-contest-baskets', api.getUserContestBaskets);
router.post('/delete-basket', api.deleteBasket);
router.post('/edit-basket', api.editBasket);
router.post('/update-basket', api.editBasket);
router.post('/save-standalone-basket', api.storeStandalone);
router.post('/save-basket', api.saveBasket);

router.get('/wallet-amount', api.getWalletAmount);
router.get('/user-transactions', api.getUserTransactions);
router.get('/user-transactions-empty', api.userTransactionsEmpty);
router.get('/clear-user-transactions', api.clearUserTransactions);
router.post('/deposit-amount', api.depositAmount);
router.post('/withdraw-amount', api.withdrawAmount);

router.get('/announcements', api.getAnnouncements);
router.get('/notifications', api.getUserNotifications);
router.post('/notifications/mark-read', api.markAsRead);
router.post('/notifications/mark-all-read', api.markAllAsRead);
router.get('/settings', api.getSettings);
router.post('/update-profile', (req, res, next) => {
  profileUpload(req, res, (err) => (err ? res.status(500).json({ success: false, message: 'Profile update failed: ' + err.message, errors: null }) : next()));
}, api.updateProfile);
router.get('/user-profile', api.getUserProfile);
router.get('/payment-details/:user_id', api.getPaymentDetails);
router.post('/payment-details/update', api.updatePaymentDetails);

router.get('/live-prices', api.getLivePrices);
router.get('/stock-live-price', api.getStockLivePrice);
router.get('/crypto-live-price', api.getCryptoLivePrice);
router.get('/session-stats/:sessionId', api.sessionStats);

router.get('/debug-payment', legacy.debugPayment);
router.get('/check-wallet', legacy.checkWallet);
router.get('/check-latest-payment', legacy.checkLatestPayment);
router.get('/test-payment-add', legacy.testPaymentAdd);
router.get('/trigger-callback', legacy.triggerCallback);
router.post('/save-start-prices', legacy.saveStartPrices);
router.post('/save-end-prices', legacy.saveEndPrices);
router.post('/calculate-results', legacy.calculateResults);
router.get('/test-calculate-contest', legacy.testCalculateContest);
router.get('/debug-calculate-contest', legacy.debugCalculateContest);
router.post('/save-api-structure', legacy.saveApiStructure);

module.exports = router;
