// routes/schoolSetupRoutes.js - COMPLETELY REWRITTEN
const express = require('express');
const pool = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const router = express.Router();

// Auto-create schedule schema and tables
const initializeScheduleSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create schemas
    await client.query('CREATE SCHEMA IF NOT EXISTS schedule_schema');
    await client.query('CREATE SCHEMA IF NOT EXISTS school_schema_points');

    // School configuration table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.school_config (
        id SERIAL PRIMARY KEY,
        periods_per_shift INTEGER DEFAULT 7,
        period_duration INTEGER DEFAULT 45,
        short_break_duration INTEGER DEFAULT 10,
        total_shifts INTEGER DEFAULT 2,
        teaching_days_per_week INTEGER DEFAULT 5,
        school_days INTEGER[] DEFAULT '{1,2,3,4,5}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Enhanced teachers table with proper part-time support
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.teachers (
        id SERIAL PRIMARY KEY,
        global_staff_id INTEGER NOT NULL UNIQUE,
        teacher_name VARCHAR(100) NOT NULL UNIQUE,
        teacher_type VARCHAR(50) NOT NULL DEFAULT 'full_time' CHECK (teacher_type IN ('full_time', 'part_time')),
        staff_work_time VARCHAR(20) DEFAULT 'Full Time',
        max_periods_per_day INTEGER DEFAULT 6,
        max_periods_per_week INTEGER DEFAULT 30,
        work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Subjects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.subjects (
        id SERIAL PRIMARY KEY,
        subject_name VARCHAR(100) NOT NULL UNIQUE,
        subject_code VARCHAR(20) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Class-subject configurations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.class_subject_configs (
        id SERIAL PRIMARY KEY,
        subject_class VARCHAR(150) NOT NULL UNIQUE,
        shift_id INTEGER NOT NULL CHECK (shift_id IN (1, 2)),
        periods_per_week INTEGER NOT NULL DEFAULT 4,
        teaching_days INTEGER[] DEFAULT '{1,2,3,4,5}',
        teacher_name VARCHAR(100),
        staff_work_time VARCHAR(20) DEFAULT 'Full Time',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Teachers period table
    await client.query(`
      CREATE TABLE IF NOT EXISTS school_schema_points.teachers_period (
        id SERIAL PRIMARY KEY,
        teacher_name VARCHAR(100) NOT NULL,
        class_name VARCHAR(50) NOT NULL,
        subject_name VARCHAR(100) NOT NULL,
        staff_work_time VARCHAR(20) DEFAULT 'Full Time',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_name, class_name, subject_name)
      )
    `);

    // Schedule slots table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.schedule_slots (
        id SERIAL PRIMARY KEY,
        day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
        period_number INTEGER CHECK (period_number BETWEEN 1 AND 20),
        class_name VARCHAR(50) NOT NULL,
        subject_id INTEGER,
        teacher_id INTEGER,
        shift_group VARCHAR(50) CHECK (shift_group IN ('morning', 'afternoon', 'evening')),
        shift_id INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Schedule conflicts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.schedule_conflicts (
        id SERIAL PRIMARY KEY,
        conflict_type VARCHAR(50) NOT NULL,
        teacher_name VARCHAR(100),
        class_name VARCHAR(50),
        subject_name VARCHAR(100),
        day_of_week INTEGER,
        period_number INTEGER,
        conflict_details JSONB,
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default config
    const configCheck = await client.query('SELECT id FROM schedule_schema.school_config WHERE id = 1');
    if (configCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO schedule_schema.school_config 
        (id, periods_per_shift, period_duration, short_break_duration, total_shifts, teaching_days_per_week, school_days) 
        VALUES (1, 7, 45, 10, 2, 5, '{1,2,3,4,5}')
      `);
    }

    await client.query('COMMIT');
    console.log('✅ Schedule schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing schedule schema:', error.message);
  } finally {
    client.release();
  }
};

// Initialize schema on startup
initializeScheduleSchema().catch(error => {
  console.error('Failed to initialize schedule schema at startup:', error.message);
});

// ==================== ENHANCED API ENDPOINTS ====================

// Get all classes from the system
router.get('/all-classes', async (req, res) => {
  try {
    // Try to get classes from multiple sources
    const classesFromTeachersPeriod = await pool.query(`
      SELECT DISTINCT class_name 
      FROM school_schema_points.teachers_period 
      WHERE class_name IS NOT NULL 
      ORDER BY class_name
    `);
    
    const classesFromSchedule = await pool.query(`
      SELECT DISTINCT class_name 
      FROM schedule_schema.schedule_slots 
      WHERE class_name IS NOT NULL 
      ORDER BY class_name
    `);
    
    const classesFromConfigs = await pool.query(`
      SELECT DISTINCT 
        SPLIT_PART(subject_class, ' Class ', 2) as class_name
      FROM schedule_schema.class_subject_configs 
      WHERE subject_class LIKE '% Class %'
      ORDER BY class_name
    `);
    
    // Combine all class sources and remove duplicates
    const allClasses = [
      ...classesFromTeachersPeriod.rows.map(r => r.class_name),
      ...classesFromSchedule.rows.map(r => r.class_name),
      ...classesFromConfigs.rows.map(r => r.class_name)
    ].filter(Boolean);
    
    const uniqueClasses = [...new Set(allClasses)].sort();
    
    console.log(`Found ${uniqueClasses.length} unique classes from all sources`);
    res.json(uniqueClasses);
  } catch (error) {
    console.error('Error fetching all classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Enhanced teacher synchronization with better part-time handling
router.post('/enhanced-sync-teachers', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Starting enhanced teacher synchronization...');
    
    // Clear and rebuild teacher data with proper part-time handling
    await client.query('DELETE FROM schedule_schema.teachers');
    
    // Get all teacher assignments with work times
    const teacherAssignments = await client.query(`
      SELECT DISTINCT 
        tp.teacher_name,
        tp.staff_work_time,
        t.role
      FROM school_schema_points.teachers_period tp
      LEFT JOIN school_schema_points.teachers t ON t.teacher_name = tp.teacher_name
      WHERE tp.teacher_name IS NOT NULL
    `);
    
    console.log(`Found ${teacherAssignments.rows.length} teacher assignments to sync`);
    
    let syncedCount = 0;
    let partTimeCount = 0;
    
    for (const assignment of teacherAssignments.rows) {
      const teacherName = assignment.teacher_name;
      const workTime = assignment.staff_work_time || 'Full Time';
      
      // Determine teacher type
      const isPartTime = workTime.toLowerCase().includes('part') || 
                        workTime.toLowerCase().includes('partial');
      const teacherType = isPartTime ? 'part_time' : 'full_time';
      
      // Set work days based on type
      let workDays = [1, 2, 3, 4, 5]; // Default full-time
      if (isPartTime) {
        workDays = [1, 3, 5]; // Default part-time (Mon, Wed, Fri)
        partTimeCount++;
      }
      
      const globalStaffId = 1000 + syncedCount;
      
      await client.query(`
        INSERT INTO schedule_schema.teachers 
        (global_staff_id, teacher_name, teacher_type, staff_work_time, work_days, max_periods_per_day)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        globalStaffId,
        teacherName,
        teacherType,
        workTime,
        workDays,
        isPartTime ? 4 : 6 // Part-time max 4 periods/day, full-time 6
      ]);
      
      syncedCount++;
      console.log(`Synced teacher: ${teacherName} (${teacherType}) - Work days: ${workDays}`);
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: `Enhanced teacher synchronization completed`,
      synced_count: syncedCount,
      part_time_count: partTimeCount,
      full_time_count: syncedCount - partTimeCount
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in enhanced teacher sync:', error);
    res.status(500).json({ error: 'Enhanced teacher sync failed' });
  } finally {
    client.release();
  }
});

