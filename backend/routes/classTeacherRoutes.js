const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Initialize class_teachers table with enhanced resilience
const initializeClassTeachersTable = async () => {
  try {
    console.log('🔧 Initializing class_teachers table...');
    
    await pool.query('CREATE SCHEMA IF NOT EXISTS school_schema_points');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_schema_points.class_teachers (
        id SERIAL PRIMARY KEY,
        global_staff_id INTEGER NOT NULL,
        teacher_name VARCHAR(100) NOT NULL,
        assigned_class VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(assigned_class)
      )
    `);
    
    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_class_teachers_staff_id 
      ON school_schema_points.class_teachers(global_staff_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_class_teachers_class 
      ON school_schema_points.class_teachers(assigned_class)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_class_teachers_active 
      ON school_schema_points.class_teachers(is_active)
    `);
    
    console.log('✅ Class teachers table initialized successfully');
  } catch (e) {
    console.error('❌ Class teachers table init error:', e.message);
  }
};

initializeClassTeachersTable().catch(err => console.error('Init error:', err));

// Get all teachers (for dropdown selection)
router.get('/teachers', async (req, res) => {
  try {
    console.log('📥 GET /api/class-teacher/teachers - Fetching teachers...');
    
    // Check if teachers table exists in staff_teachers schema
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'staff_teachers' 
        AND table_name = 'teachers'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️  Teachers table not found in staff_teachers schema');
      return res.json([]);
    }
    
    // Check if is_active column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'staff_teachers' 
        AND table_name = 'teachers' 
        AND column_name = 'is_active'
    `);
    
    const hasIsActive = columnCheck.rows.length > 0;
    
    // Build query with optional is_active filter
    let query = `
      SELECT global_staff_id, name as teacher_name, staff_work_time, role
      FROM staff_teachers.teachers
    `;
    
    if (hasIsActive) {
      query += ' WHERE (is_active = TRUE OR is_active IS NULL)';
    }
    
    query += ' ORDER BY name ASC';
    
    const result = await pool.query(query);
    
    console.log(`✅ Found ${result.rows.length} teacher(s)`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching teachers:', error);
    res.status(500).json({ error: 'Failed to fetch teachers', details: error.message });
  }
});

// Get all classes (for dropdown selection)
router.get('/classes', async (req, res) => {
  try {
    console.log('📥 GET /api/class-teacher/classes - Fetching classes...');
    
    // Check if classes table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'school_schema_points' 
        AND table_name = 'classes'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️  Classes table not found');
      return res.json([]);
    }
    
    const result = await pool.query(`
      SELECT class_names FROM school_schema_points.classes WHERE id = 1
    `);
    
    if (result.rows.length > 0 && result.rows[0].class_names) {
      console.log(`✅ Found ${result.rows[0].class_names.length} class(es)`);
      res.json(result.rows[0].class_names);
    } else {
      console.log('⚠️  No classes defined yet');
      res.json([]);
    }
  } catch (error) {
    console.error('❌ Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes', details: error.message });
  }
});

// Get all class teacher assignments
router.get('/assignments', async (req, res) => {
  try {
    console.log('📥 GET /api/class-teacher/assignments - Fetching assignments...');
    
    // Ensure table exists
    await pool.query('CREATE SCHEMA IF NOT EXISTS school_schema_points');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_schema_points.class_teachers (
        id SERIAL PRIMARY KEY,
        global_staff_id INTEGER NOT NULL,
        teacher_name VARCHAR(100) NOT NULL,
        assigned_class VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(assigned_class)
      )
    `);
    
    const result = await pool.query(`
      SELECT ct.*, t.staff_work_time
      FROM school_schema_points.class_teachers ct
      LEFT JOIN staff_teachers.teachers t ON ct.global_staff_id = t.global_staff_id
      WHERE ct.is_active = true
      ORDER BY ct.assigned_class ASC
    `);
    
    console.log(`✅ Found ${result.rows.length} active assignment(s)`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
  }
});

