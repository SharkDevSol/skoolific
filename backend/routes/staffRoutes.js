// routes/staffRoutes.js - FIXED PHONE NUMBER TYPE
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
require('dotenv').config();

// Security middleware
const { authorizeRoles } = require('../middleware/auth');
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { generateToken } = require('../middleware/jwtValidator');
const { validate, schemas, sanitizeInputs } = require('../middleware/inputValidation');
const { fileValidator, multerFileFilter } = require('../middleware/fileValidation');
const { uploadLimiter } = require('../middleware/rateLimiter');

const {
  initializeStaffUsersTable,
  createStaffUser,
  verifyCredentials,
  getStaffProfile,
} = require('./staff_auth');

// Add JSON middleware specifically for this router
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
router.use(sanitizeInputs);

// ---- BRANCH CODE GATE ----
// ALL staff routes REQUIRE a branch code (header X-Branch-Code, query ?branchCode=, or body.branchCode).
// Without it, the request is REJECTED with 400. This prevents accidentally saving data
// to the master database instead of the correct branch database.
// The login route also goes through this gate — the login form sends branchCode in the body.
router.use(validateBranchCode);



// ---------------------------------------------------------------------
// Helper function to safely create schema
// ---------------------------------------------------------------------
const createSchemaIfNotExists = async (client, schemaName) => {
  try {
    const schemaCheck = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = $1
    `, [schemaName]);

    if (schemaCheck.rows.length === 0) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      console.log(`Created schema: ${schemaName}`);
    } else {
      console.log(`Schema already exists: ${schemaName}`);
    }
  } catch (error) {
    if (error.code === '23505' || error.message?.includes('already exists')) {
      return;
    }
    console.error(`Error creating schema ${schemaName}:`, error.message);
  }
};

// ---------------------------------------------------------------------
// 1. Multer â€“ file uploads (dynamic fields for custom uploads)
// ---------------------------------------------------------------------
const uploadDir = path.join(__dirname, '../uploads');
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniq}${path.extname(file.originalname)}`);
  },
});

// Create dynamic multer configuration that accepts any field with file validation
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max (matches frontend)
  fileFilter: multerFileFilter // Add file type validation
}).any(); // Use .any() to accept any field names

// ---------------------------------------------------------------------
// 2. Global staff-counter (global_staff_id)
// ---------------------------------------------------------------------
const initializeStaffCounter = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_counter (
        id SERIAL PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      );
    `);
    const { rows } = await pool.query(
      'SELECT count FROM staff_counter WHERE id = 1'
    );
    if (rows.length === 0) {
      await pool.query('INSERT INTO staff_counter (id, count) VALUES (1, 0)');
    }
    console.log('Staff counter initialized');
  } catch (e) {
    console.error('Staff counter init error:', e);
  }
};

const getNextGlobalStaffId = async (client) => {
  const db = client || pool;
  const { rows } = await db.query(
    'UPDATE staff_counter SET count = count + 1 WHERE id = 1 RETURNING count'
  );
  return rows[0].count;
};

// ---------------------------------------------------------------------
// 3. Schedule schema (teachers + availability)
// ---------------------------------------------------------------------
const ensureScheduleSchemaColumns = async (client) => {
  try {
    await createSchemaIfNotExists(client, 'schedule_schema');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.teachers (
        id SERIAL PRIMARY KEY,
        global_staff_id INTEGER NOT NULL UNIQUE,
        teacher_name VARCHAR(100) NOT NULL UNIQUE,
        teacher_type VARCHAR(50) NOT NULL DEFAULT 'full_time',
        max_periods_per_day INTEGER DEFAULT 4,
        max_periods_per_week INTEGER DEFAULT 20,
        work_days TEXT[] DEFAULT '{}',
        preferred_shifts TEXT[] DEFAULT '{}',
        max_hours_per_day INTEGER DEFAULT 8,
        max_hours_per_week INTEGER DEFAULT 40,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_schema.teacher_availability (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES schedule_schema.teachers(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        shift_group VARCHAR(50) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, day_of_week, shift_group)
      )
    `);

    const cols = [
      { name: 'work_days', type: 'TEXT[]', def: "'{}'" },
      { name: 'preferred_shifts', type: 'TEXT[]', def: "'{}'" },
      { name: 'max_hours_per_day', type: 'INTEGER', def: '8' },
      { name: 'max_hours_per_week', type: 'INTEGER', def: '40' },
    ];

    for (const c of cols) {
      const exists = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='schedule_schema' AND table_name='teachers' AND column_name=$1`,
        [c.name]
      );
      if (exists.rowCount === 0) {
        await client.query(
          `ALTER TABLE schedule_schema.teachers ADD COLUMN ${c.name} ${c.type} DEFAULT ${c.def}`
        );
      }
    }
    console.log('Schedule schema ensured');
  } catch (e) {
    console.error('Schedule schema error:', e.message);
  }
};

const initializeScheduleSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureScheduleSchemaColumns(client);
    await client.query('COMMIT');
    console.log('Schedule schema initialized');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Schedule schema init failed:', e.message);
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------------------
// 3.1 School Schema Points - Teachers Table
// ---------------------------------------------------------------------
const initializeSchoolSchemaPoints = async () => {
  try {
    // Check if schema exists first
    const schemaCheck = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'school_schema_points'
    `);

    if (schemaCheck.rows.length === 0) {
      await pool.query('CREATE SCHEMA school_schema_points');
      console.log('Created school_schema_points schema');
    } else {
      console.log('school_schema_points schema already exists');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_schema_points.teachers (
        id SERIAL PRIMARY KEY,
        global_staff_id INTEGER NOT NULL UNIQUE,
        teacher_name VARCHAR(100) NOT NULL,
        staff_work_time VARCHAR(50) NOT NULL DEFAULT 'Full Time',
        role VARCHAR(100) NOT NULL,
        staff_enrollment_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add unique constraint for teacher_name
    try {
      await pool.query(`
        ALTER TABLE school_schema_points.teachers 
        ADD CONSTRAINT teachers_teacher_name_unique UNIQUE (teacher_name)
      `);
    } catch (error) {
      console.log('Teacher name unique constraint might already exist:', error.message);
    }

    console.log('School schema points teachers table initialized');
  } catch (e) {
    console.error('School schema points init error:', e);
    throw e;
  }
};

const addTeacherToSchoolSchemaPoints = async (
  client,
  globalStaffId,
  teacherName,
  staffWorkTime,
  role,
  staffEnrollmentType
) => {
  try {
    // Ensure work time is properly formatted
    const formattedWorkTime = staffWorkTime === 'Part time' ? 'Part Time' : 
                            staffWorkTime === 'Full time' ? 'Full Time' :
                            staffWorkTime || 'Full Time';

    await client.query(`
      INSERT INTO school_schema_points.teachers 
        (global_staff_id, teacher_name, staff_work_time, role, staff_enrollment_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (global_staff_id) 
      DO UPDATE SET
        teacher_name = EXCLUDED.teacher_name,
        staff_work_time = EXCLUDED.staff_work_time,
        role = EXCLUDED.role,
        staff_enrollment_type = EXCLUDED.staff_enrollment_type,
        updated_at = CURRENT_TIMESTAMP
    `, [globalStaffId, teacherName, formattedWorkTime, role, staffEnrollmentType]);
    
    console.log(`Teacher ${teacherName} added to school_schema_points.teachers with work time: ${formattedWorkTime}`);
  } catch (e) {
    console.error('addTeacherToSchoolSchemaPoints error:', e);
    throw e;
  }
};

// ---------------------------------------------------------------------
// 3.2 School Schema Points - Teachers Period Table
// ---------------------------------------------------------------------
const initializeTeachersPeriodTable = async () => {
  try {
    await createSchemaIfNotExists(pool, 'school_schema_points');

    await pool.query(`
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
    console.log('Teachers period table initialized');
  } catch (e) {
    console.error('Teachers period table init error:', e);
    throw e;
  }
};

// ---------------------------------------------------------------------
// 4. FORM METADATA SYSTEM - NEW FOR FIELD TYPE PRESERVATION
// ---------------------------------------------------------------------
const initializeFormMetadata = async () => {
  try {
    await createSchemaIfNotExists(pool, 'form_metadata');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_metadata.field_types (
        id SERIAL PRIMARY KEY,
        schema_name VARCHAR(100) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        column_name VARCHAR(100) NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        required BOOLEAN DEFAULT FALSE,
        options JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(schema_name, table_name, column_name)
      )
    `);
    
    console.log('Form metadata system initialized');
  } catch (e) {
    console.error('Form metadata init error:', e);
    throw e;
  }
};

// ---------------------------------------------------------------------
// 5. Helper utilities
// ---------------------------------------------------------------------
const sanitizeStaffTypeToSchema = (type) =>
  `staff_${type.replace(/\s+/g, '_').toLowerCase()}`;
const sanitizeClassName = (name) =>
  name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

const BASE_COLUMNS = new Set([
  'global_staff_id',
  'staff_id',
  'image_staff',
  'name',
  'gender',
  'role',
  'staff_enrollment_type',
  'staff_work_time',
  'machine_id',
  'phone',
]);

