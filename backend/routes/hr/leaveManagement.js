const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticateWithBranch } = require('../../middleware/branchAuth');
const axios = require('axios');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Get attendance issues (LATE, ABSENT, HALF_DAY) with permission status
router.get('/attendance-issues', authenticateWithBranch, async (req, res) => {
  try {
    const { ethMonth, ethYear, status } = req.query;

    if (!ethMonth || !ethYear) {
      return res.status(400).json({ error: 'ethMonth and ethYear are required' });
    }

    // Create permissions table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attendance_id UUID NOT NULL REFERENCES hr_ethiopian_attendance(id) ON DELETE CASCADE,
        permission_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        permission_reason TEXT,
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(attendance_id)
      )
    `);

    // Get list of registered staff from List Staff page
    let registeredStaffNames = [];
    let registeredStaffIds = [];
    
    const port = process.env.PORT || 5052;
    const staffTypes = ['Teachers', 'Administrative Staff', 'Supportive Staff', 'Finance'];
    
    for (const staffType of staffTypes) {
      try {
        const classesResponse = await axios.get(
          `http://localhost:${port}/api/staff/classes?staffType=${encodeURIComponent(staffType)}`
        );
        
        for (const className of classesResponse.data) {
          try {
            const dataResponse = await axios.get(
              `http://localhost:${port}/api/staff/data/${staffType}/${className}`
            );
            
            const staffData = dataResponse.data.data || [];
            
            staffData.forEach(staff => {
              const staffId = staff.global_staff_id || staff.staff_id || staff.id;
              const staffName = staff.full_name || staff.name;
              
              if (staffId) {
                registeredStaffIds.push(String(staffId).toLowerCase());
              }
              if (staffName) {
                registeredStaffNames.push(String(staffName).toLowerCase());
              }
            });
          } catch (err) {
            console.warn(`No data for: ${staffType}/${className}`);
          }
        }
      } catch (err) {
        console.warn(`No classes for: ${staffType}`);
      }
    }
    
    // Remove duplicates
    registeredStaffIds = [...new Set(registeredStaffIds)];
    registeredStaffNames = [...new Set(registeredStaffNames)];
    
    console.log(`📋 Found ${registeredStaffIds.length} registered staff IDs`);
    console.log(`📋 Found ${registeredStaffNames.length} registered staff names`);
    console.log(`👥 Sample names:`, registeredStaffNames.slice(0, 10));

    console.log(`📅 Month: ${ethMonth}, Year: ${ethYear}, Status filter: ${status || 'ALL'}`);

    // Build query - filter by registered staff (ID or name match)
    // Use substring matching for flexible name matching
    let query = `
      SELECT 
        a.*,
        p.permission_status,
        p.permission_reason,
        p.approved_by,
        p.approved_at,
        s.deduction_amount
      FROM hr_ethiopian_attendance a
      LEFT JOIN hr_attendance_permissions p ON a.id = p.attendance_id
      LEFT JOIN hr_attendance_deduction_settings s ON s.staff_type = a.department_name AND s.deduction_type = a.status
      WHERE a.ethiopian_month = $1 
        AND a.ethiopian_year = $2
        AND a.status IN ('LATE', 'ABSENT', 'HALF_DAY', 'LATE_HALF_DAY', 'NO_CHECKOUT', 'L+NCO', 'L+H', 'H', 'NCO', 'LATE + HALF_DAY', 'LATE + without check out')
        AND (
          LOWER(a.staff_id) = ANY($3)
          OR LOWER(a.staff_name) = ANY($4)
          OR EXISTS (
            SELECT 1 FROM unnest($4) AS registered_name
            WHERE LOWER(a.staff_name) LIKE '%' || registered_name || '%'
            OR registered_name LIKE '%' || LOWER(a.staff_name) || '%'
          )
        )
    `;

    const params = [parseInt(ethMonth), parseInt(ethYear), registeredStaffIds, registeredStaffNames];

    // Add status filter
    if (status && status !== 'ALL') {
      query += ` AND COALESCE(p.permission_status, 'PENDING') = $5`;
      params.push(status);
    }

    query += ` ORDER BY a.ethiopian_day DESC, a.staff_name`;

    console.log('🔍 Executing query with filters...');
    const result = await pool.query(query, params);
    
    console.log(`✅ Query returned ${result.rows.length} attendance issues (filtered by registered staff)`);
    if (result.rows.length > 0) {
      console.log('📋 Sample records:', result.rows.slice(0, 3).map(r => ({
        staff_name: r.staff_name,
        staff_id: r.staff_id,
        status: r.status,
        day: r.ethiopian_day
      })));
    }

    // Add permission_status default if null
    const data = result.rows.map(row => ({
      ...row,
      attendance_id: row.id,
      permission_status: row.permission_status || 'PENDING'
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching attendance issues:', error);
    res.status(500).json({ error: 'Failed to fetch attendance issues', details: error.message });
  }
});

