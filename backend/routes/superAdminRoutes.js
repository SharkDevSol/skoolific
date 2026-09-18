const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbManager = require('../services/DatabaseConnectionManager');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/jwtValidator');

const DB_NAME = process.env.DB_NAME || 'iqrab1';
const DB_USER = process.env.DB_USER || 'iqra';
const DB_PASSWORD = String(process.env.DB_PASSWORD || '');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');

function getMasterPool() {
  return new Pool({
    host: DB_HOST, port: DB_PORT, database: DB_NAME,
    user: DB_USER, password: DB_PASSWORD, max: 5
  });
}

async function ensureSuperAdminsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(150),
      email VARCHAR(150),
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ============================================
// AUTH
// ============================================
router.post('/login', async (req, res) => {
  const pool = getMasterPool();
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    await ensureSuperAdminsTable(pool);

    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: 'super_admin',
        fullName: admin.full_name || admin.username
      },
      JWT_SECRET,
      { expiresIn: '24h', issuer: 'school-management-system', audience: 'school-app' }
    );

    await pool.query('UPDATE super_admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);

    res.json({
      success: true,
      token,
      user: {
        id: admin.id,
        username: admin.username,
        fullName: admin.full_name || admin.username,
        role: 'super_admin'
      }
    });
  } catch (error) {
    console.error('Super Admin login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  } finally {
    await pool.end().catch(() => {});
  }
});

router.post('/setup', async (req, res) => {
  // One-time bootstrap: create the first super admin account
  const pool = getMasterPool();
  try {
    const { username, password, fullName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    await ensureSuperAdminsTable(pool);
    const existing = await pool.query('SELECT id FROM super_admins WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO super_admins (username, password_hash, full_name) VALUES ($1, $2, $3)',
      [username, hash, fullName || username]
    );
    res.json({ success: true, message: 'Super admin created' });
  } catch (error) {
    console.error('Super admin setup error:', error);
    res.status(500).json({ error: 'Setup failed', message: error.message });
  } finally {
    await pool.end().catch(() => {});
  }
});

// ============================================
// HELPERS
// ============================================
// Branches hidden from the Super Admin app (owner's own branches are not reported here)
const EXCLUDED_BRANCHES = ['IQRA1', 'MAI'];

async function getSelectedBranches(branchCode) {
  const branches = await dbManager.getAllBranches();
  const allowed = branches.filter(
    (b) => !EXCLUDED_BRANCHES.includes(String(b.branch_code).toUpperCase())
  );
  if (!branchCode || String(branchCode).toUpperCase() === 'ALL') {
    return allowed;
  }
  const code = String(branchCode).toUpperCase();
  return allowed.filter((b) => String(b.branch_code).toUpperCase() === code);
}

async function getPoolSafe(branch) {
  try {
    return await dbManager.getPool(branch.branch_code);
  } catch (e) {
    return null;
  }
}

async function hasColumn(pool, schema, table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column]
  );
  return r.rows.length > 0;
}

// ============================================
// REPORTS
// ============================================

