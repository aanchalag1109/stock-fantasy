# API Mapping Documentation: Laravel to Express.js

This document provides the exhaustive mapping between Laravel routes and the migrated Express.js endpoints.

---

## 1. Authentication & User Profile APIs (`/api/v1` and `/api`)

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| POST | `/api/v1/login` | `/api/v1/auth/login` & `/api/v1/login` | Public | `authController.login` | Mobile-only instant OTP login |
| POST | `/api/v1/register` | `/api/v1/auth/register` & `/api/v1/register` | Public | `authController.register` | User registration with mobile, email, pass |
| POST | `/api/v1/password-login` | `/api/v1/auth/password-login` & `/api/v1/password-login` | Public | `authController.passwordLogin` | Password verification & signin log |
| POST | `/api/v1/check-user` | `/api/v1/auth/check-user` & `/api/v1/check-user` | Public | `authController.checkUser` | Checks if mobile number exists |
| GET | `/api/v1/user-profile` | `/api/v1/user/profile` & `/api/v1/user-profile` | Public/Auth | `authController.getUserProfile` | Fetch profile details & unread count |
| POST | `/api/v1/update-profile` | `/api/v1/user/profile` & `/api/v1/update-profile` | Public/Auth | `authController.updateProfile` | Update name, email, mobile, password, avatar |
| GET | `/api/v1/payment-details/:user_id` | `/api/v1/payment-details/:user_id` | Public | `authController.getPaymentDetails` | Get USDT wallet address & network |
| POST | `/api/v1/payment-details/update` | `/api/v1/payment-details/update` | Public | `authController.updatePaymentDetails` | Update USDT wallet address |
| GET | `/api/v1/settings` | `/api/v1/settings` & `/api/settings` | Public | `authController.getSettings` | Get system key-value settings |
| POST | `/api/save-fcm-token` | `/api/save-fcm-token` | Public | `authController.saveFcmToken` | Save FCM device token for push notifications |

---

## 2. Wallet & Financial Transactions APIs

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| GET | `/api/v1/wallet-amount` | `/api/v1/wallet-amount` & `/api/wallet-amount` | Public | `walletController.getWalletAmount` | Returns deposit, winnings, total balance |
| GET | `/api/v1/user-transactions` | `/api/v1/user-transactions` & `/api/user-transactions` | Public | `walletController.getUserTransactions` | Returns user transactions with contest & basket info |
| POST | `/api/v1/deposit-amount` | `/api/v1/deposit-amount` & `/api/deposit-amount` | Public | `walletController.depositAmount` | Credits user deposit balance and records tx |
| POST | `/api/v1/withdraw-amount` | `/api/v1/withdraw-amount` & `/api/withdraw-amount` | Public | `walletController.withdrawAmount` | Validates USDT details, deducts winnings, creates request |
| GET | `/api/withdrawal-requests` | `/api/withdrawal-requests` | Public | `walletController.getWithdrawalRequests` | List withdrawal requests for user |

---

## 3. Baskets & Contest Participation APIs

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| POST | `/api/v1/save-basket` | `/api/v1/save-basket` & `/api/save-basket` | Public | `basketController.saveBasket` | Creates standalone basket (`B1`, `B2`...) or updates |
| POST | `/api/v1/save-standalone-basket` | `/api/v1/save-standalone-basket` | Public | `basketController.storeStandalone` | Explicit standalone basket creation with multipliers |
| GET | `/api/v1/saved-baskets` | `/api/v1/saved-baskets` & `/api/saved-baskets` | Public | `basketController.savedBaskets` | Fetch user standalone baskets for a session |
| GET | `/api/v1/contest-baskets` | `/api/v1/contest-baskets` | Public | `basketController.getContestBaskets` | Get baskets available for entering a contest |
| POST | `/api/v1/edit-basket` | `/api/v1/edit-basket` | Public | `basketController.editBasket` | Edit basket asset selections |
| POST | `/api/v1/delete-basket` | `/api/v1/delete-basket` | Public | `basketController.deleteBasket` | Delete a saved basket |
| DELETE | `/api/v1/saved-baskets/:id` | `/api/v1/saved-baskets/:id` | Public | `basketController.destroy` | Delete saved basket by ID |
| POST | `/api/v1/cleanup-empty-baskets`| `/api/v1/cleanup-empty-baskets` | Public | `basketController.cleanupEmptyBaskets`| Remove corrupted baskets without assets |
| POST | `/api/v1/bulk-join-contest` | `/api/v1/bulk-join-contest` | Public | `contestController.bulkJoinContest` | Deducts fees, adds entries, creates tx |
| POST | `/api/join-contest` | `/api/join-contest` | Public | `contestController.joinContest` | Single contest join |
| POST | `/api/save-basket-and-join-contest`| `/api/save-basket-and-join-contest` | Public | `contestController.saveBasketAndJoin` | Create basket and join in one atomic request |
| POST | `/api/assign-basket-to-contest` | `/api/assign-basket-to-contest` | Public | `basketController.assignToContest` | Link standalone basket to contest |

