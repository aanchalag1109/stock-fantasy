'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: KYC section in the admin panel (client feedback)
 * Purpose: Everything behind Admin → KYC: filters, list, "not submitted" players, automatic checks
 *          (number formats, duplicates, missing documents), review decisions with history, documents.
 *
 *   - user_id on a submission may be an ObjectId, its string, or the legacy numeric id; players are
 *     looked up by any of them (a populate() fails on the numeric ones).
 *   - The list and the export show the last 4 characters of a number; only the details page shows it in full.
 *   - A decision is applied only to the submission the admin looked at: if the player resubmits meanwhile,
 *     it is refused.
 */

const fs = require('fs');
const path = require('path');
const KycSubmission = require('../models/kyc-submission.model');
const User = require('../models/user.model');
const { docsByIds, mask } = require('./admin-user-profile.service');
const { istDay, csvCell, istDateTime } = require('./admin-user-export.service');
const settings = require('./deposit-withdrawal-settings.service');

const STATUSES = ['pending', 'approved', 'rejected'];
const TABS = ['', ...STATUSES, 'not_submitted'];
const PAGE_SIZES = [20, 50, 100];
const EXPORT_MAX = 20000;
const EXPORT_BATCH = 500;
const PUBLIC_DIR = path.join(__dirname, '../../public');

/** Documents a submission can hold. `key` is the model field and the name used in document links. */
const DOCUMENTS = [
  { key: 'aadhar_front', label: 'Aadhaar front' },
  { key: 'aadhar_back', label: 'Aadhaar back' },
  { key: 'pan_image', label: 'PAN card' },
  { key: 'selfie', label: 'Selfie' },
  // PHP submissions: one document + selfie
  { key: 'front_image', label: 'Document front', legacy: true },
  { key: 'back_image', label: 'Document back', legacy: true, optional: true },
  { key: 'selfie_image', label: 'Selfie', legacy: true },
];
const REJECT_REASONS = [
  'Document image is blurred or unreadable',
  'Document is cropped or incomplete',
  'Aadhaar number does not match the document',
  'PAN number does not match the document',
  'Name does not match the documents',
  'Selfie does not match the document photo',
  'Document is expired or not valid',
  'Wrong document uploaded',
  'These documents are already used by another account',
  'Player is under 18',
];

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (field) => ({ [field]: { $nin: [null, ''] } });
const lacks = (field) => ({ [field]: { $in: [null, ''] } });

// ── Numbers ─────────────────────────────────────────────────────────────────

const compact = (v) => String(v == null ? '' : v).replace(/[\s-]/g, '').toUpperCase();

/** Aadhaar / PAN of a submission, without spaces; PHP rows keep one document in document_type / _number. */
function numbersOf(s) {
  const type = String(s.document_type || '');
  return {
    aadhaar: compact(s.aadhar_number) || (/aad/i.test(type) ? compact(s.document_number) : ''),
    pan: compact(s.pan_number) || (/\bpan\b/i.test(type) ? compact(s.document_number) : ''),
  };
}

const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
/** 12 digits, first 2–9, with UIDAI's Verhoeff check digit. */
function isAadhaar(value) {
  const n = compact(value);
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  return [...n].reverse().reduce((c, digit, i) => D[c][P[i % 8][Number(digit)]], 0) === 0;
}
/** An individual's PAN (4th letter P). */
const isPan = (value) => /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/.test(compact(value));

// ── Documents ───────────────────────────────────────────────────────────────

const isLegacy = (s) => Boolean(s.front_image || s.selfie_image) && !(s.aadhar_front || s.aadhar_back || s.pan_image || s.selfie);

/** The documents this submission should have, with whether each was uploaded. */
function documentsOf(s) {
  const legacy = isLegacy(s);
  return DOCUMENTS
    .filter((d) => Boolean(d.legacy) === legacy || s[d.key])
    .map((d) => ({ ...d, path: s[d.key] || null, uploaded: Boolean(s[d.key]) }));
}

