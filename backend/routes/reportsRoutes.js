const express = require('express');
const router = express.Router();
const { authenticateWithBranch } = require('../middleware/branchAuth');

// All report routes require authentication + branch
router.use(authenticateWithBranch);

// Helper: safe query against branch pool
async function q(pool, sql, params = []) {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch (e) {
    return [];
  }
}

// ─── Students ────────────────────────────────────────────────────────────────
router.get('/students/summary', async (req, res) => {
  const pool = req.branchPool;
  try {
    // Get all class tables
    const classTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' AND table_name NOT LIKE 'pg_%'`).catch(() => ({ rows: [] }));
    const unionQuery = classTables.rows.map(t => 
      `SELECT student_name, gender FROM classes_schema."${t.table_name}"`
    ).join(' UNION ALL ');
    
    if (!unionQuery) return res.json({ success: true, data: { total: 0, male: 0, female: 0, trend: 0 }});
    
    const result = await pool.query(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN LOWER(gender)='male' THEN 1 ELSE 0 END) as male,
        SUM(CASE WHEN LOWER(gender)='female' THEN 1 ELSE 0 END) as female
      FROM (${unionQuery}) sub`
    ).catch(() => ({ rows: [{ total: 0, male: 0, female: 0 }] }));
    const r = result.rows[0] || {};
    res.json({ success: true, data: {
      total: parseInt(r.total)||0,
      male: parseInt(r.male)||0,
      female: parseInt(r.female)||0,
      trend: 0
    }});
  } catch(e) {
    res.json({ success: true, data: { total: 0, male: 0, female: 0, trend: 0 }});
  }
});

router.get('/students/by-class', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT c.class_name, COUNT(s.id) as count
    FROM classes c LEFT JOIN students s ON s.class_id = c.id
    GROUP BY c.id, c.class_name ORDER BY c.class_name`);
  res.json({ success: true, data: rows });
});

router.get('/students/by-gender', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT LOWER(gender) as gender, COUNT(*) as count FROM students WHERE gender IS NOT NULL GROUP BY gender`);
  res.json({ success: true, data: rows });
});

// ─── Staff ───────────────────────────────────────────────────────────────────
router.get('/staff/summary', async (req, res) => {
  const pool = req.branchPool;
  try {
    const countInSchema = async (schemaName) => {
      try {
        const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name NOT LIKE 'pg_%'`, [schemaName]);
        let total = 0;
        for (const t of tables.rows) {
          const c = await pool.query(`SELECT COUNT(*) as c FROM "${schemaName}"."${t.table_name}"`);
          total += parseInt(c.rows[0].c) || 0;
        }
        return total;
      } catch(e) { return 0; }
    };
    
    const teachers = await countInSchema('staff_teachers');
    const administrative = await countInSchema('staff_administrative_staff');
    const supportive = await countInSchema('staff_supportive_staff');
    const finance = await countInSchema('staff_finance');
    const total = teachers + administrative + supportive + finance;
    
    res.json({ success: true, data: {
      total, male: 0, female: 0,
      teachers, administrative, supportive, finance,
      trend: 0
    }});
  } catch(e) {
    res.json({ success: true, data: { total: 0, male: 0, female: 0, teachers: 0, administrative: 0, supportive: 0, finance: 0, trend: 0 }});
  }
});

router.get('/staff/by-type',   async (req, res) => { const pool = req.branchPool; const rows = await q(pool, `SELECT staff_type as type, COUNT(*) as count FROM staff GROUP BY staff_type`); res.json({ success: true, data: rows }); });
router.get('/staff/by-role',   async (req, res) => { const pool = req.branchPool; const rows = await q(pool, `SELECT role, COUNT(*) as count FROM staff GROUP BY role`); res.json({ success: true, data: rows }); });
router.get('/staff/by-gender', async (req, res) => { const pool = req.branchPool; const rows = await q(pool, `SELECT LOWER(gender) as gender, COUNT(*) as count FROM staff WHERE gender IS NOT NULL GROUP BY gender`); res.json({ success: true, data: rows }); });

// ─── Academic ────────────────────────────────────────────────────────────────
router.get('/academic/class-performance', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT c.class_name, AVG(sm.total_score) as avg_score, COUNT(sm.id) as count
    FROM classes c LEFT JOIN students s ON s.class_id = c.id
    LEFT JOIN student_marks sm ON sm.student_id = s.id
    GROUP BY c.id, c.class_name ORDER BY avg_score DESC NULLS LAST`);
  res.json({ success: true, data: rows.map(r => ({
    className: r.class_name,
    averageScore: parseFloat(r.avg_score||0).toFixed(1),
    studentCount: parseInt(r.count)||0
  }))});
});

router.get('/academic/subject-averages', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT subject_name, AVG(total_score) as avg FROM student_marks WHERE subject_name IS NOT NULL GROUP BY subject_name ORDER BY avg DESC`);
  res.json({ success: true, data: rows });
});

