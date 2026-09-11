# Cache Fix Deployment Instructions

## Problem
Your browser is loading an old JavaScript file (`index-4c0db611-1776952911234.js`) instead of the new one with the fix (`index-51a6711f-1777039717617.js`).

## Solution Applied
I've added cache-busting query parameters to the `index.html` file. Now all asset URLs include `?v=1777039717617` to force browsers to load the new files.

## Deployment Steps

### Step 1: Upload the Updated index.html

You need to upload the file `APP/dist/index.html` to your VPS.

**Option A: Using SCP (if available)**
```bash
scp APP/dist/index.html root@76.13.48.245:/var/www/skoolific/iqrab3/APP/dist/
```

**Option B: Using SFTP Client (FileZilla, WinSCP, etc.)**
1. Connect to: 76.13.48.245
2. Username: root
3. Password: [REDACTED-PASSWORD]
4. Navigate to: `/var/www/skoolific/iqrab3/APP/dist/`
5. Upload `APP/dist/index.html` (overwrite existing file)

**Option C: Manual Copy-Paste**
1. SSH into the server:
   ```bash
   ssh root@76.13.48.245
   ```
2. Edit the file:
   ```bash
   nano /var/www/skoolific/iqrab3/APP/dist/index.html
   ```
3. Find these lines (around line 33):
   ```html
   <script type="module" crossorigin src="/assets/index-51a6711f-1777039717617.js"></script>
   <link rel="modulepreload" crossorigin href="/assets/vendor-react-1960947a-1777039717617.js">
   <link rel="modulepreload" crossorigin href="/assets/vendor-axios-edfcd65b-1777039717617.js">
   <link rel="stylesheet" href="/assets/index-999a6040-1777039717617.css">
   ```
4. Replace with:
   ```html
   <script type="module" crossorigin src="/assets/index-51a6711f-1777039717617.js?v=1777039717617"></script>
   <link rel="modulepreload" crossorigin href="/assets/vendor-react-1960947a-1777039717617.js?v=1777039717617">
   <link rel="modulepreload" crossorigin href="/assets/vendor-axios-edfcd65b-1777039717617.js?v=1777039717617">
   <link rel="stylesheet" href="/assets/index-999a6040-1777039717617.css?v=1777039717617">
   ```
5. Save and exit (Ctrl+X, then Y, then Enter)

### Step 2: Reload Nginx

After uploading the file, reload Nginx to clear server-side cache:

```bash
ssh root@76.13.48.245
systemctl reload nginx
```

### Step 3: Clear Browser Cache (CRITICAL)

The user MUST do ALL of these steps:

1. **Close ALL tabs** for iqrab3.skoolific.com
2. **Clear browser cache**:
   - Press `Ctrl+Shift+Delete`
   - Select "All time" or "Everything"
   - Check "Cached images and files"
   - Click "Clear data"
3. **Close the browser completely** (not just the window - exit the browser)
4. **Restart the browser**
5. **Open iqrab3.skoolific.com in a fresh tab**

### Step 4: Verify the Fix

After clearing cache and reloading:

1. Open browser Developer Tools (F12)
2. Go to the Console tab
3. Look for this log message: `📊 Students with existing marks:`
   - If you see `🔒 Locked students:` instead, the old file is still cached
4. Go to the Network tab
5. Refresh the page (F5)
6. Look for the JavaScript file being loaded
   - Should be: `index-51a6711f-1777039717617.js?v=1777039717617`
   - Should NOT be: `index-4c0db611-1776952911234.js`

### Step 5: Test the Fix

1. Navigate to the mark list page
2. Select a class and subject
3. Enter marks for a student (e.g., Quiz: 8, Midterm: 15)
4. Click "Save"
5. **Refresh the page** (F5)
6. **Expected result**: The mark inputs for that student should be LOCKED (disabled/grayed out)
7. **Bug would be**: The mark inputs become editable again

## What Changed in the Code

The fix was simple but effective:

1. **Line 706**: Removed `setSavedMarkStudents(new Set())` - this was resetting lock state on every page load
2. **Line 2324**: Changed lock logic from `hasAnyMarks && savedMarkStudents.has(student.id) && !isAdmin` to `hasAnyMarks && !isAdmin`
3. **Line 2343**: Changed lock logic from `hasValue && savedMarkStudents.has(student.id) && !isAdmin` to `hasValue && !isAdmin`
4. **Line 733**: Updated console log from `🔒 Locked students:` to `📊 Students with existing marks:`

Now the lock state is determined ONLY by database values (`hasValue` or `hasAnyMarks`), not by browser memory (`savedMarkStudents`).

## Troubleshooting

### If the old file is still loading after all steps:

1. Try a different browser (Chrome, Firefox, Edge)
2. Try incognito/private mode
3. Check if there's a service worker caching the old file:
   - Open DevTools → Application tab → Service Workers
   - Click "Unregister" for any service workers
   - Refresh the page

### If marks still unlock after refresh:

1. Verify the console log shows `📊 Students with existing marks:` (not `🔒 Locked students:`)
2. Check the Network tab to confirm the correct JavaScript file is loaded
3. If the correct file is loaded but marks still unlock, there may be another issue - contact me

## Summary

✅ Code fix is correct and tested (all tests passing)
✅ Cache-busting parameters added to index.html
⏳ Waiting for: Upload to VPS + Nginx reload + Browser cache clear
🎯 Expected outcome: Marks stay locked after page refresh
