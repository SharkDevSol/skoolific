const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { generateBranchToken } = require('../middleware/branchAuth');
const { setBranchCode } = require('../config/db');
const dbManager = require('../services/DatabaseConnectionManager');

/**
 * POST /api/finance-app/login
 * Login for Finance App — only staff with role Accountant/finance roles can log in.
 * Requires: branchCode, username, password
 * Validates: staff belongs to the given branch
 */
router.post('/login', async (req, res) => {
  try {
    const { branchCode, username, password } = req.body;

    if (!branchCode || !username || !password) {
      return res.status(400).json({ error: 'Branch code, username, and password are required' });
    }

    // Resolve branch pool — finance-app is excluded from branch middleware, so resolve manually
    const inputBranch = branchCode.toUpperCase();
    setBranchCode(inputBranch);
    let pool;
    try {
      pool = await dbManager.getPool(inputBranch);
    } catch (branchErr) {
      console.error('Cannot resolve branch pool:', branchErr.message);
      return res.status(400).json({ error: 'Invalid branch code', message: branchErr.message });
    }

    // Find staff user by username
    const userResult = await pool.query(
      'SELECT id, global_staff_id, username, password_hash, staff_type, class_name FROM staff_users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check: staff_type must be Accountant OR Administrative Staff with Accountant role
    const allowedTypes = ['Accountant', 'finance_officer', 'cashier', 'director', 'admin', 'Finance'];
    if (!allowedTypes.includes(user.staff_type)) {
      // For Administrative Staff, check if they have Accountant role
      if (user.staff_type === 'Administrative Staff') {
        // Look up their class table record to verify role
        const roleCheck = await pool.query(
          `SELECT role FROM staff_administrative_staff WHERE global_staff_id = $1 AND role = 'Accountant' LIMIT 1`,
          [user.global_staff_id]
        );
        if (roleCheck.rows.length === 0) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'Only Administrative Staff with Accountant role can access the Finance App'
          });
        }
      } else {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Only finance staff can access the Finance App'
        });
      }
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify branch code matches staff's branch (class_name maps to branch)
    const staffBranch = (user.class_name || '').toUpperCase();
    const staffBranchCode = staffBranch.includes('-') ? staffBranch.split('-')[0] : staffBranch;

    // Get valid branch codes to distinguish real branch values from legacy garbage
    let validBranchCodes = [];
    try {
      const branches = await dbManager.getAllBranches();
      validBranchCodes = branches.map(b => String(b.branch_code).toUpperCase());
    } catch (branchListErr) {
      console.warn('Could not load branch list:', branchListErr.message);
    }

    const isRealBranch = validBranchCodes.includes(staffBranchCode);

    if (isRealBranch && staffBranchCode !== inputBranch) {
      return res.status(403).json({
        error: 'Branch mismatch',
        message: `This staff account belongs to branch ${staffBranchCode}, not ${inputBranch}`
      });
    }

    // Legacy accounts may have invalid class_name values (e.g. 'f', 'fe', 't') that are not
    // real branch codes. Treat them as belonging to the branch they log into, and
    // self-heal the record so the mismatch never happens again.
    if (!isRealBranch && staffBranchCode !== inputBranch) {
      try {
        await pool.query('UPDATE staff_users SET class_name = $1 WHERE id = $2', [inputBranch, user.id]);
        console.log(`🩹 Self-healed staff_users.class_name for "${username}": ${staffBranchCode} -> ${inputBranch}`);
      } catch (updateErr) {
        console.warn(`Could not self-heal class_name for "${username}":`, updateErr.message);
      }
    }

    // Generate JWT with branch context (matches authenticateWithBranch verification)
    const token = generateBranchToken(
      {
        id: user.id,
        globalStaffId: user.global_staff_id,
        username: user.username,
        role: 'finance_staff',
        staffType: user.staff_type
      },
      inputBranch,
      '24h'
    );

    res.json({
      success: true,
      message: 'Finance App login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        staffType: user.staff_type,
        branchCode: inputBranch
      }
    });

  } catch (error) {
    console.error('Finance App login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

module.exports = router;
