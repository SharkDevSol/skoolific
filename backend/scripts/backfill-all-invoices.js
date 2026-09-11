// Backfill script: generate invoices for ALL existing students in ALL classes
// for both iqrab1 and iqrab2 databases.
// Run from the backend directory: node scripts/backfill-all-invoices.js
const { Pool } = require('pg');

const DBS = ['iqrab1', 'iqrab2'];
const DB_USER = process.env.DB_USER || 'iqra';
const DB_PASSWORD = process.env.DB_PASSWORD || 'iqra1768';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;

const ETHIOPIAN_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

function compositeIdToUuid(id) {
  const parts = id.split('-');
  const schoolId = parts[0];
  const classId = parts[1];
  const schoolIdPadded = String(schoolId).padStart(4, '0');
  const classIdPadded = String(classId).padStart(12, '0');
  return `00000000-0000-0000-${schoolIdPadded}-${classIdPadded}`;
}

function toGregorian(ethYear, ethMonth, ethDay) {
  // Ethiopian calendar to Gregorian conversion
  const gregorianDate = new Date(Date.UTC(ethYear + 7, 8, 11));
  const dayOffset = (ethMonth - 1) * 30 + (ethDay - 1);
  gregorianDate.setUTCDate(gregorianDate.getUTCDate() + dayOffset);
  return gregorianDate;
}

async function processDatabase(dbName) {
  console.log(`\n========================================`);
  console.log(`📊 PROCESSING DATABASE: ${dbName}`);
  console.log(`========================================`);

  const pool = new Pool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: dbName
  });

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${dbName}?schema=school_comms` } }
  });

  try {
    // Get all active fee structures
    const feeStructures = await prisma.feeStructure.findMany({
      where: { isActive: true },
      include: { items: true }
    });

    console.log(`Found ${feeStructures.length} active fee structure(s)`);

    let grandTotal = 0;

    for (const feeStructure of feeStructures) {
      const className = feeStructure.gradeLevel;
      const feeStructureId = feeStructure.id;
      console.log(`\n--- ${feeStructure.name} (class: ${className}) ---`);

      // Parse months
      let selectedMonths = [];
      let oldRegistrationFee = 0;
      let newRegistrationFee = 0;
      let registrationFee = 0;
      try {
        let desc = feeStructure.description || '{}';
        desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        const monthsData = JSON.parse(desc);
        selectedMonths = monthsData.months || [];
        oldRegistrationFee = parseFloat(monthsData.oldRegistrationFee) || 0;
        newRegistrationFee = parseFloat(monthsData.newRegistrationFee) || 0;
        registrationFee = newRegistrationFee;
      } catch (e) {
        console.warn(`  Could not parse months: ${e.message}`);
      }

      if (selectedMonths.length === 0) {
        console.log('  ⏭️ No months configured, skipping');
        continue;
      }
      selectedMonths.sort((a, b) => a - b);

      const monthlyAmount = feeStructure.items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      const accountId = feeStructure.items[0]?.accountId;
      const campusId = feeStructure.campusId || '00000000-0000-0000-0000-000000000001';
      const academicYearId = feeStructure.academicYearId || '00000000-0000-0000-0000-000000000001';

      if (monthlyAmount <= 0 || !accountId) {
        console.log('  ⏭️ No valid amount/account, skipping');
        continue;
      }

      // Get students from class table
      const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
      if (!validTableName) { console.log('  ⏭️ Invalid class name'); continue; }

      let students;
      try {
        const res = await pool.query(
          `SELECT school_id, class_id, student_name FROM classes_schema."${className}" WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND student_name IS NOT NULL`
        );
        students = res.rows;
      } catch (e) {
        console.log(`  ⏭️ Class table error: ${e.message}`);
        continue;
      }

      if (students.length === 0) { console.log('  ⏭️ No students found'); continue; }

      // Get students who already have invoices for this fee structure
      const existingInvoices = await prisma.invoice.findMany({
        where: { feeStructureId },
        select: { studentId: true },
        distinct: ['studentId']
      });
      const studentsWithInvoices = new Set(existingInvoices.map(inv => inv.studentId));

      // Filter to students without invoices
      const newStudents = students.filter(s => {
        const uuid = compositeIdToUuid(`${s.school_id}-${s.class_id}`);
        return !studentsWithInvoices.has(uuid);
      });

      if (newStudents.length === 0) {
        console.log('  ✅ All students already have invoices');
        continue;
      }

      console.log(`  Generating invoices for ${newStudents.length}/${students.length} students across ${selectedMonths.length} months`);

      let generated = 0;

      for (const student of newStudents) {
        const studentId = compositeIdToUuid(`${student.school_id}-${student.class_id}`);

        for (let monthIndex = 0; monthIndex < selectedMonths.length; monthIndex++) {
          const targetMonth = selectedMonths[monthIndex];
          const monthName = ETHIOPIAN_MONTHS[targetMonth - 1] || `Month ${targetMonth}`;
          const isFirstMonth = monthIndex === 0;

          // Due date: last day of the Ethiopian month (current Ethiopian year 2018)
          const lastDayOfMonth = targetMonth === 13 ? 5 : 30;
          const dueDate = toGregorian(2018, targetMonth, lastDayOfMonth);
          dueDate.setHours(12, 0, 0, 0);

          const registrationFeeToAdd = isFirstMonth ? registrationFee : 0;
          const invoiceAmount = monthlyAmount + registrationFeeToAdd;

          const invoiceItems = [
            {
              description: `${monthName} Monthly Fee (Month ${monthIndex + 1} of ${selectedMonths.length})`,
              feeCategory: 'TUITION',
              amount: monthlyAmount,
              accountId: accountId
            }
          ];
          if (isFirstMonth && registrationFeeToAdd > 0) {
            invoiceItems.push({
              description: 'Registration Fee (One-time)',
              feeCategory: 'TUITION',
              amount: registrationFeeToAdd,
              accountId: accountId
            });
          }

          const invoiceNumber = `INV-${Date.now()}-${studentId.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}-M${monthIndex + 1}`;

          await prisma.invoice.create({
            data: {
              invoiceNumber,
              studentId,
              academicYearId,
              feeStructureId,
              issueDate: new Date(),
              dueDate,
              totalAmount: invoiceAmount,
              discountAmount: 0,
              lateFeeAmount: 0,
              netAmount: invoiceAmount,
              paidAmount: 0,
              status: 'ISSUED',
              campusId,
              createdBy: '00000000-0000-0000-0000-000000000001',
              metadata: {
                month: monthName,
                monthNumber: targetMonth,
                monthIndex: monthIndex + 1,
                totalMonths: selectedMonths.length,
                oldRegistrationFee: isFirstMonth ? oldRegistrationFee : 0,
                newRegistrationFee: isFirstMonth ? newRegistrationFee : 0,
                isAutoGenerated: true,
                registrationFee: registrationFeeToAdd
              },
              items: { create: invoiceItems }
            }
          });
          generated++;
        }
      }

      console.log(`  ✅ Generated ${generated} invoices for "${className}"`);
      grandTotal += generated;
    }

    console.log(`\n📊 TOTAL for ${dbName}: ${grandTotal} invoices generated`);
  } catch (e) {
    console.error(`ERROR for ${dbName}:`, e.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

(async () => {
  for (const db of DBS) {
    await processDatabase(db);
  }
  console.log('\n✅ ALL BACKFILL COMPLETE');
})();
