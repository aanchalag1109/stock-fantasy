'use strict';

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const config = require('../config/env');

const adminApp = express();

// View engine
adminApp.set('view engine', 'ejs');
adminApp.set('views', path.join(__dirname, 'views'));

// Middleware
adminApp.use(express.json({ limit: '10mb' }));
adminApp.use(express.urlencoded({ extended: true, limit: '10mb' }));
adminApp.use(methodOverride('_method'));
adminApp.use(express.static(path.join(__dirname, '../../public')));

adminApp.use(session({
  secret: config.JWT_SECRET || 'admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24h
}));

adminApp.use(flash());

// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control.
// Resolves the logged-in admin's role/permissions on every request (exposes `can()` to views).
const { attachAdminAccess } = require('./middleware/permission');
adminApp.use(attachAdminAccess);

// Global locals for all views
adminApp.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.warning = req.flash('warning');
  res.locals.admin = req.session.admin || null;
  res.locals.currentPath = req.path;
  next();
});

// Routes
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const userRoutes = require('./routes/users.routes');
const sessionRoutes = require('./routes/sessions.routes');
const contestRoutes = require('./routes/contests.routes');
const transactionRoutes = require('./routes/transactions.routes');
const withdrawalRoutes = require('./routes/withdrawals.routes');
const kycRoutes = require('./routes/kyc.routes');
const ticketRoutes = require('./routes/tickets.routes');
const bannerRoutes = require('./routes/banners.routes');
const notificationRoutes = require('./routes/notifications.routes');
const announcementRoutes = require('./routes/announcements.routes');
const settingsRoutes = require('./routes/settings.routes');
const cronRoutes = require('./routes/cron.routes');
const apiRoutes = require('./routes/api.routes');
const pagesRoutes = require('./routes/pages.routes');
// NEW IMPLEMENTATION (node-project only, not converted from PHP): Deposit and Withdrawal Settings Module
const depositWithdrawalSettingsRoutes = require('./routes/deposit-withdrawal-settings.routes');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (super admin only)
const adminUserRoutes = require('./routes/admin-users.routes');
const adminRoleRoutes = require('./routes/admin-roles.routes');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications and Notification Management
const notificationSettingsRoutes = require('./routes/notification-settings.routes');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled Android Force Update System
const appUpdateSettingsRoutes = require('./routes/app-update-settings.routes');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled iOS Force Update System
const iosAppUpdateSettingsRoutes = require('./routes/ios-app-update-settings.routes');
// NEW IMPLEMENTATION — NODE.JS PROJECT: USDT/INR to ProbCoin Conversion Settings
const probcoinConversionRoutes = require('./routes/probcoin-conversion.routes');

adminApp.use('/', authRoutes);
adminApp.use('/dashboard', dashboardRoutes);
adminApp.use('/users', userRoutes);
adminApp.use('/sessions', sessionRoutes);
adminApp.use('/league_sessions', sessionRoutes);
adminApp.use('/contests', contestRoutes);
adminApp.use('/transactions', transactionRoutes);
adminApp.use('/withdrawals', withdrawalRoutes);
adminApp.use('/withdrawal_requests', withdrawalRoutes);
adminApp.use('/kyc', kycRoutes);
adminApp.use('/tickets', ticketRoutes);
adminApp.use('/banners', bannerRoutes);
adminApp.use('/notifications', notificationRoutes);
adminApp.use('/announcements', announcementRoutes);
adminApp.use('/settings', settingsRoutes);
adminApp.use('/cron', cronRoutes);
adminApp.use('/cron-logs', cronRoutes);
adminApp.use('/api', apiRoutes);
// NEW IMPLEMENTATION (node-project only, not converted from PHP): Deposit and Withdrawal Settings Module
adminApp.use('/deposit-withdrawal-settings', depositWithdrawalSettingsRoutes);
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (super admin only)
adminApp.use('/admin-users', adminUserRoutes);
adminApp.use('/admin-roles', adminRoleRoutes);
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications and Notification Management
adminApp.use('/notification-settings', notificationSettingsRoutes);
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled Android Force Update System
adminApp.use('/android-app-update', appUpdateSettingsRoutes);
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled iOS Force Update System
adminApp.use('/ios-app-update', iosAppUpdateSettingsRoutes);
// NEW IMPLEMENTATION — NODE.JS PROJECT: USDT/INR to ProbCoin Conversion Settings
adminApp.use('/probcoin-conversion', probcoinConversionRoutes);
adminApp.use('/', pagesRoutes);

// Root redirect
adminApp.get('/', (req, res) => res.redirect('/dashboard'));

// 404
adminApp.use((req, res) => {
  res.status(404).render('error', { title: '404 - Not Found', message: 'Page not found' });
});

// Error handler
adminApp.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Server Error', message: err.message || 'Something went wrong' });
});

module.exports = adminApp;
