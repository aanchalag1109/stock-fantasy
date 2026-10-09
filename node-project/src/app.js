'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const logger = require('./config/logger');

// Route imports
const authRoutes = require('./routes/auth.routes');
const walletRoutes = require('./routes/wallet.routes');
const sessionRoutes = require('./routes/session.routes');
const basketRoutes = require('./routes/basket.routes');
const contestRoutes = require('./routes/contest.routes');
const paymentRoutes = require('./routes/payment.routes');
const notificationRoutes = require('./routes/notification.routes');
const bannerRoutes = require('./routes/banner.routes');
const livePriceRoutes = require('./routes/liveprice.routes');
const marketRoutes = require('./routes/market.routes');
const kycRoutes = require('./routes/kyc.routes');
const ticketRoutes = require('./routes/ticket.routes');
const statsRoutes = require('./routes/stats.routes');
const cronRoutes = require('./routes/cron.routes');

const app = express();

// ─────────────────────────────────────────────
// Ensure uploads directories exist
// ─────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../public/uploads');
['profiles', 'kyc', 'banners', 'sessions'].forEach((dir) => {
  const fullPath = path.join(uploadsDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/storage', express.static(path.join(__dirname, '../public/storage')));

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'probtrade-node' });
});

app.get('/', (req, res) => {
  res.json({ message: 'ProbTrade Node.js API', version: '1.0.0', status: 'running' });
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
const API = '/api/v1';
const mobileRoutes = require('./routes/mobile.routes');
const paymentController = require('./controllers/payment.controller');

// PHP mobile paths. These are registered before the nested routers so
// /api/v1/login, /api/v1/sessions and /api/v1/contests/:id keep the PHP contract.
app.use(API, mobileRoutes);
app.get('/payment/create-order', paymentController.createOrder);
app.post('/payment/lgpay-callback', paymentController.lgpayCallback);
app.get('/payment-return', paymentController.paymentReturn);

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/wallet`, walletRoutes);
app.use(`${API}/sessions`, sessionRoutes);
app.use(`${API}/baskets`, basketRoutes);
app.use(`${API}/contests`, contestRoutes);
app.use(`${API}/payment`, paymentRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/banners`, bannerRoutes);
app.use(`${API}/prices`, livePriceRoutes);
app.use(`${API}/market`, marketRoutes);
app.use(`${API}/kyc`, kycRoutes);
app.use(`${API}/tickets`, ticketRoutes);
app.use(`${API}/stats`, statsRoutes);
app.use(`${API}/cron`, cronRoutes);

// Also mount without version for backwards compat
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/baskets', basketRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/prices', livePriceRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/cron', cronRoutes);

// ─────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ─────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack, url: req.url });
  
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({ success: false, message: 'Validation error', errors });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `Duplicate ${field}: ${err.keyValue?.[field]}` });
  }
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

module.exports = app;
