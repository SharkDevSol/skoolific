const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { authenticateWithBranch } = require('../middleware/branchAuth');
const { sanitizeInput } = require('../utils/sanitizer');
const { logPasswordChange } = require('../utils/logger');

/**
 * Password Strength Validation
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const errors = [];
  const warnings = [];

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    warnings.push('Password should contain at least one uppercase letter (recommended)');
  }
  if (!hasLowerCase) {
    warnings.push('Password should contain at least one lowercase letter (recommended)');
  }
  if (!hasNumber) {
    warnings.push('Password should contain at least one number (recommended)');
  }
  if (!hasSpecialChar) {
    warnings.push('Password should contain at least one special character (recommended)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Look up a staff member's phone number across all staff schemas/tables
 * by their global_staff_id. Returns null if not found.
 */
const getStaffPhone = async (globalStaffId) => {
  try {
    const schemas = await pool.query(
      `SELECT DISTINCT table_schema FROM information_schema.tables
       WHERE table_schema LIKE 'staff\_%'`
    );
    for (const row of schemas.rows) {
      const schema = row.table_schema;
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema]
      );
      for (const t of tables.rows) {
        const table = t.table_name;
        try {
          const res = await pool.query(
            `SELECT phone::text FROM "${schema}"."${table}"
             WHERE global_staff_id = $1 AND phone IS NOT NULL AND phone::text != '' LIMIT 1`,
            [globalStaffId]
          );
          if (res.rows.length > 0) return res.rows[0].phone;
        } catch (e) {
          // table may not have phone/global_staff_id columns - skip
        }
      }
    }
    return null;
  } catch (e) {
    console.error('getStaffPhone error:', e.message);
    return null;
  }
};

/**
 * Send SMS notification to a staff member about a credential change.
 * type: 'username' | 'password'
 * result: 'success' | 'failure'
 */
const notifyStaffCredentialChange = async (globalStaffId, type, result, details) => {
  try {
    const phone = await getStaffPhone(globalStaffId);
    if (!phone) return;
    const { sendSMS } = require('../services/SMSService');

    const labels = { username: 'username', password: 'password' };
    const label = labels[type] || 'login details';

    let message;
    if (result === 'success') {
      if (type === 'username') {
        message = `SCHOOL ACADEMY: Your login ${label} was changed successfully to "${details.newUsername}". If this was not you, please contact the school administration immediately.`;
      } else {
        message = 'SCHOOL ACADEMY: Your login password was changed successfully. If this was not you, please contact the school administration immediately.';
      }
    } else {
      message = `SCHOOL ACADEMY: Your request to change your login ${label} was NOT successful. ${details.error || 'Please try again or contact the school administration.'}`;
    }

    const smsResult = await sendSMS(phone, message, null, {
      templateKey: 'staff_credential_change',
      recipientName: details.newUsername || `staff_${globalStaffId}`
    });
    if (smsResult.success) console.log(`Credential change SMS sent to staff ${globalStaffId}`);
    else console.warn(`Credential change SMS failed for staff ${globalStaffId}: ${smsResult.error}`);
  } catch (e) {
    console.warn('Could not send credential change SMS:', e.message);
  }
};

/**
 * Change Username for Admin Users
 * POST /api/user-profile/admin/change-username
 */
router.post('/admin/change-username', authenticateWithBranch, async (req, res) => {
  try {
    const { currentUsername, newUsername, password } = req.body;

    // Validate input
    if (!currentUsername || !newUsername || !password) {
      return res.status(400).json({ 
        error: 'All fields are required',
        success: false 
      });
    }

    // Sanitize inputs
    const sanitizedCurrentUsername = sanitizeInput(currentUsername);
    const sanitizedNewUsername = sanitizeInput(newUsername);

    // Find admin user
    const result = await pool.query(
      'SELECT id, password_hash FROM admin_users WHERE username = $1',
      [sanitizedCurrentUsername]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Admin user not found',
        success: false 
      });
    }

    const admin = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, admin.password_hash);

    if (!isValid) {
      return res.status(401).json({ 
        error: 'Password is incorrect',
        success: false 
      });
    }

    // Check if new username already exists
    const existingUser = await pool.query(
      'SELECT id FROM admin_users WHERE username = $1 AND id != $2',
      [sanitizedNewUsername, admin.id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Username already exists',
        success: false 
      });
    }

    // Update username
    await pool.query(
      'UPDATE admin_users SET username = $1 WHERE id = $2',
      [sanitizedNewUsername, admin.id]
    );

    res.json({ 
      message: 'Username changed successfully',
      success: true,
      newUsername: sanitizedNewUsername
    });

  } catch (error) {
    console.error('Change username error (admin):', error);
    res.status(500).json({ 
      error: 'Server error while changing username',
      success: false 
    });
  }
});