// ---- STUDENTS: totals by class and by branch ----
router.get('/report/students', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = await getSelectedBranches(req.query.branchCode);
    const byBranch = [];
    const classTotals = {};
    let grandTotal = 0, grandMale = 0, grandFemale = 0;

    for (const b of branches) {
      const pool = await getPoolSafe(b);
      if (!pool) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: 'Database unreachable' });
        continue;
      }
      try {
        const tables = (await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`
        )).rows.map(r => r.table_name);

        const classes = [];
        let total = 0, male = 0, female = 0;
        for (const t of tables) {
          const hasActive = await hasColumn(pool, 'classes_schema', t, 'is_active');
          const hasGender = await hasColumn(pool, 'classes_schema', t, 'gender');
          const where = hasActive ? `WHERE (is_active IS NULL OR is_active = TRUE)` : '';
          const cnt = (await pool.query(`SELECT COUNT(*)::int AS c FROM classes_schema."${t}" ${where}`)).rows[0].c;
          let m = 0, f = 0;
          if (hasGender) {
            const g = await pool.query(
              `SELECT COUNT(*) FILTER (WHERE lower(gender) = 'male')::int AS m, COUNT(*) FILTER (WHERE lower(gender) = 'female')::int AS f FROM classes_schema."${t}" ${where}`
            );
            m = g.rows[0].m; f = g.rows[0].f;
          }
          classes.push({ className: t, students: cnt, male: m, female: f });
          total += cnt; male += m; female += f;

          if (!classTotals[t]) classTotals[t] = { className: t, students: 0, male: 0, female: 0 };
          classTotals[t].students += cnt;
          classTotals[t].male += m;
          classTotals[t].female += f;
        }

        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, total, male, female, classes });
        grandTotal += total; grandMale += male; grandFemale += female;
      } catch (e) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: e.message });
      }
    }

    res.json({
      success: true,
      data: {
        grandTotal, grandMale, grandFemale,
        byBranch,
        byClass: Object.values(classTotals).sort((a, c) => a.className.localeCompare(c.className))
      }
    });
  } catch (error) {
    console.error('Students report error:', error);
    res.status(500).json({ error: 'Failed to build students report', message: error.message });
  }
});

// ---- ATTENDANCE: by class and status, filterable by Ethiopian year/month/day ----
router.get('/report/attendance', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = await getSelectedBranches(req.query.branchCode);
    const year = req.query.year ? parseInt(req.query.year) : null;
    const month = req.query.month ? parseInt(req.query.month) : null;
    const day = req.query.day ? parseInt(req.query.day) : null;

    const filters = [];
    const values = [];
    if (year) { values.push(year); filters.push(`ethiopian_year = $${values.length}`); }
    if (month) { values.push(month); filters.push(`ethiopian_month = $${values.length}`); }
    if (day) { values.push(day); filters.push(`ethiopian_day = $${values.length}`); }
    const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const byBranch = [];
    let grandPresent = 0, grandLate = 0, grandAbsent = 0, grandTotal = 0;

    for (const b of branches) {
      const pool = await getPoolSafe(b);
      if (!pool) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: 'Database unreachable' });
        continue;
      }
      try {
        const rows = (await pool.query(
          `SELECT class_name, status, COUNT(*)::int AS c
           FROM academic_student_attendance
           ${whereSql}
           GROUP BY class_name, status ORDER BY class_name`,
          values
        )).rows;

        const classMap = {};
        for (const r of rows) {
          if (!classMap[r.class_name]) classMap[r.class_name] = { className: r.class_name, present: 0, late: 0, absent: 0 };
          const st = String(r.status || '').toUpperCase();
          if (st === 'PRESENT') classMap[r.class_name].present += r.c;
          else if (st === 'LATE') classMap[r.class_name].late += r.c;
          else classMap[r.class_name].absent += r.c;
        }

        const classes = Object.values(classMap);
        let p = 0, l = 0, a = 0;
        for (const c of classes) {
          c.total = c.present + c.late + c.absent;
          c.rate = c.total > 0 ? Math.round((c.present / c.total) * 100) : 0;
          p += c.present; l += c.late; a += c.absent;
        }
        const total = p + l + a;
        byBranch.push({
          branchCode: b.branch_code, branchName: b.branch_name,
          present: p, late: l, absent: a, total,
          rate: total > 0 ? Math.round((p / total) * 100) : 0,
          classes
        });
        grandPresent += p; grandLate += l; grandAbsent += a; grandTotal += total;
      } catch (e) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: e.message });
      }
    }

    res.json({
      success: true,
      filters: { year, month, day },
      data: {
        grandTotal, grandPresent, grandLate, grandAbsent,
        grandRate: grandTotal > 0 ? Math.round((grandPresent / grandTotal) * 100) : 0,
        byBranch
      }
    });
  } catch (error) {
    console.error('Attendance report error:', error);
    res.status(500).json({ error: 'Failed to build attendance report', message: error.message });
  }
});

// ---- MARKS: exams and averages by class, filterable by term / academic year ----
router.get('/report/marks', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = await getSelectedBranches(req.query.branchCode);
    const academicYear = req.query.academic_year || null;
    const term = req.query.term || null;

    const filters = [];
    const values = [];
    if (academicYear) { values.push(academicYear); filters.push(`ml.academic_year = $${values.length}`); }
    if (term) { values.push(term); filters.push(`ml.term = $${values.length}`); }
    const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const byBranch = [];
    let grandExams = 0, grandMarks = 0;
    const allAvgs = [];

    for (const b of branches) {
      const pool = await getPoolSafe(b);
      if (!pool) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: 'Database unreachable' });
        continue;
      }
      try {
        const rows = (await pool.query(
          `SELECT COALESCE(ml.class_id, 0) AS class_id,
                  COUNT(DISTINCT ml.id)::int AS exams,
                  COUNT(sm.id)::int AS marks,
                  ROUND(AVG(sm.percentage)::numeric, 1) AS avg_pct,
                  ROUND(AVG(sm.marks_obtained)::numeric, 1) AS avg_score
           FROM mark_lists ml
           LEFT JOIN student_marks sm ON sm.mark_list_id = ml.id
           ${whereSql}
           GROUP BY ml.class_id ORDER BY ml.class_id`,
          values
        )).rows;

        const classes = rows.map(r => ({
          classId: r.class_id,
          exams: r.exams,
          marks: r.marks,
          avgPct: parseFloat(r.avg_pct) || 0,
          avgScore: parseFloat(r.avg_score) || 0
        }));

        let exams = 0, marks = 0, avg = 0;
        for (const c of classes) { exams += c.exams; marks += c.marks; }
        const avgSum = classes.reduce((s, c) => s + (c.avgPct * c.exams), 0);
        avg = exams > 0 ? Math.round((avgSum / exams) * 10) / 10 : 0;

        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, exams, marks, avgPct: avg, classes });
        grandExams += exams; grandMarks += marks;
        if (avg > 0) allAvgs.push({ avg, exams });
      } catch (e) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: e.message });
      }
    }

    const avgSum = allAvgs.reduce((s, x) => s + x.avg * x.exams, 0);
    const avgExams = allAvgs.reduce((s, x) => s + x.exams, 0);

    res.json({
      success: true,
      filters: { academicYear, term },
      data: {
        grandExams, grandMarks,
        grandAvgPct: avgExams > 0 ? Math.round((avgSum / avgExams) * 10) / 10 : 0,
        byBranch
      }
    });
  } catch (error) {
    console.error('Marks report error:', error);
    res.status(500).json({ error: 'Failed to build marks report', message: error.message });
  }
});

// ---- FAULTS: counts by class, filterable by Ethiopian year/month ----
router.get('/report/faults', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = await getSelectedBranches(req.query.branchCode);
    const year = req.query.year ? parseInt(req.query.year) : null;
    const month = req.query.month ? parseInt(req.query.month) : null;

    const byBranch = [];
    let grandTotal = 0;

    for (const b of branches) {
      const pool = await getPoolSafe(b);
      if (!pool) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: 'Database unreachable' });
        continue;
      }
      try {
        const tables = (await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'class_students_fault' ORDER BY table_name`
        )).rows.map(r => r.table_name);

        const classes = [];
        let total = 0;
        for (const t of tables) {
          const hasYear = await hasColumn(pool, 'class_students_fault', t, 'ethiopian_year');
          const hasMonth = await hasColumn(pool, 'class_students_fault', t, 'ethiopian_month');
          const f = [];
          const v = [];
          if (year && hasYear) { v.push(year); f.push(`ethiopian_year = $${v.length}`); }
          if (month && hasMonth) { v.push(month); f.push(`ethiopian_month = $${v.length}`); }
          const whereSql = f.length > 0 ? `WHERE ${f.join(' AND ')}` : '';
          const cnt = (await pool.query(`SELECT COUNT(*)::int AS c FROM class_students_fault."${t}" ${whereSql}`, v)).rows[0].c;
          classes.push({ className: t, faults: cnt });
          total += cnt;
        }

        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, total, classes });
        grandTotal += total;
      } catch (e) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: e.message });
      }
    }

    res.json({
      success: true,
      filters: { year, month },
      data: { grandTotal, byBranch }
    });
  } catch (error) {
    console.error('Faults report error:', error);
    res.status(500).json({ error: 'Failed to build faults report', message: error.message });
  }
});

