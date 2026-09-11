const express = require('express');
const router = express.Router();
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const { branchPrisma: prisma } = require('../services/BranchPrismaService');

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * POST /api/finance/late-fee-rules
 * Create a new late fee rule with validation
 */
router.post('/', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.LATE_FEES_MANAGE), async (req, res) => {
  try {
    const { name, type, value, gracePeriodDays, applicableFeeCategories, campusId } = req.body;

    // Validation
    if (!name || !type || value === undefined || gracePeriodDays === undefined || !applicableFeeCategories) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'name', message: 'Late fee rule name is required', code: 'REQUIRED_FIELD' },
          { field: 'type', message: 'Late fee type is required', code: 'REQUIRED_FIELD' },
          { field: 'value', message: 'Late fee value is required', code: 'REQUIRED_FIELD' },
          { field: 'gracePeriodDays', message: 'Grace period days is required', code: 'REQUIRED_FIELD' },
          { field: 'applicableFeeCategories', message: 'Applicable fee categories are required', code: 'REQUIRED_FIELD' }
        ].filter(d => (!name && d.field === 'name') || (!type && d.field === 'type') || (value === undefined && d.field === 'value') || (gracePeriodDays === undefined && d.field === 'gracePeriodDays') || (!applicableFeeCategories && d.field === 'applicableFeeCategories'))
      });
    }

    // Validate late fee type
    const validTypes = ['PERCENTAGE', 'FIXED_AMOUNT'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid late fee type',
        details: [{ field: 'type', message: `Late fee type must be one of: ${validTypes.join(', ')}`, code: 'INVALID_TYPE' }]
      });
    }

    // Validate late fee value
    if (value <= 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid late fee value',
        details: [{ field: 'value', message: 'Late fee value must be positive', code: 'INVALID_VALUE' }]
      });
    }

    // Validate grace period
    if (gracePeriodDays < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid grace period',
        details: [{ field: 'gracePeriodDays', message: 'Grace period days cannot be negative', code: 'INVALID_VALUE' }]
      });
    }

    // Validate applicable fee categories
    if (!Array.isArray(applicableFeeCategories) || applicableFeeCategories.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid applicable fee categories',
        details: [{ field: 'applicableFeeCategories', message: 'At least one fee category must be specified', code: 'REQUIRED_FIELD' }]
      });
    }

    const validFeeCategories = ['TUITION', 'TRANSPORT', 'LAB', 'EXAM', 'LIBRARY', 'SPORTS', 'CUSTOM'];
    const invalidCategories = applicableFeeCategories.filter(cat => !validFeeCategories.includes(cat));
    if (invalidCategories.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid fee categories',
        details: [{ field: 'applicableFeeCategories', message: `Invalid categories: ${invalidCategories.join(', ')}`, code: 'INVALID_CATEGORY' }]
      });
    }

    // Check maximum late fee rules limit (2 rules maximum)
    const existingRulesCount = await prisma.lateFeeRule.count();
    if (existingRulesCount >= 2) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Maximum late fee rules limit reached',
        details: [{ 
          field: 'limit', 
          message: 'You can only create a maximum of 2 late fee rules. Please delete an existing rule before creating a new one.', 
          code: 'MAX_LIMIT_REACHED' 
        }]
      });
    }

    // Create late fee rule
    const lateFeeRule = await prisma.lateFeeRule.create({
      data: {
        name,
        type,
        value,
        gracePeriodDays,
        applicableFeeCategories,
        campusId: campusId || null,
        isActive: true
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'LateFeeRule',
        entityId: lateFeeRule.id,
        action: 'CREATE',
        userId: '00000000-0000-0000-0000-' + String(req.user.id).padStart(12, '0'),
        newValue: lateFeeRule,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.status(201).json({ message: 'Late fee rule created successfully', data: lateFeeRule });

  } catch (error) {
    console.error('Create late fee rule error:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred',
      details: { errorId: `error-${Date.now()}`, timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /api/finance/late-fee-rules
 * List late fee rules with filtering
 */
router.get('/', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.LATE_FEES_MANAGE), async (req, res) => {
  try {
    const { type, campusId, isActive, search, page = 1, limit = 50 } = req.query;

    const where = {};
    if (type) where.type = type;
    if (campusId) where.campusId = campusId;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [lateFeeRules, total] = await Promise.all([
      prisma.lateFeeRule.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }] }),
      prisma.lateFeeRule.count({ where })
    ]);

    res.json({
      data: lateFeeRules,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) }
    });

  } catch (error) {
    console.error('List late fee rules error:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred',
      details: { errorId: `error-${Date.now()}`, timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /api/finance/late-fee-rules/:id
 * Get late fee rule details
 */
router.get('/:id', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.LATE_FEES_MANAGE), async (req, res) => {
  try {
    const { id } = req.params;
    const lateFeeRule = await prisma.lateFeeRule.findUnique({ where: { id } });

    if (!lateFeeRule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Late fee rule not found',
        details: { entityType: 'LateFeeRule', entityId: id }
      });
    }

    res.json({ data: lateFeeRule });

  } catch (error) {
    console.error('Get late fee rule error:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred',
      details: { errorId: `error-${Date.now()}`, timestamp: new Date().toISOString() }
    });
  }
});

