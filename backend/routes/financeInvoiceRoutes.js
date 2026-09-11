const express = require('express');
const router = express.Router();
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const { branchPrisma: prisma } = require('../services/BranchPrismaService');

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

// Invoice service
const invoiceService = require('../services/invoiceService');

/**
 * POST /api/finance/invoices
 * Create a single invoice
 */
router.post('/', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_CREATE), async (req, res) => {
  try {
    const {
      studentId,
      feeStructureId,
      academicYearId,
      termId,
      dueDate,
      campusId,
      applyDiscounts = true
    } = req.body;

    // Validation
    if (!studentId || !feeStructureId || !academicYearId || !dueDate || !campusId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'studentId', message: 'Student ID is required', code: 'REQUIRED_FIELD' },
          { field: 'feeStructureId', message: 'Fee structure ID is required', code: 'REQUIRED_FIELD' },
          { field: 'academicYearId', message: 'Academic year ID is required', code: 'REQUIRED_FIELD' },
          { field: 'dueDate', message: 'Due date is required', code: 'REQUIRED_FIELD' },
          { field: 'campusId', message: 'Campus ID is required', code: 'REQUIRED_FIELD' }
        ].filter(d => 
          (!studentId && d.field === 'studentId') || 
          (!feeStructureId && d.field === 'feeStructureId') || 
          (!academicYearId && d.field === 'academicYearId') || 
          (!dueDate && d.field === 'dueDate') || 
          (!campusId && d.field === 'campusId')
        )
      });
    }

    // Generate invoice
    const invoice = await invoiceService.generateInvoice({
      studentId,
      feeStructureId,
      academicYearId,
      termId,
      dueDate,
      campusId,
      createdBy: req.user.id,
      applyDiscounts
    });

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Error creating invoice:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: error.message
      });
    }
    
    if (error.message.includes('not active')) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while creating invoice'
    });
  }
});

/**
 * POST /api/finance/invoices/generate
 * Generate invoices in bulk for multiple students
 */
router.post('/generate', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_CREATE), async (req, res) => {
  try {
    const {
      studentIds,
      feeStructureId,
      academicYearId,
      termId,
      dueDate,
      campusId,
      applyDiscounts = true
    } = req.body;

    // Validation
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'studentIds', message: 'Student IDs array is required and must not be empty', code: 'REQUIRED_FIELD' }
        ]
      });
    }

    if (!feeStructureId || !academicYearId || !dueDate || !campusId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'feeStructureId', message: 'Fee structure ID is required', code: 'REQUIRED_FIELD' },
          { field: 'academicYearId', message: 'Academic year ID is required', code: 'REQUIRED_FIELD' },
          { field: 'dueDate', message: 'Due date is required', code: 'REQUIRED_FIELD' },
          { field: 'campusId', message: 'Campus ID is required', code: 'REQUIRED_FIELD' }
        ].filter(d => 
          (!feeStructureId && d.field === 'feeStructureId') || 
          (!academicYearId && d.field === 'academicYearId') || 
          (!dueDate && d.field === 'dueDate') || 
          (!campusId && d.field === 'campusId')
        )
      });
    }

    // Generate bulk invoices
    const result = await invoiceService.generateBulkInvoices({
      studentIds,
      feeStructureId,
      academicYearId,
      termId,
      dueDate,
      campusId,
      createdBy: req.user.id,
      applyDiscounts
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error generating bulk invoices:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: error.message
      });
    }
    
    if (error.message.includes('not active')) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while generating invoices'
    });
  }
});

/**
 * GET /api/finance/invoices
 * List invoices with filters
 */
