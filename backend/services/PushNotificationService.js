const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// Create a dedicated pool for the GLOBAL device-token registry.
// Device tokens are shared across all branches, so this uses its own fixed DB
// (independent of the per-branch DB_NAME).
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.PUSH_DB || process.env.DEVICE_DB || 'skoolific',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

/**
 * PushNotificationService
 * 
 * Handles Firebase Cloud Messaging (FCM) push notifications for mobile apps.
 * Uses Firebase Admin SDK with service account credentials.
 * 
 * Features:
 * - Send notifications to individual users
 * - Send bulk notifications to multiple users
 * - Automatic token management and cleanup
 * - Support for data payloads and notification payloads
 * - Error handling and invalid token removal
 * 
 * Usage:
 *   const pushService = new PushNotificationService();
 *   await pushService.initialize();
 *   await pushService.sendToUser(userId, userType, notification);
 */
class PushNotificationService {
  constructor() {
    this.initialized = false;
    this.app = null;
  }

  /**
   * Initialize Firebase Admin SDK
   * Loads service account credentials from firebase-service-account.json
   * 
   * @throws {Error} If credentials file is missing or invalid
   */
  async initialize() {
    if (this.initialized) {
      console.log('✅ Firebase Admin SDK already initialized');
      return;
    }

    try {
      // Path to service account JSON file
      const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

      // Check if file exists
      if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(
          'Firebase service account file not found at: ' + serviceAccountPath + '\n' +
          'Please download your service account JSON from Firebase Console and save it as firebase-service-account.json'
        );
      }

      // Load service account credentials
      const serviceAccount = require(serviceAccountPath);

      // Initialize Firebase Admin SDK
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });

      this.initialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
      console.log(`   Project ID: ${serviceAccount.project_id}`);
      console.log(`   Client Email: ${serviceAccount.client_email}`);
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
      throw error;
    }
  }

  /**
   * Send push notification to a single user
   * 
   * @param {number} userId - User ID (student_id, staff_id, or guardian_id)
   * @param {string} userType - User type: 'student', 'staff', or 'guardian'
   * @param {Object} notification - Notification object
   * @param {string} notification.title - Notification title
   * @param {string} notification.body - Notification body
   * @param {Object} [notification.data] - Optional data payload
   * @param {string} [notification.imageUrl] - Optional image URL
   * @param {string} [notification.clickAction] - Optional click action (deep link)
   * 
   * @returns {Promise<Object>} Result object with success status and details
   * 
   * @example
   * await pushService.sendToUser(123, 'student', {
   *   title: 'New Exam Published',
   *   body: 'Mathematics exam is now available',
   *   data: { examId: '456', type: 'exam' },
   *   clickAction: '/exams/456'
   * });
   */
  async sendToUser(userId, userType, notification) {
    if (!this.initialized) {
      throw new Error('PushNotificationService not initialized. Call initialize() first.');
    }

    try {
      // Get user's device tokens
      const tokens = await this.getUserTokens(userId, userType);

      if (tokens.length === 0) {
        console.log(`⚠️  No device tokens found for ${userType} ${userId}`);
        return {
          success: false,
          message: 'No device tokens found',
          userId,
          userType
        };
      }

      // Build FCM message
      const message = {
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data || {},
        tokens: tokens
      };

      // Add optional fields
      if (notification.imageUrl) {
        message.notification.imageUrl = notification.imageUrl;
      }

      if (notification.clickAction) {
        message.data.clickAction = notification.clickAction;
      }

      // Send multicast message
      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`✅ Sent notification to ${userType} ${userId}`);
      console.log(`   Success: ${response.successCount}/${tokens.length}`);
      console.log(`   Failed: ${response.failureCount}`);

      // Remove invalid tokens
      if (response.failureCount > 0) {
        await this.removeInvalidTokens(response.responses, tokens, userId, userType);
      }

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTokens: tokens.length,
        userId,
        userType
      };
    } catch (error) {
      console.error(`❌ Failed to send notification to ${userType} ${userId}:`, error.message);
      return {
        success: false,
        error: error.message,
        userId,
        userType
      };
    }
  }

  /**
   * Send push notification to multiple users
   * 
   * @param {Array<Object>} users - Array of user objects
   * @param {number} users[].userId - User ID
   * @param {string} users[].userType - User type: 'student', 'staff', or 'guardian'
   * @param {Object} notification - Notification object (same format as sendToUser)
   * 
   * @returns {Promise<Object>} Result object with success/failure counts
   * 
   * @example
   * await pushService.sendToMultipleUsers(
   *   [
   *     { userId: 1, userType: 'student' },
   *     { userId: 2, userType: 'student' }
   *   ],
   *   {
   *     title: 'School Announcement',
   *     body: 'Tomorrow is a holiday'
   *   }
   * );
   */
  async sendToMultipleUsers(users, notification) {
    if (!this.initialized) {
      throw new Error('PushNotificationService not initialized. Call initialize() first.');
    }

    const results = {
      totalUsers: users.length,
      successCount: 0,
      failureCount: 0,
      details: []
    };

    // Send notifications in parallel (with concurrency limit)
    const BATCH_SIZE = 10; // Process 10 users at a time
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const promises = batch.map(user => 
        this.sendToUser(user.userId, user.userType, notification)
      );

      const batchResults = await Promise.all(promises);

      // Aggregate results
      batchResults.forEach((result, index) => {
        if (result.success) {
          results.successCount++;
        } else {
          results.failureCount++;
        }
        results.details.push({
          userId: batch[index].userId,
          userType: batch[index].userType,
          success: result.success,
          successCount: result.successCount || 0,
          failureCount: result.failureCount || 0
        });
      });
    }

    console.log(`✅ Bulk notification complete:`);
    console.log(`   Total users: ${results.totalUsers}`);
    console.log(`   Success: ${results.successCount}`);
    console.log(`   Failed: ${results.failureCount}`);

    return results;
  }

  /**
   * Get all active device tokens for a user
   * 
   * @param {number} userId - User ID
   * @param {string} userType - User type: 'student', 'staff', or 'guardian'
   * 
   * @returns {Promise<Array<string>>} Array of device tokens
   */
  async getUserTokens(userId, userType) {
    try {
      const result = await pool.query(
        `SELECT device_token 
         FROM user_devices 
         WHERE user_id = $1 
           AND user_type = $2 
           AND is_active = true
         ORDER BY last_used_at DESC`,
        [userId, userType]
      );

      return result.rows.map(row => row.device_token);
    } catch (error) {
      console.error(`❌ Failed to get tokens for ${userType} ${userId}:`, error.message);
      return [];
    }
  }

  /**
   * Remove invalid device tokens from database
   * Called automatically when FCM returns errors for specific tokens
   * 
   * @param {Array<Object>} responses - FCM send responses
   * @param {Array<string>} tokens - Original tokens array
   * @param {number} userId - User ID
   * @param {string} userType - User type
   */
  async removeInvalidTokens(responses, tokens, userId, userType) {
    const invalidTokens = [];

    responses.forEach((response, index) => {
      if (!response.success) {
        const errorCode = response.error?.code;
        
        // Remove tokens with permanent errors
        if (
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[index]);
        }
      }
    });

    if (invalidTokens.length === 0) {
      return;
    }

    try {
      // Mark tokens as inactive
      await pool.query(
        `UPDATE user_devices 
         SET is_active = false 
         WHERE device_token = ANY($1)
           AND user_id = $2
           AND user_type = $3`,
        [invalidTokens, userId, userType]
      );

      console.log(`🗑️  Removed ${invalidTokens.length} invalid tokens for ${userType} ${userId}`);
    } catch (error) {
      console.error('❌ Failed to remove invalid tokens:', error.message);
    }
  }

  /**
   * Register a new device token for a user
   * Called from mobile apps when they receive FCM token
   * 
   * @param {number} userId - User ID
   * @param {string} userType - User type: 'student', 'staff', or 'guardian'
   * @param {string} deviceToken - FCM device token
   * @param {Object} [deviceInfo] - Optional device information
   * @param {string} [deviceInfo.deviceType] - 'android', 'ios', or 'web'
   * @param {string} [deviceInfo.deviceName] - Device model/name
   * @param {string} [deviceInfo.appVersion] - App version
   * @param {string} [deviceInfo.osVersion] - OS version
   * 
   * @returns {Promise<Object>} Result object
   */
  async registerDeviceToken(userId, userType, deviceToken, deviceInfo = {}) {
    try {
      // Check if token already exists
      const existing = await pool.query(
        'SELECT id FROM user_devices WHERE device_token = $1',
        [deviceToken]
      );

      if (existing.rows.length > 0) {
        // Update existing token
        await pool.query(
          `UPDATE user_devices 
           SET user_id = $1,
               user_type = $2,
               device_type = $3,
               device_name = $4,
               app_version = $5,
               os_version = $6,
               is_active = true,
               last_used_at = CURRENT_TIMESTAMP
           WHERE device_token = $7`,
          [
            userId,
            userType,
            deviceInfo.deviceType || null,
            deviceInfo.deviceName || null,
            deviceInfo.appVersion || null,
            deviceInfo.osVersion || null,
            deviceToken
          ]
        );

        console.log(`✅ Updated device token for ${userType} ${userId}`);
      } else {
        // Insert new token
        await pool.query(
          `INSERT INTO user_devices (
             user_id, user_type, device_token, device_type, 
             device_name, app_version, os_version
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            userType,
            deviceToken,
            deviceInfo.deviceType || null,
            deviceInfo.deviceName || null,
            deviceInfo.appVersion || null,
            deviceInfo.osVersion || null
          ]
        );

        console.log(`✅ Registered new device token for ${userType} ${userId}`);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Failed to register device token:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unregister a device token
   * Called when user logs out or uninstalls app
   * 
   * @param {string} deviceToken - FCM device token
   * 
   * @returns {Promise<Object>} Result object
   */
  async unregisterDeviceToken(deviceToken) {
    try {
      await pool.query(
        'UPDATE user_devices SET is_active = false WHERE device_token = $1',
        [deviceToken]
      );

      console.log('✅ Unregistered device token');
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to unregister device token:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const pushNotificationService = new PushNotificationService();
module.exports = pushNotificationService;
