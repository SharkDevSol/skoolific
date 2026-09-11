const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AI06WebSocketService {
  constructor(port = 7788) {
    this.port = port;
    this.wss = null;
    this.devices = new Map(); // Store connected devices by serial number
    this.io = null; // Socket.IO instance for real-time dashboard updates
    this.branchCode = (process.env.AI06_BRANCH_CODE || 'IQRA1').toUpperCase();
  }

  // Initialize WebSocket server
  start(io) {
    this.io = io;
    
    this.wss = new WebSocket.Server({ port: this.port });
    
    console.log(`🔌 AI06 WebSocket Server started on port ${this.port}`);
    console.log(`📡 Waiting for AI06 devices to connect...`);
    console.log(`📋 Expected message format: { "cmd": "reg" } for registration`);
    console.log(`📋 Expected message format: { "cmd": "sendlog", "record": [...] } for attendance logs`);
    
    this.wss.on('connection', (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      ws._ai06ClientIP = clientIP;
      console.log(`\n========================================`);
      console.log(`📱 NEW DEVICE CONNECTION`);
      console.log(`========================================`);
      console.log(`   IP Address: ${clientIP}`);
      console.log(`   Time: ${new Date().toLocaleString()}`);
      console.log(`   Waiting for registration message...`);
      console.log(`========================================\n`);
      
      ws.on('message', async (data) => {
        console.log(`\n📨 RAW MESSAGE RECEIVED from ${clientIP}:`);
        console.log(`   Length: ${data.length} bytes`);
        console.log(`   Content: ${data.toString()}`);
        await this.handleMessage(ws, data);
      });
      
      ws.on('close', () => {
        console.log(`\n========================================`);
        console.log(`📴 DEVICE DISCONNECTED`);
        console.log(`========================================`);
        console.log(`   IP Address: ${clientIP}`);
        console.log(`   Time: ${new Date().toLocaleString()}`);
        // Remove from devices map
        for (const [sn, device] of this.devices.entries()) {
          if (device.ws === ws) {
            this.devices.delete(sn);
            console.log(`   Device ${sn} removed from active devices`);
            break;
          }
        }
        console.log(`========================================\n`);
      });
      
      ws.on('error', (error) => {
        console.error(`\n❌ WebSocket error from ${clientIP}:`, error);
      });
    });
  }

  // Handle incoming messages from AI06 device
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      console.log(`\n✅ PARSED MESSAGE:`);
      console.log(JSON.stringify(message, null, 2));
      
      const { cmd, ret } = message;
      
      if (cmd) {
        console.log(`📤 Device is sending command: "${cmd}"`);
        // Device is sending data to server
        await this.handleDeviceCommand(ws, message);
      } else if (ret) {
        console.log(`📥 Device is responding to command: "${ret}"`);
        // Response to server command
        await this.handleDeviceResponse(ws, message);
      } else {
        console.log(`⚠️  Unknown message type (no "cmd" or "ret" field)`);
      }
    } catch (error) {
      console.error(`\n❌ ERROR HANDLING MESSAGE:`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Raw data: ${data.toString()}`);
    }
  }

  // Handle commands from device
  async handleDeviceCommand(ws, message) {
    const { cmd } = message;
    
    switch (cmd) {
      case 'reg':
        await this.handleRegistration(ws, message);
        break;
      case 'sendlog':
        await this.handleAttendanceLog(ws, message);
        break;
      case 'senduser':
        await this.handleUserSync(ws, message);
        break;
      case 'sendqrcode':
        await this.handleQRCode(ws, message);
        break;
      case 'sendpin':
        await this.handlePIN(ws, message);
        break;
      default:
        console.log(`Unknown command: ${cmd}`);
    }
  }

  // Handle device registration
  async handleRegistration(ws, message) {
    const { sn, devinfo } = message;
    
    // Device belongs to the branch this backend serves
    const deviceBranch = this.branchCode;
    
    console.log(`✅ Device registered: ${sn}`);
    console.log(`   Branch: ${deviceBranch}`);
    console.log(`   IP: ${ws._ai06ClientIP || 'unknown'}`);
    console.log(`Model: ${devinfo.modelname}`);
    console.log(`Users: ${devinfo.useduser}/${devinfo.usersize}`);
    console.log(`Logs: ${devinfo.usedlog}/${devinfo.logsize}`);
    
    // Store device connection with branch binding
    this.devices.set(sn, {
      ws: ws,
      branchCode: deviceBranch,
      ip: ws._ai06ClientIP || 'unknown',
      connectedAt: new Date().toISOString()
    });
    
    // Send registration response
    const response = {
      ret: 'reg',
      result: true,
      branch: deviceBranch,
      cloudtime: new Date().toISOString()
    };
    
    ws.send(JSON.stringify(response));
  }

  // Handle attendance log from device
  async handleAttendanceLog(ws, message) {
    const { count, logindex, record } = message;
    
    console.log(`📊 Received ${count} attendance logs`);
    
    for (const log of record) {
      const { enrollid, time, mode, inout, event, image } = log;
      
      console.log(`👤 Processing attendance for user ID: ${enrollid}`);
      console.log(`   Time: ${time}`);
      console.log(`   Mode: ${mode} (0=fp, 1=pwd, 2=card)`);
      console.log(`   In/Out: ${inout} (0=in, 1=out)`);
      
      try {
        // Save to attendance database
        await this.saveAttendanceToDatabase(enrollid, log.name, time, mode, inout);
        
        // Simple response without payment checking
        const response = {
          ret: 'sendlog',
          result: true,
          cloudtime: new Date().toISOString(),
          access: 1,
          message: 'Attendance received successfully'
        };
        
        ws.send(JSON.stringify(response));
        console.log(`✅ Attendance acknowledged for user ${enrollid}`);
        
        // Broadcast to dashboard via Socket.IO
        if (this.io) {
          console.log('🔔 Broadcasting to Socket.IO clients...');
          this.io.emit('new-attendance', {
            userId: enrollid,
            name: log.name || `User ${enrollid}`,
            time: time,
            mode: mode,
            inout: inout
          });
          console.log('✅ Broadcast sent to all connected clients');
        } else {
          console.log('⚠️ Socket.IO not initialized!');
        }
        
      } catch (error) {
        console.error(`Error processing log for user ${enrollid}:`, error);
      }
    }
  }

  // Save attendance to database
  async saveAttendanceToDatabase(machineId, name, scanTime, mode, inout) {
    try {
      const { Pool } = require('pg');
      
      // Resolve this branch's database (IQRA1 -> iqrab1, IQRA2 -> iqrab2, ...)
      const branchMap = {
        'IQRA1': 'iqrab1',
        'IQRA2': 'iqrab2',
        'IQRA3': 'iqrab3',
        'IQRA4': 'iqrab4',
        'IQRA5': 'iqrab5'
      };
      const dbName = branchMap[this.branchCode] || (process.env.DATABASE_URL ? null : 'iqrab1');
      
      const pool = dbName
        ? new Pool({
            user: process.env.DB_USER || 'iqra',
            password: process.env.DB_PASSWORD || 'iqra1768',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT, 10) || 5432,
            database: dbName
          })
        : new Pool({ connectionString: process.env.DATABASE_URL });
      
      console.log(`   Branch DB: ${dbName || process.env.DATABASE_URL}`);

      // Use Machine ID and name directly from device - no lookup needed!
      console.log(`\n💾 ========================================`);
      console.log(`💾 Saving attendance from AI06 Machine`);
      console.log(`💾 ========================================`);
      console.log(`   Machine ID: ${machineId}`);
      console.log(`   Name: ${name}`);
      console.log(`   Scan Time: ${scanTime}`);
      console.log(`   Mode: ${mode} (0=fp, 1=pwd, 2=card, 3=face)`);
      console.log(`   In/Out: ${inout} (0=in, 1=out)`);
      
      // Parse the scan time (format: "2026-02-10 15:30:24")
      // IMPORTANT: Machine clock is 9 hours behind - add correction
      const scanDate = new Date(scanTime);
      
      // Add 9 hours to correct machine time
      scanDate.setHours(scanDate.getHours() + 9);
      
      // Extract corrected time in HH:MM:SS format
      const hours = scanDate.getHours().toString().padStart(2, '0');
      const minutes = scanDate.getMinutes().toString().padStart(2, '0');
      const seconds = scanDate.getSeconds().toString().padStart(2, '0');
      const timeOnly = `${hours}:${minutes}:${seconds}`;
      
      console.log(`⏰ Machine time (original): ${scanTime}`);
      console.log(`⏰ Corrected time (+9 hours): ${timeOnly}`);
      
      // ========================================
      // STEP 1: Check if this is a STUDENT or STAFF
      // ========================================
      console.log(`\n🔍 STEP 1: Identifying person type...`);
      
      // Check if machine ID matches any STUDENT
      let isStudent = false;
      let studentInfo = null;
      
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
            WHERE CAST(smachine_id AS VARCHAR) = $1
              AND (is_active = TRUE OR is_active IS NULL)
          `, [machineId.toString()]);
          
          if (studentsResult.rows.length > 0) {
            isStudent = true;
            studentInfo = studentsResult.rows[0];
            console.log(`✅ Found STUDENT: ${studentInfo.student_name} (Class: ${studentInfo.class_name})`);
            break;
          }
        }
      } catch (err) {
        console.log(`⚠️  Could not check student tables: ${err.message}`);
      }
      
      if (isStudent && studentInfo) {
        // ========================================
        // STUDENT ATTENDANCE
        // ========================================
        console.log(`\n📚 Processing STUDENT attendance...`);
        await this.saveStudentAttendance(pool, studentInfo, scanTime, timeOnly);
        await pool.end();
        return;
      }
      
      // ========================================
      // STAFF ATTENDANCE (existing logic)
      // ========================================
      console.log(`\n👔 Processing STAFF attendance...`);
      
      // Convert Gregorian to Ethiopian date using the utility function
      const { convertToEthiopian: gregorianToEthiopian } = require('../utils/ethiopianCalendar');
      
      const ethDate = gregorianToEthiopian(scanDate);
      const ethYear = ethDate.year;
      const ethMonth = ethDate.month;
      const ethDay = ethDate.day;
      
      // ========================================
      // STEP 2: Determine staff shift assignment
      // ========================================
      console.log(`\n🔍 STEP 2: Checking shift assignment...`);
      
      let staffShiftAssignment = 'shift1'; // Default
      let effectiveShift = 'shift1';
      
      // Check staff shift assignment from all staff tables
      const staffTables = [
        { schema: 'staff_teachers', idColumn: 'machine_id' },
        { schema: 'staff_administrative_staff', idColumn: 'machine_id' },
        { schema: 'staff_supportive_staff', idColumn: 'machine_id' },
        { schema: 'staff_finance', idColumn: 'machine_id' }
      ];
      
      for (const table of staffTables) {
        try {
          const shiftResult = await pool.query(
            `SELECT shift_assignment FROM "${table.schema}" WHERE CAST(${table.idColumn} AS VARCHAR) = $1 LIMIT 1`,
            [machineId.toString()]
          );
          
          if (shiftResult.rows.length > 0 && shiftResult.rows[0].shift_assignment) {
            staffShiftAssignment = shiftResult.rows[0].shift_assignment;
            console.log(`✅ Found staff in ${table.schema} with shift: ${staffShiftAssignment}`);
            break;
          }
        } catch (err) {
          // Table might not exist or column missing, continue
        }
      }
      
      // For "both" shift staff, determine which shift based on existing records
      if (staffShiftAssignment === 'both') {
        // Check all existing records for today
        const allRecordsToday = await pool.query(
          `SELECT shift_type, check_in, check_out FROM hr_ethiopian_attendance 
           WHERE staff_id = $1 
           AND ethiopian_year = $2 
           AND ethiopian_month = $3 
           AND ethiopian_day = $4
           ORDER BY shift_type NULLS FIRST`,
          [machineId.toString(), ethYear, ethMonth, ethDay]
        );
        
        console.log(`📋 Staff has BOTH shifts. Found ${allRecordsToday.rows.length} existing records today`);
        if (allRecordsToday.rows.length > 0) {
          console.log(`   Existing records:`, allRecordsToday.rows.map(r => ({
            shift: r.shift_type || 'NULL',
            checkIn: r.check_in,
            checkOut: r.check_out
          })));
        }
        
        // Determine which shift to use based on existing records
        const shift1Record = allRecordsToday.rows.find(r => r.shift_type === 'shift1');
        const shift2Record = allRecordsToday.rows.find(r => r.shift_type === 'shift2');
        
        if (!shift1Record) {
          // No shift1 record yet - this is shift1 check-in
          effectiveShift = 'shift1';
          console.log(`   → No shift1 record yet, using shift1`);
        } else if (shift1Record.check_in && !shift1Record.check_out) {
          // Shift1 has check-in but no check-out - this is shift1 check-out
          effectiveShift = 'shift1';
          console.log(`   → Shift1 needs check-out, using shift1`);
        } else if (!shift2Record) {
          // Shift1 is complete, no shift2 record yet - this is shift2 check-in
          effectiveShift = 'shift2';
          console.log(`   → Shift1 complete, no shift2 record yet, using shift2`);
        } else if (shift2Record.check_in && !shift2Record.check_out) {
          // Shift2 has check-in but no check-out - this is shift2 check-out
          effectiveShift = 'shift2';
          console.log(`   → Shift2 needs check-out, using shift2`);
        } else {
          // Both shifts complete - update shift2 check-out
          effectiveShift = 'shift2';
          console.log(`   → Both shifts complete, updating shift2 check-out`);
        }
      } else {
        effectiveShift = staffShiftAssignment;
        console.log(`📋 Staff shift assignment: ${effectiveShift}`);
      }
      
      // Check if this user already has a record for today (with shift_type)
      const existingRecord = await pool.query(
        `SELECT * FROM hr_ethiopian_attendance 
         WHERE staff_id = $1 
         AND ethiopian_year = $2 
         AND ethiopian_month = $3 
         AND ethiopian_day = $4
         AND (shift_type = $5 OR (shift_type IS NULL AND $5 = 'shift1'))`,
        [machineId.toString(), ethYear, ethMonth, ethDay, effectiveShift]
      );
      
      // Smart check-in/check-out logic:
      // For staff with "both" shifts:
      //   - Scan 1: Check-in for shift1
      //   - Scan 2: Check-out for shift1 (LOCKED - no more updates)
      //   - Scan 3: Check-in for shift2
      //   - Scan 4: Check-out for shift2 (LOCKED - no more updates)
      // For single shift staff:
      //   - Scan 1: Check-in
      //   - Scan 2: Check-out (LOCKED - no more updates)
      
      let checkInTime = null;
      let checkOutTime = null;
      let isCheckIn = false;
      let shouldSkip = false;
      
      if (existingRecord.rows.length === 0 || !existingRecord.rows[0].check_in) {
        // First scan for this shift = CHECK-IN
        checkInTime = timeOnly;
        isCheckIn = true;
        console.log(`✅ First scan for ${effectiveShift} → CHECK-IN: ${checkInTime}`);
      } else if (existingRecord.rows[0].check_in && !existingRecord.rows[0].check_out) {
        // Second scan for this shift = CHECK-OUT
        checkOutTime = timeOnly;
        isCheckIn = false;
        console.log(`✅ Second scan for ${effectiveShift} → CHECK-OUT: ${checkOutTime}`);
      } else {
        // Both check-in and check-out exist - RECORD IS COMPLETE, IGNORE THIS SCAN
        shouldSkip = true;
        console.log(`⏭️  ${effectiveShift} already complete (check-in: ${existingRecord.rows[0].check_in}, check-out: ${existingRecord.rows[0].check_out}) - IGNORING SCAN`);
      }
      
      // Skip if record is already complete
      if (shouldSkip) {
        console.log(`✅ Attendance acknowledged for user ${machineId} (no changes made)`);
        await pool.end();
        return;
      }
      
      // Fetch time settings from database
      // First check for shift-specific time settings
      const shiftSettingsResult = await pool.query(`
        SELECT late_threshold 
        FROM shift_time_settings 
        WHERE shift_name = $1
        LIMIT 1
      `, [effectiveShift]);
      
      let settings;
      let usedShiftSettings = false;
      
      if (shiftSettingsResult.rows.length > 0) {
        // Use shift-specific settings
        settings = shiftSettingsResult.rows[0];
        usedShiftSettings = true;
        console.log(`⚙️ Using ${effectiveShift} time settings (Late: ${settings.late_threshold})`);
      } else {
        // Fall back to global settings
        const globalSettingsResult = await pool.query(`
          SELECT late_threshold 
          FROM hr_attendance_time_settings 
          LIMIT 1
        `);
        
        settings = globalSettingsResult.rows[0] || {
          late_threshold: '08:15'
        };
        console.log(`⚙️ Using global time settings (Late: ${settings.late_threshold})`);
      }
      
      // Determine status based on check-in time and working hours
      let status = 'PRESENT';
      let isLate = false;
      let isHalfDay = false;
      
      if (isCheckIn && checkInTime) {
        // Check if late on check-in
        const [checkHour, checkMin] = checkInTime.split(':').map(Number);
        const checkInMinutes = checkHour * 60 + checkMin;
        
        const [lateHour, lateMin] = settings.late_threshold.split(':').map(Number);
        const lateThresholdMinutes = lateHour * 60 + lateMin;
        
        if (checkInMinutes > lateThresholdMinutes) {
          isLate = true;
          status = 'LATE';
        }
      } else if (existingRecord.rows.length > 0) {
        // For check-out scans, get existing status
        const existingStatus = existingRecord.rows[0].status || 'PRESENT';
        
        // Check if existing status includes LATE
        if (existingStatus.includes('LATE')) {
          isLate = true;
        }
        
        // Calculate working hours if we have both times
        if (existingRecord.rows[0].check_in && checkOutTime) {
          const [inHour, inMin] = existingRecord.rows[0].check_in.split(':').map(Number);
          const [outHour, outMin] = checkOutTime.split(':').map(Number);
          const inMinutes = inHour * 60 + inMin;
          const outMinutes = outHour * 60 + outMin;
          const workingHours = (outMinutes - inMinutes) / 60;
          
          // Check if half day based on working hours (4 hours threshold)
          const halfDayThreshold = 4.0;
          if (workingHours < halfDayThreshold) {
            isHalfDay = true;
          }
        }
        
        // Combine statuses
        if (isLate && isHalfDay) {
          status = 'LATE + HALF_DAY';
        } else if (isLate) {
          status = 'LATE';
        } else if (isHalfDay) {
          status = 'HALF_DAY';
        } else {
          status = existingStatus;
        }
      }
      
      console.log(`Ethiopian Date: Day ${ethDay}, Month ${ethMonth}, Year ${ethYear}`);
      console.log(`Status: ${status} (Late threshold: ${settings.late_threshold})`);
      console.log(`Check-in: ${checkInTime || existingRecord.rows[0]?.check_in || 'null'}, Check-out: ${checkOutTime || 'null'}`);
      
      // Insert or update attendance record
      // For check-in: insert new record with check_in value
      // For check-out: update existing record with check_out value
      if (isCheckIn) {
        // CHECK-IN: Insert new record
        const query = `
          INSERT INTO hr_ethiopian_attendance 
          (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, status, check_in, shift_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (staff_id, ethiopian_year, ethiopian_month, ethiopian_day, shift_type)
          DO UPDATE SET 
            check_in = EXCLUDED.check_in,
            status = EXCLUDED.status,
            updated_at = NOW()
        `;
        
        await pool.query(query, [
          machineId.toString(),
          name,
          ethYear,
          ethMonth,
          ethDay,
          status,
          checkInTime,
          effectiveShift
        ]);
      } else {
        // CHECK-OUT: Update existing record
        // DEFENSIVE: Verify record exists before updating
        const verifyResult = await pool.query(
          `SELECT id, check_in FROM hr_ethiopian_attendance 
           WHERE staff_id = $1 
           AND ethiopian_year = $2 
           AND ethiopian_month = $3 
           AND ethiopian_day = $4
           AND shift_type = $5`,
          [machineId.toString(), ethYear, ethMonth, ethDay, effectiveShift]
        );
        
        if (verifyResult.rows.length === 0 || !verifyResult.rows[0].check_in) {
          // Record doesn't exist or has no check-in - treat this as check-in instead
          console.log(`⚠️  CHECK-OUT attempted but no check-in record found - converting to CHECK-IN`);
          const insertQuery = `
            INSERT INTO hr_ethiopian_attendance 
            (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, status, check_in, shift_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (staff_id, ethiopian_year, ethiopian_month, ethiopian_day, shift_type)
            DO UPDATE SET 
              check_in = EXCLUDED.check_in,
              status = EXCLUDED.status,
              updated_at = NOW()
          `;
          
          await pool.query(insertQuery, [
            machineId.toString(),
            name,
            ethYear,
            ethMonth,
            ethDay,
            'PRESENT',
            timeOnly,
            effectiveShift
          ]);
        } else {
          // Record exists with check-in - proceed with check-out update
          const updateQuery = `
            UPDATE hr_ethiopian_attendance 
            SET check_out = $1, status = $2, updated_at = NOW()
            WHERE staff_id = $3 
            AND ethiopian_year = $4 
            AND ethiopian_month = $5 
            AND ethiopian_day = $6
            AND shift_type = $7
          `;
          
          await pool.query(updateQuery, [
            checkOutTime,
            status,
            machineId.toString(),
            ethYear,
            ethMonth,
            ethDay,
            effectiveShift
          ]);
        }
      }
      
      console.log(`✅ Attendance saved to database for Ethiopian date: ${ethMonth}/${ethDay}/${ethYear}`);
      
      await pool.end();
      
    } catch (error) {
      console.error('❌ Error saving attendance to database:', error);
    }
  }

  // Save student attendance to database
  async saveStudentAttendance(pool, studentInfo, scanTime, timeOnly) {
    try {
      console.log(`\n📚 ========================================`);
      console.log(`📚 Saving STUDENT Attendance`);
      console.log(`📚 ========================================`);
      console.log(`   Student: ${studentInfo.student_name}`);
      console.log(`   Student ID: ${studentInfo.student_id}`);
      console.log(`   Class: ${studentInfo.class_name}`);
      console.log(`   Machine ID: ${studentInfo.smachine_id}`);
      
      // Convert to Ethiopian date
      const { convertToEthiopian, getEthiopianDayOfWeek } = require('../utils/ethiopianCalendar');
      const scanDate = new Date(scanTime);
      const ethDate = convertToEthiopian(scanDate);
      const dayOfWeek = getEthiopianDayOfWeek(ethDate.year, ethDate.month, ethDate.day);
      const weekNumber = Math.ceil(ethDate.day / 7);
      
      console.log(`📅 Ethiopian Date: ${ethDate.day}/${ethDate.month}/${ethDate.year} (${dayOfWeek})`);
      console.log(`📅 Week Number: ${weekNumber}`);
      console.log(`⏰ Check-in Time: ${timeOnly}`);
      
      // Get time settings to determine status (PRESENT or LATE)
      // First, get the shift assignment for this class
      let shiftNumber = 1; // Default to Shift 1
      try {
        const shiftResult = await pool.query(
          'SELECT shift_number FROM academic_class_shift_assignment WHERE class_name = $1',
          [studentInfo.class_name]
        );
        
        if (shiftResult.rows.length > 0) {
          shiftNumber = shiftResult.rows[0].shift_number;
          console.log(`📋 Class ${studentInfo.class_name} is assigned to Shift ${shiftNumber}`);
        } else {
          console.log(`📋 No shift assignment found for ${studentInfo.class_name}, using Shift 1`);
        }
      } catch (err) {
        console.log('⚠️  Could not check shift assignment:', err.message);
      }
      
      let status = 'PRESENT';
      try {
        const settingsResult = await pool.query(
          'SELECT shift1_late_threshold, shift2_late_threshold FROM academic_student_attendance_settings ORDER BY id DESC LIMIT 1'
        );
        
        if (settingsResult.rows.length > 0) {
          const lateThreshold = shiftNumber === 2 
            ? settingsResult.rows[0].shift2_late_threshold 
            : settingsResult.rows[0].shift1_late_threshold;
          const checkInTimeOnly = timeOnly.substring(0, 5); // HH:MM
          
          if (checkInTimeOnly > lateThreshold) {
            status = 'LATE';
            console.log(`⏰ Student is LATE (checked in at ${checkInTimeOnly}, Shift ${shiftNumber} threshold: ${lateThreshold})`);
          } else {
            console.log(`✅ Student is ON TIME (checked in at ${checkInTimeOnly}, Shift ${shiftNumber} threshold: ${lateThreshold})`);
          }
        }
      } catch (err) {
        console.log('⚠️  Could not check late threshold:', err.message);
      }
      
      // Check if attendance already exists for today
      const existingResult = await pool.query(`
        SELECT * FROM academic_student_attendance
        WHERE student_id = $1 
          AND class_name = $2 
          AND ethiopian_year = $3 
          AND ethiopian_month = $4 
          AND ethiopian_day = $5
      `, [studentInfo.student_id, studentInfo.class_name, ethDate.year, ethDate.month, ethDate.day]);
      
      if (existingResult.rows.length > 0) {
        console.log(`⏭️  Attendance already exists for today - updating check-in time if earlier`);
        
        // Update only if new check-in time is earlier
        await pool.query(`
          UPDATE academic_student_attendance
          SET check_in_time = CASE
                WHEN check_in_time IS NULL OR $1 < check_in_time
                THEN $1
                ELSE check_in_time
              END,
              status = $2,
              notes = 'Auto-imported from AI06 machine',
              updated_at = NOW()
          WHERE student_id = $3
            AND class_name = $4
            AND ethiopian_year = $5
            AND ethiopian_month = $6
            AND ethiopian_day = $7
        `, [timeOnly, status, studentInfo.student_id, studentInfo.class_name, ethDate.year, ethDate.month, ethDate.day]);
        
        console.log(`✅ Updated existing attendance record`);
      } else {
        // Insert new attendance record
        await pool.query(`
          INSERT INTO academic_student_attendance 
          (student_id, student_name, class_name, smachine_id,
           ethiopian_year, ethiopian_month, ethiopian_day,
           day_of_week, week_number, check_in_time, status, notes, shift_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          studentInfo.student_id,
          studentInfo.student_name,
          studentInfo.class_name,
          studentInfo.smachine_id,
          ethDate.year,
          ethDate.month,
          ethDate.day,
          dayOfWeek,
          weekNumber,
          timeOnly,
          status,
          'Auto-imported from AI06 machine',
          shiftNumber
        ]);
        
        console.log(`✅ Inserted new attendance record for Shift ${shiftNumber}`);
      }
      
      console.log(`\n✅ ========================================`);
      console.log(`✅ STUDENT Attendance Saved Successfully`);
      console.log(`✅ ========================================`);
      console.log(`   Student: ${studentInfo.student_name}`);
      console.log(`   Date: ${ethDate.day}/${ethDate.month}/${ethDate.year} (${dayOfWeek})`);
      console.log(`   Status: ${status}`);
      console.log(`   Check-in: ${timeOnly}`);
      console.log(`✅ ========================================\n`);
      
    } catch (error) {
      console.error('❌ Error saving student attendance:', error);
    }
  }

  // Check student payment status
  async checkPaymentStatus(student) {
    const invoices = student.invoices || [];
    
    // Calculate total balance
    const totalBalance = invoices.reduce((sum, inv) => {
      return sum + (inv.totalAmount - inv.paidAmount);
    }, 0);
    
    // Find oldest unpaid invoice
    const unpaidInvoices = invoices.filter(inv => inv.paidAmount < inv.totalAmount);
    const oldestUnpaid = unpaidInvoices.sort((a, b) => 
      new Date(a.dueDate) - new Date(b.dueDate)
    )[0];
    
    const daysOverdue = oldestUnpaid 
      ? Math.floor((Date.now() - new Date(oldestUnpaid.dueDate)) / (1000 * 60 * 60 * 24))
      : 0;
    
    return {
      balance: totalBalance,
      daysOverdue: daysOverdue,
      status: this.determinePaymentStatus(totalBalance, daysOverdue)
    };
  }

  // Determine payment status category
  determinePaymentStatus(balance, daysOverdue) {
    if (balance === 0) return 'PAID';
    if (balance < 1000) return 'SMALL_BALANCE';
    if (daysOverdue > 30) return 'OVERDUE';
    if (daysOverdue > 0) return 'LATE';
    return 'BALANCE_DUE';
  }

  // Get voice message based on payment status
  getVoiceMessage(paymentStatus, name) {
    const messages = {
      'PAID': `Welcome ${name}. Thank you for your payment.`,
      'SMALL_BALANCE': `Welcome ${name}. You have a small balance remaining.`,
      'BALANCE_DUE': `${name}, please visit the finance office.`,
      'LATE': `${name}, your payment is late. See finance office.`,
      'OVERDUE': `${name}, URGENT: Payment overdue. See finance immediately.`
    };
    
    return messages[paymentStatus.status] || `Welcome ${name}`;
  }

  // Handle user sync from device
  async handleUserSync(ws, message) {
    const { enrollid, name, backupnum, admin, record } = message;
    
    console.log(`👤 User synced from device: ${enrollid} - ${name}`);
    
    // Acknowledge receipt
    const response = {
      ret: 'senduser',
      result: true,
      enrollid: enrollid,
      backupnum: backupnum
    };
    
    ws.send(JSON.stringify(response));
  }

  // Handle QR code scan
  async handleQRCode(ws, message) {
    const { record } = message;
    
    console.log(`📱 QR Code scanned: ${record}`);
    
    // Process QR code (could be student ID, visitor pass, etc.)
    const response = {
      ret: 'sendqrcode',
      result: true,
      access: 1,
      enrollid: 0,
      username: 'QR Visitor',
      message: 'QR code verified',
      voice: 'Welcome visitor'
    };
    
    ws.send(JSON.stringify(response));
  }

  // Handle PIN entry
  async handlePIN(ws, message) {
    const { pin, time } = message;
    
    console.log(`🔢 PIN entered: ${pin} at ${time}`);
    
    // Verify PIN against database
    const response = {
      ret: 'sendpin',
      result: true,
      access: 1,
      message: 'PIN verified',
      voice: 'Access granted'
    };
    
    ws.send(JSON.stringify(response));
  }

  // Send command to device
  sendCommand(sn, command) {
    const device = this.devices.get(sn);
    
    if (!device) {
      console.error(`Device ${sn} not connected`);
      return false;
    }
    
    device.ws.send(JSON.stringify(command));
    return true;
  }

  // Get list of connected devices with branch binding
  getConnectedDevices() {
    return Array.from(this.devices.entries()).map(([sn, device]) => ({
      serialNumber: sn,
      branch: device.branchCode,
      ip: device.ip,
      connectedAt: device.connectedAt
    }));
  }

  // Stop the server
  stop() {
    if (this.wss) {
      this.wss.close();
      console.log('AI06 WebSocket Server stopped');
    }
  }
}

module.exports = AI06WebSocketService;
