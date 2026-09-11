const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticateWithBranch } = require('../../middleware/branchAuth');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Get attendance records for a specific date
router.get('/attendance', authenticateWithBranch, async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        date DATE NOT NULL,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        working_hours DECIMAL(5, 2),
        overtime DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'ABSENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, date)
      )
    `);

    const result = await pool.query(
      `SELECT * FROM hr_attendance WHERE date = $1 ORDER BY staff_name`,
      [date]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance', details: error.message });
  }
});

// Get attendance records for a month (date range)
router.get('/attendance/monthly', authenticateWithBranch, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate parameters are required' });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        date DATE NOT NULL,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        working_hours DECIMAL(5, 2),
        overtime DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'ABSENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, date)
      )
    `);

    const result = await pool.query(
      `SELECT * FROM hr_attendance 
       WHERE date >= $1 AND date <= $2 
       ORDER BY staff_name, date`,
      [startDate, endDate]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({ error: 'Failed to fetch monthly attendance', details: error.message });
  }
});

// Mark attendance for a single staff member
router.post('/attendance', authenticateWithBranch, async (req, res) => {
  try {
    const { staffId, date, status, checkIn, checkOut, notes } = req.body;

    if (!staffId || !date || !status) {
      return res.status(400).json({ error: 'staffId, date, and status are required' });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        date DATE NOT NULL,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        working_hours DECIMAL(5, 2),
        overtime DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'ABSENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, date)
      )
    `);

    // Calculate working hours if both check_in and check_out are provided
    let workingHours = null;
    if (checkIn && checkOut) {
      const checkInTime = new Date(checkIn);
      const checkOutTime = new Date(checkOut);
      workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60); // Convert to hours
    }

    // Upsert attendance record
    const result = await pool.query(
      `INSERT INTO hr_attendance (staff_id, staff_name, date, check_in, check_out, working_hours, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (staff_id, date) 
       DO UPDATE SET 
         check_in = COALESCE(EXCLUDED.check_in, hr_attendance.check_in),
         check_out = COALESCE(EXCLUDED.check_out, hr_attendance.check_out),
         working_hours = COALESCE(EXCLUDED.working_hours, hr_attendance.working_hours),
         status = EXCLUDED.status,
         notes = COALESCE(EXCLUDED.notes, hr_attendance.notes),
         updated_at = NOW()
       RETURNING *`,
      [staffId, staffId, date, checkIn, checkOut, workingHours, status, notes]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Attendance marked successfully'
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Failed to mark attendance', details: error.message });
  }
});

// Bulk mark attendance
router.post('/attendance/bulk', authenticateWithBranch, async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Records array is required' });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        date DATE NOT NULL,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        working_hours DECIMAL(5, 2),
        overtime DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'ABSENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, date)
      )
    `);

    const results = [];
    
    for (const record of records) {
      const { staffId, date, status, checkIn, checkOut, notes } = record;

      if (!staffId || !date || !status) {
        continue; // Skip invalid records
      }

      // Calculate working hours if both check_in and check_out are provided
      let workingHours = null;
      if (checkIn && checkOut) {
        const checkInTime = new Date(checkIn);
        const checkOutTime = new Date(checkOut);
        workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
      }

      const result = await pool.query(
        `INSERT INTO hr_attendance (staff_id, staff_name, date, check_in, check_out, working_hours, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (staff_id, date) 
         DO UPDATE SET 
           check_in = COALESCE(EXCLUDED.check_in, hr_attendance.check_in),
           check_out = COALESCE(EXCLUDED.check_out, hr_attendance.check_out),
           working_hours = COALESCE(EXCLUDED.working_hours, hr_attendance.working_hours),
           status = EXCLUDED.status,
           notes = COALESCE(EXCLUDED.notes, hr_attendance.notes),
           updated_at = NOW()
         RETURNING *`,
        [staffId, staffId, date, checkIn, checkOut, workingHours, status, notes]
      );

      results.push(result.rows[0]);
    }

    res.json({
      success: true,
      data: results,
      count: results.length,
      message: `${results.length} attendance records marked successfully`
    });
  } catch (error) {
    console.error('Error bulk marking attendance:', error);
    res.status(500).json({ error: 'Failed to bulk mark attendance', details: error.message });
  }
});

// Update attendance record
router.put('/attendance/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;
    const { checkIn, checkOut, status, notes } = req.body;

    // Calculate working hours if both check_in and check_out are provided
    let workingHours = null;
    if (checkIn && checkOut) {
      const checkInTime = new Date(checkIn);
      const checkOutTime = new Date(checkOut);
      workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
    }

    const result = await pool.query(
      `UPDATE hr_attendance 
       SET check_in = COALESCE($1, check_in),
           check_out = COALESCE($2, check_out),
           working_hours = COALESCE($3, working_hours),
           status = COALESCE($4, status),
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [checkIn, checkOut, workingHours, status, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Attendance updated successfully'
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ error: 'Failed to update attendance', details: error.message });
  }
});

// Delete attendance record
router.delete('/attendance/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM hr_attendance WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ error: 'Failed to delete attendance', details: error.message });
  }
});

// Get attendance summary/report
router.get('/attendance/summary', authenticateWithBranch, async (req, res) => {
  try {
    const { startDate, endDate, staffId, department } = req.query;

    let query = `
      SELECT 
        staff_id,
        staff_name,
        department_name,
        COUNT(*) as total_days,
        COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present_days,
        COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absent_days,
        COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late_days,
        COUNT(CASE WHEN status = 'HALF_DAY' THEN 1 END) as half_days,
        COUNT(CASE WHEN status = 'LEAVE' THEN 1 END) as leave_days,
        SUM(working_hours) as total_hours,
        SUM(overtime) as total_overtime
      FROM hr_attendance
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    if (staffId) {
      query += ` AND staff_id = $${paramCount}`;
      params.push(staffId);
      paramCount++;
    }

    if (department) {
      query += ` AND department_name = $${paramCount}`;
      params.push(department);
      paramCount++;
    }

    query += ` GROUP BY staff_id, staff_name, department_name ORDER BY staff_name`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary', details: error.message });
  }
});

