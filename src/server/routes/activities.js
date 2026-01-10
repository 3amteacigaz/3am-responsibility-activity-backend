const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');

const router = express.Router();

/**
 * @route   POST /api/activities
 * @desc    Create a new activity (Core team only)
 * @access  Private (Core team)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, date, startTime, endTime } = req.body;
    
    // Validate required fields
    if (!title || !description || !date || !startTime || !endTime) {
      return res.status(400).json({ error: 'Title, description, date, start time, and end time are required' });
    }

    // Validate that end time is after start time
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    
    if (end <= start) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Check if user is core team member
    if (req.user.userType !== 'core') {
      return res.status(403).json({ error: 'Only core team members can create activities' });
    }

    const activityData = {
      title: title.trim(),
      description: description.trim(),
      date,
      startTime,
      endTime,
      createdBy: req.user.userId,
      createdByName: req.user.name || req.user.username, // Use name if available
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      participantCount: 0
    };

    const docRef = await firestore.collection('activities').add(activityData);
    
    console.log(`Activity created by ${req.user.name || req.user.username}: ${title}`);
    
    res.status(201).json({
      message: 'Activity created successfully',
      activityId: docRef.id,
      activity: { id: docRef.id, ...activityData }
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

/**
 * @route   GET /api/activities
 * @desc    Get all activities
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  console.log('GET /api/activities route hit by user:', req.user.userId);
  try {
    const snapshot = await firestore
      .collection('activities')
      .where('status', '==', 'active')
      .get();

    const activities = [];
    snapshot.forEach(doc => {
      const activityData = doc.data();
      
      // Fix createdByName if it looks like a username (contains underscores) and user is core team
      if (activityData.createdByName && activityData.createdByName.includes('_')) {
        // Try to convert username to proper name format
        const nameParts = activityData.createdByName.split('_');
        const properName = nameParts.map(part => 
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join(' ');
        activityData.createdByName = properName;
      }
      
      activities.push({
        id: doc.id,
        ...activityData
      });
    });

    // Sort by creation date (newest first)
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log(`Found ${activities.length} activities`);
    res.json({ activities });
  } catch (error) {
    console.error('Error getting activities:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

/**
 * @route   GET /api/activities/my
 * @desc    Get activities created by current user (Core team)
 * @access  Private (Core team)
 */
