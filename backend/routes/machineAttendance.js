const express = require('express');
const router = express.Router();
const machineSyncService = require('../services/machineSyncService');
const aasImportService = require('../services/aasImportService');
const aasRealtimeSync = require('../services/aasRealtimeSync');
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Configure multer for CSV file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `aas-import-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Test machine connection
router.post('/test-connection', authenticateWithBranch, async (req, res) => {
  try {
    const { machineId } = req.body;

    if (!machineId) {
      return res.status(400).json({ error: 'Machine ID is required' });
    }

    const result = await machineSyncService.testConnection(machineId);
    res.json(result);

  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({ error: 'Failed to test connection', details: error.message });
  }
});

// Sync attendance from machine
router.post('/sync', authenticateWithBranch, async (req, res) => {
  try {
    const { machineId } = req.body;

    if (!machineId) {
      return res.status(400).json({ error: 'Machine ID is required' });
    }

    const result = await machineSyncService.syncFromMachine(machineId);
    res.json(result);

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync attendance', details: error.message });
  }
});

// Get machine configurations
router.get('/machines', authenticateWithBranch, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, ip_address, port, enabled, last_sync_at FROM machine_config ORDER BY name'
    );
    res.json({ machines: result.rows });

  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ error: 'Failed to fetch machines' });
  }
});

// Get sync logs
router.get('/sync-logs', authenticateWithBranch, async (req, res) => {
  try {
    const { machineId, limit = 50 } = req.query;

    let query = `
      SELECT sl.*, mc.name as machine_name 
      FROM sync_log sl
      JOIN machine_config mc ON sl.machine_id = mc.id
    `;
    const params = [];

    if (machineId) {
      query += ' WHERE sl.machine_id = $1';
      params.push(machineId);
    }

    query += ' ORDER BY sl.started_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await pool.query(query, params);
    res.json({ logs: result.rows });

  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// Get unmapped user IDs
router.get('/unmapped-users', authenticateWithBranch, async (req, res) => {
  try {
    const result = await machineSyncService.getUnmappedUserIds();
    res.json(result);

  } catch (error) {
    console.error('Error fetching unmapped users:', error);
    res.status(500).json({ error: 'Failed to fetch unmapped users' });
  }
});

// Create or update user mapping
router.post('/user-mapping', authenticateWithBranch, async (req, res) => {
  try {
    const { personId, personType, machineUserId } = req.body;

    if (!personId || !personType || !machineUserId) {
      return res.status(400).json({ error: 'personId, personType, and machineUserId are required' });
    }

    if (!['student', 'staff'].includes(personType)) {
      return res.status(400).json({ error: 'personType must be either "student" or "staff"' });
    }

    // Check if machine_user_id is already used
    const existingMapping = await pool.query(
      'SELECT * FROM user_machine_mapping WHERE machine_user_id = $1 AND person_id != $2',
      [machineUserId, personId]
    );

    if (existingMapping.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Machine User ID already assigned to another person',
        existingMapping: existingMapping.rows[0]
      });
    }

    // Insert or update mapping
    await pool.query(
      `INSERT INTO user_machine_mapping (person_id, person_type, machine_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (person_id, person_type) 
       DO UPDATE SET machine_user_id = $3, updated_at = NOW()`,
      [personId, personType, machineUserId]
    );

    res.json({ success: true, message: 'User mapping created successfully' });

  } catch (error) {
    console.error('Error creating user mapping:', error);
    res.status(500).json({ error: 'Failed to create user mapping', details: error.message });
  }
});

// Get user mappings
router.get('/user-mappings', authenticateWithBranch, async (req, res) => {
  try {
    const { personType } = req.query;

    let query = 'SELECT * FROM user_machine_mapping';
    const params = [];

    if (personType) {
      query += ' WHERE person_type = $1';
      params.push(personType);
    }

    query += ' ORDER BY person_id';

    const result = await pool.query(query, params);
    res.json({ mappings: result.rows });

  } catch (error) {
    console.error('Error fetching user mappings:', error);
    res.status(500).json({ error: 'Failed to fetch user mappings' });
  }
});

// Import attendance from AAS 6.0 CSV export
router.post('/import-csv', authenticateWithBranch, ...branchSafeUpload(upload.single('csvFile')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    console.log(`Processing AAS 6.0 CSV import: ${req.file.filename}`);

    const result = await aasImportService.importFromCSV(req.file.path);

    if (result.success) {
      res.json({
        success: true,
        message: 'CSV import completed successfully',
        recordsProcessed: result.recordsProcessed,
        recordsSaved: result.recordsSaved,
        unmappedStaffCodes: result.unmappedStaffCodes,
        errors: result.errors
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'CSV import failed',
        errors: result.errors
      });
    }

  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ 
      error: 'Failed to import CSV', 
      details: error.message 
    });
  }
});

// Get unmapped staff codes from recent imports
router.get('/unmapped-staff-codes', authenticateWithBranch, async (req, res) => {
  try {
    const unmappedCodes = await aasImportService.getUnmappedStaffCodes();
    res.json({ unmappedStaffCodes: unmappedCodes });

  } catch (error) {
    console.error('Error fetching unmapped staff codes:', error);
    res.status(500).json({ error: 'Failed to fetch unmapped staff codes' });
  }
});

// ============================================
// REAL-TIME SYNC ENDPOINTS (AAS 6.0 Database)
// ============================================

// Start automatic real-time sync
router.post('/realtime-sync/start', authenticateWithBranch, async (req, res) => {
  try {
    const { intervalMinutes = 2 } = req.body;

    const status = aasRealtimeSync.getStatus();
    if (status.isRunning) {
      return res.json({
        success: false,
        message: 'Real-time sync is already running',
        status
      });
    }

    aasRealtimeSync.startAutoSync(intervalMinutes);

    res.json({
      success: true,
      message: `Real-time sync started (every ${intervalMinutes} minutes)`,
      status: aasRealtimeSync.getStatus()
    });

  } catch (error) {
    console.error('Error starting real-time sync:', error);
    res.status(500).json({ error: 'Failed to start real-time sync', details: error.message });
  }
});

// Stop automatic real-time sync
router.post('/realtime-sync/stop', authenticateWithBranch, async (req, res) => {
  try {
    aasRealtimeSync.stopAutoSync();

    res.json({
      success: true,
      message: 'Real-time sync stopped',
      status: aasRealtimeSync.getStatus()
    });

  } catch (error) {
    console.error('Error stopping real-time sync:', error);
    res.status(500).json({ error: 'Failed to stop real-time sync', details: error.message });
  }
});

// Get real-time sync status
router.get('/realtime-sync/status', authenticateWithBranch, async (req, res) => {
  try {
    const status = aasRealtimeSync.getStatus();
    res.json({ status });

  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Trigger manual sync now
router.post('/realtime-sync/sync-now', authenticateWithBranch, async (req, res) => {
  try {
    const result = await aasRealtimeSync.syncNow();
    res.json(result);

  } catch (error) {
    console.error('Error syncing now:', error);
    res.status(500).json({ error: 'Failed to sync', details: error.message });
  }
});

// Inspect AAS database structure (for debugging)
router.get('/realtime-sync/inspect-database', authenticateWithBranch, async (req, res) => {
  try {
    const structure = await aasRealtimeSync.inspectDatabase();
    res.json({ structure });

  } catch (error) {
    console.error('Error inspecting database:', error);
    res.status(500).json({ error: 'Failed to inspect database', details: error.message });
  }
});

module.exports = router;