// Get attendance records for Ethiopian month
router.get('/attendance/ethiopian-month', authenticateWithBranch, async (req, res) => {
  try {
    const { ethMonth, ethYear } = req.query;
    
    if (!ethMonth || !ethYear) {
      return res.status(400).json({ error: 'ethMonth and ethYear parameters are required' });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_ethiopian_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        ethiopian_year INTEGER NOT NULL,
        ethiopian_month INTEGER NOT NULL,
        ethiopian_day INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ABSENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, ethiopian_year, ethiopian_month, ethiopian_day)
      )
    `);

    const result = await pool.query(
      `SELECT * FROM hr_ethiopian_attendance 
       WHERE ethiopian_month = $1 AND ethiopian_year = $2 
       ORDER BY staff_name, ethiopian_day`,
      [parseInt(ethMonth), parseInt(ethYear)]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching Ethiopian attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance', details: error.message });
  }
});

// Mark attendance for Ethiopian calendar
router.post('/attendance/ethiopian', authenticateWithBranch, async (req, res) => {
  try {
    console.log('📥 POST /api/hr/attendance/ethiopian - Recording attendance...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { staffId, staffName, ethMonth, ethYear, ethDay, checkIn, checkOut, notes, shiftType } = req.body;

    console.log('🔍 DEBUG - Staff identification:');
    console.log('   staffId from request:', staffId);
    console.log('   staffName from request:', staffName);
    console.log('   shiftType from request:', shiftType);

    if (!staffId || !ethMonth || !ethYear || !ethDay || !checkIn) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ error: 'staffId, ethMonth, ethYear, ethDay, and checkIn are required' });
    }

    // Ensure tables exist first
    console.log('🔧 Ensuring required tables exist...');
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
    
    await pool.query(`
      INSERT INTO shift_time_settings (shift_name, check_in_time, check_out_time, late_threshold)
      VALUES 
        ('shift1', '08:00', '17:00', '08:15'),
        ('shift2', '14:00', '22:00', '14:15')
      ON CONFLICT (shift_name) DO NOTHING
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_time_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        standard_check_in TIME NOT NULL DEFAULT '08:00',
        late_threshold TIME NOT NULL DEFAULT '08:15',
        standard_check_out TIME NOT NULL DEFAULT '17:00',
        minimum_work_hours DECIMAL(4, 2) NOT NULL DEFAULT 8.0,
        half_day_threshold DECIMAL(4, 2) NOT NULL DEFAULT 4.0,
        grace_period_minutes INTEGER NOT NULL DEFAULT 15,
        max_checkout_hours DECIMAL(4, 2) DEFAULT 3.0,
        absent_threshold_time TIME DEFAULT '15:00',
        weekend_days INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tables verified');

    // Get staff shift assignment (with better error handling)
    const staffSchemas = ['staff_teachers', 'staff_administrative_staff', 'staff_supportive_staff', 'staff_finance'];
    let shiftAssignment = 'shift1'; // default
    
    console.log(`🔍 Looking for shift assignment for staff: ${staffId} (${staffName})`);
    
    for (const schema of staffSchemas) {
      try {
        const tablesResult = await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
          [schema]
        );
        
        for (const tableRow of tablesResult.rows) {
          try {
            // Check if shift_assignment column exists
            const columnCheck = await pool.query(
              `SELECT column_name FROM information_schema.columns 
               WHERE table_schema = $1 AND table_name = $2 AND column_name = 'shift_assignment'`,
              [schema, tableRow.table_name]
            );
            
            if (columnCheck.rows.length > 0) {
              // Try to find by global_staff_id first, then by name
              let staffResult = await pool.query(
                `SELECT shift_assignment FROM "${schema}"."${tableRow.table_name}" 
                 WHERE global_staff_id = $1 OR LOWER(full_name) = LOWER($2) OR LOWER(name) = LOWER($2)
                 LIMIT 1`,
                [staffId, staffName]
              );
              
              if (staffResult.rows.length > 0) {
                shiftAssignment = staffResult.rows[0].shift_assignment || 'shift1';
                console.log(`✅ Found shift assignment: ${shiftAssignment} in ${schema}.${tableRow.table_name}`);
                break;
              }
            }
          } catch (err) {
            console.log(`⚠️  Could not check shift_assignment in ${schema}.${tableRow.table_name}:`, err.message);
          }
        }
        if (shiftAssignment !== 'shift1') break;
      } catch (err) {
        console.log(`⚠️  Could not check schema ${schema}:`, err.message);
      }
    }

    console.log(`📌 Staff ${staffName} (${staffId}) has shift assignment: ${shiftAssignment}`);

    // Determine which shift to use for validation
    let effectiveShift = shiftType || (shiftAssignment === 'both' ? 'shift1' : shiftAssignment);
    console.log(`📌 Using effective shift: ${effectiveShift}`);
    
    // ============================================
    // CHECK FOR STAFF-SPECIFIC TIMING OVERRIDE
    // ============================================
    let staffSpecificTiming = null;
    let hasAnytimeCheck = false;
    
    try {
      // Ensure staff_specific_shift_timing table exists
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
      
      const specificTimingResult = await pool.query(
        `SELECT * FROM staff_specific_shift_timing 
         WHERE staff_id = $1 AND shift_type = $2`,
        [staffId, effectiveShift]
      );
      
      console.log('🔍 DEBUG - Staff-specific timing lookup:');
      console.log('   Looking for staff_id:', staffId);
      console.log('   Looking for shift_type:', effectiveShift);
      console.log('   Found records:', specificTimingResult.rows.length);
      
      if (specificTimingResult.rows.length > 0) {
        staffSpecificTiming = specificTimingResult.rows[0];
        hasAnytimeCheck = staffSpecificTiming.anytime_check;
        console.log(`🎯 Found staff-specific timing for ${staffName}`);
        console.log(`   Anytime Check: ${hasAnytimeCheck}`);
        if (!hasAnytimeCheck) {
          console.log(`   Custom Check-In: ${staffSpecificTiming.custom_check_in || 'Not set'}`);
          console.log(`   Custom Late Threshold: ${staffSpecificTiming.custom_late_threshold || 'Not set'}`);
        }
      } else {
        console.log(`⚠️  No staff-specific timing found for staff_id: ${staffId}, shift: ${effectiveShift}`);
        
        // Try to find by name as fallback
        const byNameResult = await pool.query(
          `SELECT * FROM staff_specific_shift_timing 
           WHERE LOWER(staff_name) = LOWER($1) AND shift_type = $2`,
          [staffName, effectiveShift]
        );
        
        if (byNameResult.rows.length > 0) {
          console.log(`✅ Found by name! Using staff-specific timing`);
          staffSpecificTiming = byNameResult.rows[0];
          hasAnytimeCheck = staffSpecificTiming.anytime_check;
          console.log(`   Staff in DB has staff_id: ${staffSpecificTiming.staff_id}`);
          console.log(`   But request used staff_id: ${staffId}`);
          console.log(`   ⚠️  ID MISMATCH - This is why it wasn't found initially!`);
        }
      }
    } catch (err) {
      console.log(`⚠️  Could not check staff-specific timing:`, err.message);
    }
    
    // Get shift-specific time settings
    const shiftSettingsResult = await pool.query(
      `SELECT * FROM shift_time_settings WHERE shift_name = $1 AND is_active = true`,
      [effectiveShift]
    );

    let settings;
    let usedShiftSettings = false;
    if (shiftSettingsResult.rows.length > 0) {
      const shiftSettings = shiftSettingsResult.rows[0];
      settings = {
        late_threshold: shiftSettings.late_threshold,
        half_day_threshold: shiftSettings.half_day_threshold
      };
      
      // Override with staff-specific timing if available
      if (staffSpecificTiming && !hasAnytimeCheck) {
        if (staffSpecificTiming.custom_late_threshold) {
          settings.late_threshold = staffSpecificTiming.custom_late_threshold;
          console.log(`✅ Using staff-specific late threshold: ${settings.late_threshold}`);
        }
      }
      
      usedShiftSettings = true;
      console.log(`✅ Using ${effectiveShift} times: late threshold ${settings.late_threshold}`);
    } else {
      // Fall back to global settings
      const settingsResult = await pool.query(`SELECT * FROM hr_attendance_time_settings LIMIT 1`);
      if (settingsResult.rows.length > 0) {
        settings = {
          late_threshold: settingsResult.rows[0].late_threshold,
          half_day_threshold: settingsResult.rows[0].half_day_threshold
        };
        
        // Override with staff-specific timing if available
        if (staffSpecificTiming && !hasAnytimeCheck) {
          if (staffSpecificTiming.custom_late_threshold) {
            settings.late_threshold = staffSpecificTiming.custom_late_threshold;
            console.log(`✅ Using staff-specific late threshold: ${settings.late_threshold}`);
          }
        }
      } else {
        // Create default settings if none exist
        await pool.query(`
          INSERT INTO hr_attendance_time_settings 
          (standard_check_in, late_threshold, standard_check_out, minimum_work_hours, half_day_threshold, grace_period_minutes)
          VALUES ('08:00', '08:15', '17:00', 8.0, 4.0, 15)
        `);
        settings = {
          late_threshold: '08:15',
          half_day_threshold: 4.0
        };
      }
      console.log(`✅ Using global times: late threshold ${settings.late_threshold}`);
    }

    // Create Ethiopian attendance table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_ethiopian_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        ethiopian_year INTEGER NOT NULL,
        ethiopian_month INTEGER NOT NULL,
        ethiopian_day INTEGER NOT NULL,
        check_in TIME NOT NULL,
        check_out TIME,
        working_hours DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'PRESENT',
        shift_type VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, ethiopian_year, ethiopian_month, ethiopian_day, shift_type)
      )
    `);
    console.log('✅ Ethiopian attendance table verified');

    // Calculate working hours if check_out is provided
    let workingHours = null;
    if (checkOut) {
      const [inHour, inMin] = checkIn.split(':').map(Number);
      const [outHour, outMin] = checkOut.split(':').map(Number);
      const inMinutes = inHour * 60 + inMin;
      const outMinutes = outHour * 60 + outMin;
      workingHours = (outMinutes - inMinutes) / 60;
      console.log(`⏱️  Working hours calculated: ${workingHours.toFixed(2)} hours`);
    }

    // Determine status based on check-in time and working hours using shift-specific settings
    let status = 'PRESENT';
    
    // If staff has "anytime check" enabled, always mark as PRESENT
    if (hasAnytimeCheck) {
      status = 'PRESENT';
      console.log(`✅ Staff has anytime check enabled - Status: PRESENT (no deductions)`);
    } else {
      // Normal status calculation
      const [inHour, inMin] = checkIn.split(':').map(Number);
      const checkInMinutes = inHour * 60 + inMin;
      
      // Get late threshold from shift settings
      const [thresholdHour, thresholdMin] = settings.late_threshold.split(':').map(Number);
      const lateThresholdMinutes = thresholdHour * 60 + thresholdMin;

      const isLate = checkInMinutes > lateThresholdMinutes;
      const isHalfDay = workingHours !== null && workingHours < parseFloat(settings.half_day_threshold);

      // Determine status based on conditions
      if (isLate && isHalfDay) {
        status = 'LATE + HALF_DAY';
      } else if (isLate) {
        status = 'LATE';
      } else if (isHalfDay) {
        status = 'HALF_DAY';
      }
      console.log(`📊 Status determined: ${status} (Late: ${isLate}, Half Day: ${isHalfDay})`);
    }
    // For "both" shift staff, include shift_type in the unique constraint
    console.log(`🔍 Looking for existing record...`);
    
    const existingRecord = await pool.query(
      `SELECT * FROM hr_ethiopian_attendance 
       WHERE (staff_id = $1 OR LOWER(staff_name) = LOWER($2))
       AND ethiopian_year = $3 
       AND ethiopian_month = $4 
       AND ethiopian_day = $5
       AND (shift_type = $6 OR (shift_type IS NULL AND $6 IS NULL))
       LIMIT 1`,
      [staffId, staffName, parseInt(ethYear), parseInt(ethMonth), parseInt(ethDay), effectiveShift]
    );

    console.log(`📋 Found ${existingRecord.rows.length} existing record(s)`);

    let result;
    if (existingRecord.rows.length > 0) {
      // Update existing record
      console.log(`✏️  Updating existing record ID: ${existingRecord.rows[0].id}`);
      result = await pool.query(
        `UPDATE hr_ethiopian_attendance 
         SET check_in = $1,
             check_out = $2,
             working_hours = $3,
             status = $4,
             shift_type = $5,
             notes = COALESCE($6, notes),
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [checkIn, checkOut, workingHours, status, effectiveShift, notes, existingRecord.rows[0].id]
      );
      console.log(`✅ Updated record successfully`);
    } else {
      // Insert new record
      console.log(`➕ Inserting new record`);
      result = await pool.query(
        `INSERT INTO hr_ethiopian_attendance 
         (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, check_in, check_out, working_hours, status, shift_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [staffId, staffName, parseInt(ethYear), parseInt(ethMonth), parseInt(ethDay), checkIn, checkOut, workingHours, status, effectiveShift, notes]
      );
      console.log(`✅ Inserted record successfully`);
    }

    console.log(`✅ Attendance marked successfully for ${staffName}`);
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Attendance marked successfully',
      usedShiftSettings: usedShiftSettings
    });
  } catch (error) {
    console.error('❌ Error marking Ethiopian attendance:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to mark attendance', details: error.message });
  }
});

// Delete Ethiopian attendance record
router.delete('/attendance/ethiopian/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM hr_ethiopian_attendance WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Ethiopian attendance:', error);
    res.status(500).json({ error: 'Failed to delete attendance', details: error.message });
  }
});

// Bulk mark attendance for Ethiopian calendar
router.post('/attendance/ethiopian/bulk', authenticateWithBranch, async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Records array is required' });
    }

    // Get global time settings as fallback
    const settingsResult = await pool.query(`SELECT * FROM hr_attendance_time_settings LIMIT 1`);
    const globalSettings = settingsResult.rows[0] || {
      late_threshold: '08:15',
      half_day_threshold: 4.0
    };

    // Get all staff-specific time settings
    const staffSpecificResult = await pool.query(`SELECT * FROM hr_staff_specific_times`);
    const staffSpecificMap = {};
    staffSpecificResult.rows.forEach(row => {
      staffSpecificMap[row.staff_id] = {
        late_threshold: row.late_threshold,
        half_day_threshold: row.half_day_threshold
      };
    });

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_ethiopian_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        ethiopian_year INTEGER NOT NULL,
        ethiopian_month INTEGER NOT NULL,
        ethiopian_day INTEGER NOT NULL,
        check_in TIME NOT NULL,
        check_out TIME,
        working_hours DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'PRESENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, ethiopian_year, ethiopian_month, ethiopian_day)
      )
    `);

    const results = [];
    
    for (const record of records) {
      const { staffId, staffName, ethMonth, ethYear, ethDay, checkIn, checkOut, notes } = record;

      if (!staffId || !ethMonth || !ethYear || !ethDay || !checkIn) {
        continue; // Skip invalid records
      }

      // Check if staff has specific time settings
      const settings = staffSpecificMap[staffId] || globalSettings;
      const isStaffSpecific = !!staffSpecificMap[staffId];

      // Calculate working hours if check_out is provided
      let workingHours = null;
      if (checkOut) {
        const [inHour, inMin] = checkIn.split(':').map(Number);
        const [outHour, outMin] = checkOut.split(':').map(Number);
        const inMinutes = inHour * 60 + inMin;
        const outMinutes = outHour * 60 + outMin;
        workingHours = (outMinutes - inMinutes) / 60;
      }

      // Determine status based on check-in time and working hours using settings
      let status = 'PRESENT';
      const [inHour, inMin] = checkIn.split(':').map(Number);
      const checkInMinutes = inHour * 60 + inMin;

      // Get late threshold from settings (staff-specific or global)
      const [thresholdHour, thresholdMin] = settings.late_threshold.split(':').map(Number);
      const lateThresholdMinutes = thresholdHour * 60 + thresholdMin;

      const isLate = checkInMinutes > lateThresholdMinutes;
      const isHalfDay = workingHours !== null && workingHours < parseFloat(settings.half_day_threshold);

      // Determine status based on conditions
      if (isLate && isHalfDay) {
        status = 'LATE + HALF_DAY'; // L+H - Both late and half day
      } else if (isLate) {
        status = 'LATE';
      } else if (isHalfDay) {
        status = 'HALF_DAY';
      }

      const result = await pool.query(
        `INSERT INTO hr_ethiopian_attendance 
         (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, check_in, check_out, working_hours, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (staff_id, ethiopian_year, ethiopian_month, ethiopian_day) 
         DO UPDATE SET 
           check_in = EXCLUDED.check_in,
           check_out = EXCLUDED.check_out,
           working_hours = EXCLUDED.working_hours,
           status = EXCLUDED.status,
           notes = COALESCE(EXCLUDED.notes, hr_ethiopian_attendance.notes),
           updated_at = NOW()
         RETURNING *`,
        [staffId, staffName, parseInt(ethYear), parseInt(ethMonth), parseInt(ethDay), checkIn, checkOut, workingHours, status, notes]
      );

      results.push({
        ...result.rows[0],
        usedStaffSpecificTimes: isStaffSpecific
      });
    }

    res.json({
      success: true,
      data: results,
      count: results.length,
      message: `${results.length} attendance records marked successfully`
    });
  } catch (error) {
    console.error('Error bulk marking Ethiopian attendance:', error);
    res.status(500).json({ error: 'Failed to bulk mark attendance', details: error.message });
  }
});

