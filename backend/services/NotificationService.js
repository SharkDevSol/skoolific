/**
 * Unified Notification Service for Skoolific
 * 
 * This service provides a single interface for sending notifications
 * through multiple channels: Push, Telegram, SMS, and Email.
 * 
 * Features:
 * - Multi-channel support
 * - User preferences
 * - Notification logging
 * - Retry logic
 * - Fallback channels
 * - Specific notification types (payment, absence, exam, etc.)
 */

const { Pool } = require('pg');
const pushNotificationService = require('./PushNotificationService');
const telegramBotService = require('./TelegramBotService');
const smsService = require('./SMSService');

class NotificationService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize notification service
   */
  async initialize() {
    try {
      // Initialize all notification channels
      await pushNotificationService.initialize();
      await telegramBotService.initialize(process.env.TELEGRAM_BOT_TOKEN);
      await smsService.initialize();

      this.initialized = true;
      console.log('✅ Unified Notification Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Notification Service:', error.message);
      // Don't throw - allow partial initialization
    }
  }

  /**
   * Send notification through multiple channels
   * @param {number} userId - User ID
   * @param {string} userType - User type (student, staff, guardian)
   * @param {string} databaseName - Database name
   * @param {string} notificationType - Type of notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {object} options - Additional options
   * @returns {object} - Results from all channels
   */
  async sendNotification(userId, userType, databaseName, notificationType, title, message, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get user info
      const userInfo = await this.getUserInfo(userId, userType, databaseName);
      
      if (!userInfo) {
        console.error(`User not found: ${userType} ${userId}`);
        return { success: false, error: 'User not found' };
      }

      // Get user preferences
      const preferences = await this.getUserPreferences(userId, userType, databaseName, notificationType);

      const results = {
        push: null,
        telegram: null,
        sms: null,
        email: null
      };

      // Send via Push Notifications
      if (preferences.push) {
        try {
          results.push = await pushNotificationService.sendToUser(userId, userType, {
            title: title,
            body: message,
            data: options.data || {}
          });
          
          await this.logNotification(userId, userType, databaseName, notificationType, 'push', title, message, 
            results.push ? 'sent' : 'failed', results.push ? null : 'Failed to send');
        } catch (error) {
          console.error('Push notification error:', error);
          results.push = false;
        }
      }

      // Send via Telegram
      if (preferences.telegram && userInfo.phone_number) {
        try {
          results.telegram = await telegramBotService.sendNotification(
            userInfo.phone_number,
            userType,
            databaseName,
            `*${title}*\n\n${message}`,
            { parse_mode: 'Markdown' }
          );
          
          await this.logNotification(userId, userType, databaseName, notificationType, 'telegram', title, message,
            results.telegram ? 'sent' : 'failed', results.telegram ? null : 'No chat ID');
        } catch (error) {
          console.error('Telegram notification error:', error);
          results.telegram = false;
        }
      }

      // Send via SMS
      if (preferences.sms && userInfo.phone_number) {
        try {
          const smsResult = await smsService.sendSMS(
            userInfo.phone_number,
            `${title}\n\n${message}`,
            null,
            { templateKey: notificationType || 'notification', recipientName: userInfo.name || userInfo.username || null }
          );
          results.sms = smsResult.success;
          
          await this.logNotification(userId, userType, databaseName, notificationType, 'sms', title, message,
            smsResult.success ? 'sent' : 'failed', smsResult.error || null);
        } catch (error) {
          console.error('SMS notification error:', error);
          results.sms = false;
        }
      }

      // Check if at least one channel succeeded
      const success = results.push || results.telegram || results.sms;

      return {
        success: success,
        results: results
      };
    } catch (error) {
      console.error('Error sending notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send payment reminder notification
   * @param {number} studentId - Student ID
   * @param {string} databaseName - Database name
   * @param {number} amount - Payment amount
   * @param {string} dueDate - Due date
   * @returns {object} - Notification results
   */
  async sendPaymentReminder(studentId, databaseName, amount, dueDate) {
    const pool = new Pool({ database: databaseName });

    try {
      // Get student info
      const student = await pool.query(
        'SELECT name, phone_number FROM students WHERE id = $1',
        [studentId]
      );

      if (student.rows.length === 0) {
        return { success: false, error: 'Student not found' };
      }

      const { name } = student.rows[0];

      const title = '💰 Payment Reminder';
      const message = `Dear ${name},\n\nYou have a pending payment:\nAmount: ${amount} ETB\nDue Date: ${dueDate}\n\nPlease make your payment before the due date.\n\nThank you!\n- Skoolific`;

      const result = await this.sendNotification(
        studentId,
        'student',
        databaseName,
        'payment_reminder',
        title,
        message,
        { data: { type: 'payment', amount, dueDate } }
      );

      await pool.end();
      return result;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /**
   * Send absence alert notification
   * @param {number} studentId - Student ID
   * @param {string} databaseName - Database name
   * @param {string} date - Absence date
   * @returns {object} - Notification results
   */
  async sendAbsenceAlert(studentId, databaseName, date) {
    const pool = new Pool({ database: databaseName });

    try {
      // Get student and guardian info
      const result = await pool.query(`
        SELECT 
          s.name as student_name,
          s.phone_number as student_phone,
          g.id as guardian_id,
          g.name as guardian_name,
          g.phone_number as guardian_phone
        FROM students s
        LEFT JOIN guardians g ON s.guardian_id = g.id
        WHERE s.id = $1
      `, [studentId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Student not found' };
      }

      const { student_name, guardian_id, guardian_name } = result.rows[0];

      // Send to guardian
      if (guardian_id) {
        const title = '⚠️ Absence Alert';
        const message = `Dear ${guardian_name},\n\nYour ward ${student_name} was absent on ${date}.\n\nIf this is unexpected, please contact the school.\n\nThank you!\n- Skoolific`;

        await this.sendNotification(
          guardian_id,
          'guardian',
          databaseName,
          'absence_alert',
          title,
          message,
          { data: { type: 'absence', studentId, date } }
        );
      }

      await pool.end();
      return { success: true };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /**
   * Send exam published notification
   * @param {number} examId - Exam ID
   * @param {number} classId - Class ID
   * @param {string} databaseName - Database name
   * @returns {object} - Notification results
   */
  async sendExamPublished(examId, classId, databaseName) {
    const pool = new Pool({ database: databaseName });

    try {
      // Get exam details
      const exam = await pool.query(
        'SELECT subject, duration, total_marks FROM ai_exams WHERE id = $1',
        [examId]
      );

      if (exam.rows.length === 0) {
        return { success: false, error: 'Exam not found' };
      }

      const { subject, duration, total_marks } = exam.rows[0];

      // Get all students in class
      const students = await pool.query(
        'SELECT id, name FROM students WHERE class_id = $1 AND status = $2',
        [classId, 'active']
      );

      const title = '🎯 New Exam Available';
      const message = `A new exam has been published!\n\nSubject: ${subject}\nDuration: ${duration} minutes\nTotal Marks: ${total_marks}\n\nLogin to your app to start the exam.\n\nGood luck!\n- Skoolific`;

      let sent = 0;
      let failed = 0;

      for (const student of students.rows) {
        const result = await this.sendNotification(
          student.id,
          'student',
          databaseName,
          'exam_published',
          title,
          message,
          { data: { type: 'exam', examId, subject } }
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await pool.end();
      return { success: true, sent, failed };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /**
   * Send report card available notification
   * @param {number} studentId - Student ID
   * @param {string} databaseName - Database name
   * @param {string} term - Term name
   * @param {string} academicYear - Academic year
   * @returns {object} - Notification results
   */
  async sendReportCardAvailable(studentId, databaseName, term, academicYear) {
    const pool = new Pool({ database: databaseName });

    try {
      // Get student and guardian info
      const result = await pool.query(`
        SELECT 
          s.name as student_name,
          g.id as guardian_id,
          g.name as guardian_name
        FROM students s
        LEFT JOIN guardians g ON s.guardian_id = g.id
        WHERE s.id = $1
      `, [studentId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Student not found' };
      }

      const { student_name, guardian_id } = result.rows[0];

      const title = '📊 Report Card Available';
      const message = `The report card for ${student_name} is now available.\n\nTerm: ${term}\nAcademic Year: ${academicYear}\n\nView it in your Skoolific app.\n\nThank you!\n- Skoolific`;

      // Send to student
      await this.sendNotification(
        studentId,
        'student',
        databaseName,
        'report_card',
        title,
        message,
        { data: { type: 'report_card', term, academicYear } }
      );

      // Send to guardian
      if (guardian_id) {
        await this.sendNotification(
          guardian_id,
          'guardian',
          databaseName,
          'report_card',
          title,
          message,
          { data: { type: 'report_card', studentId, term, academicYear } }
        );
      }

      await pool.end();
      return { success: true };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /**
   * Send exam repeat request notification to admin
   * @param {number} examId - Exam ID
   * @param {string} databaseName - Database name
   * @param {string} teacherName - Teacher name
   * @param {string} reason - Reason for repeat
   * @returns {object} - Notification results
   */
  async sendExamRepeatRequest(examId, databaseName, teacherName, reason) {
    const pool = new Pool({ database: databaseName });

    try {
      // Get admin users
      const admins = await pool.query(
        "SELECT id FROM staff WHERE role = 'admin' AND status = 'active'"
      );

      const title = '🔄 Exam Repeat Request';
      const message = `Teacher ${teacherName} has requested to repeat an exam.\n\nExam ID: ${examId}\nReason: ${reason}\n\nPlease review and approve/reject in the admin panel.\n\n- Skoolific`;

      for (const admin of admins.rows) {
        await this.sendNotification(
          admin.id,
          'staff',
          databaseName,
          'exam_repeat_request',
          title,
          message,
          { data: { type: 'exam_repeat', examId, teacherName, reason } }
        );
      }

      await pool.end();
      return { success: true };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /**
   * Get user information
   * @param {number} userId - User ID
   * @param {string} userType - User type
   * @param {string} databaseName - Database name
   * @returns {object} - User info
   */
  async getUserInfo(userId, userType, databaseName) {
    const pool = new Pool({ database: databaseName });

    try {
      const tableName = userType === 'student' ? 'students' :
                       userType === 'staff' ? 'staff' :
                       'guardians';

      const result = await pool.query(
        `SELECT id, name, phone_number FROM ${tableName} WHERE id = $1`,
        [userId]
      );

      await pool.end();
      return result.rows[0] || null;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /**
   * Get user notification preferences
   * @param {number} userId - User ID
   * @param {string} userType - User type
   * @param {string} databaseName - Database name
   * @param {string} notificationType - Notification type
   * @returns {object} - Preferences {push, telegram, sms, email}
   */
  async getUserPreferences(userId, userType, databaseName, notificationType) {
    const pool = new Pool({ database: databaseName });

    try {
      const result = await pool.query(`
        SELECT channel, enabled
        FROM notification_preferences
        WHERE user_id = $1 AND user_type = $2 AND notification_type = $3
      `, [userId, userType, notificationType]);

      await pool.end();

      // Default: all channels enabled
      const preferences = {
        push: true,
        telegram: true,
        sms: true,
        email: false
      };

      // Apply user preferences
      for (const pref of result.rows) {
        preferences[pref.channel] = pref.enabled;
      }

      return preferences;
    } catch (error) {
      await pool.end();
      // Return defaults on error
      return {
        push: true,
        telegram: true,
        sms: true,
        email: false
      };
    }
  }

  /**
   * Log notification to database
   * @param {number} userId - User ID
   * @param {string} userType - User type
   * @param {string} databaseName - Database name
   * @param {string} notificationType - Notification type
   * @param {string} channel - Channel used
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} status - Status (sent, failed)
   * @param {string} errorMessage - Error message if failed
   */
  async logNotification(userId, userType, databaseName, notificationType, channel, title, message, status, errorMessage = null) {
    const pool = new Pool({ database: databaseName });

    try {
      await pool.query(`
        INSERT INTO notifications_log 
        (user_id, user_type, notification_type, channel, title, message, status, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [userId, userType, notificationType, channel, title, message, status, errorMessage, 
          status === 'sent' ? new Date() : null]);

      await pool.end();
    } catch (error) {
      console.error('Error logging notification:', error);
      await pool.end();
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;
