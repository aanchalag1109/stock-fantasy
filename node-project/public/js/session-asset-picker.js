/*
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Asset, Market Category & Session redesign (client feedback)
 * Purpose: Category ↔ asset picker for Create Session, Edit Session (drafts) and Edit Template.
 *          After a market type is chosen it loads that market's active categories and assets;
 *          the admin ticks the categories the session uses and assigns assets to each.
 *          Shows the count against each category's minimum and blocks saving until every
 *          chosen category has its minimum. An asset can be in only one category per session.
 * Origin: Newly implemented in node-project; not directly converted from the PHP implementation.
 *
 * Posts (via hidden inputs it keeps in sync):
 *   session_categories[] = <categoryId>
 *   asset_selection[]    = <categoryId>:<SYMBOL>
 * The server re-checks everything (services/session-assets.service.js).
 *
 * Usage:
 *   var picker = SessionAssetPicker({
 *     root, marketSelect, market, selection: { "<catId>": ["SYM", …] }, categoryIds: ["<catId>"],
 *     loadedInput, onChange(picker), readOnly
 *   });
 *   picker.validate() → [messages]; picker.selectedSymbols() → ["SYM", …]; picker.market()
 */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function SessionAssetPicker(opts) {
    var root = opts.root;
    var marketSelect = opts.marketSelect;
    var readOnly = !!opts.readOnly;
    var state = {
      market: opts.market || (marketSelect && marketSelect.value) || '',
      categories: [],          // [{id, name, min_assets, max_assets (null = no limit), description}]
      assets: [],              // [{symbol, name, image_url}]
      chosen: new Set(),       // category ids (strings) used in the session
      assignment: new Map(),   // SYMBOL → category id (string)
      open: new Set(),         // expanded category panels
      search: {},              // category id → search text
      status: 'idle',          // idle | loading | ready | error
      error: '',
    };
    var pending = { selection: opts.selection || {}, categoryIds: (opts.categoryIds || []).map(String) };
    var requestNo = 0;

    root.innerHTML = '<div data-sap="body"></div><div data-sap="hidden"></div>';
    var body = root.querySelector('[data-sap="body"]');
    var hidden = root.querySelector('[data-sap="hidden"]');

    function countOf(catId) {
      var n = 0;
      state.assignment.forEach(function (c) { if (c === catId) n += 1; });
      return n;
    }
    function categoryName(catId) {
      var c = state.categories.find(function (x) { return String(x.id) === catId; });
      return c ? c.name : '';
    }

    function validate() {
      var errors = [];
      if (!state.market) return ['Choose a market type.'];
      if (state.status === 'loading') return ['Categories are still loading. Please wait.'];
      if (state.status === 'error') return ['Categories and assets could not be loaded. Reload the page and try again.'];
      if (!state.chosen.size) return ['Select at least one market category for this session.'];
      state.categories.forEach(function (c) {
        var id = String(c.id);
        if (!state.chosen.has(id)) return;
        var n = countOf(id);
        if (n < c.min_assets) errors.push(c.name + ' requires a minimum of ' + c.min_assets + ' assets. Currently selected: ' + n + '.');
        if (c.max_assets != null && n > c.max_assets) errors.push(c.name + ' allows a maximum of ' + c.max_assets + ' assets. Currently selected: ' + n + '.');
      });
      return errors;
    }

    function syncHidden() {
      var html = '';
      state.chosen.forEach(function (id) { html += '<input type="hidden" name="session_categories[]" value="' + esc(id) + '">'; });
      state.assignment.forEach(function (catId, symbol) {
        if (state.chosen.has(catId)) html += '<input type="hidden" name="asset_selection[]" value="' + esc(catId + ':' + symbol) + '">';
      });
      hidden.innerHTML = html;
      if (opts.loadedInput) opts.loadedInput.value = state.status === 'ready' ? '1' : '0';
      if (typeof opts.onChange === 'function') opts.onChange(api);
    }

    function assetRows(cat) {
      var id = String(cat.id);
      var term = String(state.search[id] || '').toLowerCase();
      var rows = state.assets.filter(function (a) {
        return !term || a.symbol.toLowerCase().indexOf(term) >= 0 || String(a.name || '').toLowerCase().indexOf(term) >= 0;
      });
      if (!state.assets.length) return '<div class="text-muted small py-2">No active assets for this market. Add them in Assets first.</div>';
      if (!rows.length) return '<div class="text-muted small py-2">No assets match “' + esc(state.search[id]) + '”.</div>';
      // NEW IMPLEMENTATION — NODE.JS PROJECT: at the maximum, the rest can't be ticked
      var full = cat.max_assets != null && countOf(id) >= cat.max_assets;
      return (full ? '<div class="small text-muted mb-1"><i class="bi bi-info-circle me-1"></i>Maximum of ' + cat.max_assets + ' reached — untick one to choose another.</div>' : '')
        + '<div class="row g-1">' + rows.map(function (a) {
        var key = a.symbol.toUpperCase();
        var owner = state.assignment.get(key);
        var mine = owner === id;
        var taken = (owner && !mine) || (!owner && full);
        var boxId = 'sap_' + id + '_' + key.replace(/[^A-Z0-9]/g, '_');
        return '<div class="col-md-4 col-sm-6"><div class="form-check border rounded px-4 py-1 ' + (mine ? 'border-success bg-success bg-opacity-10' : '') + (taken ? ' opacity-50' : '') + '">'
          + '<input class="form-check-input" type="checkbox" id="' + esc(boxId) + '" data-sap-asset="' + esc(key) + '" data-sap-cat="' + esc(id) + '"'
          + (mine ? ' checked' : '') + (taken || readOnly ? ' disabled' : '') + '>'
          + '<label class="form-check-label small w-100" for="' + esc(boxId) + '"><strong>' + esc(a.symbol) + '</strong> <span class="text-muted">' + esc(a.name || '') + '</span>'
          + (owner && !mine ? '<br><span class="badge bg-secondary">in ' + esc(categoryName(owner)) + '</span>' : '') + '</label>'
          + '</div></div>';
      }).join('') + '</div>';
    }

    function render() {
      if (!state.market) {
        body.innerHTML = '<div class="text-muted py-3"><i class="bi bi-info-circle me-1"></i>Choose a market type to load its categories.</div>';
        return syncHidden();
      }
      if (state.status === 'loading') {
        body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Loading categories and assets…</div></div>';
        return syncHidden();
      }
      if (state.status === 'error') {
        body.innerHTML = '<div class="alert alert-danger mb-0"><i class="bi bi-exclamation-triangle me-1"></i>Could not load categories/assets (' + esc(state.error) + '). '
          + '<button type="button" class="btn btn-sm btn-outline-danger ms-2" data-sap-retry>Retry</button></div>';
        return syncHidden();
      }
      if (!state.categories.length) {
        body.innerHTML = '<div class="alert alert-warning mb-0"><i class="bi bi-exclamation-circle me-1"></i>No active market categories for this market type. '
          + 'Create one in <a href="/market_type_categories/create">Market Categories</a>.</div>';
        return syncHidden();
      }
      var errors = validate();
      var html = '<div class="small text-muted mb-2">Tick the categories this session uses, then assign assets to each. An asset can be in only one category per session.</div>';
      state.categories.forEach(function (c) {
        var id = String(c.id);
        var on = state.chosen.has(id);
        var n = countOf(id);
        var over = c.max_assets != null && n > c.max_assets;
        var ok = n >= c.min_assets && !over;
        var open = on && state.open.has(id);
        html += '<div class="card mb-2 ' + (on ? (ok ? 'border-success' : 'border-danger') : '') + '">'
          + '<div class="card-body py-2">'
          + '<div class="d-flex flex-wrap align-items-center gap-2">'
          + '<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="sapc_' + esc(id) + '" data-sap-use="' + esc(id) + '"' + (on ? ' checked' : '') + (readOnly ? ' disabled' : '') + '>'
          + '<label class="form-check-label fw-semibold" for="sapc_' + esc(id) + '">' + esc(c.name) + '</label></div>'
          + '<span class="badge bg-light text-dark border">Min ' + c.min_assets + '</span>'
          + (c.max_assets != null ? '<span class="badge bg-light text-dark border">Max ' + c.max_assets + '</span>' : '')
          + (on ? '<span class="badge ' + (ok ? 'bg-success' : 'bg-danger') + '" data-sap-count="' + esc(id) + '">' + n + ' selected</span>' : '')
          + (on ? '<button type="button" class="btn btn-sm btn-outline-primary ms-auto" data-sap-toggle="' + esc(id) + '">' + (open ? 'Hide assets' : 'Assign assets') + '</button>' : '')
          + '</div>'
          + (c.description ? '<div class="small text-muted mt-1">' + esc(c.description) + '</div>' : '')
          + (on && !ok ? '<div class="small text-danger mt-1"><i class="bi bi-exclamation-triangle me-1"></i>' + esc(c.name) + (over ? ' allows a maximum of ' + c.max_assets : ' requires a minimum of ' + c.min_assets) + ' assets. Currently selected: ' + n + '.</div>' : '')
          + (open ? '<div class="mt-2"><input type="search" class="form-control form-control-sm mb-2" placeholder="Search symbol or name…" data-sap-search="' + esc(id) + '" value="' + esc(state.search[id] || '') + '">'
            + '<div style="max-height:320px;overflow-y:auto" data-sap-list="' + esc(id) + '">' + assetRows(c) + '</div></div>' : '')
          + '</div></div>';
      });
      html += '<div data-sap-summary class="mt-2">' + summary(errors) + '</div>';
      body.innerHTML = html;
      syncHidden();
    }

    function summary(errors) {
      var total = 0;
      state.assignment.forEach(function (catId) { if (state.chosen.has(catId)) total += 1; });
      if (!errors.length) return '<div class="alert alert-success py-2 mb-0"><i class="bi bi-check-circle me-1"></i>' + state.chosen.size + ' categor' + (state.chosen.size === 1 ? 'y' : 'ies') + ', ' + total + ' assets — all limits met.</div>';
      return '<div class="alert alert-danger py-2 mb-0"><ul class="mb-0 ps-3">' + errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }

    function refreshList(catId) {
      var list = body.querySelector('[data-sap-list="' + catId + '"]');
      var c = state.categories.find(function (x) { return String(x.id) === catId; });
      if (list && c) list.innerHTML = assetRows(c);
    }

    function load() {
      var my = ++requestNo;
      if (!state.market) { state.status = 'idle'; return render(); }
      state.status = 'loading';
      render();
      Promise.all([
        getJson('/api/categories/' + encodeURIComponent(state.market)),
        getJson('/api/assets/market/' + encodeURIComponent(state.market)),
      ]).then(function (res) {
        if (my !== requestNo) return;
        state.categories = res[0].map(function (c) {
          var min = Math.max(1, parseInt(c.min_assets, 10) || 1);
          var max = parseInt(c.max_assets, 10);
          return { id: c.id, name: c.name, min_assets: min, max_assets: max >= 1 ? Math.max(max, min) : null, description: c.description || '' };
        });
        state.assets = res[1];
        var known = new Set(state.assets.map(function (a) { return a.symbol.toUpperCase(); }));
        var catIds = new Set(state.categories.map(function (c) { return String(c.id); }));
        state.chosen = new Set();
        state.assignment = new Map();
        pending.categoryIds.forEach(function (id) { if (catIds.has(id)) state.chosen.add(id); });
        Object.keys(pending.selection).forEach(function (id) {
          if (!catIds.has(String(id))) return;
          (pending.selection[id] || []).forEach(function (sym) {
            var key = String(sym).toUpperCase();
            if (known.has(key) && !state.assignment.has(key)) { state.assignment.set(key, String(id)); state.chosen.add(String(id)); }
          });
        });
        pending = { selection: {}, categoryIds: [] };
        state.open = new Set();
        state.status = 'ready';
        render();
      }).catch(function (err) {
        if (my !== requestNo) return;
        state.status = 'error';
        state.error = err.message;
        render();
      });
    }

    body.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-sap-use')) {
        var id = t.getAttribute('data-sap-use');
        if (t.checked) { state.chosen.add(id); state.open.add(id); }
        else {
          state.chosen.delete(id);
          state.open.delete(id);
          state.assignment.forEach(function (c, sym) { if (c === id) state.assignment.delete(sym); });
        }
        render();
      } else if (t.hasAttribute('data-sap-asset')) {
        var sym = t.getAttribute('data-sap-asset');
        var cat = t.getAttribute('data-sap-cat');
        if (t.checked) state.assignment.set(sym, cat); else state.assignment.delete(sym);
        render();
      }
    });
    body.addEventListener('input', function (e) {
      var t = e.target;
      if (!t.hasAttribute('data-sap-search')) return;
      var id = t.getAttribute('data-sap-search');
      state.search[id] = t.value;
      refreshList(id);
    });
    body.addEventListener('click', function (e) {
      var t = e.target.closest('[data-sap-toggle],[data-sap-retry]');
      if (!t) return;
      if (t.hasAttribute('data-sap-retry')) return load();
      var id = t.getAttribute('data-sap-toggle');
      if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
      render();
    });
    if (marketSelect) {
      marketSelect.addEventListener('change', function () {
        var hadWork = state.assignment.size > 0;
        if (hadWork && !confirm('Changing the market type clears the categories and assets selected so far. Continue?')) {
          marketSelect.value = state.market;
          return;
        }
        state.market = marketSelect.value;
        pending = { selection: {}, categoryIds: [] };
        load();
      });
    }

    var api = {
      validate: validate,
      market: function () { return state.market; },
      isReady: function () { return state.status === 'ready'; },
      selectedSymbols: function () {
        var out = [];
        state.assignment.forEach(function (catId, sym) { if (state.chosen.has(catId)) out.push(sym); });
        return out;
      },
      /** Replace market + selection (e.g. when a template is loaded). */
      set: function (market, selection, categoryIds) {
        state.market = market || '';
        if (marketSelect) marketSelect.value = state.market;
        pending = { selection: selection || {}, categoryIds: (categoryIds || []).map(String) };
        load();
      },
      showErrors: function () { render(); var s = body.querySelector('[data-sap-summary]'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    };
    load();
    return api;
  }

  global.SessionAssetPicker = SessionAssetPicker;
})(window);