// ==================== ATTENDANCE TIME SETTINGS ====================

// Get attendance time settings
router.get('/attendance/time-settings', authenticateWithBranch, async (req, res) => {
  try {
    console.log('📥 GET /api/hr/attendance/time-settings - Fetching time settings...');
    
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_time_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        standard_check_in TIME NOT NULL DEFAULT '08:00',
        late_threshold TIME NOT NULL DEFAULT '08:15',
        standard_check_out TIME NOT NULL DEFAULT '17:00',
        minimum_work_hours DECIMAL(4, 2) NOT NULL DEFAULT 8.0,
        half_day_threshold DECIMAL(4, 2) NOT NULL DEFAULT 4.0,
        grace_period_minutes INTEGER NOT NULL DEFAULT 15,
        max_checkout_hours DECIMAL(4, 2) DEFAULT 3.0,
        absent_threshold_time TIME DEFAULT '15:00',
        weekend_days INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table verified/created');

    // Get settings (there should only be one row)
    const result = await pool.query(
      `SELECT * FROM hr_attendance_time_settings LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.log('⚠️ No settings found, creating defaults...');
      // Create default settings
      const defaultSettings = await pool.query(`
        INSERT INTO hr_attendance_time_settings 
        (standard_check_in, late_threshold, standard_check_out, minimum_work_hours, half_day_threshold, grace_period_minutes)
        VALUES ('08:00', '08:15', '17:00', 8.0, 4.0, 15)
        RETURNING *
      `);
      
      console.log('✅ Default settings created');
      return res.json({
        success: true,
        data: defaultSettings.rows[0]
      });
    }

    console.log('✅ Settings fetched successfully');
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching time settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
});

// Save/Update attendance time settings
router.post('/attendance/time-settings', authenticateWithBranch, async (req, res) => {
  try {
    console.log('📥 POST /api/hr/attendance/time-settings - Saving settings...');
    console.log('Request body:', req.body);
    
    const { 
      standardCheckIn, 
      lateThreshold, 
      standardCheckOut, 
      minimumWorkHours, 
      halfDayThreshold,
      gracePeriodMinutes,
      maxCheckoutHours,
      absentThresholdTime,
      weekendDays
    } = req.body;

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_time_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        standard_check_in TIME NOT NULL DEFAULT '08:00',
        late_threshold TIME NOT NULL DEFAULT '08:15',
        standard_check_out TIME NOT NULL DEFAULT '17:00',
        minimum_work_hours DECIMAL(4, 2) NOT NULL DEFAULT 8.0,
        half_day_threshold DECIMAL(4, 2) NOT NULL DEFAULT 4.0,
        grace_period_minutes INTEGER NOT NULL DEFAULT 15,
        max_checkout_hours DECIMAL(4, 2) DEFAULT 3.0,
        absent_threshold_time TIME DEFAULT '15:00',
        weekend_days INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table verified/created');

    // Check if settings exist
    const existing = await pool.query(`SELECT id FROM hr_attendance_time_settings LIMIT 1`);

    let result;
    if (existing.rows.length === 0) {
      console.log('➕ Inserting new settings...');
      // Insert new settings
      result = await pool.query(`
        INSERT INTO hr_attendance_time_settings 
        (standard_check_in, late_threshold, standard_check_out, minimum_work_hours, half_day_threshold, grace_period_minutes, max_checkout_hours, absent_threshold_time, weekend_days)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [standardCheckIn, lateThreshold, standardCheckOut, minimumWorkHours, halfDayThreshold, gracePeriodMinutes, maxCheckoutHours, absentThresholdTime, weekendDays || []]);
    } else {
      console.log('✏️ Updating existing settings...');
      // Update existing settings
      result = await pool.query(`
        UPDATE hr_attendance_time_settings
        SET standard_check_in = $1,
            late_threshold = $2,
            standard_check_out = $3,
            minimum_work_hours = $4,
            half_day_threshold = $5,
            grace_period_minutes = $6,
            max_checkout_hours = $7,
            absent_threshold_time = $8,
            weekend_days = $9,
            updated_at = NOW()
        WHERE id = $10
        RETURNING *
      `, [standardCheckIn, lateThreshold, standardCheckOut, minimumWorkHours, halfDayThreshold, gracePeriodMinutes, maxCheckoutHours, absentThresholdTime, weekendDays || [], existing.rows[0].id]);
    }

    console.log('✅ Settings saved successfully');
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Settings saved successfully'
    });
  } catch (error) {
    console.error('❌ Error saving time settings:', error);
    res.status(500).json({ error: 'Failed to save settings', details: error.message });
  }
});

