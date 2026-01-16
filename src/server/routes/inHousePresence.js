const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { admin, firestore } = require('../config/firebase');

const router = express.Router();

/**
 * Helper function to get document ID for user's monthly presence
 */
const getMonthlyDocId = (userId, year, month) => {
  return `${userId}_${year}_${String(month + 1).padStart(2, '0')}`;
};

/**
 * Helper function to calculate monthly statistics for a user
 */
const calculateUserMonthlyStats = (year, month, dates) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const presentDays = dates ? Object.keys(dates).length : 0;
  
  // Find all Saturdays in the month
  const saturdays = [];
  const presentSaturdays = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month, day));
    
    if (date.getUTCDay() === 6) { // Saturday
      const dayStr = String(day).padStart(2, '0');
      saturdays.push(dayStr);
      
      // Check if present on this Saturday
      if (dates && dates[dayStr]) {
        presentSaturdays.push(dayStr);
      }
    }
  }
  
  return {
    totalDays: daysInMonth,
    presentDays,
    totalSaturdays: saturdays.length,
    presentSaturdays: presentSaturdays.length,
    meetsAllSaturdays: presentSaturdays.length === saturdays.length,
    meets8Days2Sats: presentDays >= 8 && presentSaturdays.length >= 2,
    meets10Weekdays: presentDays >= 10
  };
};

/**
 * Helper function to get all in-house users from Firebase Auth
 */
const getAllInHouseUsers = async () => {
  try {
    console.log('🔍 Fetching all Firebase Auth users...');
    
    // Get core team emails to exclude them
    const coreProfilesService = require('../services/coreProfilesService');
    const coreProfiles = await coreProfilesService.getAllProfiles();
    const coreEmails = new Set(coreProfiles.profiles.map(p => p.email));
    
    // Get all users from Firebase Auth
    const listUsersResult = await admin.auth().listUsers();
    const users = [];
    
    // Also get any additional user data from Firestore users collection
    const usersSnapshot = await firestore.collection('users').get();
    const firestoreUsers = {};
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      firestoreUsers[userData.email || doc.id] = userData;
    });
    
    // Process Firebase Auth users
    listUsersResult.users.forEach(userRecord => {
      const email = userRecord.email;
      if (!email) return;
      
      // Skip core team members
      if (coreEmails.has(email)) {
        console.log(`⏭️ Skipping core team member: ${email}`);
        return;
      }
      
      const firestoreData = firestoreUsers[email] || {};
      
      // Skip if explicitly marked as core team in Firestore
      if (firestoreData.userType === 'core') return;
      
      users.push({
        userId: userRecord.uid,
        name: userRecord.displayName || firestoreData.name || email.split('@')[0],
        email: email,
        username: firestoreData.username || email.split('@')[0],
        createdAt: userRecord.metadata.creationTime,
        lastSignIn: userRecord.metadata.lastSignInTime
      });
    });
    
    console.log(`✅ Found ${users.length} in-house users from Firebase Auth (excluded ${coreEmails.size} core members)`);
    return users;
  } catch (error) {
    console.error('❌ Error getting Firebase Auth users:', error);
    return [];
  }
};

/**
 * @route   GET /api/in-house-presence/users
 * @desc    Get all in-house users for core team to view
 * @access  Private (Core team only)
 */
router.get('/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is core team member
    if (req.user.userType !== 'core') {
      return res.status(403).json({ error: 'Access denied. Core team members only.' });
    }

    console.log(`🔍 Core user ${req.user.name} requesting in-house users list`);

    const users = await getAllInHouseUsers();
    
    res.json({
      users,
      total: users.length
    });
  } catch (error) {
    console.error('Error getting in-house users:', error);
    res.status(500).json({ error: 'Failed to get in-house users' });
  }
});

/**
 * @route   GET /api/in-house-presence/user/:userId/month/:year/:month
 * @desc    Get presence data for a specific in-house user for a specific month
 * @access  Private (Core team only)
 */
