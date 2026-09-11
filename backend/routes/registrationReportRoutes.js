// routes/registrationReportRoutes.js
// Per-branch registration report for the admin app:
// New vs Old students (by registration fee type), students added by date, collected today.

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateWithBranch } = require('../middleware/branchAuth');

router.get('/', authenticateWithBranch, async (req, res) => {
  try {
    const from = req.query.from || null; // YYYY-MM-DD
    const to = req.query.to || null;     // YYYY-MM-DD

    // Today (school-local = UTC+3)
    const todaySchoolLocal = new Date(Date.now() + 3 * 3600 * 1000).toISOString().substring(0, 10);

    // All class tables
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

    const byClass = [];
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

        // Month-1 invoice: charged registration fee + fallback date
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

        // New vs Old: the student's registration fee type (old_or_new), fallback to the charged fee
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

        if (regDate) {
          const localDate = new Date(new Date(regDate).getTime() + 3 * 3600 * 1000)
            .toISOString().substring(0, 10);
          if (from && to && localDate >= from && localDate <= to) {
            added.push({ studentName: st.student_name, className: cls, date: localDate, type, regFee });
          }
          if (localDate === todaySchoolLocal) addedToday++;
        }
      }

      byClass.push(clsStats);
      total += clsStats.total;
    }

    // Payments collected today (school-local date, 48h window for safety)
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

    byClass.sort((a, c) => a.className.localeCompare(c.className));
    added.sort((a, z) => (z.date || '').localeCompare(a.date || ''));

    res.json({
      success: true,
      filters: { from, to },
      data: {
        total, newCount, oldCount, unknownCount, addedToday,
        collectedToday: Math.round(collectedToday * 100) / 100,
        addedCount: added.length,
        byClass,
        added
      }
    });
  } catch (error) {
    console.error('Registration report error:', error);
    res.status(500).json({ error: 'Failed to build registration report', message: error.message });
  }
});

module.exports = router;