// Assign a teacher to a class
router.post('/assign', async (req, res) => {
  const { global_staff_id, teacher_name, assigned_class } = req.body;

  console.log('📥 POST /api/class-teacher/assign - Assigning teacher...');
  console.log(`   Teacher: ${teacher_name} (ID: ${global_staff_id})`);
  console.log(`   Class: ${assigned_class}`);

  if (!global_staff_id || !teacher_name || !assigned_class) {
    return res.status(400).json({ error: 'global_staff_id, teacher_name, and assigned_class are required' });
  }

  try {
    // Ensure table exists
    await pool.query('CREATE SCHEMA IF NOT EXISTS school_schema_points');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_schema_points.class_teachers (
        id SERIAL PRIMARY KEY,
        global_staff_id INTEGER NOT NULL,
        teacher_name VARCHAR(100) NOT NULL,
        assigned_class VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(assigned_class)
      )
    `);
    
    // Check if class already has a teacher assigned
    const existing = await pool.query(`
      SELECT * FROM school_schema_points.class_teachers 
      WHERE assigned_class = $1 AND is_active = true
    `, [assigned_class]);

    if (existing.rows.length > 0) {
      console.log(`   ✏️  Updating existing assignment (was: ${existing.rows[0].teacher_name})`);
      // Update existing assignment
      await pool.query(`
        UPDATE school_schema_points.class_teachers 
        SET global_staff_id = $1, teacher_name = $2, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE assigned_class = $3 AND is_active = true
      `, [global_staff_id, teacher_name, assigned_class]);
    } else {
      console.log('   ➕ Creating new assignment');
      // Create new assignment
      await pool.query(`
        INSERT INTO school_schema_points.class_teachers 
        (global_staff_id, teacher_name, assigned_class)
        VALUES ($1, $2, $3)
      `, [global_staff_id, teacher_name, assigned_class]);
    }

    console.log(`✅ ${teacher_name} successfully assigned to ${assigned_class}`);
    res.json({ success: true, message: `${teacher_name} assigned to ${assigned_class}` });
  } catch (error) {
    console.error('❌ Error assigning teacher:', error);
    res.status(500).json({ error: 'Failed to assign teacher', details: error.message });
  }
});

// Remove a class teacher assignment
router.delete('/unassign/:className', async (req, res) => {
  const { className } = req.params;

  try {
    await pool.query(`
      UPDATE school_schema_points.class_teachers 
      SET is_active = false
      WHERE assigned_class = $1
    `, [className]);

    res.json({ success: true, message: `Teacher unassigned from ${className}` });
  } catch (error) {
    console.error('Error unassigning teacher:', error);
    res.status(500).json({ error: 'Failed to unassign teacher', details: error.message });
  }
});

// Check if a teacher is assigned as class teacher (for staff app)
router.get('/check/:globalStaffId', async (req, res) => {
  const { globalStaffId } = req.params;

  try {
    const result = await pool.query(`
      SELECT * FROM school_schema_points.class_teachers 
      WHERE global_staff_id = $1 AND is_active = true
    `, [globalStaffId]);

    if (result.rows.length > 0) {
      res.json({
        isClassTeacher: true,
        assignedClass: result.rows[0].assigned_class,
        assignment: result.rows[0]
      });
    } else {
      res.json({
        isClassTeacher: false,
        assignedClass: null,
        assignment: null
      });
    }
  } catch (error) {
    console.error('Error checking class teacher:', error);
    res.status(500).json({ error: 'Failed to check class teacher status', details: error.message });
  }
});

// Get assignments by teacher name
router.get('/teacher-assignment/:teacherName', async (req, res) => {
  const { teacherName } = req.params;

  try {
    console.log(`📥 GET /api/class-teacher/teacher-assignment/${teacherName}`);
    
    const result = await pool.query(`
      SELECT * FROM school_schema_points.class_teachers 
      WHERE teacher_name = $1 AND is_active = true
      ORDER BY assigned_class ASC
    `, [teacherName]);

    console.log(`✅ Found ${result.rows.length} assignment(s) for ${teacherName}`);
    
    res.json({
      teacherName: teacherName,
      assignments: result.rows
    });
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
    res.status(500).json({ error: 'Failed to fetch teacher assignments', details: error.message });
  }
});

// Get students for a class (for attendance marking)
router.get('/students/:className', async (req, res) => {
  const { className } = req.params;
  
  try {
    console.log(`📥 GET /api/class-teacher/students/${className} - Fetching students...`);
    
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      console.error(`❌ Invalid class name: ${className}`);
      return res.status(400).json({ error: 'Invalid class name provided.' });
    }

    // Try to query the table
    try {
      // First check if is_active column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'classes_schema' 
        AND table_name = $1 
        AND column_name = 'is_active'
      `, [className]);
      
      const hasIsActive = columnCheck.rows.length > 0;
      
      // Build query based on column existence
      let query = `
        SELECT school_id, class_id, student_name, age, gender, image_student
        FROM classes_schema."${className}"
      `;
      
      if (hasIsActive) {
        query += ' WHERE is_active = TRUE OR is_active IS NULL';
      }
      
      query += ' ORDER BY LOWER(student_name) ASC';
      
      const result = await pool.query(query);
      
      console.log(`✅ Found ${result.rows.length} students in ${className}`);
      res.json(result.rows);
    } catch (tableError) {
      // Table might not exist or have different name
      console.error(`❌ Error querying table ${className}:`, tableError.message);
      
      // Try to find similar table names
      const similarTables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'classes_schema' 
        AND LOWER(table_name) = LOWER($1)
      `, [className]);
      
      if (similarTables.rows.length > 0) {
        const actualTableName = similarTables.rows[0].table_name;
        console.log(`💡 Found similar table: ${actualTableName}`);
        
        // Check if is_active column exists in the actual table
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
          AND table_name = $1 
          AND column_name = 'is_active'
        `, [actualTableName]);
        
        const hasIsActive = columnCheck.rows.length > 0;
        
        let query = `
          SELECT school_id, class_id, student_name, age, gender, image_student
          FROM classes_schema."${actualTableName}"
        `;
        
        if (hasIsActive) {
          query += ' WHERE is_active = TRUE OR is_active IS NULL';
        }
        
        query += ' ORDER BY LOWER(student_name) ASC';
        
        const result = await pool.query(query);
        
        console.log(`✅ Found ${result.rows.length} students in ${actualTableName}`);
        return res.json(result.rows);
      }
      
      // If still not found, return empty array
      console.log(`⚠️  No table found for class: ${className}`);
      return res.json([]);
    }
  } catch (error) {
    console.error(`❌ Error fetching students for ${className}:`, error);
    res.status(500).json({ error: 'Failed to fetch students', details: error.message });
  }
});

