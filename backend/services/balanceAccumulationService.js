/**
 * Balance Accumulation Service
 * 
 * Handles automatic balance accumulation for monthly payments:
 * - Adds new monthly fee to existing unpaid balance
 * - Applies late fees to overdue amounts
 * - Tracks payment history per student
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calculate student's current balance including unpaid previous months
 * @param {string} studentId - Student identifier (schoolId-classId)
 * @param {string} feeStructureId - Fee structure ID
 * @returns {Object} Balance details
 */
async function calculateStudentBalance(studentId, feeStructureId) {
  try {
    // Get all invoices for this student and fee structure
    const invoices = await prisma.invoice.findMany({
      where: {
        studentId: studentId,
        feeStructureId: feeStructureId,
        status: {
          in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE']
        }
      },
      include: {
        items: true,
        payments: {
          include: {
            allocations: true
          }
        }
      },
      orderBy: {
        dueDate: 'asc'
      }
    });

    let totalBalance = 0;
    let totalLateFees = 0;
    let unpaidMonths = [];

    for (const invoice of invoices) {
      const invoiceTotal = invoice.items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      const paidAmount = invoice.payments.reduce((sum, payment) => {
        const allocatedToThisInvoice = payment.allocations
          .filter(alloc => alloc.invoiceId === invoice.id)
          .reduce((allocSum, alloc) => allocSum + parseFloat(alloc.amount), 0);
        return sum + allocatedToThisInvoice;
      }, 0);

      const balance = invoiceTotal - paidAmount;
      
      if (balance > 0) {
        totalBalance += balance;
        
        // Check if overdue and calculate late fee
        const now = new Date();
        const dueDate = new Date(invoice.dueDate);
        
        if (now > dueDate) {
          const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
          
          // Get applicable late fee rules
          const lateFeeRules = await prisma.lateFeeRule.findMany({
            where: {
              isActive: true,
              gracePeriodDays: {
                lte: daysOverdue
              }
            }
          });

          // Apply the most severe late fee rule
          let lateFee = 0;
          for (const rule of lateFeeRules) {
            if (rule.type === 'FIXED_AMOUNT') {
              lateFee = Math.max(lateFee, parseFloat(rule.value));
            } else if (rule.type === 'PERCENTAGE') {
              lateFee = Math.max(lateFee, balance * (parseFloat(rule.value) / 100));
            }
          }

          totalLateFees += lateFee;
          
          unpaidMonths.push({
            invoiceId: invoice.id,
            month: invoice.metadata?.month || 'Unknown',
            amount: balance,
            lateFee: lateFee,
            daysOverdue: daysOverdue
          });
        } else {
          unpaidMonths.push({
            invoiceId: invoice.id,
            month: invoice.metadata?.month || 'Unknown',
            amount: balance,
            lateFee: 0,
            daysOverdue: 0
          });
        }
      }
    }

    return {
      totalBalance: totalBalance,
      totalLateFees: totalLateFees,
      totalDue: totalBalance + totalLateFees,
      unpaidMonths: unpaidMonths,
      unpaidMonthsCount: unpaidMonths.length
    };

  } catch (error) {
    console.error('Error calculating student balance:', error);
    throw error;
  }
}

/**
 * Generate invoice with accumulated balance
 * Creates a new invoice that includes:
 * - Current month's fee
 * - Previous unpaid balance (if any)
 * - Late fees on overdue amounts
 * 
 * @param {string} studentId - Student identifier
 * @param {string} feeStructureId - Fee structure ID
 * @param {number} monthNumber - Ethiopian calendar month (1-13)
 * @param {number} monthIndex - Sequential month index (1, 2, 3...)
 * @param {number} monthlyAmount - Monthly fee amount
 * @param {string} accountId - Income account ID
 * @returns {Object} Created invoice
 */
