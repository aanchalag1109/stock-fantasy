'use strict';

const app = require('./src/app');
const config = require('./src/config/env');
const { connectDB } = require('./src/config/database');
const logger = require('./src/config/logger');
const { startScheduler } = require('./src/scheduler');

const PORT = config.PORT || 8000;

async function main() {
  try {
    await connectDB();
    logger.info('MongoDB connected successfully');

    const server = app.listen(PORT, () => {
      logger.info(`ProbTrade Node Server running on port ${PORT} [${config.NODE_ENV}]`);
      logger.info(`API Base: http://localhost:${PORT}/api`);
    });

    // Start cron scheduler
    startScheduler();

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced exit after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
