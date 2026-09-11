/* Backfill missing 10-digit invoiceRefCode for all invoices in all branch DBs.
   Run from the backend directory: node scripts/backfill-invoice-refcodes.js */

const { Pool } = require('pg');
const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');

const BRANCH_DBS = ['iqrab1', 'iqrab2', 'iqrab3', 'iqrab4', 'iqrab5'];

async function backfillBranch(dbName) {
  const pool = new Pool({
    user: 'iqra',
    host: 'localhost',
    database: dbName,
    password: 'iqra1768',
    port: 5432,
  });

  try {
    const res = await pool.query('SELECT id FROM school_comms."Invoice" WHERE "invoiceRefCode" IS NULL');
    const ids = res.rows.map(r => r.id);
    console.log(`[${dbName}] ${ids.length} invoices missing invoiceRefCode`);

    let updated = 0;
    for (const id of ids) {
      const code = await generateUniqueInvoiceRefCode(async (c) => {
        const existing = await pool.query('SELECT 1 FROM school_comms."Invoice" WHERE "invoiceRefCode" = $1', [c]);
        return existing.rows.length > 0;
      });
      await pool.query('UPDATE school_comms."Invoice" SET "invoiceRefCode" = $1 WHERE id = $2', [code, id]);
      updated++;
    }
    console.log(`[${dbName}] done, updated ${updated}`);
  } finally {
    await pool.end();
  }
}

(async () => {
  for (const db of BRANCH_DBS) {
    await backfillBranch(db);
  }
  console.log('ALL BRANCHES COMPLETE');
})();