const express = require('express');
const router = express.Router();
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const { branchPrisma: prisma } = require('../services/BranchPrismaService');

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * GET /api/finance/monthly-payments/overview
 * Get monthly payment overview for all classes
 */
router.get('/overview', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { month, year, campusId } = req.query;

    // Default to current month/year if not provided
    const targetDate = new Date();
    const targetMonth = month ? parseInt(month) : targetDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : targetDate.getFullYear();

    // Calculate date range for the month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Build filter
    const where = {
      dueDate: {
        gte: startDate,
        lte: endDate
      }
    };

    if (campusId) {
      where.campusId = campusId;
    }

    // Get all invoices for the month
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        items: true
      }
    });

    // Get student information from your student table
    // Note: Adjust this based on your actual student table structure
    const studentIds = [...new Set(invoices.map(inv => inv.studentId))];
    
    // Group by class (you'll need to join with student table to get class info)
    const classPayments = {};
    
    for (const invoice of invoices) {
      // You'll need to fetch student class information
      // This is a placeholder - adjust based on your schema
      const classKey = 'Class A'; // Replace with actual class lookup
      
      if (!classPayments[classKey]) {
        classPayments[classKey] = {
          className: classKey,
          monthlyFee: 0,
          totalStudents: 0,
          paidStudents: 0,
          unpaidStudents: 0,
          partiallyPaidStudents: 0,
          totalCollected: 0,
          totalPending: 0,
          students: []
        };
      }

      const isPaid = invoice.status === 'PAID';
      const isPartial = invoice.status === 'PARTIALLY_PAID';
      const isUnpaid = invoice.status === 'ISSUED' || invoice.status === 'OVERDUE';

      classPayments[classKey].totalStudents++;
      if (isPaid) classPayments[classKey].paidStudents++;
      if (isPartial) classPayments[classKey].partiallyPaidStudents++;
      if (isUnpaid) classPayments[classKey].unpaidStudents++;
      
      classPayments[classKey].totalCollected += parseFloat(invoice.paidAmount);
      classPayments[classKey].totalPending += parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount);
      classPayments[classKey].monthlyFee = parseFloat(invoice.netAmount);

      classPayments[classKey].students.push({
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: parseFloat(invoice.netAmount),
        paidAmount: parseFloat(invoice.paidAmount),
        balance: parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount),
        status: invoice.status,
        dueDate: invoice.dueDate
      });
    }

    res.json({
      month: targetMonth,
      year: targetYear,
      summary: {
        totalClasses: Object.keys(classPayments).length,
        totalStudents: invoices.length,
        totalPaid: invoices.filter(i => i.status === 'PAID').length,
        totalUnpaid: invoices.filter(i => i.status === 'ISSUED' || i.status === 'OVERDUE').length,
        totalPartial: invoices.filter(i => i.status === 'PARTIALLY_PAID').length,
        totalCollected: invoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount), 0),
        totalPending: invoices.reduce((sum, inv) => sum + (parseFloat(inv.netAmount) - parseFloat(inv.paidAmount)), 0)
      },
      classes: Object.values(classPayments)
    });

  } catch (error) {
    console.error('Error getting monthly payment overview:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while fetching payment overview'
    });
  }
});

/**
 * GET /api/finance/monthly-payments/class/:className
 * Get detailed payment status for a specific class
 */
