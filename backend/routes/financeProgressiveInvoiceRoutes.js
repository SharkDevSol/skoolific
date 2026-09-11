const express = require('express');
const router = express.Router();
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const { branchPrisma: prisma } = require('../services/BranchPrismaService');
const { 
  calculateStudentBalance, 
  generateInvoiceWithBalance 
} = require('../services/balanceAccumulationService');

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * Convert composite student ID to UUID format
 */
function compositeIdToUuid(compositeId) {
  const parts = compositeId.split('-');
  if (parts.length !== 2) {
    throw new Error(`Invalid composite ID format: ${compositeId}`);
  }
  
  const schoolId = parts[0].padStart(4, '0');
  const classId = parts[1].padStart(12, '0');
  
  return `00000000-0000-0000-${schoolId}-${classId}`;
}

/**
 * GET /api/finance/progressive-invoices/current-month
 * Get the current month number for invoice generation (1-12)
 * This determines which invoice to show based on the academic year progress
 */
router.get('/current-month', authenticateWithBranch, async (req, res) => {
  try {
    const { feeStructureId } = req.query;

    if (!feeStructureId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'feeStructureId is required'
      });
    }

    // Get fee structure to find selected months
    const feeStructure = await prisma.feeStructure.findUnique({
      where: { id: feeStructureId }
    });

    if (!feeStructure) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Fee structure not found'
      });
    }

    // Parse months data from description
    let selectedMonths = [];
    try {
      let desc = feeStructure.description || '{}';
      desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const monthsData = JSON.parse(desc);
      selectedMonths = monthsData.months || [];
    } catch (error) {
      console.error('Error parsing months data:', error);
    }

    if (selectedMonths.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No months configured for this fee structure'
      });
    }

    // Sort months to get them in order
    selectedMonths.sort((a, b) => a - b);

    // Count how many invoices have been generated for this fee structure
    const invoiceCount = await prisma.invoice.count({
      where: {
        items: {
          some: {
            description: {
              contains: feeStructure.gradeLevel
            }
          }
        }
      }
    });

    // Calculate which month we're on (0-indexed)
    const currentMonthIndex = Math.min(invoiceCount, selectedMonths.length - 1);
    const currentMonth = selectedMonths[currentMonthIndex];

    res.json({
      data: {
        currentMonth,
        currentMonthIndex: currentMonthIndex + 1,
        totalMonths: selectedMonths.length,
        selectedMonths,
        invoiceCount
      }
    });

  } catch (error) {
    console.error('Error getting current month:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to get current month',
      details: error.message
    });
  }
});

/**
 * POST /api/finance/progressive-invoices/generate-all
 * Generate invoices for ALL selected months at once
 * - Creates invoices for all months in the fee structure
 * - Balance accumulates automatically each month
 * - Late fees apply to overdue invoices
 */