// Force regenerate schedule with enhanced part-time support
router.post('/force-regenerate-schedule', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Starting forced schedule regeneration...');
    
    // Clear existing schedule
    await client.query('DELETE FROM schedule_schema.schedule_slots');
    await client.query('DELETE FROM schedule_schema.schedule_conflicts');
    
    // Enhanced teacher sync first
    const teacherAssignments = await client.query(`
      SELECT DISTINCT 
        tp.teacher_name,
        tp.staff_work_time
      FROM school_schema_points.teachers_period tp
      WHERE tp.teacher_name IS NOT NULL
    `);
    
    await client.query('DELETE FROM schedule_schema.teachers');
    
    for (const assignment of teacherAssignments.rows) {
      const teacherName = assignment.teacher_name;
      const workTime = assignment.staff_work_time || 'Full Time';
      const isPartTime = workTime.toLowerCase().includes('part');
      const teacherType = isPartTime ? 'part_time' : 'full_time';
      const workDays = isPartTime ? [1, 3, 5] : [1, 2, 3, 4, 5];
      
      await client.query(`
        INSERT INTO schedule_schema.teachers 
        (global_staff_id, teacher_name, teacher_type, staff_work_time, work_days)
        VALUES ($1, $2, $3, $4, $5)
      `, [1000 + teacherAssignments.rows.indexOf(assignment), teacherName, teacherType, workTime, workDays]);
    }
    
    // Get school configuration
    const configResult = await client.query('SELECT * FROM schedule_schema.school_config WHERE id = 1');
    const config = configResult.rows[0];

    // Get all configured class-subjects
    const configsResult = await client.query(`
      SELECT csc.* 
      FROM schedule_schema.class_subject_configs csc
      WHERE csc.teacher_name IS NOT NULL
      ORDER BY csc.subject_class
    `);
    const requirements = configsResult.rows;

    if (requirements.length === 0) {
      throw new Error('No class-subject configurations found. Please complete Task 6 and configure shifts/periods first.');
    }

    const scheduleSlots = [];
    const conflicts = [];
    const teacherScheduleMap = {};
    const classScheduleMap = {};
    const teacherPeriodMap = {};

    console.log('=== STARTING ENHANCED SCHEDULE GENERATION ===');
    console.log(`Processing ${requirements.length} class-subject requirements`);

    // Enhanced schedule generation with proper part-time teacher handling
    for (const requirement of requirements) {
      const shift_id = requirement.shift_id || 1;
      const teacher_name = requirement.teacher_name;
      let teaching_days = requirement.teaching_days || config.school_days;
      const periods_needed = requirement.periods_per_week || 4;
      const staff_work_time = requirement.staff_work_time || 'Full Time';

      console.log(`\nProcessing: ${requirement.subject_class}`);
      console.log(`Teacher: ${teacher_name}, Work Time: ${staff_work_time}, Periods needed: ${periods_needed}`);

      if (!teacher_name) {
        conflicts.push({
          conflict_type: 'NO_TEACHER_ASSIGNED',
          teacher_name: null,
          class_name: null,
          subject_name: null,
          day_of_week: null,
          period_number: null,
          conflict_details: { subject_class: requirement.subject_class, shift_id }
        });
        continue;
      }

      // Get teacher info
      const teacherResult = await client.query(`
        SELECT t.id as teacher_id, t.teacher_name, t.teacher_type, t.staff_work_time, t.work_days
        FROM schedule_schema.teachers t
        WHERE t.teacher_name = $1
        LIMIT 1
      `, [teacher_name]);

      if (teacherResult.rows.length === 0) {
        conflicts.push({
          conflict_type: 'TEACHER_NOT_FOUND',
          teacher_name: teacher_name,
          class_name: null,
          subject_name: null,
          day_of_week: null,
          period_number: null,
          conflict_details: { subject_class: requirement.subject_class, teacher_name }
        });
        continue;
      }

      const teacher = teacherResult.rows[0];
      console.log(`Teacher found: ${teacher.teacher_name}, Type: ${teacher.teacher_type}, Work Days: ${teacher.work_days}`);

      const classMatch = requirement.subject_class.match(/Class (.+)$/);
      const class_name = classMatch ? classMatch[1] : requirement.subject_class;

      // Get subject info
      const subjectMatch = requirement.subject_class.match(/(.+) Class/);
      const subject_name = subjectMatch ? subjectMatch[1] : requirement.subject_class;
      
      const subjectResult = await client.query(`
        SELECT id FROM schedule_schema.subjects 
        WHERE LOWER(subject_name) = LOWER($1)
        LIMIT 1
      `, [subject_name]);

      if (subjectResult.rows.length === 0) {
        conflicts.push({
          conflict_type: 'SUBJECT_NOT_FOUND',
          teacher_name: teacher_name,
          class_name: class_name,
          subject_name: subject_name,
          day_of_week: null,
          period_number: null,
          conflict_details: { subject_class: requirement.subject_class, subject_name }
        });
        continue;
      }

      const subject_id = subjectResult.rows[0].id;

      // CRITICAL FIX: Use teacher's actual work days for part-time teachers
      if (teacher.teacher_type === 'part_time') {
        teaching_days = teacher.work_days || [1, 3, 5]; // Default part-time days
        console.log(`✓ Part-time teacher ${teacher_name} assigned to specific days: ${teaching_days}`);
      } else {
        teaching_days = config.school_days;
        console.log(`✓ Full-time teacher ${teacher_name} assigned to all school days`);
      }

      // Validate teaching days
      teaching_days = teaching_days.filter(day => config.school_days.includes(day));
      if (teaching_days.length === 0) {
        conflicts.push({
          conflict_type: 'NO_VALID_TEACHING_DAYS',
          teacher_name: teacher_name,
          class_name: class_name,
          subject_name: subject_name,
          day_of_week: null,
          period_number: null,
          conflict_details: {
            subject_class: requirement.subject_class,
            teacher_work_time: teacher.teacher_type,
            assigned_days: teaching_days,
            school_days: config.school_days
          }
        });
        continue;
      }

      // Initialize tracking
      if (!teacherScheduleMap[teacher.teacher_id]) {
        teacherScheduleMap[teacher.teacher_id] = {};
        teacherPeriodMap[teacher.teacher_id] = {};
      }

      if (!classScheduleMap[class_name]) {
        classScheduleMap[class_name] = {};
      }

      let periodsScheduled = 0;
      const maxAttempts = 2000;
      let attempts = 0;

      // Smart period distribution
      const periodsPerDay = Math.max(1, Math.floor(periods_needed / teaching_days.length));
      const extraPeriods = periods_needed % teaching_days.length;

      console.log(`Smart distribution: ${periodsPerDay} base + ${extraPeriods} extra periods across ${teaching_days.length} days`);

      // Phase 1: Try to schedule periods evenly across teaching days
      for (let dayIndex = 0; dayIndex < teaching_days.length; dayIndex++) {
        if (periodsScheduled >= periods_needed) break;

        const day = teaching_days[dayIndex];
        const dayPeriodsNeeded = periodsPerDay + (dayIndex < extraPeriods ? 1 : 0);
        let dayPeriodsScheduled = 0;

        // Check part-time teacher daily limit
        if (teacher.teacher_type === 'part_time') {
          const existingDayPeriods = scheduleSlots.filter(slot => 
            slot.teacher_id === teacher.teacher_id && 
            slot.day_of_week === day
          ).length;
          
          if (existingDayPeriods >= 4) {
            console.log(`⚠️ Part-time teacher ${teacher_name} already has ${existingDayPeriods} periods on day ${day} (max 4)`);
            continue;
          }
        }

        // Try available periods for this day
        const availablePeriods = [...Array(config.periods_per_shift).keys()].map(i => i + 1);
        const shuffledPeriods = [...availablePeriods].sort(() => Math.random() - 0.5);

        for (const period of shuffledPeriods) {
          if (dayPeriodsScheduled >= dayPeriodsNeeded || periodsScheduled >= periods_needed) break;

          const shift_group = period <= Math.ceil(config.periods_per_shift / 2) ? 'morning' : 'afternoon';
          
          const classSlotKey = `${day}-${period}-${shift_group}-${shift_id}`;
          const teacherSlotKey = `${teacher.teacher_id}-${day}-${period}-${shift_group}-${shift_id}`;

          // Check class availability
          if (classScheduleMap[class_name][classSlotKey]) {
            continue;
          }

          // Check teacher availability
          let isTeacherAvailable = true;
          
          if (teacherScheduleMap[teacherSlotKey]) {
            isTeacherAvailable = false;
          }

          // Additional part-time constraints
          if (teacher.teacher_type === 'part_time' && isTeacherAvailable) {
            const teacherDayPeriods = scheduleSlots.filter(slot => 
              slot.teacher_id === teacher.teacher_id && 
              slot.day_of_week === day
            ).length;
            
            if (teacherDayPeriods >= 4) {
              isTeacherAvailable = false;
            }
          }

          if (!isTeacherAvailable) continue;

          // Create slot
          const newSlot = {
            day_of_week: day,
            period_number: period,
            class_name,
            subject_id,
            teacher_id: teacher.teacher_id,
            shift_group,
            shift_id
          };

          scheduleSlots.push(newSlot);
          classScheduleMap[class_name][classSlotKey] = [newSlot];
          teacherScheduleMap[teacherSlotKey] = [newSlot];

          periodsScheduled++;
          dayPeriodsScheduled++;
          
          console.log(`✓ Scheduled: ${class_name} - Day ${day} - Period ${period} - ${teacher_name} (${teacher.teacher_type})`);
        }
      }

      // Phase 2: Fallback for remaining periods
      while (periodsScheduled < periods_needed && attempts < maxAttempts) {
        attempts++;
        
        const day = teaching_days[Math.floor(Math.random() * teaching_days.length)];
        const period = Math.floor(Math.random() * config.periods_per_shift) + 1;
        const shift_group = period <= Math.ceil(config.periods_per_shift / 2) ? 'morning' : 'afternoon';
        
        const classSlotKey = `${day}-${period}-${shift_group}-${shift_id}`;
        const teacherSlotKey = `${teacher.teacher_id}-${day}-${period}-${shift_group}-${shift_id}`;

        // Collision checks
        if (classScheduleMap[class_name] && classScheduleMap[class_name][classSlotKey]) continue;
        if (teacherScheduleMap[teacherSlotKey]) continue;

        // Part-time constraints
        if (teacher.teacher_type === 'part_time') {
          const teacherDayPeriods = scheduleSlots.filter(slot => 
            slot.teacher_id === teacher.teacher_id && 
            slot.day_of_week === day
          ).length;
          if (teacherDayPeriods >= 4) continue;
        }

        const newSlot = {
          day_of_week: day,
          period_number: period,
          class_name,
          subject_id,
          teacher_id: teacher.teacher_id,
          shift_group,
          shift_id
        };

        scheduleSlots.push(newSlot);
        classScheduleMap[class_name][classSlotKey] = [newSlot];
        teacherScheduleMap[teacherSlotKey] = [newSlot];

        periodsScheduled++;
        console.log(`✓ Fallback scheduled: ${class_name} - Day ${day} - Period ${period} - ${teacher_name}`);
      }

      // Report results
      if (periodsScheduled < periods_needed) {
        conflicts.push({
          conflict_type: 'INSUFFICIENT_SLOTS',
          teacher_name: teacher_name,
          class_name: class_name,
          subject_name: subject_name,
          day_of_week: null,
          period_number: null,
          conflict_details: {
            subject_class: requirement.subject_class,
            required: periods_needed,
            scheduled: periodsScheduled,
            teacher_type: teacher.teacher_type,
            teaching_days: teaching_days
          }
        });
        console.log(`❌ Only scheduled ${periodsScheduled}/${periods_needed} periods for ${requirement.subject_class}`);
      } else {
        console.log(`✅ Successfully scheduled ${periodsScheduled}/${periods_needed} periods for ${requirement.subject_class}`);
      }
    }

    // Insert schedule slots
    console.log(`\nInserting ${scheduleSlots.length} schedule slots...`);
    for (const slot of scheduleSlots) {
      await client.query(`
        INSERT INTO schedule_schema.schedule_slots 
        (day_of_week, period_number, class_name, subject_id, teacher_id, shift_group, shift_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        slot.day_of_week, 
        slot.period_number, 
        slot.class_name, 
        slot.subject_id, 
        slot.teacher_id, 
        slot.shift_group, 
        slot.shift_id
      ]);
    }

    // Insert conflicts
    console.log(`Inserting ${conflicts.length} conflicts...`);
    for (const conflict of conflicts) {
      await client.query(
        `INSERT INTO schedule_schema.schedule_conflicts 
         (conflict_type, teacher_name, class_name, subject_name, day_of_week, period_number, conflict_details) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          conflict.conflict_type,
          conflict.teacher_name,
          conflict.class_name, 
          conflict.subject_name,
          conflict.day_of_week,
          conflict.period_number,
          conflict.conflict_details
        ]
      );
    }

    await client.query('COMMIT');
    
    console.log('\n=== SCHEDULE GENERATION COMPLETE ===');
    console.log(`Total slots: ${scheduleSlots.length}`);
    console.log(`Conflicts: ${conflicts.length}`);
    
    res.json({ 
      message: `Schedule force regeneration completed!`,
      slots_generated: scheduleSlots.length,
      conflicts_count: conflicts.length,
      details: {
        total_slots: scheduleSlots.length,
        teachers_synced: teacherAssignments.rows.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in force regenerate:', error);
    res.status(500).json({ error: 'Force regeneration failed: ' + error.message });
  } finally {
    client.release();
  }
});

