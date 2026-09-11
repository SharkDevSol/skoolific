const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { getEthiopianDayOfWeek, getCurrentEthiopianDate } = require('../../utils/ethiopianCalendar');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Helper function to calculate week number from day
const getWeekNumber = (day) => {
  return Math.ceil(day / 7);
};

// Get all students from all class tables
const getAllStudents = async (className = null, studentType = null) => {
  try {
    // Get all class tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'classes_schema'
      ORDER BY table_name
    `);

    let allStudents = [];

    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      
      // Skip if className filter is provided and doesn't match
      if (className && tableName !== className) {
        continue;
      }

      // Check if is_active column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'classes_schema' 
          AND table_name = $1 
          AND column_name IN ('is_active', 'student_type', 'is_kg', 'is_evening_class')
      `, [tableName]);
      
      const hasIsActive = columnCheck.rows.some(row => row.column_name === 'is_active');
      const hasStudentType = columnCheck.rows.some(row => row.column_name === 'student_type');
      const hasIsKg = columnCheck.rows.some(row => row.column_name === 'is_kg');
      const hasIsEvening = columnCheck.rows.some(row => row.column_name === 'is_evening_class');

      let whereClause = hasIsActive ? 'WHERE (is_active = TRUE OR is_active IS NULL)' : 'WHERE 1=1';

      // Apply student type filter if provided
      if (studentType && studentType !== 'all') {
        if (hasStudentType) {
          whereClause += ` AND student_type = '${studentType}'`;
        } else if (hasIsKg && hasIsEvening) {
          // Fallback to individual columns
          if (studentType === 'kg') {
            whereClause += ` AND is_kg = TRUE AND is_evening_class = FALSE`;
          } else if (studentType === 'evening') {
            whereClause += ` AND is_evening_class = TRUE AND is_kg = FALSE`;
          } else if (studentType === 'kg_evening') {
            whereClause += ` AND is_kg = TRUE AND is_evening_class = TRUE`;
          } else if (studentType === 'regular') {
            whereClause += ` AND (is_kg = FALSE OR is_kg IS NULL) AND (is_evening_class = FALSE OR is_evening_class IS NULL)`;
          }
        }
      }

      // Build SELECT clause with optional columns
      let selectClause = `
        CAST(school_id AS VARCHAR) as student_id,
        CAST(class_id AS VARCHAR) as class_id,
        student_name,
        smachine_id,
        age,
        gender
      `;

      if (hasStudentType) {
        selectClause += `, student_type`;
      }
      if (hasIsKg) {
        selectClause += `, is_kg`;
      }
      if (hasIsEvening) {
        selectClause += `, is_evening_class`;
      }

      // Get students with all their details
      const studentsResult = await pool.query(`
        SELECT 
          ${selectClause},
          '${tableName}' as class_name
        FROM classes_schema."${tableName}"
        ${whereClause}
        ORDER BY student_name
      `);

      allStudents = allStudents.concat(studentsResult.rows);
    }

    return allStudents;
  } catch (error) {
    console.error('Error getting students:', error);
    throw error;
  }
};

