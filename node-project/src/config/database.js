const mongoose = require('mongoose');
const config = require('./env');
const logger = require('./logger');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return mongoose.connection;
  
  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    
    isConnected = true;
    logger.info(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

const disconnectDB = async () => {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB Disconnected');
};

module.exports = { connectDB, disconnectDB };
