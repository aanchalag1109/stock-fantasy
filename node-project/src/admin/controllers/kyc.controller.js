'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): KYC section — filtered list, full details,
 * documents behind the kyc.view permission, review with reason / note / history, CSV export.
 * The work is in services/kyc.service.js.
 */

const path = require('path');
const { render } = require('../helpers/render');
const kyc = require('../../services/kyc.service');
const logger = require('../../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../../services/notifications/notification.service');

const adminName = (req) => (req.adminAccess && req.adminAccess.email) || (req.session && req.session.admin && req.session.admin.email) || 'admin';

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
/** "25 Nov 2026, 11:07 am" in India time. */
function when(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? IST.format(d) : '—';
}
/** "3 days" since `value`. */
function ago(value) {
  const ms = value ? Date.now() - new Date(value).getTime() : 0;
  if (!(ms > 0)) return '';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'less than an hour';
  const n = hours < 24 ? hours : Math.floor(hours / 24);
  return `${n} ${hours < 24 ? 'hour' : 'day'}${n === 1 ? '' : 's'}`;
}

const index = async (req, res) => {
  try {
    const data = await kyc.list(req.query);
    await render(res, 'kyc/index', {
      title: 'KYC',
      ...data,
      options: kyc,
      when,
      ago,
      qs: (changes) => { const q = kyc.queryString(data.filters, changes); return q ? `?${q}` : ''; },
      admin: req.session.admin,
    });
  } catch (err) {
    logger.error(`[kyc] list failed: ${err.message}`);
    res.status(500).send(err.message);
  }
};

const show = async (req, res) => {
  try {
    const data = await kyc.details(req.params.id);
    if (!data) { req.flash('error', 'KYC submission not found.'); return res.redirect('/kyc'); }
    logger.info(`[kyc] ${adminName(req)} opened KYC ${data.submission._id}`);
    res.set('Cache-Control', 'no-store'); // identity numbers
    return await render(res, 'kyc/show', { title: 'KYC Details', ...data, reasons: kyc.REJECT_REASONS, when, ago, admin: req.session.admin });
  } catch (err) {
    logger.error(`[kyc] details failed: ${err.message}`);
    return res.status(500).send(err.message);
  }
};

/** One uploaded document. Only through here: the files are not public (helpers/private-uploads.js). */
const document = async (req, res) => {
  try {
    const submission = await kyc.findSubmission(req.params.id);
    const known = kyc.DOCUMENTS.some((d) => d.key === req.params.key);
    const file = submission && known ? kyc.documentFile(submission[req.params.key]) : null;
    if (!file) return res.status(404).send('Document not found.');
    const type = kyc.inlineType(file);
    const id = submission.old_id != null ? submission.old_id : submission._id;
    const name = `kyc-${id}-${req.params.key}${path.extname(file).toLowerCase()}`.replace(/[^\w.-]/g, '');
    res.set({
      'Content-Type': type || 'application/octet-stream',
      'Content-Disposition': `${type && !req.query.download ? 'inline' : 'attachment'}; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    // An image is never run as a page; the browser's PDF viewer does not work in a sandbox.
    if (type !== 'application/pdf') res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.sendFile(file, { cacheControl: false, dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).send('Document not found.');
    });
  } catch (err) {
    logger.error(`[kyc] document failed: ${err.message}`);
    return res.status(500).send('Could not open the document.');
  }
};

const decide = (status) => async (req, res) => {
  const body = req.body || {};
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  try {
    const result = await kyc.review(req.params.id, {
      status,
      reason: [text(body.reason), text(body.reason_other)].filter(Boolean).join(': '),
      note: text(body.note),
      version: text(body.version),
      acceptDuplicate: body.accept_duplicate === '1',
      admin: adminName(req),
    });
    if (!result.ok) {
      req.flash('error', result.message);
      return res.redirect(`/kyc/${encodeURIComponent(String(req.params.id))}`);
    }
    const { submission, player, at } = result;
    logger.info(`[kyc] ${adminName(req)} ${status} KYC ${submission._id}`);
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications (once per decision)
    if (player) {
      notify(`kyc_${status}`, {
        user: player._id,
        dedupeKey: `kyc_${status}:${submission._id}:${at.getTime()}`,
        ...(status === 'rejected' ? { params: { reason: submission.rejection_reason } } : {}),
        data: { screen: 'kyc' },
      });
    }
    req.flash('success', status === 'approved' ? 'KYC approved.' : 'KYC rejected.');
    return res.redirect(`/kyc/${submission._id}`);
  } catch (err) {
    logger.error(`[kyc] review failed: ${err.message}`);
    req.flash('error', err.message);
    return res.redirect('/kyc');
  }
};

const exportCsv = async (req, res) => {
  const stamp = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kyc_${stamp}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rows = await kyc.exportCsv(req.query, (chunk) => res.write(chunk));
    logger.info(`[kyc] ${adminName(req)} exported ${rows} rows`);
    return res.end();
  } catch (err) {
    logger.error(`[kyc] export failed: ${err.message}`);
    if (!res.headersSent) { req.flash('error', `Export failed: ${err.message}`); return res.redirect('/kyc'); }
    return res.end(`\r\nExport failed: ${err.message}\r\n`);
  }
};

/** For the badge in the sidebar. */
const pendingCount = async (req, res) => {
  try { return res.json({ count: await kyc.pendingCount() }); } catch (err) { return res.status(500).json({ count: 0 }); }
};

module.exports = { index, show, document, approve: decide('approved'), reject: decide('rejected'), exportCsv, pendingCount };
