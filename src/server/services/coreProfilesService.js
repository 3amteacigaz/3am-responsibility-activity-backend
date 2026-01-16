/**
 * Core Profiles Service
 * Handles core team profile management
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { firestore } = require('../config/firebase');
const config = require('../config');

class CoreProfilesService {
  constructor() {
    this.collectionName = 'core-profiles';
  }
  
  getCollection() {
    return firestore.collection(this.collectionName);
  }

  /**
   * Initialize core profiles in Firestore (manual setup if needed)
   */
  async initializeProfiles() {
    try {
      console.log('🔄 Checking core profiles in Firestore...');
      
      const collection = this.getCollection();
      
      // Check if profiles already exist in Firestore
      const snapshot = await collection.limit(1).get();
      if (!snapshot.empty) {
        console.log('✅ Core profiles exist in Firestore');
        return;
      }

      console.log('⚠️ No core profiles found in Firestore');
      console.log('💡 Add profiles manually through Firestore console or API');
      
    } catch (error) {
      console.error('❌ Error checking core profiles:', error);
    }
  }

  /**
   * Get all core profiles
   */
  async getAllProfiles() {
    try {
      const collection = this.getCollection();
      const snapshot = await collection.get();
      
      if (snapshot.empty) {
        console.log('⚠️ No profiles found in Firestore');
        return { profiles: [] };
      }

      const profiles = [];
      snapshot.forEach(doc => {
        profiles.push({ id: doc.id, ...doc.data() });
      });

      return { profiles };
    } catch (error) {
      console.error('❌ Error getting profiles from Firestore:', error);
      throw error;
    }
  }

  /**
   * Get a single profile by ID
   */
  async getProfile(profileId) {
    try {
      const collection = this.getCollection();
      const doc = await collection.doc(profileId).get();
      
      if (!doc.exists) {
        return null;
      }

      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('❌ Error getting profile from Firestore:', error);
      throw error;
    }
  }

  /**
   * Update a profile
   */
  async updateProfile(profileId, updates) {
    try {
      const collection = this.getCollection();
      const docRef = collection.doc(profileId);
      await docRef.update({
        ...updates,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`✅ Profile ${profileId} updated in Firestore`);
      return true;
    } catch (error) {
      console.error('❌ Error updating profile in Firestore:', error);
      throw error;
    }
  }

  /**
   * Set password for a profile
   */
  async setPassword(profileId, hashedPassword) {
    return await this.updateProfile(profileId, {
      hashedPassword,
      passwordSet: true,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Update last login
   */
  async updateLastLogin(profileId) {
    return await this.updateProfile(profileId, {
      lastLogin: new Date().toISOString()
    });
  }
  
  /**
   * Setup password for a profile
   */
  async setupPassword(data) {
    const { profileId, password } = data;
    
    // Get the profile
    const profile = await this.getProfile(profileId);
    if (!profile) {
      const error = new Error('Profile not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if password is already set
    if (profile.passwordSet) {
      const error = new Error('Password already set for this profile');
      error.statusCode = 400;
      throw error;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

    // Update the profile
    await this.setPassword(profileId, hashedPassword);
    
    return { success: true };
  }
  
  /**
   * Login with core profile
   */
  async login(data) {
    const { profileId, password } = data;
    
    // Get the profile
    const profile = await this.getProfile(profileId);
    if (!profile) {
      const error = new Error('Profile not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if password is set
    if (!profile.passwordSet || !profile.hashedPassword) {
      const error = new Error('Password not set for this profile');
      error.statusCode = 400;
      throw error;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, profile.hashedPassword);
    if (!isMatch) {
      const error = new Error('Invalid password');
      error.statusCode = 400;
      throw error;
    }

    // Update last login
    await this.updateLastLogin(profileId);

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

    return {
      user: {
        userId: profile.id,
        username: profile.username,
        name: profile.name,
        userType: 'core',
        email: profile.email
      },
      token: token
    };
  }
}

module.exports = new CoreProfilesService();
