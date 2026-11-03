'use strict';

const mongoose = require('mongoose');
const LeagueSession = require('../../models/league-session.model');
const SessionTemplate = require('../../models/session-template.model');
const Contest = require('../../models/contest.model');
const Asset = require('../../models/asset.model');
const MarketTypeCategory = require('../../models/market-type-category.model');
const { render } = require('../helpers/render');
// PHP PARITY: session cancel / refetch prices (services/session-management.service.js)
const sessionService = require('../../services/session-management.service');

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

function postedAssetMap(input, body = {}, fieldName = '') {
  const out = {};
  // PHP PARITY fix: multer parses `stocks[22][]` into a sparse ARRAY indexed by category id
  // ([null, …, ['RELIANCE', 'TCS']]). Arrays used to be skipped, so sessions created from the
  // form were saved with no assets. Object.entries keeps the index (= category id).
  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([categoryId, assets]) => {
      if (assets == null) return;
      const list = (Array.isArray(assets) ? assets : [assets]).map((asset) => String(asset || '').trim()).filter(Boolean);
      if (list.length) out[categoryId] = list;
    });
  }
  if (fieldName) {
    const pattern = new RegExp(`^${fieldName}\\[([^\\]]+)\\](?:\\[\\])?$`);
    Object.entries(body).forEach(([key, assets]) => {
      const match = key.match(pattern);
      if (!match) return;
      const list = (Array.isArray(assets) ? assets : [assets]).map((asset) => String(asset || '').trim()).filter(Boolean);
      if (list.length) out[match[1]] = [...(out[match[1]] || []), ...list];
    });
  }
  return out;
}

