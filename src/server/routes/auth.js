const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { admin, firestore } = require('../config/firebase');
const config = require('../config');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

/**
 * @route   GET /api/auth/user
 * @desc    Get current user
 * @access  Private
 */
router.get('/user', authenticateToken, (req, res) => {
  res.json({ 
    userId: req.user.userId, 
    username: req.user.username,
    userType: req.user.userType || 'core'
  });
});

/**
 * @route   POST /api/auth/firebase-signup
 * @desc    Firebase authentication signup
 * @access  Public
 */
router.post('/firebase-signup', authLimiter, async (req, res) => {
  try {
    const { idToken, username, email, userType } = req.body;

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;

    // Generate JWT for our system
    const token = jwt.sign(
      { 
        userId: firebaseUid, 
        username: username, 
        userType: userType || 'in-house',
        email: email
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRE }
    );

    res.cookie('token', token, { 
      httpOnly: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: config.NODE_ENV === 'production'
    });
    
    res.json({ 
      message: 'Firebase signup successful', 
      user: {
        userId: firebaseUid,
        username: username,
        userType: userType || 'in-house',
        email: email
      },
      token: token
    });
  } catch (error) {
    console.error('Firebase signup error:', error);
    res.status(500).json({ error: 'Firebase authentication failed' });
  }
});

/**
 * @route   POST /api/auth/firebase-login
 * @desc    Firebase authentication login
 * @access  Public
 */
router.post('/firebase-login', authLimiter, async (req, res) => {
  try {
    const { idToken, userType } = req.body;

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;
    const username = decodedToken.name || email.split('@')[0];

    // Generate JWT for our system
    const token = jwt.sign(
      { 
        userId: firebaseUid, 
        username: username, 
        userType: userType || 'in-house',
        email: email
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRE }
    );

    res.cookie('token', token, { 
      httpOnly: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: config.NODE_ENV === 'production'
    });
    
    res.json({ 
      message: 'Firebase login successful', 
      user: {
        userId: firebaseUid,
        username: username,
        userType: userType || 'in-house',
        email: email
      },
      token: token
    });
  } catch (error) {
    console.error('Firebase login error:', error);
    res.status(500).json({ error: 'Firebase authentication failed' });
  }
});

module.exports = router;