---

## 4. League Sessions & Contests APIs

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| GET | `/api/v1/upcoming-sessions` | `/api/v1/upcoming-sessions` | Public | `sessionController.upcomingSessions` | List upcoming sessions |
| GET | `/api/v1/sessions/:id` | `/api/v1/sessions/:id` & `/api/sessions/:id` | Public | `sessionController.getSession` | Fetch session details |
| GET | `/api/v1/sessions` | `/api/v1/sessions` | Public | `sessionController.getUserSessions` | List all sessions |
| GET | `/api/v1/sessions/active` | `/api/v1/sessions/active` | Public | `sessionController.getActiveSession` | Fetch currently active session |
| GET | `/api/live-sessions` | `/api/live-sessions` | Public | `sessionController.liveSessions` | List currently live sessions |
| GET | `/api/v1/contests/session/:id` | `/api/v1/contests/session/:id` | Public | `contestController.contestsBySession`| List contests with spots & pin sort |
| GET | `/api/v1/my-contests/session/:id`| `/api/v1/my-contests/session/:id`| Public | `contestController.myContestsBySession`| User's joined contests for a session |
| GET | `/api/v1/user-contests` | `/api/v1/user-contests` | Public | `contestController.getUserContests` | All joined contests across sessions |
| GET | `/api/v1/contests/:id` | `/api/v1/contests/:id` & `/api/contests/:id` | Public | `contestController.getContest` | Contest detail with participants & live scores |
| GET | `/api/contests` | `/api/contests` | Public | `contestController.contests` | General contest list |
| GET | `/api/featured-contests` | `/api/featured-contests` | Public | `contestController.featuredContests` | Featured/pinned contests |
| GET | `/api/v1/league-session-assets/:id`| `/api/v1/league-session-assets/:id`| Public | `sessionController.getSessionAssets` | Assets available for session |
| GET | `/api/v1/session-assets-grouped/:id`| `/api/v1/session-assets-grouped/:id`| Public| `sessionController.getSessionAssetsGrouped`| Session assets grouped by market cap |
| GET | `/api/session-assets/:sessionId` | `/api/session-assets/:sessionId` | Public | `sessionController.getSessionAssetsFormatted`| Assets grouped for basket creation |
| GET | `/api/session-contests/:sessionId` | `/api/session-contests/:sessionId` | Public | `contestController.getSessionContestsDropdown`| Contest options for dropdowns |
| GET | `/api/session-prices/:sessionId` | `/api/session-prices/:sessionId` | Public | `sessionController.getSessionPrices` | Start & end prices for session |
| GET | `/api/v1/session-stats/:sessionId` | `/api/v1/session-stats/:sessionId` | Public | `statsController.sessionStats` | Top gainers and losers in session |

---

## 5. Pricing & Calculation APIs

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| POST | `/api/flexible-pricing` | `/api/flexible-pricing` | Public | `pricingController.flexiblePricing` | Calculate prize tiers from participants & fee |
| POST | `/api/save-start-prices` | `/api/save-start-prices` & `/api/v1/save-start-prices` | Public | `calculateController.saveStartPrices` | Fetch and persist start prices |
| POST | `/api/save-end-prices` | `/api/save-end-prices` & `/api/v1/save-end-prices` | Public | `calculateController.saveEndPrices` | Fetch and persist end prices |
| POST | `/api/calculate-results` | `/api/calculate-results` & `/api/v1/calculate-results` | Public | `calculateController.calculateResults` | Calculate score, ranks, prize payouts |
| POST | `/api/v1/save-api-structure` | `/api/v1/save-api-structure` | Public | `performanceController.saveApiStructure` | Save performance prizes structure |
| POST | `/api/distribute-prizes/:id` | `/api/distribute-prizes/:id` | Public | `transactionController.distributePrizes` | Distribute prizes to contest winners |
| POST | `/api/fix-duplicate-transactions/:id`| `/api/fix-duplicate-transactions/:id`| Public | `transactionController.fixDuplicates` | Deduplicate and reconcile winnings |

