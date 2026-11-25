'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * KYC section (client feedback): filters, "not submitted" players, checks, masking, documents that are
 * not public, review rules (reason, duplicates, resubmitted meanwhile), history, export, and the app's
 * submit / status endpoints. Real Express apps on in-memory models.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const AdminRole = require('../../src/models/admin-role.model');
const KycSubmission = require('../../src/models/kyc-submission.model');
const Setting = require('../../src/models/setting.model');
const WithdrawalRequest = require('../../src/models/withdrawal-request.model');
const Transaction = require('../../src/models/transaction.model');
const notifications = require('../../src/services/notifications/notification.service');

const notified = [];
notifications.notify = (event, data) => { notified.push({ event, ...data }); }; // before the controllers load it
const kyc = require('../../src/services/kyc.service');
const { isPrivate } = require('../../src/helpers/private-uploads');
const adminApp = require('../../src/admin/app');
const api = require('../../src/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;
const AADHAAR = '234123412346';
const PAN = 'ABCPE1234F';
const HASH = bcrypt.hashSync('secret123', 4);
const day = (n) => new Date(Date.now() - n * 86400000);

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
const same = (a, b) => (a == null && b == null) || (a != null && b != null && typeof a !== 'number' && String(a) === String(b)) || a === b;
const isOps = (c) => c && typeof c === 'object' && !(c instanceof ObjectId) && !(c instanceof Date) && !(c instanceof RegExp);
const matches = (doc, f = {}) => Object.entries(f).every(([k, c]) => {
  if (k === '$and') return c.every((x) => matches(doc, x));
  if (k === '$or') return c.some((x) => matches(doc, x));
  if (k === '$nor') return !c.some((x) => matches(doc, x));
  const v = doc[k];
  if (c instanceof RegExp) return v != null && c.test(String(v));
  if (!isOps(c)) return same(v, c);
  return Object.entries(c).every(([op, arg]) => {
    if (op === '$in') return arg.some((a) => same(v, a));
    if (op === '$nin') return !arg.some((a) => same(v, a));
    if (op === '$ne') return !same(v, arg);
    if (op === '$gte') return v != null && v >= arg;
    if (op === '$lte') return v != null && v <= arg;
    if (op === '$lt') return v != null && v < arg;
    throw new Error(`unsupported ${op}`);
  });
});
function chain(rows, one) {
  let out = rows;
  const q = {
    select: () => q, lean: () => q, populate: () => q,
    sort: (spec) => {
      out = [...out].sort((a, b) => {
        for (const [k, d] of Object.entries(spec)) {
          const [x, y] = [a[k], b[k]].map((v) => (v == null ? '' : v instanceof Date ? v.getTime() : String(v)));
          if (x !== y) return x > y ? d : -d;
        }
        return 0;
      });
      return q;
    },
    skip: (n) => { out = out.slice(n); return q; },
    limit: (n) => { out = out.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(one ? (out[0] ? { ...out[0] } : null) : out.map((d) => ({ ...d }))).then(a, b),
  };
  return q;
}
function stub(M, name) {
  const rows = (f) => db[name].filter((d) => matches(d, f));
  const update = (d, u) => {
    Object.assign(d, u.$set || {});
    Object.entries(u.$push || {}).forEach(([k, v]) => { d[k] = [...(d[k] || []), v]; });
  };
  M.find = (f) => chain(rows(f));
  M.findOne = (f) => chain(rows(f), true);
  M.findById = (id) => chain(rows({ _id: id }), true);
  M.countDocuments = async (f) => rows(f).length;
  M.distinct = async (k) => [...new Set(db[name].map((d) => d[k]))];
  M.create = async (d) => { const row = { _id: new ObjectId(), created_at: new Date(), ...d }; db[name].push(row); return row; };
  M.updateOne = async (f, u) => { const d = rows(f)[0]; if (d) update(d, u); return { modifiedCount: d ? 1 : 0 }; };
  M.findOneAndUpdate = async (f, u) => { const d = rows(f)[0]; if (!d) return null; const before = { ...d }; update(d, u); return before; };
}
[[User, 'users'], [AdminRole, 'roles'], [KycSubmission, 'kyc']].forEach(([M, n]) => stub(M, n));

const images = { aadhar_front: 'uploads/kyc/a.png', aadhar_back: 'uploads/kyc/b.png', pan_image: 'uploads/kyc/c.png', selfie: 'uploads/kyc/d.png' };
let K;
function reset() {
  notified.length = 0;
  settingRows = { min_withdrawal_amount: 100, max_withdrawal_amount: 20000, usdt_min_withdrawal_amount: 5, usdt_max_withdrawal_amount: 1000 };
  const role = { _id: new ObjectId(), name: 'Viewer', permissions: ['kyc.view'] };
  const player = (name, extra) => ({ _id: new ObjectId(), name, mobile: `98${name}`, email: `${name}@p.test`, created_at: day(30), is_admin: false, kyc_status: 'pending', ...extra });
  db = {
    roles: [role],
    users: [
      { _id: new ObjectId(), name: 'Super', email: 'super@a.test', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), name: 'Viewer', email: 'viewer@a.test', password: HASH, is_admin: true, admin_role_id: role._id },
      player('Asha', { old_id: 41 }), player('Ben', { old_id: 42 }), player('Dev', { old_id: 44 }), player('Eve', { old_id: 45 }), player('Bot', { is_test_user: true }),
    ],
  };
  const by = (n) => db.users.find((u) => u.name === n);
  K = {
    asha: { user_id: by('Asha')._id, aadhar_number: AADHAAR, pan_number: 'ASDPR4321K', ...images, status: 'pending', submitted_at: day(0.1), created_at: day(9), history: [] },
    ben: { user_id: 42, aadhar_number: '2341 2341 2346', pan_number: PAN, ...images, status: 'pending', created_at: day(5) },
    dev: { user_id: String(by('Dev')._id), document_type: 'PAN', document_number: 'WRONG', front_image: 'kyc_docs/x.jpg', selfie_image: 'kyc_docs/y.jpg', status: 'rejected', created_at: day(20), reviewed_at: day(8), reviewed_by: 'old@a.test' },
    none: { user_id: null, status: 'pending', created_at: day(2) },
  };
  Object.values(K).forEach((k) => { k._id = new ObjectId(); });
  db.kyc = Object.values(K);
}
async function login(who = 'super') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: `${who}@a.test`, password: 'secret123' });
  return agent;
}
const row = (k) => db.kyc.find((d) => same(d._id, K[k]._id));
const userOf = (name) => db.users.find((u) => u.name === name);
const names = async (q) => (await kyc.list(q)).rows.map((r) => (r.player ? r.player.name : r.name || '-')).sort().join();