// Approve permission (no deduction will be applied)
router.post('/approve-permission', authenticateWithBranch, async (req, res) => {
  try {
    const { attendanceId, reason } = req.body;

    if (!attendanceId) {
      return res.status(400).json({ error: 'attendanceId is required' });
    }

    // Create permissions table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attendance_id UUID NOT NULL REFERENCES hr_ethiopian_attendance(id) ON DELETE CASCADE,
        permission_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        permission_reason TEXT,
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(attendance_id)
      )
    `);

    const approvedBy = req.user.username || req.user.id;

    // Upsert permission record
    const result = await pool.query(`
      INSERT INTO hr_attendance_permissions 
      (attendance_id, permission_status, permission_reason, approved_by, approved_at)
      VALUES ($1, 'APPROVED', $2, $3, NOW())
      ON CONFLICT (attendance_id)
      DO UPDATE SET
        permission_status = 'APPROVED',
        permission_reason = $2,
        approved_by = $3,
        approved_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `, [attendanceId, reason || 'Approved by HR', approvedBy]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Permission approved successfully. No deduction will be applied.'
    });
  } catch (error) {
    console.error('Error approving permission:', error);
    res.status(500).json({ error: 'Failed to approve permission', details: error.message });
  }
});

// Reject permission (deduction will be applied)
router.post('/reject-permission', authenticateWithBranch, async (req, res) => {
  try {
    const { attendanceId, reason } = req.body;

    if (!attendanceId || !reason) {
      return res.status(400).json({ error: 'attendanceId and reason are required' });
    }

    // Create permissions table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_attendance_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attendance_id UUID NOT NULL REFERENCES hr_ethiopian_attendance(id) ON DELETE CASCADE,
        permission_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        permission_reason TEXT,
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(attendance_id)
      )
    `);

    const approvedBy = req.user.username || req.user.id;

    // Upsert permission record
    const result = await pool.query(`
      INSERT INTO hr_attendance_permissions 
      (attendance_id, permission_status, permission_reason, approved_by, approved_at)
      VALUES ($1, 'REJECTED', $2, $3, NOW())
      ON CONFLICT (attendance_id)
      DO UPDATE SET
        permission_status = 'REJECTED',
        permission_reason = $2,
        approved_by = $3,
        approved_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `, [attendanceId, reason, approvedBy]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Permission rejected. Deduction will be applied.'
    });
  } catch (error) {
    console.error('Error rejecting permission:', error);
    res.status(500).json({ error: 'Failed to reject permission', details: error.message });
  }
});