const updateStaffIds = async (schemaName, className, client = null) => {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT id FROM "${schemaName}"."${className}" ORDER BY LOWER(name) ASC`
  );
  for (let i = 0; i < rows.length; i++) {
    await db.query(
      `UPDATE "${schemaName}"."${className}" SET staff_id = $1 WHERE id = $2`,
      [i + 1, rows[i].id]
    );
  }
};

const getNextMachineId = async (client) => {
  const schemas = ['staff_teachers', 'staff_administrative_staff', 'staff_supportive_staff', 'staff_finance'];
  const used = new Set();
  for (const schema of schemas) {
    try {
      const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema]);
      for (const t of tables.rows) {
        const res = await client.query(`SELECT machine_id FROM "${schema}"."${t.table_name}" WHERE machine_id IS NOT NULL AND machine_id != ''`);
        for (const r of res.rows) {
          const num = parseInt(r.machine_id, 10);
          if (!isNaN(num)) used.add(num);
        }
      }
    } catch (e) { /* schema may not exist */ }
  }
  let next = 100001;
  while (used.has(next)) next++;
  return String(next);
};

// FIXED: Completely rewritten to handle day conversion properly
const extractPartTimeSchedule = (data) => {
  const dayMap = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
    'Sunday': 7,
  };

  console.log('Extracting schedule from data:', {
    work_days: data.work_days,
    shifts: data.shifts,
    availability: data.availability,
    max_hours_per_day: data.max_hours_per_day,
    max_hours_per_week: data.max_hours_per_week
  });

  // Handle work_days - ensure it's an array
  let workDays = data.work_days || [];
  if (typeof workDays === 'string') {
    try {
      workDays = JSON.parse(workDays);
    } catch (e) {
      console.error('Error parsing work_days:', e);
      workDays = [];
    }
  }

  // Handle shifts - ensure it's an array
  let shifts = data.shifts || [];
  if (typeof shifts === 'string') {
    try {
      shifts = JSON.parse(shifts);
    } catch (e) {
      console.error('Error parsing shifts:', e);
      shifts = [];
    }
  }

  // Handle availability - this is the main issue
  let availabilityData = data.availability || [];
  if (typeof availabilityData === 'string') {
    try {
      availabilityData = JSON.parse(availabilityData);
      console.log('Successfully parsed availability from string to:', availabilityData);
    } catch (e) {
      console.error('Error parsing availability JSON:', e);
      availabilityData = [];
    }
  }

  // Process availability slots
  const availability = [];
  if (Array.isArray(availabilityData)) {
    for (const slot of availabilityData) {
      if (slot && slot.active === true) {
        // Convert day name to integer - this is the critical fix
        const dayName = slot.day;
        const dayNumber = dayMap[dayName];
        
        if (dayNumber === undefined) {
          console.warn(`Invalid day name: "${dayName}", skipping slot. Valid days:`, Object.keys(dayMap));
          continue;
        }

        availability.push({
          day_of_week: dayNumber, // This MUST be an integer
          shift_group: slot.shift || 'morning',
          start_time: slot.start_time || '07:00',
          end_time: slot.end_time || '17:30',
          is_available: true,
        });
      }
    }
  }

  console.log('Processed availability slots:', availability);

  return {
    work_days: workDays.length ? workDays : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    preferred_shifts: shifts.length ? shifts : ['morning', 'afternoon'],
    availability,
    max_hours_per_day: parseInt(data.max_hours_per_day) || 8,
    max_hours_per_week: parseInt(data.max_hours_per_week) || 40,
  };
};

// FIXED: Completely rewritten to handle work_days conversion properly
const addTeacherToScheduleSystem = async (
  client,
  globalStaffId,
  teacherName,
  schedule,
  teacherType = 'part_time'
) => {
  try {
    await ensureScheduleSchemaColumns(client);

    // Convert work_days from string names to integers if needed
    const dayMap = {
      'Monday': 1,
      'Tuesday': 2,
      'Wednesday': 3,
      'Thursday': 4,
      'Friday': 5,
      'Saturday': 6,
      'Sunday': 7,
    };

    let workDaysArray = schedule.work_days || [];
    
    // If work_days contains string day names, convert to integers
    if (workDaysArray.length > 0 && typeof workDaysArray[0] === 'string') {
      workDaysArray = workDaysArray.map(day => dayMap[day] || 1); // Default to Monday if invalid
      console.log('Converted work_days from strings to integers:', workDaysArray);
    }

    console.log('Adding teacher to schedule system:', {
      globalStaffId,
      teacherName,
      teacherType,
      schedule: {
        work_days: workDaysArray,
        preferred_shifts: schedule.preferred_shifts,
        availability_count: schedule.availability ? schedule.availability.length : 0,
        max_hours_per_day: schedule.max_hours_per_day,
        max_hours_per_week: schedule.max_hours_per_week
      }
    });

    const { rows } = await client.query(
      `INSERT INTO schedule_schema.teachers
         (global_staff_id, teacher_name, teacher_type,
          work_days, preferred_shifts, max_hours_per_day, max_hours_per_week)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (global_staff_id) DO UPDATE SET
         teacher_name=$2, teacher_type=$3,
         work_days=$4, preferred_shifts=$5,
         max_hours_per_day=$6, max_hours_per_week=$7,
         updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
      [
        globalStaffId,
        teacherName,
        teacherType,
        workDaysArray, // Use the converted integer array
        schedule.preferred_shifts,
        schedule.max_hours_per_day,
        schedule.max_hours_per_week,
      ]
    );

    const teacherId = rows[0].id;
    
    // Only process availability if we have data
    if (schedule.availability && schedule.availability.length > 0) {
      await client.query(
        'DELETE FROM schedule_schema.teacher_availability WHERE teacher_id = $1',
        [teacherId]
      );

      let insertedSlots = 0;
      for (const slot of schedule.availability) {
        try {
          // CRITICAL: Ensure day_of_week is an integer
          const dayOfWeek = parseInt(slot.day_of_week);
          if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
            console.warn(`Invalid day_of_week: ${slot.day_of_week}, must be 1-7. Skipping slot.`);
            continue;
          }

          console.log('Inserting availability slot:', {
            teacherId,
            day_of_week: dayOfWeek,
            shift_group: slot.shift_group,
            start_time: slot.start_time,
            end_time: slot.end_time
          });

          await client.query(
            `INSERT INTO schedule_schema.teacher_availability
               (teacher_id, day_of_week, shift_group, start_time, end_time, is_available)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              teacherId,
              dayOfWeek, // This is now guaranteed to be an integer
              slot.shift_group,
              slot.start_time,
              slot.end_time,
              slot.is_available,
            ]
          );
          insertedSlots++;
        } catch (slotError) {
          console.error('Error inserting availability slot:', slotError);
          // Continue with other slots even if one fails
        }
      }
      console.log(`Successfully inserted ${insertedSlots} availability slots for teacher ${teacherName}`);
    } else {
      console.log('No availability slots to insert for teacher:', teacherName);
    }
  } catch (e) {
    console.error('addTeacherToScheduleSystem error:', e);
    throw e;
  }
};

// ---------------------------------------------------------------------
// 6. Startup initialisations
// ---------------------------------------------------------------------
initializeStaffCounter().catch(err => console.error('Staff counter init:', err));
initializeStaffUsersTable().catch(err => console.error('Staff users init:', err));
initializeScheduleSchema().catch(err => console.error('Schedule schema init:', err));
initializeSchoolSchemaPoints().catch(err => console.error('School schema init:', err));
initializeTeachersPeriodTable().catch(err => console.error('Teachers period init:', err));
initializeFormMetadata().catch(err => console.error('Form metadata init:', err));

// ---------------------------------------------------------------------
// 7. ROUTES
// ---------------------------------------------------------------------

// 7.1 Serve uploaded files
router.get('/uploads/:filename', async (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.filename);
    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// 7.2 Part-time schedule options (for UI)
router.get('/part-time-options', async (req, res) => {
  res.json({
    days: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    shifts: ['morning', 'afternoon', 'evening'],
    default_times: {
      morning: { start_time: '07:00', end_time: '12:30' },
      afternoon: { start_time: '12:30', end_time: '17:30' },
      evening: { start_time: '17:30', end_time: '21:00' },
    },
    max_hours: { per_day: 8, per_week: 40 },
  });
});

// 7.3 List classes for a staff type
router.get('/classes', async (req, res) => {
  const { staffType } = req.query;
  if (!staffType)
    return res.status(400).json({ error: 'staffType required' });

  const schema = sanitizeStaffTypeToSchema(staffType);
  try {
    const { rows } = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_name <> 'staff_counter'`,
      [schema]
    );
    res.json(rows.map((r) => r.table_name));
  } catch (e) {
    res
      .status(500)
      .json({ error: 'Failed to fetch classes', details: e.message });
  }
});

