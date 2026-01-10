const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');

const router = express.Router();

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

    // Check if presence already exists for this user and date
    const existingPresence = await firestore
      .collection('presence')
      .where('userId', '==', req.user.userId)
      .where('date', '==', date)
      .get();

    if (!existingPresence.empty) {
      return res.status(400).json({ error: 'Presence already marked for this date' });
    }

    const presenceData = {
      userId: req.user.userId,
      username: req.user.name || req.user.username,
      userType: req.user.userType,
      date: date,
      type: type, // 'manual' or 'activity'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('presence').add(presenceData);
    
    console.log(`Presence marked by ${req.user.name || req.user.username} for ${date}`);
    
    res.status(201).json({
      message: 'Presence marked successfully',
      presenceId: docRef.id,
      presence: { id: docRef.id, ...presenceData }
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

    // Find presence record for this user and date
    const presenceQuery = await firestore
      .collection('presence')
      .where('userId', '==', req.user.userId)
      .where('date', '==', date)
      .get();

    if (presenceQuery.empty) {
      return res.status(404).json({ error: 'Presence record not found for this date' });
    }

    // Delete the presence record
    const presenceDoc = presenceQuery.docs[0];
    await presenceDoc.ref.delete();

    console.log(`Presence removed by ${req.user.name || req.user.username} for ${date}`);
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

    // Create date range for the month
    const startDate = new Date(yearNum, monthNum, 1);
    const endDate = new Date(yearNum, monthNum + 1, 0);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get presence records for this user - use simpler query to avoid index requirement
    // First get all records for this user, then filter by date in memory
    const presenceQuery = await firestore
      .collection('presence')
      .where('userId', '==', req.user.userId)
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

    console.log(`Found ${presenceRecords.length} presence records for ${req.user.name || req.user.username} in ${year}-${month}`);
    res.json({ 
      presenceRecords,
      month: monthNum,
      year: yearNum,
      count: presenceRecords.length
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

    // Create date range for the month
    const startDate = new Date(yearNum, monthNum, 1);
    const endDate = new Date(yearNum, monthNum + 1, 0);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get presence records for this user - use simpler query to avoid index requirement
    // First get all records for this user, then filter by date in memory
    const presenceQuery = await firestore
      .collection('presence')
      .where('userId', '==', req.user.userId)
      .get();

    const allPresenceRecords = [];
    presenceQuery.forEach(doc => {
      allPresenceRecords.push(doc.data());
    });

    // Filter records by date range in memory
    const presenceRecords = allPresenceRecords.filter(record => {
      return record.date >= startDateStr && record.date <= endDateStr;
    });

    console.log(`Found ${presenceRecords.length} presence records for ${req.user.name || req.user.username} in ${year}-${month}`);

    // Calculate statistics
    const daysInMonth = endDate.getDate();
    const presentDays = presenceRecords.length;
    
    console.log(`Calculating stats for ${yearNum}-${monthNum} (${daysInMonth} days in month)`);
    console.log(`Present records:`, presenceRecords.map(r => ({ date: r.date, type: r.type })));
    
    // Count Saturdays in the month
    const saturdays = [];
    const presentSaturdays = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      // Create date more reliably to avoid timezone issues
      const dateStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
      const dayOfWeek = date.getDay();
      
      console.log(`Day ${day}: ${dateStr} is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]}`);
      
      if (dayOfWeek === 6) { // Saturday
        saturdays.push(dateStr);
        console.log(`Saturday found: ${dateStr} (day ${day})`);
        
        // Check if present on this Saturday
        const isPresent = presenceRecords.some(record => {
          const match = record.date === dateStr;
          console.log(`Checking Saturday ${dateStr} against record ${record.date}: ${match}`);
          if (match) {
            console.log(`✅ Present on Saturday ${dateStr}`);
          }
          return match;
        });
        
        if (isPresent) {
          presentSaturdays.push(dateStr);
        }
      }
    }
    
    console.log(`All Saturdays in month:`, saturdays);
    console.log(`Present Saturdays:`, presentSaturdays);

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

    console.log(`Stats for ${req.user.name || req.user.username} in ${year}-${month}:`, {
      presentDays,
      totalSaturdays: saturdays.length,
      presentSaturdays: presentSaturdays.length,
      saturdays: saturdays,
      presentSaturdayDates: presentSaturdays,
      isCompliant: stats.isCompliant,
      allPresenceRecords: presenceRecords.map(r => r.date)
    });

    res.json({ 
      stats,
      month: monthNum,
      year: yearNum,
      saturdays,
      presentSaturdays
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

    // Check if presence already exists for this user and date
    const existingPresence = await firestore
      .collection('presence')
      .where('userId', '==', req.user.userId)
      .where('date', '==', activityDate)
      .get();

    if (!existingPresence.empty) {
      return res.json({ message: 'Presence already marked for this date' });
    }

    const presenceData = {
      userId: req.user.userId,
      username: req.user.name || req.user.username,
      userType: req.user.userType,
      date: activityDate,
      type: 'activity', // Marked through activity participation
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('presence').add(presenceData);
    
    console.log(`Presence auto-marked for ${req.user.name || req.user.username} on ${activityDate} through activity participation`);
    
    res.status(201).json({
      message: 'Presence marked through activity participation',
      presenceId: docRef.id,
      presence: { id: docRef.id, ...presenceData }
    });
  } catch (error) {
    console.error('Error marking activity presence:', error);
    res.status(500).json({ error: 'Failed to mark activity presence' });
  }
});

module.exports = router;