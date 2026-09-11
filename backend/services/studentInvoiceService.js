// services/studentInvoiceService.js
// Auto-generate monthly invoices for a student — shared by student registration and class transfer
const { getBranchPrisma } = require('./BranchPrismaService');

const ETHIOPIAN_MONTH_NAMES = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

/**
 * Generate monthly invoices for a student in a class (all configured months).
 * @param {Object} opts
 * @param {string} opts.studentUuid - composite student id (school_id + class_id)
 * @param {string} opts.className - target class (fee structure gradeLevel)
 * @param {boolean} [opts.skipRegistrationFee] - skip the one-time registration fee (used on transfers)
 * @param {string} [opts.regFeeType] - 'old' | 'new' — which registration fee to charge (default 'new')
 */
async function generateStudentInvoices({ studentUuid, className, skipRegistrationFee = false, regFeeType = 'new' }) {
  const prisma = getBranchPrisma();

  const feeStructures = await prisma.feeStructure.findMany({
    where: { gradeLevel: className, isActive: true },
    include: { items: true }
  });

  if (feeStructures.length === 0) {
    console.warn(`⚠️ [InvoiceService] No active fee structure found for class "${className}" — no invoices generated. Check Payment Settings gradeLevel matches class name exactly.`);
    return { generated: 0, feeStructureId: null };
  }

  const { toEthiopian, toGregorian } = require('../utils/ethiopianCalendar');
  let generated = 0;
  let firstFeeStructureId = null;

  for (const feeStructure of feeStructures) {
    if (!firstFeeStructureId) firstFeeStructureId = feeStructure.id;

    // Parse months data from description
    let selectedMonths = [];
    let oldRegistrationFee = 0;
    let newRegistrationFee = 0;
    try {
      let desc = feeStructure.description || '{}';
      desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const monthsData = JSON.parse(desc);
      selectedMonths = monthsData.months || [];
      oldRegistrationFee = parseFloat(monthsData.oldRegistrationFee) || 0;
      newRegistrationFee = parseFloat(monthsData.newRegistrationFee) || parseFloat(monthsData.registrationFee) || 0;
    } catch (e) {
      console.warn(`⚠️ [InvoiceService] Could not parse months data for fee structure ${feeStructure.id}:`, e.message);
    }

    if (selectedMonths.length === 0) {
      console.log(`⏭️ [InvoiceService] Fee structure ${feeStructure.id} has no months configured — skipping`);
      continue;
    }

    selectedMonths.sort((a, b) => a - b);

    // Get monthly amount from first fee structure item
    const monthlyAmount = feeStructure.items.length > 0 ? parseFloat(feeStructure.items[0].amount) : 0;
    if (monthlyAmount <= 0) continue;

    const academicYearId = feeStructure.academicYearId || '00000000-0000-0000-0000-000000000001';
    const campusId = feeStructure.campusId || '00000000-0000-0000-0000-000000000001';
    const accountId = feeStructure.items[0]?.accountId || '00000000-0000-0000-0000-000000000001';

    const today = new Date();
    const ethNow = toEthiopian(today);
    const ethiopianYear = ethNow.year;

    // Pagume (month 13) has 5 days in a normal year, 6 in a leap year
    const gregYear = ethiopianYear + 7;
    const pagumeDays = ((gregYear + 1) % 4 === 0 && ((gregYear + 1) % 100 !== 0 || (gregYear + 1) % 400 === 0)) ? 6 : 5;

    for (let monthIndex = 0; monthIndex < selectedMonths.length; monthIndex++) {
      const targetMonth = selectedMonths[monthIndex];
      const isFirstMonth = monthIndex === 0;
      const monthName = ETHIOPIAN_MONTH_NAMES[targetMonth - 1] || `Month ${targetMonth}`;

      // DUPLICATE GUARD: never create a second invoice for the same student + month
      const existing = await prisma.invoice.findMany({
        where: { studentId: studentUuid },
        select: { metadata: true }
      });
      const alreadyHasMonth = existing.some(inv => inv.metadata && inv.metadata.monthNumber === targetMonth);
      if (alreadyHasMonth) {
        console.log(`⏭️ [InvoiceService] Invoice for month ${targetMonth} already exists for ${studentUuid} — skipping (duplicate guard)`);
        continue;
      }

      // FIX: Due date = LAST day of the target Ethiopian month (accurate)
      const lastDayOfMonth = targetMonth === 13 ? pagumeDays : 30;
      let dueDate = toGregorian(ethiopianYear, targetMonth, lastDayOfMonth);
      dueDate.setHours(12, 0, 0, 0);
      if (dueDate < today) {
        dueDate = new Date(today);
        dueDate.setHours(12, 0, 0, 0);
        dueDate.setDate(dueDate.getDate() + 10);
      }

      // Registration fee on first month only (skipped for transfers)
      // Fee type: OLD students pay the old registration fee, NEW students pay the new one
      const chosenRegFee = (regFeeType === 'old' && oldRegistrationFee > 0)
        ? oldRegistrationFee
        : newRegistrationFee;
      const registrationFee = (isFirstMonth && !skipRegistrationFee) ? chosenRegFee : 0;
      const invoiceAmount = monthlyAmount + registrationFee;

      const invoiceItems = [
        {
          description: `${monthName} Monthly Fee (Month ${monthIndex + 1} of ${selectedMonths.length})`,
          feeCategory: 'TUITION',
          amount: monthlyAmount,
          accountId: accountId
        }
      ];

      if (isFirstMonth && registrationFee > 0) {
        invoiceItems.push({
          description: `Registration Fee (${regFeeType === 'old' ? 'Old' : 'New'} Student)`,
          feeCategory: 'TUITION',
          amount: registrationFee,
          accountId: accountId
        });
      }

      const invoiceNumber = `INV-${Date.now()}-${studentUuid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}-M${monthIndex + 1}`;

      const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');
      const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
        const existing = await prisma.invoice.findUnique({ where: { invoiceRefCode: code } });
        return !!existing;
      });

      await prisma.invoice.create({
        data: {
          invoiceNumber,
          invoiceRefCode,
          studentId: studentUuid,
          academicYearId,
          feeStructureId: feeStructure.id,
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
            studentType: isFirstMonth ? regFeeType : null,
            isAutoGenerated: true,
            registrationFee
          },
          items: { create: invoiceItems }
        }
      });
      generated++;
    }

    console.log(`✅ [InvoiceService] Generated ${selectedMonths.length} invoices for student ${studentUuid} in "${className}" (fee structure: ${feeStructure.name})`);
  }

  return { generated, feeStructureId: firstFeeStructureId };
}

module.exports = { generateStudentInvoices };