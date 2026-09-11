const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateWithBranch } = require('../../middleware/branchAuth');
const { branchSafeUpload } = require('../../middleware/branchContextMiddleware');
const multer = require('multer');
const path = require('path');
const { getEndpointPath, API_ENDPOINTS } = require('../../config/api.config');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/expenses/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Generate expense number
async function generateExpenseNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.expense.count({
    where: { expenseNumber: { startsWith: `EXP-${year}` } }
  });
  return `EXP-${year}-${String(count + 1).padStart(6, '0')}`;
}

// Get all expenses
router.get('/', authenticateWithBranch, async (req, res) => {
  try {
    const { status, category, vendorId, campusId, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (vendorId) where.vendorId = vendorId;
    if (campusId) where.campusId = campusId;
    if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (dateFrom) where.expenseDate.gte = new Date(dateFrom);
      if (dateTo) where.expenseDate.lte = new Date(dateTo);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          vendor: true,
          account: true,
          attachments: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.expense.count({ where })
    ]);
    
    res.json({
      success: true,
      data: expenses,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch expenses' } });
  }
});

// Get single expense
router.get('/:id', authenticateWithBranch, async (req, res) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: true,
        account: true,
        budget: true,
        attachments: true
      }
    });
    
    if (!expense) {
      return res.status(404).json({ success: false, error: { message: 'Expense not found' } });
    }
    
    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch expense' } });
  }
});

// Create expense
router.post('/', authenticateWithBranch, async (req, res) => {
  try {
    const {
      category,
      description,
      amount,
      expenseDate,
      vendorId,
      accountId,
      departmentId,
      campusId,
      isRecurring,
      recurringFrequency,
      budgetId
    } = req.body;
    
    const expenseNumber = await generateExpenseNumber();
    
    const expense = await prisma.expense.create({
      data: {
        expenseNumber,
        category,
        description,
        amount: parseFloat(amount),
        expenseDate: new Date(expenseDate),
        vendorId,
        accountId,
        departmentId,
        campusId,
        status: 'DRAFT',
        isRecurring: isRecurring || false,
        recurringFrequency,
        budgetId,
        createdBy: req.user.id
      },
      include: { vendor: true, account: true }
    });
    
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to create expense' } });
  }
});

// Update expense
router.put('/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { description, amount, status } = req.body;
    
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        description,
        amount: amount ? parseFloat(amount) : undefined,
        status
      }
    });
    
    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to update expense' } });
  }
});

// Submit expense for approval
router.post('/:id/submit', authenticateWithBranch, async (req, res) => {
  try {
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'PENDING_APPROVAL' }
    });
    
    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Error submitting expense:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to submit expense' } });
  }
});

// Approve expense
router.post('/:id/approve', authenticateWithBranch, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED' }
      });
      
      // Update budget if linked
      if (expense.budgetId) {
        const budgetLine = await tx.budgetLine.findFirst({
          where: {
            budgetId: expense.budgetId,
            category: expense.category
          }
        });
        
        if (budgetLine) {
          const newSpent = parseFloat(budgetLine.spentAmount) + parseFloat(expense.amount);
          await tx.budgetLine.update({
            where: { id: budgetLine.id },
            data: {
              spentAmount: newSpent,
              remainingAmount: parseFloat(budgetLine.allocatedAmount) - newSpent
            }
          });
        }
      }
      
      return expense;
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error approving expense:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to approve expense' } });
  }
});

// Upload attachment
router.post('/:id/attachments', authenticateWithBranch, ...branchSafeUpload(upload.single('file')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } });
    }
    
    const attachment = await prisma.expenseAttachment.create({
      data: {
        expenseId: req.params.id,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user.id
      }
    });
    
    res.status(201).json({ success: true, data: attachment });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to upload attachment' } });
  }
});

// Get expense summary by category
router.get('/reports/by-category', authenticateWithBranch, async (req, res) => {
  try {
    const { campusId, dateFrom, dateTo } = req.query;
    
    const where = { status: 'APPROVED' };
    if (campusId) where.campusId = campusId;
    if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (dateFrom) where.expenseDate.gte = new Date(dateFrom);
      if (dateTo) where.expenseDate.lte = new Date(dateTo);
    }
    
    const expenses = await prisma.expense.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: true
    });
    
    res.json({ success: true, data: expenses });
  } catch (error) {
    console.error('Error fetching expense summary:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch expense summary' } });
  }
});

module.exports = router;