let settingRows;
Setting.find = (f) => ({ lean: async () => { if (!settingRows) throw new Error('db down'); return Object.entries(settingRows).filter(([k]) => f.key.$in.includes(k)).map(([key, value]) => ({ key, value })); } });
Setting.findOne = () => chain([{ value: { inr_to_probcoin_rate: 10, usdt_to_probcoin_rate: 100 } }], true);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('numbers and filters', () => {
  test('Aadhaar check digit and individual PAN', () => {
    assert.deepEqual(['2341 2341 2346', '234123412347', '134123412346', '123'].map(kyc.isAadhaar), [true, false, false, false]);
    assert.deepEqual(['abcpe1234f', 'ABCDE1234F', 'ABCPE12345'].map(kyc.isPan), [true, false, false]);
  });

  test('unknown or non-text filters are ignored; dates are put in order', () => {
    const f = kyc.parseFilters({ status: 'x', search: { $ne: 1 }, documents: 'constructor', sort: ['a'], per_page: '7', from: '2026-11-20', to: '2026-11-01' });
    assert.deepEqual([f.status, f.search, f.documents, f.sort, f.per_page, f.from, f.to], ['', '', '', 'newest', 20, '2026-11-01', '2026-11-20']);
    assert.equal(kyc.queryString(f, { status: 'pending', from: '', to: '' }), 'status=pending');
  });
});