// ==================== EXISTING ROUTES ====================

// Get schedule with teacher information
router.get('/schedule', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.*, 
        sub.subject_name, 
        sub.subject_code, 
        t.teacher_name,
        t.staff_work_time,
        t.teacher_type
      FROM schedule_schema.schedule_slots s
      LEFT JOIN schedule_schema.subjects sub ON sub.id = s.subject_id
      LEFT JOIN schedule_schema.teachers t ON t.id = s.teacher_id
      ORDER BY s.shift_id, s.day_of_week, s.period_number, s.class_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedule:', error.message);
    res.json([]);
  }
});

// Get conflicts
router.get('/conflicts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM schedule_schema.schedule_conflicts 
      WHERE resolved = false
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conflicts:', error.message);
    res.json([]);
  }
});

// Get subjects
router.get('/subjects', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, subject_name, subject_code 
      FROM schedule_schema.subjects 
      ORDER BY subject_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching subjects:', error.message);
    res.json([]);
  }
});

// Get class-subjects
router.get('/class-subjects', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT 
        CONCAT(subject_name, ' Class ', class_name) as subject_class,
        teacher_name,
        staff_work_time
      FROM school_schema_points.teachers_period
      ORDER BY subject_class
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class-subjects:', error.message);
    res.json([]);
  }
});

