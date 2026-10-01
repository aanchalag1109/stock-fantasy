# MongoDB Schema Design (Mongoose)

This document specifies the exact Mongoose schemas, data types, validators, and indexing strategies implemented in `node-project`.

---

## 1. User Schema (`users`)

```javascript
const userSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, trim: true, default: 'User' },
  email: { type: String, trim: true, lowercase: true, index: { unique: true, sparse: true } },
  mobile: { type: String, trim: true, index: { unique: true, sparse: true } },
  password: { type: String },
  profile_image: { type: String, default: null },
  deposit_balance: { type: Number, default: 0 },
  winnings_balance: { type: Number, default: 0 },
  kyc_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  aadhar: { type: String, default: null },
  pan: { type: String, default: null },
  fcm_token: { type: String, default: null },
  portfolio_score: { type: Number, default: 0 },
  is_admin: { type: Boolean, default: false },
  is_test_user: { type: Boolean, default: false, index: true },
  age: { type: Number, default: null },
  gender: { type: String, default: null },
  payment_details: {
    usdt_wallet_address: { type: String, default: '' },
    usdt_network: { type: String, default: 'BEP20' },
    upi_id: { type: String, default: null },
    account_holder_name: { type: String, default: null },
    account_number: { type: String, default: null },
    bank_name: { type: String, default: null },
    ifsc_code: { type: String, default: null },
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

userSchema.virtual('wallet_balance').get(function() {
  return (this.deposit_balance || 0) + (this.winnings_balance || 0);
});
```

---

## 2. Admin Schema (`admins`)

```javascript
const adminSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  remember_token: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
```

---

## 3. League Session Schema (`league_sessions`)

```javascript
const sessionAssetSchema = new mongoose.Schema({
  category_id: { type: mongoose.Schema.Types.Mixed }, // Number or ObjectId
  category_name: { type: String },
  asset_symbol: { type: String, required: true },
  asset_name: { type: String },
  start_price: { type: Number, default: null },
  end_price: { type: Number, default: null },
  start_price_fetched_at: { type: Date, default: null },
  end_price_fetched_at: { type: Date, default: null },
}, { _id: false });

const leagueSessionSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  market_type: { type: String, default: 'stock' }, // 'stock' or 'crypto'
  max_stocks: { type: Number, default: 5 },
  user_joining_start_time: { type: Date, default: null },
  start_time: { type: Date, required: true, index: true },
  end_time: { type: Date, required: true, index: true },
  status: { 
    type: String, 
    enum: ['upcoming', 'live', 'completing', 'completed', 'draft', 'cancelled'], 
    default: 'upcoming',
    index: true
  },
  active: { type: Boolean, default: true },
  image_url: { type: String, default: null },
  assets: [sessionAssetSchema]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
```

---

## 4. Contest Schema (`contests`)

