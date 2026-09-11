const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');

// Ensure staff_users table exists (safe to call anytime)
const ensureStaffUsersTable = async () => {
  try {
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
      );
    `);
    
    try {
      await pool.query(`
        ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS password_plain VARCHAR(100)
      `);
    } catch (alterError) {
      // Column might already exist
    }
  } catch (error) {
    console.error('Error ensuring staff_users table:', error);
    throw error;
  }
};

// Initialize staff_users table (backward compat)
const initializeStaffUsersTable = ensureStaffUsersTable;

// Generate username based on staff name
const generateUsername = (name) => {
  // Remove spaces and special characters, convert to lowercase
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  // Add random suffix to ensure uniqueness
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${cleanName}${randomSuffix}`;
};

// Generate secure random password
const generatePassword = () => {
  const length = 8;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Create staff user account
const createStaffUser = async (globalStaffId, name, staffType, className) => {
  try {
    // Ensure staff_users table exists before using it
    await ensureStaffUsersTable();

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM staff_users WHERE global_staff_id = $1',
      [globalStaffId]
    );
    
    if (existingUser.rows.length > 0) {
      console.log(`User already exists for global_staff_id: ${globalStaffId}`);
      return null;
    }

    // Generate unique username
    let username = generateUsername(name);
    let usernameExists = true;
    let attempts = 0;
    
    while (usernameExists && attempts < 10) {
      const result = await pool.query('SELECT id FROM staff_users WHERE username = $1', [username]);
      if (result.rows.length === 0) {
        usernameExists = false;
      } else {
        username = generateUsername(name);
        attempts++;
      }
    }
    
    if (usernameExists) {
      throw new Error('Unable to generate unique username');
    }

    // Generate and hash password
    const password = generatePassword();
    const passwordHash = await hashPassword(password);

    // Insert user (also store plain password for admin viewing)
    await pool.query(
      `INSERT INTO staff_users (global_staff_id, username, password_hash, password_plain, staff_type, class_name) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [globalStaffId, username, passwordHash, password, staffType, className]
    );

    console.log(`Created staff user account for ${name}: username=${username}`);
    
    return {
      username,
      password,
      globalStaffId
    };
  } catch (error) {
    console.error('Error creating staff user:', error);
    throw error;
  }
};

// Verify user credentials
const verifyCredentials = async (username, password) => {
  try {
    const result = await pool.query(
      'SELECT id, global_staff_id, password_hash, staff_type, class_name FROM staff_users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (isValid) {
      return {
        id: user.id,
        globalStaffId: user.global_staff_id,
        username: username,
        staffType: user.staff_type,
        className: user.class_name
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error verifying credentials:', error);
    throw error;
  }
};

// Get staff profile data
const getStaffProfile = async (globalStaffId, staffType, className) => {
  try {
    const schemaName = `staff_${staffType.replace(/\s+/g, '_').toLowerCase()}`;
    
    // First check if the schema and table exist
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_name = $2
      )
    `, [schemaName, className]);
    
    if (!tableCheck.rows[0].exists) {
      console.log(`Table ${schemaName}.${className} does not exist, returning basic profile`);
      // Return basic profile from staff_users table
      const basicProfile = await pool.query(
        `SELECT global_staff_id, username, staff_type, class_name 
         FROM staff_users 
         WHERE global_staff_id = $1`,
        [globalStaffId]
      );
      return basicProfile.rows[0] || null;
    }
    
    // Check if is_active column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = $1 
        AND table_name = $2 
        AND column_name = 'is_active'
    `, [schemaName, className]);
    
    const hasIsActive = columnCheck.rows.length > 0;
    const whereClause = hasIsActive ? 'AND (is_active = TRUE OR is_active IS NULL)' : '';
    
    const result = await pool.query(
      `SELECT * FROM "${schemaName}"."${className}" WHERE global_staff_id = $1 ${whereClause}`,
      [globalStaffId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error getting staff profile:', error);
    // Return basic profile as fallback
    try {
      const basicProfile = await pool.query(
        `SELECT global_staff_id, username, staff_type, class_name 
         FROM staff_users 
         WHERE global_staff_id = $1`,
        [globalStaffId]
      );
      return basicProfile.rows[0] || null;
    } catch (fallbackError) {
      console.error('Fallback profile query failed:', fallbackError);
      throw error;
    }
  }
};

// NEW: Get all staff users with their credentials (for admin purposes)
const getAllStaffUsers = async () => {
  try {
    const result = await pool.query(
      'SELECT global_staff_id, username, staff_type, class_name, created_at FROM staff_users ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all staff users:', error);
    throw error;
  }
};

// NEW: Search staff user by name or username
const searchStaffUser = async (searchTerm) => {
  try {
    // First, search in staff_users table by username
    const userResult = await pool.query(
      'SELECT global_staff_id, username, staff_type, class_name FROM staff_users WHERE username ILIKE $1',
      [`%${searchTerm}%`]
    );
    
    if (userResult.rows.length > 0) {
      return userResult.rows;
    }
    
    // If not found by username, search by name in staff tables
    const staffTypes = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
    const results = [];
    
    for (const staffType of staffTypes) {
      try {
        const schemaName = `staff_${staffType.replace(/\s+/g, '_').toLowerCase()}`;
        
        // Get all tables in this schema
        const tablesResult = await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
          [schemaName]
        );
        
        for (const table of tablesResult.rows) {
          const className = table.table_name;
          const staffResult = await pool.query(
            `SELECT s.global_staff_id, s.name, u.username, u.staff_type, u.class_name 
             FROM "${schemaName}"."${className}" s
             JOIN staff_users u ON s.global_staff_id = u.global_staff_id
             WHERE s.name ILIKE $1`,
            [`%${searchTerm}%`]
          );
          
          results.push(...staffResult.rows);
        }
      } catch (schemaError) {
        // Schema or table might not exist, continue with next staff type
        continue;
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error searching staff user:', error);
    throw error;
  }
};

// NEW: Reset password for a staff member
const resetStaffPassword = async (globalStaffId) => {
  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT username, staff_type, class_name FROM staff_users WHERE global_staff_id = $1',
      [globalStaffId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('Staff user not found');
    }
    
    const user = userResult.rows[0];
    
    // Generate new password
    const newPassword = generatePassword();
    const newPasswordHash = await hashPassword(newPassword);
    
    // Update password in database (also store plain password for admin viewing)
    await pool.query(
      'UPDATE staff_users SET password_hash = $1, password_plain = $2 WHERE global_staff_id = $3',
      [newPasswordHash, newPassword, globalStaffId]
    );
    
    console.log(`Password reset for user: ${user.username} (global_staff_id: ${globalStaffId})`);
    
    return {
      username: user.username,
      newPassword: newPassword,
      globalStaffId: globalStaffId,
      staffType: user.staff_type,
      className: user.class_name
    };
  } catch (error) {
    console.error('Error resetting staff password:', error);
    throw error;
  }
};

// NEW: Get staff user by global_staff_id
const getStaffUserById = async (globalStaffId) => {
  try {
    const result = await pool.query(
      'SELECT global_staff_id, username, staff_type, class_name, created_at FROM staff_users WHERE global_staff_id = $1',
      [globalStaffId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error getting staff user by ID:', error);
    throw error;
  }
};

module.exports = {
  initializeStaffUsersTable,
  ensureStaffUsersTable,
  createStaffUser,
  verifyCredentials,
  getStaffProfile,
  getAllStaffUsers,
  searchStaffUser,
  resetStaffPassword,
  getStaffUserById
};