// Get school configuration
router.get('/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM schedule_schema.school_config WHERE id = 1');
    if (result.rows.length === 0) {
      await pool.query(`
        INSERT INTO schedule_schema.school_config 
        (id, periods_per_shift, period_duration, short_break_duration, total_shifts, teaching_days_per_week, school_days) 
        VALUES (1, 7, 45, 10, 2, 5, '{1,2,3,4,5}')
      `);
      const newResult = await pool.query('SELECT * FROM schedule_schema.school_config WHERE id = 1');
      return res.json(newResult.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching schedule config:', error.message);
    res.json({
      periods_per_shift: 7,
      period_duration: 45,
      short_break_duration: 10,
      total_shifts: 2,
      teaching_days_per_week: 5,
      school_days: [1,2,3,4,5],
      has_kg: false,
      shift_rotation: false,
      rotation_frequency: 'weekly',
      periods_per_day: {1:6,2:6,3:6,4:6,5:6},
      terms: 1
    });
  }
});

// Update school configuration
router.put('/config', async (req, res) => {
  const config = req.body;
  console.log('📝 PUT /config received:', JSON.stringify(config));
  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS schedule_schema');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.school_config (
        id SERIAL PRIMARY KEY,
        periods_per_shift INTEGER DEFAULT 7,
        period_duration INTEGER DEFAULT 45,
        short_break_duration INTEGER DEFAULT 10,
        total_shifts INTEGER DEFAULT 2,
        teaching_days_per_week INTEGER DEFAULT 5,
        school_days INTEGER[] DEFAULT '{1,2,3,4,5}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add new columns for existing tables
    await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS has_kg BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS shift_rotation BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS rotation_frequency VARCHAR(20) DEFAULT \'weekly\'');
    await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS periods_per_day JSONB DEFAULT \'{"1":6,"2":6,"3":6,"4":6,"5":6}\'');
    await pool.query('ALTER TABLE schedule_schema.school_config ADD COLUMN IF NOT EXISTS terms INTEGER DEFAULT 1');
    const result = await pool.query(`
      INSERT INTO schedule_schema.school_config (id, periods_per_shift, period_duration, short_break_duration, total_shifts, teaching_days_per_week, school_days, has_kg, shift_rotation, rotation_frequency, periods_per_day, terms)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        periods_per_shift = EXCLUDED.periods_per_shift,
        period_duration = EXCLUDED.period_duration,
        short_break_duration = EXCLUDED.short_break_duration,
        total_shifts = EXCLUDED.total_shifts,
        teaching_days_per_week = EXCLUDED.teaching_days_per_week,
        school_days = EXCLUDED.school_days,
        has_kg = EXCLUDED.has_kg,
        shift_rotation = EXCLUDED.shift_rotation,
        rotation_frequency = EXCLUDED.rotation_frequency,
        periods_per_day = EXCLUDED.periods_per_day,
        terms = EXCLUDED.terms,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, terms, has_kg, shift_rotation, rotation_frequency, periods_per_day, total_shifts
    `, [
      config.periods_per_shift,
      config.period_duration,
      config.short_break_duration,
      config.total_shifts,
      config.teaching_days_per_week,
      config.school_days,
      config.has_kg,
      config.shift_rotation,
      config.rotation_frequency || 'weekly',
      JSON.stringify(config.periods_per_day || {1:6,2:6,3:6,4:6,5:6}),
      config.terms
    ]);
    res.json({ message: 'Configuration updated successfully' });
  } catch (error) {
    console.error('Error updating schedule config:', error.message);
    res.status(500).json({ error: 'Failed to update schedule config' });
  }
});