---

## 6. Live Prices & Feeds APIs

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| GET | `/api/live-prices` | `/api/live-prices` & `/api/v1/live-prices` | Public | `livePriceController.getLivePrices` | Multi-asset live prices |
| GET | `/api/v1/stock-live-price` | `/api/v1/stock-live-price` | Public | `livePriceController.getStockLivePrice` | Single stock live quote |
| GET | `/api/v1/crypto-live-price` | `/api/v1/crypto-live-price` | Public | `livePriceController.getCryptoLivePrice`| Single crypto live quote |
| GET | `/api/crypto/:symbols` | `/api/crypto/:symbols` | Public | `livePriceController.getCrypto` | Batch crypto prices |
| GET | `/api/stock/:symbol` | `/api/stock/:symbol` | Public | `livePriceController.getStock` | Batch stock prices |
| GET | `/api/rapid-stocks` | `/api/rapid-stocks` | Public | `publicApiController.getRapidApiStocks`| Raw RapidAPI stock quotes |
| GET | `/api/binance-crypto` | `/api/binance-crypto` | Public | `publicApiController.getBinanceCrypto` | Binance ticker price data |

---

## 7. Payments & Gateway (LG Pay)

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| GET | `/payment/create` | `/api/v1/payment/create` | Public | `paymentController.createOrder` | Decrypts Flutter data, calls LG Pay |
| POST | `/api/v1/payment/lgpay-callback`| `/api/v1/payment/lgpay-callback` | Public | `paymentController.lgpayCallback` | Webhook verification, credits wallet |
| GET | `/api/v1/payment-return` | `/api/v1/payment-return` | Public | `paymentController.paymentReturn` | User redirect URL from gateway |
| GET | `/verify-payment/:orderId` | `/verify-payment/:orderId` | Public | `paymentController.verifyPayment` | Polls LG Pay status and completes deposit |
| GET | `/check-payment-status` | `/check-payment-status` | Public | `paymentController.checkPaymentStatus` | Checks payment status by order ID |
| GET | `/check-latest-payment` | `/check-latest-payment` & `/api/v1/check-latest-payment` | Public | `paymentController.checkLatestPayment` | Most recent payment for user |

---

## 8. Cron & Automation Endpoints

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| GET | `/api/cron/status-update` | `/api/cron/status-update` | Secret Auth | `cronController.statusUpdate` | Fast 1-min session start/end checker |
| GET | `/api/cron/master` | `/api/cron/master` | Secret Auth | `cronController.masterCron` | Full automated multi-phase pipeline |
| GET | `/api/cron/start-contests` | `/api/cron/start-contests` | Public/Secret | `cronController.cronAllInOne` | Starts upcoming sessions |
| GET | `/api/cron/update-scores` | `/api/cron/update-scores` | Public/Secret | `cronController.cronUpdateScores` | Updates live scores |
| GET | `/api/cron/end-contests` | `/api/cron/end-contests` | Public/Secret | `cronController.cronEndContests` | Declares end contests |
| GET | `/run-cron` | `/run-cron` | Public | `cronController.runCron` | Webhook trigger for scheduler |

---

## 9. Admin Panel APIs (`/admin/...`)

