'use strict';

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const {
  templates, performance, contestAnalysis, categories, liveManagement,
  pendingPrizes, payments, priceFeeds, testing, profile, referrals,
} = require('../controllers/pages.controller');

router.get('/templates', requireAdmin, requirePermission('templates.view'), templates.index);
router.get('/templates/:id/edit', requireAdmin, requirePermission('templates.edit'), templates.edit);
router.put('/templates/:id', requireAdmin, requirePermission('templates.edit'), templates.update);
router.delete('/templates/:id', requireAdmin, requirePermission('templates.delete'), templates.destroy);

router.get('/performance', requireAdmin, requirePermission('performance.view'), performance.index);
router.get('/performance/session/:id', requireAdmin, requirePermission('performance.view'), performance.session);
router.get('/performance/:id', requireAdmin, requirePermission('performance.view'), performance.show);

router.get('/contest-analysis', requireAdmin, requirePermission('contest_analysis.view'), contestAnalysis.index);
router.get('/contest-analysis/users', requireAdmin, requirePermission('contest_analysis.view'), contestAnalysis.users);
router.get('/contest-analysis/user/:id', requireAdmin, requirePermission('contest_analysis.view'), contestAnalysis.user);
router.get('/contest-analysis/session/:id', requireAdmin, requirePermission('contest_analysis.view'), contestAnalysis.session);
router.get('/contest-analysis/contest/:id', requireAdmin, requirePermission('contest_analysis.view'), contestAnalysis.contest);

router.get('/market_type_categories', requireAdmin, requirePermission('market_categories.view'), categories.index);
router.get('/market_type_categories/create', requireAdmin, requirePermission('market_categories.create'), categories.create);
router.post('/market_type_categories', requireAdmin, requirePermission('market_categories.create'), categories.store);
router.get('/market_type_categories/:id/edit', requireAdmin, requirePermission('market_categories.edit'), categories.edit);
router.put('/market_type_categories/:id', requireAdmin, requirePermission('market_categories.edit'), categories.update);
router.delete('/market_type_categories/:id', requireAdmin, requirePermission('market_categories.delete'), categories.destroy);

router.get('/live-management', requireAdmin, requirePermission('live_management.view'), liveManagement.index);
router.get('/pending-prizes', requireAdmin, requirePermission('pending_prizes.view'), pendingPrizes.index);
router.post('/pending-prizes/distribute-contest/:id', requireAdmin, requirePermission('pending_prizes.distribute'), pendingPrizes.distributeContest);
router.post('/pending-prizes/distribute-session/:id', requireAdmin, requirePermission('pending_prizes.distribute'), pendingPrizes.distributeSession);

router.get('/payments', requireAdmin, requirePermission('payments.view'), payments.index);
router.post('/payments/:id/approve', requireAdmin, requirePermission('payments.approve'), payments.setStatus(1));
router.post('/payments/:id/reject', requireAdmin, requirePermission('payments.approve'), payments.setStatus(-1));
router.post('/payments/:id/verify', requireAdmin, requirePermission('payments.approve'), payments.setStatus(4));

router.get('/live-price-feeds', requireAdmin, requirePermission('live_price_feeds.view'), priceFeeds.index);
router.get('/live-price-feeds/stocks', requireAdmin, requirePermission('live_price_feeds.view'), priceFeeds.stocks);
router.get('/live-price-feeds/cryptos', requireAdmin, requirePermission('live_price_feeds.view'), priceFeeds.cryptos);

router.get('/testing', requireAdmin, requirePermission('testing.view'), testing.index);
router.get('/testing/my-game', requireAdmin, requirePermission('testing.view'), testing.myGame);
router.get('/testing/test-users', requireAdmin, requirePermission('testing.view'), testing.testUsers);
router.post('/testing/generate-users', requireAdmin, requirePermission('testing.manage'), testing.generate);
router.post('/testing/bulk-delete-users', requireAdmin, requirePermission('testing.manage'), testing.bulkDelete);
router.post('/testing/bulk-delete-users-json', requireAdmin, requirePermission('testing.manage'), testing.bulkDeleteJson);
router.get('/testing/session/:sessionId/contests', requireAdmin, requirePermission('testing.view'), testing.sessionContests);
router.get('/testing/contest/:contestId', requireAdmin, requirePermission('testing.view'), testing.contestDetail);
router.post('/testing/bulk-join-contest', requireAdmin, requirePermission('testing.manage'), testing.bulkJoinContest);
router.post('/testing/create-basket', requireAdmin, requirePermission('testing.manage'), testing.createBasket);
router.delete('/testing/delete-basket/:basketId', requireAdmin, requirePermission('testing.manage'), testing.deleteBasket);
router.get('/testing/baskets/:userId/:sessionId', requireAdmin, requirePermission('testing.view'), testing.getBaskets);
router.get('/testing/user/:userId', requireAdmin, requirePermission('testing.view'), testing.userDetail);
router.get('/testing/user/:userId/session/:sessionId/contests', requireAdmin, requirePermission('testing.view'), testing.userSessionContests);
// Legacy simple user view (keep backward compat)
router.get('/testing/view/:id', requireAdmin, requirePermission('testing.view'), testing.user);

router.get('/profile', requireAdmin, profile.show);
router.get('/profile/show', requireAdmin, profile.show);
router.put('/profile', requireAdmin, profile.update);

router.get('/referrals', requireAdmin, requirePermission('referrals.view'), referrals.index);

module.exports = router;
