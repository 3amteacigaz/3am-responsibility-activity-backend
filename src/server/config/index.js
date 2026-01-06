require('dotenv').config();

const config = {
  // Server Configuration
  PORT: process.env.PORT || 3003,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  
  // Firebase Configuration
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'task-activity-management',
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100, // requests per window
  
  // CORS Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3002',
  
  // Security
  BCRYPT_ROUNDS: 10,
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'your-cookie-secret'
};

module.exports = config;