/** Absolute path of an uploaded document, or null. Never outside public/uploads and public/storage. */
function documentFile(value) {
  const rel = str(value).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || /^https?:/i.test(rel) || rel.includes('\0')) return null;
  const roots = ['uploads', 'storage'].map((r) => path.join(PUBLIC_DIR, r) + path.sep);
  for (const candidate of [rel, `uploads/${rel}`, `uploads/kyc/${rel}`, `storage/${rel}`]) {
    const file = path.resolve(PUBLIC_DIR, candidate);
    if (roots.some((r) => file.startsWith(r)) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

const INLINE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };
/** Content type that is safe to show in the browser, or null (download only). */
const inlineType = (file) => INLINE_TYPES[path.extname(file || '').toLowerCase()] || null;

// ── Checks ──────────────────────────────────────────────────────────────────

/**
 * Submissions whose Aadhaar / PAN another player also used, and those with a wrong number.
 * @returns {Promise<{ duplicates: Map<string, object[]>, invalid: Set<string> }>}
 */
async function scanNumbers() {
  const rows = await KycSubmission.find({}).select('user_id aadhar_number pan_number document_type document_number status').lean();
  const groups = new Map();
  const invalid = new Set();
  rows.forEach((row) => {
    const n = numbersOf(row);
    if ((n.aadhaar && !isAadhaar(n.aadhaar)) || (n.pan && !isPan(n.pan))) invalid.add(String(row._id));
    [n.aadhaar && `Aadhaar ${n.aadhaar}`, n.pan && `PAN ${n.pan}`].filter(Boolean).forEach((key) => {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
  });
  const shared = [...groups].filter(([, list]) => list.length > 1);
  const players = await docsByIds(User, shared.flatMap(([, list]) => list.map((r) => r.user_id)), 'name mobile');
  const playerKey = (r) => { const u = players.get(String(r.user_id)); return u ? String(u._id) : `?${r.user_id}`; };
  const duplicates = new Map();
  shared.forEach(([key, list]) => {
    list.forEach((row) => {
      list.filter((other) => playerKey(other) !== playerKey(row)).forEach((other) => {
        const id = String(row._id);
        if (!duplicates.has(id)) duplicates.set(id, []);
        duplicates.get(id).push({ what: key.split(' ')[0], submission: other, player: players.get(String(other.user_id)) || null });
      });
    });
  });
  return { duplicates, invalid };
}

/** Things the reviewer should look at: [{ key, text }]. */
function issuesOf(s, scan) {
  const n = numbersOf(s);
  const issues = [];
  const missing = documentsOf(s).filter((d) => !d.uploaded && !d.optional).map((d) => d.label);
  if (missing.length) issues.push({ key: 'missing', text: `Not uploaded: ${missing.join(', ')}` });
  if (!n.aadhaar && !n.pan) issues.push({ key: 'no_number', text: 'No Aadhaar or PAN number' });
  if (n.aadhaar && !isAadhaar(n.aadhaar)) issues.push({ key: 'invalid', text: 'Aadhaar number is not valid' });
  if (n.pan && !isPan(n.pan)) issues.push({ key: 'invalid', text: 'PAN is not a valid individual PAN' });
  const dup = scan.duplicates.get(String(s._id)) || [];
  [...new Set(dup.map((d) => d.what))].forEach((what) => issues.push({ key: 'duplicate', text: `${what} is also used by another player` }));
  return issues;
}

// ── Filters ─────────────────────────────────────────────────────────────────

const DOCUMENT_FILTERS = {
  complete: 'All documents uploaded',
  incomplete: 'Some documents missing',
  none: 'No documents',
  missing_aadhaar: 'Aadhaar image missing',
  missing_pan: 'PAN image missing',
  missing_selfie: 'Selfie missing',
};
const NUMBER_FILTERS = { aadhaar: 'Aadhaar given', pan: 'PAN given', both: 'Aadhaar and PAN given', none: 'No number given' };
const ISSUE_FILTERS = { duplicate: 'Same number used by another player', invalid: 'Wrong Aadhaar / PAN number' };
const WAITING_FILTERS = { 1: 'More than 1 day', 3: 'More than 3 days', 7: 'More than 7 days' };
const SORTS = { newest: 'Newest first', oldest: 'Oldest first', reviewed: 'Recently reviewed' };

/** The page's filters from the query string; anything unknown becomes empty. */
function parseFilters(query = {}) {
  const pick = (name, allowed) => (Object.prototype.hasOwnProperty.call(allowed, str(query[name])) ? str(query[name]) : '');
  const day = (name) => (istDay(str(query[name])) ? str(query[name]) : '');
  const f = {
    status: TABS.includes(str(query.status)) ? str(query.status) : '',
    search: str(query.search).slice(0, 100),
    from: day('from'),
    to: day('to'),
    reviewed_from: day('reviewed_from'),
    reviewed_to: day('reviewed_to'),
    documents: pick('documents', DOCUMENT_FILTERS),
    numbers: pick('numbers', NUMBER_FILTERS),
    issue: pick('issue', ISSUE_FILTERS),
    waiting: pick('waiting', WAITING_FILTERS),
    reviewer: str(query.reviewer).slice(0, 200),
    sort: pick('sort', SORTS) || 'newest',
    per_page: PAGE_SIZES.includes(Number(query.per_page)) ? Number(query.per_page) : PAGE_SIZES[0],
  };
  if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];
  if (f.reviewed_from && f.reviewed_to && f.reviewed_from > f.reviewed_to) [f.reviewed_from, f.reviewed_to] = [f.reviewed_to, f.reviewed_from];
  return f;
}

/** Query string of the filters; `changes` override them. Defaults are left out. */
function queryString(filters, changes = {}) {
  const params = new URLSearchParams();
  Object.entries({ ...filters, ...changes }).forEach(([k, v]) => {
    if (v === '' || v == null || (k === 'sort' && v === 'newest') || (k === 'per_page' && v === PAGE_SIZES[0])) return;
    params.set(k, String(v));
  });
  return params.toString();
}

function range(from, to) {
  const r = {};
  if (from) r.$gte = istDay(from, false);
  if (to) r.$lte = istDay(to, true);
  return Object.keys(r).length ? r : null;
}

function playerSearch(search) {
  const rx = new RegExp(escapeRegex(search), 'i');
  const or = [{ name: rx }, { email: rx }, { mobile: rx }];
  if (/^\d{1,9}$/.test(search)) or.push({ old_id: Number(search) });
  if (/^[0-9a-f]{24}$/i.test(search)) or.push({ _id: search });
  return or;
}
/** Every value user_id may hold for this player. */
const userKeys = (u) => [u._id, String(u._id), ...(u.old_id != null ? [u.old_id, String(u.old_id)] : [])];

/** Mongo filter for submissions; the status is left out so the tab counts can use the same filter. */
async function submissionMatch(f, scan) {
  const and = [];
  if (f.search) {
    const users = await User.find({ $or: playerSearch(f.search) }).select('_id old_id').limit(5000).lean();
    const or = [{ user_id: { $in: users.flatMap(userKeys) } }];
    const number = compact(f.search);
    if (/^[A-Z0-9]{4,}$/.test(number)) {
      const rx = new RegExp([...number].join('[\\s-]*'), 'i');
      or.push({ aadhar_number: rx }, { pan_number: rx }, { document_number: rx });
    }
    and.push({ $or: or });
  }
  // submitted_at exists since resubmissions are tracked; older rows have created_at only.
  const submitted = (r) => ({ $or: [{ submitted_at: r }, { submitted_at: null, created_at: r }] });
  const dates = range(f.from, f.to);
  if (dates) and.push(submitted(dates));
  const reviewed = range(f.reviewed_from, f.reviewed_to);
  if (reviewed) and.push({ reviewed_at: reviewed });
  if (f.waiting) and.push({ status: 'pending' }, submitted({ $lt: new Date(Date.now() - Number(f.waiting) * 86400000) }));
  if (f.reviewer) and.push({ reviewed_by: f.reviewer });

  const complete = {
    $or: [
      { $and: ['aadhar_front', 'aadhar_back', 'pan_image', 'selfie'].map(has) },
      { $and: ['front_image', 'selfie_image'].map(has) },
    ],
  };
  if (f.documents === 'complete') and.push(complete);
  if (f.documents === 'incomplete') and.push({ $nor: [complete] });
  if (f.documents === 'none') and.push(...DOCUMENTS.map((d) => lacks(d.key)));
  if (f.documents === 'missing_aadhaar') and.push(lacks('front_image'), { $or: [lacks('aadhar_front'), lacks('aadhar_back')] });
  if (f.documents === 'missing_pan') and.push(lacks('front_image'), lacks('pan_image'));
  if (f.documents === 'missing_selfie') and.push(lacks('selfie'), lacks('selfie_image'));

  const aadhaar = { $or: [has('aadhar_number'), { $and: [{ document_type: /aad/i }, has('document_number')] }] };
  const pan = { $or: [has('pan_number'), { $and: [{ document_type: /\bpan\b/i }, has('document_number')] }] };
  if (f.numbers === 'aadhaar') and.push(aadhaar);
  if (f.numbers === 'pan') and.push(pan);
  if (f.numbers === 'both') and.push(aadhaar, pan);
  if (f.numbers === 'none') and.push({ $nor: [aadhaar, pan] });

  if (f.issue === 'duplicate') and.push({ _id: { $in: [...scan.duplicates.keys()] } });
  if (f.issue === 'invalid') and.push({ _id: { $in: [...scan.invalid] } });
  return and.length ? { $and: and } : {};
}

/** Players (not admins, not bots) without any submission; dates are their joining date. */
async function notSubmittedMatch(f) {
  const ids = (await KycSubmission.distinct('user_id')).filter((v) => v != null).map(String);
  const match = {
    is_test_user: { $ne: true },
    is_admin: { $ne: true },
    _id: { $nin: ids.filter((v) => /^[0-9a-f]{24}$/i.test(v)) },
    old_id: { $nin: ids.filter((v) => /^\d{1,15}$/.test(v)).map(Number) },
  };
  if (f.search) match.$or = playerSearch(f.search);
  const dates = range(f.from, f.to);
  if (dates) match.created_at = dates;
  return match;
}

function sortOf(f) {
  if (f.sort === 'reviewed') return { reviewed_at: -1, _id: -1 };
  const d = f.sort === 'oldest' ? 1 : -1;
  return { submitted_at: d, created_at: d, _id: d }; // rows without submitted_at are older than all others
}

const PLAYER_FIELDS = 'name mobile email kyc_status is_test_user old_id created_at';
const submittedAt = (s) => s.submitted_at || s.created_at || null;

async function submissionRows(match, f, skip, limit, scan) {
  const rows = await KycSubmission.find(match).sort(sortOf(f)).skip(skip).limit(limit).lean();
  const players = await docsByIds(User, rows.map((r) => r.user_id), PLAYER_FIELDS);
  return rows.map((r) => {
    const n = numbersOf(r);
    const docs = documentsOf(r);
    return {
      ...r,
      player: players.get(String(r.user_id)) || null,
      aadhaar_masked: mask(n.aadhaar),
      pan_masked: mask(n.pan),
      submitted: submittedAt(r),
      documents_uploaded: docs.filter((d) => d.uploaded).length,
      documents_total: docs.length,
      issues: issuesOf(r, scan),
    };
  });
}

const playerRows = (match, f, skip, limit) => {
  const d = f.sort === 'oldest' ? 1 : -1;
  return User.find(match).sort({ created_at: d, _id: d }).skip(skip).limit(limit).select(PLAYER_FIELDS).lean();
};

const withStatus = (match, status) => (status ? { $and: [match, { status }] } : match);

/** Everything the list page shows. */
async function list(query) {
  const f = parseFilters(query);
  const scan = await scanNumbers();
  const [base, missing] = await Promise.all([submissionMatch(f, scan), notSubmittedMatch(f)]);
  const [all, pending, approved, rejected, notSubmitted, reviewers] = await Promise.all([
    KycSubmission.countDocuments(base),
    ...STATUSES.map((s) => KycSubmission.countDocuments(withStatus(base, s))),
    User.countDocuments(missing),
    KycSubmission.distinct('reviewed_by'),
  ]);
  const counts = { '': all, pending, approved, rejected, not_submitted: notSubmitted };
  const total = counts[f.status];
  const pages = Math.max(Math.ceil(total / f.per_page), 1);
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), pages);
  const skip = (page - 1) * f.per_page;
  const rows = f.status === 'not_submitted'
    ? await playerRows(missing, f, skip, f.per_page)
    : await submissionRows(withStatus(base, f.status), f, skip, f.per_page, scan);
  return { filters: f, counts, rows, total, page, pages, reviewers: reviewers.filter(Boolean).sort() };
}

