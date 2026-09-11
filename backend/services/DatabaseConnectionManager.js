// DatabaseConnectionManager.js - Multi-Branch Database Connection Manager
// Manages separate PostgreSQL database connections for each school branch

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

class DatabaseConnectionManager {
  constructor() {
    // Store connection pools for each branch
    this.pools = new Map();
    
    // Store initialization status for each branch
    this.initializedBranches = new Set();

    // Master database pool (contains branch_config table)
    this.masterPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'skoolific',
      password: String(process.env.DB_PASSWORD || '12345678'),
      port: process.env.DB_PORT || 5432,
    });

    console.log('✅ DatabaseConnectionManager initialized');
  }

  /**
   * Generate branch code from branch name
   * Algorithm: First letter + Last 2 characters (uppercase)
   * Examples:
   *   "Al Markaz Academy" -> "AMA"
   *   "Sunrise School" -> "SOL"
   *   "Tech" -> "TEH"
   */
  generateBranchCode(branchName) {
    const cleaned = branchName.trim().replace(/\s+/g, '');
    if (cleaned.length === 0) {
      throw new Error('Branch name cannot be empty');
    }
    
    if (cleaned.length === 1) {
      return cleaned.toUpperCase() + 'XX';
    } else if (cleaned.length === 2) {
      return cleaned.toUpperCase() + 'X';
    } else {
      const firstChar = cleaned[0];
      const lastTwoChars = cleaned.slice(-2);
      return (firstChar + lastTwoChars).toUpperCase();
    }
  }

  /**
   * Auto-initialize a branch database with required tables
   * Runs on first connection to ensure tables exist
   */
  async initializeBranchDatabase(pool, branchCode) {
    if (this.initializedBranches.has(branchCode)) {
      return;
    }

    try {
      // Create required schemas for branch operation
      await pool.query('CREATE SCHEMA IF NOT EXISTS classes_schema');
      await pool.query('CREATE SCHEMA IF NOT EXISTS school_comms');
      await pool.query('CREATE SCHEMA IF NOT EXISTS schedule_schema');
      await pool.query('CREATE SCHEMA IF NOT EXISTS subjects_of_school_schema');
      await pool.query('CREATE SCHEMA IF NOT EXISTS staff_teachers');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.sms_logs (
          id BIGSERIAL PRIMARY KEY,
          template_key TEXT,
          recipient_name TEXT,
          phone TEXT,
          message TEXT,
          status TEXT NOT NULL DEFAULT 'sent',
          provider TEXT,
          error TEXT,
          segments INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sms_logs_created ON public.sms_logs (created_at DESC)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sms_logs_template ON public.sms_logs (template_key)');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subjects_of_school_schema.subjects (
          id SERIAL PRIMARY KEY,
          subject_name VARCHAR(100) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subjects_of_school_schema.subject_class_mappings (
          id SERIAL PRIMARY KEY,
          subject_name VARCHAR(100) NOT NULL,
          class_name VARCHAR(50) NOT NULL,
          subject_class VARCHAR(150) GENERATED ALWAYS AS (subject_name || ' Class ' || class_name) STORED,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(subject_name, class_name)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subjects_of_school_schema.teachers_subjects (
          id SERIAL PRIMARY KEY,
          teacher_name VARCHAR(100) NOT NULL,
          subject_class VARCHAR(150) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(teacher_name, subject_class)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subjects_of_school_schema.school_config (
          id SERIAL PRIMARY KEY,
          term_count INTEGER NOT NULL DEFAULT 2,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const subConfigCheck = await pool.query('SELECT id FROM subjects_of_school_schema.school_config WHERE id = 1');
      if (subConfigCheck.rows.length === 0) {
        await pool.query('INSERT INTO subjects_of_school_schema.school_config (id, term_count) VALUES (1, 2)');
      }
      await pool.query('CREATE SCHEMA IF NOT EXISTS staff_teachers');
      await pool.query('CREATE SCHEMA IF NOT EXISTS staff_finance');
      await pool.query('CREATE SCHEMA IF NOT EXISTS posts_schema');
      await pool.query('CREATE SCHEMA IF NOT EXISTS school_schema_points');
      await pool.query('CREATE SCHEMA IF NOT EXISTS form_metadata');

      // Create form_metadata.field_types table (staff form metadata)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS form_metadata.field_types (
          id SERIAL PRIMARY KEY,
          schema_name VARCHAR(100) NOT NULL,
          table_name VARCHAR(100) NOT NULL,
          column_name VARCHAR(100) NOT NULL,
          field_type VARCHAR(50) NOT NULL,
          required BOOLEAN DEFAULT FALSE,
          options JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(schema_name, table_name, column_name)
        )
      `);

      // Create admin_users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) DEFAULT 'Administrator',
          email VARCHAR(255),
          role VARCHAR(50) DEFAULT 'super_admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        )
      `);

      // Create branding_settings table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS branding_settings (
          id SERIAL PRIMARY KEY,
          website_name VARCHAR(255) DEFAULT 'School Management System',
          website_icon VARCHAR(255),
          school_logo VARCHAR(255),
          primary_color VARCHAR(50) DEFAULT '#667eea',
          secondary_color VARCHAR(50) DEFAULT '#764ba2',
          theme_mode VARCHAR(50) DEFAULT 'light',
          school_address TEXT,
          school_phone VARCHAR(50),
          school_email VARCHAR(255),
          academic_year VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create task_completions table (tracks setup task progress)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS task_completions (
          task_id INTEGER PRIMARY KEY,
          completed BOOLEAN DEFAULT false,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed default task rows (1-7) for branch
      await pool.query(`
        INSERT INTO task_completions (task_id, completed)
        SELECT generate_series(1, 7), false
        ON CONFLICT (task_id) DO NOTHING
      `);

      // Create schedule_schema.school_config table (Task 1)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schedule_schema.school_config (
          id SERIAL PRIMARY KEY,
          periods_per_shift INTEGER DEFAULT 7,
          period_duration INTEGER DEFAULT 45,
          short_break_duration INTEGER DEFAULT 10,
          total_shifts INTEGER DEFAULT 2,
          teaching_days_per_week INTEGER DEFAULT 5,
          school_days INTEGER[] DEFAULT '{1,2,3,4,5}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Add new columns for existing tables
      await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS has_kg BOOLEAN DEFAULT false');
      await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS has_evening_class BOOLEAN DEFAULT false');
      await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS shift_rotation BOOLEAN DEFAULT false');
      await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS terms INTEGER DEFAULT 1');
      await pool.query(`
        INSERT INTO schedule_schema.school_config (id, periods_per_shift, period_duration, short_break_duration, total_shifts, teaching_days_per_week, school_days, has_kg, has_evening_class, shift_rotation, terms)
        VALUES (1, 7, 45, 10, 2, 5, '{1,2,3,4,5}', false, false, false, 1)
        ON CONFLICT (id) DO NOTHING
      `);

      // Create schedule_schema.teachers table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schedule_schema.teachers (
          id SERIAL PRIMARY KEY,
          global_staff_id INTEGER NOT NULL UNIQUE,
          teacher_name VARCHAR(100) NOT NULL UNIQUE,
          teacher_type VARCHAR(50) NOT NULL DEFAULT 'full_time' CHECK (teacher_type IN ('full_time', 'part_time')),
          staff_work_time VARCHAR(20) DEFAULT 'Full Time',
          max_periods_per_day INTEGER DEFAULT 6,
          max_periods_per_week INTEGER DEFAULT 30,
          work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create schedule_schema.subjects table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schedule_schema.subjects (
          id SERIAL PRIMARY KEY,
          subject_name VARCHAR(100) NOT NULL UNIQUE,
          subject_code VARCHAR(20) UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create schedule_schema.class_subject_configs table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schedule_schema.class_subject_configs (
          id SERIAL PRIMARY KEY,
          subject_class VARCHAR(150) NOT NULL UNIQUE,
          shift_id INTEGER NOT NULL CHECK (shift_id IN (1, 2)),
          periods_per_week INTEGER NOT NULL DEFAULT 4,
          teaching_days INTEGER[] DEFAULT '{1,2,3,4,5}',
          teacher_name VARCHAR(100),
          staff_work_time VARCHAR(20) DEFAULT 'Full Time',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create schedule_schema.schedule_slots table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schedule_schema.schedule_slots (
          id SERIAL PRIMARY KEY,
          day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
          period_number INTEGER CHECK (period_number BETWEEN 1 AND 20),
          class_name VARCHAR(50) NOT NULL,
          subject_id INTEGER,
          teacher_id INTEGER,
          shift_group VARCHAR(50) CHECK (shift_group IN ('morning', 'afternoon', 'evening')),
          shift_id INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create schedule_schema.schedule_conflicts table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schedule_schema.schedule_conflicts (
          id SERIAL PRIMARY KEY,
          conflict_type VARCHAR(50) NOT NULL,
          teacher_name VARCHAR(100),
          class_name VARCHAR(50),
          subject_name VARCHAR(100),
          day_of_week INTEGER,
          period_number INTEGER,
          conflict_details JSONB,
          resolved BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create school_schema_points.teachers table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS school_schema_points.teachers (
          id SERIAL PRIMARY KEY,
          global_staff_id INTEGER NOT NULL UNIQUE,
          teacher_name VARCHAR(100) NOT NULL,
          staff_work_time VARCHAR(50) NOT NULL DEFAULT 'Full Time',
          role VARCHAR(100) NOT NULL,
          staff_enrollment_type VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create staff_counter table (global staff ID tracking)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff_counter (
          id SERIAL PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0
        )
      `);
      const staffCountCheck = await pool.query('SELECT count FROM staff_counter WHERE id = 1');
      if (staffCountCheck.rows.length === 0) {
        await pool.query('INSERT INTO staff_counter (id, count) VALUES (1, 0)');
      }

      // Create staff_users table (staff credentials)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff_users (
          id SERIAL PRIMARY KEY,
          global_staff_id INTEGER NOT NULL,
          username VARCHAR(100) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          password_plain VARCHAR(100),
          staff_type VARCHAR(50) NOT NULL,
          class_name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (global_staff_id),
          UNIQUE (username)
        )
      `);
      try { await pool.query('ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS password_plain VARCHAR(100)'); } catch (e) { /* may already exist */ }

      // Create shift_time_settings table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shift_time_settings (
          id SERIAL PRIMARY KEY,
          total_shifts INTEGER DEFAULT 1,
          shift_rotation BOOLEAN DEFAULT false,
          shift1_morning_start TIME DEFAULT '07:00',
          shift1_morning_end TIME DEFAULT '12:30',
          shift1_afternoon_start TIME DEFAULT '12:30',
          shift1_afternoon_end TIME DEFAULT '17:30',
          shift2_morning_start TIME DEFAULT '07:00',
          shift2_morning_end TIME DEFAULT '12:30',
          shift2_afternoon_start TIME DEFAULT '12:30',
          shift2_afternoon_end TIME DEFAULT '17:30',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create school_config table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS school_config (
          id SERIAL PRIMARY KEY,
          terms INTEGER DEFAULT 1,
          periods_per_shift INTEGER DEFAULT 7,
          period_duration INTEGER DEFAULT 45,
          short_break_duration INTEGER DEFAULT 10,
          teaching_days_per_week INTEGER DEFAULT 5,
          school_days TEXT DEFAULT '1,2,3,4,5',
          has_kg BOOLEAN DEFAULT false,
          has_evening_class BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Check if default admin exists
      const adminCheck = await pool.query(
        'SELECT id FROM admin_users WHERE username = $1',
        ['admin']
      );

      // Insert default admin if not exists
      if (adminCheck.rows.length === 0) {
        const defaultHash = await bcrypt.hash('admin123', 10);
        await pool.query(
          'INSERT INTO admin_users (username, password_hash, name, role) VALUES ($1, $2, $3, $4)',
          ['admin', defaultHash, 'Administrator', 'super_admin']
        );
      }

      // Insert default branding row if not exists
      const brandingCheck = await pool.query(
        'SELECT id FROM branding_settings WHERE id = 1'
      );
      if (brandingCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO branding_settings (id, website_name, primary_color, secondary_color, theme_mode)
           VALUES (1, 'School Management System', '#667eea', '#764ba2', 'light')`
        );
      }

      // Insert default school_config row if not exists
      const configCheck = await pool.query('SELECT id FROM school_config WHERE id = 1');
      if (configCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO school_config (id, academic_year, current_year, number_of_terms, school_days, shift_count, periods_per_shift, period_duration_minutes, terms, period_duration, short_break_duration, teaching_days_per_week)
           VALUES (1, '2025/2026', 2025, 3, '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb, 1, 7, 45, 1, 45, 10, 5)`
        );
      }

      // Insert default shift_time_settings row if not exists
      const shiftCheck = await pool.query('SELECT id FROM shift_time_settings WHERE id = 1');
      if (shiftCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO shift_time_settings (id, total_shifts)
           VALUES (1, 1)`
        );
      }

      this.initializedBranches.add(branchCode);
      console.log(`✅ Auto-initialized branch database schema (${branchCode})`);
    } catch (error) {
      console.error(`❌ Failed to initialize branch database (${branchCode}):`, error.message);
      // Don't throw - allow connection to proceed even if init fails
    }
  }

  /**
   * Scan all PostgreSQL databases and find unregistered ones
   * Returns list of databases NOT in branch_config + system DBs
   */
  async scanUnregisteredDatabases() {
    const SYSTEM_DBS = ['postgres', 'template0', 'template1'];
    
    const allDbs = await this.masterPool.query(
      `SELECT datname FROM pg_database 
       WHERE datistemplate = false 
       AND datname NOT IN ('postgres', 'template0', 'template1')
       ORDER BY datname`
    );

    const registered = await this.masterPool.query(
      'SELECT database_name FROM branch_config'
    );

    const registeredNames = new Set(registered.rows.map(r => r.database_name));
    
    const unregistered = allDbs.rows
      .map(r => r.datname)
      .filter(name => !SYSTEM_DBS.includes(name) && !registeredNames.has(name))
      .map(dbName => {
        // Generate a branch code from database name
        const cleanName = dbName.replace(/[^a-zA-Z0-9]/g, '');
        let branchCode = '';
        if (cleanName.length >= 3) {
          branchCode = (cleanName[0] + cleanName.slice(-2)).toUpperCase();
        } else if (cleanName.length === 2) {
          branchCode = cleanName.toUpperCase() + 'X';
        } else if (cleanName.length === 1) {
          branchCode = cleanName.toUpperCase() + 'XX';
        } else {
          branchCode = 'B01';
        }
        return {
          databaseName: dbName,
          suggestedBranchCode: branchCode,
          suggestedBranchName: dbName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        };
      });

    return unregistered;
  }

  /**
   * Auto-register a database in branch_config with generated branch code
   */
  async autoRegisterBranch(databaseName, customBranchCode = null, customBranchName = null) {
    // Check if already registered
    const existing = await this.masterPool.query(
      'SELECT id FROM branch_config WHERE database_name = $1',
      [databaseName]
    );

    if (existing.rows.length > 0) {
      return {
        alreadyRegistered: true,
        branch: existing.rows[0]
      };
    }

    // Check if database actually exists in PostgreSQL
    const dbExists = await this.masterPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if (dbExists.rows.length === 0) {
      // Create the database
      try {
        await this.masterPool.query(`CREATE DATABASE "${databaseName}"`);
        console.log(`✅ Created database: ${databaseName}`);
      } catch (error) {
        if (error.code === '42P04') {
          console.log(`ℹ️ Database ${databaseName} already exists`);
        } else {
          throw new Error(`Failed to create database ${databaseName}: ${error.message}`);
        }
      }
    }

    // Generate branch code and name
    const cleanName = databaseName.replace(/[^a-zA-Z0-9]/g, '');
    const branchCode = customBranchCode || this.generateBranchCode(cleanName);
    const branchName = customBranchName || databaseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Get DB credentials from .env (single school = single PG user)
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT || '5432');

    // Register in branch_config (credentials now come from .env at connection time)
    const result = await this.masterPool.query(
      `INSERT INTO branch_config (
        branch_name, branch_code, database_name, database_host, database_port,
        database_user, database_password, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *`,
      [branchName, branchCode, databaseName, dbHost, dbPort,
       process.env.DB_USER || 'postgres',
       String(process.env.DB_PASSWORD || '12345678')]
    );

    console.log(`✅ Auto-registered branch: ${branchName} (${branchCode}) -> ${databaseName}`);
    
    return {
      alreadyRegistered: false,
      branch: result.rows[0],
      branchCode: branchCode
    };
  }

  /**
   * Get database pool for a specific branch
   * Creates new pool if it doesn't exist
   * Auto-initializes schema on first connection
   */
  async getPool(branchCode) {
    branchCode = branchCode.toUpperCase();
    // Check if pool already exists
    if (this.pools.has(branchCode)) {
      return this.pools.get(branchCode);
    }

    // Fetch branch configuration from master database
    const result = await this.masterPool.query(
      'SELECT * FROM branch_config WHERE branch_code = $1 AND is_active = true',
      [branchCode]
    );

    if (result.rows.length === 0) {
      throw new Error(`Branch with code "${branchCode}" not found or inactive`);
    }

    const branchConfig = result.rows[0];

    // Create new connection pool for this branch
    // ALWAYS use .env credentials for DB user/password (single school = single PG user)
    const pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: branchConfig.database_name,
      password: String(process.env.DB_PASSWORD || '12345678'),
      port: process.env.DB_PORT || 5432,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test the connection
    try {
      const client = await pool.connect();
      console.log(`✅ Connected to branch database: ${branchConfig.database_name} (${branchCode})`);
      client.release();
    } catch (error) {
      console.error(`❌ Failed to connect to branch database: ${branchConfig.database_name}`, error);
      throw new Error(`Failed to connect to branch database: ${error.message}`);
    }

    // Auto-initialize the branch database schema
    await this.initializeBranchDatabase(pool, branchCode);

    // Store pool for reuse
    this.pools.set(branchCode, pool);

    return pool;
  }

  /**
   * Resolve database name from branch code
   */
  async resolveDatabaseName(branchCode) {
    const result = await this.masterPool.query(
      'SELECT database_name FROM branch_config WHERE branch_code = $1 AND is_active = true',
      [branchCode]
    );

    if (result.rows.length === 0) {
      throw new Error(`Branch with code "${branchCode}" not found`);
    }

    return result.rows[0].database_name;
  }

  /**
   * Get all active branches
   */
  async getAllBranches() {
    const result = await this.masterPool.query(
      'SELECT id, branch_name, branch_code, database_name, school_address, school_phone, created_at FROM branch_config WHERE is_active = true ORDER BY branch_name'
    );
    return result.rows;
  }

  /**
   * Create new branch configuration
   */
  async createBranch(branchData) {
    const { branchName, databaseName, databaseHost, databasePort, databaseUser, databasePassword, schoolAddress, schoolPhone, schoolEmail, adminName, adminEmail, adminPhone } = branchData;

    // Generate branch code
    const branchCode = this.generateBranchCode(branchName);

    // Create the PostgreSQL database if it doesn't exist
    try {
      const dbExists = await this.masterPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName]
      );
      if (dbExists.rows.length === 0) {
        await this.masterPool.query(`CREATE DATABASE "${databaseName}"`);
        console.log(`✅ Created database: ${databaseName}`);
      }
    } catch (error) {
      if (error.code !== '42P04') {
        console.error(`⚠️ Could not create database ${databaseName}:`, error.message);
      }
    }

    // Insert into branch_config
    const result = await this.masterPool.query(
      `INSERT INTO branch_config (
        branch_name, branch_code, database_name, database_host, database_port,
        database_user, database_password, school_address, school_phone, school_email,
        admin_name, admin_email, admin_phone, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
      RETURNING *`,
      [branchName, branchCode, databaseName, databaseHost || 'localhost', databasePort || 5432,
       databaseUser, databasePassword, schoolAddress, schoolPhone, schoolEmail,
       adminName, adminEmail, adminPhone]
    );

    console.log(`✅ Branch created: ${branchName} (${branchCode}) -> ${databaseName}`);

    // Auto-initialize the branch database schema
    // ALWAYS use .env credentials (single school = single PG user)
    const pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: databaseHost || 'localhost',
      database: databaseName,
      password: String(process.env.DB_PASSWORD || '12345678'),
      port: databasePort || 5432,
      max: 20,
      idleTimeoutMillis: 3000,
      connectionTimeoutMillis: 2000,
    });

    try {
      const client = await pool.connect();
      client.release();
      await this.initializeBranchDatabase(pool, branchCode);
    } catch (error) {
      console.error(`⚠️ Could not initialize branch database schema:`, error.message);
    }

    return result.rows[0];
  }

  /**
   * Close all connection pools
   */
  async closeAll() {
    console.log('🔌 Closing all database connections...');
    
    for (const [branchCode, pool] of this.pools.entries()) {
      await pool.end();
      console.log(`  ✓ Closed pool for branch: ${branchCode}`);
    }
    
    await this.masterPool.end();
    console.log('  ✓ Closed master pool');
    
    this.pools.clear();
    console.log('✅ All database connections closed');
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(branchCode) {
    const pool = this.pools.get(branchCode);
    if (!pool) {
      return null;
    }

    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
  }
}

// Export singleton instance
const dbManager = new DatabaseConnectionManager();

module.exports = dbManager;