// ==================== ATTENDANCE DEDUCTION SETTINGS ====================

// Get all deduction settings
router.get('/attendance/deduction-settings', authenticateWithBranch, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_deduction_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_type VARCHAR(255) NOT NULL,
        deduction_type VARCHAR(50) NOT NULL,
        deduction_amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_type, deduction_type)
      )
    `);

    const result = await pool.query(
      `SELECT * FROM hr_attendance_deduction_settings ORDER BY staff_type, deduction_type`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching deduction settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
});

// Create deduction setting
router.post('/attendance/deduction-settings', authenticateWithBranch, async (req, res) => {
  try {
    const { staffType, deductionType, deductionAmount, description, isActive } = req.body;

    if (!staffType || !deductionType || deductionAmount === undefined) {
      return res.status(400).json({ error: 'staffType, deductionType, and deductionAmount are required' });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_deduction_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_type VARCHAR(255) NOT NULL,
        deduction_type VARCHAR(50) NOT NULL,
        deduction_amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_type, deduction_type)
      )
    `);

    const result = await pool.query(
      `INSERT INTO hr_attendance_deduction_settings 
       (staff_type, deduction_type, deduction_amount, description, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (staff_type, deduction_type)
       DO UPDATE SET
         deduction_amount = EXCLUDED.deduction_amount,
         description = EXCLUDED.description,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [staffType, deductionType, parseFloat(deductionAmount), description, isActive !== false]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Deduction setting created successfully'
    });
  } catch (error) {
    console.error('Error creating deduction setting:', error);
    res.status(500).json({ error: 'Failed to create setting', details: error.message });
  }
});

// Update deduction setting
router.put('/attendance/deduction-settings/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;
    const { staffType, deductionType, deductionAmount, description, isActive } = req.body;

    const result = await pool.query(
      `UPDATE hr_attendance_deduction_settings
       SET staff_type = COALESCE($1, staff_type),
           deduction_type = COALESCE($2, deduction_type),
           deduction_amount = COALESCE($3, deduction_amount),
           description = COALESCE($4, description),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [staffType, deductionType, deductionAmount ? parseFloat(deductionAmount) : null, description, isActive, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deduction setting not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Deduction setting updated successfully'
    });
  } catch (error) {
    console.error('Error updating deduction setting:', error);
    res.status(500).json({ error: 'Failed to update setting', details: error.message });
  }
});

