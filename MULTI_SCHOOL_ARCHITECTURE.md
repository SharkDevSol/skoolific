# Multi-School Multi-Branch Architecture - Complete Solution

## 🎯 Your Requirements

1. **Multiple Schools** (IQRA, BILAL, etc.)
2. **Each school has multiple branches** (iqrab1, iqrab2, bilalb1, etc.)
3. **Each branch has its own database**
4. **Each school has its own Super Admin**
5. **Super Admin only sees their school's branches**
6. **Need to create databases with branch codes**
7. **Want to organize by database users** (DB_USER=iqra for all IQRA databases)

---

## 🏗️ Recommended Architecture

### Database Structure

```
PostgreSQL Server
│
├── Master Database: skoolific_master
│   └── Tables:
│       ├── schools (IQRA, BILAL, etc.)
│       ├── branches (iqrab1, iqrab2, bilalb1, etc.)
│       └── super_admins (iqrasuperadmin, bilalsuperadmin)
│
├── IQRA Databases (Owner: iqra_user)
│   ├── iqrab1_db
│   ├── iqrab2_db
│   └── iqrab3_db
│
├── BILAL Databases (Owner: bilal_user)
│   ├── bilalb1_db
│   └── bilalb2_db
│
└── ALMARKAZ Databases (Owner: almarkaz_user)
    ├── almarkazb1_db
    └── almarkazb2_db
```

### Database Users

```sql
-- Master database user (for registry)
User: postgres
Password: [REDACTED-PASSWORD]
Access: skoolific_master only

-- IQRA school user (owns all IQRA databases)
User: iqra_user
Password: [REDACTED-PASSWORD]
Access: iqrab1_db, iqrab2_db, iqrab3_db

-- BILAL school user (owns all BILAL databases)
User: bilal_user
Password: [REDACTED-PASSWORD]
Access: bilalb1_db, bilalb2_db

-- ALMARKAZ school user
User: almarkaz_user
Password: [REDACTED-PASSWORD]
Access: almarkazb1_db, almarkazb2_db
```

---

## 📊 Master Database Schema

### Table: schools

```sql
CREATE TABLE schools (
    id SERIAL PRIMARY KEY,
    school_name VARCHAR(100) NOT NULL UNIQUE,
    school_code VARCHAR(20) NOT NULL UNIQUE,
    db_user VARCHAR(50) NOT NULL,
    db_password VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example data:
INSERT INTO schools (school_name, school_code, db_user, db_password) VALUES
('IQRA School', 'IQRA', 'iqra_user', '[REDACTED-PASSWORD]'),
('BILAL School', 'BILAL', 'bilal_user', '[REDACTED-PASSWORD]'),
('Al-Markaz School', 'ALMARKAZ', 'almarkaz_user', '[REDACTED-PASSWORD]');
```

### Table: branches

```sql
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    branch_name VARCHAR(100) NOT NULL,
    branch_code VARCHAR(20) NOT NULL UNIQUE,
    database_name VARCHAR(100) NOT NULL UNIQUE,
    database_host VARCHAR(100) DEFAULT 'localhost',
    database_port INTEGER DEFAULT 5432,
    school_address TEXT,
    school_phone VARCHAR(50),
    school_email VARCHAR(255),
    admin_name VARCHAR(255),
    admin_email VARCHAR(255),
    admin_phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example data:
INSERT INTO branches (school_id, branch_name, branch_code, database_name) VALUES
-- IQRA branches (school_id = 1)
(1, 'IQRA Branch 1', 'IQB1', 'iqrab1_db'),
(1, 'IQRA Branch 2', 'IQB2', 'iqrab2_db'),
(1, 'IQRA Branch 3', 'IQB3', 'iqrab3_db'),

-- BILAL branches (school_id = 2)
(2, 'BILAL Branch 1', 'BIB1', 'bilalb1_db'),
(2, 'BILAL Branch 2', 'BIB2', 'bilalb2_db');
```

### Table: super_admins

