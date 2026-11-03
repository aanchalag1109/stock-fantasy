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
