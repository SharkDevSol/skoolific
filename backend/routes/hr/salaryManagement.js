const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateToken } = require('../../middleware/auth');
const pool = require('../../config/db');
const axios = require('axios');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Helper function to sanitize staff type to schema name
function sanitizeStaffTypeToSchema(staffType) {
  if (!staffType) return 'teachers';
  const type = staffType.toLowerCase();
  if (type === 'teacher' || type === 'teachers') return 'teachers';
  if (type === 'supportive') return 'supportive_staff';
  if (type === 'administrative' || type === 'director') return 'administrative_staff';
  return 'teachers';
}

// ============================================================================
// STAFF MANAGEMENT (Using existing staff_users table)
// ============================================================================

// Get available staff types
router.get('/staff-types', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT staff_type
      FROM staff_users
      WHERE global_staff_id IS NOT NULL
      AND staff_type IS NOT NULL
      ORDER BY staff_type
    `);
    
    const staffTypes = result.rows.map(row => ({
      type: row.staff_type,
      label: row.staff_type.charAt(0).toUpperCase() + row.staff_type.slice(1).toLowerCase()
    }));
    
    res.json({ success: true, data: staffTypes });
  } catch (error) {
    console.error('Error fetching staff types:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch staff types' } });
  }
});

// Get all staff (simplified - uses same approach as ListStaff page)
router.get('/staff', authenticateToken, async (req, res) => {
  try {
    const { staffType } = req.query;
    
    console.log('🔍 Fetching staff with type:', staffType);
    
    if (!staffType) {
      return res.json({ success: true, data: [], count: 0, message: 'Staff type required' });
    }
    
    const port = process.env.PORT || 5052;
    // Get all classes for this staff type
    const classesResponse = await axios.get(`http://localhost:${port}/api/staff/classes?staffType=${encodeURIComponent(staffType)}`);
    const classes = classesResponse.data;
    
    console.log(`📝 Found ${classes.length} classes for ${staffType}`);
    
    if (classes.length === 0) {
      return res.json({ success: true, data: [], count: 0, message: 'No classes found' });
    }
    
    let allStaff = [];
    
    // Fetch staff from each class
    for (const className of classes) {
      try {
        const dataResponse = await axios.get(`http://localhost:${port}/api/staff/data/${staffType}/${className}`);
        const staffData = dataResponse.data.data || [];
        
        console.log(`   Found ${staffData.length} staff in ${className}`);
        
        // Transform to match expected format
        const transformedStaff = staffData.map(staff => ({
          id: staff.global_staff_id || staff.id,
          employeeNumber: staff.global_staff_id || staff.id,
          firstName: (staff.full_name || staff.name || '').split(' ')[0] || '',
          lastName: (staff.full_name || staff.name || '').split(' ').slice(1).join(' ') || '',
          email: staff.email || '',
          phone: staff.phone || '',
          staffType: staffType,
          gender: staff.gender || 'MALE',
          status: 'ACTIVE',
          profilePhotoUrl: staff.image_staff || null
        }));
        
        allStaff = [...allStaff, ...transformedStaff];
      } catch (err) {
        console.log(`   ❌ Error fetching ${className}:`, err.message);
      }
    }
    
    console.log(`📤 Returning ${allStaff.length} staff members`);
    res.json({ success: true, data: allStaff, count: allStaff.length });
    
  } catch (error) {
    console.error('❌ Error fetching staff:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch staff' } });
  }
});

