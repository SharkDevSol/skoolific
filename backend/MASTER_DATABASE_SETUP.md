# Master Database Setup Guide

## Overview

The master database (`skoolific_master`) is a centralized registry that stores information about all schools and their branches. This eliminates the need to duplicate school/branch information across multiple databases.

---

## Architecture

```
PostgreSQL (localhost)
├─ skoolific_master (Master Registry) ← ONE source of truth
│   ├─ schools table (all schools)
│   └─ branches table (all branches)
│
├─ iqrab1 (Iqra Branch 1 data)
├─ iqrab2 (Iqra Branch 2 data)
├─ iqrab3 (Iqra Branch 3 data)
├─ almarkaz_main (Al-Markaz Main data)
├─ almarkaz_secondary (Al-Markaz Secondary data)
└─ alkhwarizmi_main (Al-Khwarizmi data)

Telegram Bot
├─ Connects to: skoolific_master (get schools/branches list)
└─ Connects to: school databases (get user credentials)
```

---

## Benefits

### ✅ Single Source of Truth
- Schools and branches defined in ONE place
- No duplication across databases
- Easy to maintain

### ✅ Easy to Add Schools
- Add new school: Update only master database
- No need to update existing school databases
- Telegram bot automatically sees new schools

### ✅ Scalability
- Add 100 schools: Still update only 1 database
- No code changes needed
- No backend restarts required

---

## Setup Instructions

### Step 1: Create Master Database

Run the setup script:

```bash
cd backend
node database/setup-master-database.js
```

**What this does:**
1. Creates `skoolific_master` database
2. Creates `schools` and `branches` tables
3. Inserts your existing schools (Iqra, Al-Markaz, Al-Khwarizmi)
4. Inserts all branches with their database names

**Output:**
```
🏗️  Setting up Master Database for Telegram Bot...

✅ Connected to PostgreSQL

1. Creating database 'skoolific_master'...
   ✓ Database created

✅ Connected to master database

2. Creating schools table...
   ✓ Schools table created

3. Creating branches table...
   ✓ Branches table created

4. Creating indexes...
   ✓ Indexes created

5. Creating trigger function...
   ✓ Trigger function created

6. Creating triggers...
   ✓ Triggers created

7. Inserting schools...
   ✓ Iqra School
   ✓ Al-Markaz School
   ✓ Al-Khwarizmi School

8. Inserting branches...
   ✓ IQRA - Branch 1 (iqrab1)
   ✓ IQRA - Branch 2 (iqrab2)
   ✓ IQRA - Branch 3 (iqrab3)
   ✓ ALMARKAZ - Main Campus (almarkaz_main)
   ✓ ALMARKAZ - Secondary Campus (almarkaz_secondary)
   ✓ ALKHWARIZMI - Main Campus (alkhwarizmi_main)

9. Configuration Summary:

   📚 Schools and Branches:
      Iqra School (IQRA): 3 branch(es)
      Al-Markaz School (ALMARKAZ): 2 branch(es)
      Al-Khwarizmi School (ALKHWARIZMI): 1 branch(es)

   📍 Branch Details:
      Iqra School - Branch 1
         Database: iqrab1
         Port: 5050
      Iqra School - Branch 2
         Database: iqrab2
         Port: 5051
      Iqra School - Branch 3
         Database: iqrab3
         Port: 5052
      Al-Markaz School - Main Campus
         Database: almarkaz_main
         Port: 5053
      Al-Markaz School - Secondary Campus
         Database: almarkaz_secondary
         Port: 5054
      Al-Khwarizmi School - Main Campus
         Database: alkhwarizmi_main
         Port: 5055

✅ Master database setup complete!
```

### Step 2: Verify Configuration

Check your `.env` file has the master database configuration:

```env
# Master Database Configuration (for Telegram bot schools/branches registry)
MASTER_DB_NAME=skoolific_master
MASTER_DB_HOST=localhost
MASTER_DB_PORT=5432
MASTER_DB_USER=postgres
MASTER_DB_PASSWORD=[REDACTED-PASSWORD]
```

### Step 3: Start Telegram Bot

```bash
node services/start-telegram-bot.js
```

**Output:**
```
🤖 Starting Skoolific Telegram Bot...

✅ Telegram Bot initialized successfully
   Bot: @skoolific_credentials_bot
   Master DB: skoolific_master

✅ Telegram Bot is running!
   Bot link: https://t.me/skoolific_credentials_bot
```

