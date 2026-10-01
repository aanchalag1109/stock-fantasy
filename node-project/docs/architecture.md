# System Architecture: Laravel to Node.js + Express + MongoDB Migration

## 1. Executive Summary

This document describes the architectural design for migrating **ProbTrade**, a skill-based trading and prediction contest platform, from **PHP / Laravel 12 / MySQL** to **Node.js / Express.js / MongoDB (Mongoose)** using idiomatic, modern JavaScript.

The architecture maintains 100% functional equivalence with existing API routes, calculation logic, payment flows, cron jobs, and bot simulations, while redesigning data persistence for high throughput, low latency, and document-oriented MongoDB patterns.

---

## 2. Technology Stack

* **Runtime:** Node.js (>= v20.0.0 LTS)
* **Framework:** Express.js (v4.x)
* **Language:** JavaScript only (ES2022+ / CommonJS or ES Modules; using clean modular JavaScript, no TypeScript)
* **Database & ODM:** MongoDB Server with Mongoose (v8.x)
* **Security & Auth:** JWT (`jsonwebtoken`), `bcryptjs`, `cors`, `helmet`, `express-rate-limit`
* **Validation:** Joi schema validation
* **HTTP Client:** `axios`
* **Scheduling:** `node-cron`
* **File Uploads:** `multer`
* **Logging:** `winston` + `morgan`

---

## 3. High-Level Architecture Diagram

```
                 +---------------------------+
                 |    Flutter Mobile App     |
                 |      & Admin Clients      |
                 +-------------+-------------+
                               |
                               | HTTP / JSON / Form-Data
                               v
                 +---------------------------+
                 |       Express Router      |
                 +-------------+-------------+
                               |
            +------------------+------------------+
            |                  |                  |
            v                  v                  v
     +--------------+   +--------------+   +--------------+
     | Auth / CORS  |   | Request Body |   | Centralized  |
     | Middleware   |   | Validators   |   | Error Handler|
     +--------------+   +--------------+   +--------------+
                               |
                               v
                 +---------------------------+
                 |        Controllers        | (Thin HTTP Request/Response Adapters)
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 |     Service Layer (Core)  |
                 | - Contest Calculation     |
                 | - Prize Distribution      |
                 | - Bot Auto-Join Engine    |
                 | - Price Fetching & Cache  |
                 | - Wallet & Ledger Service |
                 | - Payment Gateway (LGPay) |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 |       Mongoose ODM        |
                 | Schemas, Hooks, Indexes   |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 |       MongoDB Server      |
                 |    (probtrade database)   |
                 +---------------------------+
```

---

## 4. Layer Responsibilities

### 4.1 Route Layer (`src/routes/`)
- Pure routing and route grouping.
- Path parameters, HTTP verbs, and middleware attachment (`authMiddleware`, `validate()`, `upload`).
- Mounts `/api/v1` for mobile app endpoints, `/api` for global APIs, and `/admin` for administrative interfaces.

### 4.2 Middleware Layer (`src/middleware/`)
- **Authentication:** `auth.middleware.js` verifies JWT tokens or session headers; extracts user and admin identity.
- **Validation:** `validate.middleware.js` validates `req.body`, `req.query`, and `req.params`.
- **CORS:** `cors.middleware.js` preserves permissive CORS headers matching Laravel's `Cors.php`.
- **Error Handling:** `error.middleware.js` catches all operational and unhandled exceptions, returning standardized JSON error envelopes.
- **Upload:** `upload.middleware.js` uses `multer` for KYC documents, profile photos, and session banners.

### 4.3 Controller Layer (`src/controllers/`)
- Controllers remain strictly thin.
- Extracts sanitized input from `req`.
- Delegates business logic to services.
- Formats HTTP responses to match exact Laravel JSON schemas.

### 4.4 Service Layer (`src/services/`)
- Encapsulates all domain and business rules:
  1. **PricingService:** Implements the exact 10-tier, 5,000,000 winner table dynamic pricing algorithm and equal prize logic.
  2. **CalculateService:** Implements asset price delta, directional multiplier logic, total score points, rank sorting, tie-pooling, and winnings crediting.
  3. **BotAutoJoinService:** Background worker that selects test users (`is_test_user = 1`), builds balanced baskets across session categories, generates multipliers, and joins contests.
  4. **PriceFetchingService:** Integrates with RapidAPI for NSE stocks and CoinMarketCap / Binance for cryptocurrencies, with in-memory caching and fallback retries.
  5. **TransactionService:** Handles wallet deduction (`deposit_balance` first, then `winnings_balance`), crediting winnings, duplicate prevention via unique transaction ID keys, and ledger reconciliation.
  6. **PaymentService:** Handles LG Pay request signature calculation (`MD5`), order creation, webhook callback verification, and wallet crediting.
  7. **NotificationService:** Handles user notification tracking and Firebase Cloud Messaging (FCM) v1 push notifications.

### 4.5 Data Access & Models (`src/models/`)
- Mongoose schemas modeling document structures.
- Embedded documents used where data is co-accessed (e.g. Session Assets + Prices embedded in `LeagueSession`, Prize structure embedded in `Contest`, User Payment Details embedded in `User`).
- Strict indexing on query patterns (`mobile`, `email`, `session_id`, `contest_id`, `status`).

---

## 5. Background Jobs & Scheduling

In Laravel, scheduler entries run via `cron` calling `artisan schedule:run` and queue workers (`RunAllJob`).
In Node.js:
- `node-cron` runs every minute to execute:
  1. `statusUpdate`: Checks sessions reaching `start_time` (moves upcoming -> live) and `end_time` (moves live -> completed).
  2. `liveScores`: Updates session end prices and calculates intermediate contest scores for live contests.
  3. `masterCron`: Pre-fetches prices 5 minutes before start, transitions sessions, triggers bot auto-joins, and declares completed contests.
- Master endpoints `/api/cron/status-update`, `/api/cron/master`, `/api/cron/start-contests`, and `/api/cron/update-scores` remain callable via HTTP with `X-Cron-Secret` header or query parameter.

---

## 6. Security & Integrity Considerations

1. **Transaction Integrity:** Mongoose multi-document transactions are utilized during contest join and prize distribution where atomic balance changes occur.
2. **Idempotency:** Unique indexes on `transaction_id` (`ENTRY_...`, `CONTEST_..._ENTRY_...`) prevent duplicate balance deductions or double prize payouts.
3. **Secrets Management:** Loaded exclusively from `.env` (JWT secrets, DB URIs, RapidAPI keys, CMC keys, Cron secrets).