// Get single staff member
router.get('/staff/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get staff user info
    const userResult = await pool.query(
      `SELECT global_staff_id, username, staff_type, class_name
       FROM staff_users
       WHERE global_staff_id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Staff not found' } });
    }

    const user = userResult.rows[0];
    const schema = sanitizeStaffTypeToSchema(user.staff_type);
    
    // Get staff details
    const detailsResult = await pool.query(
      `SELECT name, role, staff_work_time, image_staff, gender, phone, email
       FROM "${schema}"."${user.class_name}"
       WHERE global_staff_id = $1`,
      [id]
    );

    if (detailsResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Staff details not found' } });
    }

    const details = detailsResult.rows[0];
    
    // Get salary, deductions, allowances, retention benefits
    const salaryResult = await pool.query(
      `SELECT * FROM hr_salaries WHERE staff_id = $1 AND is_active = true`,
      [id]
    ).catch(() => ({ rows: [] }));
    
    const deductionsResult = await pool.query(
      `SELECT * FROM hr_staff_deductions WHERE staff_id = $1 AND is_active = true`,
      [id]
    ).catch(() => ({ rows: [] }));
    
    const allowancesResult = await pool.query(
      `SELECT * FROM hr_staff_allowances WHERE staff_id = $1 AND is_active = true`,
      [id]
    ).catch(() => ({ rows: [] }));
    
    const retentionResult = await pool.query(
      `SELECT * FROM hr_staff_retention WHERE staff_id = $1 AND is_active = true`,
      [id]
    ).catch(() => ({ rows: [] }));

    const staff = {
      id: user.global_staff_id,
      employeeNumber: user.global_staff_id,
      firstName: details.name.split(' ')[0],
      lastName: details.name.split(' ').slice(1).join(' ') || '',
      email: details.email || `${user.username}@school.com`,
      phone: details.phone || 'N/A',
      staffType: user.staff_type,
      gender: details.gender || 'MALE',
      status: 'ACTIVE',
      profilePhotoUrl: details.image_staff,
      salaries: salaryResult.rows,
      deductions: deductionsResult.rows,
      allowances: allowancesResult.rows,
      retentionBenefits: retentionResult.rows
    };
    
    res.json({ success: true, data: staff });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch staff' } });
  }
});

// ============================================================================
// SALARY MANAGEMENT
// ============================================================================

// Get all salaries
router.get('/salaries', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, a.name as account_name, a.code as account_code
      FROM hr_salaries s
      LEFT JOIN school_comms."Account" a ON s.account_id::text = a.id::text
      ORDER BY s.created_at DESC
    `).catch(() => ({ rows: [] }));
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching salaries:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch salaries' } });
  }
});

// Add salary
router.post('/salaries', authenticateToken, async (req, res) => {
  try {
    const { staffId, accountId, baseSalary, effectiveFrom, notes } = req.body;
    
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_salaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        account_id UUID NOT NULL,
        base_salary DECIMAL(15, 2) NOT NULL,
        effective_from DATE NOT NULL,
        effective_to DATE,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Deactivate previous salaries
    await pool.query(
      `UPDATE hr_salaries SET is_active = false WHERE staff_id = $1`,
      [staffId]
    );
    
    // Insert new salary
    const result = await pool.query(
      `INSERT INTO hr_salaries (staff_id, account_id, base_salary, effective_from, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [staffId, accountId, baseSalary, effectiveFrom, notes]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding salary:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add salary' } });
  }
});

// Update salary
router.put('/salaries/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { accountId, baseSalary, effectiveFrom, effectiveTo, notes, isActive } = req.body;
    
    const result = await pool.query(
      `UPDATE hr_salaries 
       SET account_id = $1, base_salary = $2, effective_from = $3, 
           effective_to = $4, notes = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [accountId, baseSalary, effectiveFrom, effectiveTo, notes, isActive, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Salary not found' } });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating salary:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to update salary' } });
  }
});

// Delete salary
router.delete('/salaries/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM hr_salaries WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Salary not found' } });
    }
    
    res.json({ success: true, message: 'Salary deleted successfully' });
  } catch (error) {
    console.error('Error deleting salary:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete salary' } });
  }
});

// ============================================================================
// DEDUCTION TYPES
// ============================================================================

// Get all deduction types
router.get('/deduction-types', authenticateToken, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_deduction_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        calculation_type VARCHAR(50) NOT NULL,
        default_value DECIMAL(15, 2) NOT NULL,
        account_id UUID NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(`
      SELECT d.*, a.name as account_name, a.code as account_code
      FROM hr_deduction_types d
      LEFT JOIN school_comms."Account" a ON d.account_id::text = a.id::text
      WHERE d.is_active = true
      ORDER BY d.name
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching deduction types:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch deduction types' } });
  }
});

// Add deduction type
router.post('/deduction-types', authenticateToken, async (req, res) => {
  try {
    const { name, description, calculationType, defaultValue, accountId } = req.body;
    
    const result = await pool.query(
      `INSERT INTO hr_deduction_types (name, description, calculation_type, default_value, account_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, calculationType, defaultValue, accountId]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding deduction type:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add deduction type' } });
  }
});

// ============================================================================
// STAFF DEDUCTIONS
// ============================================================================

