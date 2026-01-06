const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT Authentication Middleware
 * Verifies JWT token from cookies or Authorization header
 */
const authenticateToken = (req, res, next) => {
  // Get token from cookie or Authorization header
  const token = req.cookies.token || 
                (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(403).json({ error: 'Invalid token.' });
  }
};

/**
 * Optional Authentication Middleware
 * Adds user info if token exists, but doesn't require it
 */
const optionalAuth = (req, res, next) => {
  const token = req.cookies.token || 
                (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token invalid, but continue without user
      console.log('Invalid token in optional auth:', error.message);
    }
  }
  
  next();
};

/**
 * Role-based Authorization Middleware
 * Requires specific user roles
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userRole = req.user.userType || 'core';
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole
};