router.get('/class/:className', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { className } = req.params;
    const { month, year, campusId } = req.query;

    // Default to current month/year
    const targetDate = new Date();
    const targetMonth = month ? parseInt(month) : targetDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : targetDate.getFullYear();

    // Calculate date range
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Build filter
    const where = {
      dueDate: {
        gte: startDate,
        lte: endDate
      }
    };

    if (campusId) {
      where.campusId = campusId;
    }

    // Get invoices
    const invoices = await prisma.invoice.findMany({
      where,
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

    // Format response with student details
    const students = invoices.map(invoice => ({
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: parseFloat(invoice.netAmount),
      paidAmount: parseFloat(invoice.paidAmount),
      balance: parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount),
      status: invoice.status,
      dueDate: invoice.dueDate,
      issueDate: invoice.issueDate,
      paymentCount: invoice.paymentAllocations.length, // Number of payments made
      payments: invoice.paymentAllocations.map(alloc => ({
        paymentId: alloc.payment.id,
        receiptNumber: alloc.payment.receiptNumber,
        amount: parseFloat(alloc.amount),
        paymentDate: alloc.payment.paymentDate,
        paymentMethod: alloc.payment.paymentMethod
      })),
      items: invoice.items.map(item => ({
        description: item.description,
        amount: parseFloat(item.amount),
        feeCategory: item.feeCategory
      }))
    }));

    res.json({
      className,
      month: targetMonth,
      year: targetYear,
      summary: {
        totalStudents: students.length,
        paidCount: students.filter(s => s.status === 'PAID').length,
        unpaidCount: students.filter(s => s.status === 'ISSUED' || s.status === 'OVERDUE').length,
        partialCount: students.filter(s => s.status === 'PARTIALLY_PAID').length,
        totalCollected: students.reduce((sum, s) => sum + s.paidAmount, 0),
        totalPending: students.reduce((sum, s) => sum + s.balance, 0)
      },
      students
    });

  } catch (error) {
    console.error('Error getting class payment details:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while fetching class payment details'
    });
  }
});

/**
 * POST /api/finance/monthly-payments/record-payment
 * Record a payment for a student's monthly fee
 */
router.post('/record-payment', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.PAYMENTS_CREATE), async (req, res) => {
  try {
    const {
      invoiceId,
      amount,
      paymentMethod,
      paymentDate,
      referenceNumber,
      campusId
    } = req.body;

    // Validation
    if (!invoiceId || !amount || !paymentMethod || !paymentDate || !campusId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields',
        details: [
          { field: 'invoiceId', message: 'Invoice ID is required', code: 'REQUIRED_FIELD' },
          { field: 'amount', message: 'Amount is required', code: 'REQUIRED_FIELD' },
          { field: 'paymentMethod', message: 'Payment method is required', code: 'REQUIRED_FIELD' },
          { field: 'paymentDate', message: 'Payment date is required', code: 'REQUIRED_FIELD' },
          { field: 'campusId', message: 'Campus ID is required', code: 'REQUIRED_FIELD' }
        ].filter(d => 
          (!invoiceId && d.field === 'invoiceId') ||
          (!amount && d.field === 'amount') ||
          (!paymentMethod && d.field === 'paymentMethod') ||
          (!paymentDate && d.field === 'paymentDate') ||
          (!campusId && d.field === 'campusId')
        )
      });
    }

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Invoice not found'
      });
    }

    // Calculate remaining balance
    const remainingBalance = parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount);

    if (parseFloat(amount) > remainingBalance) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Payment amount exceeds remaining balance',
        details: {
          remainingBalance,
          attemptedAmount: amount
        }
      });
    }

    // Create payment and update invoice in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Generate receipt number
      const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Create payment
      const payment = await tx.payment.create({
        data: {
          receiptNumber,
          studentId: invoice.studentId,
          amount: parseFloat(amount),
          paymentMethod,
          paymentDate: new Date(paymentDate),
          referenceNumber: referenceNumber || null,
          status: 'COMPLETED',
          campusId,
          createdBy: req.user.id
        }
      });

      // Create payment allocation
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          amount: parseFloat(amount)
        }
      });

      // Update invoice
      const newPaidAmount = parseFloat(invoice.paidAmount) + parseFloat(amount);
      const newStatus = newPaidAmount >= parseFloat(invoice.netAmount) ? 'PAID' : 'PARTIALLY_PAID';

      const invoiceUpdate = {
        paidAmount: newPaidAmount,
        status: newStatus
      };

      // FIX: Assign the sequential per-branch voucher number at PAYMENT time
      if (newStatus === 'PAID' && !invoice.receiptNumber) {
        const fs = require('fs');
        const path = require('path');
        const counterFile = path.join(__dirname, `../uploads/receipt-counter-${req.branchCode}.json`);
        let lastNumber = 0;
        if (fs.existsSync(counterFile)) {
          try { lastNumber = JSON.parse(fs.readFileSync(counterFile, 'utf8')).lastNumber || 0; } catch (e) { lastNumber = 0; }
        }
        const nextNumber = lastNumber + 1;
        const voucherNumber = String(nextNumber).padStart(6, '0');
        fs.writeFileSync(counterFile, JSON.stringify({ lastNumber: nextNumber }), 'utf8');

        const mappingFile = path.join(__dirname, `../uploads/invoice-receipt-mapping-${req.branchCode}.json`);
        let mapping = {};
        if (fs.existsSync(mappingFile)) {
          try { mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8')); } catch (e) { mapping = {}; }
        }
        mapping[invoiceId] = voucherNumber;
        fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf8');

        invoiceUpdate.receiptNumber = voucherNumber;
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: invoiceUpdate
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'Payment',
          entityId: payment.id,
          action: 'CREATE',
          userId: req.user.id,
          newValue: payment,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return { payment, invoice: updatedInvoice };
    });

    res.status(201).json({
      message: 'Payment recorded successfully',
      data: result
    });

  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while recording payment'
    });
  }
});