// 7.4 Column metadata for a specific form - FIXED FIELD TYPES
router.get('/columns/:staffType/:className', async (req, res) => {
  const { staffType, className: raw } = req.params;
  const className = sanitizeClassName(raw);
  const schema = sanitizeStaffTypeToSchema(staffType);

  try {
    // Ensure form_metadata.field_types exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_metadata.field_types (
        id SERIAL PRIMARY KEY,
        schema_name VARCHAR(100) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        column_name VARCHAR(100) NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        required BOOLEAN DEFAULT FALSE,
        options JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(schema_name, table_name, column_name)
      )
    `);
    
    // Get database column info
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, className]
    );

    // Get field type metadata
    const { rows: metadataRows } = await pool.query(
      `SELECT column_name, field_type, required, options
       FROM form_metadata.field_types
       WHERE schema_name = $1 AND table_name = $2`,
      [schema, className]
    );

    // Create metadata lookup
    const metadataLookup = {};
    metadataRows.forEach(row => {
      metadataLookup[row.column_name] = {
        field_type: row.field_type,
        required: row.required,
        options: row.options
      };
    });

    const columns = rows.map((c) => {
      let fieldType;
      let options = [];
      let required = c.is_nullable === 'NO';

      // Use metadata if available - this preserves the original field types
      if (metadataLookup[c.column_name]) {
        fieldType = metadataLookup[c.column_name].field_type;
        required = metadataLookup[c.column_name].required;
        options = metadataLookup[c.column_name].options || [];
        
        console.log(`Using metadata for ${c.column_name}: ${fieldType}`);
      } 
      // Fallback to database type mapping only for standard fields
      else if (c.column_name === 'image_staff') {
        fieldType = 'upload';
      }
      else if (c.data_type === 'boolean') {
        fieldType = 'checkbox';
      }
      else if (c.data_type === 'integer' || c.data_type === 'numeric' || c.data_type === 'bigint') {
        fieldType = 'number';
      }
      else if (c.data_type === 'date') {
        fieldType = 'date';
      }
      else if (c.data_type.includes('character varying') || c.data_type === 'text') {
        // Check for upload field patterns
        if (c.column_name.includes('_file') || c.column_name.includes('_upload') || 
            c.column_name.includes('_image') || c.column_name.includes('_photo') ||
            c.column_name.includes('_document')) {
          fieldType = 'upload';
        } else {
          fieldType = 'text';
        }
      }
      else {
        fieldType = 'text';
      }

      return {
        column_name: c.column_name,
        data_type: fieldType, // Use the preserved field type
        is_nullable: c.is_nullable,
        required: required,
        options: options
      };
    });

    // Add dropdown options for standard fields
    const addOpts = (name, opts) => {
      const col = columns.find((c) => c.column_name === name);
      if (col) {
        col.options = opts;
        // Don't override the data_type if it's already set from metadata
        if (!metadataLookup[name]) {
          col.data_type = 'select';
        }
      }
    };
    
    addOpts('gender', ['Male', 'Female', 'Other']);
    addOpts('role', [
      'Teacher',
      'Director',
      'Coordinator',
      'Supervisor',
      'Deputy director',
      'Purchaser',
      'Cashier',
      'Accountant',
      'Guard',
      'Cleaner',
      'Department Head',
      'Counselor',
      'Instructor',
      'Librarian',
      'Nurse',
      'Technician',
      'Assistant',
      'Manager',
      'Trainer',
      'Advisor',
      'Inspector',
    ]);
    addOpts('staff_enrollment_type', ['Permanent', 'Contract']);
    addOpts('staff_work_time', ['Full Time', 'Part Time']);

    console.log('Returning columns with preserved types:', columns.map(c => ({ name: c.column_name, type: c.data_type })));
    res.json(columns);
  } catch (e) {
    console.error('Error fetching columns:', e);
    res
      .status(500)
      .json({ error: 'Failed to fetch columns', details: e.message });
  }
});

// 7.5 CREATE FORM (dynamic table per staff type) - FIXED PHONE FIELD TYPE
router.post('/create-form', async (req, res) => {
  // Validate request body exists
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing' });
  }

  const { staffType, className: raw, customFields = [] } = req.body;
  
  // Validate required fields
  if (!staffType || !raw) {
    return res.status(400).json({ 
      error: 'Missing required fields: staffType and className are required' 
    });
  }

  if (
    !['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'].includes(staffType) ||
    !raw
  )
    return res.status(400).json({ error: 'Invalid staffType or className' });

  const className = sanitizeClassName(raw);
  const schema = sanitizeStaffTypeToSchema(staffType);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Create schema and table
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

    const existing = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name <> 'staff_counter'`,
      [schema]
    );
    if (existing.rowCount)
      throw new Error('A form already exists for this staff type');

    if (!/^[a-z0-9_]+$/.test(className))
      throw new Error('Class name may only contain letters, numbers and _');

    const baseCols = [
      'id SERIAL PRIMARY KEY',
      'global_staff_id INTEGER NOT NULL',
      'staff_id INTEGER NOT NULL',
      'image_staff VARCHAR(255)',
      'name VARCHAR(100) NOT NULL',
      'gender VARCHAR(50) NOT NULL',
      'role VARCHAR(100) NOT NULL',
      'staff_enrollment_type VARCHAR(50) NOT NULL',
      'staff_work_time VARCHAR(50) NOT NULL',
      'machine_id VARCHAR(50) UNIQUE',
      'phone BIGINT',
    ];

    // PostgreSQL reserved keywords that cannot be used as column names
    const reservedKeywords = [
      'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 
      'authorization', 'binary', 'both', 'case', 'cast', 'check', 'collate', 'column', 
      'concurrently', 'constraint', 'create', 'cross', 'current_catalog', 'current_date', 
      'current_role', 'current_schema', 'current_time', 'current_timestamp', 'current_user', 
      'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 
      'fetch', 'for', 'foreign', 'from', 'grant', 'group', 'having', 'in', 'initially', 
      'intersect', 'into', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime', 
      'localtimestamp', 'natural', 'not', 'null', 'offset', 'on', 'only', 'or', 'order', 
      'using', 'verbose', 'when', 'where', 'window', 'with'
    ];

    // Process custom fields
    for (const f of customFields) {
      if (BASE_COLUMNS.has(f.name)) continue;
      
      let def = '';
      let fieldType = f.type;
      
      // Validate field name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name)) {
        throw new Error(`Invalid field name: "${f.name}". Field names must start with a letter or underscore and contain only letters, numbers, and underscores.`);
      }

      // Check if field name is a reserved keyword
      if (reservedKeywords.includes(f.name.toLowerCase())) {
        throw new Error(`Field name "${f.name}" is a PostgreSQL reserved keyword. Please choose a different name.`);
      }

      // Map field types to database types - PRESERVE ORIGINAL TYPES
      // SPECIAL CASE: For phone fields, use BIGINT to handle large numbers
      if (f.name === 'phone') {
        def = 'BIGINT';
        fieldType = 'number';
      } else {
        switch (f.type) {
          case 'text':
            def = 'VARCHAR(255)';
            break;
          case 'textarea':
            def = 'TEXT'; // Use TEXT for longer content
            fieldType = 'textarea'; // Preserve the textarea type
            break;
          case 'number':
            def = 'BIGINT'; // Changed from INTEGER to BIGINT for large numbers
            break;
          case 'date':
            def = 'DATE';
            break;
          case 'checkbox':
            def = 'BOOLEAN DEFAULT FALSE';
            fieldType = 'checkbox'; // Preserve the checkbox type
            break;
          case 'select':
            def = 'VARCHAR(255)';
            fieldType = 'select'; // Preserve the select type
            break;
          case 'multiple-checkbox':
            def = 'VARCHAR(255)'; // Store as comma-separated values or JSON
            fieldType = 'multiple-checkbox'; // Preserve the multiple-checkbox type
            break;
          case 'upload':
            def = 'VARCHAR(255)'; // Store file paths
            fieldType = 'upload'; // Preserve the upload type
            break;
          default:
            def = 'VARCHAR(255)';
        }
      }
      
      baseCols.push(`${f.name} ${def}${f.required ? ' NOT NULL' : ''}`);

      // Store field metadata with preserved types
      await client.query(`
        INSERT INTO form_metadata.field_types 
        (schema_name, table_name, column_name, field_type, required, options)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [schema, className, f.name, fieldType, f.required, JSON.stringify(f.options || [])]);
      
      console.log(`Stored metadata for ${f.name}: type=${fieldType}, required=${f.required}, db_type=${def}`);
    }

    // Create the main table
    await client.query(
      `CREATE TABLE "${schema}"."${className}" (${baseCols.join(', ')})`
    );
    
    await client.query('COMMIT');
    res.json({ message: 'Form created successfully' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Create form error:', e);
    res.status(500).json({ error: 'Failed to create form', details: e.message });
  } finally {
    client.release();
  }
});

// 7.6 DELETE FORM
router.delete('/delete-form', async (req, res) => {
  const { staffType, className: raw } = req.body;
  if (!staffType || !raw)
    return res.status(400).json({ error: 'staffType & className required' });

  const className = sanitizeClassName(raw);
  const schema = sanitizeStaffTypeToSchema(staffType);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Delete main table
    await client.query(`DROP TABLE IF EXISTS "${schema}"."${className}" CASCADE`);
    
    // Delete metadata
    await client.query(`
      DELETE FROM form_metadata.field_types 
      WHERE schema_name = $1 AND table_name = $2
    `, [schema, className]);
    
    await client.query('COMMIT');
    res.json({ message: 'Form deleted' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Delete failed', details: e.message });
  } finally {
    client.release();
  }
});

// 7.7 ADD SINGLE STAFF (with files, user account, schedule) - FIXED MULTER
router.post('/add-staff', (req, res, next) => {
  // Capture branch code from header BEFORE multer (multer callback can lose async context)
  const incomingBranchCode = req.headers['x-branch-code'];
  if (incomingBranchCode) {
    req._branchCode = incomingBranchCode;
  }
  upload(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err.message);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
}, async (req, res) => {
  // Restore branch context if it was lost across multer callback
  const { setBranchCode } = require('../config/db');
  if (req._branchCode && !require('../config/db').getBranchCode()) {
    setBranchCode(req._branchCode);
  }
  const { staffType, class: rawClass, uploadFields: rawUploadFields = '[]' } = req.body;

  // ---- Input validation ----
  if (!staffType) {
    return res.status(400).json({ error: 'staffType is required' });
  }
  if (!rawClass) {
    return res.status(400).json({ error: 'class is required' });
  }

  // ---- LAST LINE OF DEFENSE: Verify branch code exists ----
  // The global gate + validateBranchCode middleware should catch this,
  // but this is a final check inside the handler itself.
  if (!req.branchCode && !req.headers['x-branch-code']) {
    console.error('CRITICAL: Staff registration attempted without branch code!');
    return res.status(400).json({
      error: 'Branch code is required',
      message: 'Staff registration requires a branch code. Please log in to a branch first.'
    });
  }

  let uploadFields;
  try {
    uploadFields = JSON.parse(rawUploadFields);
  } catch {
    uploadFields = [];
  }

  // ---- Parse form data (JSON-stringified values from frontend) ----
  const formData = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (!['staffType', 'class', 'uploadFields'].includes(k)) {
      try {
        formData[k] = JSON.parse(v);
      } catch {
        formData[k] = v;
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const className = sanitizeClassName(rawClass);
    const schema = sanitizeStaffTypeToSchema(staffType);

    console.log('Parsed form data:', {
      staffType, className, 
      formDataKeys: Object.keys(formData),
      availabilityType: typeof formData.availability,
      availability: formData.availability
    });

    // ---- Verify table exists & fetch columns ----
    let tableCols = [];
    const colRes = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, className]
    );
    if (colRes.rowCount > 0) {
      tableCols = colRes.rows.map((r) => r.column_name);
    } else {
      // Auto-create table if it doesn't exist
      const baseColDefs = [
        '"global_staff_id" INTEGER NOT NULL',
        '"staff_id" INTEGER NOT NULL',
        '"image_staff" VARCHAR(255)',
        '"name" VARCHAR(255) NOT NULL',
        '"gender" VARCHAR(50) NOT NULL',
        '"role" VARCHAR(100) NOT NULL',
        '"staff_enrollment_type" VARCHAR(100) NOT NULL',
        '"staff_work_time" VARCHAR(50) NOT NULL',
        '"machine_id" VARCHAR(100) NOT NULL',
        '"phone" VARCHAR(50) NOT NULL'
      ].join(', ');
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await client.query(`CREATE TABLE IF NOT EXISTS "${schema}"."${className}" (id SERIAL PRIMARY KEY, ${baseColDefs})`);
      tableCols = [...BASE_COLUMNS];
      console.log(`✅ Auto-created table "${schema}"."${className}"`);
    }
    const insertData = {};
    for (const c of tableCols) {
      if (formData.hasOwnProperty(c)) insertData[c] = formData[c];
    }

    // ---- Ensure shift_assignment has a valid value (set default if empty) ----
    if (tableCols.includes('shift_assignment')) {
      if (!insertData.shift_assignment || insertData.shift_assignment === '') {
        insertData.shift_assignment = 'shift1';
      }
    }

    // ---- Auto-generate MachineID (6-digit, unique) ----
    if (!insertData.machine_id || insertData.machine_id === '') {
      insertData.machine_id = await getNextMachineId(client);
    }

    // ---- Phone uniqueness check (normalized: 09... and +2519... treated as same) ----
    if (insertData.phone) {
      const normalized = String(insertData.phone).replace(/\D/g, '').replace(/^0/, '251');
      const phoneCheck = await client.query(
        `SELECT id FROM "${schema}"."${className}" 
         WHERE phone = $1 OR phone = $2 LIMIT 1`,
        [insertData.phone, normalized]
      );
      if (phoneCheck.rows.length > 0) {
        throw new Error('Phone number already exists for another staff member');
      }
    }

    // ---- File handling with dynamic field names ----
    const files = req.files || [];
    console.log('Received files:', files.map(f => ({ fieldname: f.fieldname, filename: f.filename })));

    // Handle image_staff
    const imageStaffFile = files.find(f => f.fieldname === 'image_staff');
    if (imageStaffFile) {
      insertData.image_staff = imageStaffFile.filename;
    }

    // Handle custom upload fields
    for (const field of uploadFields) {
      const file = files.find(f => f.fieldname === field);
      if (file) {
        insertData[field] = file.filename;
        console.log(`Assigned file ${file.filename} to field ${field}`);
      }
    }

    // ---- IDs ----
    const globalStaffId = await getNextGlobalStaffId(client);
    const max = await client.query(
      `SELECT COALESCE(MAX(staff_id),0) AS m FROM "${schema}"."${className}"`
    );
    const staffId = max.rows[0].m + 1;

    // ---- Ensure staff_work_time is properly formatted ----
    if (insertData.staff_work_time) {
      insertData.staff_work_time = insertData.staff_work_time === 'Part time' ? 'Part Time' :
                                  insertData.staff_work_time === 'Full time' ? 'Full Time' :
                                  insertData.staff_work_time;
    } else {
      insertData.staff_work_time = 'Full Time';
    }

    // ---- Normalize phone number to standard format ----
    if (insertData.phone) {
      const phoneStr = String(insertData.phone).replace(/\D/g, '');
      insertData.phone = phoneStr.replace(/^0/, '251');
    }

    // Handle multiple-checkbox fields (convert arrays to strings)
    for (const key in insertData) {
      if (Array.isArray(insertData[key])) {
        insertData[key] = insertData[key].join(',');
      }
    }

    // ---- INSERT ----
    const cols = ['global_staff_id', 'staff_id', ...Object.keys(insertData)];
    const vals = [globalStaffId, staffId, ...Object.values(insertData)];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    
    console.log('Inserting staff record with columns:', cols.length, 'columns');

    const ins = await client.query(
      `INSERT INTO "${schema}"."${className}" (${cols.join(
        ', '
      )}) VALUES (${placeholders}) RETURNING id`,
      vals
    );

    // ---- USER ACCOUNT ----
    let userCredentials = null;
    if (formData.name) {
      try {
        // For Accountant/finance staff, store branch code as class_name so they can log in to Finance App
        const needsFinanceBranch = staffType === 'Accountant' || staffType === 'finance_officer' || staffType === 'cashier'
          || (staffType === 'Administrative Staff' && formData.role === 'Accountant');
        const staffBranchCode = needsFinanceBranch
          ? (req.body.branchCode || req.headers['x-branch-code'] || className).toUpperCase()
          : className;
        userCredentials = await createStaffUser(
          globalStaffId,
          formData.name,
          staffType,
          staffBranchCode
        );
      } catch (e) {
        console.error('User creation error:', e);
        // Don't rollback - staff record was added, but report the error
        userCredentials = { error: e.message };
      }
    }

    // ---- SCHOOL SCHEMA POINTS - TEACHERS TABLE ----
    if (formData.role === 'Teacher' && formData.name) {
      await addTeacherToSchoolSchemaPoints(
        client,
        globalStaffId,
        formData.name,
        formData.staff_work_time || 'Full Time',
        formData.role,
        formData.staff_enrollment_type || 'Permanent'
      );
    }

    // ---- SCHEDULE (only for Teachers) ----
    if (staffType === 'Teachers' && formData.name) {
      const isPart = formData.staff_work_time === 'Part Time';
      console.log(`Processing schedule for ${formData.name}, isPartTime: ${isPart}`);
      
      const sched = isPart
        ? extractPartTimeSchedule(formData)
        : {
            work_days: [1, 2, 3, 4, 5], // Use integers instead of strings for full-time
            preferred_shifts: ['morning', 'afternoon'],
            availability: [],
            max_hours_per_day: 8,
            max_hours_per_week: 40,
          };
      
      console.log('Schedule data to be inserted:', sched);
      
      await addTeacherToScheduleSystem(
        client,
        globalStaffId,
        formData.name,
        sched,
        isPart ? 'part_time' : 'full_time'
      );
    }

    await updateStaffIds(schema, className, client);
    
    // ---- INITIALIZE ATTENDANCE PROFILE (NEW) ----
    if (formData.name && globalStaffId) {
      // Determine role for attendance system
      const attendanceRole = formData.role || 
                            (staffType === 'Teachers' ? 'Teacher' : 'General Staff');
      
      // Ensure table exists in this branch database
      await client.query(`
        CREATE TABLE IF NOT EXISTS staff_attendance_profiles (
          id SERIAL PRIMARY KEY,
          staff_id VARCHAR(50) NOT NULL UNIQUE,
          staff_name VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create initial attendance profile
      await client.query(`
        INSERT INTO staff_attendance_profiles 
        (staff_id, staff_name, role, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (staff_id) DO NOTHING
      `, [globalStaffId.toString(), formData.name, attendanceRole]);
      
      console.log(`Attendance profile created for ${formData.name} (${attendanceRole})`);
    }
    
    await client.query('COMMIT');

    // ---- Send welcome SMS ----
    if (insertData.phone && userCredentials && userCredentials.username) {
      try {
        const { sendSMS } = require('../services/SMSService');
        const { getRenderedTemplate } = require('./smsRoutes');
        const branchCode = (req._branchCode || req.headers['x-branch-code'] || className || '').toUpperCase();
        const branchMatch = branchCode.match(/(\d+)$/);
        const branchName = branchMatch ? `BRANCH ${branchMatch[1]}` : branchCode;
        const welcomeMsg = await getRenderedTemplate('staff_welcome', {
          staff_name: formData.name || '',
          Branch: branchName,
          branchcode: branchCode,
          staff_username: userCredentials.username,
          staff_password: userCredentials.password || ''
        });
        if (welcomeMsg) {
          sendSMS(insertData.phone, welcomeMsg, null, {
            templateKey: 'staff_welcome',
            recipientName: formData.name || 'Staff'
          }).then(result => {
            if (result.success) console.log(`Welcome SMS sent to ${formData.name} at ${insertData.phone}`);
            else console.warn(`Welcome SMS failed for ${formData.name}: ${result.error}`);
          });
        } else {
          console.warn('Welcome SMS skipped for staff: staff_welcome template not found or inactive');
        }
      } catch (smsErr) {
        console.warn('Could not send welcome SMS:', smsErr.message);
      }
    }

    res.json({
      message: 'Staff added successfully',
      userCredentials,
      teacherData: formData.role === 'Teacher' ? {
        name: formData.name,
        workTime: formData.staff_work_time,
        globalStaffId: globalStaffId
      } : null
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Add staff failed:', e);
    res.status(500).json({ error: 'Add staff failed', details: e.message });
  } finally {
    client.release();
  }
});

// 7.8 EXCEL / BULK UPLOAD
router.post('/upload-excel', async (req, res) => {
  const client = await pool.connect();
  try {
    const { staffType, className: rawClass, data } = req.body;
    if (!Array.isArray(data) || data.length === 0)
      return res.status(400).json({ error: 'Invalid data' });

    const className = sanitizeClassName(rawClass);
    const schema = sanitizeStaffTypeToSchema(staffType);

    // ---- column info ----
    const colInfo = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, className]
    );
    const required = colInfo.rows
      .filter(
        (c) =>
          c.is_nullable === 'NO' &&
          !['id', 'global_staff_id', 'staff_id'].includes(c.column_name)
      )
      .map((c) => c.column_name);
    const allCols = colInfo.rows
      .filter((c) => !['id', 'global_staff_id', 'staff_id'].includes(c.column_name))
      .map((c) => c.column_name);

    // ---- validation ----
    const invalid = new Set();
    const missing = new Set();
    for (const row of data) {
      const keys = Object.keys(row).filter(
        (k) => !['id', 'global_staff_id', 'staff_id'].includes(k)
      );
      keys.forEach((k) => !allCols.includes(k) && invalid.add(k));
      required.forEach((r) => {
        if (
          row[r] === undefined ||
          row[r] === null ||
          row[r] === ''
        )
          missing.add(r);
      });
    }
    if (invalid.size)
      return res
        .status(400)
        .json({ error: `Invalid columns: ${[...invalid].join(', ')}` });
    if (missing.size)
      return res
        .status(400)
        .json({ error: `Missing required: ${[...missing].join(', ')}` });

    await client.query('BEGIN');
    const maxStaff = await client.query(
      `SELECT COALESCE(MAX(staff_id),0) AS m FROM "${schema}"."${className}"`
    );
    let curStaffId = maxStaff.rows[0].m;

    const createdUsers = [];
    const schoolSchemaErrors = [];
    const teacherData = [];

    for (const row of data) {
      curStaffId++;
      const globalStaffId = await getNextGlobalStaffId();

      const insertObj = {};
      for (const c of allCols) {
        if (row.hasOwnProperty(c)) {
          const type = colInfo.rows.find((ci) => ci.column_name === c).data_type;
          insertObj[c] =
            type === 'boolean'
              ? row[c] === true || row[c] === 'true'
              : row[c];
        }
      }

      // Format work time consistently
      if (insertObj.staff_work_time) {
        insertObj.staff_work_time = insertObj.staff_work_time === 'Part time' ? 'Part Time' :
                                   insertObj.staff_work_time === 'Full time' ? 'Full Time' :
                                   insertObj.staff_work_time;
      } else {
        insertObj.staff_work_time = 'Full Time';
      }

      const cols = ['global_staff_id', 'staff_id', ...Object.keys(insertObj)];
      const vals = [
        globalStaffId,
        curStaffId,
        ...Object.values(insertObj),
      ];
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO "${schema}"."${className}" (${cols.join(
          ', '
        )}) VALUES (${ph})`,
        vals
      );

      // Track teacher data for response
      if (row.role === 'Teacher' && row.name) {
        teacherData.push({
          name: row.name,
          workTime: insertObj.staff_work_time,
          globalStaffId: globalStaffId
        });
      }

      // user + schedule + school schema points
      if (row.name) {
        try {
          const needsFinanceBranch = staffType === 'Accountant' || staffType === 'finance_officer' || staffType === 'cashier'
            || (staffType === 'Administrative Staff' && row.role === 'Accountant');
          const staffBranchCode = needsFinanceBranch
            ? (req.body.branchCode || req.headers['x-branch-code'] || className).toUpperCase()
            : className;
          const creds = await createStaffUser(
            globalStaffId,
            row.name,
            staffType,
            staffBranchCode
          );
          if (creds) createdUsers.push({ name: row.name, ...creds });

          // Add to school_schema_points.teachers if role is Teacher
          if (row.role === 'Teacher') {
            try {
              await addTeacherToSchoolSchemaPoints(
                client,
                globalStaffId,
                row.name,
                insertObj.staff_work_time || 'Full Time',
                row.role,
                row.staff_enrollment_type || 'Permanent'
              );
            } catch (e) {
              schoolSchemaErrors.push({ name: row.name, error: e.message });
            }
          }

          if (row.role === 'Teacher') {
            const isPart = insertObj.staff_work_time === 'Part Time';
            const sched = isPart
              ? extractPartTimeSchedule(row)
              : {
                  work_days: [1, 2, 3, 4, 5], // Use integers instead of strings for full-time
                  preferred_shifts: ['morning', 'afternoon'],
                  availability: [],
                  max_hours_per_day: 8,
                  max_hours_per_week: 40,
                };
            await addTeacherToScheduleSystem(
              client,
              globalStaffId,
              row.name,
              sched,
              isPart ? 'part_time' : 'full_time'
            );
          }
        } catch (e) {
          console.error('User/Schedule bulk error:', e);
        }
      }
    }

    await updateStaffIds(schema, className, client);
    await client.query('COMMIT');
    res.json({ 
      message: 'Bulk upload successful', 
      createdUsers,
      teacherData,
      schoolSchemaErrors: schoolSchemaErrors.length > 0 ? schoolSchemaErrors : undefined
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Bulk upload failed', details: e.message });
  } finally {
    client.release();
  }
});

// 7.9 LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username & password required' });

  try {
    const user = await verifyCredentials(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.staffType === 'Finance') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Finance staff must use the Finance App login at /api/finance-app/login' 
      });
    }

    const profile = await getStaffProfile(
      user.globalStaffId,
      user.staffType,
      user.className
    );
    if (!profile)
      return res.status(404).json({ error: 'Profile not found' });

    const role =
      user.staffType === 'Teachers'
        ? 'teacher'
        : 'staff';

    // Generate JWT token with proper secret using centralized function
    const token = generateToken(
      { 
        id: user.globalStaffId, 
        role, 
        username: user.username,
        userType: 'staff', // Add userType for finance auth
        staffType: user.staffType,
        className: user.className
      },
      process.env.JWT_EXPIRES_IN || '24h'
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.globalStaffId,
        username: user.username,
        role,
        staffType: user.staffType,
        className: user.className,
      },
      profile,
    });
  } catch (e) {
    res.status(500).json({ error: 'Login failed', details: e.message });
  }
});

// 7.10 PROFILE BY USERNAME (protected route)
router.get('/profile/:username', authenticateWithBranch, async (req, res) => {
  const { username } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT global_staff_id, staff_type, class_name
       FROM staff_users WHERE username = $1`,
      [username]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const profile = await getStaffProfile(
      rows[0].global_staff_id,
      rows[0].staff_type,
      rows[0].class_name
    );

    res.json({
      user: {
        username,
        staffType: rows[0].staff_type,
        className: rows[0].class_name,
      },
      profile,
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: 'Profile fetch failed', details: e.message });
  }
});