describe('list', () => {
  beforeEach(reset);
  const cases = {
    '': '-,Asha,Ben,Dev', 'status=pending': '-,Asha,Ben', 'status=rejected': 'Dev', 'status=approved': '', 'status=not_submitted': 'Eve',
    'search=ben': 'Ben', 'search=42': 'Ben', [`search=${AADHAAR}`]: 'Asha,Ben', 'search=abcpe': 'Ben', 'search=.*': '',
    'documents=complete': 'Asha,Ben,Dev', 'documents=incomplete': '-', 'documents=none': '-', 'documents=missing_selfie': '-',
    'numbers=both': 'Asha,Ben', 'numbers=pan': 'Asha,Ben,Dev', 'numbers=none': '-',
    'issue=duplicate': 'Asha,Ben', 'issue=invalid': 'Dev', 'waiting=1': '-,Ben', 'waiting=3': 'Ben', 'reviewer=old@a.test': 'Dev',
  };
  for (const [q, want] of Object.entries(cases)) {
    test(`filter: ${q || 'none'}`, async () => assert.equal(await names(Object.fromEntries(new URLSearchParams(q))), want));
  }

  test('tab counts follow the other filters; the submitted date is the latest submission', async () => {
    assert.deepEqual((await kyc.list({})).counts, { '': 4, pending: 3, approved: 0, rejected: 1, not_submitted: 1 });
    assert.deepEqual((await kyc.list({ search: 'ben' })).counts, { '': 1, pending: 1, approved: 0, rejected: 0, not_submitted: 0 });
    const ist = (d) => new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
    assert.equal(await names({ from: ist(day(10)), to: ist(day(8)) }), '', 'Asha first submitted then, but again today');
    assert.equal(await names({ from: ist(day(5)), to: ist(day(5)) }), 'Ben');
  });

  test('the page and the export show the last 4 characters only', async () => {
    const agent = await login();
    for (const q of ['', '?status=not_submitted', '?documents=incomplete&page=99']) {
      const res = await agent.get(`/kyc${q}`);
      assert.equal(res.status, 200, res.text);
      assert.doesNotMatch(res.text, /234123412346|2341 2341 2346|ABCPE1234F/);
    }
    const csv = (await agent.get('/kyc/export?status=pending')).text;
    assert.doesNotMatch(csv, /234123412346|2341 2341 2346|ABCPE1234F/);
    assert.equal(csv.trim().split('\r\n').length, 4);
    assert.deepEqual((await agent.get('/kyc/pending-count')).body, { count: 3 });
  });

  test('a role with View only: no export, no decisions', async () => {
    const agent = await login('viewer');
    const page = await agent.get('/kyc');
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /\/kyc\/export/);
    assert.equal((await agent.get('/kyc/export')).status, 403);
    assert.doesNotMatch((await agent.get(`/kyc/${K.ben._id}`)).text, /Approve KYC/);
    assert.equal((await agent.post(`/kyc/${K.ben._id}/approve`)).status, 403);
    assert.equal(row('ben').status, 'pending');
  });
});