// Helper function to get Monday of a week
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

// Helper function to format date as YYYY-MM-DD
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

// Get school days from schedule config
router.get('/school-days', async (req, res) => {
  try {
    // First try to get from attendance settings (primary source)
    try {
      const attendanceResult = await pool.query(`
        SELECT school_days FROM academic_student_attendance_settings 
        ORDER BY id DESC LIMIT 1
      `);
      
      if (attendanceResult.rows.length > 0 && attendanceResult.rows[0].school_days) {
        // school_days is stored as string array like ['Monday', 'Tuesday', ...]
        const schoolDays = attendanceResult.rows[0].school_days.map(d => d.toLowerCase());
        const dayMap = { 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7 };
        const schoolDaysNumbers = schoolDays.map(d => dayMap[d]);
        return res.json({ schoolDays, schoolDaysNumbers });
      }
    } catch (attendanceError) {
      console.log('Attendance settings table not found or error, falling back to schedule config:', attendanceError.message);
    }
    
    // Fallback to schedule config
    const result = await pool.query(`
      SELECT school_days FROM schedule_schema.school_config WHERE id = 1
    `);
    
    if (result.rows.length > 0 && result.rows[0].school_days) {
      // school_days is stored as integer array (1=Monday, 2=Tuesday, etc.)
      const dayMap = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday', 7: 'sunday' };
      const schoolDays = result.rows[0].school_days.map(d => dayMap[d]);
      res.json({ schoolDays, schoolDaysNumbers: result.rows[0].school_days });
    } else {
      // Default to Monday-Friday
      res.json({ 
        schoolDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        schoolDaysNumbers: [1, 2, 3, 4, 5]
      });
    }
  } catch (error) {
    console.error('Error fetching school days:', error);
    // Return default on error
    res.json({ 
      schoolDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      schoolDaysNumbers: [1, 2, 3, 4, 5]
    });
  }
});

