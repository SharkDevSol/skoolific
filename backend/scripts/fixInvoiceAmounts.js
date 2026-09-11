// scripts/fixInvoiceAmounts.js
// Audit + repair: make every student's monthly invoice amount equal to their CURRENT class fee.
// Usage: node scripts/fixInvoiceAmounts.js [branchCode1 branchCode2 ...]  (no args = all branches)
// Safe: only touches invoices whose monthly item amount differs from the class fee.

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_USER = process.env.DB_USER || 'iqra';
const DB_PASSWORD = String(process.env.DB_PASSWORD || 'iqra1768');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');
const MASTER_DB = process.env.DB_NAME || 'iqrab1';

async function run() {
  const onlyCodes = process.argv.slice(2).map((c) => c.toUpperCase());

  const master = new Pool({ host: DB_HOST, port: DB_PORT, database: MASTER_DB, user: DB_USER, password: DB_PASSWORD });
  const branchesRes = await master.query('SELECT branch_code, branch_name, database_name FROM branch_config WHERE is_active = true');
  await master.end();

  const branches = branchesRes.rows.filter((b) => onlyCodes.length === 0 || onlyCodes.includes(String(b.branch_code).toUpperCase()));

  let grandFixed = 0;

  for (const branch of branches) {
    const dbName = branch.database_name;
    let pool;
    try {
      pool = new Pool({ host: DB_HOST, port: DB_PORT, database: dbName, user: DB_USER, password: DB_PASSWORD });
      await pool.query('SELECT 1');
    } catch (e) {
      console.log(`\n❌ ${branch.branch_code} (${dbName}): unreachable — skipped (${e.message})`);
      continue;
    }

    console.log(`\n==== ${branch.branch_code} (${branch.branch_name}) — ${dbName} ====`);

    // All class tables
    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`
    );
    const tables = tablesRes.rows.map((r) => r.table_name);

    // Fee structures + monthly items indexed by gradeLevel (latest active wins)
    const fsRes = await pool.query(`
      SELECT fs.id AS fs_id, fs."gradeLevel", i.amount AS monthly, fs.description
      FROM school_comms."FeeStructure" fs
      JOIN school_comms."FeeStructureItem" i ON i."feeStructureId" = fs.id
      WHERE fs."isActive" = true
      ORDER BY fs.id DESC
    `);
    const fsByClass = {};
    for (const row of fsRes.rows) {
      if (!fsByClass[row.gradeLevel]) {
        let newRegFee = 0;
        let oldRegFee = 0;
        try {
          let desc = (row.description || '{}')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
          const monthsData = JSON.parse(desc);
          newRegFee = parseFloat(monthsData.newRegistrationFee) || 0;
          oldRegFee = parseFloat(monthsData.oldRegistrationFee) || 0;
        } catch (e) { /* no reg fees configured */ }
        fsByClass[row.gradeLevel] = { id: row.fs_id, monthly: parseFloat(row.monthly), newRegFee, oldRegFee };
      }
    }

    let branchFixed = 0;

    for (const cls of tables) {
      const fs = fsByClass[cls];
      if (!fs) continue;

      const hasOldOrNew = (await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'classes_schema' AND table_name = $1 AND column_name = 'old_or_new'`,
        [cls]
      )).rows.length > 0;

      const students = await pool.query(
        hasOldOrNew
          ? `SELECT school_id, class_id, student_name, old_or_new FROM classes_schema."${cls}"`
          : `SELECT school_id, class_id, student_name, NULL AS old_or_new FROM classes_schema."${cls}"`
      );

      for (const st of students.rows) {
        const sid = `00000000-0000-0000-${String(st.school_id).padStart(4, '0')}-${String(st.class_id).padStart(12, '0')}`;

        // Registration fee type: OLD students pay the old fee, NEW students the new fee
        const studentFeeType = (st.old_or_new && String(st.old_or_new).toLowerCase() === 'old') ? 'old' : 'new';
        const targetRegFee = (studentFeeType === 'old' && fs.oldRegFee > 0) ? fs.oldRegFee : fs.newRegFee;

        const invRes = await pool.query(
          `SELECT * FROM school_comms."Invoice" WHERE "studentId" = $1`,
          [sid]
        );

        for (const inv of invRes.rows) {
          const items = await pool.query(
            `SELECT * FROM school_comms."InvoiceItem" WHERE "invoiceId" = $1`,
            [inv.id]
          );

          const monthlyItem = items.rows.find(
            (it) => it.feeCategory === 'TUITION' && !(it.description || '').toLowerCase().includes('registration')
          );
          const regItem = items.rows.find(
            (it) => it.feeCategory === 'TUITION' && (it.description || '').toLowerCase().includes('registration')
          );
          if (!monthlyItem) continue;

          const isFirstMonth = (inv.metadata && inv.metadata.monthIndex) === 1 || (inv.metadata && inv.metadata.monthNumber) === 1;

          // Registration fee: align with the class fee for the student's type (old/new)
          let regFee = parseFloat((inv.metadata && inv.metadata.registrationFee) || 0);
          let regChanged = false;
          if (isFirstMonth && regItem && targetRegFee > 0 && regFee !== targetRegFee) {
            regFee = targetRegFee;
            regChanged = true;
          }

          const itemAmount = parseFloat(monthlyItem.amount);
          const regItemAmount = regItem ? parseFloat(regItem.amount) : 0;
          const regItemChanged = regChanged && regItemAmount !== targetRegFee;

          if (itemAmount === fs.monthly && !regItemChanged) continue; // already correct

          const discount = parseFloat(inv.discountAmount || 0);
          const lateFee = parseFloat(inv.lateFeeAmount || 0);
          const paid = parseFloat(inv.paidAmount || 0);

          const newTotal = fs.monthly + (isFirstMonth ? regFee : 0);
          const newNet = newTotal - discount + lateFee;

          let newStatus = inv.status;
          if (paid >= newNet) newStatus = 'PAID';
          else if (paid > 0 && inv.status === 'PAID') newStatus = 'PARTIALLY_PAID';

          if (itemAmount !== fs.monthly) {
            await pool.query(
              `UPDATE school_comms."InvoiceItem" SET amount = $1 WHERE id = $2`,
              [fs.monthly, monthlyItem.id]
            );
          }
          if (regItemChanged) {
            await pool.query(
              `UPDATE school_comms."InvoiceItem" SET amount = $1 WHERE id = $2`,
              [targetRegFee, regItem.id]
            );
          }

          const metaPatch = [];
          if (regChanged) {
            metaPatch.push(
              `metadata = metadata || jsonb_build_object('registrationFee', ${targetRegFee}, 'newRegistrationFee', ${fs.newRegFee || 0}, 'oldRegistrationFee', ${fs.oldRegFee || 0}, 'studentType', '${studentFeeType}')`
            );
          }

          const sets = [
            `"totalAmount" = $1`, `"netAmount" = $2`, `status = $3`, `"feeStructureId" = $4`
          ].concat(metaPatch);
          await pool.query(
            `UPDATE school_comms."Invoice" SET ${sets.join(', ')} WHERE id = $5`,
            [newTotal, newNet, newStatus, fs.id, inv.id]
          );

          const parts = [];
          if (itemAmount !== fs.monthly) parts.push(`${itemAmount} → ${fs.monthly}`);
          if (regItemChanged) parts.push(`reg ${regItemAmount} → ${targetRegFee} (${studentFeeType})`);
          console.log(`  ✅ ${cls} / ${st.student_name}: month ${(inv.metadata && inv.metadata.monthNumber) || '?'} — ${parts.join('; ')} (total ${parseFloat(inv.netAmount)} → ${newNet})`);
          branchFixed++;
        }
      }
    }

    console.log(`→ ${branch.branch_code}: fixed ${branchFixed} invoice(s)`);
    grandFixed += branchFixed;
    await pool.end();
  }

  console.log(`\n🎉 Done. Total invoices fixed: ${grandFixed}`);
  process.exit(0);
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});