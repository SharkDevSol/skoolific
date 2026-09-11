# Skoolific Guardian — Mobile App (Capacitor)

This project wraps the existing guardian web app (https://iqra.skoolific.com/app/guardian-login)
inside a native Android shell using Capacitor, producing a real .apk installable on Android phones.

## What this is (v1)
- Native Android app (webview) that loads the live guardian portal.
- App id: `com.skoolific.guardian`
- App name: **Skoolific Guardian**
- Theme color: rose/pink (`#881337`) matching the guardian web login.

## Build the APK (on Windows)
Prereqs (already installed on the dev machine):
- JDK 17 → `C:\Users\hp\jdk\jdk-17.0.20.1+1`
- Android SDK → `C:\Users\hp\Android\Sdk` (platform-35, build-tools 35.0.0, platform-tools)

```bash
export JAVA_HOME="C:\\Users\\hp\\jdk\\jdk-17.0.20.1+1"
export ANDROID_HOME="C:\\Users\\hp\\Android\\Sdk"
export ANDROID_SDK_ROOT="C:\\Users\\hp\\Android\\Sdk"
cd guardian-mobile/android
./gradlew assembleDebug        # debug APK (for testing)
./gradlew assembleRelease      # release APK (needs signing)
./gradlew bundleRelease        # .aab for Google Play
```

Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Where things are
- `capacitor.config.json` — app config (id, name, remote URL, splash/status bar colors)
- `android/` — native Android project (generated)

## TO DO (future work — needs the owner's accounts/decisions)

### 1. Offline support — DONE ✅
- `APP/public/sw.js` rewritten: caches guardian GET API responses (marks, payments,
  report card, attendance, profile, branding) network-first with cache fallback.
- The app-shell/static assets stay "network-only" so new deploys never show stale code.
- First time a guardian views a screen online, that data is cached; it then works offline.

### 2. Push notifications — CODE DONE, BLOCKED ON FIREBASE ACCOUNT ⚠️
- Backend: `user_devices` table + `routes/deviceRoutes.js` (`POST /api/devices/register`).
- Backend service: `services/PushNotificationService.js` (FCM) already existed.
- App: `@capacitor/push-notifications` plugin wired + `APP/src/utils/pushNotifications.js`
  registers the device token on guardian login.
- ⚠️ To ACTUALLY send pushes, the owner must:
  1. Create a free Firebase project (https://console.firebase.google.com) and add an Android app
     with package `com.skoolific.guardian`.
  2. Download `google-services.json` → put in `guardian-mobile/android/app/`.
  3. Generate a service account key (Project Settings → Service accounts → Generate new private key)
     → save as `backend/firebase-service-account.json` (this is what PushNotificationService loads).
  4. Rebuild the APK.
  Without these two files, push cannot fire (FCM needs your Firebase project).

### 3. Store upload
- **Google Play** (Android): `$25` one-time. Create the app in Play Console, upload the `.aab`
  (`gradlew bundleRelease`), fill store listing, screenshots, privacy policy, content rating.
- **Apple App Store** (iOS): `$99/year` Apple Developer Program. Requires a Mac (or cloud Mac
  build service — EAS/Codemagic/MacStadium) to sign the `.ipa`, plus a D-U-N-S number.

## Next steps for the owner
1. Test the APK (`Skoolific-Guardian.apk`) on an Android phone.
2. Create a Firebase project + drop in `google-services.json` + `firebase-service-account.json` → push goes live.
3. Buy Google Play Console account ($25) → upload the .aab.
4. (Later) Apple Developer account + Mac/cloud build for iOS.