// ── Export ──────────────────────────────────────────────────────────────────

const CSV_HEADER = ['KYC ID', 'Player ID', 'Name', 'Mobile', 'Email', 'Status', 'Aadhaar (last 4)', 'PAN (last 4)', 'Documents', 'To check', 'Rejection Reason', 'Submitted (IST)', 'Reviewed (IST)', 'Reviewed By'];
const last4 = (masked) => (masked ? masked.slice(-4) : '');
const idOf = (doc) => (doc.old_id != null ? doc.old_id : String(doc._id));

/** Writes the filtered rows as CSV. Numbers: last 4 characters only. Returns the number of rows. */
async function exportCsv(query, write) {
  const f = parseFilters(query);
  const line = (cells) => `${cells.map(csvCell).join(',')}\r\n`;
  write(`﻿${line(CSV_HEADER)}`);
  const players = f.status === 'not_submitted';
  const scan = players ? null : await scanNumbers();
  const match = players ? await notSubmittedMatch(f) : withStatus(await submissionMatch(f, scan), f.status);
  let done = 0;
  while (done < EXPORT_MAX) {
    // eslint-disable-next-line no-await-in-loop
    const rows = players ? await playerRows(match, f, done, EXPORT_BATCH) : await submissionRows(match, f, done, EXPORT_BATCH, scan);
    write(rows.map((r) => {
      if (players) return line(['', idOf(r), r.name, r.mobile, r.email, 'not submitted', '', '', '', '', '', '', '', '']);
      const u = r.player || {};
      return line([
        idOf(r), r.player ? idOf(u) : String(r.user_id || ''), u.name, u.mobile, u.email, r.status,
        last4(r.aadhaar_masked), last4(r.pan_masked), `${r.documents_uploaded} of ${r.documents_total}`, r.issues.map((i) => i.text).join('; '),
        r.rejection_reason, istDateTime(r.submitted), istDateTime(r.reviewed_at), r.reviewed_by,
      ]);
    }).join(''));
    done += rows.length;
    if (rows.length < EXPORT_BATCH) break;
  }
  return done;
}

