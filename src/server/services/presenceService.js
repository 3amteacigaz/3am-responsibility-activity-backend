/**
 * Presence Service
 * Handles presence tracking logic
 */

const { firestore } = require('../config/firebase');

/**
 * Mark presence for a specific date
 */
async function markPresence(data, user, env = null) {
  const { date, type = 'manual' } = data;
  
  // Validate required fields
  if (!date) {
    const error = new Error('Date is required');
    error.statusCode = 400;
    throw error;
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    const error = new Error('Date must be in YYYY-MM-DD format');
    error.statusCode = 400;
    throw error;
  }

  const firestore = getFirestore(env);

  // Check if presence already exists for this user and date
  const existingPresence = await firestore
    .collection('presence')
    .where('userId', '==', user.userId)
    .where('date', '==', date)
    .get();

  if (!existingPresence.empty) {
    const error = new Error('Presence already marked for this date');
    error.statusCode = 400;
    throw error;
  }

  const presenceData = {
    userId: user.userId,
    username: user.name || user.username,
    userType: user.userType,
    date: date,
    type: type, // 'manual' or 'activity'
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await firestore.collection('presence').add(presenceData);
  
  console.log(`Presence marked by ${user.name || user.username} for ${date}`);
  
  return {
    presenceId: docRef.id,
    presence: { id: docRef.id, ...presenceData }
  };
}

/**
 * Remove presence for a specific date
 */
async function removePresence(date, userId, env = null) {
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    const error = new Error('Date must be in YYYY-MM-DD format');
    error.statusCode = 400;
    throw error;
  }

  const firestore = getFirestore(env);

  // Find presence record for this user and date
  const presenceQuery = await firestore
    .collection('presence')
    .where('userId', '==', userId)
    .where('date', '==', date)
    .get();

  if (presenceQuery.empty) {
    const error = new Error('Presence record not found for this date');
    error.statusCode = 404;
    throw error;
  }

  // Delete the presence record
  const presenceDoc = presenceQuery.docs[0];
  await presenceDoc.ref.delete();

  console.log(`Presence removed for user ${userId} on ${date}`);
  return { message: 'Presence removed successfully' };
}

/**
 * Get presence data for a specific month
 */
async function getMonthlyPresence(year, month, userId, env = null) {
  // Validate year and month
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  
  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
    const error = new Error('Invalid year or month');
    error.statusCode = 400;
    throw error;
  }

  // Create date range for the month
  const startDate = new Date(yearNum, monthNum, 1);
  const endDate = new Date(yearNum, monthNum + 1, 0);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const firestore = getFirestore(env);

  // Get presence records for this user
  const presenceQuery = await firestore
    .collection('presence')
    .where('userId', '==', userId)
    .get();

  const allPresenceRecords = [];
  presenceQuery.forEach(doc => {
    allPresenceRecords.push({
      id: doc.id,
      ...doc.data()
    });
  });

  // Filter records by date range in memory and sort by date
  const presenceRecords = allPresenceRecords
    .filter(record => record.date >= startDateStr && record.date <= endDateStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`Found ${presenceRecords.length} presence records for user ${userId} in ${year}-${month}`);
  
  return { 
    presenceRecords,
    month: monthNum,
    year: yearNum,
    count: presenceRecords.length
  };
}

/**
 * Get presence statistics for a specific month
 */
async function getMonthlyStats(year, month, userId, env = null) {
  // Validate year and month
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  
  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
    const error = new Error('Invalid year or month');
    error.statusCode = 400;
    throw error;
  }

  // Create date range for the month
  const startDate = new Date(yearNum, monthNum, 1);
  const endDate = new Date(yearNum, monthNum + 1, 0);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const firestore = getFirestore(env);

  // Get presence records for this user
  const presenceQuery = await firestore
    .collection('presence')
    .where('userId', '==', userId)
    .get();

  const allPresenceRecords = [];
  presenceQuery.forEach(doc => {
    allPresenceRecords.push(doc.data());
  });

  // Filter records by date range in memory
  const presenceRecords = allPresenceRecords.filter(record => {
    return record.date >= startDateStr && record.date <= endDateStr;
  });

  // Calculate statistics
  const daysInMonth = endDate.getDate();
  const presentDays = presenceRecords.length;
  
  // Count Saturdays in the month
  const saturdays = [];
  const presentSaturdays = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 6) { // Saturday
      saturdays.push(dateStr);
      
      // Check if present on this Saturday
      const isPresent = presenceRecords.some(record => record.date === dateStr);
      
      if (isPresent) {
        presentSaturdays.push(dateStr);
      }
    }
  }

  const stats = {
    presentDays,
    totalDays: daysInMonth,
    presentSaturdays: presentSaturdays.length,
    totalSaturdays: saturdays.length,
    // Check compliance with requirements
    meetsAllSaturdays: presentSaturdays.length === saturdays.length,
    meets8Days2Sats: presentDays >= 8 && presentSaturdays.length >= 2,
    meets10Weekdays: presentDays >= 10,
    // Overall compliance (meets any one requirement)
    isCompliant: (presentSaturdays.length === saturdays.length) || 
                 (presentDays >= 8 && presentSaturdays.length >= 2) || 
                 (presentDays >= 10)
  };

  return { 
    stats,
    month: monthNum,
    year: yearNum,
    saturdays,
    presentSaturdays
  };
}

/**
 * Mark presence through activity participation
 */
async function markActivityPresence(activityDate, user, env = null) {
  if (!activityDate) {
    const error = new Error('Activity date is required');
    error.statusCode = 400;
    throw error;
  }

  const firestore = getFirestore(env);

  // Check if presence already exists for this user and date
  const existingPresence = await firestore
    .collection('presence')
    .where('userId', '==', user.userId)
    .where('date', '==', activityDate)
    .get();

  if (!existingPresence.empty) {
    return { message: 'Presence already marked for this date' };
  }

  const presenceData = {
    userId: user.userId,
    username: user.name || user.username,
    userType: user.userType,
    date: activityDate,
    type: 'activity', // Marked through activity participation
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await firestore.collection('presence').add(presenceData);
  
  console.log(`Presence auto-marked for ${user.name || user.username} on ${activityDate} through activity participation`);
  
  return {
    presenceId: docRef.id,
    presence: { id: docRef.id, ...presenceData }
  };
}

module.exports = {
  markPresence,
  removePresence,
  getMonthlyPresence,
  getMonthlyStats,
  markActivityPresence
};