// Get staff deductions
router.get('/staff-deductions', authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.query;
    
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_staff_deductions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        deduction_type_id UUID NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        calculation_type VARCHAR(50) NOT NULL,
        effective_from DATE NOT NULL,
        effective_to DATE,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    let query = `
      SELECT sd.*, dt.name as deduction_name, dt.description
      FROM hr_staff_deductions sd
      LEFT JOIN hr_deduction_types dt ON sd.deduction_type_id = dt.id
      WHERE sd.is_active = true
    `;
    const params = [];
    
    if (staffId) {
      params.push(staffId);
      query += ` AND sd.staff_id = $${params.length}`;
    }
    
    query += ` ORDER BY sd.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching staff deductions:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch staff deductions' } });
  }
});

// Add staff deduction
router.post('/staff-deductions', authenticateToken, async (req, res) => {
  try {
    const { staffId, deductionTypeId, amount, calculationType, effectiveFrom, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO hr_staff_deductions (staff_id, deduction_type_id, amount, calculation_type, effective_from, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [staffId, deductionTypeId, amount, calculationType, effectiveFrom, notes]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding staff deduction:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add staff deduction' } });
  }
});

// Delete staff deduction
router.delete('/staff-deductions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM hr_staff_deductions WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Deduction not found' } });
    }
    
    res.json({ success: true, message: 'Deduction deleted successfully' });
  } catch (error) {
    console.error('Error deleting deduction:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete deduction' } });
  }
});

// ============================================================================
// ALLOWANCE TYPES
// ============================================================================

// Get all allowance types
router.get('/allowance-types', authenticateToken, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_allowance_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        calculation_type VARCHAR(50) NOT NULL,
        default_value DECIMAL(15, 2) NOT NULL,
        account_id UUID NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(`
      SELECT a.*, acc.name as account_name, acc.code as account_code
      FROM hr_allowance_types a
      LEFT JOIN school_comms."Account" acc ON a.account_id::text = acc.id::text
      WHERE a.is_active = true
      ORDER BY a.name
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching allowance types:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch allowance types' } });
  }
});

// Add allowance type
router.post('/allowance-types', authenticateToken, async (req, res) => {
  try {
    const { name, description, calculationType, defaultValue, accountId } = req.body;
    
    const result = await pool.query(
      `INSERT INTO hr_allowance_types (name, description, calculation_type, default_value, account_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, calculationType, defaultValue, accountId]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding allowance type:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add allowance type' } });
  }
});

// ============================================================================
// STAFF ALLOWANCES
// ============================================================================

// Get staff allowances
router.get('/staff-allowances', authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.query;
    
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_staff_allowances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        allowance_type_id UUID NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        calculation_type VARCHAR(50) NOT NULL,
        effective_from DATE NOT NULL,
        effective_to DATE,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    let query = `
      SELECT sa.*, at.name as allowance_name, at.description
      FROM hr_staff_allowances sa
      LEFT JOIN hr_allowance_types at ON sa.allowance_type_id = at.id
      WHERE sa.is_active = true
    `;
    const params = [];
    
    if (staffId) {
      params.push(staffId);
      query += ` AND sa.staff_id = $${params.length}`;
    }
    
    query += ` ORDER BY sa.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching staff allowances:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch staff allowances' } });
  }
});

// Add staff allowance
router.post('/staff-allowances', authenticateToken, async (req, res) => {
  try {
    const { staffId, allowanceTypeId, amount, calculationType, effectiveFrom, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO hr_staff_allowances (staff_id, allowance_type_id, amount, calculation_type, effective_from, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [staffId, allowanceTypeId, amount, calculationType, effectiveFrom, notes]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding staff allowance:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add staff allowance' } });
  }
});

// Delete staff allowance
router.delete('/staff-allowances/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM hr_staff_allowances WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Allowance not found' } });
    }
    
    res.json({ success: true, message: 'Allowance deleted successfully' });
  } catch (error) {
    console.error('Error deleting allowance:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete allowance' } });
  }
});

// ============================================================================
// RETENTION BENEFIT TYPES
// ============================================================================

// Get all retention benefit types
router.get('/retention-benefit-types', authenticateToken, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_retention_benefit_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        calculation_type VARCHAR(50) NOT NULL,
        default_value DECIMAL(15, 2) NOT NULL,
        account_id UUID NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(`
      SELECT r.*, a.name as account_name, a.code as account_code
      FROM hr_retention_benefit_types r
      LEFT JOIN school_comms."Account" a ON r.account_id::text = a.id::text
      WHERE r.is_active = true
      ORDER BY r.name
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching retention benefit types:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch retention benefit types' } });
  }
});

// Add retention benefit type
router.post('/retention-benefit-types', authenticateToken, async (req, res) => {
  try {
    const { name, type, description, calculationType, defaultValue, accountId } = req.body;
    
    const result = await pool.query(
      `INSERT INTO hr_retention_benefit_types (name, type, description, calculation_type, default_value, account_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, type, description, calculationType, defaultValue, accountId]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding retention benefit type:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add retention benefit type' } });
  }
});