router.get('/user/:userId/month/:year/:month', authenticateToken, async (req, res) => {
  try {
    // Check if user is core team member
    if (req.user.userType !== 'core') {
      return res.status(403).json({ error: 'Access denied. Core team members only.' });
    }

    const { userId, year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month) - 1; // Convert to 0-based month

    console.log(`🔍 Core user ${req.user.name} requesting presence for user ${userId}, ${year}-${month}`);

    // Get user info from Firebase Auth
    let userInfo;
    try {
      const userRecord = await admin.auth().getUser(userId);
      userInfo = {
        userId,
        name: userRecord.displayName || userRecord.email?.split('@')[0],
        email: userRecord.email,
        username: userRecord.email?.split('@')[0]
      };
    } catch (error) {
      console.error(`❌ User ${userId} not found in Firebase Auth:`, error);
      return res.status(404).json({ error: 'User not found' });
    }

    // Get monthly presence document
    const docId = getMonthlyDocId(userId, yearNum, monthNum);
    const presenceDoc = await firestore.collection('user_presence').doc(docId).get();

    let presenceRecords = [];
    let stats = calculateUserMonthlyStats(yearNum, monthNum, {});

    if (presenceDoc.exists) {
      const monthlyData = presenceDoc.data();
      
      // Convert dates object to array format
      if (monthlyData.dates) {
        Object.entries(monthlyData.dates).forEach(([day, data]) => {
          const dateStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${day}`;
          presenceRecords.push({
            id: `${docId}_${day}`,
            date: dateStr,
            type: data.type || 'manual',
            markedAt: data.markedAt
          });
        });

        // Calculate stats with actual data
        stats = calculateUserMonthlyStats(yearNum, monthNum, monthlyData.dates);
      }
    }

    // Sort by date
    presenceRecords.sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      user: {
        userId,
        name: userData.name || userData.displayName,
        email: userData.email,
        username: userData.username || userData.email?.split('@')[0]
      },
      presenceRecords,
      stats,
      month: monthNum + 1,
      year: yearNum,
      totalRecords: presenceRecords.length
    });
  } catch (error) {
    console.error('Error getting user presence:', error);
    res.status(500).json({ error: 'Failed to get user presence data' });
  }
});

/**
 * @route   GET /api/in-house-presence/overview/:year/:month
 * @desc    Get presence overview for all in-house users for a specific month
 * @access  Private (Core team only)
 */
router.get('/overview/:year/:month', authenticateToken, async (req, res) => {
  try {
    // Check if user is core team member
    if (req.user.userType !== 'core') {
      return res.status(403).json({ error: 'Access denied. Core team members only.' });
    }

    const { year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month) - 1; // Convert to 0-based month

    console.log(`🔍 Core user ${req.user.name} requesting presence overview for ${year}-${month}`);

    // Get all in-house users
    const users = await getAllInHouseUsers();
    
    // Get presence data for each user
    const userPresenceData = await Promise.all(
      users.map(async (user) => {
        try {
          const docId = getMonthlyDocId(user.userId, yearNum, monthNum);
          const presenceDoc = await firestore.collection('user_presence').doc(docId).get();
          
          let stats = calculateUserMonthlyStats(yearNum, monthNum, {});
          let presentDates = [];
          
          if (presenceDoc.exists) {
            const monthlyData = presenceDoc.data();
            if (monthlyData.dates) {
              stats = calculateUserMonthlyStats(yearNum, monthNum, monthlyData.dates);
              presentDates = Object.keys(monthlyData.dates).map(day => 
                `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${day}`
              );
            }
          }
          
          return {
            ...user,
            stats,
            presentDates,
            hasData: presenceDoc.exists
          };
        } catch (error) {
          console.error(`Error getting presence for user ${user.userId}:`, error);
          return {
            ...user,
            stats: calculateUserMonthlyStats(yearNum, monthNum, {}),
            presentDates: [],
            hasData: false,
            error: true
          };
        }
      })
    );

    // Calculate overall statistics
    const overallStats = {
      totalUsers: users.length,
      usersWithData: userPresenceData.filter(u => u.hasData).length,
      usersWithErrors: userPresenceData.filter(u => u.error).length,
      averagePresentDays: userPresenceData.reduce((sum, u) => sum + u.stats.presentDays, 0) / users.length,
      usersMetAllSaturdays: userPresenceData.filter(u => u.stats.meetsAllSaturdays).length,
      usersMet8Days2Sats: userPresenceData.filter(u => u.stats.meets8Days2Sats).length,
      usersMet10Weekdays: userPresenceData.filter(u => u.stats.meets10Weekdays).length
    };

    res.json({
      users: userPresenceData,
      overallStats,
      month: monthNum + 1,
      year: yearNum
    });
  } catch (error) {
    console.error('Error getting presence overview:', error);
    res.status(500).json({ error: 'Failed to get presence overview' });
  }
});

module.exports = router;