const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const PROFILES_FILE = path.join(process.cwd(), 'data', 'core-profiles.json');

/**
 * @route   GET /profiles (mounted under /api/core)
 * @desc    Get all core team profiles
 * @access  Public
 */
router.get('/profiles', async (req, res) => {
  console.log('GET /profiles route hit');
  try {
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

/**
 * @route   POST /setup-password (mounted under /api/core)
 * @desc    Set up password for core team member
 * @access  Public
 */
router.post('/setup-password', authLimiter, async (req, res) => {
  try {
    const { profileId, password } = req.body;

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

/**
 * @route   POST /login (mounted under /api/core)
 * @desc    Login core team member
 * @access  Public
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { profileId, password } = req.body;

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