// Get class-subject configs
router.get('/class-subject-configs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM schedule_schema.class_subject_configs 
      ORDER BY subject_class
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class-subject configs:', error.message);
    res.json([]);
  }
});

// Get teachers period data
router.get('/task6/teachers-period', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM school_schema_points.teachers_period 
      ORDER BY teacher_name, class_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teachers period data:', error.message);
    res.json([]);
  }
});

// Set comprehensive configuration
router.post('/set-comprehensive-config', async (req, res) => {
  const { assignments } = req.body;
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'Assignments must be an array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const assign of assignments) {
      const { subject_class, shift_id, periods_per_week, teaching_days } = assign;
      
      if (!subject_class || !shift_id || ![1, 2].includes(shift_id)) {
        throw new Error(`Invalid assignment: subject_class=${subject_class}, shift_id=${shift_id}`);
      }

      if (!periods_per_week || periods_per_week < 1 || periods_per_week > 20) {
        throw new Error(`Invalid periods: subject_class=${subject_class}, periods_per_week=${periods_per_week}`);
      }

      // Get teacher info
      let teacher_name = null;
      let staff_work_time = 'Full Time';
      try {
        const classMatch = subject_class.match(/(.+) Class (.+)/);
        if (classMatch) {
          const subject_name = classMatch[1];
          const class_name = classMatch[2];
          
          const teacherResult = await client.query(`
            SELECT teacher_name, staff_work_time
            FROM school_schema_points.teachers_period 
            WHERE subject_name = $1 AND class_name = $2
            LIMIT 1
          `, [subject_name, class_name]);
          
          if (teacherResult.rows.length > 0) {
            teacher_name = teacherResult.rows[0].teacher_name;
            staff_work_time = teacherResult.rows[0].staff_work_time || 'Full Time';
          }
        }
      } catch (error) {
        console.log('Could not fetch teacher name:', error.message);
      }

      await client.query(`
        INSERT INTO schedule_schema.class_subject_configs 
        (subject_class, shift_id, periods_per_week, teaching_days, teacher_name, staff_work_time)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (subject_class)
        DO UPDATE SET 
          shift_id = $2, 
          periods_per_week = $3, 
          teaching_days = $4,
          teacher_name = COALESCE($5, class_subject_configs.teacher_name),
          staff_work_time = COALESCE($6, class_subject_configs.staff_work_time),
          updated_at = CURRENT_TIMESTAMP
      `, [subject_class, shift_id, periods_per_week, teaching_days, teacher_name, staff_work_time]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Comprehensive configuration saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving comprehensive config:', error.message);
    res.status(500).json({ error: 'Failed to save configuration', details: error.message });
  } finally {
    client.release();
  }
});

