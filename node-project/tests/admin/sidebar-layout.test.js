'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback on the admin sidebar — tabs grouped into
 * sections, renamed tabs, Back button, empty sections hidden, dummy notification bell removed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

const VIEWS = path.join(__dirname, '../../src/admin/views');
const renderSidebar = (opts) => ejs.renderFile(path.join(VIEWS, 'partials/sidebar.ejs'), {
  currentPath: '/contests', isSuperAdmin: false, can: () => true, ...opts,
});
const sectionsOf = (html) => [...html.matchAll(/<div class="sidebar-section">([^<]+)<\/div>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('Admin sidebar (client feedback)', () => {
  test('tabs are grouped into the requested sections, in order', async () => {
    const html = await renderSidebar({ isSuperAdmin: true });
    assert.deepEqual(sectionsOf(html), [
      'Main', 'Sessions & Contests', 'Banners & Notifications', 'Payments & Transactions',
      'Analytics', 'Bots', 'Users & Admin Management', 'App & System',
    ]);
  });

  test('renamed tabs: Deposit Orders and Bot Users', async () => {
    const html = await renderSidebar({});
    assert.match(html, /href="\/payments"[^>]*>\s*<i class="bi bi-credit-card"><\/i> Deposit Orders/);
    assert.match(html, /href="\/testing\/test-users"[^>]*>\s*<i class="bi bi-robot"><\/i> Bot Users/);
    assert.doesNotMatch(html, /Payment Orders|Test Users/);
  });

  test('a section is hidden when the admin can open none of its links', async () => {
    const html = await renderSidebar({ can: (p) => p === 'payments.view' || p === 'withdrawals.view' });
    assert.deepEqual(sectionsOf(html), ['Payments & Transactions']);
    assert.doesNotMatch(html, /href="\/admin-users"/);
  });

  test('Back button on inner pages, not on the dashboard', async () => {
    assert.match(await renderSidebar({}), /sidebar-back"[\s\S]*?history\.back\(\)/);
    assert.doesNotMatch(await renderSidebar({ currentPath: '/dashboard' }), /sidebar-back/);
  });

  test('only one tab is active on Bot Users', async () => {
    const html = await renderSidebar({ currentPath: '/testing/test-users' });
    assert.equal((html.match(/sidebar-link active/g) || []).length, 1);
  });

  test('the dummy notification bell is gone from the header', () => {
    const layout = fs.readFileSync(path.join(VIEWS, 'layouts/main.ejs'), 'utf8');
    assert.doesNotMatch(layout, /New user registered|View all notifications/);
  });
});