```sql
CREATE TABLE super_admins (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'school_super_admin',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example data:
INSERT INTO super_admins (school_id, username, password_hash, full_name, email) VALUES
(1, 'iqrasuperadmin', '$2a$10$...', 'IQRA Super Admin', 'admin@iqra.edu'),
(2, 'bilalsuperadmin', '$2a$10$...', 'BILAL Super Admin', 'admin@bilal.edu');
```

---

## 🔧 Implementation

### Step 1: Create Database Setup Script

```javascript
// backend/database/setup-multi-school-system.js

const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function setupMultiSchoolSystem() {
  console.log('🏗️  Setting up Multi-School System...\n');

  // Connect to PostgreSQL
  const masterClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '[REDACTED-PASSWORD]'
  });

  await masterClient.connect();

  // 1. Create master database
  console.log('1. Creating master database...');
  try {
    await masterClient.query('CREATE DATABASE skoolific_master');
    console.log('   ✓ Master database created\n');
  } catch (err) {
    if (err.code === '42P04') {
      console.log('   ⚠️  Master database already exists\n');
    } else {
      throw err;
    }
  }

  await masterClient.end();

  // 2. Connect to master database and create tables
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'skoolific_master',
    user: 'postgres',
    password: '[REDACTED-PASSWORD]'
  });

  await client.connect();

  console.log('2. Creating tables...');
  
  // Create schools table
  await client.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      school_name VARCHAR(100) NOT NULL UNIQUE,
      school_code VARCHAR(20) NOT NULL UNIQUE,
      db_user VARCHAR(50) NOT NULL,
      db_password VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create branches table
  await client.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      branch_name VARCHAR(100) NOT NULL,
      branch_code VARCHAR(20) NOT NULL UNIQUE,
      database_name VARCHAR(100) NOT NULL UNIQUE,
      database_host VARCHAR(100) DEFAULT 'localhost',
      database_port INTEGER DEFAULT 5432,
      school_address TEXT,
      school_phone VARCHAR(50),
      school_email VARCHAR(255),
      admin_name VARCHAR(255),
      admin_email VARCHAR(255),
      admin_phone VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create super_admins table
  await client.query(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(50) DEFAULT 'school_super_admin',
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('   ✓ Tables created\n');

  // 3. Insert sample schools
  console.log('3. Inserting schools...');
  
  const schools = [
    {
      name: 'IQRA School',
      code: 'IQRA',
      user: 'iqra_user',
      password: '[REDACTED-PASSWORD]',
      description: 'IQRA Islamic School Network'
    },
    {
      name: 'BILAL School',
      code: 'BILAL',
      user: 'bilal_user',
      password: '[REDACTED-PASSWORD]',
      description: 'BILAL Education System'
    }
  ];

  for (const school of schools) {
    const result = await client.query(
      `INSERT INTO schools (school_name, school_code, db_user, db_password, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (school_code) DO NOTHING
       RETURNING id`,
      [school.name, school.code, school.user, school.password, school.description]
    );
    
    if (result.rows.length > 0) {
      console.log(`   ✓ ${school.name}`);
    } else {
      console.log(`   ⚠️  ${school.name} (already exists)`);
    }
  }

  console.log('');

  // 4. Create database users
  console.log('4. Creating database users...');
  
  const dbClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '[REDACTED-PASSWORD]'
  });

  await dbClient.connect();

  for (const school of schools) {
    try {
      await dbClient.query(`CREATE USER ${school.user} WITH PASSWORD '${school.password}'`);
      console.log(`   ✓ Created user: ${school.user}`);
    } catch (err) {
      if (err.code === '42710') {
        console.log(`   ⚠️  User ${school.user} already exists`);
      } else {
        throw err;
      }
    }
  }

  await dbClient.end();
  console.log('');

  // 5. Create super admin accounts
  console.log('5. Creating super admin accounts...');
  
  const superAdmins = [
    {
      schoolCode: 'IQRA',
      username: 'iqrasuperadmin',
      password: 'admin123',
      fullName: 'IQRA Super Administrator',
      email: 'admin@iqra.edu'
    },
    {
      schoolCode: 'BILAL',
      username: 'bilalsuperadmin',
      password: 'admin123',
      fullName: 'BILAL Super Administrator',
      email: 'admin@bilal.edu'
    }
  ];

  for (const admin of superAdmins) {
    const schoolResult = await client.query(
      'SELECT id FROM schools WHERE school_code = $1',
      [admin.schoolCode]
    );

    if (schoolResult.rows.length > 0) {
      const passwordHash = await bcrypt.hash(admin.password, 10);
      
      const result = await client.query(
        `INSERT INTO super_admins (school_id, username, password_hash, full_name, email)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING
         RETURNING id`,
        [schoolResult.rows[0].id, admin.username, passwordHash, admin.fullName, admin.email]
      );

      if (result.rows.length > 0) {
        console.log(`   ✓ ${admin.username} (password: ${admin.password})`);
      } else {
        console.log(`   ⚠️  ${admin.username} (already exists)`);
      }
    }
  }

  await client.end();

  console.log('\n✅ Multi-School System setup complete!\n');
  console.log('📝 Next Steps:');
  console.log('   1. Create branches for each school');
  console.log('   2. Run migrations for each branch database');
  console.log('   3. Test super admin login\n');
}

setupMultiSchoolSystem().catch(console.error);
```

### Step 2: Create Branch with Database

```javascript
// backend/services/MultiSchoolManager.js

const { Pool, Client } = require('pg');

class MultiSchoolManager {
  constructor() {
    // Master database pool
    this.masterPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'skoolific_master',
      user: 'postgres',
      password: '[REDACTED-PASSWORD]'
    });

    // Cache for school database pools
    this.schoolPools = new Map();
  }

  /**
   * Create a new branch with its database
   */
  async createBranch(branchData) {
    const {
      schoolCode,
      branchName,
      branchCode,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      adminName,
      adminEmail,
      adminPhone
    } = branchData;

    // 1. Get school information
    const schoolResult = await this.masterPool.query(
      'SELECT id, db_user, db_password FROM schools WHERE school_code = $1',
      [schoolCode]
    );

    if (schoolResult.rows.length === 0) {
      throw new Error(`School with code "${schoolCode}" not found`);
    }

    const school = schoolResult.rows[0];
    const databaseName = `${schoolCode.toLowerCase()}b${Date.now()}_db`;

    // 2. Create the database
    const dbClient = new Client({
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: '[REDACTED-PASSWORD]'
    });

    await dbClient.connect();

    try {
      await dbClient.query(`CREATE DATABASE ${databaseName} OWNER ${school.db_user}`);
      console.log(`✅ Database created: ${databaseName}`);
    } catch (err) {
      if (err.code !== '42P04') { // Ignore if already exists
        throw err;
      }
    }

    await dbClient.end();

    // 3. Grant permissions to school user
    const grantClient = new Client({
      host: 'localhost',
      port: 5432,
      database: databaseName,
      user: 'postgres',
      password: '[REDACTED-PASSWORD]'
    });

    await grantClient.connect();
    await grantClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${databaseName} TO ${school.db_user}`);
    await grantClient.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${school.db_user}`);
    await grantClient.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${school.db_user}`);
    await grantClient.end();

    // 4. Run migrations on new database
    await this.runMigrations(databaseName, school.db_user, school.db_password);

    // 5. Insert branch record
    const result = await this.masterPool.query(
      `INSERT INTO branches (
        school_id, branch_name, branch_code, database_name,
        school_address, school_phone, school_email,
        admin_name, admin_email, admin_phone, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING *`,
      [
        school.id, branchName, branchCode, databaseName,
        schoolAddress, schoolPhone, schoolEmail,
        adminName, adminEmail, adminPhone
      ]
    );

    console.log(`✅ Branch created: ${branchName} (${branchCode}) -> ${databaseName}`);
    return result.rows[0];
  }

  /**
   * Get all branches for a specific school
   */
  async getSchoolBranches(schoolCode) {
    const result = await this.masterPool.query(
      `SELECT b.* FROM branches b
       JOIN schools s ON b.school_id = s.id
       WHERE s.school_code = $1 AND b.is_active = true
       ORDER BY b.branch_name`,
      [schoolCode]
    );

    return result.rows;
  }

  /**
   * Get database pool for a specific branch
   */
  async getBranchPool(branchCode) {
    // Check cache
    if (this.schoolPools.has(branchCode)) {
      return this.schoolPools.get(branchCode);
    }

    // Get branch and school info
    const result = await this.masterPool.query(
      `SELECT b.database_name, b.database_host, b.database_port,
              s.db_user, s.db_password
       FROM branches b
       JOIN schools s ON b.school_id = s.id
       WHERE b.branch_code = $1 AND b.is_active = true`,
      [branchCode]
    );

    if (result.rows.length === 0) {
      throw new Error(`Branch with code "${branchCode}" not found`);
    }

    const branch = result.rows[0];

    // Create pool
    const pool = new Pool({
      host: branch.database_host || 'localhost',
      port: branch.database_port || 5432,
      database: branch.database_name,
      user: branch.db_user,
      password: branch.db_password,
      max: 20
    });

    // Test connection
    const client = await pool.connect();
    console.log(`✅ Connected to branch: ${branchCode} (${branch.database_name})`);
    client.release();

    // Cache pool
    this.schoolPools.set(branchCode, pool);

    return pool;
  }

  /**
   * Run migrations on a database
   */
  async runMigrations(databaseName, dbUser, dbPassword) {
    console.log(`📋 Running migrations on ${databaseName}...`);
    
    const migrationClient = new Client({
      host: 'localhost',
      port: 5432,
      database: databaseName,
      user: dbUser,
      password: dbPassword
    });

    await migrationClient.connect();

    // Run your migration files here
    // Example: Read from backend/database/migrations/*.sql
    const fs = require('fs');
    const path = require('path');
    const migrationsDir = path.join(__dirname, '../database/migrations');
    
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await migrationClient.query(sql);
        console.log(`   ✓ ${file}`);
      } catch (err) {
        console.error(`   ✗ ${file}:`, err.message);
      }
    }

    await migrationClient.end();
    console.log(`✅ Migrations complete for ${databaseName}`);
  }

  /**
   * Transfer data between databases (for your question)
   */
  async transferData(sourceBranchCode, targetBranchCode, tableName) {
    const sourcePool = await this.getBranchPool(sourceBranchCode);
    const targetPool = await this.getBranchPool(targetBranchCode);

    // Get data from source
    const sourceData = await sourcePool.query(`SELECT * FROM ${tableName}`);

    // Insert into target
    for (const row of sourceData.rows) {
      const columns = Object.keys(row).join(', ');
      const values = Object.values(row);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      await targetPool.query(
        `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        values
      );
    }

    console.log(`✅ Transferred ${sourceData.rows.length} rows from ${sourceBranchCode} to ${targetBranchCode}`);
  }

  /**
   * Get aggregated data across all branches of a school
   */
  async getSchoolAggregatedData(schoolCode) {
    const branches = await this.getSchoolBranches(schoolCode);
    const aggregatedData = {
      totalStudents: 0,
      totalStaff: 0,
      branches: []
    };

    for (const branch of branches) {
      const pool = await this.getBranchPool(branch.branch_code);

      // Get student count
      const studentResult = await pool.query('SELECT COUNT(*) as count FROM students');
      const studentCount = parseInt(studentResult.rows[0].count);

      // Get staff count
      const staffResult = await pool.query('SELECT COUNT(*) as count FROM staff');
      const staffCount = parseInt(staffResult.rows[0].count);

      aggregatedData.totalStudents += studentCount;
      aggregatedData.totalStaff += staffCount;
      aggregatedData.branches.push({
        branchCode: branch.branch_code,
        branchName: branch.branch_name,
        students: studentCount,
        staff: staffCount
      });
    }

    return aggregatedData;
  }
}

module.exports = new MultiSchoolManager();
```

---

## 🔐 Authentication Flow

### Super Admin Login

```javascript
// Super Admin logs in with username
POST /api/super-admin/auth/login
{
  "username": "iqrasuperadmin",
  "password": "admin123"
}

// Backend checks super_admins table
// Returns JWT with school_id
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "iqrasuperadmin",
    "school_code": "IQRA",
    "school_id": 1,
    "role": "school_super_admin"
  }
}

// Super Admin can only see IQRA branches
GET /api/super-admin/branches
// Returns: iqrab1, iqrab2, iqrab3 only
```

### Branch User Login

```javascript
// User logs in with branch code
POST /api/auth/login
{
  "branchCode": "IQB1",
  "username": "student123",
  "password": "password"
}

// Backend:
// 1. Looks up branch in master DB
// 2. Gets database name and credentials
// 3. Connects to branch database
// 4. Authenticates user
```

---

## ✅ Answers to Your Questions

### Q1: Can I put all school databases under one user (e.g., DB_USER=iqra)?

**Answer: YES! This is the recommended approach.**

Benefits:
- ✅ Easy to manage permissions
- ✅ All IQRA databases owned by iqra_user
- ✅ Easier backup/restore
- ✅ Better organization

### Q2: Can I transfer data from one user to another?

**Answer: YES! You can transfer data between databases.**

```javascript
// Transfer students from iqrab1 to iqrab2
await multiSchoolManager.transferData('IQB1', 'IQB2', 'students');

// Or use PostgreSQL directly
pg_dump -U iqra_user iqrab1_db -t students | psql -U iqra_user iqrab2_db
```

### Q3: Can I get data from another database to show it?

**Answer: YES! You can query any database you have access to.**

```javascript
// Get all students from all IQRA branches
const iqraBranches = await multiSchoolManager.getSchoolBranches('IQRA');

for (const branch of iqraBranches) {
  const pool = await multiSchoolManager.getBranchPool(branch.branch_code);
  const students = await pool.query('SELECT * FROM students');
  console.log(`${branch.branch_name}: ${students.rows.length} students`);
}

// Or aggregate data
const aggregated = await multiSchoolManager.getSchoolAggregatedData('IQRA');
console.log(`Total IQRA students: ${aggregated.totalStudents}`);
```

---

## 🚀 Implementation Steps

1. **Run setup script**
   ```bash
   node backend/database/setup-multi-school-system.js
   ```

2. **Create branches**
   ```javascript
   await multiSchoolManager.createBranch({
     schoolCode: 'IQRA',
     branchName: 'IQRA Branch 1',
     branchCode: 'IQB1',
     schoolAddress: '123 Main St',
     schoolPhone: '+1234567890',
     schoolEmail: 'iqrab1@iqra.edu',
     adminName: 'John Doe',
     adminEmail: 'john@iqra.edu',
     adminPhone: '+1234567890'
   });
   ```

3. **Login as super admin**
   ```
   Username: iqrasuperadmin
   Password: admin123
   ```

4. **View only your school's branches**
   ```javascript
   GET /api/super-admin/branches
   // Returns only IQRA branches
   ```

---

## 📊 Final Architecture

```
Master Database (skoolific_master)
├── schools table
│   ├── IQRA (db_user: iqra_user)
│   ├── BILAL (db_user: bilal_user)
│   └── ALMARKAZ (db_user: almarkaz_user)
│
├── branches table
│   ├── IQB1 → iqrab1_db (owner: iqra_user)
│   ├── IQB2 → iqrab2_db (owner: iqra_user)
│   ├── BIB1 → bilalb1_db (owner: bilal_user)
│   └── BIB2 → bilalb2_db (owner: bilal_user)
│
└── super_admins table
    ├── iqrasuperadmin (school_id: 1)
    └── bilalsuperadmin (school_id: 2)
```

**Perfect solution for your needs!** ✅