/**
 * GET /api/finance/monthly-payments/unpaid-report
 * Get report of all unpaid students
 */
router.get('/unpaid-report', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.REPORTS_VIEW), async (req, res) => {
  try {
    const { month, year, campusId, className } = req.query;

    // Default to current month/year
    const targetDate = new Date();
    const targetMonth = month ? parseInt(month) : targetDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : targetDate.getFullYear();

    // Calculate date range
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Build filter
    const where = {
      dueDate: {
        gte: startDate,
        lte: endDate
      },
      status: {
        in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID']
      }
    };

    if (campusId) {
      where.campusId = campusId;
    }

    // Get unpaid invoices
    const unpaidInvoices = await prisma.invoice.findMany({
      where,
      include: {
        items: true
      },
      orderBy: [
        { dueDate: 'asc' },
        { studentId: 'asc' }
      ]
    });

    // Format report
    const report = unpaidInvoices.map(invoice => ({
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: parseFloat(invoice.netAmount),
      paidAmount: parseFloat(invoice.paidAmount),
      balance: parseFloat(invoice.netAmount) - parseFloat(invoice.paidAmount),
      status: invoice.status,
      dueDate: invoice.dueDate,
      daysOverdue: invoice.status === 'OVERDUE' ? 
        Math.floor((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24)) : 0,
      items: invoice.items.map(item => ({
        description: item.description,
        amount: parseFloat(item.amount),
        feeCategory: item.feeCategory
      }))
    }));

    res.json({
      month: targetMonth,
      year: targetYear,
      summary: {
        totalUnpaid: report.length,
        totalAmountDue: report.reduce((sum, r) => sum + r.balance, 0),
        overdueCount: report.filter(r => r.status === 'OVERDUE').length,
        partiallyPaidCount: report.filter(r => r.status === 'PARTIALLY_PAID').length
      },
      students: report
    });

  } catch (error) {
    console.error('Error generating unpaid report:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while generating unpaid report'
    });
  }
});

/**
 * GET /api/finance/monthly-payments/paid-report
 * Get report of all paid students
 */
router.get('/paid-report', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.REPORTS_VIEW), async (req, res) => {
  try {
    const { month, year, campusId } = req.query;

    // Default to current month/year
    const targetDate = new Date();
    const targetMonth = month ? parseInt(month) : targetDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : targetDate.getFullYear();

    // Calculate date range
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Build filter
    const where = {
      dueDate: {
        gte: startDate,
        lte: endDate
      },
      status: 'PAID'
    };

    if (campusId) {
      where.campusId = campusId;
    }

    // Get paid invoices
    const paidInvoices = await prisma.invoice.findMany({
      where,
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

    // Format report
    const report = paidInvoices.map(invoice => ({
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: parseFloat(invoice.netAmount),
      paidAmount: parseFloat(invoice.paidAmount),
      dueDate: invoice.dueDate,
      payments: invoice.paymentAllocations.map(alloc => ({
        receiptNumber: alloc.payment.receiptNumber,
        amount: parseFloat(alloc.amount),
        paymentDate: alloc.payment.paymentDate,
        paymentMethod: alloc.payment.paymentMethod,
        referenceNumber: alloc.payment.referenceNumber
      })),
      items: invoice.items.map(item => ({
        description: item.description,
        amount: parseFloat(item.amount),
        feeCategory: item.feeCategory
      }))
    }));

    res.json({
      month: targetMonth,
      year: targetYear,
      summary: {
        totalPaid: report.length,
        totalAmountCollected: report.reduce((sum, r) => sum + r.paidAmount, 0)
      },
      students: report
    });

  } catch (error) {
    console.error('Error generating paid report:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while generating paid report'
    });
  }
});

module.exports = router;