### Step 4: Test the Bot

1. Open: https://t.me/skoolific_credentials_bot
2. Click "Get My Credentials"
3. Select your school
4. Select your branch
5. Select your user type
6. Bot retrieves credentials from the correct database

---

## Adding New School

### Method 1: Interactive Script (Recommended)

```bash
node database/add-school.js
```

**Example:**
```
🏫 Add New School to Master Database

✅ Connected to master database

📝 School Information:
   School Name (e.g., "New School"): Test School
   School Code (e.g., "NEWSCHOOL"): TEST
   Description (optional): Test School for Development

1. Adding school to database...
   ✓ School added (ID: 4)

How many branches does this school have? 2

2. Adding branches...

   Branch 1:
      Branch Name (e.g., "Branch 1"): Main Campus
      Branch Code (e.g., "B1"): MAIN
      Database Name (e.g., "test_b1"): test_main
      API Port (e.g., "5051"): 5056
      ✓ Branch added

   Branch 2:
      Branch Name (e.g., "Branch 2"): Secondary Campus
      Branch Code (e.g., "B2"): SEC
      Database Name (e.g., "test_b2"): test_secondary
      API Port (e.g., "5052"): 5057
      ✓ Branch added

3. Summary:

   📚 School: Test School (TEST)
   📍 Branches:
      - Main Campus (MAIN)
        Database: test_main
        Port: 5056
      - Secondary Campus (SEC)
        Database: test_secondary
        Port: 5057

✅ School added successfully!

📝 Next Steps:
   1. Create databases: test_main, test_secondary
   2. Upload backend code for Test School
   3. Configure .env with database name
   4. Run migrations on each database
   5. Telegram bot will automatically see the new school!
```

### Method 2: Manual SQL

```bash
psql -U postgres -d skoolific_master
```

```sql
-- Add school
INSERT INTO schools (school_name, school_code, description) 
VALUES ('New School', 'NEWSCHOOL', 'New School Description');

-- Add branches
INSERT INTO branches (school_id, branch_name, branch_code, database_name, api_port)
VALUES 
  ((SELECT id FROM schools WHERE school_code = 'NEWSCHOOL'), 
   'Branch 1', 'B1', 'newschool_b1', 5056),
  ((SELECT id FROM schools WHERE school_code = 'NEWSCHOOL'), 
   'Branch 2', 'B2', 'newschool_b2', 5057);
```

---

## Database Schema

### Schools Table

```sql
CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  school_name VARCHAR(100) NOT NULL UNIQUE,
  school_code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**
- `id`: Unique identifier
- `school_name`: Display name (e.g., "Iqra School")
- `school_code`: Short code (e.g., "IQRA")
- `description`: Optional description
- `is_active`: Enable/disable school
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### Branches Table

```sql
CREATE TABLE branches (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_name VARCHAR(100) NOT NULL,
  branch_code VARCHAR(20) NOT NULL,
  database_name VARCHAR(100) NOT NULL,
  database_host VARCHAR(100) DEFAULT 'localhost',
  database_port INTEGER DEFAULT 5432,
  database_user VARCHAR(100),
  database_password VARCHAR(255),
  api_url VARCHAR(255),
  api_port INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, branch_code)
);
```

**Columns:**
- `id`: Unique identifier
- `school_id`: Foreign key to schools table
- `branch_name`: Display name (e.g., "Branch 1")
- `branch_code`: Short code (e.g., "B1")
- `database_name`: PostgreSQL database name (e.g., "iqrab1")
- `database_host`: Database host (default: localhost)
- `database_port`: Database port (default: 5432)
- `database_user`: Database user (optional)
- `database_password`: Database password (optional)
- `api_url`: API URL (optional)
- `api_port`: API port (e.g., 5050)
- `is_active`: Enable/disable branch
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

---

## Common Operations

### View All Schools

```sql
SELECT * FROM schools ORDER BY school_name;
```

### View All Branches

```sql
SELECT 
  s.school_name,
  b.branch_name,
  b.database_name,
  b.api_port
