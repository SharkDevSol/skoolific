const express = require('express');
const router = express.Router();
const { branchPrisma: prisma } = require('../services/BranchPrismaService');
const { applyLateFeesAutomatically } = require('../services/autoLateFeeService');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const ethiopianCalendar = require('../utils/ethiopianCalendar');

/**
 * Current Ethiopian month number (1-13) computed SERVER-SIDE from the real date.
 * Ethiopia is UTC+3; the shift guarantees the month boundary matches school local time
 * regardless of the server's timezone. This is the source of truth for "unlocked" months.
 *
 * School year 2019 (Meskerem 2019 = Sep 11, 2026): before the 2019 school year starts
 * (i.e., while the Ethiopian year is still 2018) only Meskerem (month 1) is unlocked.
 * From 2019 onward, months unlock by date as usual.
 */
function getServerEthiopianMonth() {
  const shifted = new Date(Date.now() + 3 * 3600 * 1000);
  const ethiopiaLocal = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    12, 0, 0
  ));
  const eth = ethiopianCalendar.toEthiopian(ethiopiaLocal);
  if (eth.year < 2019) return 1; // before 2019 school year: only Meskerem unlocked
  return eth.month;
}

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * GET /api/finance/monthly-payments-view/receipts/last-number
 * Get the last receipt number used
 */
router.get('/receipts/last-number', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    // Per-branch counter file — each branch has its own receipt number sequence
    const fs = require('fs');
    const path = require('path');
    const counterFile = path.join(__dirname, `../uploads/receipt-counter-${req.branchCode}.json`);
    
    let lastNumber = 0;
    if (fs.existsSync(counterFile)) {
      const data = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
      lastNumber = data.lastNumber || 0;
    }

    res.json({
      branch: req.branchCode,
      lastNumber: lastNumber
    });
  } catch (error) {
    console.error('Error fetching last receipt number:', error);
    res.json({ lastNumber: 0 });
  }
});

/**
 * POST /api/finance/monthly-payments-view/receipts/save-number
 * Save a receipt number after printing
 */
router.post('/receipts/save-number', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { receiptNumber } = req.body;

    if (!receiptNumber) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Receipt number is required'
      });
    }

    // Per-branch counter file
    const fs = require('fs');
    const path = require('path');
    const counterFile = path.join(__dirname, `../uploads/receipt-counter-${req.branchCode}.json`);
    
    fs.writeFileSync(counterFile, JSON.stringify({ lastNumber: parseInt(receiptNumber) }), 'utf8');

    res.json({
      success: true,
      message: 'Receipt number saved successfully',
      branch: req.branchCode
    });
  } catch (error) {
    console.error('Error saving receipt number:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to save receipt number',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/invoice/:invoiceId/receipt-number
 * Get the receipt number for a specific invoice
 */
router.get('/invoice/:invoiceId/receipt-number', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const fs = require('fs');
    const path = require('path');
    const mappingFile = path.join(__dirname, `../uploads/invoice-receipt-mapping-${req.branchCode}.json`);
    
    let mapping = {};
    if (fs.existsSync(mappingFile)) {
      mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    }

    const receiptNumber = mapping[invoiceId] || null;

    res.json({
      invoiceId: invoiceId,
      receiptNumber: receiptNumber,
      branch: req.branchCode
    });
  } catch (error) {
    console.error('Error fetching invoice receipt number:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch receipt number',
      details: error.message
    });
  }
});

/**
 * POST /api/finance/monthly-payments-view/invoice/:invoiceId/receipt-number
 * Save the receipt number for a specific invoice
 */