// 7.11 FETCH ALL STAFF DATA FOR A CLASS (credentials excluded by default for security)
router.get('/data/:staffType/:className', async (req, res) => {
  const { staffType, className: raw } = req.params;
  const { includeInactive, includePassword } = req.query;
  const className = sanitizeClassName(raw);
  const schema = sanitizeStaffTypeToSchema(staffType);

  try {
    const columnCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = $1 AND table_name = $2 AND column_name = 'is_active'`,
      [schema, className]
    );
    
    // Ensure staff_users table exists for the LEFT JOIN
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff_users (
          id SERIAL PRIMARY KEY,
          global_staff_id INTEGER NOT NULL,
          username VARCHAR(100) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          password_plain VARCHAR(100),
          staff_type VARCHAR(50) NOT NULL,
          class_name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (global_staff_id),
          UNIQUE (username)
        )
      `);
    } catch (tableErr) {
      // If staff_users table creation fails, just query without the JOIN
      console.warn('Could not ensure staff_users table, querying without join:', tableErr.message);
    }

    let query;
    const selectCols = includePassword === 'true'
      ? `s.*, COALESCE(u.username, '') as username, u.password_plain as password`
      : `s.*, COALESCE(u.username, '') as username`;

    if (columnCheck.rowCount > 0) {
      if (includeInactive === 'true') {
        query = `SELECT ${selectCols}
                 FROM "${schema}"."${className}" s
                 LEFT JOIN staff_users u ON s.global_staff_id = u.global_staff_id
                 ORDER BY LOWER(s.name) ASC`;
      } else if (includeInactive === 'only') {
        query = `SELECT ${selectCols}
                 FROM "${schema}"."${className}" s
                 LEFT JOIN staff_users u ON s.global_staff_id = u.global_staff_id
                 WHERE s.is_active = FALSE
                 ORDER BY LOWER(s.name) ASC`;
      } else {
        query = `SELECT ${selectCols}
                 FROM "${schema}"."${className}" s
                 LEFT JOIN staff_users u ON s.global_staff_id = u.global_staff_id
                 WHERE s.is_active = TRUE OR s.is_active IS NULL
                 ORDER BY LOWER(s.name) ASC`;
      }
    } else {
      query = `SELECT ${selectCols}
               FROM "${schema}"."${className}" s
               LEFT JOIN staff_users u ON s.global_staff_id = u.global_staff_id
               ORDER BY LOWER(s.name) ASC`;
    }
    
    const { rows } = await pool.query(query);
    res.json({ data: rows });
  } catch (e) {
    // If the error is that staff_users doesn't exist, try without the JOIN
    if (e.code === '42P01' && e.message.includes('staff_users')) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM "${schema}"."${className}" ORDER BY LOWER(name) ASC`
        );
        return res.json({ data: rows.map(r => ({ ...r, username: '' })) });
      } catch (fallbackErr) {
        return res.status(500).json({ error: 'Data fetch failed', details: fallbackErr.message });
      }
    }
    res
      .status(500)
      .json({ error: 'Data fetch failed', details: e.message });
  }
});

// 7.12 GET TEACHER WORK TIMES
router.get('/teacher-work-times', async (req, res) => {
  try {
    // Only return active teachers
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
  } catch (e) {
    console.error('Error fetching teacher work times:', e);
    res.status(500).json({ error: 'Failed to fetch teacher work times', details: e.message });
  }
});

// 7.13 DELETE staff member
router.delete('/delete-staff', async (req, res) => {
  const { globalStaffId, staffType, className: raw } = req.body;
  
  if (!globalStaffId || !staffType || !raw) {
    return res.status(400).json({ error: 'Missing required fields: globalStaffId, staffType, className' });
  }

  const className = sanitizeClassName(raw);
  const schema = sanitizeStaffTypeToSchema(staffType);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get staff details before deletion for cleanup
    const staffResult = await client.query(
      `SELECT * FROM "${schema}"."${className}" WHERE global_staff_id = $1`,
      [globalStaffId]
    );

    if (staffResult.rows.length === 0) {
      throw new Error('Staff member not found');
    }

    const staff = staffResult.rows[0];

    // Delete from main staff table
    await client.query(
      `DELETE FROM "${schema}"."${className}" WHERE global_staff_id = $1`,
      [globalStaffId]
    );

    // Delete from staff_users table
    await client.query(
      'DELETE FROM staff_users WHERE global_staff_id = $1',
      [globalStaffId]
    );

    // Delete from school_schema_points.teachers if exists
    await client.query(
      'DELETE FROM school_schema_points.teachers WHERE global_staff_id = $1',
      [globalStaffId]
    );

    // Delete from schedule_schema.teachers if exists
    await client.query(
      'DELETE FROM schedule_schema.teachers WHERE global_staff_id = $1',
      [globalStaffId]
    );

    // Delete from teacher_availability if exists
    await client.query(
      `DELETE FROM schedule_schema.teacher_availability 
       WHERE teacher_id IN (
         SELECT id FROM schedule_schema.teachers WHERE global_staff_id = $1
       )`,
      [globalStaffId]
    );

    // Clean up uploaded files
    if (staff.image_staff) {
      try {
        await fs.unlink(path.join(uploadDir, staff.image_staff));
      } catch (fileError) {
        console.warn('Could not delete staff image:', fileError.message);
      }
    }

    await client.query('COMMIT');
    
    res.json({ 
      message: 'Staff member deleted successfully',
      deletedStaff: {
        name: staff.name,
        globalStaffId: staff.global_staff_id
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete staff error:', error);
    res.status(500).json({ error: 'Failed to delete staff member', details: error.message });
  } finally {
    client.release();
  }
});

// 7.14 UPDATE staff member
router.put('/update-staff', upload, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { globalStaffId, staffType, className: raw, updates: updatesStr } = req.body;
    
    if (!globalStaffId || !staffType || !raw || !updatesStr) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const className = sanitizeClassName(raw);
    const schema = sanitizeStaffTypeToSchema(staffType);
    const updates = JSON.parse(updatesStr);

    // Handle file uploads
    const files = req.files || [];
    const updateData = { ...updates };

    // Process image upload
    const imageStaffFile = files.find(f => f.fieldname === 'image_staff');
    if (imageStaffFile) {
      const oldStaff = await client.query(
        `SELECT image_staff FROM "${schema}"."${className}" WHERE global_staff_id = $1`,
        [globalStaffId]
      );

      // Delete old image if exists
      if (oldStaff.rows[0]?.image_staff) {
        try {
          await fs.unlink(path.join(uploadDir, oldStaff.rows[0].image_staff));
        } catch (fileError) {
          console.warn('Could not delete old image:', fileError.message);
        }
      }

      updateData.image_staff = imageStaffFile.filename;
    }

    // Build dynamic update query
    const setClauses = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(globalStaffId);

    const updateQuery = `
      UPDATE "${schema}"."${className}" 
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE global_staff_id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(updateQuery, values);
    
    if (result.rows.length === 0) {
      throw new Error('Staff member not found');
    }

    const updatedStaff = result.rows[0];

    // Update related tables if needed
    if (updates.name || updates.role || updates.staff_work_time) {
      // Update school_schema_points.teachers
      await client.query(`
        UPDATE school_schema_points.teachers 
        SET teacher_name = $1, role = $2, staff_work_time = $3, updated_at = CURRENT_TIMESTAMP
        WHERE global_staff_id = $4
      `, [
        updates.name || updatedStaff.name,
        updates.role || updatedStaff.role,
        updates.staff_work_time || updatedStaff.staff_work_time,
        globalStaffId
      ]);

      // Update schedule_schema.teachers
      await client.query(`
        UPDATE schedule_schema.teachers 
        SET teacher_name = $1, teacher_type = $2, updated_at = CURRENT_TIMESTAMP
        WHERE global_staff_id = $3
      `, [
        updates.name || updatedStaff.name,
        (updates.staff_work_time || updatedStaff.staff_work_time) === 'Part Time' ? 'part_time' : 'full_time',
        globalStaffId
      ]);
    }

    await client.query('COMMIT');
    
    res.json({ 
      message: 'Staff member updated successfully',
      updatedStaff: updatedStaff
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Failed to update staff member', details: error.message });
  } finally {
    client.release();
  }
});

