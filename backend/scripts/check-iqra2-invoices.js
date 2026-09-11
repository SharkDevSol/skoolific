const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    connectionString: 'postgresql://iqra:iqra1768@localhost:5432/iqrab2?schema=school_comms&timezone=Africa/Addis_Ababa'
  });

  try {
    console.log('--- DB INFO ---');
    const dbInfo = await pool.query('SELECT current_database() as db');
    console.log('Connected to:', dbInfo.rows[0].db);

    console.log('\n--- FEE STRUCTURES ---');
    const fees = await pool.query(`SELECT id, name, "gradeLevel", "isActive", description FROM school_comms."FeeStructure"`);
    console.log(`Found ${fees.rows.length} fee structure(s):`);
    fees.rows.forEach(f => {
      console.log(`  - ${f.name} | class: ${f.gradeLevel} | active: ${f.isActive}`);
      console.log(`    desc: ${f.description}`);
    });

    console.log('\n--- INVOICES ---');
    const inv = await pool.query(`SELECT count(*) as c FROM school_comms."Invoice"`);
    console.log(`Total invoices: ${inv.rows[0].c}`);

    if (parseInt(inv.rows[0].c) > 0) {
      const recentInv = await pool.query(`SELECT "invoiceNumber", "studentId", "feeStructureId", "totalAmount", status, metadata FROM school_comms."Invoice" ORDER BY "createdAt" DESC LIMIT 10`);
      recentInv.rows.forEach(i => console.log(`  - ${i.invoiceNumber} | student: ${i.studentId} | amount: ${i.totalAmount} | status: ${i.status} | month: ${i.metadata?.monthNumber}`));
    }

    console.log('\n--- CLASS TABLES ---');
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`);
    console.log(`Found ${tables.rows.length} class(es):`);
    tables.rows.forEach(t => console.log(`  - ${t.table_name}`));

    for (const t of tables.rows) {
      const count = await pool.query(`SELECT count(*) as c FROM classes_schema."${t.table_name}" WHERE is_active = TRUE OR is_active IS NULL`);
      console.log(`    students: ${count.rows[0].c}`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

check();