router.get('/academic/top-performers', async (req, res) => {
  const pool = req.branchPool;
  const limit = parseInt(req.query.limit)||10;
  const rows = await q(pool, `SELECT s.full_name, AVG(sm.total_score) as avg_score FROM students s JOIN student_marks sm ON sm.student_id = s.id GROUP BY s.id, s.full_name ORDER BY avg_score DESC LIMIT $1`, [limit]);
  res.json({ success: true, data: rows });
});

router.get('/academic/bottom-performers', async (req, res) => {
  const pool = req.branchPool;
  const limit = parseInt(req.query.limit)||10;
  const rows = await q(pool, `SELECT s.full_name, AVG(sm.total_score) as avg_score FROM students s JOIN student_marks sm ON sm.student_id = s.id GROUP BY s.id, s.full_name ORDER BY avg_score ASC LIMIT $1`, [limit]);
  res.json({ success: true, data: rows });
});

router.get('/academic/class-rankings', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT c.class_name, AVG(sm.total_score) as avg FROM classes c LEFT JOIN students s ON s.class_id=c.id LEFT JOIN student_marks sm ON sm.student_id=s.id GROUP BY c.id, c.class_name ORDER BY avg DESC NULLS LAST`);
  res.json({ success: true, data: rows });
});

router.get('/academic/pass-fail-rates', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT
    SUM(CASE WHEN total_score >= 50 THEN 1 ELSE 0 END) as passed,
    SUM(CASE WHEN total_score <  50 THEN 1 ELSE 0 END) as failed,
    COUNT(*) as total FROM student_marks`);
  res.json({ success: true, data: rows[0]||{} });
});

// ─── Faults ──────────────────────────────────────────────────────────────────
router.get('/faults/summary', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT COUNT(*) as total FROM student_faults`);
  res.json({ success: true, data: { total: parseInt(rows[0]?.total)||0 } });
});

router.get('/faults/by-class', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT c.class_name, COUNT(f.id) as count FROM classes c LEFT JOIN students s ON s.class_id=c.id LEFT JOIN student_faults f ON f.student_id=s.id GROUP BY c.id, c.class_name ORDER BY count DESC`);
  res.json({ success: true, data: rows });
});

router.get('/faults/by-type',  async (req, res) => { const pool = req.branchPool; const rows = await q(pool, `SELECT fault_type as type, COUNT(*) as count FROM student_faults GROUP BY fault_type ORDER BY count DESC`); res.json({ success: true, data: rows }); });
router.get('/faults/by-level', async (req, res) => { const pool = req.branchPool; const rows = await q(pool, `SELECT severity as level, COUNT(*) as count FROM student_faults GROUP BY severity ORDER BY count DESC`); res.json({ success: true, data: rows }); });

router.get('/faults/recent', async (req, res) => {
  const pool = req.branchPool;
  const days = parseInt(req.query.days)||7;
  const limit = parseInt(req.query.limit)||10;
  const rows = await q(pool, `SELECT f.*, s.full_name as student_name FROM student_faults f LEFT JOIN students s ON s.id=f.student_id WHERE f.created_at >= NOW() - ($1 || ' days')::INTERVAL ORDER BY f.created_at DESC LIMIT $2`, [days, limit]);
  res.json({ success: true, data: rows });
});

router.get('/faults/top-offenders', async (req, res) => {
  const pool = req.branchPool;
  const limit = parseInt(req.query.limit)||10;
  const rows = await q(pool, `SELECT s.full_name, COUNT(f.id) as fault_count FROM students s JOIN student_faults f ON f.student_id=s.id GROUP BY s.id, s.full_name ORDER BY fault_count DESC LIMIT $1`, [limit]);
  res.json({ success: true, data: rows });
});

router.get('/faults/trends', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT DATE(created_at) as date, COUNT(*) as count FROM student_faults WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date`);
  res.json({ success: true, data: rows });
});

// ─── Attendance ──────────────────────────────────────────────────────────────
router.get('/attendance/summary', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN LOWER(status)='present' THEN 1 ELSE 0 END) as present,
    SUM(CASE WHEN LOWER(status)='absent'  THEN 1 ELSE 0 END) as absent
    FROM student_attendance WHERE attendance_date >= CURRENT_DATE - INTERVAL '30 days'`);
  const r = rows[0]||{};
  const total = parseInt(r.total)||1;
  const present = parseInt(r.present)||0;
  res.json({ success: true, data: {
    total, present, absent: parseInt(r.absent)||0,
    rate: ((present/total)*100).toFixed(1)
  }});
});

router.get('/attendance/by-class', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT c.class_name,
    COUNT(sa.id) as total,
    SUM(CASE WHEN LOWER(sa.status)='present' THEN 1 ELSE 0 END) as present
    FROM classes c LEFT JOIN students s ON s.class_id=c.id
    LEFT JOIN student_attendance sa ON sa.student_id=s.id
    GROUP BY c.id, c.class_name`);
  res.json({ success: true, data: rows });
});

router.get('/attendance/by-day', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT TO_CHAR(attendance_date,'Day') as day, COUNT(*) as total, SUM(CASE WHEN LOWER(status)='present' THEN 1 ELSE 0 END) as present FROM student_attendance GROUP BY TO_CHAR(attendance_date,'Day')`);
  res.json({ success: true, data: rows });
});

