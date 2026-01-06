const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');

const router = express.Router();

/**
 * @route   POST /api/responsibilities
 * @desc    Create a new responsibility
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, date, time } = req.body;
    
    if (!title || !date || !time) {
      return res.status(400).json({ error: 'Title, date, and time are required' });
    }

    const taskData = {
      title,
      description: description || '',
      date,
      time,
      userId: req.user.userId,
      username: req.user.username,
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      updatedAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('tasks').add(taskData);
    
    res.status(201).json({
      message: 'Responsibility created successfully',
      taskId: docRef.id,
      task: { id: docRef.id, ...taskData }
    });
  } catch (error) {
    console.error('Error creating responsibility:', error);
    res.status(500).json({ error: 'Failed to create responsibility' });
  }
});

/**
 * @route   GET /api/responsibilities
 * @desc    Get user's responsibilities
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  console.log('GET /api/responsibilities route hit by user:', req.user.userId);
  try {
    // Use a simpler query without orderBy to avoid index requirement
    const snapshot = await firestore
      .collection('tasks')
      .where('userId', '==', req.user.userId)
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

    console.log(`Found ${tasks.length} tasks for user ${req.user.userId}`);
    res.json({ tasks });
  } catch (error) {
    console.error('Error getting responsibilities:', error);
    res.status(500).json({ error: 'Failed to get responsibilities' });
  }
});

/**
 * @route   GET /api/responsibilities/all
 * @desc    Get all responsibilities (community view)
 * @access  Private
 */
router.get('/all', authenticateToken, async (req, res) => {
  console.log('GET /api/responsibilities/all route hit by user:', req.user.userId);
  try {
    // Use a simpler query without orderBy to avoid index requirement
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

    console.log(`Found ${tasks.length} total tasks for community view`);
    res.json({ tasks });
  } catch (error) {
    console.error('Error getting all responsibilities:', error);
    res.status(500).json({ error: 'Failed to get responsibilities' });
  }
});

/**
 * @route   PUT /api/responsibilities/:id
 * @desc    Update responsibility
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, title, description } = req.body;

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

    res.json({ message: 'Responsibility updated successfully' });
  } catch (error) {
    console.error('Error updating responsibility:', error);
    res.status(500).json({ error: 'Failed to update responsibility' });
  }
});

/**
 * @route   DELETE /api/responsibilities/:id
 * @desc    Delete responsibility
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ownership
    const doc = await firestore.collection('tasks').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const task = doc.data();
    if (task.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this responsibility' });
    }

    await firestore.collection('tasks').doc(id).delete();

    res.json({ message: 'Responsibility deleted successfully' });
  } catch (error) {
    console.error('Error deleting responsibility:', error);
    res.status(500).json({ error: 'Failed to delete responsibility' });
  }
});

/**
 * @route   GET /api/responsibilities/dates
 * @desc    Get unique dates with task counts
 * @access  Private
 */
router.get('/dates', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.query;
    
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

    res.json({ dates });
  } catch (error) {
    console.error('Error getting task dates:', error);
    res.status(500).json({ error: 'Failed to get task dates' });
  }
});

/**
 * @route   GET /api/responsibilities/stats
 * @desc    Get task statistics for user
 * @access  Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const snapshot = await firestore
      .collection('tasks')
      .where('userId', '==', req.user.userId)
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

    res.json({ stats });
  } catch (error) {
    console.error('Error getting task statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;