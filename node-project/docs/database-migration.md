# Database Migration Strategy: MySQL → MongoDB

This document outlines the rationalization, transformation rules, and migration pipeline for transitioning **ProbTrade** from a relational MySQL database to a document-oriented MongoDB database.

---

## 1. Migration Rationale & Philosophy

In MySQL, normalization leads to extreme table fragmentation:
- To display a single session, MySQL performs joins across `league_sessions`, `league_session_assets`, `market_type_categories`, and `session_asset_prices`.
- To load a user profile with payment info, MySQL queries `users`, `user_payment_details`, and `bank_cards`.
- To inspect contest prizes, MySQL queries `contests` and `contest_performance_prizes`.

In MongoDB, data that is queried together and modified together is modeled together:
1. **Embedded Assets & Prices:** Assets and their start/end prices belong exclusively to a League Session lifecycle. Embedding them in `league_sessions` yields atomic, single-document reads without joins.
2. **Embedded Prize Structures:** Contests embed their prize distribution tiers directly, eliminating lookups in `contest_performance_prizes`.
3. **Embedded User Payment Details:** USDT wallet addresses and banking information are embedded inside the `users` document.
4. **Embedded Support Ticket Thread:** `ticket_replies` are embedded within `tickets`.
5. **Native Types over Stringified JSON:** MySQL stored `assets`, `multipliers`, and `prize_distribution` as `longtext` strings. MongoDB stores them as clean, native BSON arrays of objects, allowing rich indexation and filtering.

---

## 2. Entity Mapping Matrix

| MySQL Table | MongoDB Collection | Design Type | Rationale & Changes |
|---|---|---|---|
| `users` | `users` | Collection | Retains core user entity. Adds embedded `payment_details` and `bank_card`. Numerical balances typed to `Double`. |
| `user_payment_details` | *Embedded into `users`* | Embedded Document | 1:1 relationship with user. Never accessed outside user context. |
| `bank_cards` | *Embedded into `users`* | Embedded Document | 1:1 relationship with user bank withdrawal info. |
| `wallet_balances` | *Merged into `users`* | Merged Fields | `deposit_balance` and `winnings_balance` consolidated on user. |
| `admins` | `admins` | Collection | Isolated administrative credentials with bcrypt password. |
| `league_sessions` | `league_sessions` | Collection | Master session document. Embeds all assets and price feeds. |
| `league_session_assets` | *Embedded into `league_sessions`* | Embedded Array | Assets assigned to a session stored in `session.assets[]`. |
| `session_asset_prices` | *Embedded into `league_sessions`* | Embedded Array | `start_price` and `end_price` stored directly inside `session.assets[]`. |
| `market_type_categories`| `market_type_categories` | Collection | Master categories for stocks and crypto (Large Cap, Mid Cap, etc.). |
| `assets` | `assets` | Collection | Global catalog of stocks and cryptos with symbols, names, and images. |
| `contests` | `contests` | Collection | Contests referencing `session_id`. Embeds prize distribution. |
| `contest_performance_prizes` | *Embedded into `contests`* | Embedded Array | Dynamic prize tiers stored directly in `contest.prizes[]`. |
| `contest_prize_distributions` | *Embedded into `contests`* | Embedded Array | Predefined percentages stored directly in `contest.fixed_prizes[]`. |
| `saved_baskets` | `saved_baskets` | Collection | User asset selections with multipliers, parsed into native BSON. |
| `contest_entries` | `contest_entries` | Collection | Join records linking `user_id`, `contest_id`, `basket_id`, `total_score`, `rank`. |
| `transactions` | `transactions` | Collection | Immutable financial ledger. Indexed on `user_id` and unique `transaction_id`. |
| `payments` | `payments` | Collection | Payment orders from LG Pay. Unique index on `order_id`. |
| `withdrawal_requests` | `withdrawal_requests` | Collection | Payout requests with USDT address and status. |
| `kyc_submissions` | `kyc_submissions` | Collection | KYC identity documents and approval statuses. |
| `tickets` | `tickets` | Collection | Support tickets. Embeds `replies[]`. |
| `ticket_replies` | *Embedded into `tickets`* | Embedded Array | Nested array of conversation messages within the parent ticket. |
| `announcements` | `announcements` | Collection | Platform notices and alerts. |
| `banners` | `banners` | Collection | Mobile app promotional carousel banners. |
| `settings` | `settings` | Collection | Key-value application configurations. |
| `notifications` | `notifications` | Collection | In-app user notifications. |
| `cron_logs` | `cron_logs` | Collection | Audit logs of scheduler and cron runs. |
| `referral_transactions` | `referral_transactions` | Collection | Referral commission history. |

---

## 3. Data Transformation Rules

### 3.1 ID Strategy
- MongoDB native `_id` is an `ObjectId`.
- To preserve relational integrity during migration from MySQL, an `old_id` field (integer) is preserved on all collections.
- Foreign references during migration (e.g. `user_id`, `contest_id`, `basket_id`) can resolve via `old_id` mapping or directly reference the integer/ObjectId.

### 3.2 Parsing Stringified JSON
- Fields like `saved_baskets.assets`, `saved_baskets.multipliers`, and `contests.prize_distribution` are parsed from strings using `JSON.parse()` into valid BSON arrays of subdocuments.

### 3.3 Timestamps & Date Normalization
- MySQL `DATETIME` and `TIMESTAMP` strings (e.g. `2026-05-29 10:30:00`) are parsed into native JavaScript `Date` objects (UTC).

### 3.4 Decimal Precision
- Currency fields (`deposit_balance`, `winnings_balance`, `amount`, `entry_fee`, `prize_pool`) are cast to standard floating-point `Number` (Double) in MongoDB, with rounding logic matching Laravel's `round(..., 2)`.

---

## 4. Reversible Migration Pipeline

The migration script `scripts/migration/migrate-mysql-to-mongo.js`:
1. Connects to MySQL (`proborzs_prob`) via `mysql2/promise`.
2. Connects to MongoDB (`mongodb://localhost:27017/probtrade`).
3. Migrates master tables first (`admins`, `settings`, `market_type_categories`, `assets`, `banners`, `announcements`).
4. Migrates `users` and merges `user_payment_details` and `bank_cards`.
5. Migrates `league_sessions` and embeds `league_session_assets` + `session_asset_prices`.
6. Migrates `contests` and embeds `contest_performance_prizes`.
7. Migrates `saved_baskets`, converting JSON strings to BSON.
8. Migrates `contest_entries`, `transactions`, `payments`, `withdrawal_requests`, `kyc_submissions`.
9. Migrates `tickets` and embeds `ticket_replies`.
10. Validates count equality between MySQL and MongoDB.
11. Safe & Re-runnable: Uses `upsert` matching on `old_id`.
