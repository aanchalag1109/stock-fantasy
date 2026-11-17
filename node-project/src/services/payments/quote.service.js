'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: ProbCoin deposit / withdrawal quotes (client feedback: INR & USDT)
 * Purpose: One calculation for both gateways — INR (LG Pay) and USDT (PayRam) — using the
 *          admin's conversion rates (ProbCoin Conversion page) and the per-currency limits and
 *          gateway charges (Deposit & Withdrawal Settings page).
 *
 * Deposits
 *   - The user gives the amount to pay (before charges) or the ProbCoins wanted.
 *   - ProbCoins = amount × rate (rounded down); for "N ProbCoins" the amount is N / rate
 *     rounded up to the paisa/cent, so nobody gets more coins than the rate allows.
 *   - charges = ceil(amount × percent / 100) + fixed. If the user pays them, total payable =
 *     amount + charges; if the platform does, total payable = amount.
 *   - Limits apply to the amount before charges.
 * Withdrawals
 *   - payout = ProbCoins / rate, rounded down; limits apply to the payout.
 * All arithmetic is exact integer math in hundredths (BigInt); rates have up to 6 decimals.
 */

const config = require('../../config/env');
const probcoin = require('../probcoin-conversion.service');
const settings = require('../deposit-withdrawal-settings.service');

const RATE_KEY = { INR: 'inr_to_probcoin_rate', USDT: 'usdt_to_probcoin_rate' };
const GATEWAY = { INR: 'LGPAY', USDT: 'PAYRAM' };
const MAX_COINS = 1000000000;

/** "12.5" → 1250n (hundredths) or null. */
function toCents(value) {
  const str = value === undefined || value === null ? '' : String(value).trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(str)) return null;
  const [whole, frac = ''] = str.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}
const toMicro = (rate) => {
  const [whole, frac = ''] = String(rate).split('.');
  return BigInt(whole) * 1000000n + BigInt((frac + '000000').slice(0, 6));
};
const ceilDiv = (a, b) => (a + b - 1n) / b;
const fromCents = (c) => Number(c) / 100;
const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });
const given = (v) => v !== undefined && v !== null && String(v).trim() !== '';

function normalizeCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  return RATE_KEY[currency] ? currency : null;
}

/** USDT deposit limits fall back to PAYRAM_MIN/MAX_DEPOSIT_USDT until saved in admin. */
const depositFallback = (currency) => (currency === 'USDT'
  ? { min: config.PAYRAM.minDepositUsdt, max: config.PAYRAM.maxDepositUsdt }
  : undefined);

async function rateFor(currency) {
  const rates = await probcoin.getRates();
  const rate = rates[RATE_KEY[currency]];
  return rate && rate > 0 ? rate : null;
}

/**
 * @param {{ currency:string, amount?:any, probcoins?:any }} input
 * @returns {Promise<object>} { ok:true, currency, gateway, rate, probcoins, base_amount, charge_percent,
 *   charge_fixed, charges, charges_bearer, total_payable, min_amount, max_amount } | { ok:false, status, message }
 */
