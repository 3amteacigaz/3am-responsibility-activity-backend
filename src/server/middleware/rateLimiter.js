const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * General API Rate Limiter
 */
const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW,
  max: config.RATE_LIMIT_MAX,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict Rate Limiter for Authentication Routes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Lenient Rate Limiter for Static Assets
 */
const staticLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests for static assets.'
  },
  skip: (req) => {
    // Skip rate limiting for certain file types
    const skipExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico'];
    return skipExtensions.some(ext => req.path.endsWith(ext));
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  staticLimiter
};