// ── Details ─────────────────────────────────────────────────────────────────

/** Identifies the version of a submission the admin is looking at. */
const versionOf = (s) => String(submittedAt(s) ? new Date(submittedAt(s)).getTime() : 0);

async function findSubmission(id) {
  const text = String(id || '').trim();
  if (/^[0-9a-f]{24}$/i.test(text)) return KycSubmission.findById(text).lean();
  if (/^\d{1,15}$/.test(text)) return KycSubmission.findOne({ old_id: Number(text) }).lean();
  return null;
}

async function playerOf(submission) {
  const map = await docsByIds(User, [submission.user_id], 'name mobile email email_verified_at gender age profile_image kyc_status is_test_user payment_details.account_holder_name created_at');
  return map.get(String(submission.user_id)) || null;
}

/** Players (other than this one) whose profile carries the same number. */
async function profilesWith(numbers, exclude) {
  const variants = (n) => [n, n.toLowerCase(), n.replace(/(.{4})(?=.)/g, '$1 '), n.replace(/(.{4})(?=.)/g, '$1-')];
  const or = [
    ...(numbers.aadhaar ? [{ aadhar: { $in: variants(numbers.aadhaar) } }] : []),
    ...(numbers.pan ? [{ pan: { $in: variants(numbers.pan) } }] : []),
  ];
  const users = or.length ? await User.find({ $or: or }).select('name mobile old_id').limit(20).lean() : [];
  return users.filter((u) => !exclude.has(String(u._id)));
}

