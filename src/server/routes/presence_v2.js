const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');

const router = express.Router();

/**
 * Helper function to get document ID for user's monthly presence
 */
const getMonthlyDocId = (userId, year, month) => {
  return `${userId}_${year}_${String(month + 1).padStart(2, '0')}`;
};

/**
 * Helper function to calculate monthly statistics
 */
const calculateMonthlyStats = (year, month, dates) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const presentDays = Object.keys(dates).length;
  
  // Find all Saturdays in the month using UTC to avoid timezone issues
  const saturdays = [];
  const presentSaturdays = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    // Create date in UTC to avoid timezone issues
    const date = new Date(Date.UTC(year, month, day));
    
    if (date.getUTCDay() === 6) { // Saturday
      const dayStr = String(day).padStart(2, '0');
      saturdays.push(dayStr);
      
      // Check if present on this Saturday
      if (dates[dayStr]) {
        presentSaturdays.push(dayStr);
      }
    }
  }
  
  console.log(`📊 Stats calculation for ${year}-${month + 1}:`);
  console.log(`📅 Total days: ${daysInMonth}, Present days: ${presentDays}`);
  console.log(`🗓️ Saturdays: [${saturdays.join(', ')}], Present Saturdays: [${presentSaturdays.join(', ')}]`);
  
  return {
    totalDays: daysInMonth,
    presentDays,
    totalSaturdays: saturdays.length,
    presentSaturdays: presentSaturdays.length,
    saturdays,
    presentSaturdayDates: presentSaturdays,
    compliance: {
      meetsAllSaturdays: presentSaturdays.length === saturdays.length,
      meets8Days2Sats: presentDays >= 8 && presentSaturdays.length >= 2,
      meets10Weekdays: presentDays >= 10,
      isCompliant: (presentSaturdays.length === saturdays.length) || 
                   (presentDays >= 8 && presentSaturdays.length >= 2) || 
                   (presentDays >= 10)
    }
  };
};

/**
 * @route   POST /api/presence
 * @desc    Mark presence for a specific date
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { date, type = 'manual' } = req.body;
    
    // Validate required fields
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }

    // Parse date components
    const [year, month, day] = date.split('-').map(Number);
    const monthIndex = month - 1; // Convert to 0-based month
    const dayStr = String(day).padStart(2, '0');
    
    // Get monthly document ID
    const docId = getMonthlyDocId(req.user.userId, year, monthIndex);
    const docRef = firestore.collection('user_presence').doc(docId);
    
    // Get existing document or create new one
    const doc = await docRef.get();
    let monthlyData;
    
    if (doc.exists) {
      monthlyData = doc.data();
      
      // Check if presence already marked for this date
      if (monthlyData.dates && monthlyData.dates[dayStr]) {
        return res.status(400).json({ error: 'Presence already marked for this date' });
      }
    } else {
      // Create new monthly document
      monthlyData = {
        userId: req.user.userId,
        username: req.user.name || req.user.username,
        userType: req.user.userType,
        year,
        month: monthIndex,
        dates: {},
        createdAt: new Date().toISOString()
      };
    }
    
    // Add new presence record
    monthlyData.dates[dayStr] = {
      type,
      timestamp: new Date().toISOString()
    };
    
    // Calculate updated statistics
    monthlyData.stats = calculateMonthlyStats(year, monthIndex, monthlyData.dates);
    monthlyData.updatedAt = new Date().toISOString();
    
    // Save updated document
    await docRef.set(monthlyData);
    
    console.log(`✅ Presence marked by ${req.user.name || req.user.username} for ${date} (${type})`);
    
    res.status(201).json({
      message: 'Presence marked successfully',
      date,
      type,
      stats: monthlyData.stats
    });
  } catch (error) {
    console.error('Error marking presence:', error);
    res.status(500).json({ error: 'Failed to mark presence' });
  }
});

/**
 * @route   DELETE /api/presence/:date
 * @desc    Remove presence for a specific date
 * @access  Private
 */
router.delete('/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }

    // Parse date components
    const [year, month, day] = date.split('-').map(Number);
    const monthIndex = month - 1;
    const dayStr = String(day).padStart(2, '0');
    
    // Get monthly document
    const docId = getMonthlyDocId(req.user.userId, year, monthIndex);
    const docRef = firestore.collection('user_presence').doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'No presence record found for this month' });
    }
    
    const monthlyData = doc.data();
    
    // Check if presence exists for this date
    if (!monthlyData.dates || !monthlyData.dates[dayStr]) {
      return res.status(404).json({ error: 'Presence record not found for this date' });
    }
    
    // Remove presence record
    delete monthlyData.dates[dayStr];
    
    // Recalculate statistics
    monthlyData.stats = calculateMonthlyStats(year, monthIndex, monthlyData.dates);
    monthlyData.updatedAt = new Date().toISOString();
    
    // Save updated document
    await docRef.set(monthlyData);
    
    console.log(`❌ Presence removed by ${req.user.name || req.user.username} for ${date}`);
    res.json({ message: 'Presence removed successfully' });
  } catch (error) {
    console.error('Error removing presence:', error);
    res.status(500).json({ error: 'Failed to remove presence' });
  }
});

