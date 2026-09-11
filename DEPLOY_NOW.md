# Quick Deployment Guide - Do This Now

## The Problem
Your browser is caching the old JavaScript file. I've fixed the code and added cache-busting, but we need to upload the new `index.html` to your server.

## Quick 3-Step Solution

### Step 1: Upload the File (Choose ONE method)

**METHOD A: Using WinSCP (Easiest - Recommended)**
1. Open WinSCP (or download from https://winscp.net if you don't have it)
2. Connect with these details:
   - Host: `76.13.48.245`
   - Username: `root`
   - Password: `[REDACTED-PASSWORD]`
3. Navigate to: `/var/www/skoolific/iqrab3/APP/dist/`
4. Drag and drop `APP/dist/index.html` from your local folder to the server
5. Click "Yes" to overwrite

**METHOD B: Using Command Line (If WinSCP not available)**
1. Open PowerShell or Command Prompt
2. Run this command (it will ask for confirmation - type `y` and press Enter):
   ```
   pscp -pw "[REDACTED-PASSWORD]" APP\dist\index.html root@76.13.48.245:/var/www/skoolific/iqrab3/APP/dist/index.html
   ```
3. When it asks "Store key in cache? (y/n)", type `y` and press Enter

**METHOD C: Manual SSH Edit (If nothing else works)**
1. SSH into your server:
   ```
   ssh root@76.13.48.245
   ```
   Password: `[REDACTED-PASSWORD]`

2. Edit the file:
   ```
   nano /var/www/skoolific/iqrab3/APP/dist/index.html
   ```

3. Find line 33 (the script tag) and add `?v=1777039717617` to ALL four URLs:
   ```html
   <script type="module" crossorigin src="/assets/index-51a6711f-1777039717617.js?v=1777039717617"></script>
   <link rel="modulepreload" crossorigin href="/assets/vendor-react-1960947a-1777039717617.js?v=1777039717617">
   <link rel="modulepreload" crossorigin href="/assets/vendor-axios-edfcd65b-1777039717617.js?v=1777039717617">
   <link rel="stylesheet" href="/assets/index-999a6040-1777039717617.css?v=1777039717617">
   ```

4. Save: Press `Ctrl+X`, then `Y`, then `Enter`

### Step 2: Reload Nginx

After uploading, run this command (via SSH or in your existing SSH session):

```bash
ssh root@76.13.48.245 "systemctl reload nginx"
```

Or if already connected via SSH:
```bash
systemctl reload nginx
```

### Step 3: Clear Your Browser Cache (CRITICAL!)

**You MUST do ALL of these:**

1. **Close ALL tabs** for `iqrab3.skoolific.com`
2. Press `Ctrl + Shift + Delete`
3. Select "All time" or "Everything"
4. Check "Cached images and files"
5. Click "Clear data"
6. **Close your browser completely** (not just the window - exit the program)
7. **Restart your browser**
8. Open `iqrab3.skoolific.com` in a **fresh tab**

## Verify It Worked

After clearing cache:

1. Open Developer Tools (Press `F12`)
2. Go to **Console** tab
3. Look for: `📊 Students with existing marks:`
   - ✅ If you see this = SUCCESS! New code is loaded
   - ❌ If you see `🔒 Locked students:` = Old code still cached, repeat Step 3

4. Go to **Network** tab
5. Refresh the page (`F5`)
6. Look for the JavaScript file being loaded
   - ✅ Should be: `index-51a6711f-1777039717617.js?v=1777039717617`
   - ❌ Should NOT be: `index-4c0db611-1776952911234.js`

## Test the Fix

1. Go to Mark List page
2. Select a class and subject
3. Enter marks for a student (e.g., Quiz: 8, Midterm: 15)
4. Click "Save"
5. **Refresh the page** (F5)
6. ✅ **Expected**: Mark inputs are LOCKED (grayed out, can't edit)
7. ❌ **Bug would be**: Mark inputs become editable again

## What Was Fixed

The code now determines lock state ONLY from database values, not browser memory:
- If mark > 0 in database → LOCKED
- If mark = 0 or empty in database → UNLOCKED
- Admin users can always edit

This means locks persist across page refreshes, browser restarts, and even different devices!

---

**Need help?** Let me know which step you're stuck on!
