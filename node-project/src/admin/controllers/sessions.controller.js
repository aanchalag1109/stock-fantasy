'use strict';

const mongoose = require('mongoose');
const LeagueSession = require('../../models/league-session.model');
const SessionTemplate = require('../../models/session-template.model');
const Contest = require('../../models/contest.model');
const { render } = require('../helpers/render');
// PHP PARITY: session cancel / refetch prices (services/session-management.service.js)
const sessionService = require('../../services/session-management.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — list filters + refund-safe delete
const { parseListFilters, withStatus } = require('../helpers/list-filters');
const { refundBeforeDelete } = require('../../services/contest-cancellation.service');
const { keysOf } = require('../../helpers/mobile-compat');
// NEW IMPLEMENTATION — NODE.JS PROJECT: market types + session-level category ↔ asset assignment
const markets = require('../../services/markets');
const sessionAssets = require('../../services/session-assets.service');

const LIST_STATUSES = ['live', 'upcoming', 'completed', 'draft', 'cancelled'];

const PAGE_SIZE = 8;
const SESSION_STATUSES = ['upcoming', 'live', 'completed', 'draft'];

function parseIstDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const normalized = raw.replace(' ', 'T');
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const parsed = new Date(`${withSeconds}+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function istSql(value) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  if (!get('year')) return null;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function sessionKeys(session) {
  const keys = [session._id];
  if (session.old_id != null) keys.push(session.old_id);
  return keys;
}

async function findSession(id) {
  if (mongoose.isValidObjectId(id)) {
    const session = await LeagueSession.findById(id).lean();
    if (session) return session;
  }
  if (/^\d+$/.test(String(id))) {
    return LeagueSession.findOne({ old_id: Number(id) }).lean();
  }
  return null;
}

async function updateSessionStatuses() {
  const now = new Date();
  const toLive = await LeagueSession.find({
    status: 'upcoming',
    start_time: { $lte: now },
    end_time: { $gt: now },
  }).select('_id old_id').lean();

  let updatedToLive = 0;
  if (toLive.length) {
    const result = await LeagueSession.updateMany(
      { _id: { $in: toLive.map((session) => session._id) }, status: 'upcoming' },
      { $set: { status: 'live' } }
    );
    updatedToLive = result.modifiedCount || 0;
    const contestKeys = toLive.flatMap((session) => sessionKeys(session));
    await Contest.updateMany(
      { league_session_id: { $in: contestKeys }, status: 'upcoming' },
      { $set: { status: 'live' } }
    );
  }

  const completed = await LeagueSession.updateMany(
    { status: 'live', end_time: { $lte: now } },
    { $set: { status: 'completed' } }
  );

  return {
    updated_to_live: updatedToLive,
    updated_to_completed: completed.modifiedCount || 0,
  };
}

const index = async (req, res) => {
  try {
    await updateSessionStatuses();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — status, date (start date, IST) and
    // Latest/Oldest filters; tab counts cover all matching sessions, not just the current page.
    const filters = parseListFilters(req.query, LIST_STATUSES);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const base = filters.range ? { start_time: filters.range } : {};
    const filter = filters.status ? { ...base, status: filters.status } : base;
    const dir = filters.sort === 'oldest' ? 1 : -1;
    const skip = (page - 1) * PAGE_SIZE;
    const [sessions, total, statusCounts] = await Promise.all([
      LeagueSession.find(filter).sort({ start_time: dir, _id: dir }).skip(skip).limit(PAGE_SIZE).lean(),
      LeagueSession.countDocuments(filter),
      LeagueSession.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const counts = { all: 0 };
    statusCounts.forEach((row) => { counts[row._id || 'upcoming'] = (counts[row._id || 'upcoming'] || 0) + row.n; counts.all += row.n; });
    const pages = Math.ceil(total / PAGE_SIZE) || 1;
    render(res, 'sessions/index', {
      title: 'Leagues & Sessions',
      sessions,
      total,
      pages,
      page,
      pageSize: PAGE_SIZE,
      status: filters.status,
      filters,
      counts,
      statusLink: (value) => withStatus(filters, value),
      admin: req.session.admin,
    });
  } catch (err) { res.status(500).send(err.message); }
};

const updateStatus = async (req, res) => {
  try {
    const result = await updateSessionStatuses();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// NEW IMPLEMENTATION — NODE.JS PROJECT: the create form re-renders with the admin's input (incl. the
// category ↔ asset assignment and an already-uploaded image) when server-side validation fails.
async function renderCreate(res, req, { errors = [], prefill = null } = {}) {
  const templates = await SessionTemplate.find({ active: true }).sort({ old_id: 1, _id: 1 }).lean();
  return render(res, 'sessions/create', {
    title: 'Create New Session',
    templates,
    errors,
    prefill,
    marketOptions: markets.MARKETS,
    admin: req.session.admin,
  });
}

const create = async (req, res) => {
  try {
    await renderCreate(res, req);
  } catch (err) { res.status(500).send(err.message); }
};

const getTemplate = async (req, res) => {
  try {
    const id = String(req.params.id);
    let template = null;
    if (mongoose.isValidObjectId(id) && id.length === 24) {
      template = await SessionTemplate.findById(id).lean();
    }
    if (!template && /^\d+$/.test(id)) {
      template = await SessionTemplate.findOne({ old_id: Number(id) }).lean();
    }
    if (!template) return res.status(404).json({ message: 'Template not found' });
    let assetsData = template.assets_data;
    if (typeof assetsData === 'string') {
      try { assetsData = JSON.parse(assetsData); } catch { assetsData = null; }
    }
    res.json({
      id: template.old_id != null ? template.old_id : String(template._id),
      name: template.name,
      template_name: template.template_name,
      market_type: template.market_type,
      market: markets.marketOfSession(template), // NEW IMPLEMENTATION — NODE.JS PROJECT
      selection: sessionAssets.selectionOf(template),
      max_stocks: template.max_stocks,
      user_joining_start_time: istSql(template.user_joining_start_time),
      start_time: istSql(template.start_time),
      end_time: istSql(template.end_time),
      status: template.status,
      active: !!template.active,
      image_url: template.image_url || null,
      assets_data: assetsData,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const store = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = [];
    const name = String(body.name || '').trim();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: one Market Type (Indian Stock / US Stock / Crypto)
    // replaces "Stock Market + country"; market_type ('stock'/'crypto') is derived from it.
    const market = String(body.market || '').trim();
    const maxRaw = String(body.max_stocks ?? '').trim();
    const maxStocks = Number(maxRaw);
    const startTime = parseIstDate(body.start_time);
    const endTime = parseIstDate(body.end_time);
    const joiningTime = parseIstDate(body.user_joining_start_time);
    const status = String(body.status || '');
    const activeRaw = body.active;

    if (!name) errors.push('The name field is required.');
    else if (name.length > 255) errors.push('The name must not be greater than 255 characters.');
    if (!/^-?\d+$/.test(maxRaw)) errors.push('The max stocks must be an integer.');
    if (!body.start_time) errors.push('The start time field is required.');
    else if (!startTime) errors.push('The start time is not a valid date.');
    if (!body.end_time) errors.push('The end time field is required.');
    else if (!endTime) errors.push('The end time is not a valid date.');
    else if (startTime && endTime <= startTime) errors.push('The end time must be a date after start time.');
    if (body.user_joining_start_time && !joiningTime) errors.push('The user joining start time is not a valid date.');
    if (!SESSION_STATUSES.includes(status)) errors.push('The selected status is invalid.');
    if (!['1', '0', true, false, 1, 0].includes(activeRaw)) {
      errors.push('The active field must be true or false.');
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = `uploads/sessions/${req.file.filename}`;
    } else if (body.existing_image) {
      const existing = String(body.existing_image).replace(/\\/g, '/');
      if (existing.startsWith('uploads/sessions/') && !existing.includes('..')) imageUrl = existing;
    }

    // NEW IMPLEMENTATION — NODE.JS PROJECT: categories + assets chosen for this session, validated
    // on the server (market, active categories, one category per asset, minimum assets).
    const { selection, categoryIds } = sessionAssets.parseSelection(body);
    const assignment = await sessionAssets.buildAssignment({ market, selection, categoryIds });
    errors.push(...assignment.errors);

    if (errors.length) {
      res.status(422);
      return await renderCreate(res, req, {
        errors,
        prefill: {
          name, market, max_stocks: maxRaw, status, active: String(activeRaw ?? '1'),
          user_joining_start_time: body.user_joining_start_time || '', start_time: body.start_time || '', end_time: body.end_time || '',
          save_as_template: Object.prototype.hasOwnProperty.call(body, 'save_as_template'), template_name: String(body.template_name || ''),
          existing_image: imageUrl,
          selection: Object.fromEntries(selection),
          categoryIds,
        },
      });
    }

    const active = activeRaw === true || activeRaw === 1 || activeRaw === '1' || activeRaw === 'true';
    const marketType = markets.typeOf(market);

    await LeagueSession.create({
      name,
      market,
      market_type: marketType,
      categories: assignment.categories,
      max_stocks: maxStocks,
      user_joining_start_time: joiningTime,
      start_time: startTime,
      end_time: endTime,
      status,
      active,
      image_url: imageUrl,
      assets: assignment.rows,
    });

    if (Object.prototype.hasOwnProperty.call(body, 'save_as_template') && String(body.template_name || '').trim()) {
      await SessionTemplate.create({
        name,
        template_name: String(body.template_name).trim(),
        market,
        market_type: marketType,
        max_stocks: maxStocks,
        user_joining_start_time: joiningTime,
        start_time: startTime,
        end_time: endTime,
        status,
        active,
        image_url: imageUrl,
        assets_data: sessionAssets.templateAssetsData(assignment.rows),
      });
    }

    req.flash('success', 'Session created successfully.');
    res.redirect('/league_sessions');
  } catch (err) { req.flash('error', err.message); res.redirect('/league_sessions/create'); }
};

const show = async (req, res) => {
  try {
    const session = await findSession(req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/league_sessions'); }
    const contests = await Contest.find({ league_session_id: { $in: sessionKeys(session) } }).lean();
    const totalParticipants = contests.reduce((sum, contest) => sum + (Number(contest.participants) || 0), 0);
    const seenSymbols = new Set();
    const uniqueAssets = [];
    (session.assets || []).forEach((asset) => {
      if (!asset.asset_symbol || seenSymbols.has(asset.asset_symbol)) return;
      seenSymbols.add(asset.asset_symbol);
      uniqueAssets.push(asset);
    });
    uniqueAssets.sort((a, b) => String(a.asset_symbol).localeCompare(String(b.asset_symbol)));
    const grouped = new Map();
    (session.assets || []).forEach((asset) => {
      const category = asset.category_name || 'Unknown Category';
      if (!grouped.has(category)) grouped.set(category, new Map());
      if (asset.asset_symbol && !grouped.get(category).has(asset.asset_symbol)) {
        grouped.get(category).set(asset.asset_symbol, asset);
      }
    });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: each category shows its configured minimum
    const minByName = new Map((session.categories || []).map((c) => [c.category_name, c.min_assets]));
    const assetsByCategory = [...grouped.entries()].map(([name, symbols]) => ({
      name,
      assets: [...symbols.values()],
      min_assets: minByName.get(name) || null,
    }));
    render(res, 'sessions/show', {
      title: 'View Session',
      session,
      contests,
      contestsCount: contests.length,
      totalParticipants,
      uniqueAssets,
      assetsByCategory,
      marketLabel: markets.labelOf(markets.marketOfSession(session)),
      admin: req.session.admin,
    });
  } catch (err) { res.status(500).send(err.message); }
};

/**
 * PHP PARITY — session edit restored from PHP LeagueSessionController::edit/update and
 * league_sessions/edit.blade.php. What can be changed depends on the session status:
 *   upcoming  → start / end / joining time only (name, market, assets, max stocks locked — as PHP)
 *   live      → name, and Active → Inactive, which cancels the session and refunds every user
 *               (PHP: "Live Session: You can only deactivate it (will refund all users)")
 *   draft     → everything, including the session's assets
 *   completed / cancelled → read-only
 * Fixes over the previous Node handler: times are read and shown in IST (the old form showed
 * UTC and saved without an offset, shifting sessions by 5h30 on every save).
 * Deviation from PHP (safety): market type, assets and max stocks of a LIVE session are locked
 * (PHP allowed changing them mid-session, which breaks joined baskets).
 */
const EDITABLE = {
  upcoming: ['start_time', 'end_time', 'user_joining_start_time'],
  live: ['name', 'active'],
  draft: ['name', 'market', 'max_stocks', 'start_time', 'end_time', 'user_joining_start_time', 'status', 'active', 'assets'],
};
const editableFor = (status) => EDITABLE[status] || EDITABLE.draft;
const isTrue = (v) => v === true || v === '1' || v === 'true';

const edit = async (req, res) => {
  try {
    const session = await findSession(req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/league_sessions'); }
    if (session.status === 'completed' || session.status === 'cancelled') {
      return res.redirect('/league_sessions/' + session._id);
    }
    render(res, 'sessions/edit', {
      title: 'Edit Session',
      session,
      editable: editableFor(session.status),
      times: {
        start_time: istSql(session.start_time),
        end_time: istSql(session.end_time),
        user_joining_start_time: istSql(session.user_joining_start_time),
      },
      selectedAssets: (session.assets || []).map((a) => a.asset_symbol).filter(Boolean),
      // NEW IMPLEMENTATION — NODE.JS PROJECT: market + current category ↔ asset assignment for the picker
      market: markets.marketOfSession(session),
      marketOptions: markets.MARKETS,
      selection: sessionAssets.selectionOf(session),
      selectedCategoryIds: (session.categories || []).map((c) => String(c.category_id)),
      admin: req.session.admin,
    });
  } catch (err) { res.status(500).send(err.message); }
};

const update = async (req, res) => {
  const back = '/league_sessions/' + req.params.id + '/edit';
  try {
    const session = await findSession(req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/league_sessions'); }
    if (session.status === 'completed' || session.status === 'cancelled') {
      req.flash('error', `Cannot edit ${session.status} sessions.`);
      return res.redirect('/league_sessions/' + session._id);
    }
    const allowed = new Set(editableFor(session.status));
    const body = req.body;
    const set = {};

    if (allowed.has('name')) {
      const name = String(body.name || '').trim();
      if (!name || name.length > 255) { req.flash('error', 'The name field is required.'); return res.redirect(back); }
      set.name = name;
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: draft sessions change market + assets together (below)
    if (allowed.has('max_stocks') && body.max_stocks !== undefined) {
      const max = parseInt(body.max_stocks, 10);
      if (!Number.isInteger(max) || max < 1 || max > 50) { req.flash('error', 'Max assets must be between 1 and 50.'); return res.redirect(back); }
      set.max_stocks = max;
    }
    if (allowed.has('start_time')) {
      const start = parseIstDate(body.start_time);
      const end = parseIstDate(body.end_time);
      if (!start || !end) { req.flash('error', 'Start and end time are required.'); return res.redirect(back); }
      if (end <= start) { req.flash('error', 'The end time must be after the start time.'); return res.redirect(back); }
      set.start_time = start;
      set.end_time = end;
      set.user_joining_start_time = parseIstDate(body.user_joining_start_time);
    }
    if (allowed.has('status') && body.status) {
      if (!['draft', 'upcoming', 'live', 'completed'].includes(body.status)) { req.flash('error', 'Invalid status.'); return res.redirect(back); }
      set.status = body.status;
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: draft sessions — market, categories and assets are
    // validated with the same rules as on create. Only applied once the picker has loaded
    // (assets_loaded=1), so a page error can never wipe the session's assets.
    if (allowed.has('assets') && body.assets_loaded === '1') {
      const market = String(body.market || markets.marketOfSession(session) || '').trim();
      const { selection, categoryIds } = sessionAssets.parseSelection(body);
      const assignment = await sessionAssets.buildAssignment({ market, selection, categoryIds });
      if (assignment.errors.length) { req.flash('error', assignment.errors.join(' ')); return res.redirect(back); }
      const existing = new Map((session.assets || []).map((a) => [a.asset_symbol, a]));
      set.assets = assignment.rows.map((row) => ({ ...(existing.get(row.asset_symbol) || {}), ...row })); // keep captured prices
      set.categories = assignment.categories;
      set.market = market;
      set.market_type = markets.typeOf(market);
    }
    const wantsActive = allowed.has('active') && body.active !== undefined ? isTrue(body.active) : null;
    const deactivatingLive = session.status === 'live' && wantsActive === false && session.active !== false;
    if (wantsActive !== null && !deactivatingLive) set.active = wantsActive;

    if (Object.keys(set).length) await LeagueSession.updateOne({ _id: session._id }, { $set: set });

    // PHP: deactivating a LIVE session refunds every user → full session cancel.
    if (deactivatingLive) {
      const result = await sessionService.cancelSession(session._id, { actor: req.adminAccess ? req.adminAccess.email : 'admin' });
      req.flash(result.success ? 'success' : 'error', result.success ? `Session deactivated. ${result.message}` : result.message);
      return res.redirect('/league_sessions');
    }
    req.flash('success', 'Session updated successfully.');
    return res.redirect('/league_sessions');
  } catch (err) { req.flash('error', err.message); return res.redirect(back); }
};

// PHP PARITY — "Refetch Missing Prices" button on the session page.
const refetchPrices = async (req, res) => {
  try {
    const result = await sessionService.refetchMissingPrices(req.params.id);
    const { status, ...body } = result;
    res.status(result.success ? 200 : (status || 400)).json(body);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// NEW IMPLEMENTATION — NODE.JS PROJECT: explicit "Cancel Session" (client request) — all contests
// cancelled and every entry fee refunded. Same service as Live Management.
const cancel = async (req, res) => {
  try {
    const result = await sessionService.cancelSession(req.params.id, { actor: req.adminAccess ? req.adminAccess.email : 'admin' });
    const { status, ...body } = result;
    res.status(result.success ? 200 : (status || 400)).json(body);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const bulkDelete = async (req, res) => {
  try {
    const ids = [].concat(req.body.session_ids || req.body['session_ids[]'] || []).filter(Boolean);
    const sessions = await LeagueSession.find({ _id: { $in: ids } }).select('_id old_id status active').lean();
    let deleted = 0;
    let refunds = 0;
    const failed = [];
    for (const session of sessions) {
      if (session.status === 'live' && session.active !== false) continue;
      const result = await deleteSessionSafely(session, actorOf(req));
      if (result.ok) { deleted += 1; refunds += result.refunded; } else failed.push(result.message);
    }
    req.flash('success', `Deleted ${deleted} sessions successfully.` + (refunds ? ` ${refunds} entry fee(s) refunded.` : ''));
    if (failed.length) req.flash('error', `Not deleted: ${failed.join('; ')}`);
    res.redirect('/league_sessions');
  } catch (err) { req.flash('error', err.message); res.redirect('/league_sessions'); }
};

const destroy = async (req, res) => {
  try {
    const session = await findSession(req.params.id);
    if (!session) { req.flash('error', 'Session not found'); return res.redirect('/league_sessions'); }
    if (session.status === 'live' && session.active !== false) {
      req.flash('error', 'Cannot delete active live sessions. Deactivate first.');
      return res.redirect('/league_sessions');
    }
    const result = await deleteSessionSafely(session, actorOf(req));
    if (!result.ok) { req.flash('error', `Session not deleted: ${result.message}`); return res.redirect('/league_sessions'); }
    req.flash('success', 'Session deleted successfully.' + (result.refunded ? ` ${result.refunded} entry fee(s) refunded.` : ''));
    res.redirect('/league_sessions');
  } catch (err) { req.flash('error', err.message); res.redirect('/league_sessions'); }
};

const actorOf = (req) => (req.adminAccess && req.adminAccess.email) || 'admin';

// NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — deleting a session first refunds the
// entry fees of its still-open contests, then detaches its contests (PHP: ON DELETE SET NULL) and
// deletes the session. If any refund fails, nothing is deleted.
async function deleteSessionSafely(session, actor) {
  const contests = await Contest.find({ league_session_id: { $in: keysOf(session) } }).lean();
  let refunded = 0;
  for (const contest of contests) {
    const result = await refundBeforeDelete(contest, { actor });
    if (!result.ok) return { ok: false, refunded, message: result.message };
    refunded += result.refunded;
  }
  if (contests.length) await Contest.updateMany({ _id: { $in: contests.map((c) => c._id) } }, { $set: { league_session_id: null } });
  await LeagueSession.deleteOne({ _id: session._id });
  return { ok: true, refunded };
}

module.exports = { index, create, getTemplate, store, show, edit, update, destroy, bulkDelete, updateStatus, refetchPrices, cancel };