describe('details and review', () => {
  beforeEach(reset);
  const send = async (k, what, body = {}) => (await login()).post(`/kyc/${K[k]._id}/${what}`).type('form').send(body);

  test('details: full numbers, player by numeric id, duplicates, missing files', async () => {
    const agent = await login();
    const page = (await agent.get(`/kyc/${K.ben._id}`)).text;
    assert.match(page, /2341 2341 2346/);
    assert.match(page, /ABCPE1234F/);
    assert.match(page, /Same number on other players[\s\S]*Asha/);
    assert.match(page, /File not found on this server/);
    for (const k of ['asha', 'dev', 'none']) assert.equal((await agent.get(`/kyc/${K[k]._id}`)).status, 200, k);
    assert.equal((await agent.get('/kyc/not-an-id')).headers.location, '/kyc');
  });

  test('approve: the duplicate must be confirmed; reviewer, note and history are kept', async () => {
    await send('ben', 'approve');
    assert.equal(row('ben').status, 'pending');
    await send('ben', 'approve', { accept_duplicate: '1', note: 'checked by phone' });
    assert.deepEqual([row('ben').status, row('ben').reviewed_by, row('ben').review_note, userOf('Ben').kyc_status], ['approved', 'super@a.test', 'checked by phone', 'approved']);
    assert.deepEqual([row('ben').history.length, row('ben').history[0].from], [1, 'pending']);
    assert.deepEqual(notified.map((n) => [n.event, String(n.user)]), [['kyc_approved', String(userOf('Ben')._id)]]);
    await send('ben', 'approve', { accept_duplicate: '1' });
    assert.equal(notified.length, 1, 'already approved');
  });

  test('reject: a reason is needed; an approval can be withdrawn', async () => {
    await send('asha', 'reject', { reason: ' ' });
    assert.equal(row('asha').status, 'pending');
    await send('asha', 'approve', { accept_duplicate: '1' });
    await send('asha', 'reject', { reason: 'Wrong document uploaded', reason_other: 'PAN of someone else', note: 'internal' });
    assert.deepEqual([row('asha').status, row('asha').rejection_reason, userOf('Asha').kyc_status], ['rejected', 'Wrong document uploaded: PAN of someone else', 'rejected']);
    assert.equal(notified[1].params.reason, 'Wrong document uploaded: PAN of someone else');
    assert.doesNotMatch(JSON.stringify(notified), /internal/);
  });

  test('a decision made on details the player has since replaced is refused', async () => {
    const version = String(new Date(row('asha').submitted_at).getTime());
    row('asha').submitted_at = new Date();
    await send('asha', 'approve', { version, accept_duplicate: '1' });
    assert.deepEqual([row('asha').status, notified.length], ['pending', 0]);
  });

  test('a submission without a player can still be closed', async () => {
    await send('none', 'reject', { reason: 'Wrong document uploaded' });
    assert.deepEqual([row('none').status, notified.length], ['rejected', 0]);
  });
});

describe('documents', () => {
  beforeEach(reset);

  test('not public, however the address is written', () => {
    for (const p of ['/uploads/kyc/a.png', '/uploads/%6byc/a.png', '/uploads//kyc/a.png', '/uploads/x/../kyc/a.png', '/UPLOADS/KYC/a.png', '/uploads\\kyc\\a.png', '/storage/kyc_docs/a.jpg']) assert.equal(isPrivate(p), true, p);
    for (const p of ['/uploads/banners/kyc-offer.png', '/uploads/profiles/a.png', '/kyc', '/kyc/1/document/selfie', '/api/v1/kyc/status']) assert.equal(isPrivate(p), false, p);
  });

  test('only files inside the uploads are opened; only known fields; login needed', async () => {
    for (const p of ['../../.env', 'uploads/../../package.json', '/etc/passwd', 'https://x.test/a.png', '', null]) assert.equal(kyc.documentFile(p), null, String(p));
    assert.deepEqual(['a.png', 'a.PDF', 'a.html', 'a.svg', 'a.heic'].map(kyc.inlineType), ['image/png', 'application/pdf', null, null, null]);
    assert.equal((await (await login()).get(`/kyc/${K.asha._id}/document/user_id`)).status, 404);
    assert.equal((await request(adminApp).get(`/kyc/${K.asha._id}/document/selfie`)).status, 302);
  });
});

