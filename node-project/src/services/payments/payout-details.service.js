'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Payout details in the player's profile (client feedback: bank details next to USDT)
 * Purpose: The one place that validates, saves, removes and shows a player's payout details, used by
 *          every endpoint (new and old).
 *   - Bank, UPI and USDT are saved separately; saving one never touches the others.
 *   - Any change needs an OTP sent to the registered mobile (OTP purpose "payout_details"). Without it,
 *     anyone knowing a user_id could redirect that player's withdrawals.
 *   - A USDT address must fit the network admin pays on (Deposit & Withdrawal Settings), both when it is
 *     saved and when a withdrawal is requested.
 *   - The account number is never sent back in full.
 */

const crypto = require('crypto');
const User = require('../../models/user.model');
const config = require('../../config/env');
const settings = require('../deposit-withdrawal-settings.service');
const otpService = require('../otp.service');

const OTP_PURPOSE = 'payout_details';
const METHODS = ['BANK', 'UPI'];
const clean = (v) => (v == null ? '' : String(v).trim());
const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });

// ── USDT addresses ──────────────────────────────────────────────────────────

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

/** TRON address: base58check, version 0x41 — catches mistyped addresses, not only wrong formats. */
function isTronAddress(address) {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  let n = 0n;
  for (const ch of address) n = n * 58n + BigInt(BASE58.indexOf(ch));
  const hex = n.toString(16).padStart(50, '0');
  if (hex.length !== 50) return false;
  const bytes = Buffer.from(hex, 'hex');
  return bytes[0] === 0x41 && sha256(sha256(bytes.subarray(0, 21))).subarray(0, 4).equals(bytes.subarray(21));
}
const isEvmAddress = (address) => /^0x[0-9a-fA-F]{40}$/.test(address);

/** Why this address cannot be paid on this network, or null. */
function addressProblem(address, network) {
  const a = clean(address);
  if (!a) return 'Enter your USDT wallet address.';
  if (network === 'TRC20') return isTronAddress(a) ? null : 'This is not a valid TRC20 address. It starts with T and has 34 characters.';
  return isEvmAddress(a) ? null : `This is not a valid ${network} address. It starts with 0x and has 42 characters.`;
}

/** Why the saved USDT details cannot be used on `network` now, or null. */
function usdtProblem(details, network) {
  const d = details || {};
  if (!clean(d.usdt_wallet_address)) return 'Please add your USDT wallet address before withdrawing.';
  const problem = addressProblem(d.usdt_wallet_address, network);
  if (problem) return `${problem} Please update your USDT address; withdrawals are paid on ${network}.`;
  if (d.usdt_saved_network && d.usdt_saved_network !== network) {
    return `Your USDT address was saved for ${d.usdt_saved_network}, but withdrawals are paid on ${network}. Please save it again.`;
  }
  return null;
}

// ── INR destinations ────────────────────────────────────────────────────────

/** { BANK?: destination, UPI?: destination } for what is saved completely. */
function inrDestinations(details) {
  const d = details || {};
  const out = {};
  const account = clean(d.account_number);
  const ifsc = clean(d.ifsc_code).toUpperCase();
  const holder = clean(d.account_holder_name);
  if (account && ifsc && holder) {
    out.BANK = { method: 'BANK', account_holder_name: holder, account_number: account, ifsc_code: ifsc, bank_name: clean(d.bank_name) || null };
  }
  const upi = clean(d.upi_id);
  // Saved before UPI had its own name: the shared name belongs to UPI when there is no bank account.
  if (upi) out.UPI = { method: 'UPI', upi_id: upi, account_holder_name: clean(d.upi_holder_name) || (account ? null : holder || null) };
  return out;
}

