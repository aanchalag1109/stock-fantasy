# Business Logic Mapping: Core Workflows & Algorithms

This document specifies the exact business logic rules, calculations, algorithms, and automated processes migrated from Laravel to Node.js.

---

## 1. Dynamic Prize Pool & Flexible Pricing Algorithm

The platform features two primary contest pricing models:

### 1.1 Equal Prize Contests (`category = 'equal'`)
- Total Pool = `participants * entry_fee`
- Platform Fee Amount = `total_pool * (platform_fee / 100)`
- Total Prize Pool = `total_pool - platform_fee_amount`
- Total Winners = `round(participants * (winning_percentage / 100))`
- Per Winner Amount = `floor(total_prize_pool / total_winners)`
- Slabs: Single slab `Ranks 1 to total_winners` receiving `100%` of the prize pool.

### 1.2 Mega / Dynamic Contests (`category = 'mega'`)
1. **Edge Cases:**
   - `total_winners <= 0`: 0 prizes.
   - `total_winners == 1`: Rank 1 receives 100% of prize pool.
   - `total_winners == 2`: 60-40 split (Rank 1 gets 60%, Rank 2 gets 40%).
2. **Predefined Base Structures:**
   - Available tiers: `10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000`.
   - The algorithm finds the closest matching structure count ($N$). If equidistant, it favors the higher structure.
3. **Group Adjustment & Scaling:**
   - If scaling down: Intermediate groups cap at `total_winners`. Groups beyond `total_winners` are pruned.
   - If scaling up: The final group extends to `total_winners`.
4. **Smart Last Slab Divisor & Clamping:**
   - To prevent the last slab from dropping below reasonable payouts or exceeding the preceding slab, a divisor check and a safety clamp (`perPersonPrize <= previousPerWinner * 0.95`) are applied.
   - All individual prizes are cast using `floor(per_winner_amount)`.

---

## 2. Contest Performance & Scoring Algorithm

For every user entry:
1. Retrieve `start_price` and `end_price` for each asset in the basket from session asset prices.
2. Calculate percentage price change:
   $$\Delta\% = \frac{\text{end\_price} - \text{start\_price}}{\text{start\_price}} \times 100$$
3. Apply prediction direction:
   - If prediction is `UP`:
     $$\text{directional\%} = \begin{cases} \Delta\%, & \text{if } \Delta\% > 0 \\ -|\Delta\%|, & \text{otherwise} \end{cases}$$
   - If prediction is `DOWN`:
     $$\text{directional\%} = \begin{cases} |\Delta\%|, & \text{if } \Delta\% < 0 \\ -\Delta\%, & \text{otherwise} \end{cases}$$
4. Apply multiplier:
   $$\text{weighted\%} = \text{directional\%} \times \text{multiplier}$$
5. Calculate asset points:
   $$\text{points} = \text{round}(\text{weighted\%}, 2) \times 100$$
6. Entry score:
   $$\text{total\_score} = \sum \text{points}$$
7. **Rank Determination & Ties:**
   - Sort entries descending by `total_score`.
   - Equal scores receive equal rank (e.g. 1, 2, 2, 4...).
   - When crediting wallet for tied ranks: prizes for all occupied positions are summed and divided equally:
     $$\text{shared\_prize} = \text{floor}\left(\frac{\sum \text{prizes}}{\text{tied\_count}}\right)$$

---

## 3. Bot Auto-Join Simulation Engine

Automates test user participation in contests before start:
1. Queries upcoming sessions where start time is within the contest's `bot_join_minutes_before` window (or `bot_join_at`).
2. Calculates required bots: `max(0, bot_count - bots_already_joined)`.
3. Determines pace: if $\le 2$ minutes remain, all remaining bots are joined immediately. Otherwise, joins at a computed interval across the window.
4. Selects available test users (`is_test_user = 1`) who have not yet joined this contest.
5. **Basket Composition Strategy:**
   - Ensures at least one asset is selected from each category in the session.
   - Fills remaining slots up to `max_stocks` with random unique assets.
   - Assigns random UP/DOWN predictions.
   - Assigns 2.0x multiplier to alpha pick, 1.5x to beta pick, and 1.0x to others.
6. Saves standalone basket with serial `B1`, `B2`... and creates `contest_entries`.

---

## 4. Wallet Operations & Financial Rules

1. **Balance Hierarchy on Contest Entry:**
   - Entry fee is deducted from `deposit_balance` first.
   - If `deposit_balance < entry_fee`, the difference is deducted from `winnings_balance`.
   - If `total_wallet_balance < total_entry_fee`, the request fails with 400 Insufficient Balance.
2. **Withdrawal Rules:**
   - Only `winnings_balance` can be withdrawn.
   - Minimum withdrawal amount is `500` coins.
   - User must have configured a USDT wallet address (`BEP20` or `TRC20`).
   - Deducts from `winnings_balance` immediately and creates a `pending` withdrawal request.
3. **Idempotent Audit Ledger:**
   - Every financial debit or credit creates an entry in `transactions`.
   - Unique transaction IDs prevent double-crediting:
     - Contest entry: `ENTRY_<contestId>_<entryId>_<timestamp>_<random>`
     - Prize payout: `CONTEST_<contestId>_ENTRY_<entryId>`
     - LG Pay deposit: `ORD<timestamp><random>`

---

## 5. Multi-Phase Automated Cron Pipeline

Implemented via `node-cron` and exposed via `/api/cron/master` and `/api/cron/status-update`:
- **Phase 0 (T-5 min):** Pre-fetches start prices for sessions about to start within 5 minutes.
- **Phase 1 (Start Time):** Transitions sessions from `upcoming` $\rightarrow$ `live`, captures start prices, freezes fixed prize structures or calculates initial dynamic prize structures, and moves contests to `live`.
- **Phase 2 (Every 5 min):** Fetches intermediate prices and computes live scores for all active contest participants.
- **Phase 3 (End Time):** Transitions session from `live` $\rightarrow$ `completing`, captures final end prices, computes final scores & ranks, adjusts dynamic prize structures for actual participants, marks contests `completed`, and finishes session `completed`.
- **Phase 4 (Orphan Fix):** Resolves contests remaining in `live` or `upcoming` under completed sessions.
- **Phase 5 (Bot Auto-Join):** Executes the bot auto-join cycle for sessions in the joining window.
