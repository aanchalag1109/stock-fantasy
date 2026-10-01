'use strict';

const ejs = require('ejs');
const path = require('path');

const VIEWS_DIR = path.join(__dirname, '../views');

/**
 * Render a view wrapped in the main layout.
 *
 * Key fix: merge res.locals (currentPath, admin, flash msgs) into the data
 * object before calling ejs.renderFile, since we bypass Express's native
 * res.render() and call ejs directly.
 *
 * Also: do NOT pass { async: true } — it causes <%- include() %> to
 * return [object Promise] instead of HTML.
 */
async function render(res, view, data = {}) {
  try {
    const viewPath = path.join(VIEWS_DIR, view + '.ejs');
    const layoutPath = path.join(VIEWS_DIR, 'layouts/main.ejs');

    // Merge res.locals so sidebar gets currentPath, admin, flash, etc.
    const locals = { ...res.locals, ...data };

    // Render inner content
    const body = await ejs.renderFile(viewPath, locals);

    // Render layout with body injected
    const html = await ejs.renderFile(layoutPath, { ...locals, body });

    res.send(html);
  } catch (err) {
    console.error('Render error:', err.message, '| View:', view);
    res.status(500).send(
      `<pre style="background:#1e2435;color:#ef4444;padding:20px;font-family:monospace;border-radius:8px">` +
      `<b>Render Error</b>\nView: ${view}\n\n${err.message}</pre>`
    );
  }
}

/**
 * Render a standalone view (no layout) — for login, error pages etc.
 */
async function renderStandalone(res, view, data = {}) {
  try {
    const viewPath = path.join(VIEWS_DIR, view + '.ejs');
    const locals = { ...res.locals, ...data };
    const html = await ejs.renderFile(viewPath, locals);
    res.send(html);
  } catch (err) {
    console.error('Standalone render error:', err.message, '| View:', view);
    res.status(500).send(
      `<pre style="background:#1e2435;color:#ef4444;padding:20px">` +
      `Render Error: ${err.message}</pre>`
    );
  }
}

module.exports = { render, renderStandalone };
