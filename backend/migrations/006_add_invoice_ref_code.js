/**
 * Migration: Add invoice_ref_code column to school_comms."Invoice"
 *
 * Adds a unique 10-digit invoice reference code column used to look up
 * invoices across branches by the number printed on the receipt voucher.
 */

module.exports = {
  name: '006_add_invoice_ref_code',
  description: 'Add invoice_ref_code column to school_comms.Invoice',

  async up(pool) {
    // Add column to the Invoice table if missing.
    // Prisma stores table/column identifiers quoted, so this targets the same table.
    await pool.query(
      `ALTER TABLE school_comms."Invoice" ADD COLUMN IF NOT EXISTS "invoiceRefCode" VARCHAR(10)`
    );
    // Create a unique index (partial so existing NULL rows don't collide).
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceRefCode_key" ON school_comms."Invoice" ("invoiceRefCode") WHERE "invoiceRefCode" IS NOT NULL`
    );
    console.log('  ✓ Added invoiceRefCode column to school_comms.Invoice');
  },

  async down(pool) {
    await pool.query(
      `DROP INDEX IF EXISTS "Invoice_invoiceRefCode_key"`
    );
    await pool.query(
      `ALTER TABLE school_comms."Invoice" DROP COLUMN IF EXISTS "invoiceRefCode"`
    );
  },
};