| HTTP | Laravel URI | Express.js URI | Middleware | Controller & Method | Description |
|---|---|---|---|---|---|
| POST | `/admin/login` | `/admin/login` | Public | `adminAuthController.login` | Admin email & password login |
| POST | `/admin/logout` | `/admin/logout` | Admin Auth | `adminAuthController.logout` | Admin logout |
| GET | `/admin/dashboard` | `/admin/dashboard` | Admin Auth | `adminDashboardController.index` | Dashboard metrics and statistics |
| GET | `/admin/users` | `/admin/users` | Admin Auth | `adminUserController.index` | Paginated users with search & filters |
| POST | `/admin/users` | `/admin/users` | Admin Auth | `adminUserController.store` | Create new user |
| PUT | `/admin/users/:id` | `/admin/users/:id` | Admin Auth | `adminUserController.update` | Update user profile and balance |
| DELETE | `/admin/users/:id` | `/admin/users/:id` | Admin Auth | `adminUserController.destroy` | Delete user |
| POST | `/admin/users/bulk-delete` | `/admin/users/bulk-delete` | Admin Auth | `adminUserController.bulkDelete` | Bulk delete user IDs |
| POST | `/admin/users/:id/wallet/add` | `/admin/users/:id/wallet/add` | Admin Auth | `adminUserController.addToWallet` | Admin credit wallet |
| POST | `/admin/users/:id/wallet/remove`| `/admin/users/:id/wallet/remove`| Admin Auth | `adminUserController.removeFromWallet` | Admin debit wallet |
| GET | `/admin/contests` | `/admin/contests` | Admin Auth | `adminContestController.index` | List all contests |
| POST | `/admin/contests` | `/admin/contests` | Admin Auth | `adminContestController.store` | Create new contest |
| PUT | `/admin/contests/:id` | `/admin/contests/:id` | Admin Auth | `adminContestController.update` | Update contest configuration |
| DELETE | `/admin/contests/:id` | `/admin/contests/:id` | Admin Auth | `adminContestController.destroy` | Delete contest |
| POST | `/admin/contests/:id/cancel` | `/admin/contests/:id/cancel` | Admin Auth | `adminContestController.cancel` | Cancel contest & refund |
| POST | `/admin/contests/:id/pin` | `/admin/contests/:id/pin` | Admin Auth | `adminContestController.togglePin` | Toggle contest pinned state |
| GET | `/admin/pending-prizes` | `/admin/pending-prizes` | Admin Auth | `adminPendingPrizesController.index` | List pending distributions (7 days) |
| POST | `/admin/pending-prizes/distribute-contest/:id` | `/admin/pending-prizes/distribute-contest/:id` | Admin Auth | `adminPendingPrizesController.distributeContest` | Manual contest prize credit |
| POST | `/admin/pending-prizes/distribute-session/:id` | `/admin/pending-prizes/distribute-session/:id` | Admin Auth | `adminPendingPrizesController.distributeSession` | Manual session prize credit |
| GET | `/admin/league_sessions` | `/admin/league_sessions` | Admin Auth | `adminSessionController.index` | Manage league sessions |
| POST | `/admin/league_sessions` | `/admin/league_sessions` | Admin Auth | `adminSessionController.store` | Create session with category assets |
| PUT | `/admin/league_sessions/:id` | `/admin/league_sessions/:id` | Admin Auth | `adminSessionController.update` | Update session |
| DELETE | `/admin/league_sessions/:id` | `/admin/league_sessions/:id` | Admin Auth | `adminSessionController.destroy` | Delete session |
| GET | `/admin/payments` | `/admin/payments` | Admin Auth | `adminPaymentController.index` | List payment transactions |
| POST | `/admin/payments/:id/approve` | `/admin/payments/:id/approve` | Admin Auth | `adminPaymentController.approve` | Approve deposit manually |
| POST | `/admin/payments/:id/reject` | `/admin/payments/:id/reject` | Admin Auth | `adminPaymentController.reject` | Reject deposit |
| GET | `/admin/withdrawal_requests` | `/admin/withdrawal_requests` | Admin Auth | `adminWithdrawalController.index` | List withdrawal requests |
| PUT | `/admin/withdrawal_requests/:id` | `/admin/withdrawal_requests/:id` | Admin Auth | `adminWithdrawalController.update` | Approve or reject withdrawal |
| GET | `/admin/kyc` | `/admin/kyc` | Admin Auth | `adminKycController.index` | List KYC submissions |
| POST | `/admin/kyc/:id/approve` | `/admin/kyc/:id/approve` | Admin Auth | `adminKycController.approve` | Approve KYC |
| POST | `/admin/kyc/:id/reject` | `/admin/kyc/:id/reject` | Admin Auth | `adminKycController.reject` | Reject KYC |
| GET | `/admin/tickets` | `/admin/tickets` | Admin Auth | `adminTicketController.index` | List support tickets |
| POST | `/admin/tickets/:id/reply` | `/admin/tickets/:id/reply` | Admin Auth | `adminTicketController.reply` | Reply to support ticket |
| POST | `/admin/tickets/:id/close` | `/admin/tickets/:id/close` | Admin Auth | `adminTicketController.close` | Close ticket |
| GET | `/admin/settings` | `/admin/settings` | Admin Auth | `adminSettingsController.index` | Manage settings |
| POST | `/admin/settings/payment` | `/admin/settings/payment` | Admin Auth | `adminSettingsController.updatePayment` | Update payment gateway settings |
| GET | `/admin/cron-logs` | `/admin/cron-logs` | Admin Auth | `adminCronLogController.index` | View cron execution history |
| DELETE | `/admin/cron-logs/clear` | `/admin/cron-logs/clear` | Admin Auth | `adminCronLogController.clear` | Clear cron logs |
