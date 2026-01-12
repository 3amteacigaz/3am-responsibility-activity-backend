const { firestore } = require('../config/firebase');

class CoreProfilesService {
  constructor() {
    this.collection = firestore.collection('core-profiles');
  }

  /**
   * Initialize core profiles in Firestore (manual setup if needed)
   * Note: JSON file migration removed - profiles should be added directly to Firestore
   */
  async initializeProfiles() {
    try {
      console.log('🔄 Checking core profiles in Firestore...');
      
      // Check if profiles already exist in Firestore
      const snapshot = await this.collection.limit(1).get();
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
      const snapshot = await this.collection.get();
      
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
      const doc = await this.collection.doc(profileId).get();
      
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
      const docRef = this.collection.doc(profileId);
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
}

module.exports = new CoreProfilesService();