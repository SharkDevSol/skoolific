# Quick Start: Master Database

## Setup (Run Once)

```bash
cd backend
node database/setup-master-database.js
```

**Done!** Master database is ready.

---

## Add New School

```bash
node database/add-school.js
```

Follow the prompts:
1. Enter school name
2. Enter school code
3. Enter number of branches
4. Enter branch details

**Done!** Telegram bot automatically sees the new school.

---

## What Files to Update When Adding New School

### ❌ Old Approach (Without Master Database)
```
Update iqrab1.schools ← Add new school
Update iqrab2.schools ← Add new school
Update iqrab3.schools ← Add new school
Update almarkaz_main.schools ← Add new school
Update almarkaz_secondary.schools ← Add new school
Update alkhwarizmi_main.schools ← Add new school
Update newschool_db.schools ← Add new school

Total: 7+ databases to update!
```

### ✅ New Approach (With Master Database)
```
Run: node database/add-school.js

Total: 1 command!
```

---

## Architecture

```
PostgreSQL
├─ skoolific_master ← Schools/branches registry (ONE place)
├─ iqrab1 ← Student/staff data
├─ iqrab2 ← Student/staff data
├─ iqrab3 ← Student/staff data
└─ ... other school databases

Telegram Bot
└─ Reads from: skoolific_master
└─ Gets credentials from: school databases
```

---

## Environment Variables

Your `.env` file now has:

```env
# Master Database (for Telegram bot)
MASTER_DB_NAME=skoolific_master
MASTER_DB_HOST=localhost
MASTER_DB_PORT=5432
MASTER_DB_USER=postgres
MASTER_DB_PASSWORD=[REDACTED-PASSWORD]

# School Database (for this backend instance)
DB_NAME=skoolific
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=[REDACTED-PASSWORD]
```

---

## Common Commands

### View all schools
```bash
psql -U postgres -d skoolific_master -c "SELECT * FROM schools;"
```

### View all branches
```bash
psql -U postgres -d skoolific_master -c "SELECT s.school_name, b.branch_name, b.database_name FROM branches b JOIN schools s ON b.school_id = s.id;"
```

### Add school manually
```bash
psql -U postgres -d skoolific_master
```
```sql
INSERT INTO schools (school_name, school_code) VALUES ('New School', 'NEWSCHOOL');
INSERT INTO branches (school_id, branch_name, database_name, api_port)
VALUES ((SELECT id FROM schools WHERE school_code = 'NEWSCHOOL'), 'Branch 1', 'newschool_b1', 5056);
```

---

## Benefits

✅ Add school: Update 1 database (not 7+)  
✅ No code changes needed  
✅ No backend restarts needed  
✅ Bot automatically sees new schools  
✅ Single source of truth  

---

## Files Created

- `backend/database/setup-master-database.js` - Setup script
- `backend/database/add-school.js` - Add school script
- `backend/MASTER_DATABASE_SETUP.md` - Full documentation
- `backend/QUICK_START_MASTER_DB.md` - This file

---

## Next Steps

1. ✅ Run setup: `node database/setup-master-database.js`
2. ✅ Start bot: `node services/start-telegram-bot.js`
3. ✅ Test bot: https://t.me/skoolific_credentials_bot
4. ✅ Add new school: `node database/add-school.js`

---

**Status:** ✅ READY TO USE