// Sync teacher assignments
router.post('/sync-teacher-assignments', async (req, res) => {
  const { assignments, teacherWorkTimes } = req.body;
  
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'Assignments must be an array' });
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS school_schema_points.teachers_period (
      id SERIAL PRIMARY KEY,
      teacher_name VARCHAR(100) NOT NULL,
      class_name VARCHAR(50) NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      staff_work_time VARCHAR(20) DEFAULT 'Full Time',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacher_name, class_name, subject_name)
    )`);
    await client.query('BEGIN');
    await client.query('DELETE FROM school_schema_points.teachers_period');

    for (const assignment of assignments) {
      const { teacherName, subjectClass, staffWorkTime } = assignment;
      
      const match = subjectClass.match(/(.+) Class (.+)/);
      if (match) {
        const subject_name = match[1];
        const class_name = match[2];
        
        const workTime = staffWorkTime || 
                        (teacherWorkTimes && teacherWorkTimes[teacherName]) || 
                        'Full Time';
        
        await client.query(`
          INSERT INTO school_schema_points.teachers_period 
          (teacher_name, class_name, subject_name, staff_work_time)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (teacher_name, class_name, subject_name) DO UPDATE SET
            staff_work_time = EXCLUDED.staff_work_time
        `, [teacherName, class_name, subject_name, workTime]);
      }
    }

    await client.query('COMMIT');
    res.json({ 
      message: 'Teacher assignments synced successfully',
      synced_count: assignments.length 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error syncing teacher assignments:', error.message);
    res.status(500).json({ error: 'Failed to sync teacher assignments' });
  } finally {
    client.release();
  }
});

// Get teachers with work time
router.get('/teachers-with-worktime', async (req, res) => {
  try {
    // Try school_schema_points.teachers first
    let result;
    try {
      result = await pool.query(`
        SELECT teacher_name as name, role, staff_work_time
        FROM school_schema_points.teachers 
        WHERE role = 'Teacher'
        ORDER BY teacher_name
      `);
    } catch (e) {
      // Fall back to staff_teachers tables
      result = { rows: [] };
    }
    
    if (result.rows.length === 0) {
      // Fallback: query all staff_* schemas for teachers
      const schemas = ['staff_teachers', 'staff_administrative_staff', 'staff_supportive_staff', 'staff_finance'];
      for (const schema of schemas) {
        try {
          const tables = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema]
          );
          for (const t of tables.rows) {
            const r = await pool.query(
              `SELECT name, COALESCE(role, 'Teacher') as role, staff_work_time FROM "${schema}"."${t.table_name}" WHERE role = 'Teacher' OR role IS NULL ORDER BY name`
            );
            result.rows.push(...r.rows);
          }
        } catch (e) { /* schema may not exist */ }
      }
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teachers with worktime:', error.message);
    res.status(500).json({ error: 'Failed to fetch teachers with worktime' });
  }
});

// Manual sync teachers
router.post('/manual-sync-teachers', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teachersPeriodResult = await client.query(`
      SELECT DISTINCT teacher_name, staff_work_time 
      FROM school_schema_points.teachers_period
    `);

    if (teachersPeriodResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No teacher assignments found in Task 6. Please complete Task 6 first.' 
      });
    }

    let syncedCount = 0;

    for (const teacher of teachersPeriodResult.rows) {
      const teacherName = teacher.teacher_name;
      const workTime = teacher.staff_work_time || 'Full Time';
      const teacherType = workTime.toLowerCase().includes('part') ? 'part_time' : 'full_time';
      
      let workDays = [1,2,3,4,5];
      if (teacherType === 'part_time') {
        workDays = [1,3,5];
      }

      const globalStaffId = Math.floor(Math.random() * 10000) + 1000;

      await client.query(`
        INSERT INTO schedule_schema.teachers 
        (global_staff_id, teacher_name, teacher_type, staff_work_time, work_days)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (teacher_name) 
        DO UPDATE SET
          teacher_type = EXCLUDED.teacher_type,
          staff_work_time = EXCLUDED.staff_work_time,
          work_days = EXCLUDED.work_days,
          updated_at = CURRENT_TIMESTAMP
      `, [globalStaffId, teacherName, teacherType, workTime, workDays]);

      syncedCount++;
    }

    await client.query('COMMIT');
    
    res.json({ 
      message: `Successfully synced ${syncedCount} teachers from Task 6`,
      synced_count: syncedCount
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in manual sync teachers:', error.message);
    res.status(500).json({ error: 'Failed to sync teacher data' });
  } finally {
    client.release();
  }
});

// Force sync all data
router.post('/force-sync-data', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Sync teachers
    const teachersResult = await client.query(`
      INSERT INTO schedule_schema.teachers (global_staff_id, teacher_name, teacher_type, staff_work_time, work_days)
      SELECT 
        (1000 + ROW_NUMBER() OVER (ORDER BY teacher_name)) as global_staff_id,
        teacher_name,
        CASE 
          WHEN LOWER(staff_work_time) LIKE '%part%' THEN 'part_time'
          ELSE 'full_time'
        END as teacher_type,
        COALESCE(staff_work_time, 'Full Time') as staff_work_time,
        CASE 
          WHEN LOWER(staff_work_time) LIKE '%part%' THEN ARRAY[1,3,5]::INTEGER[]
          ELSE ARRAY[1,2,3,4,5]::INTEGER[]
        END as work_days
      FROM (
        SELECT DISTINCT teacher_name, staff_work_time 
        FROM school_schema_points.teachers_period
      ) AS distinct_teachers
      ON CONFLICT (teacher_name) DO UPDATE SET
        teacher_type = EXCLUDED.teacher_type,
        staff_work_time = EXCLUDED.staff_work_time,
        work_days = EXCLUDED.work_days,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Sync subjects
    const subjectsResult = await client.query(`
      INSERT INTO schedule_schema.subjects (subject_name, subject_code)
      SELECT 
        DISTINCT 
        INITCAP(
          CASE 
            WHEN LOWER(subject_name) = 'bio' THEN 'biology'
            WHEN LOWER(subject_name) = 'eng' THEN 'english'
            WHEN LOWER(subject_name) = 'math' THEN 'mathematics'
            ELSE subject_name
          END
        ) as subject_name,
        UPPER(
          CASE 
            WHEN LOWER(subject_name) = 'bio' THEN 'BIO'
            WHEN LOWER(subject_name) = 'eng' THEN 'ENG'
            WHEN LOWER(subject_name) = 'math' THEN 'MATH'
            ELSE SUBSTRING(REPLACE(subject_name, ' ', '_') FROM 1 FOR 15)
          END
        ) || '_001' as subject_code
      FROM school_schema_points.teachers_period
      ON CONFLICT (subject_name) DO NOTHING
    `);

    // Sync class-subject configs
    const configsResult = await client.query(`
      INSERT INTO schedule_schema.class_subject_configs 
      (subject_class, shift_id, periods_per_week, teacher_name, staff_work_time, teaching_days)
      SELECT 
        CONCAT(subject_name, ' Class ', class_name) as subject_class,
        CASE 
          WHEN (ROW_NUMBER() OVER (ORDER BY class_name, subject_name)) % 2 = 0 THEN 2
          ELSE 1
        END as shift_id,
        CASE 
          WHEN LOWER(subject_name) LIKE '%math%' THEN 5
          WHEN LOWER(subject_name) LIKE '%english%' OR LOWER(subject_name) = 'eng' THEN 3
          WHEN LOWER(subject_name) LIKE '%science%' OR LOWER(subject_name) = 'bio' OR LOWER(subject_name) = 'sci' THEN 4
          ELSE 4
        END as periods_per_week,
        teacher_name,
        staff_work_time,
        CASE 
          WHEN LOWER(staff_work_time) LIKE '%part%' THEN ARRAY[1,3,5]::INTEGER[]
          ELSE ARRAY[1,2,3,4,5]::INTEGER[]
        END as teaching_days
      FROM school_schema_points.teachers_period
      ON CONFLICT (subject_class) DO UPDATE SET
        teacher_name = EXCLUDED.teacher_name,
        staff_work_time = EXCLUDED.staff_work_time,
        teaching_days = EXCLUDED.teaching_days,
        updated_at = CURRENT_TIMESTAMP
    `);

    await client.query('COMMIT');
    
    res.json({ 
      message: 'Data force sync completed successfully',
      details: {
        teachers_synced: teachersResult.rowCount,
        subjects_synced: subjectsResult.rowCount,
        configs_synced: configsResult.rowCount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in force sync data:', error.message);
    res.status(500).json({ error: 'Failed to force sync data: ' + error.message });
  } finally {
    client.release();
  }
});

