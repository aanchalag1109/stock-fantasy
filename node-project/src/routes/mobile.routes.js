'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const api = require('../controllers/mobile-api.controller');
const legacy = require('../controllers/mobile-legacy.controller');
const payment = require('../controllers/payment.controller');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled Android Force Update System
const appVersion = require('../controllers/app-version.controller');
const { requireSupportedAppVersion } = require('../middleware/app-version.middleware');

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

// NEW IMPLEMENTATION — NODE.JS PROJECT: public, read-only Android update policy check
router.get('/app-version/android', appVersion.checkAndroidVersion);
// NEW IMPLEMENTATION — NODE.JS PROJECT: public, read-only iOS update policy check
router.get('/app-version/ios', appVersion.checkIosVersion);
// NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
// Step 1 of login/signup; /login and /register then require the OTP.
router.post('/send-otp', require('../controllers/otp.controller').sendOtp);

router.post('/login', api.login);
router.post('/register', api.register);
// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): login with OTP or password
router.post('/password-login', api.passwordLogin);
router.post('/set-password', api.setPassword); // set / reset the password with an OTP (purpose: password)
// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): mobile / email change only with OTP
router.post('/change-email', api.changeEmail);
router.post('/change-mobile', api.changeMobile);
router.get('/check-user', api.checkUser);
router.post('/check-user', api.checkUser);

router.get('/banners', api.banners);
router.get('/upcoming-sessions', api.upcomingSessions);
// NEW IMPLEMENTATION — NODE.JS PROJECT: ObjectId ids too — they used to fall through to the older
// handlers in session/contest.controller, which return a different shape (no `id`, other date format).
router.get('/sessions/:sessionId(\\d+|[0-9a-fA-F]{24})', api.getSession);
router.get('/contests/session/:sessionId', api.contestsBySession);
router.get('/my-contests/session/:sessionId', api.myContestsBySession);
router.get('/user-contests', api.getUserContests);
router.get('/user-joined-sessions', api.getUserJoinedSessions);
router.get('/contests/:id(\\d+|[0-9a-fA-F]{24})', api.getContest);
router.post('/bulk-join-contest', requireSupportedAppVersion, api.bulkJoinContest); // NEW IMPLEMENTATION — NODE.JS PROJECT: Android/iOS app version guard

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
router.post('/deposit-amount', requireSupportedAppVersion, api.depositAmount); // NEW IMPLEMENTATION — NODE.JS PROJECT: Android/iOS app version guard
router.post('/withdraw-amount', requireSupportedAppVersion, api.withdrawAmount); // NEW IMPLEMENTATION — NODE.JS PROJECT: Android/iOS app version guard

router.get('/announcements', api.getAnnouncements);
router.get('/notifications', api.getUserNotifications);
router.post('/notifications/mark-read', api.markAsRead);
router.post('/notifications/mark-all-read', api.markAllAsRead);
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — per-user notification preferences
router.get('/notification-preferences', api.getNotificationPreferences);
router.post('/notification-preferences', api.updateNotificationPreferences);
router.get('/settings', api.getSettings);
// NEW IMPLEMENTATION — NODE.JS PROJECT: social links managed from admin → Settings (enabled links only, in order)
router.get('/social-links', async (req, res) => {
  try {
    const socialLinks = require('../services/social-links.service');
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ success: true, social_links: await socialLinks.publicLinks() });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch social links' });
  }
});
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
