const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateWithBranch } = require('../../middleware/branchAuth');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Generate invoice number
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: {
      invoiceNumber: { startsWith: `INV-${year}` }
    }
  });
  return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
}

// Get all invoices
router.get('/', authenticateWithBranch, async (req, res) => {
  try {
    const { studentId, status, campusId, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (campusId) where.campusId = campusId;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          items: { include: { account: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.invoice.count({ where })
    ]);
    
    res.json({
      success: true,
      data: invoices,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch invoices' } });
  }
});

// Get single invoice
router.get('/:id', authenticateWithBranch, async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { account: true } },
        paymentAllocations: { include: { payment: true } }
      }
    });
    
    if (!invoice) {
      return res.status(404).json({ success: false, error: { message: 'Invoice not found' } });
    }
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch invoice' } });
  }
});

// Generate invoice
router.post('/generate', authenticateWithBranch, async (req, res) => {
  try {
    const { studentId, academicYearId, termId, feeStructureId, dueDate, campusId } = req.body;
    
    const result = await prisma.$transaction(async (tx) => {
      // Get fee structure with items
      const feeStructure = await tx.feeStructure.findUnique({
        where: { id: feeStructureId },
        include: { items: { include: { account: true } } }
      });
      
      if (!feeStructure) {
        throw new Error('Fee structure not found');
      }
      
      // Calculate totals
      const totalAmount = feeStructure.items.reduce((sum, item) => 
        sum + parseFloat(item.amount), 0
      );
      
      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber();

      // Generate unique 10-digit invoice reference code
      const { generateUniqueInvoiceRefCode } = require('../../utils/invoiceRefCode');
      const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
        const existing = await prisma.invoice.findUnique({ where: { invoiceRefCode: code } });
        return !!existing;
      });

      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          invoiceRefCode,
          studentId,
          academicYearId,
          termId,
          issueDate: new Date(),
          dueDate: new Date(dueDate),
          totalAmount,
          discountAmount: 0,
          lateFeeAmount: 0,
          netAmount: totalAmount,
          paidAmount: 0,
          status: 'ISSUED',
          campusId,
          createdBy: req.user.id,
          items: {
            create: feeStructure.items.map(item => ({
              feeCategory: item.feeCategory,
              description: item.description || item.feeCategory,
              amount: item.amount,
              accountId: item.accountId,
              quantity: 1
            }))
          }
        },
        include: { items: true }
      });
      
      return invoice;
    });
    
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to generate invoice' } });
  }
});

// Update invoice
router.put('/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { dueDate, status } = req.body;
    
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { dueDate: dueDate ? new Date(dueDate) : undefined, status }
    });
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to update invoice' } });
  }
});

// Cancel invoice
router.post('/:id/cancel', authenticateWithBranch, async (req, res) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' }
    });
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to cancel invoice' } });
  }
});

module.exports = router;