async function buildSessionAssets(stocks, cryptos) {
  const maps = [stocks, cryptos];
  const categoryIds = [...new Set(maps.flatMap((map) => Object.keys(map)))].map(Number).filter((id) => !Number.isNaN(id));
  const symbols = [...new Set(maps.flatMap((map) => Object.values(map).flat()))];
  const [categories, assetDocs] = await Promise.all([
    categoryIds.length ? MarketTypeCategory.find({ old_id: { $in: categoryIds } }).select('old_id name').lean() : [],
    symbols.length ? Asset.find({ symbol: { $in: symbols } }).select('symbol name').lean() : [],
  ]);
  const categoryName = new Map(categories.map((category) => [String(category.old_id), category.name]));
  const assetName = new Map(assetDocs.map((asset) => [asset.symbol, asset.name]));
  const rows = [];
  maps.forEach((map) => {
    Object.entries(map).forEach(([categoryId, list]) => {
      list.forEach((symbol) => {
        rows.push({
          category_id: Number(categoryId),
          category_name: categoryName.get(String(categoryId)) || '',
          asset_symbol: symbol,
          asset_name: assetName.get(symbol) || '',
        });
      });
    });
  });
  return rows;
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
    const { status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = {};
    if (status) filter.status = status;
    const skip = (page - 1) * PAGE_SIZE;
    const [sessions, total] = await Promise.all([
      LeagueSession.aggregate([
        { $match: filter },
        {
          $addFields: {
            id_missing: { $cond: [{ $eq: [{ $ifNull: ['$old_id', null] }, null] }, 1, 0] },
          },
        },
        { $sort: { id_missing: 1, old_id: 1, _id: 1 } },
        { $skip: skip },
        { $limit: PAGE_SIZE },
        { $project: { id_missing: 0 } },
      ]),
      LeagueSession.countDocuments(filter),
    ]);
    const pages = Math.ceil(total / PAGE_SIZE) || 1;
    render(res, 'sessions/index', {
      title: 'Leagues & Sessions',
      sessions,
      total,
      pages,
      page,
      pageSize: PAGE_SIZE,
      status: status || '',
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

const create = async (req, res) => {
  try {
    const templates = await SessionTemplate.find({ active: true }).sort({ old_id: 1, _id: 1 }).lean();
    await render(res, 'sessions/create', {
      title: 'Create New Session',
      templates,
      admin: req.session.admin,
    });
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
    const marketType = String(body.market_type || '').trim();
    const maxRaw = String(body.max_stocks ?? '').trim();
    const maxStocks = Number(maxRaw);
    const startTime = parseIstDate(body.start_time);
    const endTime = parseIstDate(body.end_time);
    const joiningTime = parseIstDate(body.user_joining_start_time);
    const status = String(body.status || '');
    const activeRaw = body.active;

    if (!name) errors.push('The name field is required.');
    else if (name.length > 255) errors.push('The name must not be greater than 255 characters.');
    if (!marketType) errors.push('The market type field is required.');
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
    if (errors.length) {
      req.flash('error', errors[0]);
      return res.redirect('/league_sessions/create');
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = `uploads/sessions/${req.file.filename}`;
    } else if (body.existing_image) {
      const existing = String(body.existing_image).replace(/\\/g, '/');
      if (existing.startsWith('uploads/sessions/') && !existing.includes('..')) imageUrl = existing;
    }

    const stocks = postedAssetMap(body.stocks, body, 'stocks');
    const cryptos = postedAssetMap(body.cryptos, body, 'cryptos');
    const assets = await buildSessionAssets(stocks, cryptos);
    const active = activeRaw === true || activeRaw === 1 || activeRaw === '1' || activeRaw === 'true';

    await LeagueSession.create({
      name,
      market_type: marketType,
      max_stocks: maxStocks,
      user_joining_start_time: joiningTime,
      start_time: startTime,
      end_time: endTime,
      status,
      active,
      image_url: imageUrl,
      assets,
    });

    if (Object.prototype.hasOwnProperty.call(body, 'save_as_template') && String(body.template_name || '').trim()) {
      const grouped = {};
      assets.forEach((asset) => {
        const key = asset.category_name || '';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({
          asset_symbol: asset.asset_symbol,
          asset_name: asset.asset_name,
          category_name: asset.category_name,
          category_id: String(asset.category_id),
        });
      });
      await SessionTemplate.create({
        name,
        template_name: String(body.template_name).trim(),
        market_type: marketType,
        max_stocks: maxStocks,
        user_joining_start_time: joiningTime,
        start_time: startTime,
        end_time: endTime,
        status,
        active,
        image_url: imageUrl,
        assets_data: grouped,
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
    const assetsByCategory = [...grouped.entries()].map(([name, symbols]) => ({
      name,
      assets: [...symbols.values()],
    }));
    render(res, 'sessions/show', {
      title: 'View Session',
      session,
      contests,
      contestsCount: contests.length,
      totalParticipants,
      uniqueAssets,
      assetsByCategory,
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
  draft: ['name', 'market_type', 'max_stocks', 'start_time', 'end_time', 'user_joining_start_time', 'status', 'active', 'assets'],
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
    if (allowed.has('market_type') && body.market_type) {
      if (!['stock', 'crypto'].includes(body.market_type)) { req.flash('error', 'Invalid market type.'); return res.redirect(back); }
      set.market_type = body.market_type;
    }
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
    if (allowed.has('assets')) {
      // The edit form posts asset_selection[] = "<categoryId>:<symbol>" (independent of how the
      // body parser treats numeric keys); stocks/cryptos maps are still accepted.
      const stocks = postedAssetMap(body.stocks, body, 'stocks');
      const cryptos = postedAssetMap(body.cryptos, body, 'cryptos');
      const target = (set.market_type || session.market_type) === 'crypto' ? cryptos : stocks;
      [].concat(body.asset_selection || []).forEach((value) => {
        const match = String(value).match(/^(\d+):(.+)$/);
        if (match) target[match[1]] = [...(target[match[1]] || []), match[2].trim()];
      });
      if (Object.keys(stocks).length || Object.keys(cryptos).length) {
        const rows = await buildSessionAssets(stocks, cryptos);
        const existing = new Map((session.assets || []).map((a) => [a.asset_symbol, a]));
        set.assets = rows.map((row) => ({ ...(existing.get(row.asset_symbol) || {}), ...row })); // keep captured prices
      }
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
    const sessions = await LeagueSession.find({ _id: { $in: ids } }).select('_id status active').lean();
    const deletable = sessions
      .filter((session) => !(session.status === 'live' && session.active !== false))
      .map((session) => session._id);
    if (deletable.length) await LeagueSession.deleteMany({ _id: { $in: deletable } });
    req.flash('success', `Deleted ${deletable.length} sessions successfully.`);
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
    await LeagueSession.findByIdAndDelete(session._id);
    req.flash('success', 'Session deleted successfully.');
    res.redirect('/league_sessions');
  } catch (err) { req.flash('error', err.message); res.redirect('/league_sessions'); }
};

module.exports = { index, create, getTemplate, store, show, edit, update, destroy, bulkDelete, updateStatus, refetchPrices, cancel };
