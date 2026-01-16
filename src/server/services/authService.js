/**
 * Auth Service
 * Handles authentication logic for the Express backend
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { admin } = require('../config/firebase');
const config = require('../config');

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {object} Decoded token
 */
async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    return decoded;
  } catch (error) {
    const err = new Error('Invalid token');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Firebase Signup
 * @param {object} data - { username, email, password, userType }
 * @returns {object} { user, token }
 */
async function firebaseSignup(data) {
  const { username, email, password, userType } = data;

  // Validate input
  if (!username || !email || !password) {
    const error = new Error('Username, email, and password are required');
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error('Password must be at least 6 characters long');
    error.statusCode = 400;
    throw error;
  }

  try {
    // Create Firebase user
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: username,
      emailVerified: false
    });

    console.log('Firebase user created:', userRecord.uid);

    // Generate JWT
    const token = jwt.sign(
      {
        userId: userRecord.uid,
        username: username,
        name: username,
        userType: userType || 'in-house',
        email: email
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRE }
    );

    return {
      user: {
        userId: userRecord.uid,
        username: username,
        name: username,
        userType: userType || 'in-house',
        email: email
      },
      token: token
    };
  } catch (error) {
    console.error('Firebase signup error:', error);

    // Handle specific Firebase errors
    if (error.code === 'auth/email-already-exists') {
      const err = new Error('Email already exists');
      err.statusCode = 400;
      throw err;
    } else if (error.code === 'auth/invalid-email') {
      const err = new Error('Invalid email address');
      err.statusCode = 400;
      throw err;
    } else if (error.code === 'auth/weak-password') {
      const err = new Error('Password is too weak');
      err.statusCode = 400;
      throw err;
    }

    throw error;
  }
}

/**
 * Firebase Login
 * @param {object} data - { email, password, userType }
 * @returns {object} { user, token }
 */
async function firebaseLogin(data) {
  const { email, password, userType } = data;

  // Validate input
  if (!email || !password) {
    const error = new Error('Email and password are required');
    error.statusCode = 400;
    throw error;
  }

  try {
    // Get user by email
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        const err = new Error('User not found');
        err.statusCode = 400;
        throw err;
      }
      throw error;
    }

    const username = userRecord.displayName || email.split('@')[0];

    console.log('Firebase login for user:', userRecord.uid);

    // Generate JWT
    const token = jwt.sign(
      {
        userId: userRecord.uid,
        username: username,
        name: username,
        userType: userType || 'in-house',
        email: email
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRE }
    );

    return {
      user: {
        userId: userRecord.uid,
        username: username,
        name: username,
        userType: userType || 'in-house',
        email: email
      },
      token: token
    };
  } catch (error) {
    console.error('Firebase login error:', error);

    if (error.code === 'auth/user-not-found') {
      const err = new Error('User not found');
      err.statusCode = 400;
      throw err;
    } else if (error.code === 'auth/invalid-email') {
      const err = new Error('Invalid email address');
      err.statusCode = 400;
      throw err;
    }

    throw error;
  }
}

module.exports = {
  verifyToken,
  firebaseSignup,
  firebaseLogin
};