describe('the app', () => {
  beforeEach(reset);
  const submit = (body) => request(api).post('/api/v1/kyc/submit').send(body);

  test('submit works with the numeric id the app uses', async () => {
    const res = await submit({ user_id: '45', aadhar_number: '2341 2341 2346', pan_number: 'abcpe1234f' });
    assert.equal(res.status, 200, res.text);
    const saved = db.kyc.at(-1);
    assert.deepEqual([String(saved.user_id), saved.aadhar_number, saved.pan_number, saved.status, saved.history[0].action], [String(userOf('Eve')._id), AADHAAR, PAN, 'pending', 'submitted']);
    assert.equal((await kyc.list({ status: 'not_submitted' })).total, 0);
  });

  test('submitting again clears the old decision and keeps it in the history', async () => {
    Object.assign(row('ben'), { status: 'rejected', rejection_reason: 'Blurred', reviewed_by: 'super@a.test', history: [{ action: 'rejected' }] });
    assert.equal((await submit({ user_id: '42' })).status, 200);
    const b = row('ben');
    assert.deepEqual([b.status, b.rejection_reason, b.reviewed_by, b.history.map((h) => h.action).join(), db.kyc.length], ['pending', null, null, 'rejected,resubmitted', 4]);
    b.status = 'approved';
    assert.equal((await submit({ user_id: '42' })).status, 400);
    assert.equal((await submit({ user_id: '999' })).status, 404);
  });

  test('status: masked numbers, no document links', async () => {
    const res = await request(api).get('/api/v1/kyc/status?user_id=41');
    assert.deepEqual([res.body.submitted, res.body.kyc.status, res.body.kyc.documents.selfie], [true, 'pending', true]);
    assert.doesNotMatch(res.text, /234123412346|uploads/);
    assert.deepEqual((await request(api).get('/api/v1/kyc/status?user_id=45')).body, {
      success: true, kyc_status: 'pending', submitted: false, state: 'not_submitted', can_submit: true, required_for_withdrawal: true, can_withdraw: false, kyc: null,
    });
  });

  test('only images and PDF, at most 5 MB', async () => {
    const res = await request(api).post('/api/v1/kyc/submit').field('user_id', '45').attach('selfie', Buffer.from('<script>'), 'x.html');
    assert.equal(res.status, 422);
    const big = await request(api).post('/api/v1/kyc/submit').field('user_id', '45').attach('selfie', Buffer.alloc(5 * 1024 * 1024 + 1), 'x.jpg');
    assert.match(big.body.message, /5 MB/);
    assert.equal(db.kyc.length, 4);
  });
});