// Get weekly attendance tables for a class
router.get('/weekly-tables/:className', async (req, res) => {
  const { className } = req.params;
  
  try {
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ error: 'Invalid class name provided.' });
    }

    const schemaName = `class_${className}_weekly_attendance`;
    
    // Check if schema exists
    const schemaExists = await pool.query(`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
    `, [schemaName]);

    if (schemaExists.rows.length === 0) {
      return res.json([]);
    }

    // Get all weekly attendance tables
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name DESC
    `, [schemaName]);

    res.json(result.rows.map(r => r.table_name));
  } catch (error) {
    console.error('Error fetching weekly tables:', error);
    res.status(500).json({ error: 'Failed to fetch weekly tables', details: error.message });
  }
});

// Create a new weekly attendance record
router.post('/create-weekly-attendance', async (req, res) => {
  const { className, weekStart, globalStaffId } = req.body;

  if (!className || !weekStart || !globalStaffId) {
    return res.status(400).json({ error: 'className, weekStart, and globalStaffId are required' });
  }

  // Verify teacher is assigned to this class
  const assignment = await pool.query(`
    SELECT * FROM school_schema_points.class_teachers 
    WHERE global_staff_id = $1 AND assigned_class = $2 AND is_active = true
  `, [globalStaffId, className]);

  if (assignment.rows.length === 0) {
    return res.status(403).json({ error: 'You are not authorized to create attendance for this class' });
  }

  const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
  if (!validTableName) {
    return res.status(400).json({ error: 'Invalid class name provided.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `class_${className}_weekly_attendance`;
    const tableName = `week_${weekStart.replace(/-/g, '_')}`;
    
    // Create schema if not exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Check if table already exists
    const tableExists = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
    `, [schemaName, tableName]);

    if (tableExists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Attendance for week starting ${weekStart} already exists` });
    }

    // Create weekly attendance table
    await client.query(`
      CREATE TABLE "${schemaName}"."${tableName}" (
        id SERIAL PRIMARY KEY,
        school_id VARCHAR(50) NOT NULL,
        class_id VARCHAR(50) NOT NULL,
        student_name VARCHAR(100) NOT NULL,
        monday VARCHAR(1),
        tuesday VARCHAR(1),
        wednesday VARCHAR(1),
        thursday VARCHAR(1),
        friday VARCHAR(1),
        saturday VARCHAR(1),
        sunday VARCHAR(1),
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_student_${tableName} UNIQUE (school_id, class_id)
      )
    `);

    // Check if is_active column exists in this class table
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'classes_schema' AND table_name = $1 AND column_name = 'is_active'
    `, [className]);
    const hasIsActive = colCheck.rows.length > 0;

    // Fetch students and populate the table - filter out students with null IDs
    const studentsResult = await client.query(`
      SELECT school_id, class_id, student_name
      FROM classes_schema."${className}"
      WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND student_name IS NOT NULL
        ${hasIsActive ? "AND (is_active = TRUE OR is_active IS NULL)" : ""}
      ORDER BY LOWER(student_name) ASC
    `);

    if (studentsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid students found in this class (students must have school_id, class_id, and name)' });
    }

    // Insert students into the weekly attendance table
    let insertedCount = 0;
    for (const student of studentsResult.rows) {
      // Double-check values are not null/undefined
      if (student.school_id && student.class_id && student.student_name) {
        await client.query(`
          INSERT INTO "${schemaName}"."${tableName}" 
          (school_id, class_id, student_name, created_by)
          VALUES ($1, $2, $3, $4)
        `, [
          String(student.school_id), 
          String(student.class_id), 
          String(student.student_name), 
          assignment.rows[0].teacher_name
        ]);
        insertedCount++;
      }
    }

    if (insertedCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid students could be added to attendance' });
    }

    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: `Weekly attendance created for ${className} starting ${weekStart}`,
      tableName 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating weekly attendance:', error);
    res.status(500).json({ error: 'Failed to create weekly attendance', details: error.message });
  } finally {
    client.release();
  }
});

