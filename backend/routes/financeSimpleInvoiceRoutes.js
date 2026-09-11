const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const prisma = new PrismaClient();

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * Convert composite student ID (e.g., "2-2") to deterministic UUID format
 * Format: 00000000-0000-0000-SSSS-CCCCCCCCCCCC
 * Where SSSS = school_id (4 digits), CCCCCCCCCCCC = class_id (12 digits)
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
 * POST /api/finance/simple-invoices/generate
 * Simple invoice generation that works with your database structure
 */
router.post('/generate', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_CREATE), async (req, res) => {
  try {
    const {
      studentId,
      studentName,
      feeStructureId,
      academicYearId,
      dueDate,
      campusId
    } = req.body;

    // Convert composite student ID to UUID format
    let studentUuid;
    try {
      studentUuid = compositeIdToUuid(studentId);
    } catch (error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid student ID format',
        details: error.message
      });
    }

    // Check if invoice already exists for this student this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        studentId: studentUuid,
        academicYearId: academicYearId,
        issueDate: {
          gte: monthStart,
          lte: monthEnd
        }
      }
    });

    if (existingInvoice) {
      return res.status(400).json({
        error: 'DUPLICATE_INVOICE',
        message: 'Invoice already exists for this student this month',
        invoiceNumber: existingInvoice.invoiceNumber
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

    if (!feeStructure.isActive) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Fee structure is not active'
      });
    }

    // Calculate totals
    const totalAmount = feeStructure.items.reduce((sum, item) => 
      sum + parseFloat(item.amount), 0
    );

    // Generate invoice number
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    
    const latestInvoice = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: { startsWith: prefix }
      },
      orderBy: { invoiceNumber: 'desc' }
    });
    
    let nextNumber = 1;
    if (latestInvoice) {
      const currentNumber = parseInt(latestInvoice.invoiceNumber.split('-')[2]);
      nextNumber = currentNumber + 1;
    }
    
    const invoiceNumber = `${prefix}${nextNumber.toString().padStart(6, '0')}`;

    // Generate unique 10-digit invoice reference code
    const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');
    const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
      const existing = await prisma.invoice.findUnique({ where: { invoiceRefCode: code } });
      return !!existing;
    });

    // Create invoice
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          invoiceRefCode,
          studentId: studentUuid,
          academicYearId,
          termId: null,
          issueDate: new Date(),
          dueDate: new Date(dueDate),
          totalAmount,
          discountAmount: 0,
          lateFeeAmount: 0,
          netAmount: totalAmount,
          paidAmount: 0,
          status: 'ISSUED',
          campusId,
          createdBy: '00000000-0000-0000-0000-' + String(req.user.id).padStart(12, '0')
        }
      });

      // Create invoice items
      const items = await Promise.all(
        feeStructure.items.map(item =>
          tx.invoiceItem.create({
            data: {
              invoiceId: inv.id,
              feeCategory: item.feeCategory,
              description: item.description || `${item.feeCategory} fee for ${studentName}`,
              amount: item.amount,
              accountId: item.accountId,
              quantity: 1
            }
          })
        )
      );

      return { ...inv, items };
    });

    res.status(201).json({
      message: 'Invoice created successfully',
      data: invoice
    });

  } catch (error) {
    console.error('Error creating simple invoice:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while creating invoice',
      details: error.message
    });
  }
});

module.exports = router;