describe('withdrawals need approved KYC', () => {
  let created;
  beforeEach(() => {
    reset();
    created = 0;
    WithdrawalRequest.create = async (d) => { created += 1; return { _id: new ObjectId(), old_id: 1, ...d }; };
    Transaction.create = async () => ({});
    db.users.forEach((u) => Object.assign(u, { winnings_balance: 50000, payment_details: { upi_id: 'abc@okhdfc', usdt_wallet_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' } }));
  });
  const ask = (id, currency = 'INR') => request(api).post('/api/v1/withdraw/request').send({ user_id: id, currency, probcoins: '5000' });
  const status = async (id) => (await request(api).get(`/api/v1/kyc/status?user_id=${id}`)).body;

  test('not submitted, pending and rejected are refused with the reason; nothing is created', async () => {
    row('dev').rejection_reason = 'Blurred';
    for (const [id, state, text] of [['45', 'not_submitted', /complete your KYC/], ['41', 'pending', /being reviewed/], ['44', 'rejected', /rejected: Blurred\. Please submit it again/]]) {
      for (const currency of ['INR', 'USDT']) {
        const res = await ask(id, currency);
        assert.deepEqual([res.status, res.body.kyc_required, res.body.kyc_state], [403, true, state]);
        assert.match(res.body.message, text);
      }
      const s = await status(id);
      assert.deepEqual([s.state, s.can_withdraw, s.can_submit], [state, false, state !== 'pending']);
    }
    for (const path of ['/api/v1/withdraw-amount', '/api/v1/wallet/withdraw']) {
      const res = await request(api).post(path).send({ user_id: '45', amount: 5000 });
      assert.deepEqual([res.status, res.body.kyc_required], [403, true], path);
    }
    assert.deepEqual([created, userOf('Eve').winnings_balance], [0, 50000]);
  });

  test('approved by the admin → allowed; approval withdrawn → refused again', async () => {
    const agent = await login();
    await agent.post(`/kyc/${K.ben._id}/approve`).type('form').send({ accept_duplicate: '1' });
    const res = await ask('42');
    assert.notEqual(res.status, 403, res.text);
    assert.equal(created, 1);
    assert.deepEqual([(await status('42')).state, (await status('42')).can_withdraw, (await status('42')).can_submit], ['approved', true, false]);
    await agent.post(`/kyc/${K.ben._id}/reject`).type('form').send({ reason: 'Wrong document uploaded' });
    assert.equal((await ask('42')).body.kyc_state, 'rejected');
  });

  test('switched off by the admin → no KYC needed; unreadable setting → refused', async () => {
    settingRows.withdrawal_kyc_status = 'disabled';
    await ask('45');
    assert.equal(created, 1);
    assert.deepEqual([(await status('45')).required_for_withdrawal, (await status('45')).can_withdraw], [false, true]);
    settingRows = null;
    assert.equal((await ask('45')).status, 503);
    assert.equal(created, 1);
  });

  test('the switch: validated, and a save without it leaves it alone', () => {
    const { validate } = require('../../src/services/deposit-withdrawal-settings.service');
    assert.equal(validate({ withdrawal_kyc_status: 'Disabled' }).values.withdrawal_kyc_status, 'disabled');
    assert.ok(validate({ withdrawal_kyc_status: 'maybe' }).errors.withdrawal_kyc_status);
    assert.equal('withdrawal_kyc_status' in validate({}).values, false);
  });

  test('approved in the PHP panel (submission only) counts; a withdrawn approval does not', async () => {
    Object.assign(row('ben'), { status: 'approved' });
    assert.deepEqual([(await status('42')).state, (await status('42')).can_submit], ['approved', false]);
    await ask('42');
    assert.equal(created, 1);
    userOf('Ben').kyc_status = 'rejected';
    assert.deepEqual([(await ask('42')).body.kyc_state, (await status('42')).can_submit], ['rejected', true]);
    assert.equal((await request(api).post('/api/v1/kyc/submit').send({ user_id: '42' })).status, 200);
    assert.equal(row('ben').status, 'pending');
  });

  test('an approved player cannot reopen KYC from the app', async () => {
    userOf('Eve').kyc_status = 'approved';
    assert.equal((await request(api).post('/api/v1/kyc/submit').send({ user_id: '45' })).status, 400);
    assert.equal(userOf('Eve').kyc_status, 'approved');
  });

  test('the admin sees the KYC status on a withdrawal', async () => {
    const page = (kycStatus) => require('ejs').renderFile(require('path').join(__dirname, '../../src/admin/views/withdrawals/show.ejs'), {
      request: { _id: 'w1', status: 'pending', amount: 1000, user_id: { _id: 'u1', kyc_status: kycStatus } }, history: [], can: () => true,
    });
    assert.match(await page('pending'), /KYC is not approved/);
    assert.doesNotMatch(await page('approved'), /KYC is not approved/);
  });
});

test('KYC tab in the sidebar, only for admins who may open it', async () => {
  const ejs = require('ejs');
  const file = require('path').join(__dirname, '../../src/admin/views/partials/sidebar.ejs');
  const html = (can) => ejs.renderFile(file, { currentPath: '/kyc', isSuperAdmin: false, can });
  assert.match(await html(() => true), /href="\/kyc" class="sidebar-link active"/);
  assert.doesNotMatch(await html((p) => p === 'users.view'), /href="\/kyc"/);
});
