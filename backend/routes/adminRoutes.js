const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { getEndpointPath } = require('../config/api.config');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Security middleware
const { authorizeRoles } = require('../middleware/auth');
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { generateToken } = require('../middleware/jwtValidator');
const { validate, schemas } = require('../middleware/inputValidation');
const { fileValidator, multerFileFilter } = require('../middleware/fileValidation');
const { uploadLimiter } = require('../middleware/rateLimiter');

// Configure multer for branding icon uploads
const uploadDir = path.join(__dirname, '../uploads/branding');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Sanitize filename
    const safeName = `icon-${Date.now()}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: multerFileFilter // Add file type validation
});

// Default admin credentials (you should change these in production)
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123'
};

// Initialize admin table and branding settings table
const initializeAdminTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) DEFAULT 'Administrator',
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
    `);
    
    // Create branding settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branding_settings (
        id SERIAL PRIMARY KEY,
        website_name VARCHAR(255) DEFAULT 'School Management System',
        website_icon VARCHAR(255),
        primary_color VARCHAR(50) DEFAULT '#667eea',
        secondary_color VARCHAR(50) DEFAULT '#764ba2',
        theme_mode VARCHAR(20) DEFAULT 'light',
        school_address VARCHAR(500),
        school_phone VARCHAR(100),
        school_email VARCHAR(255),
        academic_year VARCHAR(50),
        school_logo VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add new columns if they don't exist (for existing databases)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branding_settings' AND column_name='school_address') THEN
          ALTER TABLE branding_settings ADD COLUMN school_address VARCHAR(500);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branding_settings' AND column_name='school_phone') THEN
          ALTER TABLE branding_settings ADD COLUMN school_phone VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branding_settings' AND column_name='school_email') THEN
          ALTER TABLE branding_settings ADD COLUMN school_email VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branding_settings' AND column_name='academic_year') THEN
          ALTER TABLE branding_settings ADD COLUMN academic_year VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branding_settings' AND column_name='school_logo') THEN
          ALTER TABLE branding_settings ADD COLUMN school_logo VARCHAR(255);
        END IF;
      END $$;
    `);
    
    // Insert default branding if not exists
    const brandingExists = await pool.query('SELECT id FROM branding_settings WHERE id = 1');
    if (brandingExists.rows.length === 0) {
      await pool.query(`
        INSERT INTO branding_settings (id, website_name, primary_color, secondary_color, theme_mode)
        VALUES (1, 'School Management System', '#667eea', '#764ba2', 'light')
      `);
    }
    
    console.log('Branding settings table initialized');

    // Check if default admin exists
    const existingAdmin = await pool.query(
      'SELECT id FROM admin_users WHERE username = $1',
      [DEFAULT_ADMIN.username]
    );

    if (existingAdmin.rows.length === 0) {
      // Create default admin
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, saltRounds);
      
      await pool.query(
        'INSERT INTO admin_users (username, password_hash, name) VALUES ($1, $2, $3)',
        [DEFAULT_ADMIN.username, passwordHash, 'System Administrator']
      );
      console.log('Default admin user created');
    }

    console.log('Admin users table initialized');
  } catch (error) {
    console.error('Error initializing admin table:', error);
  }
};

// Initialize table on module load
initializeAdminTable().catch(err => console.error('Init error:', err));

// Verify token endpoint - check if token is still valid (no branch required)
router.get(getEndpointPath('ADMIN.PROFILE').replace('/api/admin/profile', '/verify-token'), (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }

  const { verifyTokenWithDetails } = require('../middleware/jwtValidator');
  const result = verifyTokenWithDetails(token);

  if (!result.success) {
    return res.status(401).json({ valid: false, error: result.error.userMessage, code: result.error.code });
  }

  res.json({
    valid: true,
    user: {
      id: result.decoded.id,
      username: result.decoded.username,
      role: result.decoded.role,
      userType: result.decoded.userType,
      branchCode: result.decoded.branchCode
    }
  });
});

// Admin Login (supports both primary admin and sub-accounts)
router.post(getEndpointPath('AUTH.ADMIN_LOGIN').replace('/api/admin', ''), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // First, check primary admin users table
    const adminResult = await pool.query(
      'SELECT id, username, password_hash, name, email, role FROM admin_users WHERE username = $1',
      [username]
    );

    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      const isValid = await bcrypt.compare(password, admin.password_hash);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // Update last login
      await pool.query(
        'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [admin.id]
      );

      // Generate JWT token using centralized function
      const branchCode = (req.headers['x-branch-code'] || '').toUpperCase();
      const token = generateToken(
        { 
          id: admin.id, 
          username: admin.username, 
          role: admin.role,
          userType: 'admin',
          branchCode: branchCode
        },
        process.env.JWT_EXPIRES_IN || '24h'
      );

      return res.json({
        message: 'Login successful',
        success: true,
        token, // Include JWT token
        user: {
          id: admin.id,
          username: admin.username,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          userType: 'admin',
          permissions: [] // Primary admin has all permissions (empty means full access)
        }
      });
    }

    // If not found in admin_users, check sub-accounts table
    const subAccountResult = await pool.query(
      'SELECT id, username, password_hash, name, email, is_active, permissions FROM admin_sub_accounts WHERE username = $1',
      [username]
    );

    if (subAccountResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const subAccount = subAccountResult.rows[0];

    // Check if sub-account is active
    if (!subAccount.is_active) {
      return res.status(401).json({ error: 'Account is disabled. Please contact administrator.' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, subAccount.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login for sub-account
    await pool.query(
      'UPDATE admin_sub_accounts SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [subAccount.id]
    );

    // Generate JWT token for sub-account using centralized function
    const token = generateToken(
      { 
        id: subAccount.id, 
        username: subAccount.username, 
        role: 'sub-account',
        userType: 'sub-account',
        permissions: subAccount.permissions || [],
        branchCode: (req.headers['x-branch-code'] || '').toUpperCase()
      },
      process.env.JWT_EXPIRES_IN || '24h'
    );

    res.json({
      message: 'Login successful',
      success: true,
      token, // Include JWT token
      user: {
        id: subAccount.id,
        username: subAccount.username,
        name: subAccount.name,
        email: subAccount.email,
        role: 'sub-account',
        userType: 'sub-account',
        permissions: subAccount.permissions || []
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Change admin password (protected route)
router.post(getEndpointPath('SETTINGS.PASSWORD').replace('/api/settings', ''), authenticateWithBranch, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Find admin user
    const result = await pool.query(
      'SELECT id, password_hash FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const admin = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, admin.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, admin.id]
    );

    res.json({ message: 'Password changed successfully', success: true });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error while changing password' });
  }
});

// Change admin password - direct endpoint (frontend compatibility)
router.post('/change-password', authenticateWithBranch, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const result = await pool.query(
      'SELECT id, password_hash FROM admin_users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    await pool.query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, admin.id]
    );
    res.json({ message: 'Password changed successfully', success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error while changing password' });
  }
});

// Get branding settings
router.get(getEndpointPath('SETTINGS.BRANDING').replace('/api/settings', ''), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branding_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({
        website_name: 'School Management System',
        website_icon: null,
        primary_color: '#667eea',
        secondary_color: '#764ba2',
        theme_mode: 'light'
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Failed to get branding settings' });
  }
});

// Update branding settings (protected - admin and sub-accounts with settings permission)
router.put(getEndpointPath('SETTINGS.BRANDING').replace('/api/settings', ''), authenticateWithBranch, authorizeRoles('admin', 'sub-account'), async (req, res) => {
  try {
    const { website_name, primary_color, secondary_color, theme_mode, school_address, school_phone, school_email, academic_year } = req.body;
    
    const result = await pool.query(`
      UPDATE branding_settings 
      SET website_name = COALESCE($1, website_name),
          primary_color = COALESCE($2, primary_color),
          secondary_color = COALESCE($3, secondary_color),
          theme_mode = COALESCE($4, theme_mode),
          school_address = COALESCE($5, school_address),
          school_phone = COALESCE($6, school_phone),
          school_email = COALESCE($7, school_email),
          academic_year = COALESCE($8, academic_year),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `, [website_name, primary_color, secondary_color, theme_mode, school_address, school_phone, school_email, academic_year]);
    
    res.json({ message: 'Branding updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Update branding error:', error);
    res.status(500).json({ error: 'Failed to update branding settings' });
  }
});

// Upload branding icon (protected - admin and sub-accounts with settings permission)
router.post(getEndpointPath('SETTINGS.BRANDING').replace('/api/settings', '') + '/icon', authenticateWithBranch, authorizeRoles('admin', 'sub-account'), uploadLimiter, ...branchSafeUpload(upload.single('icon')), fileValidator, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Get old icon to delete
    const oldResult = await pool.query('SELECT website_icon FROM branding_settings WHERE id = 1');
    const oldIcon = oldResult.rows[0]?.website_icon;
    
    // Update database with new icon
    const iconPath = req.file.filename;
    await pool.query(
      'UPDATE branding_settings SET website_icon = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [iconPath]
    );
    
    // Delete old icon file if exists
    if (oldIcon) {
      const oldPath = path.join(uploadDir, oldIcon);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    res.json({ 
      message: 'Icon uploaded successfully', 
      icon: iconPath,
      iconUrl: `/uploads/branding/${iconPath}`
    });
  } catch (error) {
    console.error('Upload icon error:', error);
    res.status(500).json({ error: 'Failed to upload icon' });
  }
});

// Upload school logo (protected - admin and sub-accounts with settings permission)
router.post(getEndpointPath('SETTINGS.BRANDING').replace('/api/settings', '') + '/logo', authenticateWithBranch, authorizeRoles('admin', 'sub-account'), uploadLimiter, ...branchSafeUpload(upload.single('logo')), fileValidator, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Get old logo to delete
    const oldResult = await pool.query('SELECT school_logo FROM branding_settings WHERE id = 1');
    const oldLogo = oldResult.rows[0]?.school_logo;
    
    // Update database with new logo
    const logoPath = req.file.filename;
    await pool.query(
      'UPDATE branding_settings SET school_logo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [logoPath]
    );
    
    // Delete old logo file if exists
    if (oldLogo) {
      const oldPath = path.join(uploadDir, oldLogo);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    res.json({ 
      message: 'Logo uploaded successfully', 
      logo: logoPath,
      logoUrl: `/uploads/branding/${logoPath}`
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

module.exports = router;
