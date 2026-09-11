/**
 * Shift Time Settings Routes
 * Manages time configurations for Shift 1 and Shift 2
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// TEST ROUTE - Remove after testing
router.get('/test', async (req, res) => {
  console.log('🧪 TEST ROUTE HIT!');
  res.json({ success: true, message: 'Test route works!' });
});

// TEST: Check staff-specific timing lookup
router.get('/test-staff-timing/:staffId/:shiftType', async (req, res) => {
  try {
    const { staffId, shiftType } = req.params;
    
    console.log('🧪 Testing staff-specific timing lookup:');
    console.log('   Staff ID:', staffId);
    console.log('   Shift Type:', shiftType);
    
    const result = await pool.query(
      `SELECT * FROM staff_specific_shift_timing 
       WHERE staff_id = $1 AND shift_type = $2`,
      [staffId, shiftType]
    );
    
    console.log('   Found:', result.rows.length, 'records');
    if (result.rows.length > 0) {
      console.log('   Record:', result.rows[0]);
    }
    
    // Also try by name
    const byName = await pool.query(
      `SELECT * FROM staff_specific_shift_timing 
       WHERE LOWER(staff_name) LIKE LOWER($1)`,
      [`%${staffId}%`]
    );
    
    console.log('   By name search:', byName.rows.length, 'records');
    
    res.json({
      success: true,
      byId: result.rows,
      byName: byName.rows,
      searchedId: staffId,
      searchedShift: shiftType
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STAFF-SPECIFIC SHIFT TIMING ROUTES (Must be before /:shiftName)
// ============================================

// Get all staff with specific timing overrides
router.get('/staff-specific-timing', async (req, res) => {
  try {
    console.log('📥 GET /api/hr/shift-settings/staff-specific-timing - Fetching all staff-specific timings...');
    
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_specific_shift_timing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('shift1', 'shift2')),
        custom_check_in TIME,
        custom_check_out TIME,
        custom_late_threshold TIME,
        anytime_check BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, shift_type)
      )
    `);

    const result = await pool.query(`
      SELECT * FROM staff_specific_shift_timing 
      ORDER BY staff_name, shift_type
    `);
    
    console.log(`✅ Found ${result.rows.length} staff-specific timing records`);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching staff-specific timings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff-specific timings',
      details: error.message
    });
  }
});

// Get specific staff timing for a shift
router.get('/staff-specific-timing/:staffId/:shiftType', async (req, res) => {
  try {
    const { staffId, shiftType } = req.params;
    console.log(`📥 GET /staff-specific-timing/${staffId}/${shiftType}`);
    
    const result = await pool.query(
      `SELECT * FROM staff_specific_shift_timing 
       WHERE staff_id = $1 AND shift_type = $2`,
      [staffId, shiftType]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No specific timing found for this staff'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching staff-specific timing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff-specific timing',
      details: error.message
    });
  }
});

// Create or update staff-specific timing
router.post('/staff-specific-timing', async (req, res) => {
  try {
    const {
      staff_id,
      staff_name,
      shift_type,
      custom_check_in,
      custom_check_out,
      custom_late_threshold,
      anytime_check,
      notes
    } = req.body;

    console.log('📥 POST /staff-specific-timing - Creating/updating staff-specific timing...');
    console.log('   Staff:', staff_name, '(', staff_id, ')');
    console.log('   Shift:', shift_type);
    console.log('   Anytime Check:', anytime_check);

    if (!staff_id || !staff_name || !shift_type) {
      return res.status(400).json({
        success: false,
        error: 'staff_id, staff_name, and shift_type are required'
      });
    }

    if (!['shift1', 'shift2'].includes(shift_type)) {
      return res.status(400).json({
        success: false,
        error: 'shift_type must be shift1 or shift2'
      });
    }

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_specific_shift_timing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('shift1', 'shift2')),
        custom_check_in TIME,
        custom_check_out TIME,
        custom_late_threshold TIME,
        anytime_check BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, shift_type)
      )
    `);

    // Upsert (insert or update)
    const result = await pool.query(`
      INSERT INTO staff_specific_shift_timing 
        (staff_id, staff_name, shift_type, custom_check_in, custom_check_out, 
         custom_late_threshold, anytime_check, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (staff_id, shift_type) 
      DO UPDATE SET
        staff_name = EXCLUDED.staff_name,
        custom_check_in = EXCLUDED.custom_check_in,
        custom_check_out = EXCLUDED.custom_check_out,
        custom_late_threshold = EXCLUDED.custom_late_threshold,
        anytime_check = EXCLUDED.anytime_check,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [
      staff_id,
      staff_name,
      shift_type,
      custom_check_in || null,
      custom_check_out || null,
      custom_late_threshold || null,
      anytime_check || false,
      notes || null
    ]);

    console.log('✅ Staff-specific timing saved:', result.rows[0]);

    res.json({
      success: true,
      message: 'Staff-specific timing saved successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error saving staff-specific timing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save staff-specific timing',
      details: error.message
    });
  }
});

// Delete staff-specific timing
router.delete('/staff-specific-timing/:staffId/:shiftType', async (req, res) => {
  try {
    const { staffId, shiftType } = req.params;
    console.log(`📥 DELETE /staff-specific-timing/${staffId}/${shiftType}`);
    
    const result = await pool.query(
      `DELETE FROM staff_specific_shift_timing 
       WHERE staff_id = $1 AND shift_type = $2
       RETURNING *`,
      [staffId, shiftType]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Staff-specific timing not found'
      });
    }

    console.log('✅ Staff-specific timing deleted');

    res.json({
      success: true,
      message: 'Staff-specific timing deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error deleting staff-specific timing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete staff-specific timing',
      details: error.message
    });
  }
});

// Get all shift settings
router.get('/', async (req, res) => {
  try {
    console.log('📥 GET /api/hr/shift-settings - Fetching shift settings...');
    
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shift_time_settings (
        id SERIAL PRIMARY KEY,
        shift_name VARCHAR(20) NOT NULL UNIQUE CHECK (shift_name IN ('shift1', 'shift2')),
        check_in_time TIME NOT NULL DEFAULT '08:00',
        check_out_time TIME NOT NULL DEFAULT '17:00',
        late_threshold TIME NOT NULL DEFAULT '08:15',
        minimum_work_hours DECIMAL(4,2) NOT NULL DEFAULT 8.0,
        half_day_threshold DECIMAL(4,2) NOT NULL DEFAULT 4.0,
        grace_period_minutes INTEGER NOT NULL DEFAULT 15,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table verified/created');

    // Ensure default data exists
    await pool.query(`
      INSERT INTO shift_time_settings (shift_name, check_in_time, check_out_time, late_threshold)
      VALUES 
        ('shift1', '08:00', '17:00', '08:15'),
        ('shift2', '14:00', '22:00', '14:15')
      ON CONFLICT (shift_name) DO NOTHING
    `);
    console.log('✅ Default data verified');

    const result = await pool.query(`
      SELECT * FROM shift_time_settings 
      WHERE is_active = true 
      ORDER BY shift_name
    `);
    
    console.log(`✅ Found ${result.rows.length} shift settings`);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching shift settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shift settings',
      details: error.message
    });
  }
});

// Get specific shift settings
router.get('/:shiftName', async (req, res) => {
  try {
    const { shiftName } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM shift_time_settings WHERE shift_name = $1 AND is_active = true',
      [shiftName]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Shift settings not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching shift settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shift settings'
    });
  }
});

// Update shift settings
router.put('/:shiftName', async (req, res) => {
  try {
    const { shiftName } = req.params;
    const {
      check_in_time,
      check_out_time,
      late_threshold,
      minimum_work_hours,
      half_day_threshold,
      grace_period_minutes
    } = req.body;

    const result = await pool.query(`
      UPDATE shift_time_settings 
      SET 
        check_in_time = COALESCE($1, check_in_time),
        check_out_time = COALESCE($2, check_out_time),
        late_threshold = COALESCE($3, late_threshold),
        minimum_work_hours = COALESCE($4, minimum_work_hours),
        half_day_threshold = COALESCE($5, half_day_threshold),
        grace_period_minutes = COALESCE($6, grace_period_minutes),
        updated_at = CURRENT_TIMESTAMP
      WHERE shift_name = $7 AND is_active = true
      RETURNING *
    `, [
      check_in_time,
      check_out_time,
      late_threshold,
      minimum_work_hours,
      half_day_threshold,
      grace_period_minutes,
      shiftName
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Shift settings not found'
      });
    }

    res.json({
      success: true,
      message: `${shiftName} settings updated successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating shift settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update shift settings'
    });
  }
});

// Get staff shift assignment
router.get('/staff/:staffId/shift', async (req, res) => {
  try {
    const { staffId } = req.params;
    
    // Check all staff schemas for the shift assignment
    const schemas = [
      { name: 'staff_teachers', type: 'Teachers' },
      { name: 'staff_administrative_staff', type: 'Administrative Staff' },
      { name: 'staff_supportive_staff', type: 'Supportive Staff' },
      { name: 'staff_finance', type: 'Finance' }
    ];
    
    let shiftAssignment = null;

    for (const schema of schemas) {
      // Get all tables in this schema
      const tablesResult = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = $1`,
        [schema.name]
      );

      // Check each table for the staff member
      for (const tableRow of tablesResult.rows) {
        const result = await pool.query(
          `SELECT shift_assignment FROM "${schema.name}"."${tableRow.table_name}" 
           WHERE global_staff_id = $1`,
          [staffId]
        );
        
        if (result.rows.length > 0) {
          shiftAssignment = result.rows[0].shift_assignment || 'shift1';
          break;
        }
      }

      if (shiftAssignment) break;
    }

    if (!shiftAssignment) {
      return res.status(404).json({
        success: false,
        error: 'Staff not found'
      });
    }

    res.json({
      success: true,
      data: { shift_assignment: shiftAssignment }
    });
  } catch (error) {
    console.error('Error fetching staff shift:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff shift assignment'
    });
  }
});

// Update staff shift assignment
router.put('/staff/:staffType/:className/:staffId/shift', async (req, res) => {
  try {
    const { staffType, className, staffId } = req.params;
    const { shift_assignment } = req.body;

    console.log('📥 PUT /staff/:staffType/:className/:staffId/shift - Updating shift assignment...');
    console.log('   Staff Type:', staffType);
    console.log('   Class Name:', className);
    console.log('   Staff ID:', staffId);
    console.log('   New Shift:', shift_assignment);

    if (!['shift1', 'shift2', 'both'].includes(shift_assignment)) {
      console.log('❌ Invalid shift assignment value');
      return res.status(400).json({
        success: false,
        error: 'Invalid shift assignment. Must be shift1, shift2, or both'
      });
    }

    // Determine schema name based on staff type
    let schemaName;
    if (staffType === 'Teachers') {
      schemaName = 'staff_teachers';
    } else if (staffType === 'Administrative Staff') {
      schemaName = 'staff_administrative_staff';
    } else if (staffType === 'Supportive Staff') {
      schemaName = 'staff_supportive_staff';
    } else if (staffType === 'Finance') {
      schemaName = 'staff_finance';
    } else {
      console.log('❌ Invalid staff type');
      return res.status(400).json({
        success: false,
        error: 'Invalid staff type'
      });
    }

    console.log(`   Schema: ${schemaName}`);

    // Check if table exists
    const tableExists = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      )`,
      [schemaName, className]
    );

    if (!tableExists.rows[0].exists) {
      console.log(`❌ Table "${schemaName}"."${className}" does not exist`);
      return res.status(404).json({
        success: false,
        error: `Table ${className} not found in ${schemaName} schema`
      });
    }

    console.log(`✅ Table exists: "${schemaName}"."${className}"`);

    // Check if shift_assignment column exists, if not add it
    const columnExists = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = $1 AND table_name = $2 AND column_name = 'shift_assignment'`,
      [schemaName, className]
    );

    if (columnExists.rows.length === 0) {
      console.log(`⚠️  shift_assignment column doesn't exist, adding it...`);
      await pool.query(
        `ALTER TABLE "${schemaName}"."${className}" 
         ADD COLUMN shift_assignment VARCHAR(20) DEFAULT 'shift1' 
         CHECK (shift_assignment IN ('shift1', 'shift2', 'both'))`
      );
      console.log(`✅ shift_assignment column added`);
    } else {
      console.log(`✅ shift_assignment column exists`);
    }

    // Update the shift assignment
    console.log(`🔄 Updating shift assignment for staff ID ${staffId}...`);
    const result = await pool.query(
      `UPDATE "${schemaName}"."${className}" 
       SET shift_assignment = $1 
       WHERE global_staff_id = $2
       RETURNING *`,
      [shift_assignment, staffId]
    );

    if (result.rows.length === 0) {
      console.log(`❌ Staff not found with global_staff_id = ${staffId}`);
      return res.status(404).json({
        success: false,
        error: 'Staff not found in the specified table'
      });
    }

    console.log(`✅ Shift updated successfully for ${result.rows[0].full_name || result.rows[0].name || 'staff'}`);

    res.json({
      success: true,
      message: 'Shift assignment updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating staff shift:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to update shift assignment',
      details: error.message
    });
  }
});
module.exports = router;
