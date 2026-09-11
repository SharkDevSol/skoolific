const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Simple fee management table initialization
const initializeFeeManagementTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS simple_fee_structures (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        class_names TEXT[], -- Array of class names
        academic_year VARCHAR(50) NOT NULL,
        term VARCHAR(50),
        amount DECIMAL(10, 2) NOT NULL,
        fee_type VARCHAR(100) NOT NULL,
        custom_fee_name VARCHAR(255),
        is_recurring BOOLEAN DEFAULT false,
        due_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Simple fee structures table initialized');
  } catch (error) {
    console.error('Error initializing simple fee structures table:', error);
  }
};

// Initialize table on module load
initializeFeeManagementTable().catch(err => console.error('Init error:', err));

/**
 * GET /api/simple-fees/metadata
 * Get academic years, terms, and classes for dropdowns
 * V2 Enhancement: Retrieves term data from Task1 configuration
 */
router.get('/metadata', authenticateWithBranch, async (req, res) => {
  console.log('\n📥 GET /api/simple-fees/metadata - Request received');
  
  try {
    // Get classes from classes_schema
    const classesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'classes_schema'
      ORDER BY table_name
    `);
    
    const classes = classesResult.rows.map(row => row.table_name);
    
    // V2 Enhancement: Get academic year from Task1 configuration (schedule_schema.school_config)
    const scheduleConfigResult = await pool.query(`
      SELECT academic_year, current_term 
      FROM schedule_schema.school_config 
      WHERE id = 1
    `);
    
    const scheduleConfig = scheduleConfigResult.rows[0];
    const currentAcademicYear = scheduleConfig?.academic_year || new Date().getFullYear().toString();
    
    // Get unique academic years from existing fee structures
    const yearsResult = await pool.query(`
      SELECT DISTINCT academic_year 
      FROM simple_fee_structures 
      ORDER BY academic_year DESC
    `);
    
    const academicYears = yearsResult.rows.map(row => row.academic_year);
    
    // Add current academic year from Task1 if not present
    if (!academicYears.includes(currentAcademicYear)) {
      academicYears.unshift(currentAcademicYear);
    }
    
    // V2 Enhancement: Get term count from Task1 configuration (subjects_of_school_schema.school_config)
    const termConfigResult = await pool.query(`
      SELECT term_count 
      FROM subjects_of_school_schema.school_config 
      WHERE id = 1
    `);
    
    const termCount = termConfigResult.rows[0]?.term_count || 2;
    
    // Generate terms based on term count from Task1
    const terms = [];
    for (let i = 1; i <= termCount; i++) {
      terms.push(`Term ${i}`);
    }
    
    console.log(`✅ Found ${classes.length} classes, ${academicYears.length} academic years, ${termCount} terms (from Task1)`);
    
    res.json({
      success: true,
      data: {
        classes,
        academicYears,
        terms,
        currentAcademicYear, // V2: Include current academic year from Task1
        termCount // V2: Include term count from Task1
      }
    });
  } catch (error) {
    console.error('Error fetching metadata:', error);
    
    // Specific error messages based on error type
    let errorMessage = 'Failed to fetch fee management metadata';
    if (error.message.includes('classes_schema')) {
      errorMessage = 'Unable to retrieve class information. Please ensure classes are configured in Task2.';
    } else if (error.message.includes('schedule_schema')) {
      errorMessage = 'Unable to retrieve academic year configuration. Please complete Task1 setup.';
    } else if (error.message.includes('subjects_of_school_schema')) {
      errorMessage = 'Unable to retrieve term configuration. Please complete Task4 setup.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

/**
 * GET /api/simple-fees
 * Get all fee structures
 */
router.get('/', authenticateWithBranch, async (req, res) => {
  console.log('\n📥 GET /api/simple-fees - Request received');
  console.log('User:', req.user);
  
  try {
    await initializeFeeManagementTable();
    const result = await pool.query(`
      SELECT 
        id,
        name,
        class_names as "classNames",
        academic_year as "academicYear",
        term,
        amount,
        fee_type as "feeType",
        custom_fee_name as "customFeeName",
        is_recurring as "isRecurring",
        due_date as "dueDate",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM simple_fee_structures
      ORDER BY created_at DESC
    `);
    
    console.log(`✅ Found ${result.rows.length} fee structures`);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching fee structures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fee structures. Please check your database connection.',
      details: error.message
    });
  }
});

/**
 * POST /api/simple-fees
 * Create a new fee structure
 */
router.post('/', authenticateWithBranch, async (req, res) => {
  console.log('\n📥 POST /api/simple-fees - Request received');
  console.log('User:', req.user);
  console.log('Body:', req.body);
  
  try {
    const {
      name,
      classNames, // Now an array
      academicYear,
      term,
      amount,
      feeType,
      customFeeName,
      isRecurring,
      dueDate
    } = req.body;

    // Validation
    if (!name || !academicYear || !amount || !feeType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: 'Fee name, academic year, amount, and fee type are required to create a fee structure.'
      });
    }
    
    if (!classNames || classNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No classes selected',
        details: 'Please select at least one class for this fee structure.'
      });
    }
    
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
        details: 'Fee amount must be greater than zero.'
      });
    }
    
    if (feeType === 'CUSTOM' && !customFeeName) {
      return res.status(400).json({
        success: false,
        error: 'Custom fee name required',
        details: 'Please provide a name for your custom fee type.'
      });
    }

    // Ensure classNames is an array
    const classNamesArray = Array.isArray(classNames) ? classNames : (classNames ? [classNames] : []);

    const result = await pool.query(`
      INSERT INTO simple_fee_structures (
        name, class_names, academic_year, term, amount, 
        fee_type, custom_fee_name, is_recurring, due_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        name,
        class_names as "classNames",
        academic_year as "academicYear",
        term,
        amount,
        fee_type as "feeType",
        custom_fee_name as "customFeeName",
        is_recurring as "isRecurring",
        due_date as "dueDate",
        is_active as "isActive",
        created_at as "createdAt"
    `, [
      name,
      classNamesArray,
      academicYear,
      term || null,
      amount,
      feeType,
      customFeeName || null,
      isRecurring || false,
      dueDate || null
    ]);

    console.log('✅ Fee structure created:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Fee structure created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating fee structure:', error);
    
    // Specific error messages
    let errorMessage = 'Failed to create fee structure';
    if (error.code === '23505') { // Unique constraint violation
      errorMessage = 'A fee structure with this configuration already exists.';
    } else if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Invalid class or configuration reference. Please check your selections.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

/**
 * PUT /api/simple-fees/:id
 * Update a fee structure
 */
router.put('/:id', authenticateWithBranch, async (req, res) => {
  console.log('\n📥 PUT /api/simple-fees/:id - Request received');
  console.log('User:', req.user);
  console.log('ID:', req.params.id);
  console.log('Body:', req.body);
  
  try {
    const { id } = req.params;
    const {
      name,
      classNames,
      academicYear,
      term,
      amount,
      feeType,
      customFeeName,
      isRecurring,
      dueDate,
      isActive
    } = req.body;

    const result = await pool.query(`
      UPDATE simple_fee_structures
      SET 
        name = COALESCE($1, name),
        class_names = COALESCE($2, class_names),
        academic_year = COALESCE($3, academic_year),
        term = COALESCE($4, term),
        amount = COALESCE($5, amount),
        fee_type = COALESCE($6, fee_type),
        custom_fee_name = COALESCE($7, custom_fee_name),
        is_recurring = COALESCE($8, is_recurring),
        due_date = COALESCE($9, due_date),
        is_active = COALESCE($10, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING 
        id,
        name,
        class_names as "classNames",
        academic_year as "academicYear",
        term,
        amount,
        fee_type as "feeType",
        custom_fee_name as "customFeeName",
        is_recurring as "isRecurring",
        due_date as "dueDate",
        is_active as "isActive",
        updated_at as "updatedAt"
    `, [
      name,
      Array.isArray(classNames) ? classNames : (classNames ? [classNames] : null),
      academicYear,
      term,
      amount,
      feeType,
      customFeeName,
      isRecurring,
      dueDate,
      isActive,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fee structure not found'
      });
    }

    console.log('✅ Fee structure updated:', result.rows[0]);

    res.json({
      success: true,
      message: 'Fee structure updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating fee structure:', error);
    
    // Specific error messages
    let errorMessage = 'Failed to update fee structure';
    if (error.code === '23505') {
      errorMessage = 'A fee structure with this configuration already exists.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

/**
 * DELETE /api/simple-fees/:id
 * Delete a fee structure
 */
router.delete('/:id', authenticateWithBranch, async (req, res) => {
  console.log('\n📥 DELETE /api/simple-fees/:id - Request received');
  console.log('User:', req.user);
  console.log('ID:', req.params.id);
  
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM simple_fee_structures WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fee structure not found'
      });
    }

    console.log('✅ Fee structure deleted:', id);

    res.json({
      success: true,
      message: 'Fee structure deleted successfully',
      data: { id }
    });
  } catch (error) {
    console.error('Error deleting fee structure:', error);
    
    // Specific error messages
    let errorMessage = 'Failed to delete fee structure';
    if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Cannot delete this fee structure as it is referenced by existing payment records.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

module.exports = router;
