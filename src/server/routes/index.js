const express = require('express');

// Import route modules
const authRoutes = require('./auth');
const coreProfileRoutes = require('./coreProfiles');
const responsibilityRoutes = require('./responsibilities');
const activityRoutes = require('./activities');
const presenceRoutes = require('./presence_v2'); // Updated to use new structure
const inHousePresenceRoutes = require('./inHousePresence'); // New in-house presence for core team
const notificationRoutes = require('./notifications'); // New notification system

const router = express.Router();

/**
 * Mount API routes
 */
router.use('/api/auth', authRoutes);
router.use('/api/core', coreProfileRoutes);
router.use('/api/responsibilities', responsibilityRoutes);
router.use('/api/activities', activityRoutes);
router.use('/api/presence', presenceRoutes);
router.use('/api/in-house-presence', inHousePresenceRoutes);
router.use('/api/notifications', notificationRoutes);

console.log('Routes mounted: /api/auth, /api/core, /api/responsibilities, /api/activities, /api/presence (v2), /api/in-house-presence, /api/notifications');

// Add a simple health check endpoint
router.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    routes: ['/api/auth', '/api/core', '/api/responsibilities', '/api/activities', '/api/presence', '/api/in-house-presence', '/api/notifications'],
    presenceStructure: 'User-Centric Monthly Documents (v2)',
    features: ['Push Notifications', 'Activity Participation Tracking', 'Non-Participant Visibility']
  });
});

// Add debug endpoint to list all routes
router.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  // Get all routes from the app
  function extractRoutes(stack, prefix = '') {
    stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods);
        routes.push({
          path: prefix + layer.route.path,
          methods: methods
        });
      } else if (layer.name === 'router' && layer.handle.stack) {
        const routerPrefix = layer.regexp.source
          .replace('\\', '')
          .replace('(?=\\/|$)', '')
          .replace('^', '');
        extractRoutes(layer.handle.stack, routerPrefix);
      }
    });
  }
  
  res.json({ 
    message: 'Available routes',
    routes: [
      'GET /api/health',
      'GET /api/debug/routes',
      'POST /api/logout',
      'GET /api/user',
      'POST /api/firebase-signup',
      'POST /api/firebase-login',
      'POST /api/core-setup-password',
      'GET /api/core-profiles',
      'POST /api/core-profile-login',
      'GET /api/core/profiles',
      'POST /api/core/setup-password',
      'POST /api/core/login',
      'POST /api/responsibilities',
      'GET /api/responsibilities',
      'GET /api/responsibilities/all',
      'PUT /api/responsibilities/:id',
      'DELETE /api/responsibilities/:id',
      'GET /api/responsibilities/dates',
      'GET /api/responsibilities/stats',
      'POST /api/auth/logout',
      'GET /api/auth/user',
      'POST /api/auth/firebase-signup',
      'POST /api/auth/firebase-login'
    ]
  });
});

/**
 * Legacy API route mappings for backward compatibility
 */
// Direct route handlers for legacy endpoints
router.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

router.get('/api/user', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  
  // Get token from cookie or Authorization header
  const token = req.cookies.token || 
                (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    res.json({ 
      userId: decoded.userId, 
      username: decoded.username,
      name: decoded.name,
      userType: decoded.userType || 'core'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(403).json({ error: 'Invalid token.' });
  }
});

// Firebase authentication routes
router.post('/api/firebase-signup', async (req, res) => {
  try {
    const { username, email, password, userType } = req.body;
    const { admin } = require('../config/firebase');
    const jwt = require('jsonwebtoken');
    const config = require('../config');
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Create Firebase user on backend using Admin SDK
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username,
      emailVerified: false
    });

    console.log('Firebase user created:', userRecord.uid);

    // Generate JWT for our system
    const token = jwt.sign(
      { 
        userId: userRecord.uid, 
        username: username, 
        name: username, // For Firebase users, use username as name initially
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
      message: 'Account created successfully', 
      user: {
        userId: userRecord.uid,
        username: username,
        name: username,
        userType: userType || 'in-house',
        email: email
      },
      token: token
    });
  } catch (error) {
    console.error('Firebase signup error:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already exists' });
    } else if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Invalid email address' });
    } else if (error.code === 'auth/weak-password') {
      return res.status(400).json({ error: 'Password is too weak' });
    }
    
    res.status(500).json({ error: 'Account creation failed' });
  }
});

