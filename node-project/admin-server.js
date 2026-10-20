'use strict';

/**
 * Admin Panel Server
 * Runs on a separate port (default 8001) from the main API.
 * Access: http://localhost:8001/login
 */

const { connectDB } = require('./src/config/database');
const logger = require('./src/config/logger');
const { startScheduler } = require('./src/scheduler');

const ADMIN_PORT = process.env.ADMIN_PORT || 8005;

async function main() {
  try {
    // Connect MongoDB first
    await connectDB();
    logger.info('MongoDB connected for admin panel');

    // NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control.
    // First deploy only: if no super admin exists yet, existing admins keep full access.
    await require('./src/services/admin-access.service').bootstrapSuperAdmins();

    // Load admin Express app AFTER DB is ready
    const adminApp = require('./src/admin/app');

    const server = adminApp.listen(ADMIN_PORT, () => {
      logger.info(`🛡️  ProbTrade Admin Panel running at http://localhost:${ADMIN_PORT}`);
      logger.info(`   Login: http://localhost:${ADMIN_PORT}/login`);
      logger.info(`   Dashboard: http://localhost:${ADMIN_PORT}/dashboard`);
    });

    // Same minute heartbeat the PHP scheduler writes to cron_last_run.
    startScheduler();

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down admin panel...`);
      server.close(() => {
        logger.info('Admin server closed');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 8000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Admin panel unhandled rejection:', reason);
    });

    process.on('uncaughtException', (err) => {
      logger.error('Admin panel uncaught exception:', err);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start admin server:', error);
    process.exit(1);
  }
}

main();
