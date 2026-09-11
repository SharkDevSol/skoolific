const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

/**
 * Webhook endpoint to receive attendance data from AI06 machine
 * The machine will push data here when configured
 */

// Helper function to parse machine data and save to database
async function processMachineData(data, headers, query) {
  try {
    console.log('🔍 Parsing machine data...');
    
    // ZKTeco machines can send data in different formats
    // Common formats: query params, JSON body, or custom format
    
    let userId, timestamp, checkType;
    
    // Try to extract from query parameters (common for ZKTeco)
    if (query.SN || query.sn) {
      // Format: ?SN=machine_serial&UserID=1&DateTime=2026-01-30 14:30:00&Status=0
      userId = query.UserID || query.userid || query.user_id;
      timestamp = query.DateTime || query.datetime || query.time;
      checkType = query.Status || query.status || query.type;
    }
    
    // Try to extract from body
    if (!userId && data) {
      userId = data.UserID || data.userId || data.user_id || data.userid;
      timestamp = data.DateTime || data.datetime || data.timestamp || data.time;
      checkType = data.Status || data.status || data.type || data.checkType;
    }
    
    console.log('📊 Extracted data:', { userId, timestamp, checkType });
    
    if (!userId) {
      console.log('⚠️  No user ID found in data');
      return { success: false, error: 'No user ID' };
    }
    
    // Find person by machine user ID
    const mappingResult = await pool.query(
      'SELECT person_id, person_type FROM user_machine_mapping WHERE machine_user_id = $1',
      [parseInt(userId)]
    );
    
    if (mappingResult.rows.length === 0) {
      console.log(`⚠️  User ID ${userId} not mapped to any person`);
      return { success: false, error: `User ID ${userId} not mapped` };
    }
    
    const { person_id, person_type } = mappingResult.rows[0];
    
    // ✅ STRICT VALIDATION: Only accept logs where machine_id matches registered staff OR students
    console.log(`\n🔍 ========================================`);
    console.log(`🔍 STRICT VALIDATION: Machine User ID ${userId}`);
    console.log(`🔍 ========================================`);
    
    // Get all registered staff with their machine_ids from staff tables
    let registeredMachineIds = [];
    let staffDetails = [];
    try {
      const staffResult = await pool.query(`
        SELECT machine_id, full_name, global_staff_id, 'Teachers' as staff_type
        FROM staff_teachers WHERE machine_id IS NOT NULL
        UNION
        SELECT machine_id, full_name, global_staff_id, 'Administrative Staff' as staff_type
        FROM staff_administrative_staff WHERE machine_id IS NOT NULL
        UNION
        SELECT machine_id, full_name, global_staff_id, 'Supportive Staff' as staff_type
        FROM staff_supportive_staff WHERE machine_id IS NOT NULL
        UNION
        SELECT machine_id, full_name, global_staff_id, 'Finance' as staff_type
        FROM staff_finance WHERE machine_id IS NOT NULL
        ORDER BY machine_id
      `);
      
      registeredMachineIds = staffResult.rows.map(r => String(r.machine_id));
      staffDetails = staffResult.rows;
      
      console.log(`📋 Found ${registeredMachineIds.length} registered staff with machine IDs`);
    } catch (err) {
      console.log('⚠️  Staff tables not accessible:', err.message);
    }
    
    // Get all registered students with their smachine_ids from class tables
    let registeredStudentMachineIds = [];
    let studentDetails = [];
    try {
      const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'classes_schema'
        ORDER BY table_name
      `);
      
      for (const table of tablesResult.rows) {
        const tableName = table.table_name;
        const studentsResult = await pool.query(`
          SELECT 
            CAST(smachine_id AS VARCHAR) as smachine_id,
            student_name,
            CAST(school_id AS VARCHAR) as student_id,
            '${tableName}' as class_name
          FROM classes_schema."${tableName}"
          WHERE smachine_id IS NOT NULL
            AND (is_active = TRUE OR is_active IS NULL)
        `);
        
        studentDetails = studentDetails.concat(studentsResult.rows);
        registeredStudentMachineIds = registeredStudentMachineIds.concat(
          studentsResult.rows.map(r => String(r.smachine_id))
        );
      }
      
      console.log(`📋 Found ${registeredStudentMachineIds.length} registered students with machine IDs`);
    } catch (err) {
      console.log('⚠️  Student tables not accessible:', err.message);
    }
    
    // STRICT CHECK: Check if machine user ID matches staff OR student
    const isStaff = registeredMachineIds.includes(String(userId));
    const isStudent = registeredStudentMachineIds.includes(String(userId));
    
    console.log(`\n🔍 Checking: Does Machine User ID "${userId}" match any registered ID?`);
    console.log(`   Staff Match: ${isStaff ? '✅ YES' : '❌ NO'}`);
    console.log(`   Student Match: ${isStudent ? '✅ YES' : '❌ NO'}`);
    
    if (!isStaff && !isStudent) {
      console.log(`\n❌ ========================================`);
      console.log(`❌ REJECTED: Machine User ID ${userId}`);
      console.log(`❌ ========================================`);
      console.log(`   Reason: This machine user ID is NOT in staff or student tables`);
      console.log(`   This log will be IGNORED.`);
      console.log(`❌ ========================================\n`);
      return { success: false, error: `Machine User ID ${userId} not registered` };
    }
    
    // Process STAFF attendance
    if (isStaff) {
      const matchedStaff = staffDetails.find(s => String(s.machine_id) === String(userId));
      
      console.log(`\n✅ ========================================`);
      console.log(`✅ VALIDATED: STAFF - Machine User ID ${userId}`);
      console.log(`✅ ========================================`);
      console.log(`   Staff Name: ${matchedStaff.full_name}`);
      console.log(`   Global Staff ID: ${matchedStaff.global_staff_id}`);
      console.log(`   Staff Type: ${matchedStaff.staff_type}`);
      console.log(`✅ ========================================\n`);
      
      // Parse timestamp
      const attendanceTime = timestamp ? new Date(timestamp) : new Date();
      const date = attendanceTime.toISOString().split('T')[0];
      
      // Convert to Ethiopian date
      const { convertToEthiopian } = require('../utils/ethiopianCalendar');
      const ethDate = convertToEthiopian(attendanceTime);
      
      // Extract time in HH:MM format
      const checkInTime = attendanceTime.toTimeString().split(' ')[0].substring(0, 5);
      
      console.log(`📅 Date: ${date} (Ethiopian: ${ethDate.year}/${ethDate.month}/${ethDate.day})`);
      console.log(`⏰ Check-in time: ${checkInTime}`);
      
      // Insert into hr_ethiopian_attendance (Staff Attendance System)
      try {
        const attendanceResult = await pool.query(
          `INSERT INTO hr_ethiopian_attendance 
           (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, check_in, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, 'PRESENT', 'Auto-imported from AI06 machine')
           ON CONFLICT (staff_id, ethiopian_year, ethiopian_month, ethiopian_day) 
           DO UPDATE SET 
             check_in = CASE 
               WHEN hr_ethiopian_attendance.check_in IS NULL OR EXCLUDED.check_in < hr_ethiopian_attendance.check_in 
               THEN EXCLUDED.check_in 
               ELSE hr_ethiopian_attendance.check_in 
             END,
             updated_at = NOW()
           RETURNING *`,
          [matchedStaff.machine_id, matchedStaff.full_name, ethDate.year, ethDate.month, ethDate.day, checkInTime]
        );
        
        if (attendanceResult.rows.length > 0) {
          console.log(`✅ Staff attendance saved to hr_ethiopian_attendance`);
        }
      } catch (err) {
        console.error(`❌ Error saving staff attendance:`, err.message);
      }
      
      // Also insert into dual_mode_attendance (for backward compatibility)
      const result = await pool.query(
        `INSERT INTO dual_mode_attendance 
         (person_id, person_type, date, status, source_type, source_machine_ip, timestamp)
         VALUES ($1, $2, $3, 'present', 'machine', '10.22.134.43', $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [matchedStaff.global_staff_id, person_type, date, attendanceTime]
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ Also saved to dual_mode_attendance (ID: ${result.rows[0].id})`);
        
        // Log to audit
        await pool.query(
          `INSERT INTO attendance_audit_log (operation_type, performed_by, details)
           VALUES ('machine_push', 'system', $1)`,
          [JSON.stringify({
            source: 'AI06_Push',
            userId,
            person_id: matchedStaff.global_staff_id,
            person_type,
            staff_name: matchedStaff.full_name,
            machine_id: matchedStaff.machine_id,
            timestamp: attendanceTime.toISOString()
          })]
        );
        
        return { success: true, person_id: matchedStaff.global_staff_id, person_type, timestamp: attendanceTime };
      } else {
        console.log('ℹ️  Attendance already exists (duplicate)');
        return { success: true, duplicate: true };
      }
    }
    
    // Process STUDENT attendance
    if (isStudent) {
      const matchedStudent = studentDetails.find(s => String(s.smachine_id) === String(userId));
      
      console.log(`\n✅ ========================================`);
      console.log(`✅ VALIDATED: STUDENT - Machine User ID ${userId}`);
      console.log(`✅ ========================================`);
      console.log(`   Student Name: ${matchedStudent.student_name}`);
      console.log(`   Student ID: ${matchedStudent.student_id}`);
      console.log(`   Class: ${matchedStudent.class_name}`);
      console.log(`✅ ========================================\n`);
      
      // Parse timestamp
      const attendanceTime = timestamp ? new Date(timestamp) : new Date();
      
      // Convert to Ethiopian date
      const { convertToEthiopian, getEthiopianDayOfWeek } = require('../utils/ethiopianCalendar');
      const ethDate = convertToEthiopian(attendanceTime);
      const dayOfWeek = getEthiopianDayOfWeek(ethDate.year, ethDate.month, ethDate.day);
      const weekNumber = Math.ceil(ethDate.day / 7);
      
      // Extract time in HH:MM:SS format
      const checkInTime = attendanceTime.toTimeString().split(' ')[0];
      
      console.log(`📅 Date: Ethiopian ${ethDate.year}/${ethDate.month}/${ethDate.day} (${dayOfWeek})`);
      console.log(`⏰ Check-in time: ${checkInTime}`);
      
      // Get time settings to determine status (PRESENT or LATE)
      let status = 'PRESENT';
      try {
        const settingsResult = await pool.query(
          'SELECT late_threshold_time FROM academic_student_attendance_settings ORDER BY id DESC LIMIT 1'
        );
        
        if (settingsResult.rows.length > 0) {
          const lateThreshold = settingsResult.rows[0].late_threshold_time;
          const checkInTimeOnly = checkInTime.substring(0, 5); // HH:MM
          
          if (checkInTimeOnly > lateThreshold) {
            status = 'LATE';
            console.log(`⏰ Student is LATE (checked in at ${checkInTimeOnly}, threshold: ${lateThreshold})`);
          }
        }
      } catch (err) {
        console.log('⚠️  Could not check late threshold:', err.message);
      }
      
      // Insert into academic_student_attendance
      try {
        const attendanceResult = await pool.query(
          `INSERT INTO academic_student_attendance 
           (student_id, student_name, class_name, smachine_id,
            ethiopian_year, ethiopian_month, ethiopian_day,
            day_of_week, week_number, check_in_time, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (student_id, class_name, ethiopian_year, ethiopian_month, ethiopian_day)
           DO UPDATE SET
             check_in_time = CASE
               WHEN academic_student_attendance.check_in_time IS NULL OR EXCLUDED.check_in_time < academic_student_attendance.check_in_time
               THEN EXCLUDED.check_in_time
               ELSE academic_student_attendance.check_in_time
             END,
             status = EXCLUDED.status,
             notes = EXCLUDED.notes,
             updated_at = NOW()
           RETURNING *`,
          [
            matchedStudent.student_id,
            matchedStudent.student_name,
            matchedStudent.class_name,
            matchedStudent.smachine_id,
            ethDate.year,
            ethDate.month,
            ethDate.day,
            dayOfWeek,
            weekNumber,
            checkInTime,
            status,
            'Auto-imported from AI06 machine'
          ]
        );
        
        if (attendanceResult.rows.length > 0) {
          console.log(`✅ Student attendance saved to academic_student_attendance`);
          console.log(`   Student: ${matchedStudent.student_name} (${matchedStudent.student_id})`);
          console.log(`   Class: ${matchedStudent.class_name}`);
          console.log(`   Date: ${ethDate.day}/${ethDate.month}/${ethDate.year}`);
          console.log(`   Status: ${status}`);
          console.log(`   Check-in: ${checkInTime}`);
        }
        
        return { success: true, student_id: matchedStudent.student_id, class_name: matchedStudent.class_name, timestamp: attendanceTime };
      } catch (err) {
        console.error(`❌ Error saving student attendance:`, err.message);
        return { success: false, error: err.message };
      }
    }
  } catch (error) {
    console.error('❌ Error processing machine data:', error);
    return { success: false, error: error.message };
  }
}

// Receive attendance data from machine
router.post('/attendance', async (req, res) => {
  try {
    console.log('\n📥 ========================================');
    console.log('📥 Received data from AI06 machine');
    console.log('📥 ========================================');
    console.log('⏰ Time:', new Date().toLocaleString());
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    console.log('🔗 Query:', JSON.stringify(req.query, null, 2));
    console.log('========================================\n');

    // Log to file for analysis
    const fs = require('fs');
    const logData = {
      timestamp: new Date().toISOString(),
      headers: req.headers,
      body: req.body,
      query: req.query
    };
    
    fs.appendFileSync(
      'machine-webhook-log.txt',
      JSON.stringify(logData, null, 2) + '\n---\n'
    );

    // Process and save the data
    const result = await processMachineData(req.body, req.headers, req.query);
    
    if (result.success) {
      console.log('✅ Data processed successfully!');
    } else {
      console.log('⚠️  Data processing failed:', result.error);
    }

    // ZKTeco machines expect specific response formats
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error in webhook:', error);
    res.status(200).send('OK'); // Still send OK to prevent disconnection
  }
});

// Alternative endpoint (some machines use different paths)
router.post('/push', async (req, res) => {
  console.log('\n📥 ========================================');
  console.log('📥 Received PUSH from machine');
  console.log('📥 ========================================');
  console.log('⏰ Time:', new Date().toLocaleString());
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  console.log('🔗 Query:', JSON.stringify(req.query, null, 2));
  console.log('========================================\n');
  
  // Log to file
  const fs = require('fs');
  fs.appendFileSync(
    'machine-webhook-log.txt',
    `PUSH: ${JSON.stringify({ 
      timestamp: new Date().toISOString(),
      headers: req.headers, 
      body: req.body, 
      query: req.query 
    }, null, 2)}\n---\n`
  );
  
  // Process and save the data
  const result = await processMachineData(req.body, req.headers, req.query);
  
  if (result.success) {
    console.log('✅ Data processed successfully!');
  } else {
    console.log('⚠️  Data processing failed:', result.error);
  }
  
  res.status(200).send('OK');
});

// Root endpoint (machine might send to root)
router.post('/', async (req, res) => {
  console.log('\n📥 ========================================');
  console.log('📥 Received data at ROOT endpoint');
  console.log('📥 ========================================');
  console.log('⏰ Time:', new Date().toLocaleString());
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  console.log('🔗 Query:', JSON.stringify(req.query, null, 2));
  console.log('========================================\n');
  
  // Log to file
  const fs = require('fs');
  fs.appendFileSync(
    'machine-webhook-log.txt',
    `ROOT: ${JSON.stringify({ 
      timestamp: new Date().toISOString(),
      headers: req.headers, 
      body: req.body, 
      query: req.query 
    }, null, 2)}\n---\n`
  );
  
  // Process and save the data
  const result = await processMachineData(req.body, req.headers, req.query);
  
  if (result.success) {
    console.log('✅ Data processed successfully!');
  } else {
    console.log('⚠️  Data processing failed:', result.error);
  }
  
  res.status(200).send('OK');
});

// GET endpoint (machine might send GET requests)
router.get('/attendance', async (req, res) => {
  console.log('\n📥 ========================================');
  console.log('📥 Received GET request from machine');
  console.log('📥 ========================================');
  console.log('⏰ Time:', new Date().toLocaleString());
  console.log('🔗 Query:', JSON.stringify(req.query, null, 2));
  console.log('========================================\n');
  
  // Log to file
  const fs = require('fs');
  fs.appendFileSync(
    'machine-webhook-log.txt',
    `GET: ${JSON.stringify({ 
      timestamp: new Date().toISOString(),
      query: req.query 
    }, null, 2)}\n---\n`
  );
  
  // Process and save the data (GET requests use query params)
  const result = await processMachineData(null, req.headers, req.query);
  
  if (result.success) {
    console.log('✅ Data processed successfully!');
  } else {
    console.log('⚠️  Data processing failed:', result.error);
  }
  
  res.status(200).send('OK');
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook endpoint is ready',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to verify machine can reach us
router.get('/test', (req, res) => {
  console.log('✅ Machine reached test endpoint');
  res.send('OK - Webhook is working!');
});

router.post('/test', (req, res) => {
  console.log('✅ Machine reached test endpoint (POST)');
  console.log('Body:', req.body);
  res.json({ success: true, message: 'Test successful' });
});

module.exports = router;