/**
 * Change Password for Admin Users
 * POST /api/user-profile/admin/change-password
 */
router.post('/admin/change-password', authenticateWithBranch, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    // Validate input
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'All fields are required',
        success: false 
      });
    }

    // Validate password strength - only length is required, other rules are warnings
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password does not meet strength requirements',
        errors: passwordValidation.errors,
        success: false 
      });
    }

    // Sanitize username
    const sanitizedUsername = sanitizeInput(username);

    // Find admin user
    const result = await pool.query(
      'SELECT id, password_hash FROM admin_users WHERE username = $1',
      [sanitizedUsername]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Admin user not found',
        success: false 
      });
    }

    const admin = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, admin.password_hash);

    if (!isValid) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        success: false 
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, admin.id]
    );

    // Log password change
    logPasswordChange(sanitizedUsername, req.ip, true);

    res.json({ 
      message: 'Password changed successfully',
      success: true,
      warnings: passwordValidation.warnings.length > 0 ? passwordValidation.warnings : undefined
    });

  } catch (error) {
    console.error('Change password error (admin):', error);
    logPasswordChange(req.body.username, req.ip, false);
    res.status(500).json({ 
      error: 'Server error while changing password',
      success: false 
    });
  }
});

/**
 * Change Username for Staff Users
 * POST /api/user-profile/staff/change-username
 */
router.post('/staff/change-username', authenticateWithBranch, async (req, res) => {
  try {
    const { currentUsername, newUsername, password } = req.body;

    // Validate input
    if (!currentUsername || !newUsername || !password) {
      return res.status(400).json({ 
        error: 'All fields are required',
        success: false 
      });
    }

    // Sanitize inputs
    const sanitizedCurrentUsername = sanitizeInput(currentUsername);
    const sanitizedNewUsername = sanitizeInput(newUsername);

    // Find staff user
    const result = await pool.query(
      'SELECT id, global_staff_id, password_hash FROM staff_users WHERE username = $1',
      [sanitizedCurrentUsername]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Staff user not found',
        success: false 
      });
    }

    const staff = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, staff.password_hash);

    if (!isValid) {
      notifyStaffCredentialChange(staff.global_staff_id, 'username', 'failure', { error: 'Password is incorrect' });
      return res.status(401).json({ 
        error: 'Password is incorrect',
        success: false 
      });
    }

    // Check if new username already exists
    const existingUser = await pool.query(
      'SELECT id FROM staff_users WHERE username = $1 AND id != $2',
      [sanitizedNewUsername, staff.id]
    );

    if (existingUser.rows.length > 0) {
      notifyStaffCredentialChange(staff.global_staff_id, 'username', 'failure', { error: 'Username already exists' });
      return res.status(409).json({ 
        error: 'Username already exists',
        success: false 
      });
    }

    // Update username
    await pool.query(
      'UPDATE staff_users SET username = $1 WHERE id = $2',
      [sanitizedNewUsername, staff.id]
    );

    notifyStaffCredentialChange(staff.global_staff_id, 'username', 'success', { newUsername: sanitizedNewUsername });

    res.json({ 
      message: 'Username changed successfully',
      success: true,
      newUsername: sanitizedNewUsername
    });

  } catch (error) {
    console.error('Change username error (staff):', error);
    res.status(500).json({ 
      error: 'Server error while changing username',
      success: false 
    });
  }
});

/**
 * Change Password for Staff Users
 * POST /api/user-profile/staff/change-password
 */