FROM branches b
JOIN schools s ON b.school_id = s.id
ORDER BY s.school_name, b.branch_name;
```

### View Branches for Specific School

```sql
SELECT * FROM branches 
WHERE school_id = (SELECT id FROM schools WHERE school_code = 'IQRA')
ORDER BY branch_name;
```

### Update School Information

```sql
UPDATE schools 
SET school_name = 'New Name', description = 'New Description'
WHERE school_code = 'IQRA';
```

### Update Branch Information

```sql
UPDATE branches 
SET database_name = 'new_database_name', api_port = 5060
WHERE school_id = (SELECT id FROM schools WHERE school_code = 'IQRA')
  AND branch_code = 'B1';
```

### Disable School (Hide from Bot)

```sql
UPDATE schools SET is_active = false WHERE school_code = 'IQRA';
```

### Disable Branch (Hide from Bot)

```sql
UPDATE branches SET is_active = false 
WHERE school_id = (SELECT id FROM schools WHERE school_code = 'IQRA')
  AND branch_code = 'B1';
```

### Delete School (and all branches)

```sql
DELETE FROM schools WHERE school_code = 'IQRA';
-- Branches are automatically deleted (CASCADE)
```

---

## Troubleshooting

### Bot Can't Connect to Master Database

**Error:** `database "skoolific_master" does not exist`

**Solution:**
```bash
node database/setup-master-database.js
```

### Bot Shows "No schools found"

**Check:**
1. Master database exists
2. Schools table has data
3. Schools are active (`is_active = true`)

```sql
SELECT * FROM schools WHERE is_active = true;
```

### Bot Can't Find Branches

**Check:**
1. Branches table has data
2. Branches are active (`is_active = true`)
3. `school_id` matches school in schools table

```sql
SELECT * FROM branches WHERE is_active = true;
```

### Database Connection Error

**Check `.env` file:**
```env
MASTER_DB_NAME=skoolific_master
MASTER_DB_HOST=localhost
MASTER_DB_PORT=5432
MASTER_DB_USER=postgres
MASTER_DB_PASSWORD=[REDACTED-PASSWORD]
```

---

## Migration from Old Approach

If you previously had schools/branches tables in each school database:

### Step 1: Create Master Database

```bash
node database/setup-master-database.js
```

### Step 2: Verify Data

```bash
psql -U postgres -d skoolific_master
```

```sql
SELECT 
  s.school_name,
  COUNT(b.id) as branch_count
FROM schools s
LEFT JOIN branches b ON s.id = b.school_id
GROUP BY s.id, s.school_name;
```

### Step 3: (Optional) Remove Old Tables

You can optionally remove schools/branches tables from school databases:

```sql
-- Connect to each school database
\c iqrab1

-- Drop tables (optional)
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS schools;
```

**Note:** This is optional. Old tables won't interfere with the bot.

---

## Security Considerations

### Database Credentials

- Master database credentials are in `.env` file
- Keep `.env` file secure (already in `.gitignore`)
- Use strong passwords for production

### Read-Only Access

For production, consider creating a read-only user for the bot:

```sql
-- Create read-only user
CREATE USER telegram_bot WITH PASSWORD 'secure_password';

-- Grant read-only access
GRANT CONNECT ON DATABASE skoolific_master TO telegram_bot;
GRANT USAGE ON SCHEMA public TO telegram_bot;
GRANT SELECT ON schools, branches TO telegram_bot;
```

Update `.env`:
```env
MASTER_DB_USER=telegram_bot
MASTER_DB_PASSWORD=secure_password
```

---

## Backup and Restore

### Backup Master Database

```bash
pg_dump -U postgres skoolific_master > skoolific_master_backup.sql
```

### Restore Master Database

```bash
psql -U postgres skoolific_master < skoolific_master_backup.sql
```

---

## Summary

✅ **ONE database** for all schools/branches registry  
✅ **Easy to add schools** (update only master database)  
✅ **No code changes** when adding schools  
✅ **Scalable** (works with 10 or 1000 schools)  
✅ **Maintainable** (single source of truth)  

**When adding new school:**
1. Run `node database/add-school.js`
2. Create school databases
3. Upload backend code
4. Done! Bot automatically sees new school

---

## Support

For issues or questions:
1. Check this documentation
2. Review bot logs: `node services/start-telegram-bot.js`
3. Check database: `psql -U postgres -d skoolific_master`
4. Verify `.env` configuration

---

**Master Database Status:** ✅ READY  
**Telegram Bot:** ✅ CONFIGURED  
**Documentation:** ✅ COMPLETE
