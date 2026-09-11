// Push-notification device-token registration for the guardian mobile app.
// Binds "this device's FCM token" to "this guardian username" so the server can
// send push notifications to exactly this phone (like Instagram/Facebook).

import api from './api';

let registered = false;

/**
 * Get the Capacitor PushNotifications plugin (undefined on plain web).
 */
function getPushPlugin() {
  try {
    const cap = window.Capacitor;
    return cap?.Plugins?.PushNotifications || null;
  } catch {
    return null;
  }
}

/**
 * Check (without prompting) the current notification permission state.
 * Returns one of: 'granted' | 'denied' | 'prompt' | 'unsupported'
 */
export async function checkPushPermission() {
  const PushNotifications = getPushPlugin();
  if (!PushNotifications) return 'unsupported';
  try {
    const status = await PushNotifications.checkPermissions();
    return status.receive || 'prompt';
  } catch (e) {
    console.warn('[Push] checkPermissions failed:', e?.message);
    return 'prompt';
  }
}

/**
 * Ask the OS for notification permission (prompts the user if not decided).
 * Returns the resulting status: 'granted' | 'denied' | 'prompt'.
 */
export async function requestPushPermission() {
  const PushNotifications = getPushPlugin();
  if (!PushNotifications) return 'unsupported';
  try {
    const perm = await PushNotifications.requestPermissions();
    return perm.receive || 'prompt';
  } catch (e) {
    console.warn('[Push] requestPermissions failed:', e?.message);
    return 'prompt';
  }
}

/**
 * Full ensure-flow: check → request if needed.
 * Returns { status, alreadyGranted }.
 * If status is 'denied', the caller should guide the user to OS settings.
 */
export async function ensurePushPermission() {
  const current = await checkPushPermission();
  if (current === 'granted') return { status: 'granted', alreadyGranted: true };
  if (current === 'denied') return { status: 'denied', alreadyGranted: false };

  // 'prompt' or unknown → ask
  const requested = await requestPushPermission();
  return { status: requested, alreadyGranted: requested === 'granted' };
}

/**
 * Register this device's FCM token with the backend for a given guardian.
 * Call after permission is granted.
 */
export async function initGuardianPush(userId /* guardian username */) {
  if (registered || !userId) return;
  try {
    const PushNotifications = getPushPlugin();
    if (!PushNotifications) {
      console.log('[Push] Not inside the mobile app — skipping token registration.');
      return;
    }

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      console.log('[Push] Permission not granted — cannot receive notifications.');
      return;
    }

    await PushNotifications.register();

    await PushNotifications.addListener('registration', async (token) => {
      try {
        console.log('[Push] Got FCM token:', token.value);
        const res = await api.post('/devices/register', {
          deviceToken: token.value,
          userType: 'guardian',
          userId,
          deviceType: 'android',
          deviceName: (navigator.userAgent || 'android').slice(0, 100),
          appVersion: '1.0',
          osVersion: null
        });
        console.log('[Push] Device registered on server:', JSON.stringify(res.data));
        registered = true;
      } catch (e) {
        console.warn('[Push] Failed to register device token:', e?.message);
      }
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] registrationError:', JSON.stringify(err));
    });
  } catch (e) {
    console.warn('[Push] init skipped:', e?.message);
  }
}