router.post('/invoice/:invoiceId/receipt-number', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { receiptNumber } = req.body;

    if (!receiptNumber) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Receipt number is required'
      });
    }

    const fs = require('fs');
    const path = require('path');
    const mappingFile = path.join(__dirname, `../uploads/invoice-receipt-mapping-${req.branchCode}.json`);
    
    let mapping = {};
    if (fs.existsSync(mappingFile)) {
      mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    }

    // Save the mapping
    mapping[invoiceId] = receiptNumber;
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'Receipt number saved for invoice',
      invoiceId: invoiceId,
      receiptNumber: receiptNumber,
      branch: req.branchCode
    });
  } catch (error) {
    console.error('Error saving invoice receipt number:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to save receipt number',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/overview
 * NEW CLEAN IMPLEMENTATION - Get overview with ACTIVE STUDENTS ONLY
 */
router.get('/overview', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    await applyLateFeesAutomatically();
    
    const currentEthiopianMonth = getServerEthiopianMonth();

    console.log('\n========================================');
    console.log('📊 MONTHLY PAYMENTS OVERVIEW - ACTIVE STUDENTS ONLY');
    console.log('========================================');
    console.log(`Current Ethiopian Month: ${currentEthiopianMonth}\n`);

    // The school fee year runs Meskerem (1) to Sene (10); months beyond Sene are not billed
    const REPORT_MONTH_LIMIT = 10;
    const reportMonth = Math.min(currentEthiopianMonth, REPORT_MONTH_LIMIT);

    // Get all active fee structures
    const feeStructures = await prisma.feeStructure.findMany({
      where: { isActive: true },
      include: { items: true }
    });

    const classesData = [];
    const allStudentInfo = new Map(); // studentId -> { name, class } for payment-date lookups

    // Process each class
    for (const feeStructure of feeStructures) {
      const className = feeStructure.gradeLevel;
      console.log(`\n--- Processing Class ${className} ---`);

      // STEP 1: Get ACTIVE students from class table
      let activeStudentIds = new Set();
      let freeStudentsCount = 0;
      let activeStudents = [];
      
      try {
        // Check if is_active, is_free, student_type, is_kg, is_evening_class columns exist
        const columnCheck = await prisma.$queryRawUnsafe(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = '${className}'
            AND column_name IN ('is_active', 'is_free', 'student_type', 'is_kg', 'is_evening_class')
        `);
        
        const columnNames = columnCheck.map(c => c.column_name);
        const hasIsActive = columnNames.includes('is_active');
        const hasIsFree = columnNames.includes('is_free');
        const hasStudentType = columnNames.includes('student_type');
        const hasIsKg = columnNames.includes('is_kg');
        const hasIsEvening = columnNames.includes('is_evening_class');
        
        // Build query with conditional columns and filters
        let whereClause = hasIsActive ? 'WHERE is_active = TRUE OR is_active IS NULL' : 'WHERE 1=1';
        
        // V2 Enhancement: Add student type filter support
        const studentTypeFilter = req.query.studentType; // 'kg', 'evening', 'kg_evening', 'regular', or 'all'
        if (studentTypeFilter && studentTypeFilter !== 'all') {
          if (hasStudentType) {
            whereClause += ` AND student_type = '${studentTypeFilter}'`;
          } else if (hasIsKg && hasIsEvening) {
            // Fallback to individual columns
            if (studentTypeFilter === 'kg') {
              whereClause += ` AND is_kg = TRUE AND is_evening_class = FALSE`;
            } else if (studentTypeFilter === 'evening') {
              whereClause += ` AND is_evening_class = TRUE AND is_kg = FALSE`;
            } else if (studentTypeFilter === 'kg_evening') {
              whereClause += ` AND is_kg = TRUE AND is_evening_class = TRUE`;
            } else if (studentTypeFilter === 'regular') {
              whereClause += ` AND (is_kg = FALSE OR is_kg IS NULL) AND (is_evening_class = FALSE OR is_evening_class IS NULL)`;
            }
          }
        }
        
        const selectIsFree = hasIsFree ? ', is_free' : '';
        const selectStudentType = hasStudentType ? ', student_type' : '';
        const selectIsKg = hasIsKg ? ', is_kg' : '';
        const selectIsEvening = hasIsEvening ? ', is_evening_class' : '';
        
        const activeStudentsRes = await prisma.$queryRawUnsafe(`
          SELECT school_id, class_id, student_name${selectIsFree}${selectStudentType}${selectIsKg}${selectIsEvening}
          FROM classes_schema."${className}"
          ${whereClause}
        `);
        
        activeStudents = activeStudentsRes;
        
        console.log(`Active students found: ${activeStudents.length}`);
        
        // Count free students
        
        // Build UUID format student IDs
        for (const student of activeStudents) {
          const schoolIdPadded = String(student.school_id).padStart(4, '0');
          const classIdPadded = String(student.class_id).padStart(12, '0');
          const studentId = `00000000-0000-0000-${schoolIdPadded}-${classIdPadded}`;
          activeStudentIds.add(studentId);
          
          if (student.is_free === true) {
            freeStudentsCount++;
          }
          
          console.log(`  ✓ ${student.student_name} (${student.school_id}-${student.class_id})${student.is_free ? ' [FREE]' : ''}`);
        }
        
        console.log(`Free students: ${freeStudentsCount}`);
      } catch (error) {
        console.error(`ERROR fetching students for ${className}:`, error.message);
        continue;
      }

      if (activeStudentIds.size === 0) {
        console.log(`No active students in ${className}, skipping...`);
        continue;
      }

      // STEP 2: Build map of free students (exempt from payments)
      const freeStudentIds = new Set();
      try {
        // Check if is_active column exists (reuse from previous check)
        const columnCheck = await prisma.$queryRawUnsafe(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = '${className}'
            AND column_name = 'is_active'
        `);
        
        const hasIsActive = columnCheck.length > 0;
        const whereClause = hasIsActive 
          ? 'WHERE (is_active = TRUE OR is_active IS NULL) AND is_free = TRUE'
          : 'WHERE is_free = TRUE';
        
        const freeStudents = await prisma.$queryRawUnsafe(`
          SELECT school_id, class_id, student_name, exemption_type
          FROM classes_schema."${className}"
          ${whereClause}
        `);
        
        console.log(`Free students found: ${freeStudents.length}`);
        
        for (const student of freeStudents) {
          const schoolIdPadded = String(student.school_id).padStart(4, '0');
          const classIdPadded = String(student.class_id).padStart(12, '0');
          const studentId = `00000000-0000-0000-${schoolIdPadded}-${classIdPadded}`;
          freeStudentIds.add(studentId);
          console.log(`  🎓 ${student.student_name} (${student.school_id}-${student.class_id}) [${student.exemption_type}] - EXEMPT FROM PAYMENTS`);
        }
      } catch (error) {
        console.error(`ERROR fetching free students for ${className}:`, error.message);
      }

      // STEP 3: Get ALL invoices for this class
      const allInvoices = await prisma.invoice.findMany({
        where: { feeStructureId: feeStructure.id },
        include: { items: true }
      });

      console.log(`Total invoices in DB: ${allInvoices.length}`);

      // STEP 4: Filter to ONLY active, PAYING student invoices (exclude free students)
      const activeInvoices = allInvoices.filter(inv => activeStudentIds.has(inv.studentId));
      const payingStudentInvoices = activeInvoices.filter(inv => !freeStudentIds.has(inv.studentId));
      const freeStudentInvoices = activeInvoices.filter(inv => freeStudentIds.has(inv.studentId));
      const deactivatedInvoices = allInvoices.filter(inv => !activeStudentIds.has(inv.studentId));
      
      // Free students still pay a one-time Registration Fee. Count their reg-fee
      // invoices separately so their payments show in the report (not tuition).
      const freeRegTotal = freeStudentInvoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount), 0);
      const freeRegPaid = freeStudentInvoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount), 0);
      const freeRegPending = freeRegTotal - freeRegPaid;
      const freeRegPaidCount = freeStudentInvoices.filter(inv => inv.status === 'PAID').length;
      
      console.log(`Active student invoices: ${activeInvoices.length}`);
      console.log(`Paying student invoices: ${payingStudentInvoices.length}`);
      console.log(`Free student invoices (EXCLUDED from totals): ${freeStudentInvoices.length}`);
      console.log(`Deactivated student invoices (EXCLUDED): ${deactivatedInvoices.length}`);

      if (freeStudentInvoices.length > 0) {
        console.log('Free student invoices excluded from calculations:');
        freeStudentInvoices.forEach(inv => {
          console.log(`  🎓 Student ${inv.studentId}: ${inv.totalAmount} Birr (EXEMPT)`);
        });
      }

      if (deactivatedInvoices.length > 0) {
        console.log('Deactivated student invoices:');
        deactivatedInvoices.forEach(inv => {
          console.log(`  ✗ Student ${inv.studentId}: ${inv.totalAmount} Birr`);
        });
      }

      if (payingStudentInvoices.length === 0) {
        console.log(`No invoices for paying students, skipping...`);
        continue;
      }

      // STEP 5: Calculate UNLOCKED amounts (paying students only, exclude free students)
      const unlockedInvoices = payingStudentInvoices.filter(inv => {
        const monthNumber = inv.metadata?.monthNumber || 0;
        return monthNumber <= reportMonth;
      });

      const unlockedTotalAmount = unlockedInvoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount), 0);
      const unlockedTotalPaid = unlockedInvoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount), 0);
      const unlockedTotalPending = unlockedTotalAmount - unlockedTotalPaid;

      // STEP 5b: Build per-month breakdown for this class (months 1..reportMonth)
      // with the names of students who paid and students who still owe
      const studentNameMap = new Map();
      for (const st of activeStudents) {
        const sid = `00000000-0000-0000-${String(st.school_id).padStart(4, '0')}-${String(st.class_id).padStart(12, '0')}`;
        studentNameMap.set(sid, st.student_name);
        if (!allStudentInfo.has(sid)) allStudentInfo.set(sid, { name: st.student_name, class: className });
      }

      const monthMap = new Map();
      for (const inv of payingStudentInvoices) {
        const m = inv.metadata?.monthNumber || 0;
        if (m < 1) continue;
        let entry = monthMap.get(m);
        if (!entry) {
          entry = { monthNumber: m, expected: 0, paid: 0, pending: 0, invoices: 0, paidInvoices: 0, paidStudents: [], unpaidStudents: [] };
          monthMap.set(m, entry);
        }
        const net = parseFloat(inv.netAmount);
        const paid = parseFloat(inv.paidAmount);
        const pending = net - paid;
        entry.expected += net;
        entry.paid += paid;
        entry.pending += pending;
        entry.invoices += 1;
        if (inv.status === 'PAID') entry.paidInvoices += 1;
        const sname = studentNameMap.get(inv.studentId) || inv.studentId;
        if (paid > 0) entry.paidStudents.push({ name: sname, class: className, amount: paid });
        if (pending > 0) entry.unpaidStudents.push({ name: sname, class: className, pending });
      }
      const monthlyBreakdown = [];
      for (let m = 1; m <= reportMonth; m++) {
        const e = monthMap.get(m);
        monthlyBreakdown.push(e
          ? { ...e, rate: e.expected > 0 ? (e.paid / e.expected) * 100 : 0 }
          : { monthNumber: m, expected: 0, paid: 0, pending: 0, invoices: 0, paidInvoices: 0, rate: 0, paidStudents: [], unpaidStudents: [] });
      }

      console.log(`\nFinancial Summary (Paying Students Only - Free Students Excluded):`);
      console.log(`  Total Students: ${activeStudentIds.size}`);
      console.log(`  Free Students: ${freeStudentsCount}`);
      console.log(`  Paying Students: ${activeStudentIds.size - freeStudentsCount}`);
      console.log(`  Unlocked Invoices (Paying): ${unlockedInvoices.length}`);
      console.log(`  Unlocked Total: ${unlockedTotalAmount.toFixed(2)} Birr`);
      console.log(`  Unlocked Paid: ${unlockedTotalPaid.toFixed(2)} Birr`);
      console.log(`  Unlocked Pending: ${unlockedTotalPending.toFixed(2)} Birr`);

      // Add to results
      classesData.push({
        className: className,
        feeStructureId: feeStructure.id,
        monthlyFee: feeStructure.items[0]?.amount || 0,
        totalStudents: activeStudentIds.size,
        freeStudents: freeStudentsCount,
        payingStudents: activeStudentIds.size - freeStudentsCount,
        freeRegTotal,
        freeRegPaid,
        freeRegPending,
        freeRegPaidCount,
        totalInvoices: unlockedInvoices.length,
        paidInvoices: payingStudentInvoices.filter(inv => inv.status === 'PAID').length,
        partialInvoices: payingStudentInvoices.filter(inv => inv.status === 'PARTIALLY_PAID').length,
        unpaidInvoices: unlockedInvoices.filter(inv => inv.status !== 'PAID').length,
        unpaidUnlockedStudents: getUnpaidUnlockedStudentsCount(payingStudentInvoices, reportMonth),
        totalAmount: payingStudentInvoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount), 0),
        totalPaid: payingStudentInvoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount), 0),
        totalPending: payingStudentInvoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount) - parseFloat(inv.paidAmount), 0),
        unlockedTotalAmount: unlockedTotalAmount,
        unlockedTotalPaid: unlockedTotalPaid,
        unlockedTotalPending: unlockedTotalPending,
        monthlyBreakdown: monthlyBreakdown
      });
    }

    // Helper function to count students with unpaid unlocked months
    function getUnpaidUnlockedStudentsCount(invoices, currentMonth) {
      const studentMap = new Map();
      
      // Group invoices by student
      invoices.forEach(inv => {
        if (!studentMap.has(inv.studentId)) {
          studentMap.set(inv.studentId, []);
        }
        studentMap.get(inv.studentId).push(inv);
      });
      
      // Count students with at least one unpaid unlocked month
      let count = 0;
      for (const [studentId, studentInvoices] of studentMap.entries()) {
        const hasUnpaidUnlocked = studentInvoices.some(inv => {
          const monthNumber = inv.metadata?.monthNumber || 0;
          const isUnlocked = monthNumber <= currentMonth;
          const isUnpaid = inv.status !== 'PAID';
          return isUnlocked && isUnpaid;
        });
        
        if (hasUnpaidUnlocked) {
          count++;
        }
      }
      
      return count;
    }

    // Calculate overall summary
    const summary = {
      totalClasses: classesData.length,
      totalStudents: classesData.reduce((sum, c) => sum + c.totalStudents, 0),
      freeStudents: classesData.reduce((sum, c) => sum + c.freeStudents, 0),
      payingStudents: classesData.reduce((sum, c) => sum + c.payingStudents, 0),
      totalInvoices: classesData.reduce((sum, c) => sum + c.totalInvoices, 0),
      totalPaid: classesData.reduce((sum, c) => sum + c.paidInvoices, 0),
      totalPartial: classesData.reduce((sum, c) => sum + c.partialInvoices, 0),
      totalUnpaid: classesData.reduce((sum, c) => sum + c.unpaidInvoices, 0),
      unpaidUnlockedStudents: classesData.reduce((sum, c) => sum + c.unpaidUnlockedStudents, 0),
      // Free students still pay registration fee — track their registration fee totals
      // separately and INCLUDE the collected amount in totalCollected.
      freeRegTotal: classesData.reduce((sum, c) => sum + (c.freeRegTotal || 0), 0),
      freeRegPaid: classesData.reduce((sum, c) => sum + (c.freeRegPaid || 0), 0),
      freeRegPending: classesData.reduce((sum, c) => sum + (c.freeRegPending || 0), 0),
      freeRegPaidCount: classesData.reduce((sum, c) => sum + (c.freeRegPaidCount || 0), 0),
      totalCollected: classesData.reduce((sum, c) => sum + c.totalPaid + (c.freeRegPaid || 0), 0),
      totalPending: classesData.reduce((sum, c) => sum + c.totalPending + (c.freeRegPending || 0), 0),
      unlockedTotalAmount: classesData.reduce((sum, c) => sum + c.unlockedTotalAmount, 0),
      unlockedTotalPaid: classesData.reduce((sum, c) => sum + c.unlockedTotalPaid, 0),
      unlockedTotalPending: classesData.reduce((sum, c) => sum + c.unlockedTotalPending, 0)
    };

    // Aggregate per-month breakdown across all classes
    const summaryMonthly = [];
    for (let m = 1; m <= reportMonth; m++) {
      const paidStudents = [];
      const unpaidStudents = [];
      for (const c of classesData) {
        const row = c.monthlyBreakdown[m - 1];
        if (!row) continue;
        if (row.paidStudents) paidStudents.push(...row.paidStudents);
        if (row.unpaidStudents) unpaidStudents.push(...row.unpaidStudents);
      }
      summaryMonthly.push({
        monthNumber: m,
        expected: classesData.reduce((s, c) => s + (c.monthlyBreakdown[m - 1]?.expected || 0), 0),
        paid: classesData.reduce((s, c) => s + (c.monthlyBreakdown[m - 1]?.paid || 0), 0),
        pending: classesData.reduce((s, c) => s + (c.monthlyBreakdown[m - 1]?.pending || 0), 0),
        invoices: classesData.reduce((s, c) => s + (c.monthlyBreakdown[m - 1]?.invoices || 0), 0),
        paidInvoices: classesData.reduce((s, c) => s + (c.monthlyBreakdown[m - 1]?.paidInvoices || 0), 0),
        paidStudents,
        unpaidStudents
      });
    }
    summary.monthlyBreakdown = summaryMonthly;
    for (const m of summaryMonthly) {
      m.rate = m.expected > 0 ? (m.paid / m.expected) * 100 : 0;
    }

    // Today's collections (completed payments made today)
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayPayments = await prisma.payment.findMany({
        where: { status: 'COMPLETED', paymentDate: { gte: todayStart } },
        select: { amount: true }
      });
      summary.todayCollected = todayPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    } catch (error) {
      console.error('ERROR fetching today collections:', error.message);
      summary.todayCollected = 0;
    }

    // Payments made on a specific selected date (?paidOn=YYYY-MM-DD, Ethiopia local day)
    const paidOnParam = req.query.paidOn || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(paidOnParam)) {
      try {
        const [py, pm, pd] = paidOnParam.split('-').map(Number);
        const dayStartUtc = Date.UTC(py, pm - 1, pd) - 3 * 3600 * 1000; // Ethiopia = UTC+3
        const dayEndUtc = dayStartUtc + 24 * 3600 * 1000;
        const dayPayments = await prisma.payment.findMany({
          where: {
            status: 'COMPLETED',
            paymentDate: { gte: new Date(dayStartUtc), lt: new Date(dayEndUtc) }
          },
          orderBy: { paymentDate: 'asc' },
          select: { amount: true, studentId: true, receiptNumber: true, paymentDate: true }
        });
        const students = dayPayments.map(p => {
          const info = allStudentInfo.get(p.studentId) || {};
          const local = new Date(p.paymentDate.getTime() + 3 * 3600 * 1000);
          const hh = String(local.getUTCHours()).padStart(2, '0');
          const mm = String(local.getUTCMinutes()).padStart(2, '0');
          return {
            name: info.name || 'Unknown',
            class: info.class || '',
            amount: parseFloat(p.amount),
            receiptNumber: p.receiptNumber || '',
            time: `${hh}:${mm}`
          };
        });
        summary.paidOn = {
          date: paidOnParam,
          total: students.reduce((s, p) => s + p.amount, 0),
          count: students.length,
          students
        };
        console.log(`📅 Payments on ${paidOnParam}: ${summary.paidOn.total.toFixed(2)} Birr from ${students.length} payments`);
      } catch (error) {
        console.error('ERROR fetching payments for selected date:', error.message);
        summary.paidOn = { date: paidOnParam, total: 0, count: 0, students: [] };
      }
    }

    console.log('\n========================================');
    console.log('OVERALL SUMMARY (Active Students Only):');
    console.log('========================================');
    console.log(`Total Classes: ${summary.totalClasses}`);
    console.log(`Total Students: ${summary.totalStudents}`);
    console.log(`Unlocked Total Amount: ${summary.unlockedTotalAmount.toFixed(2)} Birr`);
    console.log(`Unlocked Total Paid: ${summary.unlockedTotalPaid.toFixed(2)} Birr`);
    console.log(`Unlocked Total Pending: ${summary.unlockedTotalPending.toFixed(2)} Birr`);
    console.log('========================================\n');

    res.json({
      summary,
      classes: classesData,
      reportMonth
    });

  } catch (error) {
    console.error('ERROR in overview endpoint:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch overview',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/class/:className
 * Get detailed student list with balances for a specific class
 */
router.get('/class/:className', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    // Auto-apply late fees before fetching data
    await applyLateFeesAutomatically();
    
    const { className } = req.params;
    const currentEthiopianMonth = getServerEthiopianMonth();

    // Get fee structure for this class
    const feeStructure = await prisma.feeStructure.findFirst({
      where: {
        gradeLevel: className,
        isActive: true
      },
      include: {
        items: true
      }
    });

    if (!feeStructure) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Fee structure not found for this class'
      });
    }

    // Get all invoices for this class
    const invoices = await prisma.invoice.findMany({
      where: {
        feeStructureId: feeStructure.id
      },
      include: {
        items: true,
        paymentAllocations: {
          include: {
            payment: true
          }
        }
      },
      orderBy: {
        studentId: 'asc'
      }
    });

    // Group invoices by student
    const studentMap = new Map();

    for (const invoice of invoices) {
      const monthNumber = invoice.metadata?.monthNumber || 0;
      const isUnlocked = monthNumber <= currentEthiopianMonth;

      if (!studentMap.has(invoice.studentId)) {
        studentMap.set(invoice.studentId, {
          studentId: invoice.studentId,
          invoices: [],
          totalAmount: 0,
          totalPaid: 0,
          totalBalance: 0,
          unlockedTotalAmount: 0,
          unlockedTotalPaid: 0,
          unlockedTotalBalance: 0,
          unpaidMonths: 0,
          unlockedUnpaidMonths: 0,
          overdueMonths: 0,
          lastPaymentDate: null
        });
      }

      const student = studentMap.get(invoice.studentId);
      student.invoices.push(invoice);
      
      // Total calculations (all months) — use netAmount (accounts for reg fee type adjustments)
      student.totalAmount += parseFloat(invoice.netAmount);
      student.totalPaid += parseFloat(invoice.paidAmount);
      student.totalBalance += parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount);

      // Unlocked months calculations only
      if (isUnlocked) {
        student.unlockedTotalAmount += parseFloat(invoice.netAmount);
        student.unlockedTotalPaid += parseFloat(invoice.paidAmount);
        student.unlockedTotalBalance += parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount);

        if (invoice.status !== 'PAID') {
          student.unlockedUnpaidMonths++;
        }
      }

      // Count unpaid months (all)
      if (invoice.status === 'PENDING' || invoice.status === 'PARTIALLY_PAID' || invoice.status === 'ISSUED') {
        student.unpaidMonths++;
      }
      if (invoice.status === 'OVERDUE') {
        student.overdueMonths++;
      }

      // Get last payment date
      if (invoice.paymentAllocations && invoice.paymentAllocations.length > 0) {
        const latestPayment = invoice.paymentAllocations
          .map(a => a.payment)
          .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0];
        
        if (latestPayment) {
          const paymentDate = new Date(latestPayment.paymentDate);
          if (!student.lastPaymentDate || paymentDate > new Date(student.lastPaymentDate)) {
            student.lastPaymentDate = latestPayment.paymentDate;
          }
        }
      }
    }

    // Fetch student names from the actual class tables in classes_schema
    const studentIds = Array.from(studentMap.keys());
    const studentNameMap = new Map();

    // Try to fetch from classes_schema tables
    try {
      // Get the class name from fee structure
      const className = feeStructure.gradeLevel;
      
      // OPTIMIZED: Check for is_active, student_type, is_kg, is_evening_class columns ONCE, not in the loop
      const columnCheck = await prisma.$queryRawUnsafe(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'classes_schema' 
          AND table_name = '${className}'
          AND column_name IN ('is_active', 'student_type', 'is_kg', 'is_evening_class')
      `);
      
      const columnNames = columnCheck.map(c => c.column_name);
      const hasIsActive = columnNames.includes('is_active');
      const hasStudentType = columnNames.includes('student_type');
      const hasIsKg = columnNames.includes('is_kg');
      const hasIsEvening = columnNames.includes('is_evening_class');
      
      let whereClause = hasIsActive 
        ? 'WHERE (is_active = TRUE OR is_active IS NULL)'
        : 'WHERE 1=1';
      
      // V2 Enhancement: Add student type filter support
      const studentTypeFilter = req.query.studentType; // 'kg', 'evening', 'kg_evening', 'regular', or 'all'
      if (studentTypeFilter && studentTypeFilter !== 'all') {
        if (hasStudentType) {
          whereClause += ` AND student_type = '${studentTypeFilter}'`;
        } else if (hasIsKg && hasIsEvening) {
          // Fallback to individual columns
          if (studentTypeFilter === 'kg') {
            whereClause += ` AND is_kg = TRUE AND is_evening_class = FALSE`;
          } else if (studentTypeFilter === 'evening') {
            whereClause += ` AND is_evening_class = TRUE AND is_kg = FALSE`;
          } else if (studentTypeFilter === 'kg_evening') {
            whereClause += ` AND is_kg = TRUE AND is_evening_class = TRUE`;
          } else if (studentTypeFilter === 'regular') {
            whereClause += ` AND (is_kg = FALSE OR is_kg IS NULL) AND (is_evening_class = FALSE OR is_evening_class IS NULL)`;
          }
        }
      }
      
      // OPTIMIZED: Fetch ALL students in a SINGLE query instead of looping
      const allStudents = await prisma.$queryRawUnsafe(`
        SELECT school_id, class_id, student_name, is_free, exemption_type, exemption_reason
        FROM classes_schema."${className}"
        ${whereClause}
      `);
      
      console.log(`Fetched ${allStudents.length} students from classes_schema.${className}`);
      
      // Build the student name map
      for (const student of allStudents) {
        const schoolIdPadded = String(student.school_id).padStart(4, '0');
        const classIdPadded = String(student.class_id).padStart(12, '0');
        const studentId = `00000000-0000-0000-${schoolIdPadded}-${classIdPadded}`;
        
        // Only add students that have invoices
        if (studentIds.includes(studentId)) {
          studentNameMap.set(studentId, {
            name: student.student_name,
            is_free: student.is_free || false,
            exemption_type: student.exemption_type || null,
            exemption_reason: student.exemption_reason || null
          });
          console.log(`Found student: ${studentId} → ${student.student_name}${student.is_free ? ' [FREE]' : ''}`);
        }
      }

      console.log(`Mapped ${studentNameMap.size} student names from classes_schema.${className}`);
      
      // Log which students are in the name map
      console.log('Students in name map:');
      for (const [id, info] of studentNameMap.entries()) {
        console.log(`  - ${id}: ${info.name}`);
      }
      
    } catch (error) {
      console.error('Error fetching student names from classes_schema:', error.message);
      
      // Fallback: Try to fetch from Prisma Student table
      try {
        const studentRecords = await prisma.student.findMany({
          where: {
            id: {
              in: studentIds
            }
          },
          select: {
            id: true,
            studentName: true
          }
        });

        studentRecords.forEach(record => {
          studentNameMap.set(record.id, record.studentName);
        });
      } catch (fallbackError) {
        console.error('Error fetching from Student table:', fallbackError.message);
      }
    }

    // Convert to array and add month status visualization
    // Filter out students who don't have names (deactivated students)
    console.log(`\nTotal students in studentMap: ${studentMap.size}`);
    console.log('Student IDs in studentMap:', Array.from(studentMap.keys()));
    
    const students = Array.from(studentMap.values())
      .filter(student => {
        const hasName = studentNameMap.has(student.studentId);
        console.log(`  Checking ${student.studentId}: hasName=${hasName}`);
        return hasName;
      }) // Only include students with names (active students)
      .map(student => {
      // Create month status array for visualization
      const monthStatuses = student.invoices
        .sort((a, b) => (a.metadata?.monthNumber || 0) - (b.metadata?.monthNumber || 0))
        .map(inv => {
          const monthNumber = inv.metadata?.monthNumber || 0;
          const isUnlocked = monthNumber <= currentEthiopianMonth;
          
          return {
            monthNumber,
            month: inv.metadata?.month || 'Unknown',
            status: inv.status,
            isUnlocked,
            isPaid: inv.status === 'PAID',
            paidDate: inv.paymentAllocations && inv.paymentAllocations.length > 0 
              ? inv.paymentAllocations[0].payment.paymentDate 
              : null
          };
        });

      // Get exemption status
      const studentInfo = studentNameMap.get(student.studentId);
      const isFree = studentInfo?.is_free || false;

      // Determine student status based on payment of ALL months (including locked)
      let studentStatus;
      
      // If student is exempt, mark as EXEMPT
      if (isFree) {
        studentStatus = 'EXEMPT';
      } else {
        const allMonthsPaid = student.invoices.every(inv => inv.status === 'PAID');
        const unlockedMonthsPaid = student.invoices
          .filter(inv => (inv.metadata?.monthNumber || 0) <= currentEthiopianMonth)
          .every(inv => inv.status === 'PAID');
        const hasAnyUnlockedUnpaid = student.invoices
          .filter(inv => (inv.metadata?.monthNumber || 0) <= currentEthiopianMonth)
          .some(inv => inv.status !== 'PAID');

        if (allMonthsPaid) {
          studentStatus = 'PAID'; // All months paid (including locked)
        } else if (unlockedMonthsPaid) {
          studentStatus = 'PARTIAL'; // Only unlocked months paid
        } else if (hasAnyUnlockedUnpaid) {
          studentStatus = 'UNPAID'; // Has unpaid unlocked months
        } else {
          studentStatus = 'PENDING'; // No unlocked months yet
        }
      }

      return {
        ...student,
        studentName: studentInfo?.name || 'Unknown',
        is_free: isFree,
        exemption_type: studentInfo?.exemption_type || null,
        exemption_reason: studentInfo?.exemption_reason || null,
        monthStatuses,
        status: studentStatus
      };
    });

    // Separate paying and free students
    const payingStudents = students.filter(s => !s.is_free);
    const freeStudents = students.filter(s => s.is_free);

    // Calculate summary (ONLY paying students - exclude free students from financial totals)
    const summary = {
      className: className,
      totalStudents: students.length,
      freeStudents: freeStudents.length,
      payingStudents: payingStudents.length,
      paidCount: payingStudents.filter(s => s.status === 'PAID').length, // All months paid
      partialCount: payingStudents.filter(s => s.status === 'PARTIAL').length, // Only unlocked paid
      unpaidCount: payingStudents.filter(s => s.status === 'UNPAID').length, // Has unpaid unlocked
      totalAmount: payingStudents.reduce((sum, s) => sum + s.totalAmount, 0), // All months - paying only
      totalPaid: payingStudents.reduce((sum, s) => sum + s.totalPaid, 0), // All months - paying only
      totalPending: payingStudents.reduce((sum, s) => sum + s.totalBalance, 0), // All months - paying only
      unlockedTotalAmount: payingStudents.reduce((sum, s) => sum + s.unlockedTotalAmount, 0), // Unlocked only - paying only
      unlockedTotalPaid: payingStudents.reduce((sum, s) => sum + s.unlockedTotalPaid, 0), // Unlocked only - paying only
      unlockedTotalPending: payingStudents.reduce((sum, s) => sum + s.unlockedTotalBalance, 0) // Unlocked only - paying only
    };

    // Log for debugging
    console.log(`\n📊 Monthly Payments Summary for ${className}:`);
    console.log(`   Total Students: ${summary.totalStudents}`);
    console.log(`   Free Students (Exempt): ${summary.freeStudents}`);
    console.log(`   Paying Students: ${summary.payingStudents}`);
    console.log(`   Unlocked Total Amount (Paying Only): ${summary.unlockedTotalAmount.toFixed(2)} Birr`);
    console.log(`   Unlocked Total Paid (Paying Only): ${summary.unlockedTotalPaid.toFixed(2)} Birr`);
    console.log(`   Unlocked Total Pending (Paying Only): ${summary.unlockedTotalPending.toFixed(2)} Birr`);
    console.log(`   Students in response: ${students.length}`);
    console.log(`   Student names: ${students.map(s => s.studentName).join(', ')}\n`);

    res.json({
      summary,
      students
    });

  } catch (error) {
    console.error('Error fetching class details:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch class details',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/student/:studentId
 * Get detailed invoice breakdown for a specific student
 */
router.get('/student/:studentId', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { feeStructureId } = req.query;

    const where = {
      studentId: studentId
    };

    if (feeStructureId) {
      where.feeStructureId = feeStructureId;
    }

    // Get all invoices for this student
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        items: true,
        paymentAllocations: {
          include: { payment: true },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: {
        dueDate: 'asc'
      }
    });

    if (invoices.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No invoices found for this student'
      });
    }

    // Calculate totals
    const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount), 0);
    const totalBalance = totalAmount - totalPaid;

    // Get active late fee rules for calculating multiple due dates
    const lateFeeRules = await prisma.lateFeeRule.findMany({
      where: { isActive: true },
      orderBy: { gracePeriodDays: 'asc' }
    });

    // Format invoices with month info and multiple due dates
    const formattedInvoices = invoices.map(invoice => {
      const monthNumber = invoice.metadata?.monthNumber || 0;
      
      // Calculate multiple due dates based on active late fee rules
      let multipleDueDates = [];
      if (monthNumber > 0 && lateFeeRules.length > 0) {
        // FIX: use the accurate Ethiopian calendar utility (no hardcoded dates)
        const { toEthiopian, toGregorian } = require('../utils/ethiopianCalendar');
        const ethNow = toEthiopian(new Date());
        const monthStartDate = toGregorian(ethNow.year, monthNumber, 1);
        // Normalize to NOON local time so the date displays correctly in any timezone
        monthStartDate.setHours(12, 0, 0, 0);

        multipleDueDates = lateFeeRules.map(rule => {
          const dueDate = new Date(monthStartDate);
          dueDate.setDate(dueDate.getDate() + rule.gracePeriodDays);
          return {
            dueDate: dueDate,
            gracePeriodDays: rule.gracePeriodDays,
            ruleName: rule.name,
            penaltyValue: rule.value
          };
        });
      }

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceRefCode: invoice.invoiceRefCode, // 10-digit reference code for voucher lookup
        receiptNumber: invoice.receiptNumber, // Add receipt number
        month: invoice.metadata?.month || 'Unknown',
        monthNumber: monthNumber,
        monthIndex: invoice.metadata?.monthIndex || 0,
        amount: parseFloat(invoice.totalAmount),
        lateFeeAmount: parseFloat(invoice.lateFeeAmount),
        discountAmount: parseFloat(invoice.discountAmount),
        netAmount: parseFloat(invoice.netAmount), // Total + Late Fee - Discount
        paidAmount: parseFloat(invoice.paidAmount),
        balance: parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount), // Use netAmount instead of totalAmount
        status: invoice.status,
        dueDate: invoice.dueDate,
        multipleDueDates: multipleDueDates, // Add multiple due dates
        issueDate: invoice.issueDate,
        isOverdue: new Date() > new Date(invoice.dueDate) && invoice.status !== 'PAID',
        oldRegistrationFee: invoice.metadata?.oldRegistrationFee,
        newRegistrationFee: invoice.metadata?.newRegistrationFee,
        studentType: invoice.metadata?.studentType || 'new',
        registrationFee: invoice.metadata?.registrationFee || 0,
        paidDate: invoice.paymentAllocations && invoice.paymentAllocations.length > 0 
          ? invoice.paymentAllocations[0].payment.paymentDate 
          : null
      };
    });

    res.json({
      studentId,
      totalInvoices: invoices.length,
      totalAmount,
      totalPaid,
      totalBalance,
      unpaidMonths: formattedInvoices.filter(inv => inv.balance > 0).length,
      invoices: formattedInvoices
    });

  } catch (error) {
    console.error('Error fetching student details:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch student details',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/student/:studentId/payment-history
 * Get payment history with transaction details for a student
 */
router.get('/student/:studentId/payment-history', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get all payments for this student
    const payments = await prisma.payment.findMany({
      where: {
        allocations: {
          some: {
            invoice: {
              studentId: studentId
            }
          }
        }
      },
      include: {
        allocations: {
          include: {
            invoice: true
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    const formattedPayments = payments.map(payment => ({
      id: payment.id,
      paymentDate: payment.paymentDate,
      amount: parseFloat(payment.amount),
      paymentMethod: payment.paymentMethod,
      reference: payment.referenceNumber,
      notes: payment.notes || '',
      screenshot: payment.screenshot,
      invoices: payment.allocations.map(alloc => ({
        invoiceNumber: alloc.invoice.invoiceNumber,
        month: alloc.invoice.metadata?.month || 'Unknown',
        amountAllocated: parseFloat(alloc.amount)
      })),
      totalAllocated: payment.allocations.reduce((sum, alloc) => sum + parseFloat(alloc.amount), 0)
    }));

    res.json({
      studentId,
      totalPayments: formattedPayments.length,
      payments: formattedPayments
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch payment history',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/reports/class-students-balance
 * Get class-wise student balance report
 */
router.get('/reports/class-students-balance', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const currentEthiopianMonth = getServerEthiopianMonth();

    // Get all active fee structures
    const feeStructures = await prisma.feeStructure.findMany({
      where: { isActive: true },
      include: { items: true }
    });

    const classReports = [];

    for (const feeStructure of feeStructures) {
      // Get all invoices for this class
      const invoices = await prisma.invoice.findMany({
        where: { feeStructureId: feeStructure.id }
      });

      // Group by student
      const studentMap = new Map();
      for (const invoice of invoices) {
        if (!studentMap.has(invoice.studentId)) {
          studentMap.set(invoice.studentId, {
            studentId: invoice.studentId,
            totalAmount: 0,
            totalPaid: 0,
            balance: 0
          });
        }
        const student = studentMap.get(invoice.studentId);
        student.totalAmount += parseFloat(invoice.totalAmount);
        student.totalPaid += parseFloat(invoice.paidAmount);
        student.balance += parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount);
      }

      const students = Array.from(studentMap.values());

      classReports.push({
        className: feeStructure.gradeLevel,
        totalStudents: students.length,
        totalAmount: students.reduce((sum, s) => sum + s.totalAmount, 0),
        totalPaid: students.reduce((sum, s) => sum + s.totalPaid, 0),
        totalBalance: students.reduce((sum, s) => sum + s.balance, 0),
        students: students
      });
    }

    res.json({
      reportDate: new Date(),
      classes: classReports,
      grandTotal: {
        totalStudents: classReports.reduce((sum, c) => sum + c.totalStudents, 0),
        totalAmount: classReports.reduce((sum, c) => sum + c.totalAmount, 0),
        totalPaid: classReports.reduce((sum, c) => sum + c.totalPaid, 0),
        totalBalance: classReports.reduce((sum, c) => sum + c.totalBalance, 0)
      }
    });

  } catch (error) {
    console.error('Error generating class students balance report:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to generate report',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/reports/multiple-monthly-payments
 * Get report of students who paid multiple months
 */
router.get('/reports/multiple-monthly-payments', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Get all payments
    const payments = await prisma.payment.findMany({
      where,
      include: {
        allocations: {
          include: {
            invoice: true
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    // Filter payments that covered multiple months
    const multipleMonthPayments = payments.filter(payment => {
      const uniqueMonths = new Set(
        payment.allocations.map(alloc => alloc.invoice.metadata?.month)
      );
      return uniqueMonths.size > 1;
    });

    const formattedPayments = multipleMonthPayments.map(payment => ({
      id: payment.id,
      studentId: payment.allocations[0]?.invoice.studentId,
      paymentDate: payment.paymentDate,
      amount: parseFloat(payment.amount),
      paymentMethod: payment.paymentMethod,
      reference: payment.referenceNumber,
      monthsCount: new Set(payment.allocations.map(alloc => alloc.invoice.metadata?.month)).size,
      months: [...new Set(payment.allocations.map(alloc => alloc.invoice.metadata?.month))],
      invoices: payment.allocations.map(alloc => ({
        invoiceNumber: alloc.invoice.invoiceNumber,
        month: alloc.invoice.metadata?.month,
        amountAllocated: parseFloat(alloc.amount)
      }))
    }));

    res.json({
      reportDate: new Date(),
      totalPayments: formattedPayments.length,
      totalAmount: formattedPayments.reduce((sum, p) => sum + p.amount, 0),
      payments: formattedPayments
    });

  } catch (error) {
    console.error('Error generating multiple monthly payments report:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to generate report',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/unpaid-students
 * Get detailed list of students with unpaid unlocked months
 */
router.get('/unpaid-students', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const currentEthiopianMonth = getServerEthiopianMonth();

    console.log('\n========================================');
    console.log('📋 FETCHING UNPAID STUDENTS DETAILS');
    console.log('========================================');
    console.log(`Current Ethiopian Month: ${currentEthiopianMonth}\n`);

    // The school fee year runs Meskerem (1) to Sene (10); months beyond Sene are not billed
    const REPORT_MONTH_LIMIT = 10;
    const reportMonth = Math.min(currentEthiopianMonth, REPORT_MONTH_LIMIT);

    // Get all active fee structures
    const feeStructures = await prisma.feeStructure.findMany({
      where: { isActive: true },
      include: { items: true }
    });

    const unpaidStudentsList = [];
    let creditTotal = 0;

    // Process each class
    for (const feeStructure of feeStructures) {
      const className = feeStructure.gradeLevel;
      console.log(`\n--- Processing Class ${className} ---`);

      // Get ACTIVE students from class table
      let activeStudentIds = new Set();
      let studentInfoMap = new Map();
      
      try {
        // Check if is_active, student_type, is_kg, is_evening_class columns exist
        const columnCheck = await prisma.$queryRawUnsafe(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = '${className}'
            AND column_name IN ('is_active', 'student_type', 'is_kg', 'is_evening_class')
        `);
        
        const columnNames = columnCheck.map(c => c.column_name);
        const hasIsActive = columnNames.includes('is_active');
        const hasStudentType = columnNames.includes('student_type');
        const hasIsKg = columnNames.includes('is_kg');
        const hasIsEvening = columnNames.includes('is_evening_class');
        
        let whereClause = hasIsActive ? 'WHERE is_active = TRUE OR is_active IS NULL' : 'WHERE 1=1';
        
        // V2 Enhancement: Add student type filter support
        const studentTypeFilter = req.query.studentType; // 'kg', 'evening', 'kg_evening', 'regular', or 'all'
        if (studentTypeFilter && studentTypeFilter !== 'all') {
          if (hasStudentType) {
            whereClause += ` AND student_type = '${studentTypeFilter}'`;
          } else if (hasIsKg && hasIsEvening) {
            // Fallback to individual columns
            if (studentTypeFilter === 'kg') {
              whereClause += ` AND is_kg = TRUE AND is_evening_class = FALSE`;
            } else if (studentTypeFilter === 'evening') {
              whereClause += ` AND is_evening_class = TRUE AND is_kg = FALSE`;
            } else if (studentTypeFilter === 'kg_evening') {
              whereClause += ` AND is_kg = TRUE AND is_evening_class = TRUE`;
            } else if (studentTypeFilter === 'regular') {
              whereClause += ` AND (is_kg = FALSE OR is_kg IS NULL) AND (is_evening_class = FALSE OR is_evening_class IS NULL)`;
            }
          }
        }
        
        const activeStudents = await prisma.$queryRawUnsafe(`
          SELECT school_id, class_id, student_name, is_free
          FROM classes_schema."${className}"
          ${whereClause}
        `);
        
        console.log(`Active students found: ${activeStudents.length}`);
        
        // Build UUID format student IDs and store student info
        for (const student of activeStudents) {
          const schoolIdPadded = String(student.school_id).padStart(4, '0');
          const classIdPadded = String(student.class_id).padStart(12, '0');
          const studentId = `00000000-0000-0000-${schoolIdPadded}-${classIdPadded}`;
          activeStudentIds.add(studentId);
          
          studentInfoMap.set(studentId, {
            name: student.student_name,
            is_free: student.is_free || false,
            class: className
          });
        }
      } catch (error) {
        console.error(`ERROR fetching students for ${className}:`, error.message);
        continue;
      }

      if (activeStudentIds.size === 0) {
        console.log(`No active students in ${className}, skipping...`);
        continue;
      }

      // Get ALL invoices for this class
      const allInvoices = await prisma.invoice.findMany({
        where: { feeStructureId: feeStructure.id },
        include: { items: true }
      });

      // Filter to ONLY active, PAYING student invoices (exclude free students)
      const activeInvoices = allInvoices.filter(inv => activeStudentIds.has(inv.studentId));
      const payingStudentInvoices = activeInvoices.filter(inv => {
        const studentInfo = studentInfoMap.get(inv.studentId);
        return studentInfo && !studentInfo.is_free;
      });

      // Group invoices by student
      const studentInvoiceMap = new Map();
      for (const invoice of payingStudentInvoices) {
        if (!studentInvoiceMap.has(invoice.studentId)) {
          studentInvoiceMap.set(invoice.studentId, []);
        }
        studentInvoiceMap.get(invoice.studentId).push(invoice);
      }

    // Find students with unpaid unlocked months
      for (const [studentId, invoices] of studentInvoiceMap.entries()) {
        const unlockedInvoices = invoices.filter(inv => {
          const monthNumber = inv.metadata?.monthNumber || 0;
          return monthNumber <= reportMonth;
        });

        // True outstanding balance: net minus paid across all unlocked months.
        // Over-payments on some months offset what is still owed on others.
        const balance = unlockedInvoices.reduce((sum, inv) =>
          sum + (parseFloat(inv.netAmount) - parseFloat(inv.paidAmount)), 0
        );

        if (balance > 0) {
          const studentInfo = studentInfoMap.get(studentId);
          const unpaidMonths = unlockedInvoices
            .filter(inv => parseFloat(inv.netAmount) - parseFloat(inv.paidAmount) > 0)
            .map(inv => inv.metadata?.monthNumber || 0)
            .filter(m => m > 0);

          unpaidStudentsList.push({
            student_name: studentInfo?.name || 'Unknown',
            class: studentInfo?.class || className,
            unpaid_months_count: unpaidMonths.length,
            total_pending: balance,
            unpaid_months: unpaidMonths.join(', ')
          });

          console.log(`  ⚠️ ${studentInfo?.name}: ${unpaidMonths.length} unpaid months, ${balance.toFixed(2)} Birr pending`);
        } else if (balance < 0) {
          // Over-collected beyond what is billed: counts as a credit
          creditTotal += -balance;
          console.log(`  💳 ${studentInfoMap.get(studentId)?.name || studentId}: over-payment credit ${(-balance).toFixed(2)} Birr`);
        }
      }
    }

    // Sort by total pending (highest first)
    unpaidStudentsList.sort((a, b) => b.total_pending - a.total_pending);

    const netTotalPending = unpaidStudentsList.reduce((s, x) => s + x.total_pending, 0) - creditTotal;

    console.log('\n========================================');
    console.log(`TOTAL UNPAID STUDENTS: ${unpaidStudentsList.length}`);
    console.log('========================================\n');

    res.json({
      currentMonth: currentEthiopianMonth,
      totalUnpaidStudents: unpaidStudentsList.length,
      creditTotal,
      netTotalPending,
      students: unpaidStudentsList
    });

  } catch (error) {
    console.error('ERROR in unpaid-students endpoint:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch unpaid students',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/monthly-payments-view/invoice-lookup/:refCode
 * Cross-branch invoice lookup by the 10-digit invoice reference code printed on the voucher.
 * Searches every branch database so an invoice created in IQRA2 is found from IQRA5.
 */
router.get('/invoice-lookup/:refCode', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  const { refCode } = req.params;

  // Validate: must be exactly 10 digits
  if (!/^\d{10}$/.test(refCode)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_CODE',
      message: 'This ID is not correct. Please enter a correct ID.'
    });
  }

  // Branch DBs to search (covers IQRA1..IQRA5). Master DB is included too.
  const branchDbs = ['iqrab1', 'iqrab2', 'iqrab3', 'iqrab4', 'iqrab5'];
  const branchCodes = ['IQRA1', 'IQRA2', 'IQRA3', 'IQRA4', 'IQRA5'];

  try {
    const { getPrismaForDb } = require('../services/BranchPrismaService');

    for (let i = 0; i < branchDbs.length; i++) {
      const dbName = branchDbs[i];
      const branchCode = branchCodes[i];

      let client;
      try {
        client = getPrismaForDb(dbName);
      } catch (e) {
        console.warn(`⚠️ Could not create Prisma client for ${dbName}: ${e.message}`);
        continue;
      }

      try {
        const invoice = await client.invoice.findUnique({
          where: { invoiceRefCode: refCode },
          include: {
            items: true,
            paymentAllocations: {
              include: { payment: true },
              orderBy: { createdAt: 'asc' }
            }
          }
        });

        if (!invoice) continue;

        // Resolve student name from classes_schema (same approach as class view)
        let studentName = null;
        let className = null;
        let isFree = false;
        let exemptionReason = null;
        try {
          const feeStructure = await client.feeStructure.findUnique({
            where: { id: invoice.feeStructureId },
            select: { gradeLevel: true }
          });
          className = feeStructure?.gradeLevel || null;

          if (className) {
            const parts = String(invoice.studentId).split('-');
            const schoolId = parseInt(parts[3] || '0', 10);
            const classId = parseInt(parts[4] || '0', 10);
            const rows = await client.$queryRawUnsafe(`
              SELECT student_name, is_free, exemption_reason
              FROM classes_schema."${className}"
              WHERE school_id = $1 AND class_id = $2
            `, schoolId, classId);

            if (rows && rows[0]) {
              studentName = rows[0].student_name;
              isFree = !!rows[0].is_free;
              exemptionReason = rows[0].exemption_reason;
            }
          }
        } catch (nameErr) {
          console.warn(`⚠️ Could not resolve student name in ${dbName}: ${nameErr.message}`);
          // Fallback: try the Prisma Student table
          try {
            const student = await client.student.findUnique({
              where: { id: invoice.studentId },
              select: { studentName: true }
            });
            studentName = student?.studentName || null;
          } catch (fallbackErr) {
            console.warn(`⚠️ Student fallback failed in ${dbName}: ${fallbackErr.message}`);
          }
        }

        // Determine payment info
        const paidAmount = parseFloat(invoice.paidAmount);
        const netAmount = parseFloat(invoice.netAmount);
        const payments = (invoice.paymentAllocations || []).map(alloc => ({
          receiptNumber: alloc.payment?.receiptNumber || null,
          paymentDate: alloc.payment?.paymentDate || null,
          amount: parseFloat(alloc.amount),
          paymentMethod: alloc.payment?.paymentMethod || null,
          reference: alloc.payment?.referenceNumber || alloc.payment?.reference || null
        }));

        return res.json({
          success: true,
          data: {
            branchCode,
            invoice: {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              invoiceRefCode: invoice.invoiceRefCode,
              receiptNumber: invoice.receiptNumber,
              status: invoice.status,
              month: invoice.metadata?.month || 'Unknown',
              monthNumber: invoice.metadata?.monthNumber || 0,
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              paidDate: payments.length > 0 ? payments[0].paymentDate : null,
              totalAmount: parseFloat(invoice.totalAmount),
              discountAmount: parseFloat(invoice.discountAmount),
              lateFeeAmount: parseFloat(invoice.lateFeeAmount),
              netAmount,
              paidAmount,
              balance: netAmount - paidAmount,
              items: invoice.items || []
            },
            student: {
              studentId: invoice.studentId,
              name: studentName || 'Unknown',
              className,
              isFree,
              exemptionReason
            },
            payments
          }
        });
      } catch (queryErr) {
        console.warn(`⚠️ Lookup failed in ${dbName}: ${queryErr.message}`);
        continue;
      }
    }

    // Not found in any branch
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'This ID is not correct. Please enter a correct ID.'
    });
  } catch (error) {
    console.error('Error in invoice lookup:', error);
    return res.status(500).json({
      success: false,
      error: 'SYSTEM_ERROR',
      message: 'Failed to look up the invoice. Please try again.',
      details: error.message
    });
  }
});

module.exports = router;
