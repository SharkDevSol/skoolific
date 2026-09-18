const express = require('express');
const router = express.Router();
const { branchPrisma: prisma } = require('../services/BranchPrismaService');
const multer = require('multer');
const path = require('path');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Configure multer for screenshot uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/payment-screenshots/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * POST /api/finance/payments
 * Record a payment for an invoice
 */
router.post('/', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.PAYMENTS_CREATE), ...branchSafeUpload(upload.single('screenshot')), async (req, res) => {
  try {
    const {
      invoiceId,
      amount,
      paymentMethod,
      paymentDate,
      reference,
      notes,
      registrationFeeType
    } = req.body;

    const screenshot = req.file ? req.file.path : null;

    // Validate required fields
    if (!invoiceId || !amount || !paymentMethod || !paymentDate) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: invoiceId, amount, paymentMethod, paymentDate'
      });
    }

    // Get the invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Invoice not found'
      });
    }

    // If registration fee type is specified, adjust invoice netAmount.
    // Recompute from the fee ACTUALLY applied (metadata.studentType) so switching
    // old<->new is correct for invoices generated under either fee.
    let adjustedNetAmount = parseFloat(invoice.netAmount);
    if (registrationFeeType === 'old' || registrationFeeType === 'new') {
      const meta = invoice.metadata || {};
      const oldReg = parseFloat(meta.oldRegistrationFee) || 0;
      const newReg = parseFloat(meta.newRegistrationFee) || 0;
      const appliedType = meta.studentType || 'new';
      const appliedReg = appliedType === 'old' ? oldReg : newReg;
      const targetReg = registrationFeeType === 'old' ? oldReg : newReg;
      if (appliedReg !== targetReg) {
        adjustedNetAmount = adjustedNetAmount - appliedReg + targetReg;
      }
    }

    // Calculate remaining balance based on possibly adjusted netAmount
    const remainingBalance = adjustedNetAmount - parseFloat(invoice.paidAmount);
    const paymentAmount = parseFloat(amount);

    if (paymentAmount <= 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Payment amount must be greater than zero'
      });
    }

    if (paymentAmount > remainingBalance) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Payment amount ($${paymentAmount}) exceeds remaining balance ($${remainingBalance})`
      });
    }

    // Generate receipt number
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;
    
    const latestPayment = await prisma.payment.findFirst({
      where: {
        receiptNumber: { startsWith: prefix }
      },
      orderBy: { receiptNumber: 'desc' }
    });
    
    let nextNumber = 1;
    if (latestPayment) {
      const currentNumber = parseInt(latestPayment.receiptNumber.split('-')[2]);
      nextNumber = currentNumber + 1;
    }
    
    const receiptNumber = `${prefix}${nextNumber.toString().padStart(6, '0')}`;

    // Create payment and allocation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Persist the adjusted registration-fee amount (and remember the applied type)
      if (registrationFeeType === 'old' || registrationFeeType === 'new') {
        const meta = invoice.metadata || {};
        const oldReg = parseFloat(meta.oldRegistrationFee) || 0;
        const newReg = parseFloat(meta.newRegistrationFee) || 0;
        const appliedType = meta.studentType || 'new';
        const appliedReg = appliedType === 'old' ? oldReg : newReg;
        const targetReg = registrationFeeType === 'old' ? oldReg : newReg;
        if (appliedReg !== targetReg) {
          // Update both totalAmount and netAmount so displayed amounts are consistent
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: adjustedNetAmount,
              netAmount: adjustedNetAmount,
              metadata: { ...meta, registrationFeeApplied: registrationFeeType, studentType: registrationFeeType }
            }
          });
        } else {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { metadata: { ...meta, registrationFeeApplied: registrationFeeType } }
          });
        }
      }

      // Create payment
      const payment = await tx.payment.create({
        data: {
          receiptNumber,
          studentId: invoice.studentId,
          amount: paymentAmount,
          paymentMethod,
          paymentDate: new Date(paymentDate),
          referenceNumber: reference || null,
          screenshot: screenshot || null,
          status: 'COMPLETED',
          campusId: invoice.campusId,
          createdBy: '00000000-0000-0000-0000-' + String(req.user.id).padStart(12, '0')
        }
      });

      // Create payment allocation
      const allocation = await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          amount: paymentAmount
        }
      });

      // Update invoice paid amount and status
      const newPaidAmount = parseFloat(invoice.paidAmount) + paymentAmount;
      const newStatus = newPaidAmount >= adjustedNetAmount 
        ? 'PAID' 
        : 'PARTIALLY_PAID';

      // If invoice is fully paid, assign the receipt number to the invoice
      const updateData = {
        paidAmount: newPaidAmount,
        status: newStatus
      };

      // Only assign receipt number if invoice is being fully paid and doesn't have one yet
      if (newStatus === 'PAID' && !invoice.receiptNumber) {
        // FIX: Assign the sequential per-branch voucher number at PAYMENT time
        // (not at view/print time), so numbers follow payment order — not click order.
        const fs = require('fs');
        const path = require('path');
        const counterFile = path.join(__dirname, `../uploads/receipt-counter-${req.branchCode}.json`);
        let lastNumber = 0;
        if (fs.existsSync(counterFile)) {
          try { lastNumber = JSON.parse(fs.readFileSync(counterFile, 'utf8')).lastNumber || 0; } catch (e) { lastNumber = 0; }
        }
        const nextNumber = lastNumber + 1;
        const voucherNumber = String(nextNumber).padStart(6, '0'); // 000001, 000002, ...

        // Save the counter
        fs.writeFileSync(counterFile, JSON.stringify({ lastNumber: nextNumber }), 'utf8');

        // Save in the invoice-receipt mapping so the receipt view finds it immediately
        const mappingFile = path.join(__dirname, `../uploads/invoice-receipt-mapping-${req.branchCode}.json`);
        let mapping = {};
        if (fs.existsSync(mappingFile)) {
          try { mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8')); } catch (e) { mapping = {}; }
        }
        mapping[invoice.id] = voucherNumber;
        fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf8');

        updateData.receiptNumber = voucherNumber;
      }

      // Legacy invoices may lack the 10-digit reference code — assign one at payment time
      if (!invoice.invoiceRefCode) {
        const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');
        const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
          const existing = await tx.invoice.findUnique({ where: { invoiceRefCode: code } });
          return !!existing;
        });
        updateData.invoiceRefCode = invoiceRefCode;
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: updateData
      });

      return { payment, allocation, invoice: updatedInvoice };
    });

    res.status(201).json({
      message: 'Payment recorded successfully',
      data: result
    });

    // ---- Send payment SMS notification to guardian (non-blocking) ----
    try {
      if (result.invoice.status === 'PAID') {
        processPaymentSms(result.invoice, paymentAmount, paymentDate);
      }
    } catch (smsErr) {
      console.warn('Payment SMS notification failed (non-blocking):', smsErr.message);
    }

  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while recording payment',
      details: error.message
    });
  }
});

/**
 * POST /api/finance/payments/multi
 * Record a payment covering MULTIPLE invoices (e.g. several months at once).
 * - Creates ONE payment + ONE sequential receipt number for the whole batch
 * - Creates a payment allocation per invoice
 * - Updates each invoice's paidAmount/status
 * - Sends ONE SMS with the total amount + all paid months
 */
router.post('/multi', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.PAYMENTS_CREATE), async (req, res) => {
  try {
    const {
      invoiceIds,
      amounts,
      paymentMethod,
      paymentDate,
      reference,
      notes,
      registrationFeeType
    } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invoiceIds array is required' });
    }
    if (!amounts || !Array.isArray(amounts) || amounts.length !== invoiceIds.length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'amounts must match invoiceIds' });
    }
    if (!paymentMethod || !paymentDate) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: paymentMethod, paymentDate'
      });
    }

    // Load all invoices
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } }
    });

    if (invoices.length !== invoiceIds.length) {
      const found = new Set(invoices.map(i => i.id));
      const missing = invoiceIds.filter(id => !found.has(id));
      return res.status(404).json({ error: 'NOT_FOUND', message: `Invoices not found: ${missing.join(', ')}` });
    }

    // All invoices must belong to the same student (multi-month = same student)
    const studentId = invoices[0].studentId;
    if (invoices.some(inv => inv.studentId !== studentId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'All invoices must belong to the same student'
      });
    }

    // Validate amounts per invoice
    const paymentsData = invoices.map((invoice, idx) => {
      const amount = parseFloat(amounts[idx]);
      if (!amount || amount <= 0) {
        throw new Error(`Invalid amount for invoice ${invoice.invoiceNumber}`);
      }
      let adjustedNetAmount = parseFloat(invoice.netAmount);
      if (registrationFeeType === 'old' || registrationFeeType === 'new') {
        const meta = invoice.metadata || {};
        const oldReg = parseFloat(meta.oldRegistrationFee) || 0;
        const newReg = parseFloat(meta.newRegistrationFee) || 0;
        const appliedType = meta.studentType || 'new';
        const appliedReg = appliedType === 'old' ? oldReg : newReg;
        const targetReg = registrationFeeType === 'old' ? oldReg : newReg;
        if (appliedReg !== targetReg) adjustedNetAmount = adjustedNetAmount - appliedReg + targetReg;
      }
      const remainingBalance = adjustedNetAmount - parseFloat(invoice.paidAmount);
      if (amount > remainingBalance) {
        throw new Error(`Payment amount for ${invoice.invoiceNumber} exceeds remaining balance`);
      }
      return { invoice, amount, adjustedNetAmount };
    });

    const totalAmount = paymentsData.reduce((sum, p) => sum + p.amount, 0);

    // Sequential per-branch receipt number (same counter as single payments).
    // Only persisted AFTER the transaction succeeds (see below).
    const fs = require('fs');
    const counterFile = path.join(__dirname, `../uploads/receipt-counter-${req.branchCode}.json`);
    const mappingFile = path.join(__dirname, `../uploads/invoice-receipt-mapping-${req.branchCode}.json`);
    let lastNumber = 0;
    if (fs.existsSync(counterFile)) {
      try { lastNumber = JSON.parse(fs.readFileSync(counterFile, 'utf8')).lastNumber || 0; } catch (e) { lastNumber = 0; }
    }
    const nextNumber = lastNumber + 1;
    const voucherNumber = String(nextNumber).padStart(6, '0');

    const result = await prisma.$transaction(async (tx) => {
      // Create ONE payment for the whole batch
      const payment = await tx.payment.create({
        data: {
          receiptNumber: voucherNumber,
          studentId,
          amount: totalAmount,
          paymentMethod,
          paymentDate: new Date(paymentDate),
          referenceNumber: reference || null,
          status: 'COMPLETED',
          campusId: invoices[0].campusId,
          createdBy: '00000000-0000-0000-0000-' + String(req.user.id).padStart(12, '0')
        }
      });

      const updatedInvoices = [];
      for (const { invoice, amount, adjustedNetAmount } of paymentsData) {
        // Allocation per invoice
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount
          }
        });

        // Update invoice paid amount + status
        const newPaidAmount = parseFloat(invoice.paidAmount) + amount;
        const newStatus = newPaidAmount >= adjustedNetAmount ? 'PAID' : 'PARTIALLY_PAID';

        // Legacy invoices may lack the 10-digit reference code — assign one at payment time
        const updateData = { paidAmount: newPaidAmount, status: newStatus };
        if (!invoice.invoiceRefCode) {
          const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');
          const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
            const existing = await tx.invoice.findUnique({ where: { invoiceRefCode: code } });
            return !!existing;
          });
          updateData.invoiceRefCode = invoiceRefCode;
        }

        const updated = await tx.invoice.update({
          where: { id: invoice.id },
          data: updateData
        });
        updatedInvoices.push(updated);
      }

      return { payment, invoices: updatedInvoices };
    });

    // Transaction committed — now persist counter + mapping
    fs.writeFileSync(counterFile, JSON.stringify({ lastNumber: nextNumber }), 'utf8');
    let mapping = {};
    if (fs.existsSync(mappingFile)) {
      try { mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8')); } catch (e) { mapping = {}; }
    }
    for (const { invoice } of paymentsData) {
      mapping[invoice.id] = voucherNumber;
    }
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf8');

    const paidInvoices = result.invoices.filter(inv => inv.status === 'PAID');

    res.status(201).json({
      message: `Payment recorded successfully for ${result.invoices.length} invoices`,
      data: {
        payment: result.payment,
        invoices: result.invoices,
        receiptNumber: voucherNumber,
        totalAmount,
        months: result.invoices.map(inv => inv.metadata?.month || ''),
        invoiceRefCodes: result.invoices.map(inv => inv.invoiceRefCode || '')
      }
    });

    // ---- ONE SMS for the whole batch (non-blocking) ----
    if (paidInvoices.length > 0) {
      processMultiPaymentSms(paidInvoices, totalAmount, paymentDate);
    }

  } catch (error) {
    console.error('Error recording multi-invoice payment:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while recording payment',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/payments
 * Get all payments with optional filters
 */
router.get('/', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.PAYMENTS_VIEW), async (req, res) => {
  try {
    const { studentId, startDate, endDate, status, paymentMethod } = req.query;

    const where = {};

    if (studentId) {
      where.studentId = studentId;
    }

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) where.paymentDate.lte = new Date(endDate);
    }

    if (status) {
      where.status = status;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        allocations: {
          include: {
            invoice: true
          }
        }
      },
      orderBy: { paymentDate: 'desc' }
    });

    res.json({
      message: 'Payments retrieved successfully',
      data: payments
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch payments',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/payments/:id
 * Get a specific payment by ID
 */
router.get('/:id', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.PAYMENTS_VIEW), async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        allocations: {
          include: {
            invoice: true
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Payment not found'
      });
    }

    res.json({
      message: 'Payment retrieved successfully',
      data: payment
    });

  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch payment',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/payments/invoice/:invoiceId
 * Get all payments for a specific invoice
 */
router.get('/invoice/:invoiceId', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.PAYMENTS_VIEW), async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceId },
      include: {
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      message: 'Invoice payments retrieved successfully',
      data: allocations
    });

  } catch (error) {
    console.error('Error fetching invoice payments:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch invoice payments',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/payments/check-reference/:reference
 * Check if a reference number already exists
 */
router.get('/check-reference/:reference', authenticateWithBranch, async (req, res) => {
  try {
    const { reference } = req.params;

    const existingPayment = await prisma.payment.findFirst({
      where: {
        referenceNumber: reference
      }
    });

    res.json({
      exists: !!existingPayment,
      reference: reference
    });
  } catch (error) {
    console.error('Error checking reference:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to check reference number'
    });
  }
});

/**
 * Send SMS notification to guardian after a successful payment.
 * The SMS reports ONLY the amount paid this time, together with the payment date.
 */
async function processPaymentSms(invoice, paymentAmount, paymentDate) {
  try {
    const { sendSMS } = require('../services/SMSService');
    const { getBranchPrisma } = require('../services/BranchPrismaService');
    const { getRenderedTemplate } = require('./smsRoutes');
    const p = getBranchPrisma();

    if (!invoice) return;

    const uuidParts = invoice.studentId.split('-');
    const schoolId = parseInt(uuidParts[3], 10);
    const classId = parseInt(uuidParts[4], 10);

    if (isNaN(schoolId) || isNaN(classId)) return;

    const feeStructure = await p.feeStructure.findUnique({
      where: { id: invoice.feeStructureId }
    });

    if (!feeStructure || !feeStructure.gradeLevel) return;

    const pool = require('../config/db');
    const studentResult = await pool.query(
      `SELECT student_name, guardian_name, guardian_phone, guardian_username FROM classes_schema."${feeStructure.gradeLevel}" WHERE school_id = $1 AND class_id = $2 LIMIT 1`,
      [schoolId, classId]
    );

    if (studentResult.rows.length === 0 || !studentResult.rows[0].guardian_phone) return;

    const { student_name, guardian_name, guardian_phone, guardian_username } = studentResult.rows[0];

    // Only the month being paid in THIS payment
    const paidMonth = invoice.metadata?.month || 'the recent month';
    const paidDate = formatPaymentDate(paymentDate) || formatPaymentDate(new Date().toISOString());

    const msg = await getRenderedTemplate('payment_receipt', {
      guardian_name: guardian_name || 'Valued Parent',
      student_name: student_name || 'your ward',
      months_paid: paidMonth,
      amount_paid: paymentAmount.toFixed(2),
      payment_date: paidDate,
      invoice_id: invoice.invoiceRefCode || invoice.id,
      school_name: 'SCHOOL ACADEMY'
    }) || `Dear Parent/Guardian ${guardian_name || 'Valued Parent'},