// Get weekly attendance data
router.get('/weekly-attendance/:className/:weekStart', async (req, res) => {
  const { className, weekStart } = req.params;
  
  try {
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ error: 'Invalid class name provided.' });
    }

    const schemaName = `class_${className}_weekly_attendance`;
    const tableName = `week_${weekStart.replace(/-/g, '_')}`;
    
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
    `, [schemaName, tableName]);

    if (tableExists.rows.length === 0) {
      return res.json({ exists: false, data: [] });
    }

    const result = await pool.query(`
      SELECT * FROM "${schemaName}"."${tableName}"
      ORDER BY LOWER(student_name) ASC
    `);

    res.json({ exists: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching weekly attendance:', error);
    res.status(500).json({ error: 'Failed to fetch weekly attendance', details: error.message });
  }
});

// Update weekly attendance (mark attendance for a day)
router.put('/weekly-attendance/:className/:weekStart', async (req, res) => {
  const { className, weekStart } = req.params;
  const { records, globalStaffId } = req.body;

  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ error: 'records array is required' });
  }

  // Verify teacher is assigned to this class
  const assignment = await pool.query(`
    SELECT * FROM school_schema_points.class_teachers 
    WHERE global_staff_id = $1 AND assigned_class = $2 AND is_active = true
  `, [globalStaffId, className]);

  if (assignment.rows.length === 0) {
    return res.status(403).json({ error: 'You are not authorized to update attendance for this class' });
  }

  const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
  if (!validTableName) {
    return res.status(400).json({ error: 'Invalid class name provided.' });
  }

  // Helper: convert Gregorian date to Ethiopian
  const { convertToEthiopian, getEthiopianDayOfWeek } = require('../utils/ethiopianCalendar');

  // Status map: teacher short codes → admin full words
  const statusMap = { 'P': 'PRESENT', 'A': 'ABSENT', 'L': 'LATE', 'E': 'LEAVE' };

  // Build day → Gregorian date map for this week
  const dayNames = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const weekMonday = new Date(weekStart + 'T00:00:00');
  const dayDateMap = {};
  dayNames.forEach((day, i) => {
    const d = new Date(weekMonday);
    d.setDate(weekMonday.getDate() + i);
    dayDateMap[day] = d;
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `class_${className}_weekly_attendance`;
    const tableName = `week_${weekStart.replace(/-/g, '_')}`;
    
    // Check if table exists
    const tableExists = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
    `, [schemaName, tableName]);

    if (tableExists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Weekly attendance not found. Please create it first.' });
    }

    // Update each record in weekly table + sync to academic_student_attendance
    for (const record of records) {
      const { school_id, class_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday } = record;
      
      // 1. Update weekly table
      await client.query(`
        UPDATE "${schemaName}"."${tableName}"
        SET monday = $1, tuesday = $2, wednesday = $3, thursday = $4, 
            friday = $5, saturday = $6, sunday = $7, updated_at = CURRENT_TIMESTAMP
        WHERE school_id = $8 AND class_id = $9
      `, [
        monday || null, tuesday || null, wednesday || null, thursday || null,
        friday || null, saturday || null, sunday || null,
        school_id, class_id
      ]);

      // 2. Get student name for academic table
      const studentRes = await client.query(`
        SELECT student_name, smachine_id FROM classes_schema."${className}"
        WHERE school_id = $1
        LIMIT 1
      `, [school_id]);
      const studentName = studentRes.rows[0]?.student_name || '';
      const smachineId = studentRes.rows[0]?.smachine_id || null;

      // 3. Sync each day to academic_student_attendance
      const dayValues = { monday, tuesday, wednesday, thursday, friday, saturday, sunday };
      for (const dayName of dayNames) {
        const shortStatus = dayValues[dayName];
        if (!shortStatus) continue; // skip empty days

        const fullStatus = statusMap[shortStatus];
        if (!fullStatus) continue;

        const gregDate = dayDateMap[dayName];
        const ethDate = convertToEthiopian(gregDate);
        const dayOfWeek = getEthiopianDayOfWeek(ethDate.year, ethDate.month, ethDate.day);
        const weekNumber = Math.ceil(ethDate.day / 7);

        await client.query(`
          INSERT INTO academic_student_attendance 
            (student_id, student_name, class_name, smachine_id, date,
             ethiopian_year, ethiopian_month, ethiopian_day,
             day_of_week, week_number, check_in_time, status, notes, shift_number)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (student_id, class_name, ethiopian_year, ethiopian_month, ethiopian_day)
          DO UPDATE SET
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP
        `, [
          school_id, studentName, className, smachineId, gregDate,
          ethDate.year, ethDate.month, ethDate.day,
          dayOfWeek, weekNumber,
          '08:00:00', fullStatus,
          'Marked by class teacher',
          1
        ]);

        // ---- Push to guardian for absent/late (non-blocking) ----
        if (fullStatus === 'absent' || fullStatus === 'late' && studentName) {
          try {
            const g = await client.query(
              `SELECT guardian_username, guardian_name FROM classes_schema."${className}" WHERE school_id = $1 LIMIT 1`,
              [school_id]
            );
            const guardianUsername = g.rows[0]?.guardian_username;
            if (guardianUsername) {
              const { notifyGuardianPush } = require('../services/guardianPush');
              notifyGuardianPush(guardianUsername,
                fullStatus === 'absent' ? '⚠️ Absent Today' : '⏰ Late Today',
                `${studentName} was marked ${fullStatus} on ${ethDate.month}/${ethDate.day}/${ethDate.year}.`,
                { type: 'attendance', student_name: studentName, status: fullStatus }
              ).catch(() => {});
            }
          } catch (pushErr) {
            console.warn('Attendance push failed (non-blocking):', pushErr.message);
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: `${records.length} attendance records updated` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating weekly attendance:', error);
    res.status(500).json({ error: 'Failed to update attendance', details: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
