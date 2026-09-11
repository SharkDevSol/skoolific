const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { generateBranchToken } = require('../middleware/branchAuth');
const { authenticateWithBranch } = require('../middleware/branchAuth');
const dbManager = require('../services/DatabaseConnectionManager');

/**
 * POST /api/super-finance/login
 * Super Finance App login — username + password only (no branch code).
 * The super finance account lives in the master DB (super_finance_users)
 * and can access ALL branches. The branch is chosen per-request via the
 * X-Branch-Code header sent by the app's branch selector.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const masterPool = dbManager.masterPool;
    const userResult = await masterPool.query(
      'SELECT id, username, password_hash, allowed_branches FROM super_finance_users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let allowedBranches = Array.isArray(user.allowed_branches) ? user.allowed_branches : [];
    if (allowedBranches.length === 0) {
      try {
        const branches = await dbManager.getAllBranches();
        allowedBranches = branches.map(b => String(b.branch_code).toUpperCase());
      } catch (e) {
        allowedBranches = [];
      }
    }

    // Token WITHOUT branchCode claim — branch comes from the X-Branch-Code header
    // so the app can switch branches freely (authenticateWithBranch validates it
    // against allowedBranches).
    const token = generateBranchToken(
      {
        id: user.id,
        username: user.username,
        role: 'super_finance',
        userType: 'super_finance',
        staffType: 'director',
        isSuperFinance: true,
        allowedBranches
      },
      null,
      '24h'
    );

    const branches = await dbManager.getAllBranches();
    const branchList = branches
      .map(b => ({
        branchCode: String(b.branch_code).toUpperCase(),
        branchName: b.branch_name,
        databaseName: b.database_name
      }))
      .filter(b => allowedBranches.includes(b.branchCode));

    res.json({
      success: true,
      message: 'Super Finance App login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: 'super_finance',
        allowedBranches,
        branches: branchList
      }
    });
  } catch (error) {
    console.error('Super Finance App login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

/**
 * GET /api/super-finance/branches
 * List branches available to the logged-in super finance user.
 */
router.get('/branches', authenticateWithBranch, async (req, res) => {
  try {
    if (req.user?.role !== 'super_finance') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const branches = await dbManager.getAllBranches();
    const allowed = req.user.allowedBranches || [];
    const branchList = branches
      .map(b => ({
        branchCode: String(b.branch_code).toUpperCase(),
        branchName: b.branch_name,
        databaseName: b.database_name
      }))
      .filter(b => allowed.length === 0 || allowed.includes(b.branchCode));
    res.json({ success: true, data: branchList });
  } catch (error) {
    console.error('Error fetching super finance branches:', error);
    res.status(500).json({ error: 'Failed to fetch branches', message: error.message });
  }
});

/**
 * Validate password strength for super finance accounts.
 * Only minimum length is a hard requirement; other rules are recommendations.
 */
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const warnings = [];
  if (password.length < minLength) {
    return { isValid: false, errors: [`Password must be at least ${minLength} characters long`], warnings };
  }
  if (!/[A-Z]/.test(password)) warnings.push('Password should contain at least one uppercase letter (recommended)');
  if (!/[a-z]/.test(password)) warnings.push('Password should contain at least one lowercase letter (recommended)');
  if (!/[0-9]/.test(password)) warnings.push('Password should contain at least one number (recommended)');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) warnings.push('Password should contain at least one special character (recommended)');
  return { isValid: true, errors: [], warnings };
};

/**
 * POST /api/super-finance/change-username
 * Change the logged-in super finance account's username (requires current password).
 */
router.post('/change-username', authenticateWithBranch, async (req, res) => {
  try {
    if (req.user?.role !== 'super_finance') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { currentUsername, newUsername, password } = req.body;
    if (!currentUsername || !newUsername || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (newUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const masterPool = dbManager.masterPool;
    const userResult = await masterPool.query(
      'SELECT id, username, password_hash FROM super_finance_users WHERE username = $1',
      [currentUsername]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const user = userResult.rows[0];

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const taken = await masterPool.query(
      'SELECT 1 FROM super_finance_users WHERE username = $1 AND id <> $2',
      [newUsername, user.id]
    );
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'This username is already taken' });
    }

    await masterPool.query('UPDATE super_finance_users SET username = $1 WHERE id = $2', [newUsername, user.id]);

    res.json({ success: true, newUsername });
  } catch (error) {
    console.error('Super finance change-username error:', error);
    res.status(500).json({ error: 'Failed to change username', message: error.message });
  }
});

/**
 * POST /api/super-finance/change-password
 * Change the logged-in super finance account's password (requires current password).
 */
router.post('/change-password', authenticateWithBranch, async (req, res) => {
  try {
    if (req.user?.role !== 'super_finance') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { username, currentPassword, newPassword } = req.body;
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      return res.status(400).json({ error: strength.errors[0] });
    }

    const masterPool = dbManager.masterPool;
    const userResult = await masterPool.query(
      'SELECT id, username, password_hash FROM super_finance_users WHERE username = $1',
      [username]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const user = userResult.rows[0];

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await masterPool.query('UPDATE super_finance_users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);

    res.json({
      success: true,
      warnings: strength.warnings.length > 0 ? strength.warnings : undefined
    });
  } catch (error) {
    console.error('Super finance change-password error:', error);
    res.status(500).json({ error: 'Failed to change password', message: error.message });
  }
});

module.exports = router;