router.get('/my', authenticateToken, async (req, res) => {
  console.log('GET /api/activities/my route hit by user:', req.user.userId);
  try {
    // Check if user is core team member
    if (req.user.userType !== 'core') {
      return res.status(403).json({ error: 'Only core team members can access this endpoint' });
    }

    const snapshot = await firestore
      .collection('activities')
      .where('createdBy', '==', req.user.userId)
      .get();

    const activities = [];
    snapshot.forEach(doc => {
      const activityData = doc.data();
      
      // Fix createdByName if it looks like a username and use current user's name
      if (req.user.name && (activityData.createdByName !== req.user.name)) {
        activityData.createdByName = req.user.name;
      }
      
      activities.push({
        id: doc.id,
        ...activityData
      });
    });

    // Sort by creation date (newest first)
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log(`Found ${activities.length} activities created by ${req.user.name || req.user.username}`);
    res.json({ activities });
  } catch (error) {
    console.error('Error getting user activities:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

/**
 * @route   PUT /api/activities/:id
 * @desc    Update activity (Creator only)
 * @access  Private (Creator)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, startTime, endTime } = req.body;

    // Get the activity to check ownership
    const activityDoc = await firestore.collection('activities').doc(id).get();
    
    if (!activityDoc.exists) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = activityDoc.data();
    
    // Check if user is the creator
    if (activity.createdBy !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can update this activity' });
    }

    const updateData = {
      updatedAt: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (date !== undefined) updateData.date = date;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;

    // Validate that end time is after start time if both are provided
    const finalDate = date || activity.date;
    const finalStartTime = startTime || activity.startTime;
    const finalEndTime = endTime || activity.endTime;
    
    if (finalStartTime && finalEndTime) {
      const start = new Date(`${finalDate}T${finalStartTime}`);
      const end = new Date(`${finalDate}T${finalEndTime}`);
      
      if (end <= start) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
    }

    await firestore.collection('activities').doc(id).update(updateData);

    console.log(`Activity ${id} updated by ${req.user.name || req.user.username}`);
    res.json({ message: 'Activity updated successfully' });
  } catch (error) {
    console.error('Error updating activity:', error);
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

/**
 * @route   DELETE /api/activities/:id
 * @desc    Delete activity (Creator only)
 * @access  Private (Creator)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the activity to check ownership
    const activityDoc = await firestore.collection('activities').doc(id).get();
    
    if (!activityDoc.exists) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = activityDoc.data();
    
    // Check if user is the creator
    if (activity.createdBy !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can delete this activity' });
    }

    // Delete the activity
    await firestore.collection('activities').doc(id).delete();

    // Delete all participation records for this activity
    const participationSnapshot = await firestore
      .collection('activity_participants')
      .where('activityId', '==', id)
      .get();

    const batch = firestore.batch();
    participationSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`Activity ${id} deleted by ${req.user.name || req.user.username}`);
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

/**
 * @route   POST /api/activities/:id/participate
 * @desc    Join/leave activity participation
 * @access  Private
 */
router.post('/:id/participate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { participating } = req.body; // true to join, false to leave

    // Check if activity exists
    const activityDoc = await firestore.collection('activities').doc(id).get();
    
    if (!activityDoc.exists) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = activityDoc.data();

    // Check if activity is still active
    if (activity.status !== 'active') {
      return res.status(400).json({ error: 'Activity is no longer active' });
    }

    // Check for existing participation
    const participationQuery = await firestore
      .collection('activity_participants')
      .where('activityId', '==', id)
      .where('userId', '==', req.user.userId)
      .get();

    const isCurrentlyParticipating = !participationQuery.empty;

    if (participating) {
      // User wants to participate
      if (isCurrentlyParticipating) {
        return res.status(400).json({ error: 'Already participating in this activity' });
      }

      // Add participation record
      const participationData = {
        activityId: id,
        userId: req.user.userId,
        username: req.user.name || req.user.username, // Use name if available
        userType: req.user.userType,
        joinedAt: new Date().toISOString()
      };

      await firestore.collection('activity_participants').add(participationData);

      // Update participant count
      await firestore.collection('activities').doc(id).update({
        participantCount: activity.participantCount + 1,
        updatedAt: new Date().toISOString()
      });

      console.log(`${req.user.name || req.user.username} joined activity: ${activity.title}`);
      res.json({ message: 'Successfully joined activity' });

    } else {
      // User wants to leave
      if (!isCurrentlyParticipating) {
        return res.status(400).json({ error: 'Not currently participating in this activity' });
      }

      // Remove participation record
      const participationDoc = participationQuery.docs[0];
      await participationDoc.ref.delete();

      // Update participant count
      await firestore.collection('activities').doc(id).update({
        participantCount: Math.max(0, activity.participantCount - 1),
        updatedAt: new Date().toISOString()
      });

      console.log(`${req.user.name || req.user.username} left activity: ${activity.title}`);
      res.json({ message: 'Successfully left activity' });
    }

  } catch (error) {
    console.error('Error updating participation:', error);
    res.status(500).json({ error: 'Failed to update participation' });
  }
});

/**
 * @route   GET /api/activities/:id/participants
 * @desc    Get participants for an activity
 * @access  Private
 */
router.get('/:id/participants', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if activity exists
    const activityDoc = await firestore.collection('activities').doc(id).get();
    
    if (!activityDoc.exists) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Get participants
    const participationSnapshot = await firestore
      .collection('activity_participants')
      .where('activityId', '==', id)
      .get();

    const participants = [];
    participationSnapshot.forEach(doc => {
      const data = doc.data();
      participants.push({
        userId: data.userId,
        name: data.username, // This is actually the name now
        userType: data.userType,
        joinedAt: data.joinedAt
      });
    });

    // Sort by join date
    participants.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

    res.json({ participants });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

/**
 * @route   GET /api/activities/participation/my
 * @desc    Get user's participation status for all activities
 * @access  Private
 */
router.get('/participation/my', authenticateToken, async (req, res) => {
  try {
    const participationSnapshot = await firestore
      .collection('activity_participants')
      .where('userId', '==', req.user.userId)
      .get();

    const participatingActivityIds = [];
    participationSnapshot.forEach(doc => {
      participatingActivityIds.push(doc.data().activityId);
    });

    res.json({ participatingActivityIds });
  } catch (error) {
    console.error('Error getting user participation:', error);
    res.status(500).json({ error: 'Failed to get participation status' });
  }
});

module.exports = router;