We have received your school fee payment successfully from ${student_name || 'your ward'}.
Months: ${paidMonth}
Amount Paid: ${paymentAmount.toFixed(2)}
Date of payment: ${paidDate}
INV-ID: ${invoice.invoiceRefCode || invoice.id}
Thank you for your prompt payment and continued support.

# SCHOOL ACADEMY & SKOOLIFIC`;

    const smsResult = await sendSMS(guardian_phone, msg, null, {
      templateKey: 'payment_receipt',
      recipientName: guardian_name || student_name
    });
    if (smsResult && smsResult.success) {
      console.log(`✅ Payment SMS sent to ${guardian_phone} for ${student_name} (${smsResult.provider || 'sms'})`);
    } else {
      console.warn(`⚠️ Payment SMS FAILED for ${guardian_phone} (${student_name}): ${smsResult?.error || 'unknown error'}`);
    }

    // Push notification to the guardian's mobile app (non-blocking)
    if (guardian_username) {
      const { notifyGuardianPush } = require('../services/guardianPush');
      notifyGuardianPush(guardian_username, 'Payment Received ✅', `${student_name}: ${paymentAmount.toFixed(2)} Birr for ${paidMonth} recorded.`, {
        type: 'payment', student_name, amount: paymentAmount.toFixed(2), month: paidMonth
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('Failed to send payment SMS:', err.message);
  }
}

/**
 * Send ONE SMS for a multi-month (batch) payment.
 * Reports the TOTAL amount paid plus ALL months covered in this payment.
 */
async function processMultiPaymentSms(invoices, totalAmount, paymentDate) {
  try {
    const { sendSMS } = require('../services/SMSService');
    const { getBranchPrisma } = require('../services/BranchPrismaService');
    const { getRenderedTemplate } = require('./smsRoutes');
    const p = getBranchPrisma();

    if (!invoices || invoices.length === 0) return;

    const invoice = invoices[0];

    const uuidParts = invoice.studentId.split('-');
    const schoolId = parseInt(uuidParts[3], 10);
    const classId = parseInt(uuidParts[4], 10);

    if (isNaN(schoolId) || isNaN(classId)) return;

    const feeStructure = await p.feeStructure.findUnique({
      where: { id: invoice.feeStructureId }
    });

    if (!feeStructure || !feeStructure.gradeLevel) return;

    const pool = require('../config/db');
    const studentResult = await pool.query(
      `SELECT student_name, guardian_name, guardian_phone, guardian_username FROM classes_schema."${feeStructure.gradeLevel}" WHERE school_id = $1 AND class_id = $2 LIMIT 1`,
      [schoolId, classId]
    );

    if (studentResult.rows.length === 0 || !studentResult.rows[0].guardian_phone) return;

    const { student_name, guardian_name, guardian_phone, guardian_username } = studentResult.rows[0];

    // All months covered by THIS payment
    const monthsPaid = invoices.map(inv => inv.metadata?.month).filter(Boolean).join(', ');
    const refCodes = invoices.map(inv => inv.invoiceRefCode).filter(Boolean).join(', ');
    const paidDate = formatPaymentDate(paymentDate) || formatPaymentDate(new Date().toISOString());

    const msg = await getRenderedTemplate('payment_receipt', {
      guardian_name: guardian_name || 'Valued Parent',
      student_name: student_name || 'your ward',
      months_paid: monthsPaid,
      amount_paid: totalAmount.toFixed(2),
      payment_date: paidDate,
      invoice_id: refCodes,
      school_name: 'SCHOOL ACADEMY'
    }) || `Dear Parent/Guardian ${guardian_name || 'Valued Parent'},

We have received your school fee payment successfully from ${student_name || 'your ward'}.
Months: ${monthsPaid}
Amount Paid: ${totalAmount.toFixed(2)}
Date of payment: ${paidDate}
INV-ID: ${refCodes}
Thank you for your prompt payment and continued support.

# SCHOOL ACADEMY & SKOOLIFIC`;

    const smsResult = await sendSMS(guardian_phone, msg, null, {
      templateKey: 'payment_receipt',
      recipientName: guardian_name || student_name
    });
    if (smsResult && smsResult.success) {
      console.log(`✅ Multi-month payment SMS sent to ${guardian_phone} for ${student_name} (${invoices.length} months, ${smsResult.provider || 'sms'})`);
    } else {
      console.warn(`⚠️ Multi-month payment SMS FAILED for ${guardian_phone} (${student_name}): ${smsResult?.error || 'unknown error'}`);
    }
  } catch (err) {
    console.warn('Failed to send multi-month payment SMS:', err.message);
  }
}

const GREG_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ETH_MONTHS_AMH = ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'];

function toGregorianJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function gregorianToEthiopian(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const days = toGregorianJdn(d.getFullYear(), d.getMonth() + 1, d.getDate()) - 1723856;
  const eras = Math.floor(days / 1461);
  const daysInEra = days - eras * 1461;
  const n = Math.floor(daysInEra / 365) - Math.floor(daysInEra / 1460);
  const year = eras * 4 + n;
  let rem = daysInEra - 365 * n;
  const leap = n % 4 === 3 ? 1 : 0;
  const monthLengths = [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 5 + leap];
  let month = 0;
  while (month < 12 && rem >= monthLengths[month]) { rem -= monthLengths[month]; month++; }
  return { year, month: month + 1, day: rem + 1 };
}

/**
 * Format a date as "12/Aug/2026 || ነሐሴ / 6 /2018" (Gregorian + Ethiopian calendar).
 * Accepts ISO strings or MySQL/Postgres date strings.
 */
function formatPaymentDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const gregorian = `${d.getDate()}/${GREG_MONTHS_SHORT[d.getMonth()]}/${d.getFullYear()}`;
  const eth = gregorianToEthiopian(d);
  if (!eth) return gregorian;
  const ethiopian = `${ETH_MONTHS_AMH[eth.month - 1]} / ${eth.day} /${eth.year}`;
  return `${gregorian} || ${ethiopian}`;
}

module.exports = router;
