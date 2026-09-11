# 🚀 NEW BUILD READY - Upload Instructions

## What Changed
- ✅ **NEW JavaScript file**: `index-3a564561-1777118829567.js` (completely different from old file)
- ✅ **Cache-busting parameters added**: `?v=1777118829567&bust=1`
- ✅ **New cache-clearing page**: `force-clear-cache.html`
- ✅ **Code fix verified**: All tests passing

## 📦 Files to Upload

Upload the ENTIRE `APP/dist` folder to `/var/www/skoolific/iqrab3/APP/dist/` on your VPS.

This includes:
- `index.html` (updated with new file references)
- `assets/index-3a564561-1777118829567.js` (NEW JavaScript with fix)
- `assets/vendor-react-1960947a-1777118829567.js` (NEW)
- `assets/vendor-axios-edfcd65b-1777118829567.js` (NEW)
- `assets/index-999a6040-1777118829567.css` (NEW)
- `force-clear-cache.html` (NEW cache-clearing page)

---

## 🎯 SOLUTION 1: Use WinSCP (EASIEST - 2 minutes)

### Step 1: Download WinSCP
If you don't have it: https://winscp.net/eng/download.php

### Step 2: Connect
1. Open WinSCP
2. Enter connection details:
   - **File protocol**: SFTP
   - **Host name**: `76.13.48.245`
   - **Port**: 22
   - **User name**: `root`
   - **Password**: `[REDACTED-PASSWORD]`
3. Click "Login"
4. Click "Yes" if it asks about host key

### Step 3: Upload
1. On the left side (your computer): Navigate to `C:\Users\hp\Desktop\bilal\SCHOOLS\APP\dist`
2. On the right side (server): Navigate to `/var/www/skoolific/iqrab3/APP/`
3. **Delete the old `dist` folder** on the server (right side)
4. **Drag the entire `dist` folder** from left to right
5. Wait for upload to complete

### Step 4: Reload Nginx
In WinSCP, press `Ctrl+T` to open terminal, then run:
```bash
systemctl reload nginx
```

---

## 🎯 SOLUTION 2: Use FileZilla (Alternative)

### Step 1: Download FileZilla
If you don't have it: https://filezilla-project.org/download.php?type=client

### Step 2: Connect
1. Open FileZilla
2. Enter at the top:
   - **Host**: `sftp://76.13.48.245`
   - **Username**: `root`
   - **Password**: `[REDACTED-PASSWORD]`
   - **Port**: 22
3. Click "Quickconnect"
4. Click "OK" if it asks about unknown host key

### Step 3: Upload
1. Left side: Navigate to `C:\Users\hp\Desktop\bilal\SCHOOLS\APP\dist`
2. Right side: Navigate to `/var/www/skoolific/iqrab3/APP/`
3. Right-click the old `dist` folder on server → Delete
4. Drag the entire `dist` folder from left to right
5. Wait for upload

### Step 4: Reload Nginx
Open PowerShell and run:
```powershell
ssh root@76.13.48.245 "systemctl reload nginx"
```
(Type `yes` when asked about host key, then enter password)

---

## 🎯 SOLUTION 3: Command Line with pscp (If you prefer terminal)

### Step 1: Accept Host Key First
Open PowerShell and run:
```powershell
echo y | plink -pw "[REDACTED-PASSWORD]" root@76.13.48.245 "exit"
```

### Step 2: Upload Entire dist Folder
```powershell
pscp -r -pw "[REDACTED-PASSWORD]" APP\dist\* root@76.13.48.245:/var/www/skoolific/iqrab3/APP/dist/
```

### Step 3: Reload Nginx
```powershell
plink -pw "[REDACTED-PASSWORD]" root@76.13.48.245 "systemctl reload nginx"
```

---

## 🎯 SOLUTION 4: Manual SSH Upload (Last resort)

### Step 1: Create a zip file
In PowerShell:
```powershell
Compress-Archive -Path APP\dist\* -DestinationPath dist.zip -Force
```

### Step 2: Upload zip
```powershell
pscp -pw "[REDACTED-PASSWORD]" dist.zip root@76.13.48.245:/tmp/
```

### Step 3: SSH and extract
```powershell
ssh root@76.13.48.245
```
Password: `[REDACTED-PASSWORD]`

Then run:
```bash
cd /var/www/skoolific/iqrab3/APP/
rm -rf dist
mkdir dist
cd dist
unzip /tmp/dist.zip
systemctl reload nginx
exit
```

---

## 🧹 After Upload: Clear Browser Cache

### Method 1: Use the New Cache-Clearing Page (RECOMMENDED)
1. Visit: `https://iqrab3.skoolific.com/force-clear-cache.html`
2. Wait for it to clear all caches automatically
3. Click "Continue to Skoolific"
4. Login and test

### Method 2: Manual Cache Clear
1. Close ALL tabs for `iqrab3.skoolific.com`
2. Press `Ctrl + Shift + Delete`
3. Select "All time"
4. Check "Cached images and files"
5. Click "Clear data"
6. Close browser completely
7. Restart browser
8. Visit `https://iqrab3.skoolific.com`

---

## ✅ Verify It Worked

After clearing cache:

### Check 1: Console Log
1. Press `F12` → Console tab
2. Look for: `📊 Students with existing marks:`
   - ✅ If you see this = SUCCESS!
   - ❌ If you see `🔒 Locked students:` = Old code still cached

### Check 2: Network Tab
1. Press `F12` → Network tab
2. Refresh page (`F5`)
3. Look for JavaScript file:
   - ✅ Should be: `index-3a564561-1777118829567.js`
   - ❌ Should NOT be: `index-4c0db611-1776952911234.js` or `index-51a6711f-1777039717617.js`

### Check 3: Test the Fix
1. Go to Mark List
2. Enter marks for a student
3. Click Save
4. **Refresh the page** (F5)
5. ✅ **Expected**: Marks are LOCKED (can't edit)
6. ❌ **Bug**: Marks become editable

---

## 🆘 Still Not Working?

If after ALL of the above the marks still unlock after refresh:

1. **Check which file is loading**:
   - Open DevTools → Network tab
   - Refresh page
   - Find the `index-*.js` file
   - Tell me which one is loading

2. **Try different browser**:
   - Chrome, Firefox, or Edge
   - Test in incognito/private mode

3. **Check server file**:
   - SSH into server: `ssh root@76.13.48.245`
   - Run: `cat /var/www/skoolific/iqrab3/APP/dist/index.html | grep "index-"`
   - Should show: `index-3a564561-1777118829567.js`

---

## 📊 Summary

**What we're doing:**
- Uploading a completely NEW JavaScript file with the fix
- The new file has a different hash: `3a564561` (vs old `4c0db611` or `51a6711f`)
- Adding cache-busting parameters to force browsers to load it
- Providing a cache-clearing page to help users

**Why this will work:**
- It's a completely different filename - browsers can't confuse it with the old one
- Cache-busting parameters force fresh load
- The cache-clearing page removes all old cached files

**Time required:**
- WinSCP/FileZilla: 2-3 minutes
- Command line: 1 minute
- Manual SSH: 5 minutes

Choose whichever method you're most comfortable with!
