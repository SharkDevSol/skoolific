const pool = require('../config/db');
const { createStaffUser } = require('../routes/staff_auth');

const BASE_COLUMNS = [
  'global_staff_id', 'staff_id', 'image_staff', 'name', 'gender',
  'role', 'staff_enrollment_type', 'staff_work_time', 'machine_id', 'phone'
];

function sanitizeClassName(raw) {
  if (!raw) return 'default';
  return raw.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

function sanitizeStaffTypeToSchema(staffType) {
  if (!staffType) return 'teachers';
  const t = staffType.toLowerCase();
  if (t === 'teacher' || t === 'teachers') return 'teachers';
  if (t === 'supportive' || t === 'supportive_staff') return 'supportive_staff';
  if (t === 'administrative' || t === 'administrative_staff' || t === 'director') return 'administrative_staff';
  return 'teachers';
}

function parseStaffFormBody(body) {
  const formData = {};
  for (const [k, v] of Object.entries(body)) {
    if (!['staffType', 'class', 'uploadFields'].includes(k)) {
      try {
        formData[k] = JSON.parse(v);
      } catch {
        formData[k] = v;
      }
    }
  }
  return formData;
}

async function ensureStaffTable(client, schema, className) {
  const colRes = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, className]
  );
  if (colRes.rowCount > 0) {
    return colRes.rows.map((r) => r.column_name);
  }
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
  console.log(`Auto-created table "${schema}"."${className}"`);
  return [...BASE_COLUMNS];
}

async function checkPhoneUniqueness(client, schema, className, phone) {
  if (!phone) return;
  const phoneCheck = await client.query(
    `SELECT id FROM "${schema}"."${className}" WHERE phone = $1 LIMIT 1`,
    [phone]
  );
  if (phoneCheck.rows.length > 0) {
    throw new Error('Phone number already exists for another staff member');
  }
}

async function getNextGlobalStaffId() {
  const result = await pool.query(
    `UPDATE staff_counter SET count = count + 1 WHERE id = 1 RETURNING count`
  );
  return result.rows[0].count;
}

async function getNextMachineId(client) {
  const result = await client.query(
    `SELECT COALESCE(MAX(CAST(machine_id AS INTEGER)), 0) + 1 AS next_id
     FROM (
       SELECT machine_id FROM teachers."Grade 1"
       UNION ALL SELECT machine_id FROM teachers."Grade 2"
     ) tmp`
  );
  return String(result.rows[0].next_id).padStart(6, '0');
}

function extractPartTimeSchedule(formData) {
  const availability = [];
  if (formData.availability) {
    try {
      const parsed = typeof formData.availability === 'string'
        ? JSON.parse(formData.availability)
        : formData.availability;
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item.day && item.startTime && item.endTime) {
            const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
            const dayNum = dayMap[item.day.toLowerCase()];
            if (dayNum !== undefined) {
              availability.push({ day: dayNum, start: item.startTime, end: item.endTime });
            }
          }
        });
      }
    } catch (e) {
      console.warn('Could not parse availability:', e.message);
    }
  }
  return {
    work_days: [...new Set(availability.map((a) => a.day))],
    preferred_shifts: availability.length > 0 ? ['morning', 'afternoon'] : [],
    availability,
    max_hours_per_day: 6,
    max_hours_per_week: 30,
  };
}

async function addTeacherToSchoolSchemaPoints(client, globalStaffId, name, staffWorkTime, role, enrollmentType) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS school_schema_points
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS school_schema_points.teachers (
      id SERIAL PRIMARY KEY,
      global_staff_id INTEGER NOT NULL,
      teacher_name VARCHAR(255) NOT NULL,
      staff_work_time VARCHAR(50),
      role VARCHAR(100),
      enrollment_type VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(global_staff_id)
    )
  `);
  await client.query(`
    INSERT INTO school_schema_points.teachers
    (global_staff_id, teacher_name, staff_work_time, role, enrollment_type)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (global_staff_id)
    DO UPDATE SET teacher_name = $2, staff_work_time = $3, role = $4, enrollment_type = $5
  `, [globalStaffId, name, staffWorkTime, role, enrollmentType]);
}

async function addTeacherToScheduleSystem(client, globalStaffId, name, schedule, employmentType) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS teachers
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS teachers.schedule_schema (
      id SERIAL PRIMARY KEY,
      global_staff_id INTEGER NOT NULL,
      teacher_name VARCHAR(255) NOT NULL,
      work_days INTEGER[] DEFAULT '{}',
      preferred_shifts TEXT[] DEFAULT '{}',
      availability JSONB DEFAULT '[]'::jsonb,
      max_hours_per_day INTEGER DEFAULT 8,
      max_hours_per_week INTEGER DEFAULT 40,
      employment_type VARCHAR(50) DEFAULT 'full_time',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(global_staff_id)
    )
  `);
  const { work_days, preferred_shifts, availability, max_hours_per_day, max_hours_per_week } = schedule;
  await client.query(`
    INSERT INTO teachers.schedule_schema
    (global_staff_id, teacher_name, work_days, preferred_shifts, availability, max_hours_per_day, max_hours_per_week, employment_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (global_staff_id)
    DO UPDATE SET
      teacher_name = $2, work_days = $3, preferred_shifts = $4,
      availability = $5, max_hours_per_day = $6, max_hours_per_week = $7, employment_type = $8
  `, [globalStaffId, name, work_days, preferred_shifts, JSON.stringify(availability), max_hours_per_day, max_hours_per_week, employmentType]);
}

async function updateStaffIds(schema, className, client) {
  await client.query(`
    UPDATE "${schema}"."${className}"
    SET staff_id = sub.new_id
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY global_staff_id) AS new_id
      FROM "${schema}"."${className}"
    ) sub
    WHERE "${schema}"."${className}".id = sub.id
  `);
}

module.exports = {
  sanitizeClassName,
  sanitizeStaffTypeToSchema,
  parseStaffFormBody,
  ensureStaffTable,
  checkPhoneUniqueness,
  getNextGlobalStaffId,
  getNextMachineId,
  extractPartTimeSchedule,
  addTeacherToSchoolSchemaPoints,
  addTeacherToScheduleSystem,
  updateStaffIds,
};