// ============================================================================
// STAFF RETENTION BENEFITS
// ============================================================================

// Get staff retention benefits
router.get('/staff-retention', authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.query;
    
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_staff_retention (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        retention_benefit_type_id UUID NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        calculation_type VARCHAR(50) NOT NULL,
        effective_from DATE NOT NULL,
        effective_to DATE,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    let query = `
      SELECT sr.*, rt.name as benefit_name, rt.type as benefit_type, rt.description
      FROM hr_staff_retention sr
      LEFT JOIN hr_retention_benefit_types rt ON sr.retention_benefit_type_id = rt.id
      WHERE sr.is_active = true
    `;
    const params = [];
    
    if (staffId) {
      params.push(staffId);
      query += ` AND sr.staff_id = $${params.length}`;
    }
    
    query += ` ORDER BY sr.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching staff retention benefits:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch staff retention benefits' } });
  }
});

// Add staff retention benefit
router.post('/staff-retention', authenticateToken, async (req, res) => {
  try {
    const { staffId, retentionBenefitTypeId, amount, calculationType, effectiveFrom, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO hr_staff_retention (staff_id, retention_benefit_type_id, amount, calculation_type, effective_from, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [staffId, retentionBenefitTypeId, amount, calculationType, effectiveFrom, notes]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding staff retention benefit:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add staff retention benefit' } });
  }
});

// Delete staff retention benefit
router.delete('/staff-retention/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM hr_staff_retention WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Retention benefit not found' } });
    }
    
    res.json({ success: true, message: 'Retention benefit deleted successfully' });
  } catch (error) {
    console.error('Error deleting retention benefit:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete retention benefit' } });
  }
});

// ============================================================================
// SIMPLIFIED SALARY MANAGEMENT (All-in-one endpoint)
// ============================================================================

// Get all salaries with staff info
router.get('/all-salaries', authenticateToken, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_complete_salaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        staff_type VARCHAR(50) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        base_salary DECIMAL(15, 2) NOT NULL,
        tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
        net_salary DECIMAL(15, 2) NOT NULL,
        effective_from DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(`
      SELECT *
      FROM hr_complete_salaries
      WHERE is_active = true
      ORDER BY created_at DESC
    `);
    
    const salaries = result.rows.map(row => ({
      id: row.id,
      staffId: row.staff_id,
      staffName: row.staff_name,
      staffType: row.staff_type,
      accountName: row.account_name,
      baseSalary: row.base_salary,
      taxAmount: row.tax_amount,
      netSalary: row.net_salary,
      effectiveFrom: row.effective_from,
      isActive: row.is_active,
      createdAt: row.created_at
    }));
    
    res.json({ success: true, data: salaries });
  } catch (error) {
    console.error('Error fetching all salaries:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch salaries' } });
  }
});

// Add complete salary (simplified)
router.post('/add-complete', authenticateToken, async (req, res) => {
  try {
    const { staffId, staffName, staffType, accountName, baseSalary, taxAmount, netSalary, effectiveFrom } = req.body;
    
    console.log('💰 Received salary data:', {
      staffId,
      staffName,
      staffType,
      accountName,
      baseSalary,
      taxAmount,
      netSalary,
      effectiveFrom
    });
    
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_complete_salaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        staff_type VARCHAR(50) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        base_salary DECIMAL(15, 2) NOT NULL,
        tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
        net_salary DECIMAL(15, 2) NOT NULL,
        effective_from DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(
      `INSERT INTO hr_complete_salaries 
       (staff_id, staff_name, staff_type, account_name, base_salary, tax_amount, net_salary, effective_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [staffId, staffName, staffType, accountName, baseSalary, taxAmount, netSalary, effectiveFrom]
    );
    
    console.log('✅ Salary saved successfully:', result.rows[0]);
    
    res.json({ success: true, data: result.rows[0], message: 'Salary added successfully' });
  } catch (error) {
    console.error('❌ Error adding complete salary:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add salary' } });
  }
});

