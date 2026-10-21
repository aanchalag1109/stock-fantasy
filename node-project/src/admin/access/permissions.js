'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin User Access Control
 * Purpose: Manage admin users, roles, and feature-level permissions
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Permission registry. Every admin module discovered in src/admin/routes is listed
 * here with the actions its routes perform. Permission keys are "<module>.<action>".
 * Managing admin users and roles is deliberately NOT a permission: it is reserved
 * for super admins so a role can never be used to grant itself more access.
 */

const MODULES = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', actions: { view: 'View dashboard' } },
  { key: 'sessions', label: 'Leagues / Sessions', group: 'Games', actions: { view: 'View', create: 'Create', edit: 'Edit & change status', delete: 'Delete' } },
  { key: 'templates', label: 'Saved Templates', group: 'Games', actions: { view: 'View', edit: 'Edit', delete: 'Delete' } },
  { key: 'contests', label: 'Contests', group: 'Games', actions: { view: 'View', create: 'Create', edit: 'Edit, cancel & pin', delete: 'Delete' } },
  { key: 'live_management', label: 'Live Management', group: 'Games', actions: { view: 'View' } },
  { key: 'market_categories', label: 'Market Type Categories', group: 'Games', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' } },
  { key: 'pending_prizes', label: 'Pending Prizes', group: 'Games', actions: { view: 'View', distribute: 'Distribute prizes' } },
  { key: 'performance', label: 'Performance', group: 'Reports', actions: { view: 'View' } },
  { key: 'contest_analysis', label: 'Contest Analysis', group: 'Reports', actions: { view: 'View' } },
  { key: 'referrals', label: 'Referrals', group: 'Reports', actions: { view: 'View' } },
  { key: 'users', label: 'Players', group: 'Players', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', wallet: 'Adjust wallet balance' } },
  { key: 'kyc', label: 'KYC Submissions', group: 'Players', actions: { view: 'View', review: 'Approve / reject' } },
  { key: 'tickets', label: 'Support Tickets', group: 'Players', actions: { view: 'View', reply: 'Reply & close' } },
  { key: 'transactions', label: 'Transactions', group: 'Finance', actions: { view: 'View', approve: 'Approve / reject' } },
  { key: 'payments', label: 'Payment Orders', group: 'Finance', actions: { view: 'View', approve: 'Approve / reject / verify' } },
  { key: 'withdrawals', label: 'Withdrawal Requests', group: 'Finance', actions: { view: 'View', process: 'Approve / reject' } },
  { key: 'deposit_withdrawal_settings', label: 'Deposit & Withdrawal Settings', group: 'Finance', actions: { view: 'View', edit: 'Edit limits' } },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: USDT/INR to ProbCoin Conversion Settings
  { key: 'probcoin_conversion', label: 'ProbCoin Conversion Settings', group: 'Finance', actions: { view: 'View', edit: 'Edit rates' } },
  { key: 'announcements', label: 'Announcements', group: 'Content', actions: { view: 'View', create: 'Create', delete: 'Delete' } },
  { key: 'banners', label: 'Banners', group: 'Content', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' } },
  { key: 'notifications', label: 'Push Notifications', group: 'Content', actions: { view: 'Open send form', send: 'Send' } },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications and Notification Management
  { key: 'notification_settings', label: 'Automated Notification Settings', group: 'Content', actions: { view: 'View settings & log', edit: 'Edit settings' } },
  { key: 'app_settings', label: 'App Settings & Pages', group: 'System', actions: { view: 'View', edit: 'Edit' } },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled Android & iOS Force Update System (one permission for both pages)
  { key: 'app_update_settings', label: 'App Update Settings (Android & iOS)', group: 'System', actions: { view: 'View', edit: 'Edit update policy' } },
  { key: 'cron', label: 'Cron Check', group: 'System', actions: { view: 'View logs', clear: 'Clear logs' } },
  { key: 'live_price_feeds', label: 'Live Price Feeds', group: 'System', actions: { view: 'View' } },
  { key: 'testing', label: 'Testing Tools & Test Users', group: 'System', actions: { view: 'View', manage: 'Generate, delete & run tests' } },
];

const ALL_PERMISSIONS = MODULES.flatMap((m) => Object.keys(m.actions).map((a) => `${m.key}.${a}`));
const PERMISSION_SET = new Set(ALL_PERMISSIONS);

function isValidPermission(key) {
  return PERMISSION_SET.has(key);
}

/**
 * Drops unknown keys, de-duplicates, and adds "<module>.view" whenever another
 * action of that module is granted (an action is useless without reaching the page).
 */
function normalizePermissions(input) {
  const list = Array.isArray(input) ? input : (input == null || input === '' ? [] : [input]);
  const result = new Set();
  list.map(String).filter(isValidPermission).forEach((key) => {
    result.add(key);
    const moduleKey = key.split('.')[0];
    if (PERMISSION_SET.has(`${moduleKey}.view`)) result.add(`${moduleKey}.view`);
  });
  return ALL_PERMISSIONS.filter((key) => result.has(key));
}

// Where to send an admin after login / from "/" — first page they are allowed to open.
const LANDING_PAGES = [
  ['dashboard.view', '/dashboard'],
  ['sessions.view', '/league_sessions'],
  ['contests.view', '/contests'],
  ['users.view', '/users'],
  ['transactions.view', '/transactions'],
  ['withdrawals.view', '/withdrawal_requests'],
  ['payments.view', '/payments'],
  ['deposit_withdrawal_settings.view', '/deposit-withdrawal-settings'],
  ['probcoin_conversion.view', '/probcoin-conversion'],
  ['performance.view', '/performance'],
  ['contest_analysis.view', '/contest-analysis'],
  ['live_management.view', '/live-management'],
  ['pending_prizes.view', '/pending-prizes'],
  ['templates.view', '/templates'],
  ['market_categories.view', '/market_type_categories'],
  ['kyc.view', '/kyc'],
  ['tickets.view', '/tickets'],
  ['announcements.view', '/announcements'],
  ['banners.view', '/banners'],
  ['notifications.view', '/notifications'],
  ['notification_settings.view', '/notification-settings'],
  ['app_settings.view', '/settings'],
  ['app_update_settings.view', '/android-app-update'],
  ['cron.view', '/cron-logs'],
  ['live_price_feeds.view', '/live-price-feeds'],
  ['referrals.view', '/referrals'],
  ['testing.view', '/testing/my-game'],
];

module.exports = { MODULES, ALL_PERMISSIONS, isValidPermission, normalizePermissions, LANDING_PAGES };