/**
 * @route   GET /api/presence/month/:year/:month
 * @desc    Get presence data for a specific month
 * @access  Private
 */
router.get('/month/:year/:month', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Get monthly document
    const docId = getMonthlyDocId(req.user.userId, yearNum, monthNum);
    const doc = await firestore.collection('user_presence').doc(docId).get();
    
    if (!doc.exists) {
      // Return empty data if no records exist
      return res.json({
        presenceRecords: [],
        month: monthNum,
        year: yearNum,
        count: 0
      });
    }
    
    const monthlyData = doc.data();
    
    // Convert dates object to array format for compatibility
    const presenceRecords = [];
    if (monthlyData.dates) {
      Object.entries(monthlyData.dates).forEach(([day, data]) => {
        const dateStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${day}`;
        presenceRecords.push({
          id: `${docId}_${day}`,
          date: dateStr,
          type: data.type,
          createdAt: data.timestamp
        });
      });
    }
    
    // Sort by date
    presenceRecords.sort((a, b) => a.date.localeCompare(b.date));
    
    console.log(`📊 Found ${presenceRecords.length} presence records for ${req.user.name || req.user.username} in ${year}-${month}`);
    res.json({ 
      presenceRecords,
      month: monthNum,
      year: yearNum,
      count: presenceRecords.length,
      stats: monthlyData.stats
    });
  } catch (error) {
    console.error('Error getting monthly presence:', error);
    res.status(500).json({ error: 'Failed to get presence data' });
  }
});

/**
 * @route   GET /api/presence/stats/:year/:month
 * @desc    Get presence statistics for a specific month
 * @access  Private
 */
router.get('/stats/:year/:month', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Get monthly document
    const docId = getMonthlyDocId(req.user.userId, yearNum, monthNum);
    const doc = await firestore.collection('user_presence').doc(docId).get();
    
    let stats;
    if (doc.exists) {
      const monthlyData = doc.data();
      stats = monthlyData.stats || calculateMonthlyStats(yearNum, monthNum, monthlyData.dates || {});
    } else {
      // Calculate empty stats for month with no records
      stats = calculateMonthlyStats(yearNum, monthNum, {});
    }
    
    console.log(`📈 Stats for ${req.user.name || req.user.username} in ${year}-${month}:`, stats);
    
    res.json({ 
      stats: {
        presentDays: stats.presentDays,
        totalDays: stats.totalDays,
        presentSaturdays: stats.presentSaturdays,
        totalSaturdays: stats.totalSaturdays,
        meetsAllSaturdays: stats.compliance.meetsAllSaturdays,
        meets8Days2Sats: stats.compliance.meets8Days2Sats,
        meets10Weekdays: stats.compliance.meets10Weekdays,
        isCompliant: stats.compliance.isCompliant
      },
      month: monthNum,
      year: yearNum,
      saturdays: stats.saturdays.map(day => `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${day}`),
      presentSaturdays: stats.presentSaturdayDates.map(day => `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${day}`)
    });
  } catch (error) {
    console.error('Error getting presence stats:', error);
    res.status(500).json({ error: 'Failed to get presence statistics' });
  }
});

/**
 * @route   POST /api/presence/activity-participation
 * @desc    Automatically mark presence when user participates in activity
 * @access  Private
 */
router.post('/activity-participation', authenticateToken, async (req, res) => {
  try {
    const { activityDate } = req.body;
    
    if (!activityDate) {
      return res.status(400).json({ error: 'Activity date is required' });
    }

    // Use the regular mark presence logic with type 'activity'
    const [year, month, day] = activityDate.split('-').map(Number);
    const monthIndex = month - 1;
    const dayStr = String(day).padStart(2, '0');
    
    const docId = getMonthlyDocId(req.user.userId, year, monthIndex);
    const docRef = firestore.collection('user_presence').doc(docId);
    const doc = await docRef.get();
    
    let monthlyData;
    if (doc.exists) {
      monthlyData = doc.data();
      
      // Check if presence already marked
      if (monthlyData.dates && monthlyData.dates[dayStr]) {
        return res.json({ message: 'Presence already marked for this date' });
      }
    } else {
      monthlyData = {
        userId: req.user.userId,
        username: req.user.name || req.user.username,
        userType: req.user.userType,
        year,
        month: monthIndex,
        dates: {},
        createdAt: new Date().toISOString()
      };
    }
    
    // Add activity presence
    monthlyData.dates[dayStr] = {
      type: 'activity',
      timestamp: new Date().toISOString()
    };
    
    monthlyData.stats = calculateMonthlyStats(year, monthIndex, monthlyData.dates);
    monthlyData.updatedAt = new Date().toISOString();
    
    await docRef.set(monthlyData);
    
    console.log(`🎯 Activity presence auto-marked for ${req.user.name || req.user.username} on ${activityDate}`);
    
    res.status(201).json({
      message: 'Presence marked through activity participation',
      date: activityDate,
      type: 'activity'
    });
  } catch (error) {
    console.error('Error marking activity presence:', error);
    res.status(500).json({ error: 'Failed to mark activity presence' });
  }
});

module.exports = router;