// GET /api/academic/student-attendance/weekly
// Get weekly attendance for a specific week, year, and optional class
router.get('/weekly', async (req, res) => {
  try {
    const { week, year, month, class: className } = req.query;

    if (!week || !year || !month) {
      return res.status(400).json({ error: 'Week, year, and month are required' });
    }

    const weekNum = parseInt(week);
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    // Check if ethiopian_year column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'academic_student_attendance' 
        AND column_name IN ('ethiopian_year', 'ethiopian_month', 'week_number')
    `);
    
    const existingColumns = columnCheck.rows.map(r => r.column_name);
    const hasEthiopianColumns = existingColumns.includes('ethiopian_year');

    // Build query based on available columns
    let query, params;
    
    if (hasEthiopianColumns) {
      // Use Ethiopian calendar columns
      query = `
        SELECT * FROM academic_student_attendance
        WHERE ethiopian_year = $1 
          AND ethiopian_month = $2 
          AND week_number = $3
      `;
      params = [yearNum, monthNum, weekNum];
    } else {
      // Fallback: use date-based query
      // This is a temporary solution - ideally add the columns
      query = `
        SELECT * FROM academic_student_attendance
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      `;
      params = [];
    }

    if (className) {
      query += ` AND class_name = $${params.length + 1}`;
      params.push(className);
    }

    query += ` ORDER BY student_name, ethiopian_day`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching weekly attendance:', error);
    res.status(500).json({ error: 'Failed to fetch weekly attendance' });
  }
});

// POST /api/academic/student-attendance/check-in
// Create a check-in record for a student
router.post('/check-in', async (req, res) => {
  try {
    const {
      studentId,
      studentName,
      className,
      smachineId,
      ethYear,
      ethMonth,
      ethDay,
      checkInTime,
      status = 'PRESENT',
      notes = null
    } = req.body;

    if (!studentId || !studentName || !className || !ethYear || !ethMonth || !ethDay || !checkInTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const weekNumber = getWeekNumber(ethDay);
    const dayOfWeek = getEthiopianDayOfWeek(ethYear, ethMonth, ethDay);

    // Get shift assignment for this class
    let shiftNumber = 1;
    const shiftResult = await pool.query(
      'SELECT shift_number FROM academic_class_shift_assignment WHERE class_name = $1',
      [className]
    );
    
    if (shiftResult.rows.length > 0) {
      shiftNumber = shiftResult.rows[0].shift_number;
    }

    // Get shift-specific time settings and auto-calculate status
    const settingsResult = await pool.query(
      'SELECT shift1_late_threshold, shift2_late_threshold FROM academic_student_attendance_settings ORDER BY id DESC LIMIT 1'
    );

    let calculatedStatus = status;
    
    if (settingsResult.rows.length > 0) {
      const lateThreshold = shiftNumber === 2 
        ? settingsResult.rows[0].shift2_late_threshold 
        : settingsResult.rows[0].shift1_late_threshold;
      
      const checkInTimeOnly = checkInTime.substring(0, 5); // HH:MM
      const lateThresholdOnly = lateThreshold.substring(0, 5); // HH:MM
      
      if (checkInTimeOnly > lateThresholdOnly) {
        calculatedStatus = 'LATE';
      } else {
        calculatedStatus = 'PRESENT';
      }
    }

    // Insert or update attendance record
    const result = await pool.query(`
      INSERT INTO academic_student_attendance (
        student_id, student_name, class_name, smachine_id,
        ethiopian_year, ethiopian_month, ethiopian_day,
        day_of_week, week_number, check_in_time, status, notes, shift_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (student_id, class_name, ethiopian_year, ethiopian_month, ethiopian_day)
      DO UPDATE SET
        check_in_time = EXCLUDED.check_in_time,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        shift_number = EXCLUDED.shift_number,
        updated_at = NOW()
      RETURNING *
    `, [
      studentId, studentName, className, smachineId,
      ethYear, ethMonth, ethDay,
      dayOfWeek, weekNumber, checkInTime, calculatedStatus, notes, shiftNumber
    ]);

    res.json({
      success: true,
      message: 'Check-in recorded successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error recording check-in:', error);
    res.status(500).json({ error: 'Failed to record check-in' });
  }
});

// GET /api/academic/student-attendance/summary
// Get weekly summary statistics
router.get('/summary', async (req, res) => {
  try {
    const { week, year, month, class: className } = req.query;

    if (!week || !year || !month) {
      return res.status(400).json({ error: 'Week, year, and month are required' });
    }

    const weekNum = parseInt(week);
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    let query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM academic_student_attendance
      WHERE ethiopian_year = $1 
        AND ethiopian_month = $2 
        AND week_number = $3
    `;
    
    const params = [yearNum, monthNum, weekNum];

    if (className) {
      query += ` AND class_name = $4`;
      params.push(className);
    }

    query += ` GROUP BY status`;

    const result = await pool.query(query, params);

    // Format the response
    const summary = {
      present: 0,
      absent: 0,
      leave: 0,
      total: 0
    };

    result.rows.forEach(row => {
      const status = row.status.toLowerCase();
      const count = parseInt(row.count);
      
      if (status === 'present') summary.present = count;
      else if (status === 'absent') summary.absent = count;
      else if (status === 'leave') summary.leave = count;
      
      summary.total += count;
    });

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/academic/student-attendance/students
// Get all students for a specific class or all classes
router.get('/students', async (req, res) => {
  try {
    const { class: className, studentType } = req.query;

    const students = await getAllStudents(className, studentType);

    res.json({
      success: true,
      data: students
    });

  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/academic/student-attendance/classes
// Get all available classes
router.get('/classes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'classes_schema'
      ORDER BY table_name
    `);

    const classes = result.rows.map(row => row.table_name);

    res.json({
      success: true,
      data: classes
    });

  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// GET /api/academic/student-attendance/current-date
// Get current Ethiopian date
router.get('/current-date', async (req, res) => {
  try {
    const currentDate = getCurrentEthiopianDate();
    
    res.json({
      success: true,
      data: {
        year: currentDate.year,
        month: currentDate.month,
        day: currentDate.day,
        weekNumber: getWeekNumber(currentDate.day)
      }
    });

  } catch (error) {
    console.error('Error getting current date:', error);
    res.status(500).json({ error: 'Failed to get current date' });
  }
});

// GET /api/academic/student-attendance/day-of-week
// Get day of week for a specific Ethiopian date
router.get('/day-of-week', async (req, res) => {
  try {
    const { year, month, day } = req.query;
    
    if (!year || !month || !day) {
      return res.status(400).json({ error: 'Year, month, and day are required' });
    }

    const dayOfWeek = getEthiopianDayOfWeek(
      parseInt(year),
      parseInt(month),
      parseInt(day)
    );

    res.json({
      success: true,
      data: {
        year: parseInt(year),
        month: parseInt(month),
        day: parseInt(day),
        dayOfWeek
      }
    });

  } catch (error) {
    console.error('Error getting day of week:', error);
    res.status(500).json({ error: 'Failed to get day of week' });
  }
});

// GET /api/academic/student-attendance/generate-weeks
// Generate all school weeks for a year (OPTIMIZED - runs on backend)
router.get('/generate-weeks', async (req, res) => {
  try {
    const { year, schoolDays } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year is required' });
    }

    const yearNum = parseInt(year);
    const daysArray = schoolDays ? schoolDays.split(',') : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    console.log(`Generating school weeks for year ${yearNum} with school days:`, daysArray);
    
    const weeks = [];
    let currentMonth = 1;
    let currentDay = 1;
    let weekNumber = 1;
    let daysChecked = 0;
    const maxDays = 365;

    while (daysChecked < maxDays && weekNumber <= 52) {
      // Get day of week for current date
      const dayOfWeek = getEthiopianDayOfWeek(yearNum, currentMonth, currentDay);

      if (dayOfWeek === 'Monday') {
        // Found a Monday! Build a school week from here
        const weekDays = [];
        let tempMonth = currentMonth;
        let tempDay = currentDay;
        let schoolDaysCollected = 0;
        let daysScanned = 0;

        while (schoolDaysCollected < daysArray.length && daysScanned < 14) {
          const dow = getEthiopianDayOfWeek(yearNum, tempMonth, tempDay);
          
          if (daysArray.includes(dow)) {
            weekDays.push({
              year: yearNum,
              month: tempMonth,
              day: tempDay,
              dayOfWeek: dow
            });
            schoolDaysCollected++;
          }

          // Move to next day
          tempDay++;
          daysScanned++;
          const daysInMonth = tempMonth === 13 ? 5 : 30;
          if (tempDay > daysInMonth) {
            tempDay = 1;
            tempMonth++;
            if (tempMonth > 13) {
              break; // Stop at year boundary
            }
          }
        }

        if (weekDays.length > 0) {
          const firstDay = weekDays[0];
          const lastDay = weekDays[weekDays.length - 1];
          
          weeks.push({
            id: `week-${weekNumber}`,
            weekNumber,
            label: `${firstDay.day}/${firstDay.month} - ${lastDay.day}/${lastDay.month}`,
            days: weekDays
          });
          
          weekNumber++;
        }

        // Jump ahead by approximately 7 days to find next Monday
        currentDay += 7;
      } else {
        currentDay++;
      }

      // Handle month/year transitions
      const daysInMonth = currentMonth === 13 ? 5 : 30;
      if (currentDay > daysInMonth) {
        currentDay -= daysInMonth;
        currentMonth++;
        if (currentMonth > 13) {
          break; // Stop at year boundary
        }
      }

      daysChecked++;
    }

    console.log(`Generated ${weeks.length} school weeks for year ${yearNum}`);

    // Find current week
    const cDate = getCurrentEthiopianDate();
    let currentWeekId = null;
    for (const w of weeks) {
      const match = w.days.some(d => d.year === cDate.year && d.month === cDate.month && d.day === cDate.day);
      if (match) { currentWeekId = w.id; break; }
    }
    // If exact match not found, find the week that contains the current date range
    if (!currentWeekId) {
      const dayNum = (cDate.month - 1) * 30 + cDate.day;
      for (const w of weeks) {
        const firstDayNum = (w.days[0].month - 1) * 30 + w.days[0].day;
        const lastDayNum = (w.days[w.days.length - 1].month - 1) * 30 + w.days[w.days.length - 1].day;
        if (dayNum >= firstDayNum && dayNum <= lastDayNum + 2) {
          currentWeekId = w.id; break;
        }
      }
    }

    res.json({
      success: true,
      data: {
        year: yearNum,
        weeks,
        totalWeeks: weeks.length,
        currentWeekId
      }
    });

  } catch (error) {
    console.error('Error generating weeks:', error);
    res.status(500).json({ error: 'Failed to generate weeks' });
  }
});

// POST /api/academic/student-attendance/mark-absent
// Manually trigger auto-absent marker
router.post('/mark-absent', async (req, res) => {
  try {
    const { markAbsentStudents } = require('../../services/studentAttendanceAutoMarker');
    
    const result = await markAbsentStudents();
    
    res.json(result);

  } catch (error) {
    console.error('Error running auto-marker:', error);
    res.status(500).json({ error: 'Failed to run auto-marker' });
  }
});

// GET /api/academic/student-attendance/settings
// Get attendance time settings
// GET /api/academic/student-attendance/settings
// Get attendance settings - merges with Task 1 school_config
router.get('/settings', async (req, res) => {
  try {
    // Try to get settings from attendance_settings table
    let result = await pool.query('SELECT * FROM academic_student_attendance_settings ORDER BY id DESC LIMIT 1');
    let settings = result.rows[0] || {};
    
    // Merge with Task 1 school_config for shift and school days data
    try {
      const configResult = await pool.query('SELECT total_shifts, school_days, periods_per_shift, period_duration, shift_rotation, has_kg, has_evening_class FROM schedule_schema.school_config WHERE id = 1');
      if (configResult.rows.length > 0) {
        const task1 = configResult.rows[0];
        // Override with Task 1 data
        settings.total_shifts = task1.total_shifts;
        settings.school_days = task1.school_days || settings.school_days;
        settings.periods_per_shift = task1.periods_per_shift;
        settings.period_duration = task1.period_duration;
        settings.shift_rotation = task1.shift_rotation;
      }
    } catch(e) { /* task1 config may not exist yet */ }

    // Set defaults for missing fields
    if (!settings.check_in_start_time) settings.check_in_start_time = '07:00:00';
    if (!settings.check_in_end_time) settings.check_in_end_time = '08:30:00';
    if (!settings.late_threshold_time) settings.late_threshold_time = '08:00:00';
    if (!settings.absent_marking_time) settings.absent_marking_time = '09:00:00';
    if (!settings.shift1_check_in_start) settings.shift1_check_in_start = '07:00:00';
    if (!settings.shift1_check_in_end) settings.shift1_check_in_end = '08:30:00';
    if (!settings.shift1_late_threshold) settings.shift1_late_threshold = '08:00:00';
    if (!settings.shift1_absent_marking) settings.shift1_absent_marking = '09:00:00';
    if (!settings.shift2_check_in_start) settings.shift2_check_in_start = '13:00:00';
    if (!settings.shift2_check_in_end) settings.shift2_check_in_end = '14:30:00';
    if (!settings.shift2_late_threshold) settings.shift2_late_threshold = '14:00:00';
    if (!settings.shift2_absent_marking) settings.shift2_absent_marking = '15:00:00';
    if (!settings.auto_absent_enabled) settings.auto_absent_enabled = true;
    if (!settings.school_days || !Array.isArray(settings.school_days)) settings.school_days = [1,2,3,4,5];

    // Convert numeric school_days to day names if needed
    if (settings.school_days.length > 0 && typeof settings.school_days[0] === 'number') {
      const dayNames = ['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      settings.school_days = settings.school_days.map(d => dayNames[d] || d);
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/academic/student-attendance/settings
// Update attendance time settings
router.put('/settings', async (req, res) => {
  try {
    const {
      check_in_start_time,
      check_in_end_time,
      late_threshold_time,
      absent_marking_time,
      shift1_check_in_start,
      shift1_check_in_end,
      shift1_late_threshold,
      shift1_absent_marking,
      shift2_check_in_start,
      shift2_check_in_end,
      shift2_late_threshold,
      shift2_absent_marking,
      school_days,
      auto_absent_enabled
    } = req.body;

    const result = await pool.query(`
      UPDATE academic_student_attendance_settings
      SET 
        check_in_start_time = $1,
        check_in_end_time = $2,
        late_threshold_time = $3,
        absent_marking_time = $4,
        shift1_check_in_start = $5,
        shift1_check_in_end = $6,
        shift1_late_threshold = $7,
        shift1_absent_marking = $8,
        shift2_check_in_start = $9,
        shift2_check_in_end = $10,
        shift2_late_threshold = $11,
        shift2_absent_marking = $12,
        school_days = $13,
        auto_absent_enabled = $14,
        updated_at = NOW()
      WHERE id = (SELECT id FROM academic_student_attendance_settings ORDER BY id DESC LIMIT 1)
      RETURNING *
    `, [
      check_in_start_time,
      check_in_end_time,
      late_threshold_time,
      absent_marking_time,
      shift1_check_in_start,
      shift1_check_in_end,
      shift1_late_threshold,
      shift1_absent_marking,
      shift2_check_in_start,
      shift2_check_in_end,
      shift2_late_threshold,
      shift2_absent_marking,
      school_days,
      auto_absent_enabled
    ]);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PUT /api/academic/student-attendance/update
// Update attendance record manually
router.put('/update', async (req, res) => {
  try {
    const {
      studentId,
      className,
      ethYear,
      ethMonth,
      ethDay,
      status,
      checkInTime,
      notes
    } = req.body;

    if (!studentId || !className || !ethYear || !ethMonth || !ethDay || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get shift assignment for this class
    let shiftNumber = 1;
    const shiftResult = await pool.query(
      'SELECT shift_number FROM academic_class_shift_assignment WHERE class_name = $1',
      [className]
    );
    
    if (shiftResult.rows.length > 0) {
      shiftNumber = shiftResult.rows[0].shift_number;
    }

    // Get shift-specific time settings
    const settingsResult = await pool.query(
      'SELECT shift1_late_threshold, shift2_late_threshold FROM academic_student_attendance_settings ORDER BY id DESC LIMIT 1'
    );

    // Auto-calculate correct status based on check-in time and shift
    // Only auto-correct PRESENT→LATE, never override user's explicit LATE/ABSENT choice
    let calculatedStatus = status;
    
    if (status === 'PRESENT' && checkInTime && settingsResult.rows.length > 0) {
      const lateThreshold = shiftNumber === 2 
        ? settingsResult.rows[0].shift2_late_threshold 
        : settingsResult.rows[0].shift1_late_threshold;
      
      const checkInTimeOnly = checkInTime.substring(0, 5); // HH:MM
      const lateThresholdOnly = lateThreshold.substring(0, 5); // HH:MM
      
      if (checkInTimeOnly > lateThresholdOnly) {
        calculatedStatus = 'LATE';
        console.log(`Auto-corrected status to LATE: check-in ${checkInTimeOnly} > threshold ${lateThresholdOnly} (Shift ${shiftNumber})`);
      } else {
        calculatedStatus = 'PRESENT';
        console.log(`Status confirmed as PRESENT: check-in ${checkInTimeOnly} <= threshold ${lateThresholdOnly} (Shift ${shiftNumber})`);
      }
    }

    // Check if record exists
    const existingRecord = await pool.query(`
      SELECT * FROM academic_student_attendance
      WHERE student_id = $1 
        AND class_name = $2 
        AND ethiopian_year = $3 
        AND ethiopian_month = $4 
        AND ethiopian_day = $5
    `, [studentId, className, ethYear, ethMonth, ethDay]);

    let result;

    if (existingRecord.rows.length > 0) {
      // Update existing record
      result = await pool.query(`
        UPDATE academic_student_attendance
        SET 
          status = $1,
          check_in_time = $2,
          notes = $3,
          shift_number = $4,
          updated_at = NOW()
        WHERE student_id = $5 
          AND class_name = $6 
          AND ethiopian_year = $7 
          AND ethiopian_month = $8 
          AND ethiopian_day = $9
        RETURNING *
      `, [calculatedStatus, checkInTime, notes, shiftNumber, studentId, className, ethYear, ethMonth, ethDay]);
    } else {
      // Create new record
      const weekNumber = getWeekNumber(ethDay);
      const dayOfWeek = getEthiopianDayOfWeek(ethYear, ethMonth, ethDay);

      // Get student details
      const studentResult = await pool.query(`
        SELECT student_name, smachine_id
        FROM classes_schema."${className}"
        WHERE CAST(school_id AS VARCHAR) = $1
          AND (is_active = TRUE OR is_active IS NULL)
      `, [studentId]);

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = studentResult.rows[0];

      result = await pool.query(`
        INSERT INTO academic_student_attendance (
          student_id, student_name, class_name, smachine_id,
          ethiopian_year, ethiopian_month, ethiopian_day,
          day_of_week, week_number, check_in_time, status, notes, shift_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        studentId, student.student_name, className, student.smachine_id,
        ethYear, ethMonth, ethDay,
        dayOfWeek, weekNumber, checkInTime, calculatedStatus, notes, shiftNumber
      ]);
    }

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// GET /api/academic/student-attendance/class-shifts
// Get class shift assignments from Task 2's class_configs
router.get('/class-shifts', async (req, res) => {
  try {
    const ccResult = await pool.query(`SELECT class_configs FROM school_schema_points.classes WHERE id = 1`).catch(() => ({ rows: [] }));
    const classShifts = {};
    if (ccResult.rows.length > 0 && ccResult.rows[0].class_configs) {
      const configs = ccResult.rows[0].class_configs;
      for (const [className, cfg] of Object.entries(configs)) {
        classShifts[className] = { shift_number: cfg.shift || 1, isKG: cfg.isKG || false, isEvening: cfg.isEvening || false };
      }
    }
    // Also get legacy assignments for classes not in Task 2
    const legacyResult = await pool.query('SELECT class_name, shift_number FROM academic_class_shift_assignment').catch(() => ({ rows: [] }));
    for (const row of legacyResult.rows) {
      if (!classShifts[row.class_name]) {
        classShifts[row.class_name] = { shift_number: row.shift_number, isKG: false, isEvening: false };
      }
    }
    res.json({ success: true, data: classShifts });
  } catch (error) {
    console.error('Error fetching class shifts:', error);
    res.json({ success: true, data: {} });
  }
});

// PUT /api/academic/student-attendance/class-shifts
// DEPRECATED — class shifts now managed in Task 2 (Create Student Registration Form)
router.put('/class-shifts', async (req, res) => {
  const { assignments } = req.body;
  if (!assignments || typeof assignments !== 'object') {
    return res.status(400).json({ error: 'Invalid assignments data' });
  }
  // Still save to legacy table for backward compatibility
  try {
    for (const [className, shiftNumber] of Object.entries(assignments)) {
      await pool.query(`
        INSERT INTO academic_class_shift_assignment (class_name, shift_number, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (class_name) 
        DO UPDATE SET shift_number = $2, updated_at = NOW()
      `, [className, shiftNumber]).catch(() => {});
    }
  } catch(e) {}
  res.json({ success: true, message: 'Class shifts saved. Note: shifts are now managed in Task 2.' });
});

// PUT /api/academic/student-attendance/class-configs
// Update Task 2 class_configs (school_schema_points.classes.class_configs) — source of truth for class shifts
router.put('/class-configs', async (req, res) => {
  const { classConfigs } = req.body;
  if (!classConfigs || typeof classConfigs !== 'object') {
    return res.status(400).json({ error: 'Invalid classConfigs data' });
  }
  try {
    const existing = await pool.query(`SELECT class_configs FROM school_schema_points.classes WHERE id = 1`).catch(() => ({ rows: [] }));
    const merged = {};
    if (existing.rows.length > 0 && existing.rows[0].class_configs) {
      Object.assign(merged, existing.rows[0].class_configs);
    }
    for (const [className, cfg] of Object.entries(classConfigs)) {
      const prev = merged[className] || {};
      merged[className] = {
        shift: cfg.shift !== undefined ? Number(cfg.shift) : (prev.shift || 1),
        isKG: cfg.isKG !== undefined ? Boolean(cfg.isKG) : (prev.isKG || false),
        isEvening: cfg.isEvening !== undefined ? Boolean(cfg.isEvening) : (prev.isEvening || false)
      };
    }
    await pool.query(`
      INSERT INTO school_schema_points.classes (id, class_count, class_names, custom_fields, class_configs)
      VALUES (1, COALESCE((SELECT class_count FROM school_schema_points.classes WHERE id = 1), 0),
              COALESCE((SELECT class_names FROM school_schema_points.classes WHERE id = 1), '{}'),
              COALESCE((SELECT custom_fields FROM school_schema_points.classes WHERE id = 1), '[]'::jsonb),
              $1::jsonb)
      ON CONFLICT (id) DO UPDATE SET class_configs = EXCLUDED.class_configs
    `, [JSON.stringify(merged)]);

    // Mirror to legacy table for backward compatibility
    try {
      for (const [className, cfg] of Object.entries(merged)) {
        await pool.query(`
          INSERT INTO academic_class_shift_assignment (class_name, shift_number, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (class_name)
          DO UPDATE SET shift_number = $2, updated_at = NOW()
        `, [className, cfg.shift || 1]).catch(() => {});
      }
    } catch(e) {}

    res.json({ success: true, message: 'Class configurations updated successfully', data: merged });
  } catch (error) {
    console.error('Error updating class configs:', error);
    res.status(500).json({ error: 'Failed to update class configs' });
  }
});

module.exports = router;
