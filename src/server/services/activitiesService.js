/**
 * Activities Service
 * Handles activity management logic
 */

const { firestore } = require('../config/firebase');

/**
 * Create a new activity (Core team only)
 */
async function createActivity(data, user) {
  const { title, description, date, startTime, endTime } = data;
  
  // Validate required fields
  if (!title || !description || !date || !startTime || !endTime) {
    const error = new Error('Title, description, date, start time, and end time are required');
    error.statusCode = 400;
    throw error;
  }

  // Validate that end time is after start time
  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);
  
  if (end <= start) {
    const error = new Error('End time must be after start time');
    error.statusCode = 400;
    throw error;
  }

  // Check if user is core team member
  if (user.userType !== 'core') {
    const error = new Error('Only core team members can create activities');
    error.statusCode = 403;
    throw error;
  }

  const activityData = {
    title: title.trim(),
    description: description.trim(),
    date,
    startTime,
    endTime,
    createdBy: user.userId,
    createdByName: user.name || user.username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    participantCount: 0
  };

  const docRef = await firestore.collection('activities').add(activityData);
  
  console.log(`Activity created by ${user.name || user.username}: ${title}`);
  
  return {
    activityId: docRef.id,
    activity: { id: docRef.id, ...activityData }
  };
}

/**
 * Get all activities
 */
async function getAllActivities() {
  const snapshot = await firestore
    .collection('activities')
    .where('status', '==', 'active')
    .get();

  const activities = [];
  snapshot.forEach(doc => {
    const activityData = doc.data();
    
    // Fix createdByName if it looks like a username (contains underscores)
    if (activityData.createdByName && activityData.createdByName.includes('_')) {
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

  return { activities };
}

/**
 * Get activities created by user (Core team)
 */
async function getUserActivities(userId, userType, userName) {
  // Check if user is core team member
  if (userType !== 'core') {
    const error = new Error('Only core team members can access this endpoint');
    error.statusCode = 403;
    throw error;
  }

  const snapshot = await firestore
    .collection('activities')
    .where('createdBy', '==', userId)
    .get();

  const activities = [];
  snapshot.forEach(doc => {
    const activityData = doc.data();
    
    // Fix createdByName if it looks like a username and use current user's name
    if (userName && (activityData.createdByName !== userName)) {
      activityData.createdByName = userName;
    }
    
    activities.push({
      id: doc.id,
      ...activityData
    });
  });

  // Sort by creation date (newest first)
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { activities };
}

/**
 * Update activity (Creator only)
 */
async function updateActivity(id, data, userId) {
  const { title, description, date, startTime, endTime } = data;

  // Get the activity to check ownership
  const activityDoc = await firestore.collection('activities').doc(id).get();
  
  if (!activityDoc.exists) {
    const error = new Error('Activity not found');
    error.statusCode = 404;
    throw error;
  }

  const activity = activityDoc.data();
  
  // Check if user is the creator
  if (activity.createdBy !== userId) {
    const error = new Error('Only the creator can update this activity');
    error.statusCode = 403;
    throw error;
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
      const error = new Error('End time must be after start time');
      error.statusCode = 400;
      throw error;
    }
  }

  await firestore.collection('activities').doc(id).update(updateData);

  return { message: 'Activity updated successfully' };
}

/**
 * Delete activity (Creator only)
 */
async function deleteActivity(id, userId) {
  // Get the activity to check ownership
  const activityDoc = await firestore.collection('activities').doc(id).get();
  
  if (!activityDoc.exists) {
    const error = new Error('Activity not found');
    error.statusCode = 404;
    throw error;
  }

  const activity = activityDoc.data();
  
  // Check if user is the creator
  if (activity.createdBy !== userId) {
    const error = new Error('Only the creator can delete this activity');
    error.statusCode = 403;
    throw error;
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

  return { message: 'Activity deleted successfully' };
}

/**
 * Join/leave activity participation
 */
async function updateParticipation(id, participating, user) {
  // Check if activity exists
  const activityDoc = await firestore.collection('activities').doc(id).get();
  
  if (!activityDoc.exists) {
    const error = new Error('Activity not found');
    error.statusCode = 404;
    throw error;
  }

  const activity = activityDoc.data();

  // Check if activity is still active
  if (activity.status !== 'active') {
    const error = new Error('Activity is no longer active');
    error.statusCode = 400;
    throw error;
  }

  // Check for existing participation
  const participationQuery = await firestore
    .collection('activity_participants')
    .where('activityId', '==', id)
    .where('userId', '==', user.userId)
    .get();

  const isCurrentlyParticipating = !participationQuery.empty;

  if (participating) {
    // User wants to participate
    if (isCurrentlyParticipating) {
      const error = new Error('Already participating in this activity');
      error.statusCode = 400;
      throw error;
    }

    // Add participation record
    const participationData = {
      activityId: id,
      userId: user.userId,
      username: user.name || user.username,
      userType: user.userType,
      joinedAt: new Date().toISOString()
    };

    await firestore.collection('activity_participants').add(participationData);

    // Update participant count
    await firestore.collection('activities').doc(id).update({
      participantCount: activity.participantCount + 1,
      updatedAt: new Date().toISOString()
    });

    console.log(`${user.name || user.username} joined activity: ${activity.title}`);
    return { message: 'Successfully joined activity' };

  } else {
    // User wants to leave
    if (!isCurrentlyParticipating) {
      const error = new Error('Not currently participating in this activity');
      error.statusCode = 400;
      throw error;
    }

    // Remove participation record
    const participationDoc = participationQuery.docs[0];
    await participationDoc.ref.delete();

    // Update participant count
    await firestore.collection('activities').doc(id).update({
      participantCount: Math.max(0, activity.participantCount - 1),
      updatedAt: new Date().toISOString()
    });

    console.log(`${user.name || user.username} left activity: ${activity.title}`);
    return { message: 'Successfully left activity' };
  }
}

/**
 * Get participants for an activity
 */
async function getParticipants(id) {
  // Check if activity exists
  const activityDoc = await firestore.collection('activities').doc(id).get();
  
  if (!activityDoc.exists) {
    const error = new Error('Activity not found');
    error.statusCode = 404;
    throw error;
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
      name: data.username,
      userType: data.userType,
      joinedAt: data.joinedAt
    });
  });

  // Sort by join date
  participants.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

  return { participants };
}

/**
 * Get user's participation status for all activities
 */
async function getUserParticipation(userId) {
  const participationSnapshot = await firestore
    .collection('activity_participants')
    .where('userId', '==', userId)
    .get();

  const participatingActivityIds = [];
  participationSnapshot.forEach(doc => {
    participatingActivityIds.push(doc.data().activityId);
  });

  return { participatingActivityIds };
}

module.exports = {
  createActivity,
  getAllActivities,
  getUserActivities,
  updateActivity,
  deleteActivity,
  updateParticipation,
  getParticipants,
  getUserParticipation
};
