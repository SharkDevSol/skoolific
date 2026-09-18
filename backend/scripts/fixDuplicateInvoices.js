// scripts/fixDuplicateInvoices.js
// Fix: remove duplicate invoices (same studentId + monthNumber), merging payments into the kept invoice.
// Keeps the invoice with the most paidAmount (tie → earliest issueDate, then lowest id).
// Usage: node scripts/fixDuplicateInvoices.js  (all branches)

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_USER = process.env.DB_USER || 'iqra';
const DB_PASSWORD = String(process.env.DB_PASSWORD || '');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');
const MASTER_DB = process.env.DB_NAME || 'iqrab1';

async function run() {
  const master = new Pool({ host: DB_HOST, port: DB_PORT, database: MASTER_DB, user: DB_USER, password: DB_PASSWORD });
  const branchesRes = await master.query('SELECT branch_code, branch_name, database_name FROM branch_config WHERE is_active = true');
  await master.end();

  let grandRemoved = 0;

  for (const branch of branchesRes.rows) {
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

    // Groups of (studentId, monthNumber) with duplicates
    const groups = await pool.query(`
      SELECT "studentId", (metadata->>'monthNumber')::int AS m, array_agg(id ORDER BY "paidAmount" DESC, "issueDate" ASC, id ASC) AS ids,
             SUM("paidAmount") AS total_paid
      FROM school_comms."Invoice"
      GROUP BY "studentId", (metadata->>'monthNumber')::int
      HAVING count(*) > 1
    `);

    let branchRemoved = 0;

    for (const g of groups.rows) {
      const keeper = g.ids[0];
      const dups = g.ids.slice(1);

      // 1) Move payment allocations from duplicates to the keeper
      const allocRes = await pool.query(
        `UPDATE school_comms."PaymentAllocation" SET "invoiceId" = $1 WHERE "invoiceId" = ANY($2)`,
        [keeper, dups]
      );
      const movedAllocs = allocRes.rowCount || 0;

      // 2) Merge paid amounts into keeper
      const keeperRes = await pool.query(
        `SELECT "netAmount", "paidAmount", status FROM school_comms."Invoice" WHERE id = $1`,
        [keeper]
      );
      const k = keeperRes.rows[0];
      const newPaid = parseFloat(k.paidAmount || 0) + parseFloat(g.total_paid - parseFloat(k.paidAmount || 0));
      const net = parseFloat(k.netAmount || 0);

      let newStatus = k.status;
      if (newPaid >= net) newStatus = 'PAID';
      else if (newPaid > 0 && k.status === 'PAID') newStatus = 'PARTIALLY_PAID';

      await pool.query(
        `UPDATE school_comms."Invoice" SET "paidAmount" = $1, status = $2 WHERE id = $3`,
        [newPaid, newStatus, keeper]
      );

      // 3) Delete duplicate items + invoices
      await pool.query(
        `DELETE FROM school_comms."InvoiceItem" WHERE "invoiceId" = ANY($1)`,
        [dups]
      );
      await pool.query(
        `DELETE FROM school_comms."Invoice" WHERE id = ANY($1)`,
        [dups]
      );

      console.log(`  ✅ ${g.studentId} month ${g.m}: removed ${dups.length} duplicate(s) (${movedAllocs} payment allocation(s) moved to keeper, merged paid → ${newPaid})`);
      branchRemoved += dups.length;
    }

    if (branchRemoved === 0) console.log('  ✓ no duplicates found');
    console.log(`→ ${branch.branch_code}: removed ${branchRemoved} duplicate invoice(s)`);
    grandRemoved += branchRemoved;
    await pool.end();
  }

  console.log(`\n🎉 Done. Total duplicate invoices removed: ${grandRemoved}`);
  process.exit(0);
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});