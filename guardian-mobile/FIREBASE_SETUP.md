# Firebase Push Notifications — Step-by-Step Setup

This guide turns push notifications ON for the "IQRA Parent" app.
You need a free Google account. It takes ~10 minutes.

## Part A — Create the Firebase project + get 2 files

### Step 1 — Create a Firebase project
1. Go to https://console.firebase.google.com (log in with a Google account).
2. Click **"Create a project"** (or "Add project").
3. Name it (e.g. `iqra-parent`) → Continue.
4. Google Analytics: can turn OFF (not needed) → Create project.
5. Wait for it to finish → click Continue.

### Step 2 — Add the Android app
1. In the Firebase console, click the **Android icon** (or "Add app" → Android).
2. **Android package name** (IMPORTANT — exact match):
   ```
   com.skoolific.guardian
   ```
3. App nickname: `IQRA Parent`. Leave "debug signing certificate" blank for now.
4. Click **Register app**.

### Step 3 — Get `google-services.json` (the app-side file)
1. After registering, Firebase shows a **"Download google-services.json"** button.
2. Download that file.
3. Send it to me (or save it and tell me the path). I will place it in:
   ```
   guardian-mobile/android/app/google-services.json
   ```
   (This is what tells the app which Firebase project to connect to.)

### Step 4 — Get the service account key (the server-side file)
1. In the Firebase console, click the **gear icon (⚙️) → Project settings**.
2. Go to the **"Service accounts"** tab.
3. Click **"Generate new private key"** → **Generate key**.
4. A JSON file downloads. This is the service account credential.
5. Send it to me (I will save it as):
   ```
   backend/firebase-service-account.json
   ```
   (This is what the server uses to SEND push messages.)

### Step 5 — Tell me
Send me both files (or their locations), and I will:
- Drop `google-services.json` into the Android project
- Drop the service-account JSON into the backend
- Rebuild the APK
- Deploy the backend
- Push notifications for **new marks / payments / attendance** will then work

## Part B — What happens AFTER (for publishing to stores)

### Google Play (Android) — $25 one-time
1. Go to https://play.google.com/console and create a developer account ($25).
2. Create a new app, enter `com.skoolific.guardian`.
3. I'll produce the release `.aab` (`gradlew bundleRelease`).
4. Upload the .aab, fill store listing (title "IQRA Parent", screenshots, description), set content rating, add a privacy policy URL, then submit for review.

### Apple App Store (iOS) — $99/year
1. Requires an Apple Developer account + a Mac (or a cloud Mac build service like EAS / Codemagic / MacStadium).
2. I cannot build the iOS .ipa on this Windows machine; this is the one step that must be done on a Mac/cloud.