// Grant multi-day leave to a staff member
router.post('/grant-leave', authenticateWithBranch, async (req, res) => {
  try {
    const { 
      staffId, 
      staffName, 
      departmentName, 
      startMonth, 
      startDay, 
      startYear, 
      numberOfDays, 
      reason 
    } = req.body;

    if (!staffId || !staffName || !startMonth || !startDay || !startYear || !numberOfDays || !reason) {
      return res.status(400).json({ 
        error: 'staffId, staffName, startMonth, startDay, startYear, numberOfDays, and reason are required' 
      });
    }

    // Create attendance table if not exists and ensure check_in/check_out are nullable
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_ethiopian_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR(255) NOT NULL,
        staff_name VARCHAR(255) NOT NULL,
        department_name VARCHAR(255),
        ethiopian_year INTEGER NOT NULL,
        ethiopian_month INTEGER NOT NULL,
        ethiopian_day INTEGER NOT NULL,
        check_in TIME,
        check_out TIME,
        working_hours DECIMAL(5, 2),
        status VARCHAR(50) NOT NULL DEFAULT 'PRESENT',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(staff_id, ethiopian_year, ethiopian_month, ethiopian_day)
      )
    `);

    // Alter table to make check_in and check_out nullable (if they're not already)
    try {
      await pool.query(`
        ALTER TABLE hr_ethiopian_attendance 
        ALTER COLUMN check_in DROP NOT NULL
      `);
    } catch (err) {
      // Column might already be nullable, ignore error
      console.log('check_in column already nullable or does not exist');
    }

    try {
      await pool.query(`
        ALTER TABLE hr_ethiopian_attendance 
        ALTER COLUMN check_out DROP NOT NULL
      `);
    } catch (err) {
      // Column might already be nullable, ignore error
      console.log('check_out column already nullable or does not exist');
    }

    const results = [];
    let currentMonth = parseInt(startMonth);
    let currentDay = parseInt(startDay);
    let currentYear = parseInt(startYear);
    let daysProcessed = 0;

    // Helper function to get days in Ethiopian month
    const getDaysInMonth = (month) => {
      return month === 13 ? 5 : 30;
    };

    // Process each day
    while (daysProcessed < parseInt(numberOfDays)) {
      // Insert leave record for this day
      const result = await pool.query(
        `INSERT INTO hr_ethiopian_attendance 
         (staff_id, staff_name, department_name, ethiopian_year, ethiopian_month, ethiopian_day, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, 'LEAVE', $7)
         ON CONFLICT (staff_id, ethiopian_year, ethiopian_month, ethiopian_day) 
         DO UPDATE SET 
           status = 'LEAVE',
           notes = $7,
           updated_at = NOW()
         RETURNING *`,
        [staffId, staffName, departmentName, currentYear, currentMonth, currentDay, `Leave: ${reason}`]
      );

      results.push(result.rows[0]);
      daysProcessed++;

      // Move to next day
      currentDay++;
      const maxDays = getDaysInMonth(currentMonth);
      
      if (currentDay > maxDays) {
        currentDay = 1;
        currentMonth++;
        
        if (currentMonth > 13) {
          currentMonth = 1;
          currentYear++;
        }
      }
    }

    res.json({
      success: true,
      data: results,
      count: results.length,
      message: `Leave granted successfully for ${numberOfDays} day(s)`
    });
  } catch (error) {
    console.error('Error granting leave:', error);
    res.status(500).json({ error: 'Failed to grant leave', details: error.message });
  }
});

// Get leave records (staff with LEAVE status)
router.get('/leave-records', authenticateWithBranch, async (req, res) => {
  try {
    const { ethMonth, ethYear } = req.query;

    if (!ethMonth || !ethYear) {
      return res.status(400).json({ error: 'ethMonth and ethYear are required' });
    }

    console.log(`📋 Querying ALL leave records (registered and unregistered staff)`);
    console.log(`📅 Month: ${ethMonth}, Year: ${ethYear}`);

    // Get all leave records for the month - show ALL staff
    const result = await pool.query(`
      SELECT 
        staff_id,
        staff_name,
        department_name,
        COUNT(*) as total_days,
        MIN(ethiopian_day) as start_day,
        MAX(ethiopian_day) as end_day,
        MAX(notes) as leave_reason,
        MAX(created_at) as granted_at
      FROM hr_ethiopian_attendance
      WHERE ethiopian_month = $1 
        AND ethiopian_year = $2
        AND status = 'LEAVE'
      GROUP BY staff_id, staff_name, department_name
      ORDER BY staff_name
    `, [parseInt(ethMonth), parseInt(ethYear)]);

    console.log(`✅ Found ${result.rows.length} leave records`);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching leave records:', error);
    res.status(500).json({ error: 'Failed to fetch leave records', details: error.message });
  }
});

// Get approval statistics for current user
router.get('/approval-stats', authenticateWithBranch, async (req, res) => {
  try {
    const approvedBy = req.user.username || req.user.id;
    
    console.log('📊 Fetching approval stats for:', approvedBy);
    console.log('👤 User object:', req.user);

    // Get approval counts
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE permission_status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE permission_status = 'REJECTED') as rejected,
        COUNT(*) as total
      FROM hr_attendance_permissions
      WHERE approved_by = $1
    `, [approvedBy]);

    console.log('📈 Query result:', result.rows[0]);
    
    // Also get all records to see what's in the table
    const allRecords = await pool.query(`
      SELECT approved_by, permission_status, COUNT(*) as count
      FROM hr_attendance_permissions
      GROUP BY approved_by, permission_status
      ORDER BY approved_by, permission_status
    `);
    
    console.log('📋 All approval records:', allRecords.rows);

    res.json({
      success: true,
      data: result.rows[0] || { approved: 0, rejected: 0, total: 0 }
    });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ error: 'Failed to fetch approval stats', details: error.message });
  }
});

module.exports = router;
