const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Note: This is a simplified version for Firebase-only setup
 * Responsibility operations are handled by Firebase Storage service on the frontend
 * These routes are kept for potential future backend responsibility management
 */

/**
 * @route   GET /api/responsibilities/health
 * @desc    Health check for responsibilities API
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({ 
    message: 'Responsibilities API is running',
    timestamp: new Date().toISOString(),
    database: 'Firebase Firestore'
  });
});

module.exports = router;