/** The player's latest submission, or null. */
const latestFor = (user) => KycSubmission.findOne({ user_id: { $in: userKeys(user) } }).sort({ created_at: -1 }).lean();

/**
 * Where the player stands. An unsubmitted KYC is 'pending' on the profile, so the submission decides.
 * @returns {'approved'|'pending'|'rejected'|'not_submitted'}
 */
function stateOf(user, submission) {
  // PHP approved the submission without updating the profile.
  if (user.kyc_status === 'approved' || (submission && submission.status === 'approved' && user.kyc_status !== 'rejected')) return 'approved';
  if (!submission) return 'not_submitted';
  return submission.status === 'pending' ? 'pending' : 'rejected';
}

/**
 * May this player withdraw, as far as KYC is concerned? (client feedback: approved KYC is required)
 * @returns {Promise<{ ok:true } | { ok:false, status:number, message:string, kyc_required:true, kyc_state:string }>}
 */
async function checkWithdrawal(user) {
  if (user.kyc_status === 'approved' || !(await settings.isKycRequired())) return { ok: true };
  const submission = await latestFor(user);
  const state = stateOf(user, submission);
  if (state === 'approved') return { ok: true };
  const message = {
    not_submitted: 'Please complete your KYC before withdrawing.',
    pending: 'Your KYC is being reviewed. You can withdraw once it is approved.',
    rejected: `Your KYC was rejected${submission && submission.rejection_reason ? `: ${submission.rejection_reason.replace(/\.$/, '')}` : ''}. Please submit it again to withdraw.`,
  }[state];
  return { ok: false, status: 403, message, kyc_required: true, kyc_state: state };
}