// ---- FINANCE: monthly payments by class and branch, filterable by Ethiopian month ----
router.get('/report/finance', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = await getSelectedBranches(req.query.branchCode);
    const month = req.query.month ? parseInt(req.query.month) : null;

    // Pending = unlocked months only. Unlock logic mirrors the monthly payments page:
    // before the 2019 school year starts, only Meskerem (month 1) is unlocked.
    const { toEthiopian } = require('../utils/ethiopianCalendar');
    let currentEthMonth = 1;
    try {
      const eth = toEthiopian(new Date());
      currentEthMonth = eth.year < 2019 ? 1 : eth.month;
    } catch (e) { /* fallback to 1 */ }

    const whereSql = month
      ? `WHERE (i.metadata->>'monthNumber')::int = $1`
      : `WHERE (i.metadata->>'monthNumber')::int <= $1`;
    const values = month ? [month] : [currentEthMonth];

    const byBranch = [];
    const classTotals = {};
    let grandExpected = 0, grandCollected = 0, grandStudents = 0, grandCollectedToday = 0;
    let grandFreeStudents = 0, grandFreeRegPaid = 0;

    // Today (school-local = UTC+3)
    const todaySchoolLocal = new Date(Date.now() + 3 * 3600 * 1000).toISOString().substring(0, 10);

    for (const b of branches) {
      const pool = await getPoolSafe(b);
      if (!pool) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: 'Database unreachable' });
        continue;
      }
      try {
        const rows = (await pool.query(
          `SELECT fs."gradeLevel" AS class_name,
                  COUNT(DISTINCT i."studentId")::int AS students,
                  ROUND(SUM(i."netAmount")::numeric, 2) AS expected,
                  ROUND(SUM(i."paidAmount")::numeric, 2) AS collected
           FROM school_comms."Invoice" i
           JOIN school_comms."FeeStructure" fs ON fs.id = i."feeStructureId"
           ${whereSql}
           GROUP BY fs."gradeLevel" ORDER BY fs."gradeLevel"`,
          values
        )).rows;

        // Payments collected today (school-local date, last 48h window for safety)
        let collectedToday = 0;
        try {
          const payRes = await pool.query(`
            SELECT amount, "paymentDate" FROM school_comms."Payment"
            WHERE status = 'COMPLETED' AND "paymentDate" > now() - interval '48 hours'
          `);
          for (const p of payRes.rows) {
            const localDate = new Date(new Date(p.paymentDate).getTime() + 3 * 3600 * 1000)
              .toISOString().substring(0, 10);
            if (localDate === todaySchoolLocal) {
              collectedToday += parseFloat(p.amount || 0);
            }
          }
        } catch (e) { /* payments table may be missing */ }

        // Count free students (exempt from tuition) + their registration-fee payments.
        // Free students appear in class tables with is_free = TRUE; their reg-fee invoices
        // carry metadata.isFreeStudent = true.
        let freeStudents = 0;
        let freeRegPaid = 0;
        try {
          const freeRes = await pool.query(
            `SELECT COUNT(*)::int AS free_count
             FROM school_comms."Invoice" i
             WHERE (i.metadata->>'isFreeStudent')::boolean = true`
          );
          const freePaidRes = await pool.query(
            `SELECT ROUND(COALESCE(SUM(i."paidAmount"),0)::numeric, 2) AS paid
             FROM school_comms."Invoice" i
             WHERE (i.metadata->>'isFreeStudent')::boolean = true`
          );
          freeStudents = freeRes.rows[0]?.free_count || 0;
          freeRegPaid = parseFloat(freePaidRes.rows[0]?.paid || 0) || 0;
        } catch (e) { /* isFreeStudent metadata may not exist yet */ }

        // Fallback: if no isFreeStudent-tagged invoices, count free students directly
        // from class tables (across classes_schema G1..KG2).
        if (freeStudents === 0) {
          try {
            const classTables = (await pool.query(
              `SELECT table_name FROM information_schema.tables
               WHERE table_schema='classes_schema' AND table_name ~ '^(G[1-8]|KG[1-2])$'`
            )).rows.map(r => r.table_name);
            let fc = 0;
            for (const t of classTables) {
              const hasCol = (await pool.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_schema='classes_schema' AND table_name=$1 AND column_name='is_free'`,
                [t]
              )).rows.length > 0;
              if (!hasCol) continue;
              const c = (await pool.query(
                `SELECT COUNT(*)::int AS n FROM classes_schema."${t}" WHERE is_free = TRUE`
              )).rows[0]?.n || 0;
              fc += c;
            }
            freeStudents = fc;
          } catch (e) { /* ignore */ }
        }

        const classes = rows.map(r => ({
          className: r.class_name,
          students: r.students,
          expected: parseFloat(r.expected) || 0,
          collected: parseFloat(r.collected) || 0,
          pending: Math.round(((parseFloat(r.expected) || 0) - (parseFloat(r.collected) || 0)) * 100) / 100
        }));

        let expected = 0, collected = 0, students = 0;
        for (const c of classes) {
          expected += c.expected; collected += c.collected; students += c.students;
          if (!classTotals[c.className]) classTotals[c.className] = { className: c.className, students: 0, expected: 0, collected: 0, pending: 0 };
          classTotals[c.className].students += c.students;
          classTotals[c.className].expected += c.expected;
          classTotals[c.className].collected += c.collected;
          classTotals[c.className].pending += c.pending;
        }
        const pending = expected - collected;

        byBranch.push({
          branchCode: b.branch_code, branchName: b.branch_name,
          students, expected: Math.round(expected * 100) / 100, collected: Math.round(collected * 100) / 100, pending: Math.round(pending * 100) / 100,
          collectedToday: Math.round(collectedToday * 100) / 100,
          freeStudents,
          freeRegPaid: Math.round(freeRegPaid * 100) / 100,
          classes
        });
        grandExpected += expected; grandCollected += collected; grandStudents += students; grandCollectedToday += collectedToday;
        grandFreeStudents += freeStudents; grandFreeRegPaid += freeRegPaid;
      } catch (e) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: e.message });
      }
    }

    res.json({
      success: true,
      filters: { month },
      data: {
        grandStudents,
        grandExpected: Math.round(grandExpected * 100) / 100,
        grandCollected: Math.round(grandCollected * 100) / 100,
        grandPending: Math.round((grandExpected - grandCollected) * 100) / 100,
        grandCollectedToday: Math.round(grandCollectedToday * 100) / 100,
        grandFreeStudents,
        grandFreeRegPaid: Math.round(grandFreeRegPaid * 100) / 100,
        byBranch,
        byClass: Object.values(classTotals).sort((a, c) => a.className.localeCompare(c.className))
      }
    });
  } catch (error) {
    console.error('Finance report error:', error);
    res.status(500).json({ error: 'Failed to build finance report', message: error.message });
  }
});

// ---- REGISTRATIONS: new vs old students (by registration fee) + students added by date ----
router.get('/report/registrations', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = await getSelectedBranches(req.query.branchCode);
    const from = req.query.from || null; // YYYY-MM-DD
    const to = req.query.to || null;     // YYYY-MM-DD

    const byBranch = [];
    let grandTotal = 0, grandNew = 0, grandOld = 0, grandUnknown = 0, grandAdded = 0, grandAddedToday = 0;

    // Today (school-local = UTC+3)
    const todaySchoolLocal = new Date(Date.now() + 3 * 3600 * 1000).toISOString().substring(0, 10);

    for (const b of branches) {
      const pool = await getPoolSafe(b);
      if (!pool) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: 'Database unreachable' });
        continue;
      }
      try {
        const tables = (await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`
        )).rows.map(r => r.table_name);

        // Fee structures (latest active wins)
        const fsRes = await pool.query(`
          SELECT fs."gradeLevel", fs.description
          FROM school_comms."FeeStructure" fs
          WHERE fs."isActive" = true
          ORDER BY fs.id DESC
        `);
        const fsByClass = {};
        for (const row of fsRes.rows) {
          if (fsByClass[row.gradeLevel]) continue;
          let newRegFee = 0;
          let oldRegFee = 0;
          try {
            let desc = (row.description || '{}')
              .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
            const monthsData = JSON.parse(desc);
            newRegFee = parseFloat(monthsData.newRegistrationFee) || 0;
            oldRegFee = parseFloat(monthsData.oldRegistrationFee) || 0;
          } catch (e) { /* no reg fees */ }
          fsByClass[row.gradeLevel] = { newRegFee, oldRegFee };
        }

        const classes = [];
        const added = [];
        let total = 0, newCount = 0, oldCount = 0, unknownCount = 0, addedToday = 0;

        for (const cls of tables) {
          const fs = fsByClass[cls] || { newRegFee: 0, oldRegFee: 0 };
          const hasOldOrNew = (await pool.query(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'classes_schema' AND table_name = $1 AND column_name = 'old_or_new'`,
            [cls]
          )).rows.length > 0;

          const students = await pool.query(
            hasOldOrNew
              ? `SELECT school_id, class_id, student_name, smachine_id, old_or_new FROM classes_schema."${cls}"`
              : `SELECT school_id, class_id, student_name, smachine_id, NULL AS old_or_new FROM classes_schema."${cls}"`
          );

          const clsStats = { className: cls, total: 0, newCount: 0, oldCount: 0, unknownCount: 0 };

          for (const st of students.rows) {
            const sid = `00000000-0000-0000-${String(st.school_id).padStart(4, '0')}-${String(st.class_id).padStart(12, '0')}`;

            // Month-1 invoice gives the charged registration fee + a fallback date
            const inv = await pool.query(
              `SELECT "issueDate", metadata FROM school_comms."Invoice"
               WHERE "studentId"::text = $1 AND (metadata->>'monthNumber')::int = 1
               LIMIT 1`,
              [sid]
            );
            let regFee = 0;
            let invDate = null;
            if (inv.rows.length > 0) {
              regFee = parseFloat(inv.rows[0].metadata?.registrationFee || 0);
              invDate = inv.rows[0].issueDate;
            }

            // Registration date: machine ID tracker first, month-1 invoice date as fallback
            let regDate = invDate;
            if (st.smachine_id) {
              const gmi = await pool.query(
                `SELECT created_at FROM school_schema_points.global_machine_ids WHERE smachine_id = $1 LIMIT 1`,
                [st.smachine_id]
              );
              if (gmi.rows.length > 0 && gmi.rows[0].created_at) regDate = gmi.rows[0].created_at;
            }

            // New vs Old: the student's registration fee type (old_or_new field), fallback to the charged reg fee
            let type = 'unknown';
            const declared = st.old_or_new ? String(st.old_or_new).toLowerCase() : '';
            if (declared === 'old') type = 'old';
            else if (declared === 'new') type = 'new';
            else if (regFee > 0 && fs.oldRegFee > 0 && regFee === fs.oldRegFee) type = 'old';
            else if (regFee > 0 && fs.newRegFee > 0 && regFee === fs.newRegFee) type = 'new';

            clsStats.total++;
            if (type === 'new') { clsStats.newCount++; newCount++; }
            else if (type === 'old') { clsStats.oldCount++; oldCount++; }
            else { clsStats.unknownCount++; unknownCount++; }

            // Added by date (school-local date = UTC + 3h)
            if (regDate) {
              const localDate = new Date(new Date(regDate).getTime() + 3 * 3600 * 1000)
                .toISOString().substring(0, 10);
              if (from && to && localDate >= from && localDate <= to) {
                added.push({
                  studentName: st.student_name,
                  className: cls,
                  branchCode: b.branch_code,
                  branchName: b.branch_name,
                  date: localDate,
                  type,
                  regFee
                });
              }
              if (localDate === todaySchoolLocal) addedToday++;
            }
          }

          classes.push(clsStats);
          total += clsStats.total;
        }

        classes.sort((a, c) => a.className.localeCompare(c.className));
        added.sort((a, z) => (z.date || '').localeCompare(a.date || ''));

        byBranch.push({
          branchCode: b.branch_code,
          branchName: b.branch_name,
          total, newCount, oldCount, unknownCount,
          addedCount: added.length,
          addedToday,
          classes,
          added
        });
        grandTotal += total; grandNew += newCount; grandOld += oldCount; grandUnknown += unknownCount; grandAdded += added.length; grandAddedToday += addedToday;
      } catch (e) {
        byBranch.push({ branchCode: b.branch_code, branchName: b.branch_name, error: e.message });
      }
    }

    res.json({
      success: true,
      filters: { from, to },
      data: {
        grandTotal, grandNew, grandOld, grandUnknown, grandAdded, grandAddedToday,
        byBranch
      }
    });
  } catch (error) {
    console.error('Registrations report error:', error);
    res.status(500).json({ error: 'Failed to build registrations report', message: error.message });
  }
});

// ---- BRANCHES list ----
router.get('/branches', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const branches = (await dbManager.getAllBranches()).filter(
      (b) => !EXCLUDED_BRANCHES.includes(String(b.branch_code).toUpperCase())
    );
    res.json({ success: true, branches, total: branches.length });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// ---- ACCOUNT: change username / password ----
router.put('/account', authenticateToken, authorizeRoles('super_admin'), async (req, res) => {
  const pool = getMasterPool();
  try {
    const { currentPassword, newUsername, newPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(400).json({ error: 'Account id missing from token' });
    }

    const result = await pool.query('SELECT * FROM super_admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const admin = result.rows[0];

    const isValid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const updates = [];
    const values = [];
    if (newUsername && String(newUsername).trim() !== admin.username) {
      const dup = await pool.query('SELECT id FROM super_admins WHERE username = $1 AND id <> $2', [String(newUsername).trim(), adminId]);
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      updates.push(`username = $${values.length + 1}`);
      values.push(String(newUsername).trim());
    }
    if (newPassword) {
      if (String(newPassword).length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters' });
      }
      const hash = await bcrypt.hash(String(newPassword), 10);
      updates.push(`password_hash = $${values.length + 1}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to change' });
    }

    values.push(adminId);
    await pool.query(`UPDATE super_admins SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    res.json({ success: true, message: 'Account updated successfully' });
  } catch (error) {
    console.error('Super admin account update error:', error);
    res.status(500).json({ error: 'Failed to update account', message: error.message });
  } finally {
    await pool.end().catch(() => {});
  }
});

module.exports = router;