'use strict';

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const {
  templates, performance, contestAnalysis, categories, liveManagement,
  pendingPrizes, payments, priceFeeds, testing, profile, referrals,
} = require('../controllers/pages.controller');

router.get('/templates', requireAdmin, templates.index);
router.get('/templates/:id/edit', requireAdmin, templates.edit);
router.put('/templates/:id', requireAdmin, templates.update);
router.delete('/templates/:id', requireAdmin, templates.destroy);

router.get('/performance', requireAdmin, performance.index);
router.get('/performance/session/:id', requireAdmin, performance.session);
router.get('/performance/:id', requireAdmin, performance.show);

router.get('/contest-analysis', requireAdmin, contestAnalysis.index);
router.get('/contest-analysis/users', requireAdmin, contestAnalysis.users);
router.get('/contest-analysis/user/:id', requireAdmin, contestAnalysis.user);
router.get('/contest-analysis/session/:id', requireAdmin, contestAnalysis.session);
router.get('/contest-analysis/contest/:id', requireAdmin, contestAnalysis.contest);

router.get('/market_type_categories', requireAdmin, categories.index);
router.get('/market_type_categories/create', requireAdmin, categories.create);
router.post('/market_type_categories', requireAdmin, categories.store);
router.get('/market_type_categories/:id/edit', requireAdmin, categories.edit);
router.put('/market_type_categories/:id', requireAdmin, categories.update);
router.delete('/market_type_categories/:id', requireAdmin, categories.destroy);

router.get('/live-management', requireAdmin, liveManagement.index);
router.get('/pending-prizes', requireAdmin, pendingPrizes.index);
router.post('/pending-prizes/distribute-contest/:id', requireAdmin, pendingPrizes.distributeContest);
router.post('/pending-prizes/distribute-session/:id', requireAdmin, pendingPrizes.distributeSession);

router.get('/payments', requireAdmin, payments.index);
router.post('/payments/:id/approve', requireAdmin, payments.setStatus(1));
router.post('/payments/:id/reject', requireAdmin, payments.setStatus(-1));
router.post('/payments/:id/verify', requireAdmin, payments.setStatus(4));

router.get('/live-price-feeds', requireAdmin, priceFeeds.index);
router.get('/live-price-feeds/stocks', requireAdmin, priceFeeds.stocks);
router.get('/live-price-feeds/cryptos', requireAdmin, priceFeeds.cryptos);

router.get('/testing', requireAdmin, testing.index);
router.get('/testing/my-game', requireAdmin, testing.myGame);
router.get('/testing/test-users', requireAdmin, testing.testUsers);
router.post('/testing/generate-users', requireAdmin, testing.generate);
router.post('/testing/bulk-delete-users', requireAdmin, testing.bulkDelete);
router.post('/testing/bulk-delete-users-json', requireAdmin, testing.bulkDeleteJson);
router.get('/testing/session/:sessionId/contests', requireAdmin, testing.sessionContests);
router.get('/testing/contest/:contestId', requireAdmin, testing.contestDetail);
router.post('/testing/bulk-join-contest', requireAdmin, testing.bulkJoinContest);
router.post('/testing/create-basket', requireAdmin, testing.createBasket);
router.delete('/testing/delete-basket/:basketId', requireAdmin, testing.deleteBasket);
router.get('/testing/baskets/:userId/:sessionId', requireAdmin, testing.getBaskets);
router.get('/testing/user/:userId', requireAdmin, testing.userDetail);
router.get('/testing/user/:userId/session/:sessionId/contests', requireAdmin, testing.userSessionContests);
// Legacy simple user view (keep backward compat)
router.get('/testing/view/:id', requireAdmin, testing.user);

router.get('/profile', requireAdmin, profile.show);
router.get('/profile/show', requireAdmin, profile.show);
router.put('/profile', requireAdmin, profile.update);

router.get('/referrals', requireAdmin, referrals.index);

module.exports = router;