/** The INR destination to use. With both saved the player must choose. */
function chooseInr(details, method) {
  const saved = inrDestinations(details);
  const names = METHODS.filter((m) => saved[m]);
  if (!names.length) return fail(400, 'Please add your bank account or UPI ID before withdrawing in INR.', { payment_details_required: true });
  const wanted = clean(method).toUpperCase();
  if (wanted && !METHODS.includes(wanted)) return fail(400, 'Choose BANK or UPI.', { payout_method_required: true, payout_methods: names });
  if (wanted) {
    if (saved[wanted]) return { ok: true, destination: saved[wanted] };
    return fail(400, wanted === 'BANK' ? 'Please add your bank account first.' : 'Please add your UPI ID first.', { payment_details_required: true, payout_methods: names });
  }
  if (names.length > 1) return fail(400, 'Choose where to receive the money: bank account or UPI.', { payout_method_required: true, payout_methods: names });
  return { ok: true, destination: saved[names[0]] };
}

// ── Showing ─────────────────────────────────────────────────────────────────

function maskAccount(value) {
  const s = clean(value);
  if (!s) return null;
  return '•'.repeat(Math.max(s.length - 4, 4)) + s.slice(-4);
}
/** A withdrawal's payout_details without the full account number (for the app). */
const maskDestination = (d) => (d && d.account_number ? { ...d, account_number: maskAccount(d.account_number) } : d || null);

/** What the app gets. `network` is the one withdrawals are paid on. */
function publicDetails(details, network) {
  const d = details && typeof details.toObject === 'function' ? details.toObject() : details || {};
  const saved = inrDestinations(d);
  const problem = usdtProblem(d, network);
  const address = clean(d.usdt_wallet_address) || null;
  return {
    otp_required: config.PAYOUT_DETAILS_OTP,
    otp_purpose: OTP_PURPOSE,
    inr: {
      ready: METHODS.some((m) => saved[m]),
      methods: METHODS.filter((m) => saved[m]),
      bank: saved.BANK ? { account_holder_name: saved.BANK.account_holder_name, account_number_masked: maskAccount(saved.BANK.account_number), ifsc_code: saved.BANK.ifsc_code, bank_name: saved.BANK.bank_name } : null,
      upi: saved.UPI ? { upi_id: saved.UPI.upi_id, name: saved.UPI.account_holder_name } : null,
      // older app builds
      upi_id: clean(d.upi_id) || null,
      account_holder_name: clean(d.account_holder_name) || (saved.UPI && saved.UPI.account_holder_name) || null,
      account_number: maskAccount(d.account_number),
      ifsc_code: clean(d.ifsc_code) || null,
      bank_name: clean(d.bank_name) || null,
    },
    usdt: { ready: !problem, usdt_wallet_address: address, network, problem: address ? problem : null },
  };
}

// ── Saving ──────────────────────────────────────────────────────────────────

function checkBank(b) {
  const errors = {};
  const holder = clean(b.account_holder_name);
  const account = clean(b.account_number);
  const ifsc = clean(b.ifsc_code).toUpperCase();
  const bank = clean(b.bank_name);
  if (!holder) errors.account_holder_name = 'Enter the account holder name.';
  else if (holder.length > 100) errors.account_holder_name = 'Name is too long.';
  if (!/^\d{6,20}$/.test(account)) errors.account_number = 'Account number must be 6–20 digits.';
  else if (b.account_number_confirmation !== undefined && clean(b.account_number_confirmation) !== account) errors.account_number_confirmation = 'Account numbers do not match.';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) errors.ifsc_code = 'Enter a valid IFSC code, e.g. HDFC0001234.';
  if (bank.length > 100) errors.bank_name = 'Bank name is too long.';
  return { errors, set: { account_holder_name: holder, account_number: account, ifsc_code: ifsc, bank_name: bank || null } };
}
function checkUpi(b, current) {
  const errors = {};
  const upi = clean(b.upi_id);
  const name = clean(b.name !== undefined ? b.name : b.upi_holder_name);
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upi)) errors.upi_id = 'Enter a valid UPI ID, e.g. name@bank.';
  if (name.length > 100) errors.name = 'Name is too long.';
  // Keep the name an older save kept in the shared field.
  return { errors, set: { upi_id: upi, upi_holder_name: name || (clean(current.upi_id) === upi ? clean(current.upi_holder_name) || null : null) } };
}
function checkUsdt(b, network) {
  const address = clean(b.usdt_wallet_address);
  const problem = addressProblem(address, network);
  return {
    errors: problem ? { usdt_wallet_address: problem } : {},
    set: { usdt_wallet_address: address, usdt_network: network, usdt_saved_network: network },
  };
}
const EMPTY = {
  bank: { account_holder_name: null, account_number: null, ifsc_code: null, bank_name: null },
  upi: { upi_id: null, upi_holder_name: null },
  usdt: { usdt_wallet_address: '', usdt_saved_network: null },
};