// 7.15 GET staff member by ID
router.get('/staff/:globalStaffId', async (req, res) => {
  const { globalStaffId } = req.params;
  
  if (!globalStaffId) {
    return res.status(400).json({ error: 'Global staff ID is required' });
  }

  try {
    // Search across all staff tables
    const staffTypes = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
    let staffMember = null;

    for (const staffType of staffTypes) {
      const schema = sanitizeStaffTypeToSchema(staffType);
      
      // Get all classes for this staff type
      const classesResult = await pool.query(
        `SELECT table_name 
         FROM information_schema.tables 
         WHERE table_schema = $1`,
        [schema]
      );

      for (const row of classesResult.rows) {
        const className = row.table_name;
        const result = await pool.query(
          `SELECT * FROM "${schema}"."${className}" WHERE global_staff_id = $1 AND (is_active = TRUE OR is_active IS NULL)`,
          [globalStaffId]
        );

        if (result.rows.length > 0) {
          staffMember = {
            ...result.rows[0],
            staffType,
            className
          };
          break;
        }
      }
      
      if (staffMember) break;
    }

    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    res.json({ staff: staffMember });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Failed to fetch staff member', details: error.message });
  }
});

// 7.15.1 SEARCH STAFF BY ID (for attendance system - no auth required)
router.get('/search-by-id/:staffId', async (req, res) => {
  const { staffId } = req.params;
  
  if (!staffId) {
    return res.status(400).json({ error: 'Staff ID is required' });
  }

  try {
    // Search across all staff tables
    const staffTypes = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
    let staffMember = null;

    for (const staffType of staffTypes) {
      const schema = sanitizeStaffTypeToSchema(staffType);
      
      // Get all classes for this staff type
      const classesResult = await pool.query(
        `SELECT table_name 
         FROM information_schema.tables 
         WHERE table_schema = $1`,
        [schema]
      );

      for (const row of classesResult.rows) {
        const className = row.table_name;
        
        try {
          const result = await pool.query(
            `SELECT global_staff_id, name, role, staff_work_time, '${staffType}' as staff_type
             FROM "${schema}"."${className}"
             WHERE global_staff_id::text = $1 OR staff_id::text = $1
             LIMIT 1`,
            [staffId]
          );

          if (result.rows.length > 0) {
            staffMember = result.rows[0];
            break;
          }
        } catch (e) {
          // Skip tables that don't have the required columns
          continue;
        }
      }

      if (staffMember) break;
    }

    if (staffMember) {
      res.json({ 
        found: true, 
        staff: staffMember 
      });
    } else {
      res.json({ 
        found: false, 
        message: 'Staff ID not found' 
      });
    }
  } catch (error) {
    console.error('Search staff error:', error);
    res.status(500).json({ error: 'Failed to search staff', details: error.message });
  }
});

