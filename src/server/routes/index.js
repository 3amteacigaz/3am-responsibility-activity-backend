const express = require('express');

// Import route modules
const authRoutes = require('./auth');
const coreProfileRoutes = require('./coreProfiles');
const responsibilityRoutes = require('./responsibilities');

const router = express.Router();

/**
 * Mount API routes
 */
router.use('/api/auth', authRoutes);
router.use('/api/core', coreProfileRoutes);
router.use('/api/responsibilities', responsibilityRoutes);

console.log('Routes mounted: /api/auth, /api/core, /api/responsibilities');

// Add a simple health check endpoint
router.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    routes: ['/api/auth', '/api/core', '/api/responsibilities']
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
    const { idToken, username, email, userType } = req.body;
    const { admin } = require('../config/firebase');
    const jwt = require('jsonwebtoken');
    const config = require('../config');

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

router.post('/api/firebase-login', async (req, res) => {
  try {
    const { idToken, userType } = req.body;
    const { admin } = require('../config/firebase');
    const jwt = require('jsonwebtoken');
    const config = require('../config');

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

// Legacy core profile routes - direct handlers
router.post('/api/core-setup-password', async (req, res) => {
  console.log('Legacy route /api/core-setup-password hit');
  try {
    const { profileId, password } = req.body;
    const bcrypt = require('bcryptjs');
    const fs = require('fs').promises;
    const path = require('path');
    const config = require('../config');
    const PROFILES_FILE = path.join(process.cwd(), 'data', 'core-profiles.json');

    if (!profileId || !password) {
      return res.status(400).json({ error: 'Profile ID and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Read current profiles
    const data = await fs.readFile(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(data);

    // Find the profile
    const profileIndex = profiles.profiles.findIndex(p => p.id === profileId);
    if (profileIndex === -1) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = profiles.profiles[profileIndex];

    // Check if password is already set
    if (profile.passwordSet) {
      return res.status(400).json({ error: 'Password already set for this profile' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

    // Update the profile
    profiles.profiles[profileIndex] = {
      ...profile,
      hashedPassword,
      passwordSet: true,
      createdAt: new Date().toISOString()
    };

    // Save back to file
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));

    res.json({ message: 'Password set successfully' });
  } catch (error) {
    console.error('Setup password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

router.get('/api/core-profiles', async (req, res) => {
  console.log('Legacy route /api/core-profiles hit');
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const PROFILES_FILE = path.join(process.cwd(), 'data', 'core-profiles.json');
    
    const data = await fs.readFile(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(data);
    
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
    const fs = require('fs').promises;
    const path = require('path');
    const config = require('../config');
    const PROFILES_FILE = path.join(process.cwd(), 'data', 'core-profiles.json');

    if (!profileId || !password) {
      return res.status(400).json({ error: 'Profile ID and password are required' });
    }

    // Read profiles
    const data = await fs.readFile(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(data);

    // Find the profile
    const profile = profiles.profiles.find(p => p.id === profileId);
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
    const profileIndex = profiles.profiles.findIndex(p => p.id === profileId);
    profiles.profiles[profileIndex].lastLogin = new Date().toISOString();
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: profile.id, 
        username: profile.username,
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