router.post('/staff/change-password', authenticateWithBranch, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    // Validate input
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'All fields are required',
        success: false 
      });
    }

    // Validate password strength - only length is required, other rules are warnings
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password does not meet strength requirements',
        errors: passwordValidation.errors,
        success: false 
      });
    }

    // Sanitize username
    const sanitizedUsername = sanitizeInput(username);

    // Find staff user
    const result = await pool.query(
      'SELECT id, global_staff_id, password_hash FROM staff_users WHERE username = $1',
      [sanitizedUsername]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Staff user not found',
        success: false 
      });
    }

    const staff = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, staff.password_hash);

    if (!isValid) {
      notifyStaffCredentialChange(staff.global_staff_id, 'password', 'failure', { error: 'Current password is incorrect' });
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        success: false 
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password (also update password_plain for admin viewing)
    await pool.query(
      'UPDATE staff_users SET password_hash = $1, password_plain = $2 WHERE id = $3',
      [newPasswordHash, newPassword, staff.id]
    );

    // Log password change
    logPasswordChange(sanitizedUsername, req.ip, true);

    notifyStaffCredentialChange(staff.global_staff_id, 'password', 'success', {});

    res.json({ 
      message: 'Password changed successfully',
      success: true,
      warnings: passwordValidation.warnings.length > 0 ? passwordValidation.warnings : undefined
    });

  } catch (error) {
    console.error('Change password error (staff):', error);
    logPasswordChange(req.body.username, req.ip, false);
    res.status(500).json({ 
      error: 'Server error while changing password',
      success: false 
    });
  }
});

/**
 * Change Username for Student Users
 * POST /api/user-profile/student/change-username
 */
router.post('/student/change-username', authenticateWithBranch, async (req, res) => {
  try {
    const { currentUsername, newUsername, password } = req.body;

    // Validate input
    if (!currentUsername || !newUsername || !password) {
      return res.status(400).json({ 
        error: 'All fields are required',
        success: false 
      });
    }

    // Sanitize inputs
    const sanitizedCurrentUsername = sanitizeInput(currentUsername);
    const sanitizedNewUsername = sanitizeInput(newUsername);

    // Find student user
    const result = await pool.query(
      'SELECT id, student_id, password_hash FROM students WHERE username = $1',
      [sanitizedCurrentUsername]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Student user not found',
        success: false 
      });
    }

    const student = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, student.password_hash);

    if (!isValid) {
      return res.status(401).json({ 
        error: 'Password is incorrect',
        success: false 
      });
    }

    // Check if new username already exists
    const existingUser = await pool.query(
      'SELECT id FROM students WHERE username = $1 AND id != $2',
      [sanitizedNewUsername, student.id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Username already exists',
        success: false 
      });
    }

    // Update username
    await pool.query(
      'UPDATE students SET username = $1 WHERE id = $2',
      [sanitizedNewUsername, student.id]
    );

    res.json({ 
      message: 'Username changed successfully',
      success: true,
      newUsername: sanitizedNewUsername
    });

  } catch (error) {
    console.error('Change username error (student):', error);
    res.status(500).json({ 
      error: 'Server error while changing username',
      success: false 
    });
  }
});

/**
 * Change Password for Student Users
 * POST /api/user-profile/student/change-password
 */
router.post('/student/change-password', authenticateWithBranch, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    // Validate input
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'All fields are required',
        success: false 
      });
    }

    // Validate password strength - only length is required, other rules are warnings
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password does not meet strength requirements',
        errors: passwordValidation.errors,
        success: false 
      });
    }

    // Sanitize username
    const sanitizedUsername = sanitizeInput(username);

    // Find student user
    const result = await pool.query(
      'SELECT id, student_id, password_hash FROM students WHERE username = $1',
      [sanitizedUsername]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Student user not found',
        success: false 
      });
    }

    const student = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, student.password_hash);

    if (!isValid) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        success: false 
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE students SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, student.id]
    );

    // Log password change
    logPasswordChange(sanitizedUsername, req.ip, true);

    res.json({ 
      message: 'Password changed successfully',
      success: true,
      warnings: passwordValidation.warnings.length > 0 ? passwordValidation.warnings : undefined
    });

  } catch (error) {
    console.error('Change password error (student):', error);
    logPasswordChange(req.body.username, req.ip, false);
    res.status(500).json({ 
      error: 'Server error while changing password',
      success: false 
    });
  }
});