// Delete deduction setting
router.delete('/attendance/deduction-settings/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM hr_attendance_deduction_settings WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deduction setting not found' });
    }

    res.json({
      success: true,
      message: 'Deduction setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting deduction setting:', error);
    res.status(500).json({ error: 'Failed to delete setting', details: error.message });
  }
});

// Calculate attendance deductions for a staff member
router.get('/attendance/calculate-deductions', authenticateWithBranch, async (req, res) => {
  try {
    const { staffId, staffType, ethMonth, ethYear } = req.query;

    if (!staffId || !staffType || !ethMonth || !ethYear) {
      return res.status(400).json({ error: 'staffId, staffType, ethMonth, and ethYear are required' });
    }

    // Get attendance records for the staff member
    const attendanceResult = await pool.query(
      `SELECT a.*, p.permission_status
       FROM hr_ethiopian_attendance a
       LEFT JOIN hr_attendance_permissions p ON a.id = p.attendance_id
       WHERE a.staff_id = $1 AND a.ethiopian_month = $2 AND a.ethiopian_year = $3`,
      [staffId, parseInt(ethMonth), parseInt(ethYear)]
    );

    // Get active deduction settings for the staff type
    const settingsResult = await pool.query(
      `SELECT * FROM hr_attendance_deduction_settings
       WHERE staff_type = $1 AND is_active = true`,
      [staffType]
    );

    const settings = settingsResult.rows;
    const attendance = attendanceResult.rows;

    // Calculate deductions (exclude APPROVED permissions)
    const deductions = {
      ABSENT: 0,
      LATE: 0,
      HALF_DAY: 0,
      total: 0,
      breakdown: []
    };

    settings.forEach(setting => {
      // Only count attendance records that are NOT approved
      const count = attendance.filter(a => 
        a.status === setting.deduction_type && 
        (!a.permission_status || a.permission_status !== 'APPROVED')
      ).length;
      
      const amount = count * parseFloat(setting.deduction_amount);

      deductions[setting.deduction_type] = amount;
      deductions.total += amount;

      if (count > 0) {
        deductions.breakdown.push({
          type: setting.deduction_type,
          count,
          amountPerOccurrence: parseFloat(setting.deduction_amount),
          totalAmount: amount
        });
      }
    });

    res.json({
      success: true,
      data: {
        staffId,
        staffType,
        ethMonth: parseInt(ethMonth),
        ethYear: parseInt(ethYear),
        deductions,
        attendanceRecords: attendance.length
      }
    });
  } catch (error) {
    console.error('Error calculating deductions:', error);
    res.status(500).json({ error: 'Failed to calculate deductions', details: error.message });
  }
});

