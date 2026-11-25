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

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: a money limit expressed in ProbCoins, rounded so it is exactly
 * what the quotes accept: min → fewest ProbCoins whose value reaches the minimum (rounded up),
 * max → most ProbCoins whose value stays within the maximum (rounded down). Same for deposits
 * (ProbCoins = amount × rate) and withdrawals (payout = ProbCoins ÷ rate).
 * @returns {{ min:number|null, max:number|null }}
 */
function probcoinRange(limits, rate) {
  if (!limits || !(rate > 0)) return { min: null, max: null };
  const R = toMicro(rate);
  const min = toCents(Number(limits.min).toFixed(2));
  const max = toCents(Number(limits.max).toFixed(2));
  return {
    min: min === null ? null : fromCents(ceilDiv(min * R, 1000000n)),
    max: max === null ? null : fromCents((max * R) / 1000000n),
  };
}

/** Adds min_probcoins / max_probcoins to a failed limit check (message unchanged unless given). */
function withProbcoinLimits(result, limits, rate, message) {
  const coins = probcoinRange(limits, rate);
  return { ...result, ...(message ? { message } : {}), min_probcoins: coins.min, max_probcoins: coins.max };
}

const coinText = (n) => `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ProbCoins`;
const moneyText = (n, currency) => (currency === 'INR' ? `₹${n}` : `${n} ${currency}`);

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
  if (!limit.ok) {
    return limit.min_amount !== undefined ? withProbcoinLimits(limit, { min: limit.min_amount, max: limit.max_amount }, rate) : limit;
  }
  const limits = await settings.limitsFor('deposit', currency, { fallback });
  const coinLimits = probcoinRange(limits, rate);

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
    min_probcoins: coinLimits.min, // NEW IMPLEMENTATION — NODE.JS PROJECT: limits in ProbCoins
    max_probcoins: coinLimits.max,
  };
}

/**
 * @param {{ currency:string, probcoins:any }} input
 * @returns {Promise<object>} { ok:true, currency, rate, probcoins, payout_amount, min_amount, max_amount, network }
 */
async function withdrawalQuote({ currency: rawCurrency, probcoins } = {}) {
  const currency = normalizeCurrency(rawCurrency);
  if (!currency) return fail(400, 'Choose a payout currency: INR or USDT.');
  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): admin on/off switch. Every withdrawal request
  // starts with this quote, so nothing is deducted while it is off.
  if (!(await settings.isWithdrawalAllowed(currency))) {
    return fail(403, `${currency} withdrawals are not available right now.`, { withdrawal_disabled: true });
  }
  const coins = toCents(probcoins);
  if (coins === null || coins <= 0n) return fail(400, 'Enter a valid number of ProbCoins to withdraw (up to 2 decimal places).');
  const rate = await rateFor(currency);
  if (!rate) return fail(503, `${currency} withdrawals are not available right now (conversion rate not configured).`);
  const payout = (coins * 1000000n) / toMicro(rate);
  if (payout <= 0n) return fail(400, 'This amount is too small to withdraw.');

  const limit = await settings.checkTransactionAmount('withdrawal', fromCents(payout).toFixed(2), currency);
  if (!limit.ok) {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: the player enters ProbCoins, so say the limit in ProbCoins too
    if (limit.min_amount === undefined) return limit;
    const bounds = { min: limit.min_amount, max: limit.max_amount };
    const coinLimits = probcoinRange(bounds, rate);
    const below = fromCents(payout) < bounds.min;
    const message = below
      ? `Minimum withdrawal is ${coinText(coinLimits.min)} (${moneyText(bounds.min, currency)}).`
      : `Maximum withdrawal is ${coinText(coinLimits.max)} (${moneyText(bounds.max, currency)}).`;
    return withProbcoinLimits(limit, bounds, rate, message);
  }
  const limits = await settings.limitsFor('withdrawal', currency);
  const coinLimits = probcoinRange(limits, rate);
  return {
    ok: true,
    currency,
    rate,
    probcoins: fromCents(coins),
    payout_amount: fromCents(payout),
    min_amount: limits ? limits.min : null,
    max_amount: limits ? limits.max : null,
    min_probcoins: coinLimits.min, // NEW IMPLEMENTATION — NODE.JS PROJECT: limits in ProbCoins
    max_probcoins: coinLimits.max,
    network: currency === 'USDT' ? await settings.getWithdrawalNetwork() : null,
  };
}

/** Everything the app needs to draw the deposit / withdrawal screens, per currency. */
async function paymentOptions() {
  const rates = await probcoin.getRates();
  const network = await settings.getWithdrawalNetwork();
  return Promise.all(settings.CURRENCIES.map(async (currency) => {
    const rate = rates[RATE_KEY[currency]] || null;
    const [deposit, withdrawal, charge, withdrawalAllowed] = await Promise.all([
      settings.limitsFor('deposit', currency, { fallback: depositFallback(currency) }),
      settings.limitsFor('withdrawal', currency),
      settings.getCharges(currency),
      settings.isWithdrawalAllowed(currency),
    ]);
    const gatewayReady = currency === 'USDT' ? require('../payram/payram.client').isConfigured() : true;
    // NEW IMPLEMENTATION — NODE.JS PROJECT: the same limits in ProbCoins, ready to show in the app
    const depositCoins = probcoinRange(deposit, rate);
    const withdrawalCoins = probcoinRange(withdrawal, rate);
    return {
      currency,
      gateway: GATEWAY[currency],
      rate,
      deposit_enabled: Boolean(rate && deposit && gatewayReady),
      withdrawal_enabled: Boolean(rate && withdrawal && withdrawalAllowed),
      min_deposit: deposit ? deposit.min : null,
      max_deposit: deposit ? deposit.max : null,
      min_withdrawal: withdrawal ? withdrawal.min : null,
      max_withdrawal: withdrawal ? withdrawal.max : null,
      min_deposit_probcoins: depositCoins.min,
      max_deposit_probcoins: depositCoins.max,
      min_withdrawal_probcoins: withdrawalCoins.min,
      max_withdrawal_probcoins: withdrawalCoins.max,
      charge_percent: charge.percent,
      charge_fixed: charge.fixed,
      charges_bearer: charge.bearer,
      withdrawal_network: currency === 'USDT' ? network : null,
    };
  }));
}

module.exports = { depositQuote, withdrawalQuote, paymentOptions, normalizeCurrency, GATEWAY, probcoinRange };