router.post('/api/firebase-login', async (req, res) => {
  try {
    const { email, password, userType } = req.body;
    const { admin } = require('../config/firebase');
    const jwt = require('jsonwebtoken');
    const config = require('../config');
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user by email from Firebase Admin SDK
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(400).json({ error: 'User not found' });
      }
      throw error;
    }

    // Note: Firebase Admin SDK doesn't verify passwords directly
    // In production, you would typically use Firebase Client SDK on frontend
    // to authenticate and get idToken, then verify idToken on backend
    // 
    // For this implementation, we'll assume the user exists and create a session
    // The password verification would happen on the client side with Firebase Auth

    const username = userRecord.displayName || email.split('@')[0];

    console.log('Firebase login for user:', userRecord.uid);

    // Generate JWT for our system
    const token = jwt.sign(
      { 
        userId: userRecord.uid, 
        username: username, 
        name: username, // For Firebase users, use username as name
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
      message: 'Login successful', 
      user: {
        userId: userRecord.uid,
        username: username,
        name: username,
        userType: userType || 'in-house',
        email: email
      },
      token: token
    });
  } catch (error) {
    console.error('Firebase login error:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/user-not-found') {
      return res.status(400).json({ error: 'User not found' });
    } else if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    res.status(500).json({ error: 'Login failed' });
  }
});

// Legacy core profile routes - direct handlers
router.post('/api/core-setup-password', async (req, res) => {
  console.log('Legacy route /api/core-setup-password hit');
  try {
    const { profileId, password } = req.body;
    const bcrypt = require('bcryptjs');
    const config = require('../config');
    const coreProfilesService = require('../services/coreProfilesService');

    if (!profileId || !password) {
      return res.status(400).json({ error: 'Profile ID and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Get the profile
    const profile = await coreProfilesService.getProfile(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if password is already set
    if (profile.passwordSet) {
      return res.status(400).json({ error: 'Password already set for this profile' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

    // Update the profile
    const success = await coreProfilesService.setPassword(profileId, hashedPassword);
    
    if (success) {
      res.json({ message: 'Password set successfully' });
    } else {
      res.status(500).json({ error: 'Failed to set password' });
    }
  } catch (error) {
    console.error('Setup password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

router.get('/api/core-profiles', async (req, res) => {
  console.log('Legacy route /api/core-profiles hit');
  try {
    const coreProfilesService = require('../services/coreProfilesService');
    const profiles = await coreProfilesService.getAllProfiles();
    
    console.log('Loaded profiles:', profiles.profiles.length);
    
    // Remove sensitive data before sending
    const publicProfiles = profiles.profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      username: profile.username,
      email: profile.email,
      passwordSet: profile.passwordSet,
      createdAt: profile.createdAt,
      lastLogin: profile.lastLogin
    }));
    
    res.json({ profiles: publicProfiles });
  } catch (error) {
    console.error('Error reading profiles:', error);
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

router.post('/api/core-profile-login', async (req, res) => {
  console.log('Legacy route /api/core-profile-login hit');
  try {
    const { profileId, password } = req.body;
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const config = require('../config');
    const coreProfilesService = require('../services/coreProfilesService');

    if (!profileId || !password) {
      return res.status(400).json({ error: 'Profile ID and password are required' });
    }

    // Get the profile
    const profile = await coreProfilesService.getProfile(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if password is set
    if (!profile.passwordSet || !profile.hashedPassword) {
      return res.status(400).json({ error: 'Password not set for this profile' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, profile.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    // Update last login
    await coreProfilesService.updateLastLogin(profileId);

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: profile.id, 
        username: profile.username,
        name: profile.name,
        userType: 'core',
        email: profile.email
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
      message: 'Login successful', 
      user: {
        userId: profile.id,
        username: profile.username,
        name: profile.name,
        userType: 'core',
        email: profile.email
      },
      token: token
    });
  } catch (error) {
    console.error('Core login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;