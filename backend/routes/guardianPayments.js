const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const db = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

/**
 * GET /api/guardian-payments/:guardianUsername
 * Get payment information for all wards of a guardian
 */
router.get('/:guardianUsername', async (req, res) => {
  try {
    const { guardianUsername } = req.params;
    
    // Get all class tables
    const tablesResult = await db.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', 
      ['classes_schema']
    );
    
    const classes = tablesResult.rows.map(row => row.table_name);
    const wards = [];
    
    // Find all wards for this guardian
    for (const className of classes) {
      try {
        // Check if is_active column exists
        const columnsCheck = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = $1 
            AND column_name = 'is_active'
        `, [className]);
        
        const hasIsActive = columnsCheck.rows.length > 0;
        
        // Build query with conditional is_active filter
        const whereClause = hasIsActive 
          ? `WHERE guardian_username = $1 AND (is_active = TRUE OR is_active IS NULL)`
          : `WHERE guardian_username = $1`;
        
        const result = await db.query(`
          SELECT 
            id,
            student_name,
            school_id,
            class_id,
            class
          FROM classes_schema."${className}"
          ${whereClause}
        `, [guardianUsername]);
        
        wards.push(...result.rows.map(row => ({
          ...row,
          class: row.class || className
        })));
      } catch (err) {
        console.warn(`Error fetching from ${className}:`, err.message);
      }
    }
    
    if (wards.length === 0) {
      return res.json({
        success: true,
        data: {
          wards: [],
          payments: [],
          unpaidCount: 0
        }
      });
    }
    
    // Get payment data for each ward
    const paymentData = [];
    let totalUnpaidCount = 0;
    
    for (const ward of wards) {
      // Convert school_id and class_id to the student UUID used in invoices.
      // Format: 00000000-0000-0000-{schoolId padded 4}-{classId padded 12}.
      // This MUST match studentRoutes.js / financeFeeStructureRoutes.js which build
      // the same UUID as `{schoolId}-{classId}` (NOT `{schoolId}-{id}`).
      const schoolIdNum = parseInt(ward.school_id);
      const classIdNum = parseInt(ward.class_id);
      const studentId = `00000000-0000-0000-${String(schoolIdNum).padStart(4, '0')}-${String(classIdNum).padStart(12, '0')}`;
      
      console.log(`Processing ward: ${ward.student_name}, studentId: ${studentId}`);
      
      // Get all invoices for this student
      const invoices = await prisma.invoice.findMany({
        where: {
          studentId: studentId
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
          issueDate: 'desc'
        }
      });
      
      console.log(`Found ${invoices.length} invoices for ${ward.student_name}`);
      
      // Get current Ethiopian month to filter unlocked invoices — MUST match the
      // admin finance page exactly. Source of truth: getServerEthiopianMonth() in
      // financeMonthlyPaymentViewRoutes.js. Ethiopia is UTC+3; before the 2019 school
      // year starts (i.e. Ethiopian year still 2018) only Meskerem (month 1) is unlocked.
      const ethiopianCalendar = require('../utils/ethiopianCalendar');
      const shifted = new Date(Date.now() + 3 * 3600 * 1000);
      const ethiopiaLocal = new Date(Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        12, 0, 0
      ));
      const eth = ethiopianCalendar.toEthiopian(ethiopiaLocal);
      const currentEthiopianMonth = eth.year < 2019 ? 1 : eth.month;
      
      // Process invoices to get monthly payment details.
      // Show: (1) every PAID month as full payment history, AND (2) unlocked-but-unpaid
      // months that are currently due. Locked unpaid months stay hidden (not yet due).
      const monthlyPayments = invoices
        .filter(invoice => {
          const monthNumber = invoice.metadata?.monthNumber;
          if (!monthNumber) return false;
          const isUnlocked = monthNumber <= currentEthiopianMonth;
          const isPaid = invoice.status === 'PAID';
          return isUnlocked || isPaid;
        })
        .map(invoice => {
        const totalAmount = parseFloat(invoice.netAmount);
        const paidAmount = parseFloat(invoice.paidAmount);
        const balance = totalAmount - paidAmount;
        const isPaid = invoice.status === 'PAID';
        const isOverdue = invoice.status === 'OVERDUE' || 
                         (new Date() > new Date(invoice.dueDate) && balance > 0);
        
        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          receiptNumber: invoice.receiptNumber,
          month: invoice.metadata?.month || 'Unknown',
          monthNumber: invoice.metadata?.monthNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          totalAmount,
          paidAmount,
          balance,
          status: invoice.status,
          isPaid,
          isOverdue,
          items: invoice.items.map(item => ({
            description: item.description,
            amount: parseFloat(item.amount),
            feeCategory: item.feeCategory
          })),
          payments: invoice.paymentAllocations.map(alloc => ({
            amount: parseFloat(alloc.amount),
            paymentDate: alloc.payment.paymentDate,
            paymentMethod: alloc.payment.paymentMethod,
            receiptNumber: alloc.payment.receiptNumber
          }))
        };
      });
      
      const unpaidInvoices = monthlyPayments.filter(p => !p.isPaid);
      totalUnpaidCount += unpaidInvoices.length;
      
      // ALWAYS add ward to paymentData, even if they have no invoices
      paymentData.push({
        ward: {
          studentName: ward.student_name,
          schoolId: ward.school_id,
          classId: ward.class_id,
          class: ward.class
        },
        monthlyPayments,
        hasInvoices: invoices.length > 0,
        summary: {
          totalInvoices: monthlyPayments.length,
          paidInvoices: monthlyPayments.filter(p => p.isPaid).length,
          unpaidInvoices: unpaidInvoices.length,
          totalPaid: monthlyPayments.reduce((sum, p) => sum + p.paidAmount, 0),
          // Balance Due = outstanding on UNPAID (unlocked) invoices only.
          // Exclude paid invoices (which may carry negative/overpayment balance).
          totalBalance: unpaidInvoices.reduce((sum, p) => sum + p.balance, 0),
          overdueInvoices: monthlyPayments.filter(p => p.isOverdue).length
        }
      });
      
      console.log(`Added payment data for ${ward.student_name}: ${monthlyPayments.length} payments`);
    }
    
    console.log(`Total wards processed: ${wards.length}, Total payment data items: ${paymentData.length}`);
    
    res.json({
      success: true,
      data: {
        wards: wards.map(w => ({
          studentName: w.student_name,
          schoolId: w.school_id,
          classId: w.class_id,
          class: w.class
        })),
        payments: paymentData,
        unpaidCount: totalUnpaidCount,
        hasUnpaidInvoices: totalUnpaidCount > 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching guardian payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment information',
      details: error.message
    });
  }
});

module.exports = router;
