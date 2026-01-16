/**
 * In-House Presence Service
 * Handles in-house user presence tracking
 */

const { admin, firestore } = require('../config/firebase');

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
 * Get all in-house users from Firebase Auth
 */
async function getAllInHouseUsers(env = null) {
  try {
    console.log('🔍 Fetching all Firebase Auth users...');
    
    const admin = getFirebaseAdmin(env);
    const firestore = getFirestore(env);
    
    // Get core team emails to exclude them
    const coreProfilesService = require('./coreProfilesService');
    const coreProfiles = await coreProfilesService.getAllProfiles(env);
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
}

/**
 * Get presence data for a specific in-house user for a specific month
 */
async function getUserMonthlyPresence(userId, year, month, env = null) {
  const yearNum = parseInt(year);
  const monthNum = parseInt(month) - 1; // Convert to 0-based month

  console.log(`🔍 Requesting presence for user ${userId}, ${year}-${month}`);

  const admin = getFirebaseAdmin(env);
  const firestore = getFirestore(env);

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
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
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

  return {
    user: userInfo,
    presenceRecords,
    stats,
    month: monthNum + 1,
    year: yearNum,
    totalRecords: presenceRecords.length
  };
}

/**
 * Get presence overview for all in-house users for a specific month
 */
async function getPresenceOverview(year, month, env = null) {
  const yearNum = parseInt(year);
  const monthNum = parseInt(month) - 1; // Convert to 0-based month

  console.log(`🔍 Requesting presence overview for ${year}-${month}`);

  const firestore = getFirestore(env);

  // Get all in-house users
  const users = await getAllInHouseUsers(env);
  
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

  return {
    users: userPresenceData,
    overallStats,
    month: monthNum + 1,
    year: yearNum
  };
}

module.exports = {
  getAllInHouseUsers,
  getUserMonthlyPresence,
  getPresenceOverview
};