async function depositQuote({ currency: rawCurrency, amount, probcoins } = {}) {
  const currency = normalizeCurrency(rawCurrency);
  if (!currency) return fail(400, 'Choose a deposit currency: INR or USDT.');
  const rate = await rateFor(currency);
  if (!rate) return fail(503, `${currency} deposits are not available right now (conversion rate not configured).`);
  const R = toMicro(rate);

  let base;
  let coins;
  if (given(probcoins)) {
    coins = toCents(probcoins);
    if (coins === null || coins <= 0n) return fail(400, 'Enter a valid number of ProbCoins (up to 2 decimal places).');
    if (coins > BigInt(MAX_COINS) * 100n) return fail(400, 'That is more ProbCoins than can be bought at once.');
    base = ceilDiv(coins * 1000000n, R);
  } else {
    base = toCents(amount);
    if (base === null || base <= 0n) return fail(400, `Enter a valid ${currency} amount (up to 2 decimal places).`);
    coins = (base * R) / 1000000n;
    if (coins <= 0n) return fail(400, 'This amount is too small to buy any ProbCoins.');
  }

  const fallback = depositFallback(currency);
  const limit = await settings.checkTransactionAmount('deposit', fromCents(base).toFixed(2), currency, { fallback });
  if (!limit.ok) return limit;
  const limits = await settings.limitsFor('deposit', currency, { fallback });

  const charge = await settings.getCharges(currency);
  const charges = ceilDiv(base * toCents(charge.percent.toFixed(2)), 10000n) + toCents(charge.fixed.toFixed(2));
  const total = charge.bearer === 'user' ? base + charges : base;

  return {
    ok: true,
    currency,
    gateway: GATEWAY[currency],
    rate,
    probcoins: fromCents(coins),
    base_amount: fromCents(base),
    charge_percent: charge.percent,
    charge_fixed: charge.fixed,
    charges: fromCents(charges),
    charges_bearer: charge.bearer,
    total_payable: fromCents(total),
    min_amount: limits ? limits.min : null,
    max_amount: limits ? limits.max : null,
  };
}

/**
 * @param {{ currency:string, probcoins:any }} input
 * @returns {Promise<object>} { ok:true, currency, rate, probcoins, payout_amount, min_amount, max_amount, network }
 */
async function withdrawalQuote({ currency: rawCurrency, probcoins } = {}) {
  const currency = normalizeCurrency(rawCurrency);
  if (!currency) return fail(400, 'Choose a payout currency: INR or USDT.');
  const coins = toCents(probcoins);
  if (coins === null || coins <= 0n) return fail(400, 'Enter a valid number of ProbCoins to withdraw (up to 2 decimal places).');
  const rate = await rateFor(currency);
  if (!rate) return fail(503, `${currency} withdrawals are not available right now (conversion rate not configured).`);
  const payout = (coins * 1000000n) / toMicro(rate);
  if (payout <= 0n) return fail(400, 'This amount is too small to withdraw.');

  const limit = await settings.checkTransactionAmount('withdrawal', fromCents(payout).toFixed(2), currency);
  if (!limit.ok) return limit;
  const limits = await settings.limitsFor('withdrawal', currency);
  return {
    ok: true,
    currency,
    rate,
    probcoins: fromCents(coins),
    payout_amount: fromCents(payout),
    min_amount: limits ? limits.min : null,
    max_amount: limits ? limits.max : null,
    network: currency === 'USDT' ? await settings.getWithdrawalNetwork() : null,
  };
}

/** Everything the app needs to draw the deposit / withdrawal screens, per currency. */
async function paymentOptions() {
  const rates = await probcoin.getRates();
  const network = await settings.getWithdrawalNetwork();
  return Promise.all(settings.CURRENCIES.map(async (currency) => {
    const rate = rates[RATE_KEY[currency]] || null;
    const [deposit, withdrawal, charge] = await Promise.all([
      settings.limitsFor('deposit', currency, { fallback: depositFallback(currency) }),
      settings.limitsFor('withdrawal', currency),
      settings.getCharges(currency),
    ]);
    const gatewayReady = currency === 'USDT' ? require('../payram/payram.client').isConfigured() : true;
    return {
      currency,
      gateway: GATEWAY[currency],
      rate,
      deposit_enabled: Boolean(rate && deposit && gatewayReady),
      withdrawal_enabled: Boolean(rate && withdrawal),
      min_deposit: deposit ? deposit.min : null,
      max_deposit: deposit ? deposit.max : null,
      min_withdrawal: withdrawal ? withdrawal.min : null,
      max_withdrawal: withdrawal ? withdrawal.max : null,
      charge_percent: charge.percent,
      charge_fixed: charge.fixed,
      charges_bearer: charge.bearer,
      withdrawal_network: currency === 'USDT' ? network : null,
    };
  }));
}

module.exports = { depositQuote, withdrawalQuote, paymentOptions, normalizeCurrency, GATEWAY };