/** Everything the details page shows, or null. */
async function details(id) {
  const submission = await findSubmission(id);
  if (!submission) return null;
  const [player, scan] = await Promise.all([playerOf(submission), scanNumbers()]);
  const numbers = numbersOf(submission);
  const duplicates = scan.duplicates.get(String(submission._id)) || [];
  const known = new Set([player ? String(player._id) : '', ...duplicates.map((d) => (d.player ? String(d.player._id) : ''))]);
  const [others, profileDuplicates, next] = await Promise.all([
    KycSubmission.find({ user_id: { $in: player ? userKeys(player) : [submission.user_id] }, _id: { $ne: submission._id } }).sort({ created_at: -1 }).limit(10).lean(),
    profilesWith(numbers, known),
    KycSubmission.find({ status: 'pending', _id: { $ne: submission._id } }).sort({ submitted_at: 1, created_at: 1, _id: 1 }).limit(1).select('_id').lean(),
  ]);

  const issues = issuesOf(submission, scan);
  if (profileDuplicates.length) issues.push({ key: 'duplicate', text: 'The number is on another player’s profile' });
  const documents = documentsOf(submission).map((d) => {
    const file = d.uploaded ? documentFile(d.path) : null;
    const type = file ? inlineType(file) : null;
    const view = !type ? 'download' : (type === 'application/pdf' ? 'pdf' : 'image');
    return { ...d, found: Boolean(file), view };
  });
  const lost = documents.filter((d) => d.uploaded && !d.found).map((d) => d.label);
  if (lost.length) issues.push({ key: 'file', text: `File not found on this server: ${lost.join(', ')}` });
  if (player && player.age != null && player.age < 18) issues.push({ key: 'age', text: `Age on the profile is ${player.age}` });

  return {
    submission,
    player,
    numbers,
    issues,
    duplicates,
    profileDuplicates,
    documents,
    checks: { aadhaar: numbers.aadhaar ? isAadhaar(numbers.aadhaar) : null, pan: numbers.pan ? isPan(numbers.pan) : null },
    others,
    submitted: submittedAt(submission),
    version: versionOf(submission),
    nextPending: next[0] ? String(next[0]._id) : null,
  };
}

