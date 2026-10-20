const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 8000,
  APP_URL: process.env.APP_URL || 'http://localhost:8000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob',
  JWT_SECRET: process.env.JWT_SECRET || 'probtrade-secret-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  CRON_SECRET: process.env.CRON_SECRET || 'probtrade-cron-secret-2026',

  // NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
  // Static OTP until an SMS provider is integrated (see src/services/otp.service.js).
  OTP_STATIC_CODE: /^\d{6}$/.test(process.env.OTP_STATIC_CODE || '') ? process.env.OTP_STATIC_CODE : '123456',
  
  // MySQL for data migration
  MYSQL: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    database: process.env.MYSQL_DATABASE || 'proborzs_prob',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || ''
  },
  
  // External APIs
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5',
  CMC_API_KEY: process.env.CMC_API_KEY || '0c5023c51b4247d3a0a139ee53ce5265',
  
  // Payment Gateway
  LGPAY: {
    appId: process.env.LGPAY_APP_ID || 'YD4484',
    secretKey: process.env.LGPAY_SECRET_KEY || '2rQnx8NosOLyJAkCipz6ET2Ym70ME7',
    baseUrl: process.env.LGPAY_BASE_URL || 'https://www.lg-pay.com'
  },
  
  PRICE_CACHE_DURATION: parseInt(process.env.PRICE_CACHE_DURATION, 10) || 60,
  PRICE_FETCH_TIMEOUT: parseInt(process.env.PRICE_FETCH_TIMEOUT, 10) || 10
};