// 7.15.2 GET ALL TEACHERS (for attendance list)
router.get('/all-teachers', async (req, res) => {
  try {
    // Fetch all teachers from staff_users table
    const usersResult = await pool.query(
      `SELECT global_staff_id, username, staff_type, class_name
       FROM staff_users
       WHERE staff_type = 'Teachers'
       AND global_staff_id IS NOT NULL
       ORDER BY username`
    );

    if (usersResult.rows.length === 0) {
      return res.json({ 
        success: true,
        teachers: [],
        count: 0,
        message: 'No teachers found in staff_users table'
      });
    }

    const teachers = [];
    
    for (const user of usersResult.rows) {
      try {
        // Fetch teacher details from their class table
        const detailsResult = await pool.query(
          `SELECT name, role, staff_work_time, image_staff
           FROM teachers."${user.class_name}"
           WHERE global_staff_id = $1
           LIMIT 1`,
          [user.global_staff_id]
        );

        if (detailsResult.rows.length > 0) {
          teachers.push({
            global_staff_id: user.global_staff_id,
            username: user.username,
            staff_type: user.staff_type,
            class_name: user.class_name,
            name: detailsResult.rows[0].name,
            role: detailsResult.rows[0].role || 'Teacher',
            staff_work_time: detailsResult.rows[0].staff_work_time,
            image_staff: detailsResult.rows[0].image_staff
          });
        } else {
          // Add teacher with basic info if details not found
          teachers.push({
            global_staff_id: user.global_staff_id,
            username: user.username,
            name: user.username, // Use username as fallback
            staff_type: user.staff_type,
            class_name: user.class_name,
            role: 'Teacher'
          });
        }
      } catch (e) {
        console.log(`Error fetching details for ${user.username}:`, e.message);
        // Add teacher with basic info even if query fails
        teachers.push({
          global_staff_id: user.global_staff_id,
          username: user.username,
          name: user.username, // Use username as fallback
          staff_type: user.staff_type,
          class_name: user.class_name,
          role: 'Teacher'
        });
      }
    }

    res.json({ 
      success: true,
      teachers: teachers,
      count: teachers.length
    });
  } catch (error) {
    console.error('Get all teachers error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch teachers', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 7.16 UPDATE TEACHER WORK TIME
router.put('/teacher-work-time', async (req, res) => {
  const { teacherName, workTime } = req.body;
  
  if (!teacherName || !workTime) {
    return res.status(400).json({ error: 'Teacher name and work time are required' });
  }

  // Validate work time
  const formattedWorkTime = workTime === 'Part time' ? 'Part Time' : 
                          workTime === 'Full time' ? 'Full Time' :
                          workTime;
  
  if (!['Full Time', 'Part Time'].includes(formattedWorkTime)) {
    return res.status(400).json({ error: 'Work time must be either "Full Time" or "Part Time"' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update in school_schema_points.teachers
    await client.query(`
      UPDATE school_schema_points.teachers 
      SET staff_work_time = $1, updated_at = CURRENT_TIMESTAMP
      WHERE teacher_name = $2
    `, [formattedWorkTime, teacherName]);

    // Update in schedule_schema.teachers
    await client.query(`
      UPDATE schedule_schema.teachers 
      SET teacher_type = $1, updated_at = CURRENT_TIMESTAMP
      WHERE teacher_name = $2
    `, [formattedWorkTime === 'Part Time' ? 'part_time' : 'full_time', teacherName]);

    await client.query('COMMIT');
    res.json({ 
      message: `Teacher work time updated successfully to ${formattedWorkTime}`,
      teacherName,
      workTime: formattedWorkTime
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error updating teacher work time:', e);
    res.status(500).json({ error: 'Failed to update teacher work time', details: e.message });
  } finally {
    client.release();
  }
});

// 7.17 MIGRATE SCHEDULE SCHEMA
router.post('/migrate-schedule-schema', async (req, res) => {
  try {
    await initializeScheduleSchema();
    res.json({ message: 'Schedule schema migration completed' });
  } catch (e) {
    res.status(500).json({ error: 'Migration failed', details: e.message });
  }
});

// 7.18 GET STAFF PROFILE BY ID (authenticated)
router.get('/profile-by-id/:globalStaffId', authenticateWithBranch, async (req, res) => {
  try {
    const { globalStaffId } = req.params;
    const { staffType, className } = req.query;
    
    if (!staffType || !className) {
      return res.status(400).json({ error: 'staffType and className are required' });
    }
    
    const profile = await getStaffProfile(parseInt(globalStaffId), staffType, className);
    
    if (!profile) {
      return res.status(404).json({ error: 'Staff profile not found' });
    }
    
    res.json(profile);
  } catch (e) {
    console.error('Get profile error:', e);
    res.status(500).json({ error: 'Failed to get profile', details: e.message });
  }
});

// 7.19 GET ALL STAFF (for dropdowns and lists)
router.get('/', authenticateWithBranch, async (req, res) => {
  console.log('\nðŸ“¥ GET /api/staff - Request received');
  
  try {
    // Fetch all staff from staff_users table
    const usersResult = await pool.query(
      `SELECT global_staff_id, username, password, staff_type, class_name
       FROM staff_users
       WHERE global_staff_id IS NOT NULL
       ORDER BY username`
    );

    if (usersResult.rows.length === 0) {
      return res.json({ 
        success: true,
        data: [],
        count: 0,
        message: 'No staff found'
      });
    }

    const staff = [];
    
    for (const user of usersResult.rows) {
      try {
        // Determine schema based on staff type
        const schema = sanitizeStaffTypeToSchema(user.staff_type);
        const className = user.class_name;
        
        // Fetch staff details from their class table
        const detailsResult = await pool.query(
          `SELECT name, role, staff_work_time, image_staff, gender
           FROM "${schema}"."${className}"
           WHERE global_staff_id = $1
           LIMIT 1`,
          [user.global_staff_id]
        );

        if (detailsResult.rows.length > 0) {
          const details = detailsResult.rows[0];
          staff.push({
            id: user.global_staff_id,
            global_staff_id: user.global_staff_id,
            username: user.username,
            password: user.password,
            name: details.name,
            firstName: details.name.split(' ')[0],
            lastName: details.name.split(' ').slice(1).join(' ') || '',
            role: details.role,
            staff_type: user.staff_type,
            staff_work_time: details.staff_work_time,
            gender: details.gender,
            image_staff: details.image_staff,
            class_name: user.class_name
          });
        } else {
          // Add staff with basic info if details not found
          staff.push({
            id: user.global_staff_id,
            global_staff_id: user.global_staff_id,
            username: user.username,
            password: user.password,
            name: user.username,
            firstName: user.username,
            lastName: '',
            staff_type: user.staff_type,
            class_name: user.class_name,
            role: 'Staff'
          });
        }
      } catch (e) {
        console.log(`Error fetching details for ${user.username}:`, e.message);
        // Add staff with basic info even if query fails
        staff.push({
          id: user.global_staff_id,
          global_staff_id: user.global_staff_id,
          username: user.username,
          password: user.password,
          name: user.username,
          firstName: user.username,
          lastName: '',
          staff_type: user.staff_type,
          class_name: user.class_name,
          role: 'Staff'
        });
      }
    }

    console.log(`âœ… Found ${staff.length} staff members`);
    
    res.json({ 
      success: true,
      data: staff,
      count: staff.length
    });

  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff',
      details: error.message
    });
  }
});

// UPDATE STAFF MEMBER
router.put('/update/:globalStaffId', upload, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { globalStaffId } = req.params;
    
    console.log('Update request body:', req.body);
    
    // Extract staffType and class - handle if they come as arrays
    let staffType = req.body.staffType;
    let rawClass = req.body.class;
    
    // If staffType is an array, take the first element
    if (Array.isArray(staffType)) {
      staffType = staffType[0];
    }
    if (Array.isArray(rawClass)) {
      rawClass = rawClass[0];
    }
    
    console.log('staffType:', staffType, 'type:', typeof staffType);
    
    // Validate staffType is a string
    if (!staffType || typeof staffType !== 'string') {
      throw new Error('Invalid staffType provided');
    }
    
    const className = sanitizeClassName(rawClass);
    const schema = sanitizeStaffTypeToSchema(staffType);

    // Parse form data
    const formData = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (!['staffType', 'class'].includes(k)) {
        try {
          formData[k] = JSON.parse(v);
        } catch {
          formData[k] = v;
        }
      }
    }

    // Get table columns
    const colRes = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, className]
    );
    
    if (colRes.rowCount === 0) {
      throw new Error('Target table does not exist');
    }

    const tableCols = colRes.rows.map((r) => r.column_name);
    const updateData = {};
    
    for (const c of tableCols) {
      if (formData.hasOwnProperty(c) && !['id', 'global_staff_id', 'staff_id'].includes(c)) {
        updateData[c] = formData[c];
      }
    }

    // Handle file uploads
    const files = req.files || [];
    for (const file of files) {
      updateData[file.fieldname] = file.filename;
    }

    // Handle arrays (convert to comma-separated strings)
    for (const key in updateData) {
      if (Array.isArray(updateData[key])) {
        updateData[key] = updateData[key].join(',');
      }
    }

    // Build UPDATE query
    const updateKeys = Object.keys(updateData);
    if (updateKeys.length === 0) {
      throw new Error('No fields to update');
    }

    const setClause = updateKeys.map((key, idx) => `"${key}" = $${idx + 2}`).join(', ');
    const values = [globalStaffId, ...Object.values(updateData)];

    const updateQuery = `
      UPDATE "${schema}"."${className}"
      SET ${setClause}
      WHERE global_staff_id = $1
      RETURNING *
    `;

    const result = await client.query(updateQuery, values);

    if (result.rowCount === 0) {
      throw new Error('Staff member not found');
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Staff updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating staff:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

// Bulk import staff from Excel
router.post('/bulk-import', async (req, res) => {
  const { staffType, className, staff } = req.body;
  
  if (!staffType || !className || !staff || !Array.isArray(staff) || staff.length === 0) {
    return res.status(400).json({ error: 'Staff type, class name, and staff array are required' });
  }
  
  const client = await pool.connect();
  
  try {
    // Ensure staff_counter table exists in this branch
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_counter (
        id SERIAL PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )
    `);
    const scCheck = await client.query('SELECT count FROM staff_counter WHERE id = 1');
    if (scCheck.rows.length === 0) {
      await client.query('INSERT INTO staff_counter (id, count) VALUES (1, 0)');
    }
    
    await client.query('BEGIN');
    
    const schema = sanitizeStaffTypeToSchema(staffType);
    const sanitizedClassName = sanitizeClassName(className);
    
    // Verify table exists
    const tableCheck = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)`,
      [schema, sanitizedClassName]
    );
    
    if (!tableCheck.rows[0].exists) {
      // Auto-create table if it doesn't exist
      const baseColDefs = [
        '"global_staff_id" INTEGER NOT NULL',
        '"staff_id" INTEGER NOT NULL',
        '"image_staff" VARCHAR(255)',
        '"name" VARCHAR(255) NOT NULL',
        '"gender" VARCHAR(50) NOT NULL',
        '"role" VARCHAR(100) NOT NULL',
        '"staff_enrollment_type" VARCHAR(100) NOT NULL',
        '"staff_work_time" VARCHAR(50) NOT NULL',
        '"machine_id" VARCHAR(100) NOT NULL',
        '"phone" VARCHAR(50) NOT NULL'
      ].join(', ');
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await client.query(`CREATE TABLE IF NOT EXISTS "${schema}"."${sanitizedClassName}" (id SERIAL PRIMARY KEY, ${baseColDefs})`);
      console.log(`✅ Bulk-import: auto-created table "${schema}"."${sanitizedClassName}"`);
    }
    
    // Get columns
    const columnsResult = await client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
      [schema, sanitizedClassName]
    );
    
    const validColumns = columnsResult.rows.map(row => row.column_name);
    const columnTypes = {};
    columnsResult.rows.forEach(row => {
      columnTypes[row.column_name] = row.data_type;
    });
    
    // Get current max staff_id
    const staffIdResult = await client.query(
      `SELECT COALESCE(MAX(staff_id), 0) as max_staff_id FROM "${schema}"."${sanitizedClassName}"`
    );
    let currentStaffId = staffIdResult.rows[0].max_staff_id || 0;
    
    const results = {
      successCount: 0,
      failedCount: 0,
      errors: [],
      credentials: []
    };
    
    // Column name mapping from common Excel headers
    const columnAliases = {
      'full name': 'name',
      'full_name': 'name',
      'employee name': 'name',
      'staff name': 'name',
      'teacher name': 'name',
      'name': 'name',
      'teacher id': 'machine_id',
      'machine id': 'machine_id',
      'machine_id': 'machine_id',
      'enrollment type': 'staff_enrollment_type',
      'staff_enrollment_type': 'staff_enrollment_type',
      'work time': 'staff_work_time',
      'staff_work_time': 'staff_work_time',
      'work_time': 'staff_work_time',
      'phone': 'phone',
      'phone number': 'phone',
      'telephone': 'phone',
      'email': 'email',
      'gender': 'gender',
      'role': 'role',
      'position': 'role',
    };

    // Process each staff member - SIMPLIFIED VERSION
    for (let i = 0; i < staff.length; i++) {
      const staffData = staff[i];
      
      try {
        // Normalize keys: map common Excel headers to database column names
        const normalized = {};
        for (const [key, value] of Object.entries(staffData)) {
          const alias = columnAliases[key.toLowerCase().trim()];
          if (alias) {
            normalized[alias] = value;
          } else if (validColumns.includes(key) || key === 'image_staff') {
            normalized[key] = value;
          }
        }

        // Validate required fields
        if (!normalized.name) {
          const keys = Object.keys(staffData).join(', ');
          results.failedCount++;
          results.errors.push({ row: i + 2, error: `Missing name. Found columns: ${keys || '(none)'}` });
          continue;
        }
        
        // Get next global_staff_id
        const globalStaffId = await getNextGlobalStaffId();
        currentStaffId++;
        
        // Build insert data
        const insertData = {
          global_staff_id: globalStaffId,
          staff_id: currentStaffId,
          name: normalized.name
        };
        
        // Process other fields
        Object.keys(normalized).forEach(key => {
          if (key === 'name') return; // already added
          if (validColumns.includes(key) && !insertData[key]) {
            const value = normalized[key];
            const dataType = columnTypes[key];
            
            switch (dataType) {
              case 'integer':
              case 'numeric':
                insertData[key] = value ? parseInt(value) : null;
                break;
              case 'boolean':
                insertData[key] = value === 'true' || value === true || value === 'TRUE' || value === 1;
                break;
              case 'date':
                insertData[key] = value || null;
                break;
              default:
                insertData[key] = value || null;
            }
          }
        });
        
        // Ensure staff_work_time
        if (!insertData.staff_work_time) {
          insertData.staff_work_time = 'Full Time';
        }
        
        // Auto-generate MachineID if missing
        if (!insertData.machine_id) {
          insertData.machine_id = await getNextMachineId(client);
        }
        
        // Check phone uniqueness
        if (insertData.phone) {
          const phoneCheck = await client.query(
            `SELECT id FROM "${schema}"."${sanitizedClassName}" WHERE phone = $1 LIMIT 1`,
            [insertData.phone]
          );
          if (phoneCheck.rows.length > 0) {
            results.errors.push({ row: i + 2, error: `Phone "${insertData.phone}" already exists` });
            results.failedCount++;
            continue;
          }
        }
        
        // Insert into main table
        const columns = Object.keys(insertData).filter(key => validColumns.includes(key));
        const values = columns.map(key => insertData[key]);
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
        
        const insertQuery = `INSERT INTO "${schema}"."${sanitizedClassName}" (${columns.join(', ')}) VALUES (${placeholders})`;
        await client.query(insertQuery, values);
        
        // Create user account using the proper function (generates username/password and hashes it)
        let userCredentials = null;
        try {
          const needsFinanceBranch = staffType === 'Accountant' || staffType === 'finance_officer' || staffType === 'cashier'
            || (staffType === 'Administrative Staff' && staffData.role === 'Accountant');
          const staffBranchCode = needsFinanceBranch
            ? (req.body.branchCode || req.headers['x-branch-code'] || sanitizedClassName).toUpperCase()
            : sanitizedClassName;
          userCredentials = await createStaffUser(
            globalStaffId,
            staffData.name,
            staffType,
            staffBranchCode
          );
        } catch (userErr) {
          console.error(`User creation error for ${staffData.name}:`, userErr.message);
        }
        
        results.successCount++;
        if (userCredentials) {
          results.credentials.push({
            name: staffData.name,
            username: userCredentials.username,
            password: userCredentials.password
          });
        }
        
      } catch (err) {
        console.error(`Error at row ${i + 2}:`, err);
        results.failedCount++;
        results.errors.push({
          row: i + 2,
          staff: staffData.name || 'Unknown',
          error: err.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: `Successfully imported ${results.successCount} staff members`,
      successCount: results.successCount,
      failedCount: results.failedCount,
      credentials: results.credentials,
      errors: results.errors.length > 0 ? results.errors : undefined
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Failed to import staff', details: err.message });
  } finally {
    client.release();
  }
});
// DEACTIVATE STAFF (HIDE FROM ALL SYSTEM LISTS)
router.put('/toggle-active/:globalStaffId', async (req, res) => {
  const { globalStaffId } = req.params;
  const { is_active } = req.body;
  
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean value' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find which table contains this staff member
    const staffTypes = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
    let found = false;
    let updatedStaff = null;
    
    for (const staffType of staffTypes) {
      const schema = sanitizeStaffTypeToSchema(staffType);
      
      // Get all tables in this schema
      const tablesResult = await client.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = $1 AND table_name <> 'staff_counter'`,
        [schema]
      );
      
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        
        // Check if is_active column exists, if not add it
        const columnCheck = await client.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_schema = $1 AND table_name = $2 AND column_name = 'is_active'`,
          [schema, tableName]
        );
        
        if (columnCheck.rowCount === 0) {
          // Add is_active column with default TRUE
          await client.query(
            `ALTER TABLE "${schema}"."${tableName}" 
             ADD COLUMN is_active BOOLEAN DEFAULT TRUE`
          );
          console.log(`Added is_active column to ${schema}.${tableName}`);
        }
        
        // Try to update the staff member
        const updateResult = await client.query(
          `UPDATE "${schema}"."${tableName}" 
           SET is_active = $1 
           WHERE global_staff_id = $2 
           RETURNING *`,
          [is_active, globalStaffId]
        );
        
        if (updateResult.rowCount > 0) {
          found = true;
          updatedStaff = updateResult.rows[0];
          console.log(`Updated staff ${globalStaffId} in ${schema}.${tableName} to is_active=${is_active}`);
          break;
        }
      }
      
      if (found) break;
    }
    
    if (!found) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Staff member not found' });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: is_active 
        ? 'Staff activated successfully - now visible in all system lists' 
        : 'Staff deactivated successfully - now hidden from all system lists but data preserved',
      data: updatedStaff
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error toggling staff active status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