// Get teacher work times
router.get('/teacher-work-times', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT teacher_name, staff_work_time 
      FROM school_schema_points.teachers 
      WHERE role = 'Teacher'
      ORDER BY teacher_name
    `);
    
    const workTimeMap = {};
    rows.forEach(row => {
      workTimeMap[row.teacher_name] = row.staff_work_time;
    });
    
    res.json(workTimeMap);
  } catch (error) {
    console.error('Error fetching teacher work times:', error.message);
    res.status(500).json({ error: 'Failed to fetch teacher work times' });
  }
});

// Debug route
router.get('/debug-schedule-status', async (req, res) => {
  try {
    const slotsCheck = await pool.query(`
      SELECT 
        shift_id,
        COUNT(*) as slot_count
      FROM schedule_schema.schedule_slots 
      GROUP BY shift_id
      ORDER BY shift_id
    `);
    
    const configsCheck = await pool.query(`
      SELECT COUNT(*) as config_count 
      FROM schedule_schema.class_subject_configs
    `);
    
    const teachersCheck = await pool.query(`
      SELECT COUNT(*) as teacher_count 
      FROM school_schema_points.teachers_period
    `);
    
    const configCheck = await pool.query(`
      SELECT * FROM schedule_schema.school_config WHERE id = 1
    `);
    
    const subjectsCheck = await pool.query(`
      SELECT COUNT(*) as subject_count FROM schedule_schema.subjects
    `);
    
    const scheduleTeachersCheck = await pool.query(`
      SELECT COUNT(*) as schedule_teacher_count FROM schedule_schema.teachers
    `);
    
    res.json({
      slots: slotsCheck.rows,
      configs: configsCheck.rows[0] || { config_count: 0 },
      teachers: teachersCheck.rows[0] || { teacher_count: 0 },
      subjects: subjectsCheck.rows[0] || { subject_count: 0 },
      scheduleTeachers: scheduleTeachersCheck.rows[0] || { schedule_teacher_count: 0 },
      schoolConfig: configCheck.rows[0] || null
    });
    
  } catch (error) {
    console.error('Debug error:', error.message);
    res.status(500).json({ error: 'Debug failed: ' + error.message });
  }
});

// Debug part-time teachers specifically
router.get('/debug-part-time-teachers', async (req, res) => {
  try {
    // Check part-time teachers in schedule_schema.teachers
    const partTimeTeachers = await pool.query(`
      SELECT teacher_name, teacher_type, staff_work_time, work_days 
      FROM schedule_schema.teachers 
      WHERE teacher_type = 'part_time'
    `);
    
    // Check if part-time teachers are in class_subject_configs
    const partTimeAssignments = await pool.query(`
      SELECT csc.teacher_name, csc.subject_class, csc.teaching_days
      FROM schedule_schema.class_subject_configs csc
      JOIN schedule_schema.teachers t ON t.teacher_name = csc.teacher_name
      WHERE t.teacher_type = 'part_time'
    `);
    
    // Check schedule slots for part-time teachers
    const partTimeSlots = await pool.query(`
      SELECT s.teacher_id, t.teacher_name, t.teacher_type, COUNT(*) as slot_count
      FROM schedule_schema.schedule_slots s
      JOIN schedule_schema.teachers t ON t.id = s.teacher_id
      WHERE t.teacher_type = 'part_time'
      GROUP BY s.teacher_id, t.teacher_name, t.teacher_type
    `);
    
    res.json({
      part_time_teachers: partTimeTeachers.rows,
      part_time_assignments: partTimeAssignments.rows,
      part_time_schedule_slots: partTimeSlots.rows,
      summary: {
        total_part_time_teachers: partTimeTeachers.rows.length,
        total_part_time_assignments: partTimeAssignments.rows.length,
        total_part_time_slots: partTimeSlots.rows.reduce((sum, row) => sum + parseInt(row.slot_count), 0)
      }
    });
  } catch (error) {
    console.error('Error debugging part-time teachers:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// Reset schema (for development/debugging)
router.post('/reset-schema', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Resetting schedule schema...');

    // Clear all schedule data but keep the schema
    await client.query('DELETE FROM schedule_schema.schedule_slots');
    await client.query('DELETE FROM schedule_schema.schedule_conflicts');
    await client.query('DELETE FROM schedule_schema.class_subject_configs');
    await client.query('DELETE FROM schedule_schema.teachers');
    await client.query('DELETE FROM schedule_schema.subjects');
    
    // Reset school config to defaults
    await client.query(`
      UPDATE schedule_schema.school_config SET
        periods_per_shift = 7,
        period_duration = 45,
        short_break_duration = 10,
        total_shifts = 2,
        teaching_days_per_week = 5,
        school_days = '{1,2,3,4,5}',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    await client.query('COMMIT');
    
    console.log('Schedule schema reset successfully');
    
    res.json({ 
      message: 'Schedule schema reset successfully',
      details: 'All schedule data cleared and reset to defaults'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting schema:', error.stack);
    res.status(500).json({ 
      error: 'Failed to reset schema', 
      details: error.message 
    });
  } finally {
    client.release();
  }
});

module.exports = router;