/** The OTP check. Runs after validation, so a rejected form does not use up the code. */
async function checkOtp(user, otp) {
  if (!config.PAYOUT_DETAILS_OTP) return { ok: true };
  const mobile = clean(user.mobile);
  if (!mobile) return fail(400, 'Add a mobile number to your profile first.');
  if (!clean(otp)) {
    return fail(403, 'Verify with the OTP sent to your registered mobile.', { otp_required: true, otp_purpose: OTP_PURPOSE });
  }
  const result = await otpService.verifyOtp(mobile, OTP_PURPOSE, otp);
  if (result.ok) return result;
  return fail(result.status, result.message, { otp_invalid: true, ...(result.attempts_remaining !== undefined ? { attempts_remaining: result.attempts_remaining } : {}) });
}

/**
 * Saves or removes any of bank / upi / usdt. A part left out is not touched; null removes it.
 * @param {object} user  user document (lean or hydrated)
 * @param {{ bank?:object|null, upi?:object|null, usdt?:object|null }} parts
 * @returns {Promise<{ ok:true, details:object } | { ok:false, status:number, message:string, errors?:object }>}
 */
async function save(user, parts, otp) {
  const network = await settings.getWithdrawalNetwork();
  const current = (user.payment_details && typeof user.payment_details.toObject === 'function' ? user.payment_details.toObject() : user.payment_details) || {};
  const errors = {};
  const set = {};
  Object.keys(EMPTY).filter((name) => parts[name] !== undefined).forEach((name) => {
    if (parts[name] === null) { Object.assign(set, EMPTY[name]); return; }
    const result = name === 'bank' ? checkBank(parts.bank) : name === 'upi' ? checkUpi(parts.upi, current) : checkUsdt(parts.usdt, network);
    Object.assign(errors, result.errors);
    Object.assign(set, result.set);
  });
  if (!Object.keys(set).length) return fail(422, 'Enter your bank account, UPI ID or USDT address.', { errors: {} });
  if (Object.keys(errors).length) return fail(422, Object.values(errors)[0], { errors });

  // A UPI saved with the old shared name keeps that name when a bank account takes the field over.
  const upiKeepsName = set.account_number && !('upi_id' in set) && clean(current.upi_id) && !clean(current.upi_holder_name) && !clean(current.account_number);
  if (upiKeepsName) set.upi_holder_name = clean(current.account_holder_name) || null;

  const verified = await checkOtp(user, otp);
  if (!verified.ok) return verified;
  await User.updateOne({ _id: user._id, payment_details: null }, { $set: { payment_details: {} } }); // dotted paths need an object
  await User.updateOne({ _id: user._id }, { $set: Object.fromEntries(Object.entries(set).map(([k, v]) => [`payment_details.${k}`, v])) });
  return { ok: true, details: publicDetails({ ...current, ...set }, network) };
}

/** The older POST /payout-details/inr body: UPI and / or bank in one form. */
function partsFromInrForm(body) {
  const upi = clean(body.upi_id);
  const bank = clean(body.account_number) || clean(body.ifsc_code);
  return {
    ...(upi ? { upi: { upi_id: upi, name: body.account_holder_name } } : {}),
    ...(bank ? { bank: body } : {}),
  };
}

module.exports = {
  OTP_PURPOSE, save, partsFromInrForm, publicDetails, chooseInr, inrDestinations, usdtProblem, addressProblem, isTronAddress, maskAccount, maskDestination,
};
