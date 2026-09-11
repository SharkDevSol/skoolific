// Helper to send a push notification (FCM) to a guardian by their username.
// Wraps PushNotificationService.sendToUser and swallows errors (non-blocking),
// so push failures never break the main request (e.g., recording a payment).

const pushService = require('./PushNotificationService');

const notifyGuardianPush = async (guardianUsername, title, body, data = {}) => {
  if (!guardianUsername) return;
  try {
    const res = await pushService.sendToUser(guardianUsername, 'guardian', {
      title, body, data
    });
    return res;
  } catch (e) {
    console.warn('Push notify guardian failed (non-blocking):', e.message);
    return { success: false, error: e.message };
  }
};

module.exports = { notifyGuardianPush };
