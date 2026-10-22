# New Features (node-project only)

Features listed here were **newly implemented in node-project**. They are not
conversions of the original PHP application, which must not be changed. Every new
file starts with a `NEW IMPLEMENTATION — NODE.JS PROJECT` header. Inside existing
converted files, only the added sections carry that marker, so new code and
PHP-converted code stay easy to tell apart.

When you add a feature, add a section below with its purpose, its storage, and the
files it creates or changes.

| # | Feature | Admin page | Permission |
|---|---------|------------|------------|
| 1 | [Deposit & Withdrawal Settings](#1-deposit--withdrawal-settings) | `/deposit-withdrawal-settings` | `deposit_withdrawal_settings.*` |
| 2 | [Deposit & Withdrawal Limit Enforcement](#2-deposit--withdrawal-limit-enforcement-mobile-apis) | — | — |
| 3 | [Admin User Access Control](#3-admin-user-access-control) | `/admin-users`, `/admin-roles` | super admin only |
| 4 | [Automated Notifications](#4-automated-notifications-and-notification-management) | `/notification-settings` | `notification_settings.*` |
| 5 | [OTP-only Login and Signup](#5-otp-only-login-and-signup) | — | — |
| 6 | [Android & iOS Force Update](#6-android--ios-force-update) | `/android-app-update`, `/ios-app-update` | `app_update_settings.*` |
| 7 | [USDT/INR to ProbCoin Conversion Settings](#7-usdtinr-to-probcoin-conversion-settings) | `/probcoin-conversion` | `probcoin_conversion.*` |
| 8 | [Contest Automation](#8-contest-automation-port-of-the-php-scheduler) | `/pending-prizes` (payout) | `pending_prizes.distribute` |

Shared conventions:
- **Settings:** stored in the existing `settings` collection (`Setting` model, unique `key`). Values are read fresh on every use, so admin changes apply on the next request.
- **Public visibility:** the converted mobile endpoint `GET /api/v1/settings` returns **every** settings row. Never store admin identities or secrets in a setting. Record who changed what in the audit log instead (`logger.info('[feature] <admin email> (<id>) ...')`).
- **Permissions:** every admin route carries `requirePermission(...)` or `requireSuperAdmin`. `tests/admin/admin-access.test.js` fails if any admin route lacks a guard.

---

## 1. Deposit & Withdrawal Settings
Admins configure minimum and maximum deposit and withdrawal amounts.
- **Storage:** settings keys `min_deposit_amount`, `max_deposit_amount`, `min_withdrawal_amount`, `max_withdrawal_amount`
- **New files:** `src/services/deposit-withdrawal-settings.service.js`, `src/admin/controllers/deposit-withdrawal-settings.controller.js`, `src/admin/routes/deposit-withdrawal-settings.routes.js`, `src/admin/views/settings/deposit_withdrawal.ejs`
- **Modified:** `src/admin/app.js`, `src/admin/views/partials/sidebar.ejs`

## 2. Deposit & Withdrawal Limit Enforcement (mobile APIs)
Every mobile and API flow that starts a deposit or withdrawal validates the amount against the configured limits before writing anything. If the limits are missing or invalid, the request is refused with a 503.
- **New code:** `checkTransactionAmount()` and `limitErrorBody()` in `src/services/deposit-withdrawal-settings.service.js`
- **Modified:** `src/controllers/mobile-api.controller.js`, `src/controllers/wallet.controller.js`, `src/controllers/payment.controller.js` (`create-order`), `src/controllers/mobile-legacy.controller.js` (`test-payment-add`), `package.json` (test script)
- **Tests:** `tests/wallet/deposit-withdrawal-limits.test.js`

## 3. Admin User Access Control
Roles hold sets of `module.action` permissions, and super admins have full access. Access is loaded on every request. The Players module can no longer be used to escalate privileges.
- **Storage:** `admin_roles` collection; on `users`: `is_super_admin`, `admin_role_id`, `admin_status`
- **New files:** `src/admin/access/permissions.js` (permission registry), `src/admin/middleware/permission.js`, `src/services/admin-access.service.js`, `src/models/admin-role.model.js`, `src/admin/controllers/admin-users.controller.js`, `src/admin/controllers/admin-roles.controller.js`, `src/admin/routes/admin-users.routes.js`, `src/admin/routes/admin-roles.routes.js`, `src/admin/views/admin_users/*`, `src/admin/views/admin_roles/*`, `src/admin/views/errors/forbidden.ejs`, `scripts/admin-access/promote-super-admin.js`
- **Modified:** `src/models/user.model.js`, `src/admin/app.js`, `admin-server.js` (super-admin bootstrap), `src/admin/controllers/auth.controller.js`, `src/admin/controllers/users.controller.js`, all `src/admin/routes/*.routes.js` (permission guards), `src/admin/views/partials/sidebar.ejs`, `src/admin/views/layouts/main.ejs`, `src/admin/views/users/create.ejs`, `src/admin/views/users/edit.ejs`, `package.json`
- **Tests:** `tests/admin/admin-access.test.js`

## 4. Automated Notifications and Notification Management
Sends session reminders, winnings, deposit, withdrawal, refund, wallet-adjustment and KYC notifications. Each one is stored in in-app history and pushed through FCM HTTP v1, the same provider the PHP app uses. A dedupe key and unique index prevent duplicates.
- **Storage:** settings key `notification_settings`; on `notifications`: `event`, `dedupe_key`, `data`, `push_*`; on `users`: `notification_preferences`
- **Config:** `FCM_SERVICE_ACCOUNT_PATH` or `FCM_SERVICE_ACCOUNT_JSON`
- **New files:** `src/services/notifications/{fcm.service,notification.service,notification-settings.service,session-reminder.job}.js`, `src/admin/controllers/notification-settings.controller.js`, `src/admin/routes/notification-settings.routes.js`, `src/admin/views/notification_settings/index.ejs`
- **Modified:** `src/scheduler.js`, `src/config/env.js`, `src/models/notification.model.js`, `src/models/user.model.js`, `src/routes/mobile.routes.js`, event hooks in `src/controllers/{payment,wallet,mobile-api,mobile-legacy}.controller.js` and `src/admin/controllers/{withdrawals,transactions,pages,contests,users,kyc}.controller.js`, `src/admin/access/permissions.js`, `src/admin/app.js`, sidebar
- **Tests:** `tests/notifications/notifications.test.js`, `tests/notifications/fcm.test.js`

## 5. OTP-only Login and Signup
Mobile login and signup require an OTP. It is currently a static code (`OTP_STATIC_CODE`) until an SMS provider is integrated.
- **New files:** `src/services/otp.service.js`, `src/controllers/otp.controller.js`, `src/models/otp-verification.model.js`
- **Modified:** `src/config/env.js`, `.env.example`, `src/controllers/auth.controller.js`, `src/controllers/mobile-api.controller.js`, `src/routes/auth.routes.js`, `src/routes/mobile.routes.js`

## 6. Android & iOS Force Update
Admins set the latest and minimum supported app versions per platform. There are public check APIs, and deposit, withdrawal and contest-join routes return `426 Upgrade Required` for builds below the minimum when force update is on. Android compares integer version codes; iOS compares marketing versions part by part as numbers.
- **Storage:** settings keys `android_app_update`, `ios_app_update`
- **APIs:** `GET /api/v1/app-version/android?version_code=`, `GET /api/v1/app-version/ios?version=`; request headers `X-App-Version-Code` (Android) and `X-App-Platform: ios` + `X-App-Version` (iOS)
- **New files:** `src/services/app-update-common.js`, `src/services/app-update-settings.service.js` (Android), `src/services/ios-app-update-settings.service.js`, `src/middleware/app-version.middleware.js`, `src/controllers/app-version.controller.js`, `src/admin/controllers/app-update-controller.factory.js`, `src/admin/controllers/app-update-settings.controller.js`, `src/admin/controllers/ios-app-update-settings.controller.js`, `src/admin/routes/app-update-settings.routes.js`, `src/admin/routes/ios-app-update-settings.routes.js`, `src/admin/views/settings/android_app_update.ejs`, `src/admin/views/settings/ios_app_update.ejs`
- **Modified:** `src/routes/mobile.routes.js`, `src/routes/wallet.routes.js`, `src/routes/contest.routes.js`, `admin-server.js` (idempotent defaults), `src/admin/access/permissions.js`, `src/admin/app.js`, sidebar
- **Tests:** `tests/app-update/app-update.test.js`, `tests/app-update/ios-app-update.test.js`

## 7. USDT/INR to ProbCoin Conversion Settings
Admins configure two independent application rates (not market prices):
`usdt_to_probcoin_rate` (ProbCoin per 1 USDT) and `inr_to_probcoin_rate` (ProbCoin per ₹1).
**ProbCoin = amount × rate**, using exact decimal arithmetic and rounded down to 2 decimals.
- **Storage:** settings key `probcoin_conversion` holding `{ usdt_to_probcoin_rate, inr_to_probcoin_rate, updated_at }`. The row's `created_at`/`updated_at` come from the `Setting` timestamps. The unique `key` index prevents a duplicate global record. **There are no default rates**: until both are saved, `getRates().configured` is `false` and `convert()` returns an error.
- **Admin:** `GET /probcoin-conversion` (page), `GET /probcoin-conversion/data` (JSON), `PUT /probcoin-conversion` (validate and save). Viewing and editing are separate permissions. Changes are audit-logged with the admin and the old and new rates.
- **Service API (for future integrations):** `getRates()`, `convert('USDT' | 'INR', amount)`
- **Not yet integrated:** deposits still credit the INR amount 1:1 into `deposit_balance` (LG Pay), and withdrawals are paid out in USDT manually. Wiring `convert()` into those flows changes balances and needs a business decision first.
- **New files:** `src/services/probcoin-conversion.service.js`, `src/admin/controllers/probcoin-conversion.controller.js`, `src/admin/routes/probcoin-conversion.routes.js`, `src/admin/views/settings/probcoin_conversion.ejs`
- **Modified:** `src/admin/access/permissions.js`, `src/admin/app.js`, `src/admin/views/partials/sidebar.ejs`
- **Tests:** `tests/probcoin/probcoin-conversion.test.js`

## 8. Contest Automation (port of the PHP scheduler)
Ports the PHP Laravel scheduler (`app/Console/Kernel.php`), which Node was missing. Node's scheduler previously only wrote a heartbeat, so sessions never got start/end prices, scores or results automatically. It also makes the Pending Prizes payout work; the page previously replied "not enabled".

| PHP command | Node job | Every | Does |
|---|---|---|---|
| `league:update-status` | `session-lifecycle.job.js` | 30 s | Moves sessions upcoming → live → completed. Fetches start/end prices into `session.assets`, copies them to each entry's `starting_prices`/`ending_prices`, and stores the prize preview. |
| `contest:update-live-scores` | `live-scores.job.js` | 15 min | Updates live scores and ranks from current prices. |
| `contest:calculate-performance` | `results.job.js` | 2 min | Cancels contests with fewer than 10 entries and refunds the entry fees; otherwise sets final scores, ranks and prize rows (`is_calculated`). |
| `PendingPrizesController` | `prize-payout.service.js` | admin click | Re-scores, ranks, pays the prize rows (tied ranks split equally) and marks the contest `prizes_distributed`. |

- **Prices:** `price-feed.js`. Indian stocks come from the RapidAPI NSE quote API, crypto from batched CoinMarketCap `quotes/latest`. **US/UK stocks are not priced yet.** Plug the new provider into `internationalStockPrice()`.
- **Scoring:** reuses the app's `scoreAssets()` and `buildDynamicPrizeDistribution()` (`helpers/mobile-compat.js`), so the app leaderboard, automated results and payouts agree.
- **Safety:**
  - A job lease lock (`job_locks`) makes each job run once even though both servers start the scheduler.
  - Every refund and prize is a transaction with a deterministic unique `transaction_id` (`REFUND_<contest>_E<entry>`, `MP_<contest>_E<entry>`) written before the balance changes, so nothing can be paid twice.
  - A payout lease (`payout_started_at`) blocks concurrent payouts of the same contest.
  - Prices are only fetched within 30 minutes of the start/end time, are never overwritten, and are never faked.
  - Only sessions whose prices the automation captured (`start_prices_captured_at` / `end_prices_captured_at`) are auto-scored, so historical/migrated contests are never touched.
- **Fixes over PHP:** no `rand(1000, 5000)` fallback price; cancelled contests are refunded once (PHP re-refunded them every 2 minutes); final scores don't drift after the session ends; cancelled contests are not revived to live/completed.
- **Config:** `CONTEST_AUTOMATION_ENABLED` (default `true`), `STOCK_PRICE_REQUEST_DELAY_MS` (default 500)
- **New files:** `src/services/contest-automation/{price-feed,contest-scoring,session-lifecycle.job,live-scores.job,results.job,prize-payout.service,ledger,job-lock}.js`, `src/models/job-lock.model.js`
- **Modified:** `src/scheduler.js`, `src/config/env.js`, `.env.example`, `src/models/league-session.model.js` (capture markers), `src/models/contest.model.js` (`payout_started_at`), `src/admin/controllers/pages.controller.js` (Pending Prizes distribute)
- **Tests:** `tests/contest-automation/contest-automation.test.js`, `tests/contest-automation/price-feed.test.js`