router.get('/attendance/trends', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT attendance_date as date, COUNT(*) as total, SUM(CASE WHEN LOWER(status)='present' THEN 1 ELSE 0 END) as present FROM student_attendance WHERE attendance_date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY attendance_date ORDER BY date`);
  res.json({ success: true, data: rows });
});

router.get('/attendance/absentees', async (req, res) => {
  const pool = req.branchPool;
  const limit = parseInt(req.query.limit)||10;
  const rows = await q(pool, `SELECT s.full_name, COUNT(sa.id) as absent_count FROM students s JOIN student_attendance sa ON sa.student_id=s.id WHERE LOWER(sa.status)='absent' GROUP BY s.id, s.full_name ORDER BY absent_count DESC LIMIT $1`, [limit]);
  res.json({ success: true, data: rows });
});

// ─── Finance ─────────────────────────────────────────────────────────────────
router.get('/finance/summary', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT SUM(amount) as total_collected, COUNT(*) as payment_count FROM monthly_payments`);
  const expenses = await q(pool, `SELECT SUM(amount) as total FROM expenses`);
  const r = rows[0]||{};
  res.json({ success: true, data: {
    totalCollected: parseFloat(r.total_collected)||0,
    paymentCount: parseInt(r.payment_count)||0,
    totalExpenses: parseFloat(expenses[0]?.total||0),
    trend: 0
  }});
});

// ─── HR ──────────────────────────────────────────────────────────────────────
router.get('/hr/summary', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT COUNT(*) as total FROM staff`);
  res.json({ success: true, data: { total: parseInt(rows[0]?.total)||0, present: 0, absent: 0, onLeave: 0 } });
});

// ─── Inventory ───────────────────────────────────────────────────────────────
router.get('/inventory/summary', async (req, res) => {
  res.json({ success: true, data: { totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 } });
});

// ─── Assets ──────────────────────────────────────────────────────────────────
router.get('/assets/summary', async (req, res) => {
  res.json({ success: true, data: { totalAssets: 0, inUse: 0, maintenance: 0, totalValue: 0 } });
});

// ─── Evaluations ─────────────────────────────────────────────────────────────
router.get('/evaluations/summary', async (req, res) => {
  res.json({ success: true, data: { total: 0, completed: 0, pending: 0 } });
});
router.get('/evaluations/by-class',       async (req, res) => { res.json({ success: true, data: [] }); });
router.get('/evaluations/response-rates', async (req, res) => { res.json({ success: true, data: [] }); });

// ─── Posts ───────────────────────────────────────────────────────────────────
router.get('/posts/summary', async (req, res) => {
  res.json({ success: true, data: { total: 0, thisWeek: 0 } });
});
router.get('/posts/by-audience', async (req, res) => { res.json({ success: true, data: [] }); });
router.get('/posts/recent',      async (req, res) => { res.json({ success: true, data: [] }); });

// ─── Schedule ────────────────────────────────────────────────────────────────
router.get('/schedule/summary',          async (req, res) => { res.json({ success: true, data: {} }); });
router.get('/schedule/teacher-workload', async (req, res) => { res.json({ success: true, data: [] }); });

// ─── Guardians ───────────────────────────────────────────────────────────────
router.get('/guardians/summary', async (req, res) => {
  const pool = req.branchPool;
  const rows = await q(pool, `SELECT COUNT(*) as total FROM guardians`);
  res.json({ success: true, data: { total: parseInt(rows[0]?.total)||0, engagement: 0 } });
});
router.get('/guardians/engagement', async (req, res) => { res.json({ success: true, data: [] }); });

// ─── Activity ────────────────────────────────────────────────────────────────
router.get('/activity/recent', async (req, res) => {
  const pool = req.branchPool;
  const limit = parseInt(req.query.limit)||10;
  const rows = await q(pool, `SELECT s.full_name as student_name, sa.status, sa.attendance_date as date
    FROM student_attendance sa JOIN students s ON s.id=sa.student_id
    ORDER BY sa.attendance_date DESC LIMIT $1`, [limit]);
  const data = rows.map(r => ({
    type: r.status,
    title: `${r.student_name} — ${r.status}`,
    date: r.date,
    daysAgo: Math.floor((new Date() - new Date(r.date)) / 86400000)
  }));
  res.json({ success: true, data });
});

// ─── Overview / Summary (legacy) ─────────────────────────────────────────────
router.get('/overview', async (req, res) => { res.redirect('/api/reports/students/summary'); });
router.get('/summary',  async (req, res) => { res.json({ success: true, data: {} }); });

module.exports = router;