async function generateInvoiceWithBalance(studentId, feeStructureId, monthNumber, monthIndex, monthlyAmount, accountId) {
  try {
    // Calculate existing balance
    const balanceInfo = await calculateStudentBalance(studentId, feeStructureId);

    // Ethiopian month names
    const ethiopianMonths = [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ];
    const monthName = ethiopianMonths[monthNumber - 1];

    // Create invoice number
    const invoiceNumber = `INV-${Date.now()}-${studentId.replace(/[^a-zA-Z0-9]/g, '')}`;

    // Generate unique 10-digit invoice reference code
    const { generateUniqueInvoiceRefCode } = require('../utils/invoiceRefCode');
    const invoiceRefCode = await generateUniqueInvoiceRefCode(async (code) => {
      const existing = await prisma.invoice.findUnique({ where: { invoiceRefCode: code } });
      return !!existing;
    });

    // Set due date (30 days from now for regular months, 5 days for Pagume)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (monthNumber === 13 ? 5 : 30));

    // Create invoice items
    const items = [];

    // 1. Current month's fee
    items.push({
      description: `${monthName} Monthly Fee (Month ${monthIndex})`,
      feeCategory: 'TUITION',
      amount: monthlyAmount,
      accountId: accountId
    });

    // 2. Add previous unpaid balance as separate items
    if (balanceInfo.unpaidMonths.length > 0) {
      for (const unpaidMonth of balanceInfo.unpaidMonths) {
        items.push({
          description: `Previous Balance - ${unpaidMonth.month}`,
          feeCategory: 'TUITION',
          amount: unpaidMonth.amount,
          accountId: accountId
        });

        // Add late fee if applicable
        if (unpaidMonth.lateFee > 0) {
          items.push({
            description: `Late Fee - ${unpaidMonth.month} (${unpaidMonth.daysOverdue} days overdue)`,
            feeCategory: 'LATE_FEE',
            amount: unpaidMonth.lateFee,
            accountId: accountId
          });
        }
      }
    }

    // Calculate total
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    // Create the invoice
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: invoiceNumber,
        invoiceRefCode: invoiceRefCode,
        studentId: studentId,
        feeStructureId: feeStructureId,
        issueDate: new Date(),
        dueDate: dueDate,
        totalAmount: totalAmount,
        paidAmount: 0,
        status: 'PENDING',
        metadata: {
          month: monthName,
          monthNumber: monthNumber,
          monthIndex: monthIndex,
          previousBalance: balanceInfo.totalBalance,
          lateFees: balanceInfo.totalLateFees,
          currentMonthFee: monthlyAmount,
          unpaidMonthsCount: balanceInfo.unpaidMonthsCount
        },
        items: {
          create: items
        }
      },
      include: {
        items: true
      }
    });

    return {
      invoice: invoice,
      balanceInfo: balanceInfo,
      breakdown: {
        currentMonthFee: monthlyAmount,
        previousBalance: balanceInfo.totalBalance,
        lateFees: balanceInfo.totalLateFees,
        totalDue: totalAmount
      }
    };

  } catch (error) {
    console.error('Error generating invoice with balance:', error);
    throw error;
  }
}

/**
 * Process payment and allocate to invoices
 * Allocates payment to oldest invoices first (FIFO)
 * 
 * @param {string} studentId - Student identifier
 * @param {string} feeStructureId - Fee structure ID
 * @param {number} paymentAmount - Amount paid
 * @param {string} paymentMethod - Payment method
 * @returns {Object} Payment allocation details
 */
async function processPaymentAllocation(studentId, feeStructureId, paymentAmount, paymentMethod = 'CASH') {
  try {
    // Get all unpaid invoices for this student (oldest first)
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        studentId: studentId,
        feeStructureId: feeStructureId,
        status: {
          in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE']
        }
      },
      include: {
        items: true,
        payments: {
          include: {
            allocations: true
          }
        }
      },
      orderBy: {
        dueDate: 'asc' // Pay oldest first
      }
    });

    if (unpaidInvoices.length === 0) {
      throw new Error('No unpaid invoices found for this student');
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        studentId: studentId,
        amount: paymentAmount,
        paymentMethod: paymentMethod,
        paymentDate: new Date(),
        status: 'COMPLETED',
        metadata: {
          feeStructureId: feeStructureId
        }
      }
    });

    let remainingAmount = paymentAmount;
    const allocations = [];

    // Allocate payment to invoices (oldest first)
    for (const invoice of unpaidInvoices) {
      if (remainingAmount <= 0) break;

      // Calculate invoice balance
      const invoiceTotal = invoice.items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      const alreadyPaid = invoice.payments.reduce((sum, p) => {
        const allocatedToThisInvoice = p.allocations
          .filter(alloc => alloc.invoiceId === invoice.id)
          .reduce((allocSum, alloc) => allocSum + parseFloat(alloc.amount), 0);
        return sum + allocatedToThisInvoice;
      }, 0);

      const invoiceBalance = invoiceTotal - alreadyPaid;

      if (invoiceBalance > 0) {
        const allocationAmount = Math.min(remainingAmount, invoiceBalance);

        // Create allocation
        const allocation = await prisma.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: allocationAmount
          }
        });

        allocations.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: allocationAmount,
          invoiceBalance: invoiceBalance,
          remainingBalance: invoiceBalance - allocationAmount
        });

        remainingAmount -= allocationAmount;

        // Update invoice status
        const newPaidAmount = alreadyPaid + allocationAmount;
        let newStatus = 'PENDING';
        
        if (newPaidAmount >= invoiceTotal) {
          newStatus = 'PAID';
        } else if (newPaidAmount > 0) {
          newStatus = 'PARTIALLY_PAID';
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus
          }
        });
      }
    }

    // Calculate new balance
    const newBalance = await calculateStudentBalance(studentId, feeStructureId);

    return {
      payment: payment,
      allocations: allocations,
      remainingPayment: remainingAmount,
      newBalance: newBalance
    };

  } catch (error) {
    console.error('Error processing payment allocation:', error);
    throw error;
  }
}

module.exports = {
  calculateStudentBalance,
  generateInvoiceWithBalance,
  processPaymentAllocation
};
