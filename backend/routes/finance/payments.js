const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateWithBranch } = require('../../middleware/branchAuth');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Generate receipt number
async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.payment.count({
    where: {
      receiptNumber: { startsWith: `RCP-${year}` }
    }
  });
  return `RCP-${year}-${String(count + 1).padStart(6, '0')}`;
}

// Get all payments
router.get('/', authenticateWithBranch, async (req, res) => {
  try {
    const { studentId, status, campusId, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (campusId) where.campusId = campusId;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          allocations: { include: { invoice: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.payment.count({ where })
    ]);
    
    res.json({
      success: true,
      data: payments,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch payments' } });
  }
});

// Get student payment history
router.get('/student/:studentId', authenticateWithBranch, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { studentId: req.params.studentId },
      include: {
        allocations: { include: { invoice: true } }
      },
      orderBy: { paymentDate: 'desc' }
    });
    
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch payment history' } });
  }
});

// Record payment
router.post('/', authenticateWithBranch, async (req, res) => {
  try {
    const { studentId, amount, paymentMethod, referenceNumber, invoiceId, campusId, registrationFeeType } = req.body;
    
    const result = await prisma.$transaction(async (tx) => {
      // Get invoice
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId }
      });
      
      if (!invoice) {
        throw new Error('Invoice not found');
      }
      
      // If registration fee type is specified, adjust invoice netAmount
      let adjustedInvoice = invoice;
      if (registrationFeeType === 'old') {
        const meta = invoice.metadata || {};
        const oldReg = parseFloat(meta.oldRegistrationFee) || 0;
        const newReg = parseFloat(meta.newRegistrationFee) || 0;
        if (newReg > oldReg) {
          const reduction = newReg - oldReg;
          const newNetAmount = parseFloat(invoice.netAmount) - reduction;
          adjustedInvoice = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              netAmount: newNetAmount,
              metadata: { ...meta, registrationFeeApplied: 'old' }
            }
          });
        }
      } else if (registrationFeeType === 'new') {
        const meta = invoice.metadata || {};
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { metadata: { ...meta, registrationFeeApplied: 'new' } }
        });
      }
      
      const balanceAmount = parseFloat(adjustedInvoice.netAmount) - parseFloat(adjustedInvoice.paidAmount);
      
      if (parseFloat(amount) > balanceAmount) {
        throw new Error('Payment amount exceeds invoice balance');
      }
      
      // Generate receipt number
      const receiptNumber = await generateReceiptNumber();
      
      // Create payment
      const payment = await tx.payment.create({
        data: {
          receiptNumber,
          studentId,
          amount: parseFloat(amount),
          paymentMethod,
          paymentDate: new Date(),
          referenceNumber,
          status: 'COMPLETED',
          campusId,
          createdBy: req.user.id,
          allocations: {
            create: {
              invoiceId,
              amount: parseFloat(amount)
            }
          }
        },
        include: { allocations: true }
      });
      
      // Update invoice
      const newPaidAmount = parseFloat(invoice.paidAmount) + parseFloat(amount);
      const newStatus = newPaidAmount >= parseFloat(invoice.netAmount) ? 'PAID' : 'PARTIALLY_PAID';
      
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus
        }
      });
      
      // Create transaction for double-entry
      const transactionNumber = `TXN-${Date.now()}`;
      await tx.transaction.create({
        data: {
          transactionNumber,
          transactionDate: new Date(),
          description: `Payment ${receiptNumber} for Invoice ${invoice.invoiceNumber}`,
          sourceType: 'PAYMENT',
          sourceId: payment.id,
          status: 'POSTED',
          postedBy: req.user.id,
          postedAt: new Date(),
          lines: {
            create: [
              // Debit: Cash/Bank
              {
                accountId: '00000000-0000-0000-0000-000000000001', // Replace with actual cash account
                debitAmount: parseFloat(amount),
                creditAmount: 0,
                description: 'Cash received'
              },
              // Credit: Accounts Receivable
              {
                accountId: '00000000-0000-0000-0000-000000000002', // Replace with actual AR account
                debitAmount: 0,
                creditAmount: parseFloat(amount),
                description: 'Accounts receivable'
              }
            ]
          }
        }
      });
      
      return payment;
    });
    
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to record payment' } });
  }
});

// Get payment details
router.get('/:id', authenticateWithBranch, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        allocations: { include: { invoice: true } }
      }
    });
    
    if (!payment) {
      return res.status(404).json({ success: false, error: { message: 'Payment not found' } });
    }
    
    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch payment' } });
  }
});

module.exports = router;
