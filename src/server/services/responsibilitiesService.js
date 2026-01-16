/**
 * Responsibilities Service
 * Handles task/responsibility management logic
 */

const { firestore } = require('../config/firebase');

/**
 * Create a new responsibility
 */
async function createResponsibility(data, user, env = null) {
  const { title, description, date, time } = data;
  
  if (!title || !date || !time) {
    const error = new Error('Title, date, and time are required');
    error.statusCode = 400;
    throw error;
  }

  const firestore = getFirestore(env);

  const taskData = {
    title,
    description: description || '',
    date,
    time,
    userId: user.userId,
    username: user.username,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
    updatedAt: new Date().toISOString()
  };

  const docRef = await firestore.collection('tasks').add(taskData);
  
  return {
    taskId: docRef.id,
    task: { id: docRef.id, ...taskData }
  };
}

/**
 * Get user's responsibilities
 */
async function getUserResponsibilities(userId, env = null) {
  const firestore = getFirestore(env);

  const snapshot = await firestore
    .collection('tasks')
    .where('userId', '==', userId)
    .get();

  const tasks = [];
  snapshot.forEach(doc => {
    tasks.push({
      _id: doc.id,
      ...doc.data()
    });
  });

  // Sort in JavaScript instead of Firestore
  tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { tasks };
}

/**
 * Get all responsibilities (community view)
 */
async function getAllResponsibilities(env = null) {
  const firestore = getFirestore(env);

  const snapshot = await firestore
    .collection('tasks')
    .get();

  const tasks = [];
  snapshot.forEach(doc => {
    tasks.push({
      _id: doc.id,
      ...doc.data()
    });
  });

  // Sort in JavaScript instead of Firestore
  tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { tasks };
}

/**
 * Update responsibility
 */
async function updateResponsibility(id, data, env = null) {
  const { completed, title, description } = data;
  const firestore = getFirestore(env);

  const updateData = {
    updatedAt: new Date().toISOString()
  };

  if (completed !== undefined) {
    updateData.completed = completed;
    updateData.completedAt = completed ? new Date().toISOString() : null;
  }

  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;

  await firestore.collection('tasks').doc(id).update(updateData);

  return { message: 'Responsibility updated successfully' };
}

/**
 * Delete responsibility
 */
async function deleteResponsibility(id, userId, env = null) {
  const firestore = getFirestore(env);
  
  // Verify ownership
  const doc = await firestore.collection('tasks').doc(id).get();
  if (!doc.exists) {
    const error = new Error('Responsibility not found');
    error.statusCode = 404;
    throw error;
  }

  const task = doc.data();
  if (task.userId !== userId) {
    const error = new Error('Not authorized to delete this responsibility');
    error.statusCode = 403;
    throw error;
  }

  await firestore.collection('tasks').doc(id).delete();

  return { message: 'Responsibility deleted successfully' };
}

/**
 * Get unique dates with task counts
 */
async function getTaskDates(userId, env = null) {
  const firestore = getFirestore(env);
  
  let query = firestore.collection('tasks');
  if (userId && userId !== 'all') {
    query = query.where('userId', '==', userId);
  }

  const snapshot = await query.get();
  const dateMap = new Map();

  snapshot.forEach(doc => {
    const data = doc.data();
    const date = data.date;
    if (dateMap.has(date)) {
      dateMap.set(date, dateMap.get(date) + 1);
    } else {
      dateMap.set(date, 1);
    }
  });

  const dates = Array.from(dateMap.entries()).map(([date, count]) => ({
    date,
    count
  }));

  // Sort dates (newest first)
  dates.sort((a, b) => b.date.localeCompare(a.date));

  return { dates };
}

/**
 * Get task statistics for user
 */
async function getTaskStats(userId, env = null) {
  const firestore = getFirestore(env);

  const snapshot = await firestore
    .collection('tasks')
    .where('userId', '==', userId)
    .get();

  let total = 0;
  let completed = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    total++;
    if (data.completed) completed++;
  });

  const stats = {
    total,
    completed,
    pending: total - completed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
  };

  return { stats };
}

module.exports = {
  createResponsibility,
  getUserResponsibilities,
  getAllResponsibilities,
  updateResponsibility,
  deleteResponsibility,
  getTaskDates,
  getTaskStats
};