// ==================== STAFF-SPECIFIC TIME SETTINGS ====================

// Get all staff-specific time settings
router.get('/attendance/staff-specific-times', authenticateWithBranch, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_staff_specific_times (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL UNIQUE,
        staff_name VARCHAR(255) NOT NULL,
        staff_type VARCHAR(255),
        check_in_time TIME NOT NULL,
        check_out_time TIME NOT NULL,
        late_threshold TIME NOT NULL,
        minimum_work_hours DECIMAL(4, 2) NOT NULL DEFAULT 8.0,
        half_day_threshold DECIMAL(4, 2) NOT NULL DEFAULT 4.0,
        grace_period_minutes INTEGER NOT NULL DEFAULT 15,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pool.query(
      `SELECT * FROM hr_staff_specific_times ORDER BY staff_name`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching staff-specific times:', error);
    res.status(500).json({ error: 'Failed to fetch staff-specific times', details: error.message });
  }
});

// Add staff-specific time setting
router.post('/attendance/staff-specific-times', authenticateWithBranch, async (req, res) => {
  try {
    const { 
      staffId, 
      staffName, 
      staffType,
      checkInTime, 
      checkOutTime, 
      lateThreshold,
      minimumWorkHours,
      halfDayThreshold,
      gracePeriodMinutes,
      notes 
    } = req.body;

    if (!staffId || !staffName || !checkInTime || !checkOutTime || !lateThreshold) {
      return res.status(400).json({ 
        error: 'staffId, staffName, checkInTime, checkOutTime, and lateThreshold are required' 
      });
    }

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_staff_specific_times (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL UNIQUE,
        staff_name VARCHAR(255) NOT NULL,
        staff_type VARCHAR(255),
        check_in_time TIME NOT NULL,
        check_out_time TIME NOT NULL,
        late_threshold TIME NOT NULL,
        minimum_work_hours DECIMAL(4, 2) NOT NULL DEFAULT 8.0,
        half_day_threshold DECIMAL(4, 2) NOT NULL DEFAULT 4.0,
        grace_period_minutes INTEGER NOT NULL DEFAULT 15,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pool.query(
      `INSERT INTO hr_staff_specific_times 
       (staff_id, staff_name, staff_type, check_in_time, check_out_time, late_threshold, 
        minimum_work_hours, half_day_threshold, grace_period_minutes, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (staff_id)
       DO UPDATE SET
         staff_name = EXCLUDED.staff_name,
         staff_type = EXCLUDED.staff_type,
         check_in_time = EXCLUDED.check_in_time,
         check_out_time = EXCLUDED.check_out_time,
         late_threshold = EXCLUDED.late_threshold,
         minimum_work_hours = EXCLUDED.minimum_work_hours,
         half_day_threshold = EXCLUDED.half_day_threshold,
         grace_period_minutes = EXCLUDED.grace_period_minutes,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [
        staffId, 
        staffName, 
        staffType || null,
        checkInTime, 
        checkOutTime, 
        lateThreshold,
        minimumWorkHours || 8.0,
        halfDayThreshold || 4.0,
        gracePeriodMinutes || 15,
        notes || null
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Staff-specific time setting saved successfully'
    });
  } catch (error) {
    console.error('Error saving staff-specific time:', error);
    res.status(500).json({ error: 'Failed to save staff-specific time', details: error.message });
  }
});

// Delete staff-specific time setting
router.delete('/attendance/staff-specific-times/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM hr_staff_specific_times WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff-specific time setting not found' });
    }

    res.json({
      success: true,
      message: 'Staff-specific time setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff-specific time:', error);
    res.status(500).json({ error: 'Failed to delete staff-specific time', details: error.message });
  }
});

// Get time settings for a specific staff member (checks staff-specific first, then global)
router.get('/attendance/staff-time-settings/:staffId', authenticateWithBranch, async (req, res) => {
  try {
    const { staffId } = req.params;

    // Check for staff-specific settings first
    const specificResult = await pool.query(
      `SELECT * FROM hr_staff_specific_times WHERE staff_id = $1`,
      [staffId]
    );

    if (specificResult.rows.length > 0) {
      return res.json({
        success: true,
        data: specificResult.rows[0],
        isStaffSpecific: true
      });
    }

    // Fall back to global settings
    const globalResult = await pool.query(
      `SELECT * FROM hr_attendance_time_settings LIMIT 1`
    );

    res.json({
      success: true,
      data: globalResult.rows[0] || null,
      isStaffSpecific: false
    });
  } catch (error) {
    console.error('Error fetching staff time settings:', error);
    res.status(500).json({ error: 'Failed to fetch time settings', details: error.message });
  }
});

// Get AI06 device connection status
router.get('/devices/status', authenticateWithBranch, async (req, res) => {
  try {
    // Get the AI06 service instance from the app
    const ai06Service = req.app.get('ai06Service');
    
    if (!ai06Service) {
      return res.json({
        success: true,
        devices: [],
        message: 'AI06 service not initialized'
      });
    }
    
    // Get list of connected device serial numbers
    const connectedDevices = ai06Service.getConnectedDevices();
    
    // Only show devices bound to the requesting branch
    const requestBranch = (req.branchCode || '').toUpperCase();
    const branchDevices = requestBranch
      ? connectedDevices.filter(device => (device.branch || '').toUpperCase() === requestBranch)
      : connectedDevices;
    
    // Each branch has its own AI06 WebSocket port
    const branchPortMap = {
      'IQRA1': 7701,
      'IQRA2': 7790,
      'IQRA3': 7703
    };
    
    // Format device information
    const devices = branchDevices.map((device, index) => ({
      serialNumber: device.serialNumber,
      name: `AI06 Device ${index + 1}`,
      model: 'AI06 Face Recognition',
      status: 'connected',
      branch: device.branch,
      ip: device.ip,
      connectedAt: device.connectedAt
    }));
    
    res.json({
      success: true,
      devices,
      count: devices.length,
      branch: requestBranch || ai06Service.branchCode,
      serverPort: branchPortMap[requestBranch] || (parseInt(process.env.AI06_WEBSOCKET_PORT, 10) || 7788),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching device status:', error);
    res.status(500).json({ error: 'Failed to fetch device status', details: error.message });
  }
});

// Test endpoint to manually trigger attendance log processing
router.post('/devices/test-log', authenticateWithBranch, async (req, res) => {
  try {
    const { machineId, name, scanTime } = req.body;
    
    if (!machineId || !name) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['machineId', 'name']
      });
    }
    
    // Get the AI06 service instance
    const ai06Service = req.app.get('ai06Service');
    
    if (!ai06Service) {
      return res.status(500).json({ error: 'AI06 service not initialized' });
    }
    
    // Use current time if not provided
    const testScanTime = scanTime || new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Manually call the save function
    await ai06Service.saveAttendanceToDatabase(
      machineId,
      name,
      testScanTime,
      3, // mode: 3 = face recognition
      0  // inout: 0 = check-in
    );
    
    res.json({
      success: true,
      message: 'Test attendance log processed',
      data: {
        machineId,
        name,
        scanTime: testScanTime
      }
    });
  } catch (error) {
    console.error('Error processing test log:', error);
    res.status(500).json({ error: 'Failed to process test log', details: error.message });
  }
});

// ==================== MANUAL AUTO-MARKER TRIGGER ====================

// Manually trigger the auto-marker to run immediately
router.post('/attendance/trigger-auto-marker', authenticateWithBranch, async (req, res) => {
  try {
    console.log('🔧 Manual trigger: Running auto-marker immediately...');
    
    const attendanceAutoMarker = require('../../services/attendanceAutoMarker');
    
    // Run the auto-marker immediately
    await attendanceAutoMarker.checkAndMarkAttendance();
    
    res.json({
      success: true,
      message: 'Auto-marker triggered successfully. Check server logs for details.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error triggering auto-marker:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to trigger auto-marker', 
      details: error.message 
    });
  }
});

module.exports = router;

