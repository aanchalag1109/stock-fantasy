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
| 9 | [Session Cancel + PHP parity for Contests / Sessions / Live Management](#9-session-cancel--php-parity-for-contests-sessions-and-live-management) | `/live-management`, `/league_sessions/:id` | `sessions.cancel`, `live_management.manage` |
| 10 | [PHP parity: Payment Orders + Performance contest tools](#10-php-parity-payment-orders-and-performance-contest-tools) | `/payments`, `/performance/:id` | `payments.approve`, `performance.manage` |

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
Mobile login and signup require an OTP. With `SMS_ENABLED=true` a random 6-digit OTP is sent by SMS through apitxt.com (DLT route); otherwise the static `OTP_STATIC_CODE` is used and nothing is sent. If the SMS fails, send-otp returns `502` and the OTP is discarded so the user can retry at once.
- **Config:** `SMS_ENABLED`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_ROUTE`, `SMS_DLT_TEMPLATE_ID`, `SMS_PE_ID`, `SMS_OTP_TEMPLATE` (`{otp}`, `{minutes}`)
- **New files:** `src/services/otp.service.js`, `src/services/sms.service.js`, `src/controllers/otp.controller.js`, `src/models/otp-verification.model.js`
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

## 9. Session Cancel + PHP parity for Contests, Sessions and Live Management
**New (client request):** cancelling a session cancels every contest in it and refunds every joined user's entry fee to `deposit_balance`. The session becomes `status: cancelled`, `active: false`. It is available from three places: Live Management → **Cancel Session**, the session page → **Cancel Session**, and the session edit form (setting a live session to Inactive, as in PHP). PHP's own refund for this path did not work; it credited a non-existent `entry_fee` to a `coins` column.

**Restored from PHP** (missed in the conversion; marked `PHP PARITY` in code):
- **Live Management:** the full page with its status filter, 10 s auto-refresh, overview cards, **Start**, **End & Distribute**, **Start Contests**, **Update Scores**, **Cleanup Orphaned** and **View Detail** (session contests page, contest detail with participants and a portfolio modal).
- **Sessions:**
  - The edit page follows PHP's rules per status: upcoming → times only; live → rename or deactivate; draft → everything, including assets.
  - Times are shown and saved in IST. Previously each save shifted a session by 5 h 30 m.
  - **Refetch Missing Prices** button on the session page.
- **Contests → Cancel** is now safe:
  - The contest is claimed atomically, so it cannot be refunded twice.
  - Refunds use deterministic `REFUND_<contest>_E<entry>` transaction ids, so an interrupted cancel can be resumed.
  - Cancel and Pin work for contests whose session was deleted. `league_session_id` is nullable again, as in PHP; 192 such contests previously failed Cancel/Pin/Edit, after some refunds had already been paid.
- **Bug fix:** session **create** dropped all selected assets, because multer parses `stocks[22][]` into a sparse array.

Differences from PHP (deliberate): End & Distribute pays through the Pending Prizes payout instead of PHP's legacy calculateResults call. Refetch only fills start prices of started sessions and end prices of completed ones. Assets, market type and max stocks of a live session are locked. Cancelled contests are never moved back to live or completed.
- **New files:** `src/services/contest-cancellation.service.js`, `src/services/session-management.service.js`, `src/admin/controllers/live-management.controller.js`, `src/admin/routes/live-management.routes.js`, `src/admin/views/live_management/{session_contests,contest_detail}.ejs`
- **Modified:** `src/admin/controllers/{contests,sessions}.controller.js`, `src/admin/routes/{sessions,pages,api}.routes.js`, `src/admin/views/live_management/index.ejs`, `src/admin/views/sessions/{edit,show,index}.ejs`, `src/models/contest.model.js`, `src/admin/access/permissions.js`, `src/admin/app.js`, `src/services/contest-automation/{results.job,session-lifecycle.job}.js`
- **Tests:** `tests/admin/php-parity-contests-sessions.test.js`

## 10. PHP parity: Payment Orders and Performance contest tools
These were missed in the conversion and restored from PHP; they are marked `PHP PARITY` in code.
- **Payment Orders** (PHP `Admin\PaymentController`):
  - **Search** covers the order id *or* the user's name, mobile or email.
  - **Approve** works only on pending orders. It credits `deposit_balance` and creates a deposit transaction (`Admin Approved`, `transaction_id` = order id).
  - **Reject** works only on pending orders. It records a failed deposit transaction (`Admin Rejected`).
  - **Verify** asks LG Pay and reports PAID, PENDING or FAILED without changing anything.
  - Previously Approve credited nothing and Verify changed the status.
  - Added in Node: the pending check is atomic and the credit is keyed on the order id, so an order can never be credited twice.
- **Performance contest page** (PHP `performance/show.blade.php`):
  - **How It Works** shows eight system checks, the calculation steps 1–6, the prize breakdown, user-wise prizes, the full leaderboard and price-timing validation.
  - **Verify All Prices via API** compares saved prices with API prices; most sources are *current* prices, as in PHP.
  - **Analyze Error Reasons** looks for missing, late, extreme or unchanged prices.
  - **Calculate Results** runs the same routine as `POST /api/v1/calculate-results`, which credits prizes once.
  - **RUN ALL** takes a start and end time (today, IST). It waits, captures the prices, takes the session live, then pays this contest and completes the session. Its log is polled live, and **Stop** works.
- **Deliberate differences from PHP:**
  - Stop really stops a running job; PHP only removed queued jobs.
  - RUN ALL pays through the Pending Prizes payout, so tied ranks share prizes and nothing is paid twice.
  - While a RUN ALL job runs, the session is flagged `run_all_active` and the scheduler leaves it alone.
  - BTC and ETH are no longer always reported as "extreme"; PHP compared rupee ranges with USD prices.
- **New files:** `src/services/payment-orders.service.js`, `src/services/run-all.service.js`, `src/services/performance-tools.service.js`, `src/models/run-all-job.model.js`, `src/admin/routes/performance-tools.routes.js`, `src/admin/views/performance/_how_it_works.ejs`
- **Modified:** `src/admin/controllers/pages.controller.js` (payments, performance diagnostics), `src/admin/routes/pages.routes.js`, `src/admin/views/performance/contest.ejs`, `src/controllers/payment.controller.js` (exports `generateSignature`), `src/models/league-session.model.js` (`run_all_active`), `src/services/contest-automation/{session-lifecycle,live-scores,results}.job.js` (skip `run_all_active` sessions), `src/admin/access/permissions.js` (`performance.manage`), `src/admin/app.js`
- **Tests:** `tests/admin/php-parity-payments-performance.test.js`

## 11. PHP parity: Announcements, Templates, Testing, Players and smaller admin gaps
These were missed in the conversion and restored from PHP; they are marked `PHP PARITY` in code.
- **Announcements** (PHP `AnnouncementController`):
  - The create form has a description, a type (update, alert or promo) and *send to* (all users or selected users, with search and select all).
  - Saving creates one notification per recipient and sends an FCM push. Invalid tokens are cleared.
  - Messages match PHP: "Announcement created and sent to all users!" or "…sent to N users!".
- **Templates → Edit:** the asset picker is back. Assets are only rebuilt when the picker actually loaded, so a failed load can't wipe a template.
- **Testing:**
  - **Create Basket** opens the manual basket builder (`/testing/create-basket`). It defaults to the first test user, or to the test users selected on the contest page.
  - **Select Basket** assigns an existing basket to a contest (`POST /testing/assign-basket`).
- **Players:**
  - **Create** validates like PHP: unique email, mobile of 10–15 digits, country code prepended to the mobile, duplicate mobile rejected, password of at least 8 characters.
  - **Show** displays the real date of birth, gender and address instead of fixed placeholders.
- **Cron Check** sorts by run time (newest first), shows 50 per page and refreshes the table over AJAX every 20 s.
- **Banners → Create** has a status select. Title and status are validated as in PHP.
- **Profile:**
  - Name and email are required and the email must be unique.
  - A new password must have at least 8 characters.
- **Tickets → Reply:** the message is required, and replying to an open ticket marks it *pending*.
- **Not ported:**
  - Wallet *remove* and the withdrawal *refund* type have no UI in either app.
  - `/performance/sessions` is not linked from the PHP menu.
- **New files:** `src/services/announcement.service.js`, `src/admin/views/testing/create_basket.ejs`, `src/admin/views/cron/_rows.ejs`
- **Modified:** `src/admin/controllers/{misc,pages,users}.controller.js`, `src/admin/routes/{pages,api}.routes.js`, `src/admin/views/announcements/create.ejs`, `src/admin/views/templates/edit.ejs`, `src/admin/views/testing/{contest_detail,user_session_contests}.ejs`, `src/admin/views/cron/index.ejs`, `src/admin/views/banners/create.ejs`, `src/admin/views/users/show.ejs`
- **Tests:** `tests/admin/php-parity-{announcements,templates,testing,users,small-items}.test.js`

## 12. Admin sidebar reorganised (client feedback)
- **Sections:** Main · Sessions & Contests · Banners & Notifications · Payments & Transactions · Analytics · Bots · Users & Admin Management · App & System.
- **Hidden sections:** a section is hidden when the admin's role can't open any of its links.
- **Renamed:**
  - Payment Orders → **Deposit Orders**
  - Test Users → **Bot Users**
  - Testing → **Bot Contests**
  - Market Type Category → **Market Categories**
  - Manage Banners → **Banners**
  - Page titles and role-permission labels follow the new names. URLs are unchanged.
- **Back button:** shown at the top of the sidebar on every page except the dashboard. It goes to the previous admin page, or to the dashboard when there is none.
- **Removed:** the header notification bell, which was a dummy (a hardcoded "new user" alert, with links that went nowhere).
- **Modified:** `src/admin/views/partials/sidebar.ejs`, `src/admin/views/layouts/main.ejs`, `src/admin/controllers/pages.controller.js`, `src/admin/views/payments/index.ejs`, `src/admin/views/testing/{test_users,contest_detail}.ejs`, `src/admin/access/permissions.js`
- **Tests:** `tests/admin/sidebar-layout.test.js`

## 13. Sessions & Contests: filters, cancel and refund-safe delete (client feedback)
- **Filters on both lists:**
  - Status tabs with real totals; previously the counts covered only the 8 rows on the current page, and "Upcoming" was always 0.
  - A date range in IST, inclusive: session start date for sessions, the session's date for contests.
  - A sort: sessions are Latest/Oldest by start time; contests are Newest/Oldest by creation date, with pinned contests kept on top.
  - Filters are kept across pagination and tab changes.
- **Contest statuses:** Live, Upcoming and Completed follow the contest's session and exclude cancelled contests. **Cancelled** (new) is the contest's own status.
- **Cancel:**
  - The Sessions list now has a Cancel button for upcoming, live and draft sessions. It uses the same refund flow as the session page and Live Management (section 9).
  - Contest cancel with refund is unchanged (section 9).
- **Delete:**
  - Deleting a contest that is still open (active or live) first cancels it and refunds every joined user.
  - Deleting a session does the same for its open contests, then detaches its contests, as PHP's `ON DELETE SET NULL` did.
  - Completed contests are deleted without a refund, as in PHP, because their results may already be paid.
  - If a refund fails, nothing is deleted.
- **New files:** `src/admin/helpers/list-filters.js`, `src/admin/views/partials/list_filters.ejs`
- **Modified:** `src/admin/controllers/{sessions,contests}.controller.js`, `src/admin/views/{sessions,contests}/index.ejs`, `src/services/contest-cancellation.service.js` (`refundBeforeDelete`)
- **Tests:** `tests/admin/php-parity-contests-sessions.test.js` (filters and delete suites)

## 14. US stock prices via Twelve Data
- **Provider:** [Twelve Data](https://twelvedata.com) prices assets in the "… Cap US" categories. Indian stocks stay on RapidAPI (NSE) and crypto stays on CoinMarketCap.
- **Where it is used:**
  - Session start and end prices, live scores every 15 min, Refetch Missing Prices and RUN ALL, all through `price-feed.getPrices`.
  - The app's `GET /api/v1/prices/stock?symbol=`.
  - The admin live price on the session create page.
  - The legacy contest start/end price save.
  - Performance → Verify All Prices.
- **Routing a bare symbol:** endpoints that receive only a symbol look up its category in Assets (cached for 10 min). A symbol listed only under US categories goes to Twelve Data. Anything else stays on NSE as before. Callers may also pass `market=us|indian`.
- **Plan limits:**
  - Each symbol costs 1 credit. The Basic plan allows 8 per minute and 800 per day.
  - Requests are batched and spaced to stay within `TWELVE_DATA_CREDITS_PER_MINUTE`. A 429 waits a minute and retries once.
  - On a paid plan, raise the setting.
- **UK (LSE) stocks are not priced:** Twelve Data requires the Grow plan or higher for them. They are reported as unsupported and score 0, as before.
- **Configuration:** `TWELVE_DATA_API_KEY` and `TWELVE_DATA_CREDITS_PER_MINUTE` go in `.env`. The key is not stored in the code.
- **New files:** `src/services/market-data/twelve-data.js`
- **Modified:**
  - `src/services/contest-automation/price-feed.js`: US routing, `stockQuote`, `stockMarketOf`
  - `src/controllers/liveprice.controller.js`
  - `src/admin/routes/api.routes.js`
  - `src/controllers/mobile-legacy.controller.js`
  - `src/services/performance-tools.service.js`
  - `src/config/env.js`
  - `.env.example`
- **Tests:** `tests/market-data/twelve-data.test.js`, `tests/contest-automation/price-feed.test.js`

## 15. Admin → Assets (manage stocks & crypto per category)
- **Page:** Sessions & Contests → **Assets** (`/market-assets`). It lists all 1,274 assets.
  - Filters: category (with counts), market (Indian / US / UK / Crypto), status, and search by symbol or name.
  - 25 per page.
- **Add / Edit:**
  - **Fields:** category, symbol, name, logo URL and status. Inactive assets are hidden from session creation.
  - **Uniqueness:** a symbol is unique per category; the same stock may be in Small, Mid and Large Cap.
  - **Symbol formats per market:** crypto `BTC-USD`; UK must end in `.L`; US and Indian are plain tickers.
  - Changing the category on Edit moves the asset.
- **US symbol check:**
  - New or changed US symbols are verified with Twelve Data's free `/stocks` lookup, which uses no price credits, so typos like `APPL` are rejected.
  - If the name is left empty, the official company name is filled in.
  - A **Check on Twelve Data** button checks while typing.
  - If Twelve Data can't be reached, the asset is saved with a warning instead of blocking.
- **Bulk actions:** move to a category, mark active or inactive, and delete.
  - Moves are limited to the same market (e.g. Small → Large Cap US).
  - Symbols already in the target category are skipped and reported.
- **Existing sessions are unaffected:** sessions and templates keep their own copy of each asset; changes only apply to new sessions. The symbol → market cache used for live quotes is refreshed after every change.
- **Permissions:** new `assets.view / create / edit / delete` in Roles & Permissions. Super admins have them automatically.
- **Schema fix:** `Asset.symbol` was declared `unique`, but real data has the same symbol in several categories, and the index never existed in the database. The flag was removed.
- **New files:** `src/admin/controllers/assets.controller.js`, `src/admin/routes/assets.routes.js`, `src/admin/views/assets/{index,form}.ejs`
- **Modified:** `src/services/market-data/twelve-data.js` (`lookupUsSymbol`), `src/models/asset.model.js`, `src/admin/access/permissions.js`, `src/admin/app.js`, `src/admin/views/partials/sidebar.ejs`
- **Tests:** `tests/admin/assets.test.js`

## 16. Logos for Indian stocks (and standard logos for every market)
- **Problem:** all 291 Indian asset logos pointed to `http://localhost/storage/stocks/*.png`, files that existed only on the old PHP machine and aren't in the project. They were broken in the app and the admin panel.
- **Fix:** Indian logos now use the same public CDN as US and UK: `financialmodelingprep.com/image-stock/<SYMBOL>.NS.png`. It was checked live and covers 97 of 97 symbols; M&M uses Mahindra's `MAHMF` logo.
- **Assets page:**
  - A warning shows how many logos are missing or broken, with a **Fix broken logos** button (`assets.edit`) that fills in the standard logo for each market.
  - When adding or editing, an empty or `localhost` logo is replaced with the standard one; a custom URL is kept.
  - The form shows a logo preview.
- **App:** it reads `image_url` from the assets (`/api/v1/market/assets`), so fixed logos appear there with no app change.
- **New files:** `src/services/market-data/logos.js`
- **Modified:** `src/admin/controllers/assets.controller.js`, `src/admin/routes/assets.routes.js`, `src/admin/views/assets/{index,form}.ejs`
- **Tests:** `tests/admin/assets.test.js` (logos suite)

## 17. USDT deposits via PayRam
A separate gateway. LG Pay (INR) is unchanged.
- **Flow:**
  1. The app sends a USDT amount.
  2. ProbCoins = amount × the USDT rate from **ProbCoin Conversion**, fixed at creation.
  3. PayRam creates a USDT-only payment, and its link is returned to the app.
  4. The user pays on the PayRam page.
  5. PayRam calls the webhook, or the app polls the status endpoint.
  6. The payment is re-read from PayRam's API.
  7. ProbCoins are credited to `deposit_balance`.
- **App APIs** (also under `/api/payram/...`):
  - `GET /api/v1/payram/config`
  - `POST /api/v1/payram/quote` `{ amount }`
  - `POST /api/v1/payram/deposit` `{ user_id, amount }` → `payment_url`
  - `GET /api/v1/payram/deposit/:deposit_id?user_id=`
  - `GET /api/v1/payram/deposits?user_id=`
- **Webhook:** `POST /api/v1/payram/webhook`.
  - **Authentication:** `X-Payram-Signature` (`sha256=` HMAC-SHA256 of the raw body, keyed with the API key) or the `API-Key` header, which is what the official SDK checks. Anything else gets 401.
  - **Verification before crediting:** `GET /api/v1/payment/reference/{id}` must report FILLED or OVER_FILLED, with the same invoice (`deposit_id`), the same amount, USDT, and the full amount received.
  - **Retries:** if PayRam can't be reached, we answer 503 so PayRam retries.
- **Credit once:**
  - The deposit is claimed atomically (pending → credited).
  - The ledger then writes transaction `PAYRAM_<deposit_id>` on a unique index before the balance `$inc`.
  - Repeated or concurrent webhooks never credit twice. This is the atomic equivalent of a transaction; MongoDB here is standalone.
- **Statuses:**
  - `pending`, `partially_paid`, `credited`
  - `cancelled`: expired with nothing paid
  - `failed`: PayRam refused to create the payment
  - `review`: underpaid then expired, wrong currency, or amount/invoice mismatch
  - Overpayments are credited at the deposit amount and flagged.
- **Records:** collection `payram_deposits`: deposit id, user, gateway `PAYRAM`, `USDT`, amount, rate, ProbCoins, PayRam reference, payment URL, status, PayRam state, filled amounts, tx hashes, the verification used to credit, the last 50 webhook/status events, and credited/created/updated times.
- **Config (`.env`):**
  - `PAYRAM_API_URL`: PayRam Site URL
  - `PAYRAM_API_KEY`
  - `PAYRAM_NETWORK` (optional, e.g. `TRX`)
  - `PAYRAM_MIN_DEPOSIT_USDT` / `PAYRAM_MAX_DEPOSIT_USDT` (default 1 / 10000)
- **New files:** `src/models/payram-deposit.model.js`, `src/services/payram/{payram.client,payram-deposit.service}.js`, `src/controllers/payram.controller.js`, `src/routes/payram.routes.js`
- **Modified:** `src/app.js` (routes, plus the webhook registered with a raw body before the JSON parser), `src/config/env.js`, `.env.example`
- **Tests:** `tests/payram/payram-deposit.test.js`

## 18. Admin → USDT Deposits (PayRam)
The USDT counterpart of **Deposit Orders** (LG Pay / INR), which is unchanged.
- **Where:** sidebar **Payments & Transactions → USDT Deposits** (`/usdt-deposits`).
- **List:**
  - **Totals:** USDT received, ProbCoins credited, USDT awaiting payment, and the number of deposits needing review.
  - **Status tabs with counts:** All, Pending, Partially paid, Credited, Needs review, Cancelled, Failed.
  - **Search:** by deposit ID, PayRam reference, or user name, mobile or email.
  - **Date range and newest/oldest sort.**
  - Each row shows the user, USDT requested and received, rate, ProbCoins, status with its review or failure reason, the PayRam reference, and when it was created and credited.
- **Detail page:**
  - **Payment:** the full deposit record, the PayRam reference and payment page, blockchain transaction hashes, and the PayRam verification that allowed the credit.
  - **Wallet:** the wallet transaction `PAYRAM_<deposit_id>` and the user's current balances.
  - **Event log:** every webhook, status check and admin action.
- **Actions** (permission `usdt_deposits.manage`):
  - **Check with PayRam:** re-reads the payment and credits it if it's complete.
  - **Approve & credit:** for deposits held for review; uses the same credit-once path, and the transaction is marked "Admin Approved".
  - **Reject:** closes the deposit without crediting.
  - Notes and the admin's email are stored on the deposit.
- **Permissions:** new `usdt_deposits.view` / `usdt_deposits.manage` in Roles & Permissions (Finance group). Super admins have them automatically.
- **Wallet transactions:** credited USDT deposits also appear on the existing **Transactions** page as `deposit` with method "PayRam (USDT)".
- **New files:** `src/admin/controllers/payram-deposits.controller.js`, `src/admin/routes/payram-deposits.routes.js`, `src/admin/views/payram_deposits/{index,show}.ejs`
- **Modified:** `src/services/payram/payram-deposit.service.js` (admin approve/reject/check), `src/admin/access/permissions.js`, `src/admin/app.js`, `src/admin/views/partials/sidebar.ejs`
- **Tests:** `tests/admin/payram-deposits.test.js`

## 19. TradingView chart analysis on stock click (admin panel)
- **What it does:** clicking a stock or coin symbol opens a pop-up with a **TradingView Advanced Chart**: candles, timeframes and date ranges, RSI and MACD, drawing tools, and symbol details. Uses TradingView's free embed widget; no API key needed.
- **Where:**
  - **Assets:** the symbol, or the chart icon next to it.
  - **Session details:** the asset cards.
  - **Session create:** the asset picker.
  - **Session edit:** a chart icon next to each asset (the checkbox isn't toggled).
  - **Performance (contest and session):** the start/end price tables.
  - **Live Management → contest detail:** the asset badges.
- **Symbol mapping:** checked by rendering the widget. TradingView's free embedded chart refuses **NSE** and **LSE** symbols ("This symbol is only available on TradingView") and then shows its default, AAPL.
  - **Indian:** `BSE:RELIANCE` in the pop-up (`-`/`&` become `_`). "Open on TradingView" goes to `NSE:RELIANCE` on the full site.
  - **US:** `AAPL` (TradingView picks NASDAQ/NYSE).
  - **UK:** no embedded chart. The pop-up explains why and links to `LSE:SHEL` on TradingView.
  - **Crypto:** `BTC-USD` → `BINANCE:BTCUSDT`.
  - **Unknown market:** pages that don't know a symbol's market ask `GET /api/asset-markets?symbols=…`, which uses the asset categories.
- **Full height:** the chart is drawn after the pop-up has opened (`shown.bs.modal`), so it fills 75% of the screen height. Drawing it while the pop-up was still hidden left it at TradingView's small default.
- **Data source:** the chart shows TradingView's data. Contests still use our price feeds (RapidAPI / Twelve Data / CoinMarketCap). "Open on TradingView" opens the full chart.
- **Reuse:** the pop-up is in the admin layout; any element with `data-tv-symbol` (optional `data-tv-market`, `data-tv-category`, `data-tv-name`) opens it.
- **New files:** `src/admin/views/partials/tradingview_chart.ejs`
- **Modified:** `src/admin/views/layouts/main.ejs`, `src/admin/routes/api.routes.js` (`/api/asset-markets`), `src/admin/views/{assets/index,sessions/show,sessions/create,sessions/edit,performance/contest,performance/session,live_management/contest_detail}.ejs`
- **Tests:** `tests/admin/assets.test.js` (TradingView suite)

## 20. Closable admin sidebar
- **Close:** a **✕** button at the top of the sidebar closes it on every screen size (on phones the sidebar was already a slide-in menu; on desktop it used to be fixed).
- **Reopen:** when the sidebar is closed on desktop, the page uses the full width and a **☰** button in the header reopens it.
- **Remembered:** the desktop open/closed choice is stored in the browser (`localStorage`, key `adminSidebarCollapsed`) and applied before the page paints, so there's no flicker between pages.
- **Modified:** `src/admin/views/layouts/main.ejs`, `src/admin/views/partials/sidebar.ejs`

## 21. INR & USDT deposits and withdrawals (client feedback)
- **Per-currency settings** (Deposit & Withdrawal Settings):
  - INR and USDT each have min/max deposit and min/max withdrawal in their own currency.
  - **Deposit gateway charges:** percent and/or fixed, paid by the user (added on top) or absorbed by the platform. A live example is shown.
  - **USDT withdrawal network:** TRC20, BEP20 or ERC20.
  - The INR keys are the original ones, so existing values carry over. USDT deposit limits fall back to `PAYRAM_MIN/MAX_DEPOSIT_USDT` until saved.
  - Rates stay on **ProbCoin Conversion**.
- **Quotes** (`services/payments/quote.service.js`):
  - ProbCoins = amount × rate, rounded down. Asking for N ProbCoins costs N / rate, rounded up.
  - Charges = ⌈amount × % ⌉ + fixed. Total payable = amount + charges if the user pays them.
  - Limits apply to the amount before charges.
  - Withdrawals: payout = ProbCoins / rate, rounded down, with the limits in that currency.
- **INR via LG Pay** (`services/payments/lgpay-deposit.service.js`):
  - Orders store the ProbCoins, rate, base, charges and total. LG Pay collects the total.
  - The callback, the return page and the admin Approve credit the order's ProbCoins **once**: an atomic order claim, then ledger `transaction_id` = order id.
  - **No MongoDB transactions:** they fail on the standalone server, which is why LG Pay callbacks never credited.
  - **Bad callback signature:** the order is checked with LG Pay instead of being trusted. The old code credited anyway.
  - **Underpaid orders** → "Needs review" (`payment_status` 3), shown on Deposit Orders with Approve/Reject.
  - **Unchanged:** endpoints, parameters and redirects. Orders created before this change are still credited 1:1.
  - The LG Pay notify URL can be overridden with `LGPAY_NOTIFY_URL` (same default).
- **USDT via PayRam:**
  - **Charges and limits:** the same shared quote; PayRam collects base + charges.
  - **Blockchain, confirmations and explorer link** are recorded. A payment is **not credited while confirmations < required**; it's re-checked on the next webhook or Re-verify. Paying on a different chain than the restricted one → review.
  - **Admin:** "Check with PayRam" is now **Re-verify**, and "Approve" is **Manual approve**. The detail page shows the chain, confirmations (x / y), explorer links for each tx hash, and the base + charges breakdown.
- **Withdrawals in INR or USDT** (`services/payments/withdrawal.service.js`):
  - The user withdraws ProbCoins from winnings and gets INR (UPI or bank) or USDT (saved address, admin network) at the currency rate.
  - Winnings are deducted with a guarded atomic `$inc`. The request stores currency, rate, payout amount and destination, plus a pending ledger transaction `WD_<id>`.
  - **Admin:** the list and detail pages show the ProbCoins, the payout (₹ / USDT) and where to send it. **Accept** needs the payout reference (UTR / tx hash). **Reject** refunds once (`WDREFUND_<id>`). No MongoDB transactions; the old admin action used them and failed.
  - The old `/withdraw-amount` and `/wallet/withdraw` endpoints are unchanged.
- **App APIs** (also under `/api/...`):
  - `GET /api/v1/payments/options`
  - `POST /api/v1/deposit/quote` `{ currency, amount | probcoins }`
  - `POST /api/v1/deposit/inr/create` `{ user_id, amount | probcoins }` → `payment_url`
  - `GET /api/v1/deposit/inr/status/:order_id?user_id=`
  - `GET /api/v1/deposit/inr/history?user_id=`
  - USDT: `/api/v1/payram/{config,quote,deposit,deposit/:id,deposits}`
  - `POST /api/v1/withdraw/quote` `{ currency, probcoins }`
  - `POST /api/v1/withdraw/request` `{ user_id, currency, probcoins }`
  - `GET /api/v1/withdraw/history?user_id=`
  - `GET /api/v1/payout-details?user_id=`
  - `POST /api/v1/payout-details/inr` `{ user_id, upi_id | account_holder_name + account_number + ifsc_code, bank_name? }`
- **Notifications:** amounts now read "500 ProbCoins" instead of "₹500", since coins are no longer rupees.
- **New files:**
  - `src/services/payments/{quote,lgpay-deposit,withdrawal}.service.js`
  - `src/controllers/wallet-payments.controller.js`
  - `src/routes/wallet-payments.routes.js`
- **Modified:**
  - `src/controllers/payment.controller.js`
  - `src/services/{deposit-withdrawal-settings,payment-orders}.service.js`
  - `src/services/payram/payram-deposit.service.js`
  - `src/controllers/payram.controller.js`
  - `src/services/notifications/notification.service.js`
  - models `payment`, `withdrawal-request`, `payram-deposit`, `transaction`
  - admin `deposit-withdrawal-settings` and `withdrawals` controllers
  - admin views `settings/deposit_withdrawal`, `payments/index`, `withdrawals/{index,show}`, `payram_deposits/show`
  - `src/admin/access/permissions.js`
  - `src/app.js`
  - `src/config/env.js`
- **Tests:** `tests/wallet/inr-usdt-payments.test.js`, `tests/payram/payram-deposit.test.js`, updated `tests/wallet/deposit-withdrawal-limits.test.js` and `tests/notifications/notifications.test.js`

## 22. Transactions shown in ProbCoins
- **Prize transactions:** new ones read "Won 50 ProbCoins in contest #12 (Rank 1, Entry #…)" instead of "Won ₹50 …". The payout summary messages say ProbCoins too. Older transactions keep their saved text.
- **App transaction lists** (`/user-transactions`, `/wallet/transactions`):
  - Every transaction also returns `unit: "ProbCoins"` and `amount_label` ("50 ProbCoins").
  - INR/USDT purchases and withdrawals also return `currency`, `currency_amount` and `currency_label` ("₹500" / "5 USDT").
  - Existing fields are unchanged.
- **Admin:** amounts show as **PC**, with the real-money side underneath for purchases and withdrawals, on:
  - Transactions (list, total card, detail, user wallet)
  - Dashboard recent transactions
  - Contest Analysis transactions
  - the Performance contest transactions table
- **Helpers:** `probcoinLabel`, `currencyLabel`, `transactionLabels` in `src/helpers/mobile-compat.js`.
- **Modified:** `src/services/contest-automation/prize-payout.service.js`, `src/controllers/{mobile-api,wallet}.controller.js`, admin views `transactions/{index,show}`, `dashboard/index`, `contest_analysis/contest`, `performance/contest`
- **Tests:** `tests/wallet/inr-usdt-payments.test.js` (labels), `tests/contest-automation/contest-automation.test.js` (prize description)

## 23. Separate PayRam testnet connection
- **Two connections:**
  - **mainnet:** `PAYRAM_API_URL` / `PAYRAM_API_KEY` / `PAYRAM_NETWORK`, unchanged.
  - **testnet:** `PAYRAM_TESTNET_API_URL` / `PAYRAM_TESTNET_API_KEY` / `PAYRAM_TESTNET_NETWORK`. This is a second PayRam server installed with `setup_payram.sh --testnet`.
- **Which one new deposits use:** `PAYRAM_MODE=mainnet|testnet` (default `mainnet`). Each deposit stores its `environment`, and status checks, Re-verify and webhooks always use that deposit's connection, even if the mode changes later. Deposits created before this field are mainnet.
- **Webhooks:**
  - mainnet: `/api/v1/payram/webhook`
  - testnet: `/api/v1/payram/testnet/webhook`
  - Each is authenticated with its own key and only looks up deposits of its own connection, so a testnet payment can never confirm a mainnet deposit.
- **App:** `GET /api/v1/payram/config` returns `environment`, and deposits include `environment`.
- **Admin → USDT Deposits:**
  - a "New deposits: MAINNET/TESTNET" badge
  - a **TESTNET** badge on testnet rows and on the detail page
  - a Connection filter (mainnet / testnet)
- **Caution:** testnet deposits credit real ProbCoins to the user they're made for. Use `PAYRAM_MODE=testnet` on development/test setups or with test accounts, and keep `mainnet` in production.
- **Modified:**
  - `src/config/env.js`
  - `.env.example`
  - `src/services/payram/{payram.client,payram-deposit.service}.js`
  - `src/models/payram-deposit.model.js`
  - `src/controllers/payram.controller.js`
  - `src/app.js`
  - `src/services/payments/quote.service.js`
  - `src/admin/controllers/payram-deposits.controller.js`
  - `src/admin/views/payram_deposits/{index,show}.ejs`
- **Tests:** `tests/payram/payram-deposit.test.js` (testnet suite), `tests/admin/payram-deposits.test.js`

## 24. Combined deposit quote for the app
- **`POST /api/v1/deposit/quotes`** `{ probcoins }` returns the **INR** (LG Pay) and **USDT** (PayRam) price of the same ProbCoins in one call, for the "enter ProbCoins → pick how to pay" screen.
- A currency that can't be used for that amount, because of limits, an unset rate or the gateway being off, comes back as `{ available: false, message, min_amount?, max_amount? }` instead of failing the call.
- **Mobile integration guide** (flow, every request and response, statuses, errors, deep links): published separately as "ProbCoin Payments API".
- **Modified:** `src/controllers/wallet-payments.controller.js`, `src/routes/wallet-payments.routes.js`
- **Tests:** `tests/wallet/inr-usdt-payments.test.js`

## 25. Fantasy contest formats (H2H, Winner Takes All, 2x–10x) and safe joining
- **Types** (`contest.category`): existing `mega`, `equal`, `guaranteed`, `practice`, plus `h2h` (2 spots, winner takes the pool), `winner_takes_all` (only rank 1 is paid) and `multiplier` with `contest.multiplier` 2/3/4/5/8/10 (1 in N wins). New types' pools grow with joins; winners share the pool equally. A multiplier contest that doesn't fill pays `floor(joined / N)` winners, so each gets at least N × entry fee less the platform fee.
- **Rules in one place:** `src/services/contest-formats.js` (winners, minimum players, labels/badges, admin validation). The app APIs, admin, results job and payout all use it.
- **Minimum players:** `contest.min_participants` (admin, optional). Default: 10 for existing types (PHP rule), 2 for H2H/WTA, N for Nx. Below it, the contest is cancelled and refunded when the session ends.
- **Result declaration:** the results job pays prizes right after scoring when **Contest Settings → Declare results automatically** is on (default). When it's off, prizes wait on Pending Prizes as before. The payout is idempotent (lease + one transaction id per entry).
- **Contest Settings** (`/contest-settings`, permission `contest_settings.*`, settings key `contest_settings`): default platform fee % per type (pre-filled on Create Contest) and the auto-declare switch.
- **Safe joining:** `src/services/contest-join.service.js` serves both `POST /api/v1/bulk-join-contest` and `POST /api/v1/contests/bulk-join`. The entry fee is the contest's own (a different `entry_fee` from the app → 409). Joining closes when the session starts. A per-contest lease (`contest.join_lock_at`) prevents overbooking. The wallet is debited atomically (deposit first, then winnings).
- **Admin:** type selector, multiplier, minimum players and a live prize preview on create/edit (`format-fields.ejs`, `prize-script.ejs`). H2H forces 2 spots and 1 entry per user, and Nx spots must be a multiple of N. Once players have joined, the type and multiplier are locked and spots can't drop below the number joined.
- **App API fields** (contest list, my contests, contest detail): `contest_format`, `format_label`, `format_badge`, `multiplier`, `min_participants`, `total_winners`, `spots_left`; detail also has `winners_now`. The existing `badge` now also shows "H2H", "Winner Takes All" or "4x".
- **New files:** `src/services/contest-formats.js`, `src/services/contest-join.service.js`, `src/services/contest-settings.service.js`, `src/admin/controllers/contest-settings.controller.js`, `src/admin/routes/contest-settings.routes.js`, `src/admin/views/contest_settings/index.ejs`, `src/admin/views/contests/format-fields.ejs`
- **Modified:** `src/models/contest.model.js`, `src/helpers/mobile-compat.js`, `src/services/contest-automation/{contest-scoring,results.job,prize-payout.service}.js`, `src/controllers/{mobile-api,contest,mobile-legacy}.controller.js`, `src/services/performance-tools.service.js`, `src/admin/controllers/{contests,pages}.controller.js`, `src/admin/views/contests/{create,edit,index,show,prize-script}.ejs`, `src/admin/app.js`, `src/admin/access/permissions.js`, `src/admin/views/partials/sidebar.ejs`
- **Tests:** `tests/contests/contest-formats-and-join.test.js`, `tests/contest-automation/contest-automation.test.js` (H2H, 4x, WTA end to end; auto-declare on/off)

## 26. FCM device tokens
- One device token belongs to one user: saving it on login, registration or `POST /api/v1/auth/fcm-token` removes it from any other account.
- `POST /api/v1/auth/fcm-token` accepts the numeric user `id` the mobile login returns (it previously accepted only Mongo ids). `POST /api/v1/auth/fcm-token/remove` `{ user_id, fcm_token }` clears the token on logout.
- **New file:** `src/services/notifications/device-token.service.js`
- **Modified:** `src/controllers/{auth,mobile-api}.controller.js`, `src/routes/auth.routes.js`
- **Tests:** `tests/notifications/device-token.test.js`

## 27. Asset, Market Category & Session redesign (client feedback)
- **Market Type** is now one choice: **Indian Stock**, **US Stock** or **Crypto** (`market` = `indian_stock` | `us_stock` | `crypto`). It replaces "Stock Market + country". The older `market_type` (`stock`/`crypto`) and `category_type` are still written, derived from `market` (`src/services/markets.js`). UK is a legacy market: its data is kept, but it can't be chosen.
- **Market Categories** are dynamic: market type, name (unique per market), description, **minimum number of assets** and status. Only active categories can be used in sessions. New categories get a numeric id (sessions and app baskets store it).
- **Assets** are a central master list: Symbol, Name, Status (market is a form field and filter). There is no category link and no "move to category". A symbol is unique per market.
- **Sessions:** choose the market, tick its active categories, and assign assets to each. An asset can be in only one category per session, but in different categories across sessions. Each category's minimum is enforced in the browser (`public/js/session-asset-picker.js`) **and** on the server (`src/services/session-assets.service.js`). The message format is "Large Cap Indian requires a minimum of 10 assets. Currently selected: 7." The session stores `market`, a `categories` snapshot `[{category_id, category_name, min_assets}]`, and the assignment in `assets[]` (unchanged shape). Draft-session edit and template edit use the same picker and rules. A rejected create re-renders the form with everything entered, including the uploaded image.
- **Maximum assets (client feedback):** each market category also has a required **Maximum Assets** (1–500, at least the minimum). A session can't assign more than that to the category — checked on the server (`buildAssignment`) and in the picker, which stops further ticks once the maximum is reached. Categories saved before this have no maximum (`max_assets: null` = no limit) until edited. Sessions keep `max_assets` in their `categories` snapshot; the admin categories API, `/api/v1/market/categories` and app session payloads return it.
- **Price feed:** the provider comes from the session's `market` (category names are free text now). Sessions without `market` keep the old "… Cap US/UK" name detection.
- **APIs:** `GET /api/categories/:market` (admin; also accepts `stock`/`crypto`) now returns `market`, `min_assets` and `description`. New `GET /api/assets/market/:market` (admin). `GET /api/assets/:categoryId` returns the category's market assets. App session payloads add `market`, `market_label` and `categories`. Basket lists add `categories` (grouped by the real category name; `lc`/`mc`/`sc` kept). `GET /api/v1/market/assets?market=…` and `/market/categories?market=…`.
- **Migration:** `node scripts/migration/redesign-asset-categories.js` (dry run) / `--apply`. It backs up to `scripts/migration/backups/`, then:
  - sets each category's market and `min_assets = 1`, and makes UK categories inactive;
  - merges the per-category copies of each asset into one row per (market, symbol), drops `category_id`, and makes UK assets inactive;
  - sets `market` and the `categories` snapshot on sessions and templates.
  Session asset rows, contests, baskets and scores are not touched. Safe to run again.
- **New files:** `src/services/markets.js`, `src/services/session-assets.service.js`, `public/js/session-asset-picker.js`, `scripts/migration/redesign-asset-categories.js`
- **Modified:** `src/models/{asset,market-type-category,league-session,session-template}.model.js`, `src/admin/controllers/{assets,sessions,pages}.controller.js`, `src/admin/routes/api.routes.js`, `src/admin/views/{assets,market_type_categories}/{index,form}.ejs`, `src/admin/views/sessions/{create,edit,show}.ejs`, `src/admin/views/templates/edit.ejs`, `src/services/contest-automation/price-feed.js`, `src/controllers/{market,mobile-api}.controller.js`
- **Tests:** `tests/admin/asset-category-redesign.test.js` (new), `tests/admin/assets.test.js`, `tests/admin/php-parity-contests-sessions.test.js`, `tests/admin/php-parity-templates.test.js`