```javascript
const prizeDistributionTierSchema = new mongoose.Schema({
  rank_label: { type: String },
  rank_start: { type: Number, required: true },
  rank_end: { type: Number, required: true },
  winners_count: { type: Number, required: true },
  percentage: { type: Number, default: 0 },
  prize_amount: { type: Number, default: 0 },
  per_winner_amount: { type: Number, default: 0 },
  total_pool: { type: Number },
  platform_fee: { type: Number },
  prize_pool: { type: Number },
  total_participants: { type: Number },
  total_winners: { type: Number }
}, { _id: false });

const contestSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  league_session_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true }, // Number or ObjectId
  category: { type: String, enum: ['mega', 'equal', 'practice', 'guaranteed'], required: true },
  status: { type: String, enum: ['upcoming', 'live', 'completed', 'cancelled', 'active'], default: 'upcoming', index: true },
  contest_type: { type: String, enum: ['dynamic', 'fixed'], default: 'dynamic' },
  participants: { type: Number, default: 100 },
  max_entries_per_user: { type: Number, default: 1 },
  entry_fee: { type: Number, required: true, default: 0 },
  platform_fee: { type: Number, default: 0 },
  winning_percentage: { type: Number, default: 30 },
  rank_1_prize_percent: { type: Number, default: 0 },
  rank_2_prize_percent: { type: Number, default: 0 },
  group_size: { type: Number, default: 0 },
  prize_pool: { type: Number, default: 0 },
  fixed_prize_pool: { type: Number, default: 0 },
  total_pool: { type: Number, default: 0 },
  platform_fee_amount: { type: Number, default: 0 },
  total_winners: { type: Number, default: 0 },
  is_pinned: { type: Boolean, default: false },
  pin_order: { type: Number, default: 0 },
  is_fixed_prize: { type: Boolean, default: false },
  bot_count: { type: Number, default: 0 },
  bot_join_minutes_before: { type: Number, default: 30 },
  bots_joined: { type: Boolean, default: false },
  bot_join_at: { type: Date, default: null },
  is_calculated: { type: Boolean, default: false },
  prizes_distributed: { type: Boolean, default: false },
  prizes: [prizeDistributionTierSchema]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

contestSchema.index({ league_session_id: 1, status: 1 });
contestSchema.index({ is_pinned: -1, pin_order: 1 });
```

---

## 5. Saved Basket Schema (`saved_baskets`)

```javascript
const basketAssetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  sector: { type: String },
  category_id: { type: mongoose.Schema.Types.Mixed },
  prediction: { type: String, enum: ['UP', 'DOWN', 'NONE'], default: 'UP' }
}, { _id: false });

const basketMultiplierSchema = new mongoose.Schema({
  index: { type: Number },
  asset_name: { type: String },
  multiplier: { type: Number, default: 1 },
  prediction: { type: String, enum: ['UP', 'DOWN', 'NONE'], default: 'UP' },
  selected: { type: Boolean, default: true }
}, { _id: false });

const savedBasketSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  session_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, default: null },
  serial_no: { type: String, default: 'B1' },
  is_standalone: { type: Boolean, default: true },
  assets: [basketAssetSchema],
  multipliers: [basketMultiplierSchema],
  total_score: { type: Number, default: 0 },
  rank: { type: Number, default: null },
  starting_prices: { type: mongoose.Schema.Types.Mixed, default: null },
  ending_prices: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
```

---

## 6. Contest Entry Schema (`contest_entries`)

```javascript
const contestEntrySchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  basket_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  session_id: { type: mongoose.Schema.Types.Mixed, required: true },
  total_score: { type: Number, default: 0, index: true },
  rank: { type: Number, default: null },
  starting_prices: { type: mongoose.Schema.Types.Mixed, default: null },
  ending_prices: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

contestEntrySchema.index({ contest_id: 1, total_score: -1 });
contestEntrySchema.index({ contest_id: 1, user_id: 1 });
```

---

## 7. Transaction Schema (`transactions`)

```javascript
const transactionSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  contest_id: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  type: { 
    type: String, 
    enum: ['deposit', 'winnings', 'contest_entry', 'withdrawal', 'referral', 'manual_adjustment'], 
    required: true,
    index: true
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  transaction_id: { type: String, unique: true, sparse: true },
  transaction_reference: { type: String, default: null },
  description: { type: String },
  payment_method: { type: String, default: null }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

transactionSchema.index({ user_id: 1, created_at: -1 });
```

---

## 8. Payment Schema (`payments`)

```javascript
const paymentSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  order_id: { type: String, required: true, unique: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  amount: { type: Number, required: true },
  payment_status: { type: Number, default: 0 }, // 0: pending, 1: success, 4: processing, -1: failed
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
```

---

## 9. Ticket Schema (`tickets`)

```javascript
const ticketReplySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.Mixed, default: null },
  admin_id: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
}, { _id: true });

const ticketSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed', 'pending'], default: 'open', index: true },
  replies: [ticketReplySchema]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
```