/**
 * Change Username for Guardian Users (IQRA data model)
 * Guardians live inside classes_schema."<class>" tables with guardian_username /
 * guardian_password (plaintext). A guardian may appear in MULTIPLE class tables
 * (one per ward), so we must update every matching row.
 * POST /api/user-profile/guardian/change-username
 */
router.post('/guardian/change-username', authenticateWithBranch, async (req, res) => {
  try {
    const { currentUsername, newUsername, password } = req.body;

    if (!currentUsername || !newUsername || !password) {
      return res.status(400).json({ error: 'All fields are required', success: false });
    }

    const sanitizedCurrentUsername = sanitizeInput(currentUsername);
    const sanitizedNewUsername = sanitizeInput(newUsername);

    // Enumerate class tables
    const tables = (await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema'`
    )).rows.map(r => r.table_name);

    let found = 0;
    let name = null;

    for (const t of tables) {
      try {
        // Verify current password (plaintext, stored in guardian_password)
        const rows = await pool.query(
          `SELECT guardian_name FROM classes_schema."${t}" WHERE guardian_username = $1`,
          [sanitizedCurrentUsername]
        );
        if (rows.rows.length === 0) continue;
        name = name || rows.rows[0].guardian_name;

        const pw = await pool.query(
          `SELECT guardian_password FROM classes_schema."${t}" WHERE guardian_username = $1 LIMIT 1`,
          [sanitizedCurrentUsername]
        );
        if (pw.rows.length > 0 && pw.rows[0].guardian_password !== password) {
          return res.status(401).json({ error: 'Password is incorrect', success: false });
        }

        // Check new username uniqueness within this table
        const dup = await pool.query(
          `SELECT 1 FROM classes_schema."${t}" WHERE guardian_username = $1 LIMIT 1`,
          [sanitizedNewUsername]
        );
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: 'Username already exists', success: false });
        }

        const upd = await pool.query(
          `UPDATE classes_schema."${t}" SET guardian_username = $1 WHERE guardian_username = $2`,
          [sanitizedNewUsername, sanitizedCurrentUsername]
        );
        found += upd.rowCount;
      } catch (e) { /* table may not have guardian columns */ }
    }

    if (found === 0) {
      return res.status(404).json({ error: 'Guardian user not found', success: false });
    }

    res.json({ message: 'Username changed successfully', success: true, newUsername: sanitizedNewUsername, updatedRows: found });
  } catch (error) {
    console.error('Change username error (guardian):', error);
    res.status(500).json({ error: 'Server error while changing username', success: false });
  }
});

/**
 * Change Password for Guardian Users (IQRA data model) — plaintext in class tables.
 * POST /api/user-profile/guardian/change-password
 */
router.post('/guardian/change-password', authenticateWithBranch, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required', success: false });
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: 'Password does not meet strength requirements', errors: passwordValidation.errors, success: false });
    }

    const sanitizedUsername = sanitizeInput(username);

    const tables = (await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema'`
    )).rows.map(r => r.table_name);

    let found = 0;
    for (const t of tables) {
      try {
        const rows = await pool.query(
          `SELECT guardian_password FROM classes_schema."${t}" WHERE guardian_username = $1`,
          [sanitizedUsername]
        );
        if (rows.rows.length === 0) continue;
        if (rows.rows[0].guardian_password !== currentPassword) {
          return res.status(401).json({ error: 'Current password is incorrect', success: false });
        }
        const upd = await pool.query(
          `UPDATE classes_schema."${t}" SET guardian_password = $1 WHERE guardian_username = $2`,
          [newPassword, sanitizedUsername]
        );
        found += upd.rowCount;
      } catch (e) { /* skip */ }
    }

    if (found === 0) {
      return res.status(404).json({ error: 'Guardian user not found', success: false });
    }

    logPasswordChange(sanitizedUsername, req.ip, true);
    res.json({ message: 'Password changed successfully', success: true, warnings: passwordValidation.warnings.length > 0 ? passwordValidation.warnings : undefined });
  } catch (error) {
    console.error('Change password error (guardian):', error);
    logPasswordChange(req.body.username, req.ip, false);
    res.status(500).json({ error: 'Server error while changing password', success: false });
  }
});

module.exports = router;
