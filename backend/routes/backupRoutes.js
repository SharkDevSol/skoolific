const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const XLSX = require('xlsx');
const { authenticateWithBranch } = require('../middleware/branchAuth');

const BACKUP_ROOT = path.join(__dirname, '..', 'backups');
const MAX_SQL_KEEP = 10;
const MAX_EXCEL_KEEP = 10;

function ensureBackupDir(branchCode) {
  const dir = path.join(BACKUP_ROOT, branchCode);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Safely resolve a file path inside the branch backup dir (supports subpaths)
function resolveBackupFile(branchCode, filePathIn) {
  const dir = path.resolve(path.join(BACKUP_ROOT, branchCode));
  const full = path.resolve(dir, String(filePathIn).replace(/^\/+/, ''));
  if (full !== dir && !full.startsWith(dir + path.sep)) return null;
  return full;
}

async function cleanupOldBackups(branchCode, prefix, keepCount) {
  try {
    const dir = path.join(BACKUP_ROOT, branchCode);
    const files = await fsp.readdir(dir);
    const matching = files
      .filter(f => f.startsWith(prefix))
      .sort()
      .reverse();
    for (const old of matching.slice(keepCount)) {
      await fsp.unlink(path.join(dir, old)).catch(() => {});
      // Remove empty excel batch folders' leftovers inside batch dirs
    }
  } catch (e) {
    console.warn('Backup cleanup warning:', e.message);
  }
}

// ===========================================
// Excel category collectors (graceful fallback)
// ===========================================
async function safeQuery(pool, sql, params = []) {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch (e) {
    if (e.code === '42P01') return []; // table does not exist
    console.warn('Backup excel query warning:', e.message);
    return [];
  }
}

async function collectCategory(pool, category) {
  switch (category) {
    case 'students': {
      const tables = (await safeQuery(
        pool,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`
      )).map(r => r.table_name);
      const rows = [];
      for (const t of tables) {
        const classRows = await safeQuery(pool, `SELECT * FROM classes_schema."${t}"`);
        classRows.forEach(r => rows.push({ Class: t, ...r }));
      }
      const archived = await safeQuery(pool, 'SELECT * FROM public.archived_students');
      archived.forEach(r => rows.push({ ...r, _archived: true }));
      return rows;
    }
    case 'staff':
      return await safeQuery(pool, 'SELECT * FROM public.staff ORDER BY id');
    case 'subjects': {
      const subjects = await safeQuery(pool, 'SELECT * FROM public.subjects ORDER BY id');
      const mappings = await safeQuery(pool, 'SELECT * FROM public.subject_class_mapping ORDER BY id');
      return { subjects, subject_class_mapping: mappings };
    }
    case 'marklist_forms':
      return await safeQuery(pool, 'SELECT * FROM public.mark_lists ORDER BY id');
    case 'marklist_components': {
      const marks = await safeQuery(pool, 'SELECT * FROM public.student_marks ORDER BY id');
      const archived = await safeQuery(pool, 'SELECT * FROM public.archived_marks');
      return { student_marks: marks, archived_marks: archived };
    }
    case 'student_attendance': {
      const att = await safeQuery(pool, 'SELECT * FROM public.student_attendance ORDER BY id');
      const archived = await safeQuery(pool, 'SELECT * FROM public.archived_attendance');
      return { student_attendance: att, archived_attendance: archived };
    }
    case 'staff_attendance': {
      const att = await safeQuery(pool, 'SELECT * FROM public.staff_attendance ORDER BY id');
      const logs = await safeQuery(pool, 'SELECT * FROM public.staff_attendance_logs ORDER BY id');
      return { staff_attendance: att, staff_attendance_logs: logs };
    }
    case 'monthly_payments': {
      const payments = await safeQuery(pool, 'SELECT * FROM public.fee_payments ORDER BY id');
      const fees = await safeQuery(pool, 'SELECT * FROM public.simple_fee_structures ORDER BY id');
      const invoices = await safeQuery(pool, 'SELECT * FROM school_comms.invoice ORDER BY id');
      const prismaPayments = await safeQuery(pool, 'SELECT * FROM school_comms.payment ORDER BY id');
      const out = { fee_payments: payments, fee_structures: fees };
      if (invoices.length > 0) out.invoices = invoices;
      if (prismaPayments.length > 0) out.prisma_payments = prismaPayments;
      return out;
    }
    default:
      return [];
  }
}

function writeExcelBook(filePath, category, data) {
  const wb = XLSX.utils.book_new();
  if (Array.isArray(data)) {
    if (data.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), 'Data');
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Data');
    }
  } else if (data && typeof data === 'object') {
    let added = false;
    for (const [sheetName, rows] of Object.entries(data)) {
      if (!Array.isArray(rows)) continue;
      const safeName = String(sheetName).slice(0, 31).replace(/[\\/?*\[\]:]/g, '_');
      if (rows.length === 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), safeName);
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), safeName);
      }
      added = true;
    }
    if (!added) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), 'Data');
    }
  } else {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), 'Data');
  }
  XLSX.writeFile(wb, filePath);
}

// ===========================================
// Routes
// ===========================================

// List backups for current branch
router.get('/', authenticateWithBranch, async (req, res) => {
  try {
    const dir = path.join(BACKUP_ROOT, req.branchCode);
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      fs.mkdirSync(dir, { recursive: true });
      entries = [];
    }
    const items = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name.startsWith('excel-')) {
        // Excel batch folder -> list its files
        const files = [];
        try {
          const inner = await fsp.readdir(full);
          for (const f of inner.sort()) {
            const stat = await fsp.stat(path.join(full, f));
            files.push({ name: `${entry.name}/${f}`, size: stat.size, sizeHuman: formatSize(stat.size) });
          }
        } catch (e) { /* ignore */ }
        const stat = await fsp.stat(full);
        items.push({
          name: entry.name,
          type: 'excel',
          modified: stat.mtime,
          files
        });
      } else if (entry.isFile()) {
        const stat = await fsp.stat(full);
        if (stat.size === 0) continue;
        items.push({
          name: entry.name,
          size: stat.size,
          sizeHuman: formatSize(stat.size),
          modified: stat.mtime,
          type: entry.name.startsWith('sql-') ? 'sql' : 'other'
        });
      }
    }
    items.sort((a, b) => b.modified - a.modified);
    res.json({ success: true, branch: req.branchCode, files: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create full SQL backup (pg_dump)
router.post('/sql', authenticateWithBranch, async (req, res) => {
  try {
    const pool = req.branchPool;
    const dbName = pool.options && pool.options.database;
    if (!dbName) return res.status(500).json({ success: false, error: 'Could not resolve branch database name' });

    const dir = ensureBackupDir(req.branchCode);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `sql-${timestamp}.sql`;
    const filePath = path.join(dir, filename);

    await new Promise((resolve, reject) => {
      const child = execFile(
        'pg_dump',
        ['-h', 'localhost', '-U', process.env.DB_USER || 'iqra', '-d', dbName, '--no-owner', '--no-privileges'],
        {
          env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
          maxBuffer: 512 * 1024 * 1024
        },
        (err) => err ? reject(new Error(err.message)) : resolve()
      );
      const out = fs.createWriteStream(filePath);
      child.stdout.pipe(out);
      child.stdout.on('error', reject);
    });

    await cleanupOldBackups(req.branchCode, 'sql-', MAX_SQL_KEEP);

    const stat = await fsp.stat(filePath);
    res.json({
      success: true,
      message: `SQL backup created for branch ${req.branchCode}`,
      file: { name: filename, size: stat.size, sizeHuman: formatSize(stat.size), modified: stat.mtime, type: 'sql' }
    });
  } catch (error) {
    console.error('SQL backup error:', error);
    res.status(500).json({ success: false, error: 'Backup failed: ' + error.message });
  }
});

// Create Excel backup (all categories)
router.post('/excel', authenticateWithBranch, async (req, res) => {
  try {
    const pool = req.branchPool;
    const dir = ensureBackupDir(req.branchCode);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const batchName = `excel-${timestamp}`;
    const batchDir = path.join(dir, batchName);
    fs.mkdirSync(batchDir, { recursive: true });

    const categories = [
      { key: 'students', file: 'students.xlsx', label: 'Students' },
      { key: 'staff', file: 'staff.xlsx', label: 'Staff' },
      { key: 'subjects', file: 'subjects.xlsx', label: 'Subjects' },
      { key: 'marklist_forms', file: 'marklist_forms.xlsx', label: 'Marklist Forms' },
      { key: 'marklist_components', file: 'marklist_components.xlsx', label: 'Marklist Components' },
      { key: 'student_attendance', file: 'student_attendance.xlsx', label: 'Student Attendance' },
      { key: 'staff_attendance', file: 'staff_attendance.xlsx', label: 'Staff Attendance' },
      { key: 'monthly_payments', file: 'monthly_payments.xlsx', label: 'Monthly Payments' }
    ];

    const created = [];
    for (const cat of categories) {
      const data = await collectCategory(pool, cat.key);
      const filePath = path.join(batchDir, cat.file);
      writeExcelBook(filePath, cat.key, data);
      const stat = await fsp.stat(filePath);
      created.push({ name: `${batchName}/${cat.file}`, label: cat.label, size: stat.size, sizeHuman: formatSize(stat.size) });
    }

    // Retention: keep only the newest MAX_EXCEL_KEEP excel-* batches
    await cleanupOldExcelBatches(req.branchCode, MAX_EXCEL_KEEP);

    res.json({
      success: true,
      message: `Excel backup created for branch ${req.branchCode} (${created.length} files)`,
      batch: batchName,
      files: created
    });
  } catch (error) {
    console.error('Excel backup error:', error);
    res.status(500).json({ success: false, error: 'Backup failed: ' + error.message });
  }
});

async function cleanupOldExcelBatches(branchCode, keepCount) {
  try {
    const dir = path.join(BACKUP_ROOT, branchCode);
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const batches = entries
      .filter(e => e.isDirectory() && e.name.startsWith('excel-'))
      .map(e => e.name)
      .sort()
      .reverse();
    for (const old of batches.slice(keepCount)) {
      await fsp.rm(path.join(dir, old), { recursive: true, force: true }).catch(() => {});
    }
  } catch (e) {
    console.warn('Excel batch cleanup warning:', e.message);
  }
}

// Download a backup file (supports excel batch subpaths)
router.get('/download', authenticateWithBranch, async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) return res.status(400).json({ success: false, error: 'file parameter is required' });
    const full = resolveBackupFile(req.branchCode, file);
    if (!full || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      return res.status(404).json({ success: false, error: 'Backup file not found' });
    }
    res.download(full, path.basename(full));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a backup file (or excel batch folder)
router.delete('/delete', authenticateWithBranch, async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) return res.status(400).json({ success: false, error: 'file parameter is required' });
    const full = resolveBackupFile(req.branchCode, file);
    if (!full || !fs.existsSync(full)) {
      return res.status(404).json({ success: false, error: 'Backup file not found' });
    }
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      await fsp.rm(full, { recursive: true, force: true });
    } else {
      await fsp.unlink(full);
    }
    res.json({ success: true, message: 'Backup deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

module.exports = router;