// Update complete salary
router.put('/update-complete/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { staffId, staffName, staffType, accountName, baseSalary, taxAmount, netSalary, effectiveFrom } = req.body;
    
    console.log('✏️ Updating salary ID:', id);
    console.log('💰 New salary data:', {
      staffId,
      staffName,
      staffType,
      accountName,
      baseSalary,
      taxAmount,
      netSalary,
      effectiveFrom
    });
    
    const result = await pool.query(
      `UPDATE hr_complete_salaries 
       SET staff_name = $1,
           staff_type = $2,
           account_name = $3,
           base_salary = $4,
           tax_amount = $5,
           net_salary = $6,
           effective_from = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [staffName, staffType, accountName, baseSalary, taxAmount, netSalary, effectiveFrom, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Salary record not found' } });
    }
    
    console.log('✅ Salary updated successfully:', result.rows[0]);
    
    res.json({ success: true, data: result.rows[0], message: 'Salary updated successfully' });
  } catch (error) {
    console.error('❌ Error updating salary:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to update salary' } });
  }
});

// ============================================================================
// SIMPLIFIED DEDUCTIONS (tax, pension, service, credit)
// ============================================================================

// Get all deductions
router.get('/deductions', authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.query;
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_deductions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        deduction_type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        ethiopian_month VARCHAR(50),
        ethiopian_year INTEGER,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    let query = `SELECT * FROM hr_deductions`;
    const params = [];
    
    if (staffId) {
      params.push(staffId);
      query += ` WHERE staff_id = $1`;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching deductions:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch deductions' } });
  }
});

// Add deduction
router.post('/deductions', authenticateToken, async (req, res) => {
  try {
    const { staffId, staffName, deductionType, amount, ethiopianMonth, ethiopianYear, startDate, endDate, isRecurring, recurringEndMonth } = req.body;
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_deductions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        deduction_type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        ethiopian_month VARCHAR(50),
        ethiopian_year INTEGER,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const ethiopianMonths = [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ];
    
    // If recurring, create entries for each month
    if (isRecurring && recurringEndMonth) {
      const currentMonthIndex = ethiopianMonths.indexOf(ethiopianMonth);
      const endMonthIndex = ethiopianMonths.indexOf(recurringEndMonth);
      
      if (currentMonthIndex === -1 || endMonthIndex === -1) {
        return res.status(400).json({ success: false, error: { message: 'Invalid month names' } });
      }
      
      if (endMonthIndex < currentMonthIndex) {
        return res.status(400).json({ success: false, error: { message: 'End month must be after current month' } });
      }
      
      const insertedRecords = [];
      
      // Create entry for each month from current to end month
      for (let i = currentMonthIndex; i <= endMonthIndex; i++) {
        const monthName = ethiopianMonths[i];
        
        // Calculate approximate Gregorian dates for this Ethiopian month
        // This is a simplified calculation - you may want to use a proper conversion
        const monthOffset = i - currentMonthIndex;
        const currentDate = new Date(startDate);
        const monthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset, 1);
        const monthEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset + 1, 0);
        
        const result = await pool.query(
          `INSERT INTO hr_deductions (staff_id, staff_name, deduction_type, amount, ethiopian_month, ethiopian_year, start_date, end_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            staffId, 
            staffName, 
            deductionType, 
            amount, 
            monthName, 
            ethiopianYear, 
            monthStartDate.toISOString().split('T')[0],
            monthEndDate.toISOString().split('T')[0]
          ]
        );
        
        insertedRecords.push(result.rows[0]);
      }
      
      res.json({ 
        success: true, 
        data: insertedRecords, 
        message: `Recurring deduction added for ${insertedRecords.length} months (${ethiopianMonth} to ${recurringEndMonth})` 
      });
    } else {
      // Single month deduction
      const result = await pool.query(
        `INSERT INTO hr_deductions (staff_id, staff_name, deduction_type, amount, ethiopian_month, ethiopian_year, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [staffId, staffName, deductionType, amount, ethiopianMonth, ethiopianYear, startDate, endDate]
      );
      
      res.json({ success: true, data: result.rows[0], message: 'Deduction added successfully' });
    }
  } catch (error) {
    console.error('Error adding deduction:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add deduction' } });
  }
});

// Delete deduction
router.delete('/deductions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM hr_deductions WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Deduction deleted successfully' });
  } catch (error) {
    console.error('Error deleting deduction:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete deduction' } });
  }
});

// ============================================================================
// SIMPLIFIED ALLOWANCES (custom name and amount)
// ============================================================================

// Get all allowances
router.get('/allowances', authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.query;
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_allowances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        allowance_name VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        ethiopian_month VARCHAR(50),
        ethiopian_year INTEGER,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    let query = `SELECT * FROM hr_allowances`;
    const params = [];
    
    if (staffId) {
      params.push(staffId);
      query += ` WHERE staff_id = $1`;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching allowances:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch allowances' } });
  }
});

// Add allowance
router.post('/allowances', authenticateToken, async (req, res) => {
  try {
    const { staffId, staffName, allowanceType, amount, ethiopianMonth, ethiopianYear, startDate, endDate, isRecurring, recurringEndMonth } = req.body;
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_allowances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        allowance_type VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        ethiopian_month VARCHAR(50),
        ethiopian_year INTEGER,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const ethiopianMonths = [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ];
    
    // If recurring, create entries for each month
    if (isRecurring && recurringEndMonth) {
      const currentMonthIndex = ethiopianMonths.indexOf(ethiopianMonth);
      const endMonthIndex = ethiopianMonths.indexOf(recurringEndMonth);
      
      if (currentMonthIndex === -1 || endMonthIndex === -1) {
        return res.status(400).json({ success: false, error: { message: 'Invalid month names' } });
      }
      
      if (endMonthIndex < currentMonthIndex) {
        return res.status(400).json({ success: false, error: { message: 'End month must be after current month' } });
      }
      
      const insertedRecords = [];
      
      // Create entry for each month from current to end month
      for (let i = currentMonthIndex; i <= endMonthIndex; i++) {
        const monthName = ethiopianMonths[i];
        
        // Calculate approximate Gregorian dates for this Ethiopian month
        const monthOffset = i - currentMonthIndex;
        const currentDate = new Date(startDate);
        const monthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset, 1);
        const monthEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset + 1, 0);
        
        const result = await pool.query(
          `INSERT INTO hr_allowances (staff_id, staff_name, allowance_name, amount, ethiopian_month, ethiopian_year, start_date, end_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            staffId, 
            staffName, 
            allowanceType, 
            amount, 
            monthName, 
            ethiopianYear, 
            monthStartDate.toISOString().split('T')[0],
            monthEndDate.toISOString().split('T')[0]
          ]
        );
        
        insertedRecords.push(result.rows[0]);
      }
      
      res.json({ 
        success: true, 
        data: insertedRecords, 
        message: `Recurring allowance added for ${insertedRecords.length} months (${ethiopianMonth} to ${recurringEndMonth})` 
      });
    } else {
      // Single month allowance
      const result = await pool.query(
        `INSERT INTO hr_allowances (staff_id, staff_name, allowance_name, amount, ethiopian_month, ethiopian_year, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [staffId, staffName, allowanceType, amount, ethiopianMonth, ethiopianYear, startDate, endDate]
      );
      
      res.json({ success: true, data: result.rows[0], message: 'Allowance added successfully' });
    }
  } catch (error) {
    console.error('Error adding allowance:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add allowance' } });
  }
});

// Delete allowance
router.delete('/allowances/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM hr_allowances WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Allowance deleted successfully' });
  } catch (error) {
    console.error('Error deleting allowance:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete allowance' } });
  }
});

// ============================================================================
// SIMPLIFIED STAFF RETENTION (tuition waivers, merit pay)
// ============================================================================

// Get all retention benefits
router.get('/retentions', authenticateToken, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_retentions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        retention_type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(`
      SELECT * FROM hr_retentions ORDER BY created_at DESC
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching retentions:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch retentions' } });
  }
});

// Add retention benefit
router.post('/retentions', authenticateToken, async (req, res) => {
  try {
    const { staffId, staffName, retentionType, amount } = req.body;
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_retentions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        retention_type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await pool.query(
      `INSERT INTO hr_retentions (staff_id, staff_name, retention_type, amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [staffId, staffName, retentionType, amount]
    );
    
    res.json({ success: true, data: result.rows[0], message: 'Retention benefit added successfully' });
  } catch (error) {
    console.error('Error adding retention benefit:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to add retention benefit' } });
  }
});

// Delete retention benefit
router.delete('/retentions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM hr_retentions WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Retention benefit deleted successfully' });
  } catch (error) {
    console.error('Error deleting retention benefit:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to delete retention benefit' } });
  }
});

// ============================================================================
// ACCOUNTS (for dropdowns)
// ============================================================================

// Get all accounts
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' }
    });
    
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch accounts' } });
  }
});

module.exports = router;