// ── Review ──────────────────────────────────────────────────────────────────

const FROM = { approved: ['pending', 'rejected'], rejected: ['pending', 'approved'] };

/**
 * Approves or rejects a submission. Rejecting an approved one withdraws the approval.
 * @param {{ status:'approved'|'rejected', reason?:string, note?:string, version?:string, acceptDuplicate?:boolean, admin:string }} d
 * @returns {Promise<{ ok:true, submission:object, player:object|null, at:Date } | { ok:false, message:string }>}
 */
async function review(id, d) {
  const current = await findSubmission(id);
  if (!current) return { ok: false, message: 'KYC submission not found.' };
  const status = current.status || 'pending';
  if (!FROM[d.status].includes(status)) return { ok: false, message: `This KYC is already ${status}.` };
  if (d.version && d.version !== versionOf(current)) {
    return { ok: false, message: 'The player submitted new details after you opened this page. Please check them and decide again.' };
  }
  const reason = str(d.reason).slice(0, 500);
  if (d.status === 'rejected' && !reason) return { ok: false, message: 'Choose or write the reason for rejecting. The player sees it.' };
  const player = await playerOf(current);
  if (d.status === 'approved' && !d.acceptDuplicate) {
    const shared = (await scanNumbers()).duplicates.has(String(current._id))
      || (await profilesWith(numbersOf(current), new Set([player ? String(player._id) : '']))).length > 0;
    if (shared) return { ok: false, message: 'The Aadhaar or PAN is also used by another player. Tick the confirmation before approving.' };
  }
  const at = new Date();
  const note = str(d.note).slice(0, 1000) || null;
  const rejection = d.status === 'rejected' ? reason : null;
  const before = await KycSubmission.findOneAndUpdate(
    { _id: current._id, status: current.status, submitted_at: current.submitted_at || null }, // not changed meanwhile
    {
      $set: { status: d.status, rejection_reason: rejection, reviewed_at: at, reviewed_by: d.admin, review_note: note },
      $push: { history: { action: d.status, from: status, at, by: d.admin, reason: rejection, note } },
    },
  );
  if (!before) return { ok: false, message: 'This KYC changed while you were reviewing it. Please check it again.' };
  if (player) await User.updateOne({ _id: player._id }, { $set: { kyc_status: d.status } });
  return { ok: true, submission: { ...current, status: d.status, rejection_reason: rejection }, player, at };
}

const pendingCount = () => KycSubmission.countDocuments({ status: 'pending' });

module.exports = {
  DOCUMENTS,
  REJECT_REASONS,
  DOCUMENT_FILTERS,
  NUMBER_FILTERS,
  ISSUE_FILTERS,
  WAITING_FILTERS,
  SORTS,
  PAGE_SIZES,
  list,
  details,
  review,
  exportCsv,
  pendingCount,
  findSubmission,
  parseFilters,
  queryString,
  documentFile,
  inlineType,
  documentsOf,
  numbersOf,
  compact,
  isAadhaar,
  isPan,
  userKeys,
  latestFor,
  stateOf,
  checkWithdrawal,
};
