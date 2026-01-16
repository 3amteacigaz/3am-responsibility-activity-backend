/**
 * Notifications Service
 * Handles notification management and push notifications
 * 
 * NOTE: Web Push functionality requires Node.js 'web-push' library
 */

const { firestore } = require('../config/firebase');

/**
 * Get user's push subscription
 */
async function getUserPushSubscription(userId, env = null) {
  try {
    const firestore = getFirestore(env);
    const doc = await firestore.collection('push_subscriptions').doc(userId).get();
    if (doc.exists) {
      return doc.data().subscription;
    }
    return null;
  } catch (error) {
    console.error('Error getting push subscription:', error);
    return null;
  }
}

/**
 * Save user's push notification subscription
 */
async function savePushSubscription(data, user, env = null) {
  const { subscription, userAgent, timestamp } = data;
  
  if (!subscription) {
    const error = new Error('Subscription data is required');
    error.statusCode = 400;
    throw error;
  }

  const firestore = getFirestore(env);

  const subscriptionData = {
    userId: user.userId,
    username: user.name || user.username,
    userType: user.userType,
    subscription,
    userAgent: userAgent || 'Unknown',
    createdAt: timestamp || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save subscription with userId as document ID for easy lookup
  await firestore.collection('push_subscriptions').doc(user.userId).set(subscriptionData);
  
  console.log(`🔔 Push subscription saved for ${user.name || user.username}`);
  
  return {
    message: 'Push subscription saved successfully',
    userId: user.userId
  };
}

/**
 * Remove user's push notification subscription
 */
async function removePushSubscription(userId, env = null) {
  const firestore = getFirestore(env);
  
  await firestore.collection('push_subscriptions').doc(userId).delete();
  
  console.log(`🔔 Push subscription removed for user ${userId}`);
  
  return {
    message: 'Push subscription removed successfully'
  };
}

/**
 * Get notifications for user
 */
async function getUserNotifications(userId, options = {}, env = null) {
  const { limit = 20, unreadOnly = false } = options;
  
  const firestore = getFirestore(env);
  
  let query = firestore
    .collection('notifications')
    .where('targetUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(parseInt(limit));
  
  if (unreadOnly) {
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
  
  const unreadCount = unreadOnly ? notifications.length : 
    notifications.filter(n => !n.read).length;
  
  return {
    notifications,
    unreadCount,
    total: notifications.length
  };
}

/**
 * Mark notification as read
 */
async function markNotificationAsRead(notificationId, userId, env = null) {
  const firestore = getFirestore(env);
  
  const notificationRef = firestore.collection('notifications').doc(notificationId);
  const doc = await notificationRef.get();
  
  if (!doc.exists) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    throw error;
  }
  
  const notification = doc.data();
  
  // Check if user owns this notification
  if (notification.targetUserId !== userId) {
    const error = new Error('Access denied');
    error.statusCode = 403;
    throw error;
  }
  
  await notificationRef.update({
    read: true,
    readAt: new Date().toISOString()
  });
  
  return { message: 'Notification marked as read' };
}

/**
 * Mark all notifications as read for user
 */
async function markAllNotificationsAsRead(userId, env = null) {
  const firestore = getFirestore(env);
  
  const snapshot = await firestore
    .collection('notifications')
    .where('targetUserId', '==', userId)
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
  
  return {
    message: 'All notifications marked as read',
    updatedCount: updateCount
  };
}

/**
 * Create notification document
 */
async function createNotification(notification, env = null) {
  try {
    const firestore = getFirestore(env);
    
    const notificationData = {
      ...notification,
      createdAt: new Date().toISOString(),
      read: false,
      id: firestore.collection('notifications').doc().id
    };

    // Save to database
    await firestore.collection('notifications').add(notificationData);
    console.log(`📢 Notification created: ${notification.type} for ${notification.targetUserType || 'specific user'}`);
    
    return notificationData;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

module.exports = {
  getUserPushSubscription,
  savePushSubscription,
  removePushSubscription,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification
};