router.post('/generate-all', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_CREATE), async (req, res) => {
  try {
    const { feeStructureId, regenerate = false } = req.body;

    if (!feeStructureId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'feeStructureId is required'
      });
    }

    // Get fee structure
    const feeStructure = await prisma.feeStructure.findUnique({
      where: { id: feeStructureId },
      include: { items: true }
    });

    if (!feeStructure) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Fee structure not found'
      });
    }

    // Parse months data
    let selectedMonths = [];
    let description = 'Monthly tuition fee';
    let registrationFee = 0;
    let oldRegistrationFee = 0;
    let newRegistrationFee = 0;
    try {
      let desc = feeStructure.description || '{}';
      desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const monthsData = JSON.parse(desc);
      selectedMonths = monthsData.months || [];
      description = monthsData.description || description;
      // Backward compat: if old single registrationFee field exists, use it for both
      if (monthsData.registrationFee !== undefined) {
        registrationFee = parseFloat(monthsData.registrationFee) || 0;
        oldRegistrationFee = registrationFee;
        newRegistrationFee = registrationFee;
      } else {
        oldRegistrationFee = parseFloat(monthsData.oldRegistrationFee) || 0;
        newRegistrationFee = parseFloat(monthsData.newRegistrationFee) || 0;
        registrationFee = newRegistrationFee; // default to new for invoice amount
      }
    } catch (error) {
      console.error('Error parsing months data:', error);
    }

    if (selectedMonths.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No months configured for this fee structure'
      });
    }

    selectedMonths.sort((a, b) => a - b);

    // Get students for this class directly from database
    const pool = require('../config/db');
    
    // Validate className to prevent SQL injection
    const className = feeStructure.gradeLevel;
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid class name in fee structure'
      });
    }

    // Check if table exists
    const tableExists = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'classes_schema' AND table_name = $1
    `, [className]);

    if (tableExists.rows.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Class table '${className}' does not exist`
      });
    }

    // Get students from the class table
    const studentsResult = await pool.query(`
      SELECT 
        school_id,
        class_id,
        student_name,
        age,
        gender,
        guardian_name,
        guardian_phone
      FROM classes_schema."${className}"
      WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND student_name IS NOT NULL
      ORDER BY LOWER(student_name) ASC
    `);

    const students = studentsResult.rows.map(student => ({
      id: `${student.school_id}-${student.class_id}`,
      schoolId: student.school_id,
      classId: student.class_id,
      name: student.student_name,
      age: student.age,
      gender: student.gender,
      guardianName: student.guardian_name,
      guardianPhone: student.guardian_phone,
      className: className
    }));

    if (students.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No students found in this class'
      });
    }

    // Check which students already have invoices
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        feeStructureId: feeStructureId
      },
      select: {
        studentId: true
      },
      distinct: ['studentId']
    });

    const studentsWithInvoices = new Set(existingInvoices.map(inv => inv.studentId));
    
    // Filter to only students who don't have invoices yet
    const newStudents = students.filter(student => {
      const studentUuid = compositeIdToUuid(student.id);
      return !studentsWithInvoices.has(studentUuid);
    });

    // If regenerate flag is true, include all students and delete existing invoices
    let studentsToProcess = newStudents;
    
    if (regenerate && existingInvoices.length > 0) {
      console.log(`⚠️  REGENERATE MODE: Deleting ${existingInvoices.length} existing invoices...`);
      
      const allInvoices = await prisma.invoice.findMany({
        where: { feeStructureId: feeStructureId },
        select: { id: true }
      });
      
      const invoiceIds = allInvoices.map(inv => inv.id);
      
      await prisma.$transaction(async (tx) => {
        // Delete payment allocations
        await tx.paymentAllocation.deleteMany({
          where: { invoiceId: { in: invoiceIds } }
        });

        // Delete invoice items
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: { in: invoiceIds } }
        });

        // Delete invoices
        await tx.invoice.deleteMany({
          where: { feeStructureId: feeStructureId }
        });
      });

      console.log(`✅ Deleted all invoices for regeneration`);
      studentsToProcess = students; // Process all students
    } else if (newStudents.length === 0 && existingInvoices.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'All students already have invoices',
        details: `Found invoices for all ${students.length} students. Use regenerate option if you want to recreate them.`
      });
    }

    if (studentsToProcess.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No new students to generate invoices for'
      });
    }

    console.log(`📝 Generating invoices for ${studentsToProcess.length} students (${students.length - studentsToProcess.length} already have invoices)`);

    // Get active late fee rules to determine grace period
    const lateFeeRules = await prisma.lateFeeRule.findMany({
      where: { isActive: true },
      orderBy: { gracePeriodDays: 'desc' } // Get the one with longest grace period
    });

    // Use the grace period from the first active late fee rule (or default to 0)
    const gracePeriodDays = lateFeeRules.length > 0 ? lateFeeRules[0].gracePeriodDays : 0;

    // Ethiopian month names
    const ethiopianMonths = [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ];

    // Helper function to convert Ethiopian calendar to Gregorian and calculate due date
    // Uses the centralized Ethiopian calendar utility (leap-year + Pagume aware)
    const { toEthiopian, toGregorian } = require('../utils/ethiopianCalendar');
    const getEthiopianMonthDueDate = (monthNumber, gracePeriod) => {
      const ethNow = toEthiopian(new Date());
      const ethiopianYear = ethNow.year;
      
      // 1st day of the Ethiopian month in Gregorian calendar
      const monthStartDate = toGregorian(ethiopianYear, monthNumber, 1);
      // Normalize to NOON local time so the date displays correctly in any timezone
      monthStartDate.setHours(12, 0, 0, 0);
      
      // Due date = 1st of Ethiopian month + Grace period days
      const dueDate = new Date(monthStartDate);
      dueDate.setDate(dueDate.getDate() + gracePeriod);
      
      return dueDate;
    };

    // Calculate monthly amount
    const monthlyAmount = feeStructure.items.reduce((sum, item) => 
      sum + parseFloat(item.amount), 0
    );

    // Get account ID from first item
    const accountId = feeStructure.items[0]?.accountId;
    if (!accountId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No account ID found in fee structure'
      });
    }

    // Generate invoices for ALL months for ALL students
    let totalSuccessCount = 0;
    let totalErrorCount = 0;
    const errors = [];
    const monthlyResults = [];
    
    for (let monthIndex = 0; monthIndex < selectedMonths.length; monthIndex++) {
      const targetMonth = selectedMonths[monthIndex];
      const monthName = ethiopianMonths[targetMonth - 1];
      
      let monthSuccessCount = 0;
      let monthErrorCount = 0;

      // Calculate due date based on month start + grace period
      const dueDate = getEthiopianMonthDueDate(targetMonth, gracePeriodDays);

      for (const student of studentsToProcess) {
        try {
          // Convert composite ID to UUID format
          const studentId = compositeIdToUuid(student.id);

          // Create invoice number
          const invoiceNumber = `INV-${Date.now()}-${student.id.replace(/[^a-zA-Z0-9]/g, '')}-M${monthIndex + 1}`;

          // Generate unique 10-digit invoice reference code
          const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');
          const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
            const existing = await prisma.invoice.findUnique({ where: { invoiceRefCode: code } });
            return !!existing;
          });

          // Get academic year ID from fee structure
          const academicYearId = feeStructure.academicYearId;
          const campusId = feeStructure.campusId || '00000000-0000-0000-0000-000000000001';

          // Calculate invoice amount - add registration fee to first month only (default to newRegistrationFee)
          const isFirstMonth = monthIndex === 0;
          const invoiceAmount = isFirstMonth ? monthlyAmount + registrationFee : monthlyAmount;

          // Build invoice items
          const invoiceItems = [];
          
          // Add monthly fee item
          invoiceItems.push({
            description: `${monthName} Monthly Fee (Month ${monthIndex + 1} of ${selectedMonths.length})`,
            feeCategory: 'TUITION',
            amount: monthlyAmount,
            accountId: accountId
          });

          // Add registration fee item for first month only
          if (isFirstMonth && registrationFee > 0) {
            invoiceItems.push({
              description: 'Registration Fee (One-time)',
              feeCategory: 'TUITION',
              amount: registrationFee,
              accountId: accountId
            });
          }

          // Create the invoice
          const invoice = await prisma.invoice.create({
            data: {
              invoiceNumber: invoiceNumber,
              invoiceRefCode: invoiceRefCode,
              studentId: studentId,
              academicYearId: academicYearId,
              termId: null,
              feeStructureId: feeStructureId,
              issueDate: new Date(),
              dueDate: dueDate,
              totalAmount: invoiceAmount,
              discountAmount: 0,
              lateFeeAmount: 0,
              netAmount: invoiceAmount,
              paidAmount: 0,
              status: 'ISSUED',
              campusId: campusId,
              createdBy: '00000000-0000-0000-0000-' + String(req.user?.id || '000000000001').padStart(12, '0'),
              metadata: {
                month: monthName,
                monthNumber: targetMonth,
                monthIndex: monthIndex + 1,
                totalMonths: selectedMonths.length,
                oldRegistrationFee: isFirstMonth ? oldRegistrationFee : 0,
                newRegistrationFee: isFirstMonth ? newRegistrationFee : 0,
                isAutoGenerated: true,
                registrationFee: isFirstMonth ? registrationFee : 0
              },
              items: {
                create: invoiceItems
              }
            },
            include: {
              items: true
            }
          });

          monthSuccessCount++;
          totalSuccessCount++;

        } catch (error) {
          console.error(`Error creating invoice for ${student.name} - ${monthName}:`, error);
          monthErrorCount++;
          totalErrorCount++;
          errors.push(`${student.name} (${monthName}): ${error.message}`);
        }
      }

      monthlyResults.push({
        month: targetMonth,
        monthName: monthName,
        monthIndex: monthIndex + 1,
        successCount: monthSuccessCount,
        errorCount: monthErrorCount
      });
    }

    res.status(201).json({
      message: 'All invoices generated successfully',
      data: {
        totalMonths: selectedMonths.length,
        totalStudents: students.length,
        totalInvoices: totalSuccessCount,
        totalSuccessCount,
        totalErrorCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        monthlyResults: monthlyResults,
          summary: {
            message: regenerate 
              ? `Regenerated ${totalSuccessCount} invoices for ${studentsToProcess.length} students across ${selectedMonths.length} months`
              : `Generated ${totalSuccessCount} invoices for ${studentsToProcess.length} new students across ${selectedMonths.length} months`,
            monthlyFee: monthlyAmount,
            registrationFee: registrationFee,
            oldRegistrationFee: oldRegistrationFee,
            newRegistrationFee: newRegistrationFee,
            firstMonthTotal: monthlyAmount + registrationFee,
            firstMonthOldTotal: monthlyAmount + oldRegistrationFee,
            firstMonthNewTotal: monthlyAmount + newRegistrationFee,
            totalPerStudent: (monthlyAmount * selectedMonths.length) + registrationFee,
            balanceAccumulation: 'Automatic - unpaid amounts will accumulate each month with late fees',
            newStudents: studentsToProcess.length,
            existingStudents: students.length - studentsToProcess.length
          }
      }
    });

  } catch (error) {
    console.error('Error generating all invoices:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to generate invoices',
      details: error.message
    });
  }
});

module.exports = router;
