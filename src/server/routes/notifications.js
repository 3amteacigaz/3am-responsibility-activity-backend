const express = require('express');
const webpush = require('web-push');
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');

const router = express.Router();

// Configure web-push with VAPID keys
// Generate keys using: node -e "console.log(require('web-push').generateVAPIDKeys())"
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BC_xnlEBNqyjEt8KsnJu7OkDjBvop4S3ERUFpqpF9rfXeOdVHt0wq3_qa_DlY6iqlo-rKq4uCKS0MI-uIfOW9Z4',
  privateKey: process.env.VAPID_PRIVATE_KEY || '98wJAr89T66LyHo1SNDxvRBjNmk98ArDaQLKR2iIPKQ'
};

webpush.setVapidDetails(
  'mailto:admin@3amcore.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

console.log('🔔 Web Push configured with VAPID keys');

/**
 * Helper function to get all users (core and in-house)
 */
const getAllUsers = async () => {
  try {
    // Get core users from JSON file
    const fs = require('fs').promises;
    const path = require('path');
    const PROFILES_FILE = path.join(process.cwd(), 'data', 'core-profiles.json');
    
    const data = await fs.readFile(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(data);
    
    const coreUsers = profiles.profiles.map(profile => ({
      userId: profile.id,
      name: profile.name,
      username: profile.username,
      email: profile.email,
      userType: 'core'
    }));

    // Get in-house users from Firebase (you might need to implement this based on your user storage)
    // For now, we'll return just core users
    // TODO: Add in-house users from Firebase Auth or user collection
    
    return {
      coreUsers,
      inHouseUsers: [], // TODO: Implement in-house user fetching
      allUsers: [...coreUsers]
    };
  } catch (error) {
    console.error('Error getting users:', error);
    return { coreUsers: [], inHouseUsers: [], allUsers: [] };
  }
};

/**
 * Helper function to send push notification to user
 */
const sendPushNotification = async (subscription, payload) => {
  try {
    console.log('🔔 Attempting to send push notification...');
    console.log('📱 Subscription endpoint:', subscription.endpoint?.substring(0, 50) + '...');
    console.log('📤 Payload:', payload);
    
    const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log('✅ Push notification sent successfully');
    console.log('📊 Result status:', result.statusCode);
    return true;
  } catch (error) {
    console.error('❌ Error sending push notification:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error status:', error.statusCode);
    console.error('❌ Error headers:', error.headers);
    
    // Handle specific web-push errors
    if (error.statusCode === 410) {
      console.error('🗑️ Subscription is no longer valid (410 Gone)');
      // TODO: Remove invalid subscription from database
    } else if (error.statusCode === 413) {
      console.error('📦 Payload too large (413)');
    } else if (error.statusCode === 429) {
      console.error('⏰ Rate limited (429)');
    } else if (error.statusCode >= 400 && error.statusCode < 500) {
      console.error('🚫 Client error:', error.statusCode);
    } else if (error.statusCode >= 500) {
      console.error('🔥 Server error:', error.statusCode);
    }
    
    return false;
  }
};

/**
 * Helper function to get user's push subscription
 */
const getUserPushSubscription = async (userId) => {
  try {
    const doc = await firestore.collection('push_subscriptions').doc(userId).get();
    if (doc.exists) {
      return doc.data().subscription;
    }
    return null;
  } catch (error) {
    console.error('Error getting push subscription:', error);
    return null;
  }
};
/**
 * Helper function to create notification document and send push notification
 */
const createNotification = async (notification) => {
  try {
    const notificationData = {
      ...notification,
      createdAt: new Date().toISOString(),
      read: false,
      id: firestore.collection('notifications').doc().id
    };

    // Save to database
    await firestore.collection('notifications').add(notificationData);
    console.log(`📢 Notification created: ${notification.type} for ${notification.targetUserType || 'specific user'}`);
    
    // Send push notification if user has subscription
    const subscription = await getUserPushSubscription(notification.targetUserId);
    if (subscription) {
      const pushPayload = {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        activityId: notification.activityId,
        priority: notification.priority,
        tag: notification.type
      };
      
      await sendPushNotification(subscription, pushPayload);
    } else {
      console.log(`📱 No push subscription found for user ${notification.targetUserId}`);
    }
    
    return notificationData;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * @route   POST /api/notifications/activity-created
 * @desc    Send notification when new activity is created
 * @access  Private (Core team only)
 */
router.post('/activity-created', authenticateToken, async (req, res) => {
  try {
    const { activityId, activityTitle, activityDate, activityTime } = req.body;
    
    if (!activityId || !activityTitle || !activityDate) {
      return res.status(400).json({ error: 'Activity details are required' });
    }

    // Only core team can create activities
    if (req.user.userType !== 'core') {
      return res.status(403).json({ error: 'Only core team members can create activities' });
    }

    const { allUsers } = await getAllUsers();
    
    // Create notifications for all users (core + in-house)
    const notifications = [];
    
    for (const user of allUsers) {
      // Don't notify the creator
      if (user.userId === req.user.userId) continue;
      
      const notification = await createNotification({
        type: 'activity_created',
        title: '🎯 New Activity Created',
        message: `${req.user.name || req.user.username} created a new activity: "${activityTitle}" on ${activityDate}${activityTime ? ` at ${activityTime}` : ''}`,
        targetUserId: user.userId,
        targetUserType: user.userType,
        createdBy: req.user.userId,
        createdByName: req.user.name || req.user.username,
        activityId,
        activityTitle,
        activityDate,
        priority: 'high'
      });
      
      notifications.push(notification);
    }

    console.log(`📢 Activity creation notifications sent to ${notifications.length} users`);
    
    res.json({
      message: 'Activity creation notifications sent successfully',
      notificationsSent: notifications.length,
      activityTitle
    });
  } catch (error) {
    console.error('Error sending activity creation notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * @route   POST /api/notifications/activity-participation
 * @desc    Send notification when someone participates in activity
 * @access  Private
 */
router.post('/activity-participation', authenticateToken, async (req, res) => {
  try {
    const { activityId, activityTitle, participating } = req.body;
    
    if (!activityId || !activityTitle || participating === undefined) {
      return res.status(400).json({ error: 'Activity details and participation status are required' });
    }

    const { allUsers } = await getAllUsers();
    const notifications = [];
    
    if (participating) {
      // User is participating - notify everyone
      for (const user of allUsers) {
        // Don't notify the participant themselves
        if (user.userId === req.user.userId) continue;
        
        const notification = await createNotification({
          type: 'activity_participation',
          title: '✅ Someone Joined Activity',
          message: `${req.user.name || req.user.username} is participating in "${activityTitle}"`,
          targetUserId: user.userId,
          targetUserType: user.userType,
          createdBy: req.user.userId,
          createdByName: req.user.name || req.user.username,
          activityId,
          activityTitle,
          participationStatus: 'participating',
          priority: 'medium'
        });
        
        notifications.push(notification);
      }
      
      console.log(`📢 Participation notifications sent to ${notifications.length} users`);
    } else {
      // User is NOT participating - notify only core team
      const coreUsers = allUsers.filter(user => user.userType === 'core');
      
      for (const user of coreUsers) {
        // Don't notify if the non-participant is also core team
        if (user.userId === req.user.userId) continue;
        
        const notification = await createNotification({
          type: 'activity_non_participation',
          title: '❌ Someone Not Participating',
          message: `${req.user.name || req.user.username} is NOT participating in "${activityTitle}"`,
          targetUserId: user.userId,
          targetUserType: user.userType,
          createdBy: req.user.userId,
          createdByName: req.user.name || req.user.username,
          activityId,
          activityTitle,
          participationStatus: 'not_participating',
          priority: 'high' // High priority for core team to know about non-participation
        });
        
        notifications.push(notification);
      }
      
      console.log(`📢 Non-participation notifications sent to ${notifications.length} core team members`);
    }

    res.json({
      message: `${participating ? 'Participation' : 'Non-participation'} notifications sent successfully`,
      notificationsSent: notifications.length,
      targetAudience: participating ? 'all users' : 'core team only'
    });
  } catch (error) {
    console.error('Error sending participation notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for current user
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, unreadOnly = false } = req.query;
    
    let query = firestore
      .collection('notifications')
      .where('targetUserId', '==', req.user.userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    if (unreadOnly === 'true') {
      query = query.where('read', '==', false);
    }
    
    const snapshot = await query.get();
    const notifications = [];
    
    snapshot.forEach(doc => {
      notifications.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    const unreadCount = unreadOnly === 'true' ? notifications.length : 
      notifications.filter(n => !n.read).length;
    
    res.json({
      notifications,
      unreadCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notificationRef = firestore.collection('notifications').doc(id);
    const doc = await notificationRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    const notification = doc.data();
    
    // Check if user owns this notification
    if (notification.targetUserId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await notificationRef.update({
      read: true,
      readAt: new Date().toISOString()
    });
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * @route   PUT /api/notifications/mark-all-read
 * @desc    Mark all notifications as read for current user
 * @access  Private
 */
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const snapshot = await firestore
      .collection('notifications')
      .where('targetUserId', '==', req.user.userId)
      .where('read', '==', false)
      .get();
    
    const batch = firestore.batch();
    let updateCount = 0;
    
    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        read: true,
        readAt: new Date().toISOString()
      });
      updateCount++;
    });
    
    if (updateCount > 0) {
      await batch.commit();
    }
    
    res.json({
      message: 'All notifications marked as read',
      updatedCount: updateCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * @route   POST /api/notifications/push-subscription
 * @desc    Save user's push notification subscription
 * @access  Private
 */
router.post('/push-subscription', authenticateToken, async (req, res) => {
  try {
    const { subscription, userAgent, timestamp } = req.body;
    
    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data is required' });
    }

    const subscriptionData = {
      userId: req.user.userId,
      username: req.user.name || req.user.username,
      userType: req.user.userType,
      subscription,
      userAgent: userAgent || 'Unknown',
      createdAt: timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save subscription with userId as document ID for easy lookup
    await firestore.collection('push_subscriptions').doc(req.user.userId).set(subscriptionData);
    
    console.log(`🔔 Push subscription saved for ${req.user.name || req.user.username}`);
    
    res.json({
      message: 'Push subscription saved successfully',
      userId: req.user.userId
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

/**
 * @route   DELETE /api/notifications/push-subscription
 * @desc    Remove user's push notification subscription
 * @access  Private
 */
router.delete('/push-subscription', authenticateToken, async (req, res) => {
  try {
    await firestore.collection('push_subscriptions').doc(req.user.userId).delete();
    
    console.log(`🔔 Push subscription removed for ${req.user.name || req.user.username}`);
    
    res.json({
      message: 'Push subscription removed successfully'
    });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

/**
 * @route   GET /api/notifications/debug/subscription
 * @desc    Debug endpoint to check user's push subscription
 * @access  Private
 */
router.get('/debug/subscription', authenticateToken, async (req, res) => {
  try {
    console.log(`🔍 Debug: Checking subscription for user ${req.user.userId}`);
    
    const doc = await firestore.collection('push_subscriptions').doc(req.user.userId).get();
    
    if (!doc.exists) {
      return res.json({
        message: 'No subscription found',
        userId: req.user.userId,
        hasSubscription: false
      });
    }
    
    const subscriptionData = doc.data();
    
    res.json({
      message: 'Subscription found',
      userId: req.user.userId,
      hasSubscription: true,
      subscriptionInfo: {
        endpoint: subscriptionData.subscription?.endpoint?.substring(0, 50) + '...',
        hasKeys: !!(subscriptionData.subscription?.keys),
        userAgent: subscriptionData.userAgent,
        createdAt: subscriptionData.createdAt,
        updatedAt: subscriptionData.updatedAt
      }
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
});

/**
 * @route   POST /api/notifications/test-push
 * @desc    Send test push notification to current user
 * @access  Private
 */
router.post('/test-push', authenticateToken, async (req, res) => {
  try {
    console.log(`🧪 Test push notification requested by ${req.user.name || req.user.username}`);
    
    const subscription = await getUserPushSubscription(req.user.userId);
    
    if (!subscription) {
      console.log(`❌ No push subscription found for user ${req.user.userId}`);
      return res.status(404).json({ error: 'No push subscription found for user. Please enable notifications first.' });
    }

    console.log('📱 Found subscription for user:', req.user.userId);
    console.log('📱 Subscription endpoint:', subscription.endpoint?.substring(0, 50) + '...');

    const testPayload = {
      title: '🧪 Test Notification',
      message: `Hello ${req.user.name || req.user.username}! Push notifications are working correctly.`,
      type: 'test',
      priority: 'normal',
      tag: 'test-notification'
    };

    console.log('📤 Sending test push notification with payload:', testPayload);
    const success = await sendPushNotification(subscription, testPayload);
    
    if (success) {
      console.log('✅ Test push notification sent successfully');
      res.json({
        message: 'Test push notification sent successfully',
        payload: testPayload,
        userId: req.user.userId
      });
    } else {
      console.log('❌ Failed to send test push notification');
      res.status(500).json({ error: 'Failed to send test push notification. Check server logs for details.' });
    }
  } catch (error) {
    console.error('❌ Error sending test push notification:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to send test push notification', 
      details: error.message,
      userId: req.user?.userId 
    });
  }
});

module.exports = router;