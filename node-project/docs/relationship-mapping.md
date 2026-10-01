# Relationship Mapping: MySQL Foreign Keys → MongoDB Document Strategy

This document details how relational foreign keys and many-to-many associations in MySQL map to MongoDB embedded structures and reference strategies.

---

## 1. Overview of Relationship Conversions

| Relationship in MySQL | Cardinality | Strategy in MongoDB | Implementation Details |
|---|---|---|---|
| `users` ↔ `user_payment_details` | 1 : 1 | **Embedded** | Directly nested inside `user.payment_details` |
| `users` ↔ `bank_cards` | 1 : 1 | **Embedded** | Nested inside `user.payment_details` |
| `league_sessions` ↔ `league_session_assets` | 1 : N | **Embedded Array** | Nested array `session.assets[]` |
| `league_session_assets` ↔ `session_asset_prices` | 1 : 1 | **Embedded Fields** | `start_price` & `end_price` added to `session.assets[]` |
| `contests` ↔ `contest_performance_prizes` | 1 : N | **Embedded Array** | Nested array `contest.prizes[]` |
| `tickets` ↔ `ticket_replies` | 1 : N | **Embedded Array** | Nested array `ticket.replies[]` |
| `league_sessions` ↔ `contests` | 1 : N | **Referenced** | `contest.league_session_id` references session |
| `users` ↔ `saved_baskets` | 1 : N | **Referenced** | `saved_basket.user_id` references user |
| `contests` ↔ `contest_entries` | 1 : N | **Referenced** | `contest_entry.contest_id` references contest |
| `saved_baskets` ↔ `contest_entries` | 1 : N | **Referenced** | Multiple contests can be entered with the same basket |
| `users` ↔ `transactions` | 1 : N | **Referenced** | High volume audit log kept in separate `transactions` |
| `users` ↔ `kyc_submissions` | 1 : 1 / 1 : N | **Referenced** | Kept in `kyc_submissions` collection |
| `users` ↔ `withdrawal_requests` | 1 : N | **Referenced** | Kept in `withdrawal_requests` collection |

---

## 2. In-Depth Architectural Decision Records

### 2.1 League Session Assets & Prices
* **MySQL Approach:** 
  1. `league_sessions` (table)
  2. `league_session_assets` (join table with session ID, category ID, symbol)
  3. `session_asset_prices` (table with session ID, symbol, start_price, end_price, fetched timestamps)
* **MongoDB Decision:** Embed all into `session.assets[]`.
* **Reasoning:**
  A session has a fixed, small set of assets (typically 10 to 50 assets). Start prices and end prices are captured once per session. Embedding eliminates complex 3-table SQL joins on every price check and contest evaluation, making score calculation blazing fast.

### 2.2 Contest Prize Distribution Tiers
* **MySQL Approach:** `contests` references `contest_performance_prizes`.
* **MongoDB Decision:** Embed into `contest.prizes[]`.
* **Reasoning:**
  Prize slabs (e.g. Rank 1: ₹500, Ranks 2-5: ₹200...) are tightly coupled to a single contest. They are read every time the contest card is rendered or leaderboard is computed. Document size is small (< 1KB). Embedding eliminates separate round-trips.

### 2.3 User Payment & Banking Info
* **MySQL Approach:** `user_payment_details` table has `UNIQUE(user_id)`.
* **MongoDB Decision:** Embedded subdocument `user.payment_details`.
* **Reasoning:**
  Only accessed by the user when requesting withdrawals or viewing account settings. 1:1 relationship with small size.

### 2.4 Support Tickets & Thread Replies
* **MySQL Approach:** `tickets` has `ticket_replies` child records.
* **MongoDB Decision:** Embed `replies[]` inside `tickets`.
* **Reasoning:**
  Support conversations rarely exceed a few dozen messages. Reading a ticket requires rendering the full conversation thread. Embedding guarantees single-read message history.