router.get('/', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const {
      studentId,
      status,
      campusId,
      academicYearId,
      termId,
      fromDate,
      toDate,
      page = 1,
      limit = 50
    } = req.query;

    // Build filter
    const where = {};
    
    if (studentId) where.studentId = studentId;
    
    // Handle status - can be comma-separated string or single value
    if (status) {
      const statusArray = status.split(',').map(s => s.trim());
      if (statusArray.length > 1) {
        where.status = { in: statusArray };
      } else {
        where.status = statusArray[0];
      }
    }
    
    if (campusId) where.campusId = campusId;
    if (academicYearId) where.academicYearId = academicYearId;
    if (termId) where.termId = termId;
    
    if (fromDate || toDate) {
      where.issueDate = {};
      if (fromDate) where.issueDate.gte = new Date(fromDate);
      if (toDate) where.issueDate.lte = new Date(toDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Get invoices
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          items: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take
      }),
      prisma.invoice.count({ where })
    ]);

    // Add computed `balance` so pages can render it directly
    const withBalance = invoices.map(inv => ({
      ...inv,
      balance: Math.max(0, (parseFloat(inv.netAmount) || 0) - (parseFloat(inv.paidAmount) || 0)).toFixed(2)
    }));

    res.json({
      data: withBalance,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error listing invoices:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while listing invoices'
    });
  }
});

/**
 * GET /api/finance/invoices/:id
 * Get invoice details
 */
router.get('/:id', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_VIEW), async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            account: true
          }
        },
        paymentAllocations: {
          include: {
            payment: true
          }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Invoice not found',
        details: {
          entityType: 'Invoice',
          entityId: id
        }
      });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error getting invoice:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while retrieving invoice'
    });
  }
});

/**
 * PUT /api/finance/invoices/:id
 * Update invoice (limited fields)
 */
router.put('/:id', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_UPDATE), async (req, res) => {
  try {
    const { id } = req.params;
    const { dueDate, status } = req.body;

    // Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id }
    });

    if (!invoice) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Invoice not found',
        details: {
          entityType: 'Invoice',
          entityId: id
        }
      });
    }

    // Prevent updates to paid or cancelled invoices
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      return res.status(400).json({
        error: 'BUSINESS_LOGIC_ERROR',
        message: `Cannot update invoice with status ${invoice.status}`
      });
    }

    // Build update data
    const updateData = {};
    if (dueDate) updateData.dueDate = new Date(dueDate);
    if (status) {
      // Validate status
      const validStatuses = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid status',
          details: [
            { field: 'status', message: `Status must be one of: ${validStatuses.join(', ')}`, code: 'INVALID_STATUS' }
          ]
        });
      }
      updateData.status = status;
    }

    // Update invoice
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: updateData,
        include: {
          items: true
        }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'Invoice',
          entityId: id,
          action: 'UPDATE',
          userId: req.user.id,
          oldValue: JSON.stringify(invoice),
          newValue: JSON.stringify(updated),
          timestamp: new Date()
        }
      });

      return updated;
    });

    res.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while updating invoice'
    });
  }
});

/**
 * POST /api/finance/invoices/:id/adjust
 * Adjust invoice amounts (discounts, late fees)
 */
router.post('/:id/adjust', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_ADJUST), async (req, res) => {
  try {
    const { id } = req.params;
    const { additionalDiscount, additionalLateFee } = req.body;

    if (!additionalDiscount && !additionalLateFee) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'At least one adjustment (additionalDiscount or additionalLateFee) is required'
      });
    }

    const adjustedInvoice = await invoiceService.adjustInvoice(
      id,
      { additionalDiscount, additionalLateFee },
      req.user.id
    );

    res.json(adjustedInvoice);
  } catch (error) {
    console.error('Error adjusting invoice:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: error.message
      });
    }
    
    if (error.message.includes('Cannot adjust')) {
      return res.status(400).json({
        error: 'BUSINESS_LOGIC_ERROR',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while adjusting invoice'
    });
  }
});

/**
 * POST /api/finance/invoices/:id/reverse
 * Reverse an invoice (create credit note)
 */
router.post('/:id/reverse', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.INVOICES_REVERSE), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Reversal reason is required',
        details: [
          { field: 'reason', message: 'Reason for reversal is required', code: 'REQUIRED_FIELD' }
        ]
      });
    }

    const result = await invoiceService.reverseInvoice(id, reason, req.user.id);

    res.json(result);
  } catch (error) {
    console.error('Error reversing invoice:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: error.message
      });
    }
    
    if (error.message.includes('Cannot reverse') || error.message.includes('already cancelled')) {
      return res.status(400).json({
        error: 'BUSINESS_LOGIC_ERROR',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while reversing invoice'
    });
  }
});

module.exports = router;
