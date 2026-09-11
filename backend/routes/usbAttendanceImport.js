const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../config/db');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const fs = require('fs');
const path = require('path');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/attendance';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'attendance-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept .dat, .txt, .csv files
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.dat', '.txt', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .dat, .txt, or .csv files are allowed'));
    }
  }
});

/**
 * Parse attendance data from USB export file
 * ZKTeco machines typically export in format:
 * UserID\tDateTime\tStatus\tVerifyType
 * or
 * UserID,DateTime,Status,VerifyType
 */
function parseAttendanceFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const records = [];
  
  for (const line of lines) {
    // Try tab-separated
    let parts = line.split('\t');
    
    // Try comma-separated if tab didn't work
    if (parts.length < 2) {
      parts = line.split(',');
    }
    
    // Try space-separated if comma didn't work
    if (parts.length < 2) {
      parts = line.split(/\s+/);
    }
    
    if (parts.length >= 2) {
      const userId = parts[0].trim();
      const dateTime = parts[1].trim();
      const status = parts[2] ? parts[2].trim() : '0';
      const verifyType = parts[3] ? parts[3].trim() : '1';
      
      // Parse date/time
      let timestamp;
      try {
        // Try different date formats
        if (dateTime.includes('/')) {
          // Format: MM/DD/YYYY HH:mm:ss or DD/MM/YYYY HH:mm:ss
          timestamp = new Date(dateTime);
        } else if (dateTime.includes('-')) {
          // Format: YYYY-MM-DD HH:mm:ss
          timestamp = new Date(dateTime);
        } else {
          // Try parsing as is
          timestamp = new Date(dateTime);
        }
        
        if (isNaN(timestamp.getTime())) {
          console.log(`⚠️  Invalid date format: ${dateTime}`);
          continue;
        }
      } catch (error) {
        console.log(`⚠️  Error parsing date: ${dateTime}`);
        continue;
      }
      
      records.push({
        userId: parseInt(userId),
        timestamp,
        status,
        verifyType
      });
    }
  }
  
  return records;
}

/**
 * Upload and process attendance file from USB
 */
router.post('/upload', ...branchSafeUpload(upload.single('file')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('\n📁 ========================================');
    console.log('📁 Processing USB Attendance File');
    console.log('📁 ========================================');
    console.log('📄 File:', req.file.originalname);
    console.log('📊 Size:', req.file.size, 'bytes');
    console.log('========================================\n');

    // Parse the file
    const records = parseAttendanceFile(req.file.path);
    console.log(`📝 Found ${records.length} attendance records`);

    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'No valid attendance records found in file',
        message: 'Please check the file format'
      });
    }

    let savedCount = 0;
    let skippedCount = 0;
    let unmappedUsers = new Set();

    // Process each record
    for (const record of records) {
      try {
        // Find person by machine user ID
        const mappingResult = await pool.query(
          'SELECT person_id, person_type FROM user_machine_mapping WHERE machine_user_id = $1',
          [record.userId]
        );

        if (mappingResult.rows.length === 0) {
          unmappedUsers.add(record.userId);
          skippedCount++;
          continue;
        }

        const { person_id, person_type } = mappingResult.rows[0];
        const date = record.timestamp.toISOString().split('T')[0];

        // Insert attendance record
        const result = await pool.query(
          `INSERT INTO dual_mode_attendance 
           (person_id, person_type, date, status, source_type, source_machine_ip, timestamp)
           VALUES ($1, $2, $3, 'present', 'usb_import', '10.22.134.43', $4)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [person_id, person_type, date, record.timestamp]
        );

        if (result.rows.length > 0) {
          savedCount++;
          console.log(`✅ Saved: User ${record.userId} → ${person_id} at ${record.timestamp.toLocaleString()}`);
        } else {
          skippedCount++;
        }

      } catch (error) {
        console.error(`❌ Error processing record:`, error.message);
        skippedCount++;
      }
    }

    // Log the import
    await pool.query(
      `INSERT INTO attendance_audit_log (operation_type, performed_by, details)
       VALUES ('usb_import', 'system', $1)`,
      [JSON.stringify({
        filename: req.file.originalname,
        totalRecords: records.length,
        savedCount,
        skippedCount,
        unmappedUsers: Array.from(unmappedUsers),
        timestamp: new Date().toISOString()
      })]
    );

    console.log('\n✅ Import completed!');
    console.log(`   Saved: ${savedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    if (unmappedUsers.size > 0) {
      console.log(`   Unmapped users: ${Array.from(unmappedUsers).join(', ')}`);
    }

    res.json({
      success: true,
      message: 'Attendance imported successfully',
      stats: {
        totalRecords: records.length,
        saved: savedCount,
        skipped: skippedCount,
        unmappedUsers: Array.from(unmappedUsers)
      }
    });

  } catch (error) {
    console.error('❌ Error importing attendance:', error);
    res.status(500).json({ 
      error: 'Failed to import attendance',
      message: error.message 
    });
  }
});

/**
 * Get import history
 */
router.get('/history', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        operation_type,
        performed_by,
        details,
        created_at
      FROM attendance_audit_log
      WHERE operation_type = 'usb_import'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      imports: result.rows
    });

  } catch (error) {
    console.error('Error fetching import history:', error);
    res.status(500).json({ error: 'Failed to fetch import history' });
  }
});

module.exports = router;
