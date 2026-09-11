const pool = require('../config/db'); // Use the main pool configuration

class AttendanceAutoMarker {
  constructor() {
    this.isRunning = false;
  }

  // Start the auto-marker (runs every minute)
  start() {
    if (this.isRunning) {
      console.log('⚠️ Attendance auto-marker is already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 Attendance auto-marker started');

    // Run immediately
    this.checkAndMarkAttendance();

    // Then run every minute
    this.interval = setInterval(() => {
      this.checkAndMarkAttendance();
    }, 60000); // 60 seconds
  }

  // Stop the auto-marker
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isRunning = false;
      console.log('🛑 Attendance auto-marker stopped');
    }
  }

  // Main function to check and mark attendance
  async checkAndMarkAttendance() {
    try {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      console.log(`🔍 Auto-marker checking attendance at ${currentTime}...`);

      // Get settings
      const settings = await this.getSettings();
      console.log(`⚙️ Settings: Max checkout=${settings.max_checkout_hours}h, Absent threshold=${settings.absent_threshold_time}`);
      
      // Convert current date to Ethiopian calendar
      const ethDate = this.gregorianToEthiopian(now);
      console.log(`📅 Ethiopian Date: ${ethDate.month}/${ethDate.day}/${ethDate.year}`);
      
      // 1. Mark staff without check-out
      await this.markMissingCheckOut(ethDate, currentTime, settings);
      
      // 2. Mark absent staff
      await this.markAbsentStaff(ethDate, currentTime, settings);
      
      // 3. Apply approved leave overrides
      await this.applyLeaveOverrides(ethDate);
      
      console.log(`✅ Auto-marker cycle complete`);
      
    } catch (error) {
      console.error('❌ Error in auto-marker:', error);
    }
  }

  // Get time settings from database
  async getSettings() {
    try {
      // Check if table exists
      const tableCheck = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = 'hr_attendance_time_settings'
      `);
      
      if (tableCheck.rows.length === 0) {
        // Table doesn't exist, return defaults
        console.log('⚠️ hr_attendance_time_settings table not found, using defaults');
        return {
          late_threshold: '08:15',
          half_day_threshold: 4.0,
          max_checkout_hours: 3.0,
          absent_threshold_time: '15:00',
          weekend_days: []
        };
      }
      
      const result = await pool.query(`
        SELECT 
          late_threshold,
          half_day_threshold,
          max_checkout_hours,
          absent_threshold_time,
          weekend_days
        FROM hr_attendance_time_settings 
        LIMIT 1
      `);

      return result.rows[0] || {
        late_threshold: '08:15',
        half_day_threshold: 4.0,
        max_checkout_hours: 3.0,
        absent_threshold_time: '15:00',
        weekend_days: []
      };
    } catch (error) {
      console.error('Error getting settings:', error.message);
      // Return defaults on error
      return {
        late_threshold: '08:15',
        half_day_threshold: 4.0,
        max_checkout_hours: 3.0,
        absent_threshold_time: '15:00',
        weekend_days: []
      };
    }
  }

  // Check if a date is a weekend
  isWeekend(date, weekendDays) {
    if (!weekendDays || weekendDays.length === 0) {
      return false; // No weekends configured
    }
    
    const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
    return weekendDays.includes(dayOfWeek);
  }

  // Convert Gregorian to Ethiopian date
  gregorianToEthiopian(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    let ethYear = year - 8;
    let ethMonth, ethDay;
    
    if (month >= 9) {
      if (month === 9 && day < 11) {
        ethYear = year - 9;
        ethMonth = 13;
        ethDay = day + 25;
      } else {
        ethMonth = month - 8;
        ethDay = day - 10;
        if (ethDay <= 0) {
          ethDay += 30;
          ethMonth -= 1;
        }
      }
    } else {
      ethMonth = month + 4;
      ethDay = day - 7;
      
      if (ethDay <= 0) {
        ethDay += 30;
        ethMonth -= 1;
      }
    }
    
    return { year: ethYear, month: ethMonth, day: ethDay };
  }

  // Mark staff who checked in but didn't check out
  async markMissingCheckOut(ethDate, currentTime, settings) {
    try {
      const maxCheckoutHours = parseFloat(settings.max_checkout_hours || 3.0);
      
      console.log(`🔍 Checking for missing check-outs (max: ${maxCheckoutHours}h)...`);
      
      // Get all records with check-in but no check-out for today
      const records = await pool.query(`
        SELECT * FROM hr_ethiopian_attendance
        WHERE ethiopian_year = $1 
          AND ethiopian_month = $2 
          AND ethiopian_day = $3
          AND check_in IS NOT NULL
          AND check_out IS NULL
          AND status NOT LIKE '%without check out%'
          AND status != 'LEAVE'
      `, [ethDate.year, ethDate.month, ethDate.day]);

      console.log(`📊 Found ${records.rows.length} records with check-in but no check-out`);

      for (const record of records.rows) {
        // Calculate time since check-in
        const checkInTime = record.check_in;
        const [checkInHour, checkInMin] = checkInTime.split(':').map(Number);
        const [currentHour, currentMin] = currentTime.split(':').map(Number);
        
        const checkInMinutes = checkInHour * 60 + checkInMin;
        const currentMinutes = currentHour * 60 + currentMin;
        const elapsedHours = (currentMinutes - checkInMinutes) / 60;

        console.log(`👤 ${record.staff_name}: Check-in ${checkInTime}, Elapsed: ${elapsedHours.toFixed(2)}h`);

        // If elapsed time exceeds max checkout hours, mark as "without check out"
        if (elapsedHours > maxCheckoutHours) {
          let newStatus = record.status;
          
          // Add "without check out" to existing status
          if (record.status === 'PRESENT') {
            newStatus = 'PRESENT + without check out';
          } else if (record.status === 'LATE') {
            newStatus = 'LATE + without check out';
          } else if (record.status === 'HALF_DAY') {
            newStatus = 'HALF_DAY + without check out';
          } else if (record.status === 'LATE + HALF_DAY') {
            newStatus = 'LATE + HALF_DAY + without check out';
          }

          await pool.query(`
            UPDATE hr_ethiopian_attendance
            SET status = $1, updated_at = NOW()
            WHERE id = $2
          `, [newStatus, record.id]);

          console.log(`✅ Marked ${record.staff_name} as "${newStatus}" (${elapsedHours.toFixed(1)}h since check-in)`);
        } else {
          console.log(`⏳ ${record.staff_name}: Not yet (${elapsedHours.toFixed(2)}h < ${maxCheckoutHours}h)`);
        }
      }
    } catch (error) {
      console.error('❌ Error marking missing check-out:', error);
    }
  }

  // Mark staff who didn't check in as ABSENT
  async markAbsentStaff(ethDate, currentTime, settings) {
    try {
      const absentThreshold = settings.absent_threshold_time || '15:00'; // 3:00 PM
      
      console.log(`🔍 Checking for absent staff (threshold: ${absentThreshold}, current: ${currentTime})...`);
      
      // Only mark as absent if current time is past the threshold
      if (currentTime < absentThreshold) {
        console.log(`⏳ Too early to mark absent (current ${currentTime} < threshold ${absentThreshold})`);
        return; // Too early to mark absent
      }

      console.log(`✅ Past threshold - checking for absent staff...`);

      // Get ALL staff from staff tables
      let allStaff = new Map();
      
      try {
        // Query all staff tables and get their data
        const staffSchemas = [
          { schema: 'staff_teachers', type: 'Teachers' },
          { schema: 'staff_administrative_staff', type: 'Administrative Staff' },
          { schema: 'staff_supportive_staff', type: 'Supportive Staff' },
          { schema: 'staff_finance', type: 'Finance' }
        ];

        for (const { schema, type } of staffSchemas) {
          try {
            // Get all tables in this schema
            const tablesResult = await pool.query(`
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = $1 
                AND table_type = 'BASE TABLE'
            `, [schema]);

            for (const tableRow of tablesResult.rows) {
              const tableName = tableRow.table_name;
              
              try {
                // Check if shift_assignment column exists
                const columnCheck = await pool.query(`
                  SELECT column_name 
                  FROM information_schema.columns 
                  WHERE table_schema = $1 
                    AND table_name = $2 
                    AND column_name = 'shift_assignment'
                `, [schema, tableName]);
                
                const hasShiftColumn = columnCheck.rows.length > 0;
                
                // Check if is_active column exists
                const isActiveCheck = await pool.query(`
                  SELECT column_name 
                  FROM information_schema.columns 
                  WHERE table_schema = $1 
                    AND table_name = $2 
                    AND column_name = 'is_active'
                `, [schema, tableName]);
                
                const hasIsActiveColumn = isActiveCheck.rows.length > 0;
                
                // Build query based on available columns
                let staffQuery;
                if (hasShiftColumn && hasIsActiveColumn) {
                  staffQuery = `
                    SELECT machine_id, name, global_staff_id, shift_assignment
                    FROM "${schema}"."${tableName}"
                    WHERE is_active = TRUE OR is_active IS NULL
                  `;
                } else if (hasShiftColumn) {
                  staffQuery = `
                    SELECT machine_id, name, global_staff_id, shift_assignment
                    FROM "${schema}"."${tableName}"
                  `;
                } else if (hasIsActiveColumn) {
                  staffQuery = `
                    SELECT machine_id, name, global_staff_id, 'shift1' as shift_assignment
                    FROM "${schema}"."${tableName}"
                    WHERE is_active = TRUE OR is_active IS NULL
                  `;
                } else {
                  staffQuery = `
                    SELECT machine_id, name, global_staff_id, 'shift1' as shift_assignment
                    FROM "${schema}"."${tableName}"
                  `;
                }
                
                const staffResult = await pool.query(staffQuery);

                staffResult.rows.forEach(staff => {
                  // Prefer machine_id, fallback to global_staff_id, then name
                  const staffId = staff.machine_id || staff.global_staff_id || staff.name;
                  const name = staff.name;
                  const shiftAssignment = staff.shift_assignment || 'shift1';
                  
                  if (staffId && name) {
                    // For staff with "both" shifts, we need to track both shifts
                    if (shiftAssignment === 'both') {
                      allStaff.set(`${staffId}-shift1`, { name, staffId, shift: 'shift1' });
                      allStaff.set(`${staffId}-shift2`, { name, staffId, shift: 'shift2' });
                    } else {
                      allStaff.set(`${staffId}-${shiftAssignment}`, { name, staffId, shift: shiftAssignment });
                    }
                  }
                });
              } catch (err) {
                console.log(`⚠️ Could not query table ${schema}.${tableName}:`, err.message);
              }
            }
          } catch (err) {
            console.log(`⚠️ Could not query schema ${schema}:`, err.message);
          }
        }
        
        console.log(`📋 Found ${allStaff.size} staff entries (including shift assignments)`);
      } catch (err) {
        console.log(`❌ Could not load staff from staff tables:`, err.message);
        return;
      }

      if (allStaff.size === 0) {
        console.log(`⚠️ No staff found`);
        return;
      }

      console.log(`👥 Staff to check for absent (first 10):`);
      let count = 0;
      for (const [key, data] of allStaff) {
        if (count++ < 10) {
          console.log(`   - ${data.name} (ID: ${data.staffId}, Shift: ${data.shift})`);
        }
      }

      let markedCount = 0;
      
      // Check TODAY and PAST 30 DAYS for missing attendance
      for (let daysAgo = 0; daysAgo <= 30; daysAgo++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - daysAgo);
        
        // Convert to Ethiopian date FIRST
        const checkEthDate = this.gregorianToEthiopian(checkDate);
        
        // IMPORTANT: Check if the GREGORIAN date is a weekend
        // (Weekend configuration is based on Gregorian calendar days)
        if (this.isWeekend(checkDate, settings.weekend_days)) {
          if (daysAgo === 0 || daysAgo === 7 || daysAgo === 14 || daysAgo === 30) {
            const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][checkDate.getDay()];
            console.log(`⏭️ Skipping ${dayName} ${checkDate.toDateString()} (Eth: ${checkEthDate.month}/${checkEthDate.day}/${checkEthDate.year}) - weekend day`);
          }
          continue; // Skip weekend days
        }
        
        if (daysAgo === 0 || daysAgo === 7 || daysAgo === 14 || daysAgo === 30) {
          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][checkDate.getDay()];
          console.log(`\n📅 Checking date: ${checkEthDate.month}/${checkEthDate.day}/${checkEthDate.year} (${dayName} ${checkDate.toDateString()})`);
        }
        
        for (const [key, staffData] of allStaff) {
          const { staffId, name, shift } = staffData;
          
          // Check if this staff has attendance record for this date and shift
          const attendanceResult = await pool.query(`
            SELECT * FROM hr_ethiopian_attendance
            WHERE (staff_id = $1 OR LOWER(staff_name) = LOWER($2))
              AND ethiopian_year = $3 
              AND ethiopian_month = $4 
              AND ethiopian_day = $5
              AND (shift_type = $6 OR (shift_type IS NULL AND $6 = 'shift1'))
          `, [staffId, name, checkEthDate.year, checkEthDate.month, checkEthDate.day, shift]);

          // If no record exists for this date and shift, mark as ABSENT
          if (attendanceResult.rows.length === 0) {
            await pool.query(`
              INSERT INTO hr_ethiopian_attendance
              (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, status, check_in, shift_type)
              VALUES ($1, $2, $3, $4, $5, 'ABSENT', '00:00', $6)
              ON CONFLICT (staff_id, ethiopian_year, ethiopian_month, ethiopian_day, shift_type) 
              DO NOTHING
            `, [staffId, name, checkEthDate.year, checkEthDate.month, checkEthDate.day, shift]);

            if (daysAgo <= 7) {
              console.log(`✅ Marked ${name} (ID: ${staffId}, Shift: ${shift}) as ABSENT for ${checkEthDate.month}/${checkEthDate.day}/${checkEthDate.year}`);
            }
            markedCount++;
          }
        }
      }

      if (markedCount === 0) {
        console.log(`✅ No staff to mark as absent (all have attendance records)`);
      } else {
        console.log(`\n✅ Marked ${markedCount} staff as ABSENT across past 30 days`);
      }
    } catch (error) {
      console.error('❌ Error marking absent staff:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }

  // Apply approved leave overrides
  async applyLeaveOverrides(ethDate) {
    try {
      // Check if leave table exists first
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'hr_leave_requests'
        );
      `);

      if (!tableCheck.rows[0].exists) {
        // Table doesn't exist yet, skip leave override
        return;
      }

      // Get all approved leave requests for today
      const leaveResult = await pool.query(`
        SELECT DISTINCT staff_id, staff_name
        FROM hr_leave_requests
        WHERE status = 'APPROVED'
          AND start_date <= CURRENT_DATE
          AND end_date >= CURRENT_DATE
      `);

      for (const leave of leaveResult.rows) {
        // Check if attendance record exists
        const attendanceResult = await pool.query(`
          SELECT * FROM hr_ethiopian_attendance
          WHERE staff_id = $1 
            AND ethiopian_year = $2 
            AND ethiopian_month = $3 
            AND ethiopian_day = $4
        `, [leave.staff_id, ethDate.year, ethDate.month, ethDate.day]);

        if (attendanceResult.rows.length > 0) {
          // Update existing record to LEAVE
          await pool.query(`
            UPDATE hr_ethiopian_attendance
            SET status = 'LEAVE', updated_at = NOW()
            WHERE staff_id = $1 
              AND ethiopian_year = $2 
              AND ethiopian_month = $3 
              AND ethiopian_day = $4
          `, [leave.staff_id, ethDate.year, ethDate.month, ethDate.day]);

          console.log(`✅ Changed ${leave.staff_name} to LEAVE (approved leave)`);
        } else {
          // Create new record with LEAVE status
          await pool.query(`
            INSERT INTO hr_ethiopian_attendance
            (staff_id, staff_name, ethiopian_year, ethiopian_month, ethiopian_day, status, check_in)
            VALUES ($1, $2, $3, $4, $5, 'LEAVE', '00:00')
          `, [leave.staff_id, leave.staff_name, ethDate.year, ethDate.month, ethDate.day]);

          console.log(`✅ Marked ${leave.staff_name} as LEAVE (approved leave)`);
        }
      }
    } catch (error) {
      console.error('❌ Error applying leave overrides:', error.message);
      // Don't throw error, just log it and continue
    }
  }
}

module.exports = new AttendanceAutoMarker();