/**
 * PUT /api/finance/late-fee-rules/:id
 * Update late fee rule
 * When deactivating a rule, automatically remove late fees from all invoices
 */
router.put('/:id', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.LATE_FEES_MANAGE), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, value, gracePeriodDays, applicableFeeCategories, campusId, isActive } = req.body;

    const existingRule = await prisma.lateFeeRule.findUnique({ where: { id } });
    if (!existingRule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Late fee rule not found',
        details: { entityType: 'LateFeeRule', entityId: id }
      });
    }

    // Validate type if provided
    if (type) {
      const validTypes = ['PERCENTAGE', 'FIXED_AMOUNT'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid late fee type',
          details: [{ field: 'type', message: `Late fee type must be one of: ${validTypes.join(', ')}`, code: 'INVALID_TYPE' }]
        });
      }
    }

    // Validate value if provided
    if (value !== undefined && value <= 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid late fee value',
        details: [{ field: 'value', message: 'Late fee value must be positive', code: 'INVALID_VALUE' }]
      });
    }

    // Validate grace period if provided
    if (gracePeriodDays !== undefined && gracePeriodDays < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid grace period',
        details: [{ field: 'gracePeriodDays', message: 'Grace period days cannot be negative', code: 'INVALID_VALUE' }]
      });
    }

    // Validate applicable fee categories if provided
    if (applicableFeeCategories) {
      if (!Array.isArray(applicableFeeCategories) || applicableFeeCategories.length === 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid applicable fee categories',
          details: [{ field: 'applicableFeeCategories', message: 'At least one fee category must be specified', code: 'REQUIRED_FIELD' }]
        });
      }

      const validFeeCategories = ['TUITION', 'TRANSPORT', 'LAB', 'EXAM', 'LIBRARY', 'SPORTS', 'CUSTOM'];
      const invalidCategories = applicableFeeCategories.filter(cat => !validFeeCategories.includes(cat));
      if (invalidCategories.length > 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid fee categories',
          details: [{ field: 'applicableFeeCategories', message: `Invalid categories: ${invalidCategories.join(', ')}`, code: 'INVALID_CATEGORY' }]
        });
      }
    }

    // If grace period changed OR if activating a rule, recalculate all invoice due dates
    const shouldRecalculateDueDates = 
      (gracePeriodDays !== undefined && gracePeriodDays !== existingRule.gracePeriodDays) ||
      (isActive === true && existingRule.isActive === false);

    if (shouldRecalculateDueDates) {
      const newGracePeriod = gracePeriodDays !== undefined ? gracePeriodDays : existingRule.gracePeriodDays;
      console.log(`Recalculating due dates with ${newGracePeriod} days grace period...`);
      
      // Get all active late fee rules to find the one with shortest grace period
      const allActiveRules = await prisma.lateFeeRule.findMany({
        where: { isActive: true }
      });
      
      // If activating this rule, include it in the calculation
      if (isActive === true) {
        allActiveRules.push({ ...existingRule, gracePeriodDays: newGracePeriod, isActive: true });
      }
      
      // Find the shortest grace period among active rules
      const shortestGracePeriod = Math.min(...allActiveRules.map(r => r.gracePeriodDays));
      
      console.log(`Using shortest grace period: ${shortestGracePeriod} days`);
      
      // Get all invoices with month metadata
      const allInvoices = await prisma.invoice.findMany({
        where: {
          metadata: {
            path: ['monthNumber'],
            not: null
          }
        }
      });

      // FIX: use the accurate Ethiopian calendar utility (no hardcoded dates)
      const { toEthiopian, toGregorian } = require('../utils/ethiopianCalendar');
      const ethNow = toEthiopian(new Date());
      
      let updatedCount = 0;
      for (const invoice of allInvoices) {
        const metadata = invoice.metadata || {};
        const monthNumber = metadata.monthNumber;
        
        if (!monthNumber) continue;
        
        // Calculate new due date: Month start + shortest grace period
        const monthStartDate = toGregorian(ethNow.year, monthNumber, 1);
        // Normalize to NOON local time so the date displays correctly in any timezone
        monthStartDate.setHours(12, 0, 0, 0);
        
        const newDueDate = new Date(monthStartDate);
        newDueDate.setDate(newDueDate.getDate() + shortestGracePeriod);
        
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { dueDate: newDueDate }
        });
        
        updatedCount++;
      }
      
      console.log(`✓ Updated due dates for ${updatedCount} invoices`);
    }

    // If deactivating the rule, remove late fees from all invoices AND recalculate due dates
    if (isActive === false && existingRule.isActive === true) {
      console.log('Deactivating late fee rule - removing late fees and recalculating due dates...');
      
      // Get all invoices with late fees
      const invoicesWithLateFees = await prisma.invoice.findMany({
        where: {
          lateFeeAmount: {
            gt: 0
          }
        }
      });

      // Remove late fees from all invoices
      for (const invoice of invoicesWithLateFees) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            lateFeeAmount: 0,
            netAmount: parseFloat(invoice.totalAmount) - parseFloat(invoice.discountAmount),
            status: invoice.paidAmount > 0 ? 'PARTIALLY_PAID' : 'ISSUED'
          }
        });
      }

      console.log(`✓ Removed late fees from ${invoicesWithLateFees.length} invoices`);
      
      // Recalculate due dates based on remaining active rules
      const remainingActiveRules = await prisma.lateFeeRule.findMany({
        where: { 
          isActive: true,
          id: { not: id } // Exclude the rule being deactivated
        }
      });
      
      if (remainingActiveRules.length > 0) {
        // Find the shortest grace period among remaining active rules
        const shortestGracePeriod = Math.min(...remainingActiveRules.map(r => r.gracePeriodDays));
        console.log(`Recalculating due dates with shortest grace period: ${shortestGracePeriod} days`);
        
        // Get all invoices with month metadata
        const allInvoices = await prisma.invoice.findMany({
          where: {
            metadata: {
              path: ['monthNumber'],
              not: null
            }
          }
        });

        // FIX: use the accurate Ethiopian calendar utility (no hardcoded dates)
        const { toEthiopian, toGregorian } = require('../utils/ethiopianCalendar');
        const ethNow = toEthiopian(new Date());
        
        let updatedCount = 0;
        for (const invoice of allInvoices) {
          const metadata = invoice.metadata || {};
          const monthNumber = metadata.monthNumber;
          
          if (!monthNumber) continue;
          
          // Calculate new due date: Month start + shortest grace period
          const monthStartDate = toGregorian(ethNow.year, monthNumber, 1);
          // Normalize to NOON local time so the date displays correctly in any timezone
          monthStartDate.setHours(12, 0, 0, 0);
          
          const newDueDate = new Date(monthStartDate);
          newDueDate.setDate(newDueDate.getDate() + shortestGracePeriod);
          
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { dueDate: newDueDate }
          });
          
          updatedCount++;
        }
        
        console.log(`✓ Updated due dates for ${updatedCount} invoices`);
      }
    }

    // Update late fee rule
    const updatedRule = await prisma.lateFeeRule.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(value !== undefined && { value }),
        ...(gracePeriodDays !== undefined && { gracePeriodDays }),
        ...(applicableFeeCategories && { applicableFeeCategories }),
        ...(campusId !== undefined && { campusId: campusId || null }),
        ...(isActive !== undefined && { isActive })
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'LateFeeRule',
        entityId: id,
        action: 'UPDATE',
        userId: '00000000-0000-0000-0000-' + String(req.user.id).padStart(12, '0'),
        oldValue: existingRule,
        newValue: updatedRule,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({ 
      message: isActive === false && existingRule.isActive === true 
        ? 'Late fee rule deactivated and late fees removed from all invoices' 
        : 'Late fee rule updated successfully', 
      data: updatedRule 
    });

  } catch (error) {
    console.error('Update late fee rule error:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred',
      details: { errorId: `error-${Date.now()}`, timestamp: new Date().toISOString() }
    });
  }
});

/**
 * DELETE /api/finance/late-fee-rules/:id
 * Delete a late fee rule permanently
 */
router.delete('/:id', authenticateWithBranch, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if late fee rule exists
    const lateFeeRule = await prisma.lateFeeRule.findUnique({
      where: { id }
    });

    if (!lateFeeRule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Late fee rule not found'
      });
    }

    // Delete late fee rule permanently
    await prisma.lateFeeRule.delete({
      where: { id }
    });

    res.json({
      message: 'Late fee rule deleted successfully',
      data: { id }
    });

  } catch (error) {
    console.error('Delete late fee rule error:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while deleting late fee rule',
      details: error.message
    });
  }
});

module.exports = router;
