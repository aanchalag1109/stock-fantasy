'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT deposits via PayRam
 * Purpose: One record per USDT deposit, kept apart from the LG Pay `payments` collection so the
 *          INR flow is untouched. ProbCoins are credited through the shared ledger
 *          (transactions collection, transaction_id = PAYRAM_<deposit_id>).
 *
 * status
 *   pending         payment link created, nothing received yet
 *   partially_paid  PayRam saw a deposit smaller than requested (may still be completed)
 *   credited        payment verified with PayRam and ProbCoins credited
 *   cancelled       link expired / cancelled with nothing received
 *   failed          PayRam refused to create the payment
 *   review          needs an admin: underpaid then expired, wrong currency, amount mismatch
 */

const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  received_at: { type: Date, default: Date.now },
  source: { type: String },          // webhook | status_check
  status: { type: String },          // PayRam status/paymentState
  authenticated_by: { type: String, default: null }, // signature | api_key
  filled_amount: { type: String, default: null },
  filled_amount_in_usd: { type: String, default: null },
  result: { type: String, default: null }, // what we did
}, { _id: false });

const payramDepositSchema = new mongoose.Schema({
  deposit_id: { type: String, required: true, unique: true },      // internal id, sent to PayRam as invoiceID
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  gateway: { type: String, default: 'PAYRAM', immutable: true },
  currency: { type: String, default: 'USDT', immutable: true },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: which PayRam connection (server + key) this deposit belongs to
  environment: { type: String, enum: ['mainnet', 'testnet'], default: 'mainnet', index: true },
  amount: { type: Number, required: true },                        // USDT to pay = base + charges if user pays (sent as amountInUSD)
  base_amount: { type: Number, default: null },                    // price of the ProbCoins before charges
  charges: { type: Number, default: 0 },                           // gateway charges (USDT)
  charges_bearer: { type: String, default: null },                 // 'user' | 'platform'
  rate: { type: Number, required: true },                          // ProbCoins per 1 USDT, locked at creation
  probcoins: { type: Number, required: true },                     // ProbCoins credited on success
  network: { type: String, default: null },                        // optional PayRam blockchain restriction (e.g. TRX)
  reference_id: { type: String, default: null },                   // PayRam reference_id
  payment_url: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'partially_paid', 'credited', 'cancelled', 'failed', 'review'],
    default: 'pending',
    index: true,
  },
  payram_state: { type: String, default: null },                   // last PayRam status
  filled_amount: { type: Number, default: null },                  // received, in USDT
  filled_amount_in_usd: { type: Number, default: null },
  tx_hashes: { type: [String], default: undefined },
  blockchain: { type: String, default: null },                     // chain the user paid on (e.g. TRX)
  confirmations: { type: Number, default: null },                  // block confirmations reported by PayRam
  confirmations_required: { type: Number, default: null },
  explorer_url: { type: String, default: null },
  verification: {                                                  // the PayRam API check that allowed the credit
    verified_at: { type: Date, default: null },
    payment_state: { type: String, default: null },
    amount_in_usd: { type: Number, default: null },
    filled_amount_in_usd: { type: Number, default: null },
    currency: { type: String, default: null },
    blockchain: { type: String, default: null },
    confirmations: { type: Number, default: null },
    confirmations_required: { type: Number, default: null },
  },
  review_reason: { type: String, default: null },
  failure_reason: { type: String, default: null },
  transaction_id: { type: String, default: null },                 // ledger transaction (PAYRAM_<deposit_id>)
  credited_at: { type: Date, default: null },
  webhook_log: { type: [webhookLogSchema], default: [] },
}, {
  collection: 'payram_deposits',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

payramDepositSchema.index({ reference_id: 1 }, { unique: true, partialFilterExpression: { reference_id: { $type: 'string' } } });

module.exports = mongoose.model('PayramDeposit', payramDepositSchema);
