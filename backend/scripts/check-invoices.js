const { Pool } = require('pg');

async function check() {
  // Check iqrab1 (default) - same user/password
  const pool = new Pool({
    host: 'localhost', port: 5432, user: 'iqra', password: process.env.DB_PASSWORD || '',
    database: 'iqrab1'
  });

  try {
    console.log('--- DATABASE: iqrab1 ---');

    console.log('\n--- FEE STRUCTURES ---');
    const fees = await pool.query(`SELECT id, name, "gradeLevel", "isActive", description FROM school_comms."FeeStructure"`);
    console.log(`Found ${fees.rows.length} fee structure(s):`);
    fees.rows.forEach(f => {
      console.log(`  - ${f.name} | class: ${f.gradeLevel} | active: ${f.isActive}`);
      try {
        const desc = JSON.parse(f.description || '{}');
        console.log(`    months: ${JSON.stringify(desc.months || [])}`);
      } catch(e) {
        console.log(`    desc (raw): ${f.description}`);
      }
    });

    console.log('\n--- INVOICES ---');
    const inv = await pool.query(`SELECT count(*) as c FROM school_comms."Invoice"`);
    console.log(`Total invoices: ${inv.rows[0].c}`);

    if (parseInt(inv.rows[0].c) > 0) {
      const recentInv = await pool.query(`SELECT "invoiceNumber", "studentId", "totalAmount", status, metadata FROM school_comms."Invoice" ORDER BY "createdAt" DESC LIMIT 5`);
      recentInv.rows.forEach(i => console.log(`  - ${i.invoiceNumber} | amount: ${i.totalAmount} | status: ${i.status} | month: ${i.metadata?.monthNumber}`));
    }

    console.log('\n--- CLASS TABLES ---');
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`);
    console.log(`Found ${tables.rows.length} class(es):`);
    for (const t of tables.rows) {
      const count = await pool.query(`SELECT count(*) as c FROM classes_schema."${t.table_name}"`);
      console.log(`  - ${t.table_name}: ${count.rows[0].c} students`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }

  // Now try iqrab2
  const pool2 = new Pool({
    host: 'localhost', port: 5432, user: 'iqra', password: process.env.DB_PASSWORD || '',
    database: 'iqrab2'
  });

  try {
    console.log('\n\n--- DATABASE: iqrab2 ---');

    const fees = await pool2.query(`SELECT id, name, "gradeLevel", "isActive" FROM school_comms."FeeStructure"`);
    console.log(`Fee structures: ${fees.rows.length}`);
    fees.rows.forEach(f => console.log(`  - ${f.name} | class: ${f.gradeLevel} | active: ${f.isActive}`));

    const inv = await pool2.query(`SELECT count(*) as c FROM school_comms."Invoice"`);
    console.log(`Invoices: ${inv.rows[0].c}`);

    const tables = await pool2.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`);
    console.log(`Classes: ${tables.rows.length}`);
    for (const t of tables.rows) {
      const count = await pool2.query(`SELECT count(*) as c FROM classes_schema."${t.table_name}"`);
      console.log(`  - ${t.table_name}: ${count.rows[0].c} students`);
    }
  } catch (e) {
    console.error('iqrab2 ERROR:', e.message);
  } finally {
    await pool2.end();
  }
}

check();
