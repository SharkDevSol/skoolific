const express = require('express');
const router = express.Router();
const pushService = require('../services/PushNotificationService');

/**
 * Device token registration for mobile push notifications.
 *
 * POST /api/devices/register   { deviceToken, userType, userId, deviceType, deviceName, appVersion, osVersion }
 * POST /api/devices/unregister { deviceToken }
 *
 * userType: 'guardian' | 'student' | 'staff'
 * userId: for guardians use their guardian_username (string) — PushNotificationService
 *         accepts it and the user_devices table has user_id as TEXT to match usernames.
 */

router.post('/register', async (req, res) => {
  const { deviceToken, userType = 'guardian', userId, deviceType, deviceName, appVersion, osVersion } = req.body;
  if (!deviceToken) {
    return res.status(400).json({ success: false, error: 'deviceToken is required' });
  }
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId is required' });
  }
  const result = await pushService.registerDeviceToken(userId, userType, deviceToken, {
    deviceType: deviceType || 'android',
    deviceName: deviceName || null,
    appVersion: appVersion || null,
    osVersion: osVersion || null
  });
  res.json(result);
});

router.post('/unregister', async (req, res) => {
  const { deviceToken } = req.body;
  if (!deviceToken) {
    return res.status(400).json({ success: false, error: 'deviceToken is required' });
  }
  const result = await pushService.unregisterDeviceToken(deviceToken);
  res.json(result);
});

module.exports = router;
