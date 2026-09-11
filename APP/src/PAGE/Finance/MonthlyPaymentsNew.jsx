import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import styles from './MonthlyPayments.module.css';
import api from '../../utils/api';
import InvoiceReceipt from '../../COMPONENTS/InvoiceReceipt';
import { numberToWords, generateReceiptNumber } from '../../utils/numberToWords';
import { buildReceiptHtml } from '../../utils/receiptTemplate';
import { 
  gregorianToEthiopian, 
  ethiopianToGregorian,
  getCurrentEthiopianMonth, 
  getEthiopianDate,
  formatEthiopianDate as formatEthDate 
} from '../../utils/ethiopianCalendar';

// Local (school-local, UTC+3) date string in YYYY-MM-DD — avoids the UTC
// toISOString() bug where early-morning payments recorded the previous day.
const getLocalDateStr = () => {
  const d = new Date(Date.now() + 3 * 3600 * 1000); // Ethiopia = UTC+3
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const MonthlyPaymentsNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMultiMonthModal, setShowMultiMonthModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [currentEthiopianMonth, setCurrentEthiopianMonth] = useState(() => {
    // Get current Ethiopian month from calendar utility
    const currentMonth = getCurrentEthiopianMonth();
    return currentMonth.month;
  });
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [classFilterStatus, setClassFilterStatus] = useState('ALL'); // Filter for class student list
  const [dateFilter, setDateFilter] = useState('ALL'); // Date filter
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [lateFeeRules, setLateFeeRules] = useState([]); // Active late fee rules
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [multipleMonthlyReport, setMultipleMonthlyReport] = useState(null);
  const [selectedCardType, setSelectedCardType] = useState(null); // Track which card was clicked
  const [cardDetailsData, setCardDetailsData] = useState(null); // Store card details
  const [showCardDetailsModal, setShowCardDetailsModal] = useState(false); // Modal for card details
  const [receiptData, setReceiptData] = useState(null); // Data for receipt printing
  const [schoolInfo, setSchoolInfo] = useState(null); // School branding info
  const [lastReceiptNumber, setLastReceiptNumber] = useState(0); // Track receipt numbers
  const receiptRef = useRef(); // Ref for printing
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'CASH',
    paymentDate: getLocalDateStr(),
    reference: '',
    screenshot: null,
    notes: ''
  });
  const [regFeeType, setRegFeeType] = useState('new');
  const [showExemptionModal, setShowExemptionModal] = useState(false);
  const [exemptionForm, setExemptionForm] = useState({
    is_free: false,
    exemption_type: '',
    exemption_reason: '',
    registration_fee_type: 'new'
  });
  // Check Invoice by 10-digit reference code
  const [showInvoiceLookupModal, setShowInvoiceLookupModal] = useState(false);
  const [invoiceLookupCode, setInvoiceLookupCode] = useState('');
  const [invoiceLookupLoading, setInvoiceLookupLoading] = useState(false);
  const [invoiceLookupResult, setInvoiceLookupResult] = useState(null);
  const [invoiceLookupError, setInvoiceLookupError] = useState('');

  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  // Format Ethiopian date as string
  const formatEthiopianDate = (gregorianDate) => {
    if (!gregorianDate) return 'Unknown';
    const dateObj = typeof gregorianDate === 'string' ? new Date(gregorianDate) : gregorianDate;
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'Invalid date';
    const eth = gregorianToEthiopian(dateObj);
    const monthName = ethiopianMonths[eth.month - 1] || 'Unknown';
    return `${eth.day}/${eth.month}/${eth.year} (${monthName})`;
  };

  // Calculate multiple due dates based on active late fee rules
  const calculateDueDates = (invoice) => {
    if (!invoice.metadata || !invoice.metadata.monthNumber) {
      return [{ dueDate: invoice.dueDate, gracePeriod: 0, ruleName: 'Default' }];
    }

    // If no late fee rules loaded yet, return invoice due date
    if (!lateFeeRules || lateFeeRules.length === 0) {
      return [{ dueDate: invoice.dueDate, gracePeriod: 0, ruleName: 'Default' }];
    }

    const monthNumber = invoice.metadata.monthNumber;
    
    // Get current Ethiopian year to compute accurate Gregorian dates
    const ethNow = getEthiopianDate();
    const ethiopianYear = ethNow.year;
    
    // Calculate month start date using the Ethiopian calendar utility
    const monthStartDate = ethiopianToGregorian(ethiopianYear, monthNumber, 1);

    // Calculate due dates for each active late fee rule
    const dueDates = lateFeeRules.map(rule => {
      const dueDate = new Date(monthStartDate);
      dueDate.setDate(dueDate.getDate() + rule.gracePeriodDays);
      return {
        dueDate: dueDate,
        gracePeriod: rule.gracePeriodDays,
        ruleName: rule.name,
        penaltyValue: rule.value
      };
    });

    return dueDates;
  };

  const paymentMethods = [
    { value: 'CASH', label: t('financeApp.shell.methods.cash'), requiresReference: false },
    { value: 'CBE', label: t('financeApp.shell.methods.cbe'), requiresReference: true },
    { value: 'ABAY', label: t('financeApp.shell.methods.abay'), requiresReference: true },
    { value: 'ABYSSINIA', label: t('financeApp.shell.methods.abyssinia'), requiresReference: true },
    { value: 'EBIRR', label: t('financeApp.shell.methods.eBirr'), requiresReference: true },
    { value: 'MOBILE_MONEY', label: t('financeApp.shell.methods.mobileMoney'), requiresReference: true },
    { value: 'ONLINE', label: t('financeApp.shell.methods.online'), requiresReference: true }
  ];

  useEffect(() => {
    // Update current Ethiopian month from calendar
    const currentMonth = getCurrentEthiopianMonth();
    setCurrentEthiopianMonth(currentMonth.month);
    
    fetchOverview();
    fetchLateFeeRules();
    fetchSchoolInfo();
    fetchLastReceiptNumber();
  }, []);

  // Auto-update Ethiopian month every minute to stay in sync
  useEffect(() => {
    const interval = setInterval(() => {
      const currentMonth = getCurrentEthiopianMonth();
      const newMonth = currentMonth.month;
      
      // If month changed, refresh overview
      if (newMonth !== currentEthiopianMonth) {
        console.log(`📅 Ethiopian month changed from ${currentEthiopianMonth} to ${newMonth}`);
        setCurrentEthiopianMonth(newMonth);
        fetchOverview(); // Refresh data when month changes
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [currentEthiopianMonth]);

  useEffect(() => {
    if (selectedClass) {
      fetchClassDetails();
    }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentDetails();
    }
  }, [selectedStudent]);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/finance/monthly-payments-view/overview?currentMonth=${currentEthiopianMonth}`);
      console.log('📊 Overview Response:', response.data);
      console.log('Summary:', response.data.summary);
      console.log('Unlocked Total Amount:', response.data.summary.unlockedTotalAmount);
      console.log('Unlocked Total Paid:', response.data.summary.unlockedTotalPaid);
      console.log('Unlocked Total Pending:', response.data.summary.unlockedTotalPending);
      setOverview(response.data);
    } catch (error) {
      console.error('Error fetching overview:', error.response?.data?.details || error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLateFeeRules = async () => {
    try {
      const response = await api.get('/finance/late-fee-rules?isActive=true');
      const activeRules = response.data.data || [];
      // Sort by grace period (ascending) to show earliest due date first
      activeRules.sort((a, b) => a.gracePeriodDays - b.gracePeriodDays);
      setLateFeeRules(activeRules);
    } catch (error) {
      console.error('Error fetching late fee rules:', error.response?.data?.details || error.message);
      // Set empty array on error so component doesn't break
      setLateFeeRules([]);
    }
  };

  const fetchClassDetails = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/finance/monthly-payments-view/class/${selectedClass}?currentMonth=${currentEthiopianMonth}`);
      setClassDetails(response.data);
    } catch (error) {
      console.error('Error fetching class details:', error);
      alert(t('financeApp.pay3.failedFetchClassDetails'));
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetails = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/finance/monthly-payments-view/student/${selectedStudent}`);
      setStudentDetails(response.data);
      
      // Fetch student exemption status from class table
      if (selectedClass && selectedStudent) {
        try {
          const parts = selectedStudent.split('-');
          if (parts.length >= 5) {
            const schoolId = parseInt(parts[3], 10);
            const classId = parseInt(parts[4], 10);
            
            const studentResponse = await api.get(`/student-list/student/${selectedClass}/${schoolId}/${classId}`);
            if (studentResponse.data) {
              setExemptionForm({
                is_free: studentResponse.data.is_free || false,
                exemption_type: studentResponse.data.exemption_type || '',
                exemption_reason: studentResponse.data.exemption_reason || '',
                registration_fee_type: studentResponse.data.registration_fee_type || 'new'
              });
            }
          }
        } catch (err) {
          console.error('Error fetching student exemption status:', err);
        }
      }
    } catch (error) {
      console.error('Error fetching student details:', error);
      alert(t('financeApp.pay3.failedFetchStudentDetails'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentHistory = async () => {
    try {
      const response = await api.get(`/finance/monthly-payments-view/student/${selectedStudent}/payment-history`);
      setPaymentHistory(response.data);
      setShowPaymentHistoryModal(true);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      alert(t('financeApp.pay3.failedFetchHistory'));
    }
  };

  const fetchMultipleMonthlyReport = async () => {
    try {
      const response = await api.get('/finance/monthly-payments-view/reports/multiple-monthly-payments');
      setMultipleMonthlyReport(response.data);
    } catch (error) {
      console.error('Error fetching multiple monthly report:', error);
      alert(t('financeApp.pay3.failedFetchReport'));
    }
  };

  const fetchSchoolInfo = async () => {
    try {
      const response = await api.get('/settings/branding');
      const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
      setSchoolInfo({
        logo: response.data.logo ? `${API_BASE}${response.data.logo}` : null,
        nameEn: response.data.schoolName || 'Dugsiga Barbaarinta Caruurta, Hoose, Dhexe & Sare Ee Iqra',
        nameAm: response.data.schoolNameAmharic || 'ኢቅራ ሮጸ አሕፃናት አንደኛና ሁለተኛ ደረጃ ት/ቤት'
      });
    } catch (error) {
      console.error('Error fetching school info:', error);
      // Use default values
      setSchoolInfo({
        logo: null,
        nameEn: 'Dugsiga Barbaarinta Caruurta, Hoose, Dhexe & Sare Ee Iqra',
        nameAm: 'ኢቅራ ሮጸ አሕፃናት አንደኛና ሁለተኛ ደረጃ ት/ቤት'
      });
    }
  };

  const fetchLastReceiptNumber = async () => {
    try {
      // Try to get the last receipt number from backend
      const response = await api.get('/finance/monthly-payments-view/receipts/last-number');
      setLastReceiptNumber(response.data.lastNumber || 0);
    } catch (error) {
      console.error('Error fetching last receipt number:', error);
      // Start from 0 if no receipts exist
      setLastReceiptNumber(0);
    }
  };

  const componentRef = useRef(null);
  
  const handlePrint = () => {
    if (!componentRef.current) {
      console.error('Component ref not found');
      return;
    }

    const receiptElement = componentRef.current.querySelector('[class*="receipt"], [class*="voucher"]');
    if (!receiptElement) {
      console.error('Receipt element not found');
      alert(t('financeApp.pay3.receiptNotFound'));
      return;
    }

    console.log('Receipt element found, preparing to print...');

    // Clone the receipt element
    const clonedReceipt = receiptElement.cloneNode(true);
    
    // Get computed styles and apply them inline
    const applyComputedStyles = (original, clone) => {
      const computedStyle = window.getComputedStyle(original);
      const styleString = Array.from(computedStyle).reduce((str, property) => {
        return `${str}${property}:${computedStyle.getPropertyValue(property)};`;
      }, '');
      clone.setAttribute('style', styleString);
      
      // Recursively apply to children
      Array.from(original.children).forEach((child, index) => {
        if (clone.children[index]) {
          applyComputedStyles(child, clone.children[index]);
        }
      });
    };
    
    applyComputedStyles(receiptElement, clonedReceipt);

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert(t('financeApp.pay3.allowPopups'));
      return;
    }

    // Write to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Receipt - ${receiptData?.receiptNumber || 'DRAFT'}</title>
          <style>
            @page {
              size: A5 landscape;
              margin: 8mm;
            }
            body {
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background: #F2E7CE;
              font-family: 'Helvetica Neue', Arial, sans-serif;
            }
            @media print {
              body {
                background: #F2E7CE;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          ${clonedReceipt.outerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    
    console.log('Print window created, waiting to print...');
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      
      // Close after a short delay
      setTimeout(() => {
        printWindow.close();
      }, 100);
    }, 500);
  };

  // Open the receipt voucher (exact design) in a new window.
  // autoPrint = true  → opens + prints
  // autoPrint = false → opens for preview only (Show Receipt)
  const openReceiptVoucher = (invoice, autoPrint) => {
    if (!invoice) return;

    // Get student name from classDetails
    let studentName = 'Unknown';
    if (classDetails && classDetails.students) {
      const student = classDetails.students.find(s => s.studentId === selectedStudent);
      studentName = student?.studentName || 'Unknown';
    }

    const amount = invoice.paidAmount || invoice.totalAmount || 0;
    const studentIdText = invoice.studentId || selectedStudent || '';
    const classNameText = classDetails?.summary?.className || '';

    // Use the FIXED payment date (when the student paid), never today's date.
    // The date must not change day by day — it stays as the payment date.
    const receiptDate = invoice.paidDate
      ? new Date(invoice.paidDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = buildReceiptHtml({
      date: receiptDate,
      receiptNumber: invoice.receiptNumber || invoice.invoiceNumber || '',
      from: studentName,
      purpose: invoice.month ? `Monthly Tuition Fee - ${invoice.month}` : 'Monthly Tuition Fee',
      invoiceRef: invoice.invoiceNumber || '',
      invoiceRefCode: invoice.invoiceRefCode || '',
      remainder: invoice.paidAmount > 0 && invoice.totalAmount > 0
        ? `${Math.max(0, invoice.totalAmount - invoice.paidAmount).toFixed(2)} Birr`
        : '',
      amountWords: numberToWords(amount),
      amountFigures: amount.toFixed(2),
      cashier: '' // Cashier signs manually - leave empty
    });

    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) {
      alert(t('financeApp.pay3.allowPopupsView'));
      return;
    }

    win.document.write(html);
    win.document.close();

    if (autoPrint) {
      setTimeout(() => {
        win.focus();
        win.print();
        setTimeout(() => win.close(), 100);
      }, 500);
    }
  };

  // Print receipt using the exact voucher design
  const prepareAndPrintReceipt = async (invoice) => {
    console.log('Preparing receipt for invoice:', invoice);

    // Try to get existing receipt number for this invoice from backend
    let receiptNumber;
    try {
      const response = await api.get(`/finance/monthly-payments-view/invoice/${invoice.id}/receipt-number`);
      if (response.data.receiptNumber) {
        receiptNumber = response.data.receiptNumber;
        console.log('Using existing receipt number from backend:', receiptNumber);
      }
    } catch (error) {
      console.log('No existing receipt number found, will generate new one');
    }

    // If no existing receipt number, generate and save new one
    if (!receiptNumber) {
      receiptNumber = generateReceiptNumber(lastReceiptNumber);
      setLastReceiptNumber(parseInt(receiptNumber));
      console.log('Generated new receipt number:', receiptNumber);
      
      // Save the receipt number for this invoice
      try {
        await api.post(`/finance/monthly-payments-view/invoice/${invoice.id}/receipt-number`, {
          receiptNumber: receiptNumber
        });
        console.log('Saved receipt number to backend');
      } catch (error) {
        console.error('Error saving receipt number:', error);
      }
    }

    openReceiptVoucher({ ...invoice, receiptNumber }, true);
  };

  // Show receipt preview (no auto print)
  const showReceipt = async (invoice) => {
    console.log('Showing receipt for invoice:', invoice);

    let receiptNumber;
    try {
      const response = await api.get(`/finance/monthly-payments-view/invoice/${invoice.id}/receipt-number`);
      if (response.data.receiptNumber) {
        receiptNumber = response.data.receiptNumber;
      }
    } catch (error) {
      console.log('No existing receipt number found, will generate new one');
    }

    if (!receiptNumber) {
      receiptNumber = generateReceiptNumber(lastReceiptNumber);
      setLastReceiptNumber(parseInt(receiptNumber));
      try {
        await api.post(`/finance/monthly-payments-view/invoice/${invoice.id}/receipt-number`, {
          receiptNumber: receiptNumber
        });
      } catch (error) {
        console.error('Error saving receipt number:', error);
      }
    }

    openReceiptVoucher({ ...invoice, receiptNumber }, false);
  };

  const saveReceiptNumber = async (receiptNumber) => {
    try {
      await api.post('/finance/monthly-payments-view/receipts/save-number', { receiptNumber });
    } catch (error) {
      console.error('Error saving receipt number:', error);
    }
  };

  // Look up an invoice by its 10-digit reference code (works across branches)
  const handleInvoiceLookup = async (e) => {
    if (e) e.preventDefault();
    const code = invoiceLookupCode.trim().replace(/\D/g, '');
    if (!/^\d{10}$/.test(code)) {
      setInvoiceLookupError(t('financeApp.pay3.invalidInvoiceCode'));
      setInvoiceLookupResult(null);
      return;
    }
    setInvoiceLookupLoading(true);
    setInvoiceLookupError('');
    setInvoiceLookupResult(null);
    try {
      const response = await api.get(`/finance/monthly-payments-view/invoice-lookup/${code}`);
      setInvoiceLookupResult(response.data.data);
    } catch (error) {
      const msg = error.response?.data?.message 
        || error.response?.data?.error 
        || t('financeApp.pay3.failedInvoiceLookup');
      setInvoiceLookupError(msg);
    } finally {
      setInvoiceLookupLoading(false);
    }
  };

  const closeInvoiceLookup = () => {
    setShowInvoiceLookupModal(false);
    setInvoiceLookupCode('');
    setInvoiceLookupResult(null);
    setInvoiceLookupError('');
  };

  const formatLookupDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Check if month is unlocked based on current Ethiopian calendar
  const isMonthUnlocked = (monthNumber) => {
    return monthNumber <= currentEthiopianMonth;
  };

  // Check if student can pay this month (sequential payment logic)
  const canPayMonth = (invoice, allInvoices) => {
    // REMOVED: Lock check - students can now pay future/locked months
    // if (!isMonthUnlocked(invoice.monthNumber)) {
    //   return { canPay: false, reason: 'Month not yet unlocked' };
    // }

    if (invoice.status === 'PAID') {
      return { canPay: false, reason: t('financeApp.pay3.alreadyPaid') };
    }

    const previousMonths = allInvoices.filter(inv => inv.monthNumber < invoice.monthNumber);
    const unpaidPrevious = previousMonths.find(inv => inv.status !== 'PAID');
    
    if (unpaidPrevious) {
      return { canPay: false, reason: t('financeApp.pay3.mustPayFirst', { month: unpaidPrevious.month }) };
    }

    return { canPay: true, reason: '' };
  };

  // Validate reference number is unique
  const validateReference = async (reference, paymentMethod) => {
    if (paymentMethod === 'CASH') return true;
    if (!reference) return false;

    try {
      const response = await api.get(`/finance/payments/check-reference/${reference}`);
      return !response.data.exists;
    } catch (error) {
      console.error('Error validating reference:', error);
      return true;
    }
  };

  const calcRegAdjustedBalance = (invoice, rftype) => {
    if (invoice.oldRegistrationFee !== undefined && invoice.newRegistrationFee !== undefined) {
      // Strip the registration fee ACTUALLY applied to this invoice (student's stored fee type),
      // then add the fee for the selected type. Fixes wrong amount for students registered
      // under the OLD fee.
      const appliedType = invoice.studentType || 'new';
      const appliedReg = appliedType === 'old' ? invoice.oldRegistrationFee : invoice.newRegistrationFee;
      const baseFee = invoice.netAmount - appliedReg;
      const selectedReg = rftype === 'old' ? invoice.oldRegistrationFee : invoice.newRegistrationFee;
      return Math.max(0, baseFee + selectedReg - invoice.paidAmount);
    }
    return invoice.balance;
  };

  const handleRecordPayment = (invoice) => {
    const paymentCheck = canPayMonth(invoice, studentDetails.invoices);
    if (!paymentCheck.canPay) {
      alert(`${t('financeApp.pay3.cannotPayThisMonth')}${paymentCheck.reason}`);
      return;
    }

    const defaultRegType = invoice.studentType || 'new';
    setRegFeeType(defaultRegType);
    setSelectedInvoice(invoice);
    setPaymentForm({
      amount: calcRegAdjustedBalance(invoice, defaultRegType).toFixed(2),
      paymentMethod: 'CASH',
      paymentDate: getLocalDateStr(),
      reference: '',
      screenshot: null,
      notes: ''
    });
    setShowPaymentModal(true);
  };

  const handleMultiMonthPayment = () => {
    if (!studentDetails || !studentDetails.invoices) return;

    // Get all unpaid months (including locked ones) in sequence
    const sortedInvoices = [...studentDetails.invoices].sort((a, b) => a.monthNumber - b.monthNumber);
    const availableMonths = [];

    // Find the first unpaid month
    let foundFirstUnpaid = false;
    for (const invoice of sortedInvoices) {
      if (invoice.status === 'PAID') continue;
      
      // Once we find the first unpaid month, allow selecting it and all subsequent unpaid months
      if (!foundFirstUnpaid) {
        foundFirstUnpaid = true;
      }
      
      if (foundFirstUnpaid && invoice.balance > 0) {
        availableMonths.push(invoice);
      }
    }

    if (availableMonths.length === 0) {
      alert(t('financeApp.pay3.noMonthsAvailable'));
      return;
    }

    // Auto-select the first unpaid month
    setSelectedMonths([availableMonths[0]]);
    setPaymentForm({
      amount: availableMonths[0].balance.toFixed(2),
      paymentMethod: 'CASH',
      paymentDate: getLocalDateStr(),
      reference: '',
      screenshot: null,
      notes: ''
    });
    setShowMultiMonthModal(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    // Validate reference uniqueness if provided
    const selectedMethod = paymentMethods.find(m => m.value === paymentForm.paymentMethod);
    if (selectedMethod?.requiresReference && paymentForm.reference) {
      const isUnique = await validateReference(paymentForm.reference, paymentForm.paymentMethod);
      if (!isUnique) {
        alert(t('financeApp.pay3.duplicateReference'));
        return;
      }
    }

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('invoiceId', selectedInvoice.id);
      formData.append('amount', parseFloat(paymentForm.amount));
      formData.append('paymentMethod', paymentForm.paymentMethod);
      formData.append('paymentDate', new Date(paymentForm.paymentDate).toISOString());
      if (selectedInvoice.oldRegistrationFee !== undefined) {
        formData.append('registrationFeeType', regFeeType);
      }
      if (paymentForm.reference) formData.append('reference', paymentForm.reference);
      if (paymentForm.notes) formData.append('notes', paymentForm.notes);
      if (paymentForm.screenshot) formData.append('screenshot', paymentForm.screenshot);

      await api.post('/finance/payments', formData);
      
      alert(t('financeApp.pay3.paymentRecorded'));
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      
      // Refresh data
      if (selectedStudent) {
        await fetchStudentDetails();
      }
      if (selectedClass) {
        await fetchClassDetails();
      }
      await fetchOverview();
    } catch (error) {
      console.error('Error recording payment:', error);
      alert(t('financeApp.pay3.failedRecordPayment') + (error.response?.data?.message || error.message));
    }
  };

  const handleSubmitMultiMonthPayment = async (e) => {
    e.preventDefault();

    // Validate reference number for non-cash payments
    const selectedMethod = paymentMethods.find(m => m.value === paymentForm.paymentMethod);
    if (selectedMethod?.requiresReference && !paymentForm.reference) {
      alert(t('financeApp.pay3.referenceRequired'));
      return;
    }

    // Check reference uniqueness for non-cash payments
    if (selectedMethod?.requiresReference) {
      const isUnique = await validateReference(paymentForm.reference, paymentForm.paymentMethod);
      if (!isUnique) {
        alert(t('financeApp.pay3.duplicateReference'));
        return;
      }
    }

    try {
      // ONE payment covering ALL selected months → ONE receipt + ONE SMS
      const payload = {
        invoiceIds: selectedMonths.map(inv => inv.id),
        amounts: selectedMonths.map(inv => inv.balance),
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: new Date(paymentForm.paymentDate).toISOString()
      };
      if (paymentForm.reference) payload.reference = paymentForm.reference;
      if (paymentForm.notes) payload.notes = paymentForm.notes;

      const response = await api.post('/finance/payments/multi', payload);

      alert(t('financeApp.pay3.successfullyPaid', { count: selectedMonths.length }));
      setShowMultiMonthModal(false);
      setSelectedMonths([]);

      // Open the ONE receipt voucher for the whole batch (total + all months)
      if (response.data?.data) {
        const batch = response.data.data;
        openReceiptVoucher({
          id: selectedMonths[0].id,
          studentId: selectedStudent,
          paidDate: paymentForm.paymentDate,
          paidAmount: batch.totalAmount,
          totalAmount: batch.totalAmount,
          receiptNumber: batch.receiptNumber,
          month: (batch.months || []).filter(Boolean).join(' & '),
          invoiceRefCode: (batch.invoiceRefCodes || []).filter(Boolean).join(', '),
          invoiceRef: ''
        }, true);
      }

      // Refresh data
      if (selectedStudent) {
        await fetchStudentDetails();
      }
      if (selectedClass) {
        await fetchClassDetails();
      }
      await fetchOverview();
    } catch (error) {
      console.error('Error recording multi-month payment:', error);
      alert(t('financeApp.pay3.failedRecordPayment') + (error.response?.data?.message || error.message));
    }
  };

  const toggleMonthSelection = (invoice) => {
    const isSelected = selectedMonths.find(m => m.id === invoice.id);
    let newSelection;

    if (isSelected) {
      // Remove this month and all months after it
      newSelection = selectedMonths.filter(m => m.monthNumber < invoice.monthNumber);
    } else {
      // Check if this month can be added (must be sequential)
      const sortedSelected = [...selectedMonths].sort((a, b) => a.monthNumber - b.monthNumber);
      
      if (sortedSelected.length === 0) {
        // First selection - must be the first unpaid month
        const firstUnpaid = studentDetails.invoices
          .filter(inv => inv.balance > 0)
          .sort((a, b) => a.monthNumber - b.monthNumber)[0];
        
        if (invoice.id !== firstUnpaid.id) {
          alert(t('financeApp.pay3.startWithMonth', { month: firstUnpaid.month }));
          return;
        }
        newSelection = [invoice];
      } else {
        // Check if this is the next sequential month
        const lastSelected = sortedSelected[sortedSelected.length - 1];
        const nextMonths = studentDetails.invoices
          .filter(inv => inv.monthNumber > lastSelected.monthNumber && inv.balance > 0)
          .sort((a, b) => a.monthNumber - b.monthNumber);
        
        if (nextMonths.length === 0 || nextMonths[0].id !== invoice.id) {
          alert(t('financeApp.pay3.selectSequential'));
          return;
        }
        
        newSelection = [...selectedMonths, invoice].sort((a, b) => a.monthNumber - b.monthNumber);
      }
    }

    setSelectedMonths(newSelection);
    
    // Update total amount
    const totalAmount = newSelection.reduce((sum, inv) => sum + inv.balance, 0);
    setPaymentForm({
      ...paymentForm,
      amount: totalAmount.toFixed(2)
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PAID':
        return styles.statusPaid;
      case 'PARTIALLY_PAID':
        return styles.statusPartial;
      case 'OVERDUE':
        return styles.statusOverdue;
      default:
        return styles.statusPending;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PAID':
        return t('financeApp.pay3.statusPaidShort');
      case 'PARTIALLY_PAID':
        return t('financeApp.pay3.statusPartialShort');
      case 'OVERDUE':
        return t('financeApp.pay3.statusOverdueShort');
      case 'ISSUED':
        return t('financeApp.pay3.statusUnpaidShort');
      default:
        return status;
    }
  };

  // Filter students by payment date
  const filterStudentsByDate = (student) => {
    if (dateFilter === 'ALL') return true;
    if (!student.lastPaymentDate) return false;

    const paymentDate = new Date(student.lastPaymentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateFilter) {
      case 'TODAY':
        const todayStart = new Date(today);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        return paymentDate >= todayStart && paymentDate <= todayEnd;

      case 'THIS_WEEK':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return paymentDate >= weekStart && paymentDate <= weekEnd;

      case 'THIS_MONTH':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        return paymentDate >= monthStart && paymentDate <= monthEnd;

      case 'CUSTOM':
        if (!customStartDate && !customEndDate) return true;
        const start = customStartDate ? new Date(customStartDate) : new Date(0);
        const end = customEndDate ? new Date(customEndDate) : new Date();
        end.setHours(23, 59, 59, 999);
        return paymentDate >= start && paymentDate <= end;

      default:
        return true;
    }
  };

  const filterStudentsByStatus = (student) => {
    if (classFilterStatus === 'ALL') return true;
    if (classFilterStatus === 'PAID') {
      // Show students who have at least one paid invoice
      return student.monthStatuses && student.monthStatuses.some(month => month.isPaid);
    }
    if (classFilterStatus === 'UNPAID') {
      // Show students who have at least one unpaid unlocked month
      return student.monthStatuses && student.monthStatuses.some(month => month.isUnlocked && !month.isPaid);
    }
    return true;
  };

  // Handle card click to show details
  const handleCardClick = (cardType) => {
    if (!classDetails) return;

    let data = null;

    switch (cardType) {
      case 'TOTAL_STUDENTS':
        data = {
          title: t('financeApp.pay2.cardAllStudents'),
          students: classDetails.students.map(s => ({
            studentId: s.studentId,
            studentName: s.studentName,
            totalAmount: s.unlockedTotalAmount,
            totalPaid: s.unlockedTotalPaid,
            balance: s.unlockedTotalBalance,
            status: s.status
          }))
        };
        break;

      case 'PAID_STUDENTS':
        data = {
          title: t('financeApp.pay2.cardPaidStudents'),
          students: classDetails.students
            .filter(s => s.status === 'PAID')
            .map(s => ({
              studentId: s.studentId,
              studentName: s.studentName,
              totalAmount: s.unlockedTotalAmount,
              totalPaid: s.unlockedTotalPaid,
              balance: s.unlockedTotalBalance,
              status: s.status
            }))
        };
        break;

      case 'UNPAID_STUDENTS':
        data = {
          title: t('financeApp.pay2.cardUnpaidStudents'),
          students: classDetails.students
            .filter(s => s.status === 'UNPAID' || s.status === 'PARTIAL')
            .map(s => ({
              studentId: s.studentId,
              studentName: s.studentName,
              totalAmount: s.unlockedTotalAmount,
              totalPaid: s.unlockedTotalPaid,
              balance: s.unlockedTotalBalance,
              status: s.status,
              unpaidMonths: s.unlockedUnpaidMonths
            }))
        };
        break;

      case 'TOTAL_AMOUNT':
        data = {
          title: t('financeApp.pay2.totalAmountBreakdown'),
          students: classDetails.students.map(s => ({
            studentId: s.studentId,
            studentName: s.studentName,
            totalAmount: s.unlockedTotalAmount,
            totalPaid: s.unlockedTotalPaid,
            balance: s.unlockedTotalBalance,
            status: s.status
          }))
        };
        break;

      case 'TOTAL_PAID':
        data = {
          title: t('financeApp.pay2.totalPaidBreakdown'),
          students: classDetails.students
            .filter(s => s.unlockedTotalPaid > 0)
            .map(s => ({
              studentId: s.studentId,
              studentName: s.studentName,
              totalAmount: s.unlockedTotalAmount,
              totalPaid: s.unlockedTotalPaid,
              balance: s.unlockedTotalBalance,
              status: s.status
            }))
        };
        break;

      case 'TOTAL_PENDING':
        data = {
          title: t('financeApp.pay2.totalPendingBreakdown'),
          students: classDetails.students
            .filter(s => s.unlockedTotalBalance > 0)
            .map(s => ({
              studentId: s.studentId,
              studentName: s.studentName,
              totalAmount: s.unlockedTotalAmount,
              totalPaid: s.unlockedTotalPaid,
              balance: s.unlockedTotalBalance,
              status: s.status,
              unpaidMonths: s.unlockedUnpaidMonths
            }))
        };
        break;

      default:
        return;
    }

    setSelectedCardType(cardType);
    setCardDetailsData(data);
    setShowCardDetailsModal(true);
  };

  // Export to PDF function - Export all classes with student details
  const handleExportPDF = async () => {
    if (!overview) {
      alert(t('financeApp.pay3.noDataToExport'));
      return;
    }

    try {
      setLoading(true);
      
      let reportContent = `ALL CLASSES PAYMENT REPORT
Generated: ${new Date().toLocaleString()}

OVERALL SUMMARY:
- Total Classes: ${overview.summary.totalClasses}
- Total Students: ${overview.summary.totalStudents}
- Total Invoices: ${overview.summary.totalInvoices}
- Paid Invoices: ${overview.summary.totalPaid}
- Unpaid Invoices: ${overview.summary.totalUnpaid + overview.summary.totalPartial}
- Total Collected (Unlocked): ${(overview.summary.unlockedTotalPaid || overview.summary.totalCollected).toFixed(2)} Birr
- Total Pending (Unlocked): ${(overview.summary.unlockedTotalPending || overview.summary.totalPending).toFixed(2)} Birr

================================================================================
`;

      // Fetch details for each class
      for (const classData of overview.classes) {
        reportContent += `

CLASS: ${classData.className}
Monthly Fee: ${classData.monthlyFee} Birr
================================================================================

CLASS SUMMARY:
- Total Students: ${classData.totalStudents}
- Paid Invoices: ${classData.paidInvoices}
- Unpaid Invoices: ${classData.unpaidInvoices + classData.partialInvoices}
- Total Collected: ${classData.totalPaid.toFixed(2)} Birr
- Total Pending: ${classData.totalPending.toFixed(2)} Birr

STUDENT DETAILS:
`;

        try {
          // Fetch class details with students
          const response = await api.get(`/finance/monthly-payments-view/class/${classData.className}?currentMonth=${currentEthiopianMonth}`);
          const classDetails = response.data;

          if (classDetails.students && classDetails.students.length > 0) {
            classDetails.students.forEach((student, index) => {
              reportContent += `
${index + 1}. ${student.studentName || 'Unknown'}
   Student ID: ${student.studentId}
   Total Amount (Unlocked): ${student.unlockedTotalAmount.toFixed(2)} Birr
   Total Paid (All Months): ${student.totalPaid.toFixed(2)} Birr
   Balance (Unlocked): ${student.unlockedTotalBalance.toFixed(2)} Birr
   Unpaid Months (Unlocked): ${student.unlockedUnpaidMonths}
   Status: ${student.status}
   Last Payment: ${student.lastPaymentDate ? new Date(student.lastPaymentDate).toLocaleDateString() : 'No payment yet'}
`;
            });
          } else {
            reportContent += `   No students found in this class.\n`;
          }
        } catch (error) {
          console.error(`Error fetching details for ${classData.className}:`, error);
          reportContent += `   Error loading student details for this class.\n`;
        }

        reportContent += `\n${'='.repeat(80)}\n`;
      }

      // Create blob and download
      const blob = new Blob([reportContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-classes-payment-report-${getLocalDateStr()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert(t('financeApp.pay3.exportSuccess'));
    } catch (error) {
      console.error('Error exporting report:', error);
      alert(t('financeApp.pay3.exportFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Export to Excel function - Export all classes with student details
  const handleExportExcel = async () => {
    if (!overview) {
      alert(t('financeApp.pay3.noDataToExport'));
      return;
    }

    try {
      setLoading(true);
      
      let csvContent = `All Classes Payment Report\n`;
      csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;
      
      csvContent += 'OVERALL SUMMARY\n';
      csvContent += 'Metric,Value\n';
      csvContent += `Total Classes,${overview.summary.totalClasses}\n`;
      csvContent += `Total Students,${overview.summary.totalStudents}\n`;
      csvContent += `Total Invoices,${overview.summary.totalInvoices}\n`;
      csvContent += `Paid Invoices,${overview.summary.totalPaid}\n`;
      csvContent += `Unpaid Invoices,${overview.summary.totalUnpaid + overview.summary.totalPartial}\n`;
      csvContent += `Total Collected (Unlocked),${(overview.summary.unlockedTotalPaid || overview.summary.totalCollected).toFixed(2)} Birr\n`;
      csvContent += `Total Pending (Unlocked),${(overview.summary.unlockedTotalPending || overview.summary.totalPending).toFixed(2)} Birr\n\n`;

      csvContent += 'ALL STUDENTS BY CLASS\n';
      csvContent += 'Class Name,Student No.,Student Name,Student ID,Total Amount (Unlocked),Total Paid (All Months),Balance (Unlocked),Unpaid Months,Status,Last Payment Date\n';

      // Fetch details for each class
      for (const classData of overview.classes) {
        try {
          // Fetch class details with students
          const response = await api.get(`/finance/monthly-payments-view/class/${classData.className}?currentMonth=${currentEthiopianMonth}`);
          const classDetails = response.data;

          if (classDetails.students && classDetails.students.length > 0) {
            classDetails.students.forEach((student, index) => {
              csvContent += `"${classData.className}",${index + 1},"${student.studentName || 'Unknown'}",${student.studentId},${student.unlockedTotalAmount.toFixed(2)},${student.totalPaid.toFixed(2)},${student.unlockedTotalBalance.toFixed(2)},${student.unlockedUnpaidMonths},${student.status},"${student.lastPaymentDate ? new Date(student.lastPaymentDate).toLocaleDateString() : 'No payment yet'}"\n`;
            });
          }
        } catch (error) {
          console.error(`Error fetching details for ${classData.className}:`, error);
          csvContent += `"${classData.className}",,"Error loading student details",,,,,,\n`;
        }
      }

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-classes-payment-report-${getLocalDateStr()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert(t('financeApp.pay3.exportSuccess'));
    } catch (error) {
      console.error('Error exporting report:', error);
      alert(t('financeApp.pay3.exportFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderMonthCircles = (monthStatuses) => {
    if (!monthStatuses || monthStatuses.length === 0) return null;

    return (
      <div className={styles.monthCircles}>
        {monthStatuses.map((month, index) => {
          let circleClass = styles.circleUnpaid; // Red for unpaid
          
          if (month.isPaid) {
            circleClass = styles.circlePaid; // Green for paid
          } else if (!month.isUnlocked) {
            circleClass = styles.circleLocked; // Blue for locked
          }

          return (
            <div 
              key={index} 
              className={`${styles.monthCircle} ${circleClass}`}
              title={`${month.month}: ${month.isPaid ? 'Paid' + (month.paidDate ? ' on ' + new Date(month.paidDate).toLocaleDateString() : '') : month.isUnlocked ? 'Unpaid' : 'Locked'}`}
            >
              {month.monthNumber}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{t('financeApp.pay1.title')}</h1>
          <p>{t('financeApp.pay1.subtitle')}</p>
          <div style={{ 
            marginTop: '10px', 
            padding: '8px 15px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            borderRadius: '8px',
            display: 'inline-block',
            fontSize: '0.9em',
            fontWeight: '500'
          }}>
            {t('financeApp.pay1.currentEthiopianDate')}{(() => {
              const current = getEthiopianDate();
              return `${current.day} ${current.monthNameEn} ${current.year}`;
            })()}
          </div>
        </div>
        <div className={styles.exportButtons}>
          <button 
            className={styles.exportButton}
            onClick={() => {
              setShowInvoiceLookupModal(true);
              setInvoiceLookupError('');
              setInvoiceLookupResult(null);
            }}
            title={t('financeApp.pay3.checkInvoiceTitle')}
          >
            🔍 {t('financeApp.pay3.checkInvoice')}
          </button>
          <button 
            className={styles.exportButton}
            onClick={() => handleExportPDF()}
            title={t('financeApp.pay1.exportPdfTitle')}
          >
            {t('financeApp.pay1.exportPdf')}
          </button>
          <button 
            className={styles.exportButton}
            onClick={() => handleExportExcel()}
            title={t('financeApp.pay1.exportExcelTitle')}
          >
            {t('financeApp.pay1.exportExcel')}
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>{t('financeApp.pay1.loading')}</div>}

      {/* Overview Section */}
      {overview && !selectedClass && !selectedStudent && (
        <div className={styles.overviewSection}>
          <h2>{t('financeApp.pay1.overviewTitle')}</h2>
          
          {/* No summary cards - go straight to classes */}

          <div className={styles.classesSection}>
            <h2>{t('financeApp.pay1.classesTitle')}</h2>
            <div className={styles.classGrid}>
              {overview.classes.map((classData, index) => (
                <div 
                  key={index} 
                  className={styles.classCard}
                  onClick={() => setSelectedClass(classData.className)}
                >
                  <h3>{classData.className}</h3>
                  <div className={styles.classStats}>
                    <div className={styles.stat}>
                      <span className={styles.label}>{t('financeApp.pay1.totalStudentsLabel')}</span>
                      <span className={styles.value}>{classData.totalStudents}</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.label}>{t('financeApp.pay1.unpaidStudentsLabel')}</span>
                      <span className={styles.value}>{classData.unpaidUnlockedStudents || 0}</span>
                    </div>
                  </div>
                  <button className={styles.viewButton}>{t('financeApp.pay1.viewStudents')} →</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Class Details Section */}
      {classDetails && selectedClass && !selectedStudent && (
        <div className={styles.classDetailsSection}>
          <div className={styles.backButton}>
            <button onClick={() => {
              setSelectedClass(null);
              setClassDetails(null);
            }}>
              {t('financeApp.pay1.backToOverview')}
            </button>
          </div>

          <h2>{classDetails.summary.className}{t('financeApp.pay1.studentBalancesSuffix')}</h2>

          {/* Show only Unpaid Students count */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            background: 'var(--color-surface)',
            padding: '20px 30px',
            borderRadius: '12px',
            marginBottom: '20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
          }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#718096', fontSize: '0.9em', fontWeight: '500' }}>{t('financeApp.pay1.unpaidUnlockedTitle')}</h3>
              <p style={{ margin: 0, fontSize: '2.5em', fontWeight: 'bold', color: '#dc3545' }}>
                {classDetails.summary.unpaidCount + classDetails.summary.partialCount}
              </p>
              <p style={{ margin: '5px 0 0 0', fontSize: '0.85em', color: '#718096' }}>
                {t('financeApp.pay1.unpaidUnlockedDesc')}
              </p>
            </div>
            <div style={{ fontSize: '4em', opacity: 0.2 }}>⚠️</div>
          </div>

          <div className={styles.filterBar}>
            <h3>{t('financeApp.pay1.filterStudents')}</h3>
            <select 
              value={classFilterStatus} 
              onChange={(e) => setClassFilterStatus(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="ALL">{t('financeApp.pay1.allStudents')}</option>
              <option value="PAID">{t('financeApp.pay1.studentsWithPaid')}</option>
              <option value="UNPAID">{t('financeApp.pay1.studentsWithUnpaid')}</option>
            </select>

            <select 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="ALL">{t('financeApp.pay1.allTime')}</option>
              <option value="TODAY">{t('financeApp.pay1.today')}</option>
              <option value="THIS_WEEK">{t('financeApp.pay1.thisWeek')}</option>
              <option value="THIS_MONTH">{t('financeApp.pay1.thisMonth')}</option>
              <option value="CUSTOM">{t('financeApp.pay1.customDateRange')}</option>
            </select>

            {dateFilter === 'CUSTOM' && (
              <>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className={styles.dateInput}
                  placeholder={t('financeApp.pay1.startDatePlaceholder')}
                />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className={styles.dateInput}
                  placeholder={t('financeApp.pay1.endDatePlaceholder')}
                />
              </>
            )}
          </div>

          <div className={styles.circlesLegend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendCircle} ${styles.circlePaid}`}></div>
              <span>{t('financeApp.pay1.legendPaid')}</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendCircle} ${styles.circleUnpaid}`}></div>
              <span>{t('financeApp.pay1.legendUnpaid')}</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendCircle} ${styles.circleLocked}`}></div>
              <span>{t('financeApp.pay1.legendLocked')}</span>
            </div>
          </div>

          <div className={styles.studentsTable}>
            <h3>{t('financeApp.pay1.studentList')}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t('financeApp.pay1.thStudentId')}</th>
                  <th>{t('financeApp.pay1.thStudentName')}</th>
                  <th>{t('financeApp.pay1.thTotalAmount')}</th>
                  <th>{t('financeApp.pay1.thTotalPaid')}</th>
                  <th>{t('financeApp.pay1.thBalance')}</th>
                  <th>{t('financeApp.pay1.thUnpaidMonths')}</th>
                  <th>{t('financeApp.pay1.thLastPayment')}</th>
                  <th>{t('financeApp.pay1.thStatus')}</th>
                  <th>{t('financeApp.pay1.thProgress')}</th>
                  <th>{t('financeApp.pay1.thActions')}</th>
                </tr>
              </thead>
              <tbody>
                {classDetails.students
                  .filter(student => filterStudentsByStatus(student) && filterStudentsByDate(student))
                  .map((student, index) => (
                  <tr key={index} className={student.is_free ? styles.exemptRow : ''}>
                    <td>{student.studentId}</td>
                    <td>
                      <strong>{student.studentName || t('financeApp.shell.common.unknown')}</strong>
                      {student.is_free && (
                        <span 
                          style={{
                            marginLeft: '8px',
                            padding: '4px 10px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            borderRadius: '12px',
                            fontSize: '0.75em',
                            fontWeight: 'bold',
                            display: 'inline-block'
                          }}
                          title={`${student.exemption_type || t('financeApp.pay1.exempted')}: ${student.exemption_reason || t('financeApp.pay1.noReason')}`}
                        >
                          🎓 {student.exemption_type || 'FREE'}
                        </span>
                      )}
                    </td>
                    <td>
                      {student.is_free ? (
                        <span style={{ color: '#667eea', fontWeight: 'bold' }}>{t('financeApp.pay1.exempted')}</span>
                      ) : (
                        `${student.unlockedTotalAmount.toFixed(2)} ${t('financeApp.shell.common.birr')}`
                      )}
                    </td>
                    <td>
                      {student.is_free ? (
                        <span style={{ color: '#667eea', fontWeight: 'bold' }}>-</span>
                      ) : (
                        <strong style={{ color: '#28a745' }}>{student.totalPaid.toFixed(2)} {t('financeApp.shell.common.birr')}</strong>
                      )}
                    </td>
                    <td>
                      {student.is_free ? (
                        <span style={{ color: '#667eea', fontWeight: 'bold' }}>-</span>
                      ) : (
                        <strong>{student.unlockedTotalBalance.toFixed(2)} {t('financeApp.shell.common.birr')}</strong>
                      )}
                    </td>
                    <td>
                      {student.is_free ? (
                        <span style={{ color: '#667eea', fontWeight: 'bold' }}>-</span>
                      ) : (
                        student.unlockedUnpaidMonths
                      )}
                    </td>
                    <td>
                      {student.lastPaymentDate ? (
                        <span className={styles.paymentDate}>
                          {new Date(student.lastPaymentDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className={styles.noPayment}>{t('financeApp.pay1.noPaymentYet')}</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${getStatusColor(student.status)}`}>
                        {student.is_free ? t('financeApp.pay3.exemptStatus') : getStatusText(student.status)}
                      </span>
                    </td>
                    <td>
                      {renderMonthCircles(student.monthStatuses)}
                    </td>
                    <td>
                      <button 
                        className={styles.viewButton}
                        onClick={() => setSelectedStudent(student.studentId)}
                      >
                        {t('financeApp.pay1.viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {classDetails.students.filter(student => filterStudentsByStatus(student) && filterStudentsByDate(student)).length === 0 && (
              <p className={styles.noResults}>{t('financeApp.pay1.noStudentsFound')}</p>
            )}
          </div>
        </div>
      )}

      {/* Student Details Section */}
      {studentDetails && selectedStudent && (
        <div className={styles.studentDetailsSection}>
          <div className={styles.backButton}>
            <button onClick={() => {
              setSelectedStudent(null);
              setStudentDetails(null);
            }}>
              {t('financeApp.pay1.backToClass')}
            </button>
          </div>

          <h2>{t('financeApp.pay1.studentPrefix')}{classDetails?.students?.find(s => s.studentId === selectedStudent)?.studentName || t('financeApp.shell.common.unknown')}</h2>

          {/* Show exemption notice if student is exempt */}
          {exemptionForm.is_free && (
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: '12px',
              marginBottom: '20px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5em' }}>{t('financeApp.pay1.exemptStudent')}</h3>
              <p style={{ margin: '5px 0', fontSize: '1.1em', fontWeight: 'bold' }}>
                {exemptionForm.exemption_type || t('financeApp.pay1.learningForFree')}
              </p>
              {exemptionForm.exemption_reason && (
                <p style={{ margin: '10px 0 0 0', fontSize: '0.95em', opacity: 0.9 }}>
                  {exemptionForm.exemption_reason}
                </p>
              )}
              <p style={{ margin: '15px 0 0 0', fontSize: '0.9em', opacity: 0.85 }}>
                {t('financeApp.pay1.exemptDescription')}
              </p>
            </div>
          )}

          <div className={styles.summaryCards}>
            <div className={styles.card} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
              <h3 style={{ color: 'white', opacity: 0.9, fontSize: '0.9em', marginBottom: '10px' }}>{t('financeApp.pay1.totalInvoices')}</h3>
              <p className={styles.bigNumber} style={{ color: 'white' }}>{studentDetails.totalInvoices}</p>
            </div>
            <div className={`${styles.card} ${styles.cardWarning}`} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
              <h3 style={{ color: 'white', opacity: 0.9, fontSize: '0.9em', marginBottom: '10px' }}>{t('financeApp.pay1.unpaidMonthsCard')}</h3>
              <p className={styles.bigNumber} style={{ color: 'white' }}>{studentDetails.unpaidMonths}</p>
            </div>
            <div className={`${styles.card} ${styles.cardInfo}`} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
              <h3 style={{ color: 'white', opacity: 0.9, fontSize: '0.9em', marginBottom: '10px' }}>{t('financeApp.pay1.currentMonthCard')}</h3>
              <p className={styles.bigNumber} style={{ color: 'white' }}>{ethiopianMonths[currentEthiopianMonth - 1]}</p>
            </div>
          </div>

          <div className={styles.actionsBar}>
            <button 
              className={styles.multiMonthButton}
              onClick={handleMultiMonthPayment}
              disabled={exemptionForm.is_free}
              style={{
                opacity: exemptionForm.is_free ? 0.5 : 1,
                cursor: exemptionForm.is_free ? 'not-allowed' : 'pointer'
              }}
              title={exemptionForm.is_free ? t('financeApp.pay1.exemptFromPayments') : ''}
            >
              {t('financeApp.pay1.payMultipleMonths')}
            </button>
            <button 
              className={styles.exemptionButton}
              onClick={() => setShowExemptionModal(true)}
              style={{ 
                marginLeft: '10px',
                background: exemptionForm.is_free ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#6c757d',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.95em',
                fontWeight: '500'
              }}
            >
              🎓 {exemptionForm.is_free ? `${t('financeApp.pay1.freeButtonPrefix')}${exemptionForm.exemption_type})` : t('financeApp.pay1.manageExemption')}
            </button>
            <button
              onClick={() => navigate('/finance/student-exemption')}
              style={{
                marginLeft: '10px',
                background: 'transparent',
                color: '#667eea',
                border: '1px solid #667eea',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.95em',
                fontWeight: '500'
              }}
            >
              📋 {t('financeApp.pay1.exemptionPage') || 'All Exemptions'}
            </button>
            <div className={styles.filters}>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="ALL">{t('financeApp.pay1.allStatus')}</option>
                <option value="PAID">{t('financeApp.pay3.statusPaidShort')}</option>
                <option value="PARTIALLY_PAID">{t('financeApp.pay1.partiallyPaid')}</option>
                <option value="ISSUED">{t('financeApp.pay1.pendingLabel')}</option>
                <option value="OVERDUE">{t('financeApp.pay3.statusOverdueShort')}</option>
              </select>
              <select 
                value={filterMonth} 
                onChange={(e) => setFilterMonth(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="ALL">{t('financeApp.pay1.allMonths')}</option>
                {ethiopianMonths.map((month, index) => (
                  <option key={index} value={month}>{month}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.invoicesTable}>
            <h3>{t('financeApp.pay1.invoiceBreakdown')}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t('financeApp.pay1.thMonth')}</th>
                  <th>{t('financeApp.pay1.thInvoiceNumber')}</th>
                  <th>{t('financeApp.pay1.thAmount')}</th>
                  <th>{t('financeApp.pay1.thPaid')}</th>
                  <th>{t('financeApp.pay1.thBalance')}</th>
                  <th>{t('financeApp.pay1.thDueDate')}</th>
                  <th>{t('financeApp.pay1.thStatus')}</th>
                  <th>{t('financeApp.pay1.thAction')}</th>
                  <th>{t('financeApp.pay1.thPrint')}</th>
                </tr>
              </thead>
              <tbody>
                {studentDetails.invoices
                  .filter(invoice => {
                    if (filterStatus !== 'ALL' && invoice.status !== filterStatus) return false;
                    if (filterMonth !== 'ALL' && invoice.month !== filterMonth) return false;
                    return true;
                  })
                  .map((invoice, index) => {
                    const locked = !isMonthUnlocked(invoice.monthNumber);
                    const paymentCheck = canPayMonth(invoice, studentDetails.invoices);
                    
                    return (
                      <tr key={index} className={`
                        ${invoice.isOverdue ? styles.overdueRow : ''} 
                        ${locked ? styles.lockedRow : ''}
                      `}>
                        <td>
                          <strong>{invoice.month}</strong>
                          {locked && <span className={styles.lockIcon}> 🔒</span>}
                        </td>
                        <td>{invoice.invoiceNumber}</td>
                        <td>{invoice.netAmount.toFixed(2)} {t('financeApp.shell.common.birr')}</td>
                        <td>{invoice.paidAmount.toFixed(2)} {t('financeApp.shell.common.birr')}</td>
                        <td><strong>{invoice.balance.toFixed(2)} {t('financeApp.shell.common.birr')}</strong></td>
                        <td>
                          <div style={{ fontSize: '0.9em' }}>
                            {invoice.multipleDueDates && invoice.multipleDueDates.length > 0 ? (
                              // Show multiple due dates if available
                              invoice.multipleDueDates.map((dueDateInfo, idx) => (
                                <div key={idx} style={{ marginBottom: idx < invoice.multipleDueDates.length - 1 ? '8px' : '0', paddingBottom: idx < invoice.multipleDueDates.length - 1 ? '8px' : '0', borderBottom: idx < invoice.multipleDueDates.length - 1 ? '1px solid #eee' : 'none' }}>
                                  <div style={{ fontWeight: idx === 0 ? 'bold' : 'normal' }}>
                                    {formatEthiopianDate(dueDateInfo.dueDate)}
                                    {invoice.multipleDueDates.length > 1 && (
                                      <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '4px' }}>
                                        ({dueDateInfo.ruleName}: +{dueDateInfo.penaltyValue} {t('financeApp.shell.common.birr')})
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ color: '#666', fontSize: '0.85em' }}>
                                    {new Date(dueDateInfo.dueDate).toLocaleDateString()}
                                  </div>
                                </div>
                              ))
                            ) : (
                              // Fallback to single due date
                              <>
                                <div>{formatEthiopianDate(invoice.dueDate)}</div>
                                <div style={{ color: '#666', fontSize: '0.85em' }}>
                                  {new Date(invoice.dueDate).toLocaleDateString()}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${getStatusColor(invoice.status)}`}>
                            {getStatusText(invoice.status)}
                          </span>
                          {invoice.isOverdue && <span className={styles.overdueLabel}> {t('financeApp.pay3.statusOverdueShort')}</span>}
                        </td>
                        <td>
                          {invoice.balance > 0 ? (
                            exemptionForm.is_free ? (
                              <span className={styles.exemptLabel} style={{ color: '#667eea', fontWeight: 'bold' }}>
                                {t('financeApp.pay3.statusExemptShort')}
                              </span>
                            ) : !paymentCheck.canPay ? (
                              <span className={styles.blockedLabel} title={paymentCheck.reason}>
                                {t('financeApp.pay3.statusBlockedShort')}
                              </span>
                            ) : (
                              <button 
                                className={styles.payButton}
                                onClick={() => handleRecordPayment(invoice)}
                              >
                                {t('financeApp.pay1.payPrefix')}{locked && '🔒'}
                              </button>
                            )
                          ) : (
                            <span className={styles.paidLabel}>{t('financeApp.pay3.statusPaidShort')}</span>
                          )}
                        </td>
                        <td>
                          {invoice.paidAmount > 0 ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button 
                                className={styles.printButton}
                                onClick={() => prepareAndPrintReceipt(invoice)}
                                title={t('financeApp.pay1.printReceipt')}
                              >
                                {t('financeApp.pay1.printShort')}
                              </button>
                              <button 
                                className={styles.printButton}
                                onClick={() => showReceipt(invoice)}
                                title={t('financeApp.pay1.showReceiptPreview')}
                              >
                                {t('financeApp.pay1.showShort')}
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: '#999', fontSize: '0.85em' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Payment History Section */}
          <div className={styles.paymentHistory}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>{t('financeApp.pay1.paymentHistory')}</h3>
              <button 
                className={styles.viewButton}
                onClick={fetchPaymentHistory}
                style={{ padding: '8px 16px', fontSize: '0.9em' }}
              >
                {t('financeApp.pay1.viewDetailsShort')}
              </button>
            </div>
            {studentDetails.invoices
              .filter(inv => inv.paidAmount > 0)
              .sort((a, b) => b.monthNumber - a.monthNumber)
              .map((invoice, index) => (
                <div key={index} className={styles.historyItem}>
                  <span className={styles.historyMonth}>{invoice.month}</span>
                  <span className={styles.historyAmount}>{invoice.paidAmount.toFixed(2)} {t('financeApp.shell.common.birr')}</span>
                  <span className={styles.historyStatus}>
                    {invoice.status === 'PAID' ? t('financeApp.pay1.fullyPaid') : t('financeApp.pay1.partiallyPaidStatus')}
                  </span>
                </div>
              ))}
            {studentDetails.invoices.filter(inv => inv.paidAmount > 0).length === 0 && (
              <p className={styles.noHistory}>{t('financeApp.pay1.noHistory')}</p>
            )}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className={styles.modal} onClick={() => setShowPaymentModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>{t('financeApp.pay2.recordPayment')}</h2>
            <div className={styles.invoiceDetails}>
              <p><strong>{t('financeApp.pay2.invoiceColon')}</strong> {selectedInvoice.invoiceNumber}</p>
              <p><strong>{t('financeApp.pay2.monthColon')}</strong> {selectedInvoice.month}</p>
              <p><strong>{t('financeApp.pay2.studentColon')}</strong> {classDetails?.students?.find(s => s.studentId === selectedStudent)?.studentName || t('financeApp.shell.common.unknown')}</p>
              <p><strong>{t('financeApp.pay2.totalAmountColon')}</strong> {selectedInvoice.netAmount.toFixed(2)} {t('financeApp.shell.common.birr')}</p>
              <p><strong>{t('financeApp.pay2.alreadyPaidColon')}</strong> {selectedInvoice.paidAmount.toFixed(2)} {t('financeApp.shell.common.birr')}</p>
              <p><strong>{t('financeApp.pay2.balanceDueColon')}</strong> <span className={styles.balanceHighlight}>{selectedInvoice.balance.toFixed(2)} {t('financeApp.shell.common.birr')}</span></p>
            </div>
            <form onSubmit={handleSubmitPayment}>
              {selectedInvoice.oldRegistrationFee !== undefined && selectedInvoice.newRegistrationFee !== undefined && (
                <div className={styles.formGroup}>
                  <label>{t('financeApp.pay2.registrationFeeType')}</label>
                  <div className={styles.regFeeToggle}>
                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${regFeeType === 'old' ? styles.toggleActive : ''}`}
                      onClick={() => {
                        setRegFeeType('old');
                        setPaymentForm({...paymentForm, amount: calcRegAdjustedBalance(selectedInvoice, 'old').toFixed(2)});
                      }}
                    >
                      {t('financeApp.pay2.oldPrefix')}{selectedInvoice.oldRegistrationFee} {t('financeApp.shell.common.birr')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${regFeeType === 'new' ? styles.toggleActive : ''}`}
                      onClick={() => {
                        setRegFeeType('new');
                        setPaymentForm({...paymentForm, amount: calcRegAdjustedBalance(selectedInvoice, 'new').toFixed(2)});
                      }}
                    >
                      {t('financeApp.pay2.newPrefix')}{selectedInvoice.newRegistrationFee} {t('financeApp.shell.common.birr')}
                    </button>
                  </div>
                  <small className={styles.fieldHint}>
                    {regFeeType === 'old' ? t('financeApp.pay2.returningRate') : t('financeApp.pay2.newRate')}
                  </small>
                </div>
              )}
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.paymentAmount')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  readOnly
                  disabled
                  className={styles.lockedInput}
                  title={t('financeApp.pay2.amountLocked')}
                />
                <small className={styles.fieldHint}>
                    {selectedInvoice.oldRegistrationFee !== undefined
                      ? `${t('financeApp.pay2.amountBasedOn')}${regFeeType === 'old' ? t('financeApp.pay2.oldFee') : t('financeApp.pay2.newFee')}${t('financeApp.pay2.registrationFeeSuffix')}`
                      : `${t('financeApp.pay2.amountFixed')}${selectedInvoice.balance.toFixed(2)}${t('financeApp.pay2.exactBalance')}`}
                </small>
              </div>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.paymentMethod')}</label>
                <select 
                  value={paymentForm.paymentMethod} 
                  onChange={(e) => setPaymentForm({
                    ...paymentForm, 
                    paymentMethod: e.target.value,
                    reference: '' // Clear reference when changing method
                  })} 
                  required
                >
                  {paymentMethods.map(method => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.paymentDate')}</label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  readOnly
                  disabled
                  className={styles.lockedInput}
                />
                <small className={styles.fieldHint}>{t('financeApp.pay2.autoToday')}</small>
              </div>
              {paymentMethods.find(m => m.value === paymentForm.paymentMethod)?.requiresReference && (
                <div className={styles.formGroup}>
                  <label>{t('financeApp.pay2.referenceNumber')}</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                    placeholder={t('financeApp.pay2.optionalTransactionId')}
                  />
                  <small className={styles.fieldHint}>{t('financeApp.pay2.optionalForBank')}</small>
                </div>
              )}
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.uploadReceipt')}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPaymentForm({...paymentForm, screenshot: e.target.files[0]})}
                  className={styles.fileInput}
                />
                <small className={styles.fieldHint}>{t('financeApp.pay2.uploadReceiptHint')}</small>
              </div>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.notes')}</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder={t('financeApp.pay2.additionalNotes')}
                  rows="3"
                />
              </div>
              <div className={styles.modalActions}>
                <button type="submit" className={styles.submitButton}>{t('financeApp.pay2.recordPaymentButton')}</button>
                <button type="button" className={styles.cancelButton} onClick={() => setShowPaymentModal(false)}>{t('financeApp.shell.common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Month Payment Modal */}
      {showMultiMonthModal && selectedMonths.length > 0 && (
        <div className={styles.modal} onClick={() => setShowMultiMonthModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>{t('financeApp.pay2.payMonths', { count: selectedMonths.length })}</h2>
            <div className={styles.invoiceDetails}>
              <p><strong>{t('financeApp.pay2.studentColon')}</strong> {classDetails?.students?.find(s => s.studentId === selectedStudent)?.studentName || t('financeApp.shell.common.unknown')}</p>
              <p><strong>{t('financeApp.pay2.selectedMonths')}</strong></p>
              <div className={styles.monthSelection}>
                {studentDetails.invoices
                  .filter(inv => inv.balance > 0) // Show all unpaid months
                  .sort((a, b) => a.monthNumber - b.monthNumber)
                  .map((invoice, index) => {
                    const isSelected = selectedMonths.find(m => m.id === invoice.id);
                    
                    // Determine if this month can be selected
                    let canSelect = false;
                    let reason = '';
                    
                    if (selectedMonths.length === 0) {
                      // No months selected yet - can only select the first unpaid month
                      const firstUnpaid = studentDetails.invoices
                        .filter(inv => inv.balance > 0)
                        .sort((a, b) => a.monthNumber - b.monthNumber)[0];
                      canSelect = invoice.id === firstUnpaid.id;
                      reason = canSelect ? '' : t('financeApp.pay2.startFirstUnpaid');
                    } else {
                      // Check if this is the next sequential month after the last selected
                      const sortedSelected = [...selectedMonths].sort((a, b) => a.monthNumber - b.monthNumber);
                      const lastSelected = sortedSelected[sortedSelected.length - 1];
                      
                      // Can select if this is already selected OR if it's the next month
                      if (isSelected) {
                        canSelect = true;
                      } else {
                        // Find all unpaid months after the last selected
                        const nextUnpaidMonths = studentDetails.invoices
                          .filter(inv => inv.monthNumber > lastSelected.monthNumber && inv.balance > 0)
                          .sort((a, b) => a.monthNumber - b.monthNumber);
                        
                        canSelect = nextUnpaidMonths.length > 0 && nextUnpaidMonths[0].id === invoice.id;
                        reason = canSelect ? '' : t('financeApp.pay2.selectInOrder');
                      }
                    }

                    const isLocked = !isMonthUnlocked(invoice.monthNumber);

                    return (
                      <div 
                        key={index} 
                        className={`${styles.monthOption} ${isSelected ? styles.selected : ''} ${!canSelect && !isSelected ? styles.disabled : ''}`}
                        onClick={() => canSelect && toggleMonthSelection(invoice)}
                        title={!canSelect && !isSelected ? reason : ''}
                      >
                        <input 
                          type="checkbox" 
                          checked={!!isSelected}
                          disabled={!canSelect && !isSelected}
                          readOnly
                        />
                        <span className={styles.monthName}>
                          {invoice.month}
                          {isLocked && <span className={styles.lockIconSmall}> 🔒</span>}
                        </span>
                        <span className={styles.monthAmount}>{invoice.balance.toFixed(2)} {t('financeApp.shell.common.birr')}</span>
                      </div>
                    );
                  })}
              </div>
              <p className={styles.totalAmount}>
                <strong>{t('financeApp.pay2.totalAmountColon')}</strong> 
                <span className={styles.balanceHighlight}>
                  {selectedMonths.reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)} {t('financeApp.shell.common.birr')}
                </span>
              </p>
            </div>
            <form onSubmit={handleSubmitMultiMonthPayment}>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.paymentMethod')}</label>
                <select 
                  value={paymentForm.paymentMethod} 
                  onChange={(e) => setPaymentForm({
                    ...paymentForm, 
                    paymentMethod: e.target.value,
                    reference: '' // Clear reference when changing method
                  })} 
                  required
                >
                  {paymentMethods.map(method => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.paymentDateRequired')}</label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({...paymentForm, paymentDate: e.target.value})}
                  required
                  max={getLocalDateStr()}
                />
              </div>
              {paymentMethods.find(m => m.value === paymentForm.paymentMethod)?.requiresReference && (
                <div className={styles.formGroup}>
                  <label>{t('financeApp.pay2.referenceRequired')}</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                    placeholder={t('financeApp.pay2.transactionIdPh')}
                    required
                  />
                  <small className={styles.fieldHint}>{t('financeApp.pay2.referenceUniqueHint')}</small>
                </div>
              )}
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.uploadReceipt')}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPaymentForm({...paymentForm, screenshot: e.target.files[0]})}
                  className={styles.fileInput}
                />
                <small className={styles.fieldHint}>{t('financeApp.pay2.uploadReceiptHint')}</small>
              </div>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay2.notes')}</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder={t('financeApp.pay2.additionalNotes')}
                  rows="3"
                />
              </div>
              <div className={styles.modalActions}>
                <button type="submit" className={styles.submitButton}>{t('financeApp.pay2.payMonths', { count: selectedMonths.length })}</button>
                <button type="button" className={styles.cancelButton} onClick={() => setShowMultiMonthModal(false)}>{t('financeApp.shell.common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History Details Modal */}
      {showPaymentHistoryModal && paymentHistory && (
        <div className={styles.modal} onClick={() => setShowPaymentHistoryModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }}>
            <h2>{t('financeApp.pay2.transactionHistory')}</h2>
            <p><strong>{t('financeApp.pay2.studentColon')}</strong> {classDetails?.students?.find(s => s.studentId === selectedStudent)?.studentName || t('financeApp.shell.common.unknown')}</p>
            <p><strong>{t('financeApp.pay2.totalPaymentsColon')}</strong> {paymentHistory.totalPayments}</p>
            
            <div style={{ marginTop: '20px' }}>
              {paymentHistory.payments.map((payment, index) => (
                <div key={index} style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '8px', 
                  padding: '15px', 
                  marginBottom: '15px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginBottom: '15px',
                    paddingBottom: '10px',
                    borderBottom: '2px solid #007bff'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '3px' }}>{t('financeApp.pay2.paymentDateTime')}</div>
                      <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
                        📅 {new Date(payment.paymentDate).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>
                        🕐 {new Date(payment.paymentDate).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '3px' }}>{t('financeApp.pay2.amountPaid')}</div>
                      <div style={{ color: '#28a745', fontSize: '1.3em', fontWeight: 'bold' }}>
                        {payment.amount.toFixed(2)} {t('financeApp.shell.common.birr')}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '10px' }}>
                    <strong>{t('financeApp.pay2.paymentMethodColon')}</strong> {payment.paymentMethod}
                    {payment.reference && (
                      <span style={{ marginLeft: '10px' }}>
                        <strong>{t('financeApp.pay2.referenceColon')}</strong> {payment.reference}
                      </span>
                    )}
                  </div>

                  {payment.notes && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong>{t('financeApp.pay2.notesColon')}</strong> {payment.notes}
                    </div>
                  )}

                  {payment.screenshot && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong>{t('financeApp.pay2.screenshotColon')}</strong>{' '}
                      <a href={`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}${payment.screenshot}`} target="_blank" rel="noopener noreferrer">
                        {t('financeApp.pay2.viewReceipt')}
                      </a>
                    </div>
                  )}

                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                    <strong>{t('financeApp.pay2.monthsPaidColon')}</strong>
                    <div style={{ marginTop: '5px' }}>
                      {payment.invoices.map((inv, idx) => (
                        <div key={idx} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          padding: '5px 10px',
                          backgroundColor: '#fff',
                          marginBottom: '3px',
                          borderRadius: '4px'
                        }}>
                          <span>{inv.month} ({inv.invoiceNumber})</span>
                          <span>{inv.amountAllocated.toFixed(2)} {t('financeApp.shell.common.birr')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.modalActions}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                onClick={() => setShowPaymentHistoryModal(false)}
              >
                {t('financeApp.shell.common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      {/* Financial Reports Modal */}
      {showReportsModal && overview && (
        <div className={styles.modal} onClick={() => setShowReportsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '90vh', overflow: 'auto' }}>
            <h2>{t('financeApp.pay2.financialReports')}</h2>
            
            {/* Current Month Indicator */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: '15px 25px',
              borderRadius: '8px',
              marginTop: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <strong style={{ fontSize: '1.1em' }}>{t('financeApp.pay2.currentEthMonth')}{ethiopianMonths[currentEthiopianMonth - 1]}</strong>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.9em', opacity: 0.9 }}>
                  {t('financeApp.pay2.showingUnlocked', { count: currentEthiopianMonth, names: ethiopianMonths.slice(0, currentEthiopianMonth).join(', ') })}
                </p>
              </div>
              <div style={{ fontSize: '2.5em' }}>📅</div>
            </div>
            
            {/* Financial Summary Cards */}
            <div style={{ marginTop: '30px' }}>
              <div className={styles.reportCards} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                <div className={styles.reportCard} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>👥</div>
                  <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>{t('financeApp.pay2.totalStudents')}</h3>
                  <p style={{ color: 'white', fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>
                    {overview.summary.totalStudents}
                  </p>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '10px', fontSize: '0.9em' }}>
                    <div>
                      <span style={{ opacity: 0.8 }}>{t('financeApp.pay2.payingColon')}</span>
                      <strong style={{ marginLeft: '5px' }}>{overview.summary.payingStudents || 0}</strong>
                    </div>
                    <div>
                      <span style={{ opacity: 0.8 }}>{t('financeApp.pay2.exemptColon')}</span>
                      <strong style={{ marginLeft: '5px' }}>{overview.summary.freeStudents || 0}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.reportCard} style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>💰</div>
                  <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>{t('financeApp.pay2.totalExpected')}</h3>
                  <p style={{ color: 'white', fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>
                    {overview.summary.unlockedTotalAmount?.toFixed(2) || '0.00'}
                  </p>
                  <p style={{ fontSize: '0.9em', opacity: 0.8 }}>
                    {t('financeApp.pay2.birrMonthsPaying', { count: currentEthiopianMonth })}
                  </p>
                </div>

                <div className={styles.reportCard} style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>✓</div>
                  <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>{t('financeApp.pay2.totalPaidCard')}</h3>
                  <p style={{ color: 'white', fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>
                    {overview.summary.unlockedTotalPaid?.toFixed(2) || '0.00'}
                  </p>
                  <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{t('financeApp.shell.common.birr')}</p>
                </div>

                <div className={styles.reportCard} style={{ background: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)', color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>⏳</div>
                  <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>{t('financeApp.pay2.totalPendingCard')}</h3>
                  <p style={{ color: 'white', fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>
                    {overview.summary.unlockedTotalPending?.toFixed(2) || '0.00'}
                  </p>
                  <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{t('financeApp.shell.common.birr')}</p>
                </div>

                <div className={styles.reportCard} style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>📈</div>
                  <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>{t('financeApp.pay2.collectionRate')}</h3>
                  <p style={{ color: 'white', fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>
                    {overview.summary.unlockedTotalAmount > 0 
                      ? ((overview.summary.unlockedTotalPaid / overview.summary.unlockedTotalAmount) * 100).toFixed(1)
                      : '0.0'}%
                  </p>
                  <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{t('financeApp.pay2.paymentCollectionRate')}</p>
                </div>

                <div className={styles.reportCard} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>⚠️</div>
                  <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>{t('financeApp.pay2.unpaidStudentsCard')}</h3>
                  <p style={{ color: 'white', fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>
                    {overview.summary.totalUnpaid + overview.summary.totalPartial}
                  </p>
                  <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{t('financeApp.pay2.studentsWithPending')}</p>
                </div>
              </div>
            </div>

            {/* Class Breakdown Table */}
            <div style={{ marginTop: '40px' }}>
              <h3 style={{ marginBottom: '20px', fontSize: '1.5em' }}>{t('financeApp.pay2.classBreakdown')}</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                      <th style={{ padding: '15px', textAlign: 'left', fontWeight: '600' }}>{t('financeApp.pay2.thClass')}</th>
                      <th style={{ padding: '15px', textAlign: 'center', fontWeight: '600' }}>{t('financeApp.pay2.thTotalStudents')}</th>
                      <th style={{ padding: '15px', textAlign: 'center', fontWeight: '600' }}>{t('financeApp.pay2.thPaying')}</th>
                      <th style={{ padding: '15px', textAlign: 'center', fontWeight: '600' }}>{t('financeApp.pay2.thExempt')}</th>
                      <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600' }}>{t('financeApp.pay2.thTotalAmount')}</th>
                      <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600' }}>{t('financeApp.pay2.thTotalPaid')}</th>
                      <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600' }}>{t('financeApp.pay2.thTotalPending')}</th>
                      <th style={{ padding: '15px', textAlign: 'center', fontWeight: '600' }}>{t('financeApp.pay2.thRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.classes.map((classData, index) => (
                      <tr key={index} style={{ 
                        backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'white',
                        borderBottom: '1px solid #e0e0e0'
                      }}>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#1a202c' }}>{classData.className}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{classData.totalStudents}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{classData.payingStudents || 0}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '0.85em',
                            fontWeight: 'bold'
                          }}>
                            {classData.freeStudents || 0}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                          {classData.unlockedTotalAmount?.toFixed(2) || '0.00'} {t('financeApp.shell.common.birr')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 'bold' }}>
                          {classData.unlockedTotalPaid?.toFixed(2) || '0.00'} {t('financeApp.shell.common.birr')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#dc3545', fontWeight: 'bold' }}>
                          {classData.unlockedTotalPending?.toFixed(2) || '0.00'} {t('financeApp.shell.common.birr')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '0.85em',
                            fontWeight: 'bold',
                            background: classData.unlockedTotalAmount > 0 && (classData.unlockedTotalPaid / classData.unlockedTotalAmount) > 0.7 
                              ? '#28a745' 
                              : classData.unlockedTotalAmount > 0 && (classData.unlockedTotalPaid / classData.unlockedTotalAmount) > 0.4
                              ? '#ffc107'
                              : '#dc3545',
                            color: 'white'
                          }}>
                            {classData.unlockedTotalAmount > 0 
                              ? ((classData.unlockedTotalPaid / classData.unlockedTotalAmount) * 100).toFixed(1)
                              : '0.0'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: 'bold' }}>
                      <td style={{ padding: '15px' }}>{t('financeApp.pay2.totalLabel')}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{overview.summary.totalStudents}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{overview.summary.payingStudents || 0}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{overview.summary.freeStudents || 0}</td>
                      <td style={{ padding: '15px', textAlign: 'right' }}>{overview.summary.unlockedTotalAmount?.toFixed(2) || '0.00'} {t('financeApp.shell.common.birr')}</td>
                      <td style={{ padding: '15px', textAlign: 'right' }}>{overview.summary.unlockedTotalPaid?.toFixed(2) || '0.00'} {t('financeApp.shell.common.birr')}</td>
                      <td style={{ padding: '15px', textAlign: 'right' }}>{overview.summary.unlockedTotalPending?.toFixed(2) || '0.00'} {t('financeApp.shell.common.birr')}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        {overview.summary.unlockedTotalAmount > 0 
                          ? ((overview.summary.unlockedTotalPaid / overview.summary.unlockedTotalAmount) * 100).toFixed(1)
                          : '0.0'}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className={styles.modalActions} style={{ marginTop: '30px', display: 'flex', justifyContent: 'center' }}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                click={() => setShowReportsModal(false)}
                style={{
                  padding: '12px 30px',
                  fontSize: '1em',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {t('financeApp.shell.common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiple Monthly Payments Report Modal */}
      {showReportsModal && multipleMonthlyReport && (
        <div className={styles.modal} onClick={() => setShowReportsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '85vh', overflow: 'auto' }}>
            <h2>{t('financeApp.pay2.multipleMonthsReport')}</h2>
            
            <div style={{ marginTop: '20px', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', backgroundColor: '#f9f9f9' }}>
              <p><strong>{t('financeApp.pay2.reportDateColon')}</strong> {new Date(multipleMonthlyReport.reportDate).toLocaleDateString()}</p>
              <p><strong>{t('financeApp.pay2.totalPaymentsColon')}</strong> {multipleMonthlyReport.totalPayments}</p>
              <p><strong>{t('financeApp.pay2.totalAmountBreakdown')}:</strong> <span style={{ color: '#28a745', fontSize: '1.2em', fontWeight: 'bold' }}>{multipleMonthlyReport.totalAmount.toFixed(2)} {t('financeApp.shell.common.birr')}</span></p>

              <div style={{ marginTop: '20px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#007bff', color: 'white' }}>
                      <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>{t('financeApp.pay1.thStudentId')}</th>
                      <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>{t('financeApp.pay2.thPaymentDate')}</th>
                      <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'right' }}>{t('financeApp.pay1.thAmount')}</th>
                      <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{t('financeApp.pay2.thMonths')}</th>
                      <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>{t('financeApp.pay2.monthsPaid')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multipleMonthlyReport.payments.map((payment, index) => (
                      <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{payment.studentId}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold', color: '#28a745' }}>
                          {payment.amount.toFixed(2)} {t('financeApp.shell.common.birr')}
                        </td>
                        <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                          <span style={{ 
                            backgroundColor: '#007bff', 
                            color: 'white', 
                            padding: '5px 15px', 
                            borderRadius: '15px',
                            fontWeight: 'bold',
                            fontSize: '0.9em'
                          }}>
                            {payment.monthsCount}
                          </span>
                        </td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                          {payment.months.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalActions} style={{ marginTop: '20px' }}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                onClick={() => {
                  setShowReportsModal(false);
                  setMultipleMonthlyReport(null);
                }}
              >
                {t('financeApp.shell.common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Details Modal */}
      {showCardDetailsModal && cardDetailsData && (
        <div className={styles.modal} onClick={() => setShowCardDetailsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto' }}>
            <h2>📊 {cardDetailsData.title}</h2>
            
            <div style={{ marginTop: '20px', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '25px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <p style={{ fontSize: '0.9em', opacity: 0.9, marginBottom: '5px' }}>{t('financeApp.pay2.totalStudents')}</p>
                  <p style={{ fontSize: '2em', fontWeight: 'bold', margin: 0 }}>{cardDetailsData.students.length}</p>
                </div>
                
                {selectedCardType === 'TOTAL_AMOUNT' && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.9em', opacity: 0.9, marginBottom: '5px' }}>{t('financeApp.pay2.totalAmountBreakdown')}</p>
                    <p style={{ fontSize: '1.8em', fontWeight: 'bold', margin: 0 }}>
                      {cardDetailsData.students.reduce((sum, s) => sum + s.totalAmount, 0).toFixed(2)} {t('financeApp.shell.common.birr')}
                    </p>
                  </div>
                )}
                
                {selectedCardType === 'TOTAL_PAID' && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.9em', opacity: 0.9, marginBottom: '5px' }}>{t('financeApp.pay2.totalPaidBreakdown')}</p>
                    <p style={{ fontSize: '1.8em', fontWeight: 'bold', margin: 0 }}>
                      {cardDetailsData.students.reduce((sum, s) => sum + s.totalPaid, 0).toFixed(2)} {t('financeApp.shell.common.birr')}
                    </p>
                  </div>
                )}
                
                {selectedCardType === 'TOTAL_PENDING' && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.9em', opacity: 0.9, marginBottom: '5px' }}>{t('financeApp.pay2.totalPendingBreakdown')}</p>
                    <p style={{ fontSize: '1.8em', fontWeight: 'bold', margin: 0 }}>
                      {cardDetailsData.students.reduce((sum, s) => sum + s.balance, 0).toFixed(2)} {t('financeApp.shell.common.birr')}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '25px', background: 'var(--color-surface)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                      <th style={{ padding: '15px 12px', border: 'none', textAlign: 'left', fontWeight: '600' }}>{t('financeApp.pay1.thStudentId')}</th>
                      <th style={{ padding: '15px 12px', border: 'none', textAlign: 'left', fontWeight: '600' }}>{t('financeApp.pay1.thStudentName')}</th>
                      <th style={{ padding: '15px 12px', border: 'none', textAlign: 'right', fontWeight: '600' }}>{t('financeApp.pay2.totalAmountBreakdown')}</th>
                      <th style={{ padding: '15px 12px', border: 'none', textAlign: 'right', fontWeight: '600' }}>{t('financeApp.pay2.totalPaidBreakdown')}</th>
                      <th style={{ padding: '15px 12px', border: 'none', textAlign: 'right', fontWeight: '600' }}>{t('financeApp.pay1.thBalance')}</th>
                      {(selectedCardType === 'UNPAID_STUDENTS' || selectedCardType === 'TOTAL_PENDING') && (
                        <th style={{ padding: '15px 12px', border: 'none', textAlign: 'center', fontWeight: '600' }}>{t('financeApp.pay1.thUnpaidMonths')}</th>
                      )}
                      <th style={{ padding: '15px 12px', border: 'none', textAlign: 'center', fontWeight: '600' }}>{t('financeApp.pay1.thStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardDetailsData.students.map((student, index) => (
                      <tr key={index} style={{ 
                        backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'white',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : 'white'}
                      >
                        <td style={{ padding: '12px', border: 'none', color: '#333', fontSize: '0.9em' }}>{student.studentId}</td>
                        <td style={{ padding: '12px', border: 'none', fontWeight: '600', color: '#1a1a1a' }}>{student.studentName || t('financeApp.shell.common.unknown')}</td>
                        <td style={{ padding: '12px', border: 'none', textAlign: 'right', color: '#333' }}>
                          {student.totalAmount.toFixed(2)} {t('financeApp.shell.common.birr')}
                        </td>
                        <td style={{ padding: '12px', border: 'none', textAlign: 'right', color: '#28a745', fontWeight: 'bold' }}>
                          {student.totalPaid.toFixed(2)} {t('financeApp.shell.common.birr')}
                        </td>
                        <td style={{ padding: '12px', border: 'none', textAlign: 'right', color: student.balance > 0 ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                          {student.balance.toFixed(2)} {t('financeApp.shell.common.birr')}
                        </td>
                        {(selectedCardType === 'UNPAID_STUDENTS' || selectedCardType === 'TOTAL_PENDING') && (
                          <td style={{ padding: '12px', border: 'none', textAlign: 'center' }}>
                            <span style={{ 
                              backgroundColor: '#dc3545', 
                              color: 'white', 
                              padding: '6px 16px', 
                              borderRadius: '20px',
                              fontWeight: 'bold',
                              fontSize: '0.85em',
                              display: 'inline-block'
                            }}>
                              {student.unpaidMonths || 0}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: '12px', border: 'none', textAlign: 'center' }}>
                          <span style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            fontSize: '0.8em',
                            fontWeight: 'bold',
                            backgroundColor: student.status === 'PAID' ? '#28a745' : student.status === 'PARTIAL' ? '#ffc107' : '#dc3545',
                            color: 'white',
                            display: 'inline-block'
                          }}>
                            {student.status === 'PAID' ? t('financeApp.pay3.statusPaidShort') : student.status === 'PARTIAL' ? t('financeApp.pay3.statusPartialShort') : t('financeApp.pay3.statusUnpaidShort')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalActions} style={{ marginTop: '25px', display: 'flex', justifyContent: 'center' }}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                onClick={() => {
                  setShowCardDetailsModal(false);
                  setCardDetailsData(null);
                  setSelectedCardType(null);
                }}
                style={{
                  padding: '12px 30px',
                  fontSize: '1em',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {t('financeApp.shell.common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Component for Printing - Temporarily visible for debugging */}
      <div style={{ 
        position: 'fixed', 
        bottom: '20px',
        right: '20px',
        width: '300px',
        maxHeight: '220px',
        overflow: 'auto',
        background: 'var(--color-surface)',
        border: '3px solid red',
        zIndex: 9999,
        transform: 'scale(0.5)',
        transformOrigin: 'bottom right',
        boxShadow: '0 0 20px rgba(0,0,0,0.3)'
      }}>
        <div ref={componentRef}>
          {receiptData && schoolInfo && (
            <InvoiceReceipt 
              receiptData={receiptData}
              schoolInfo={schoolInfo}
            />
          )}
        </div>
        {receiptData && (
          <div style={{ padding: '10px', background: '#ffeb3b', borderTop: '2px solid red', fontSize: '12px' }}>
            <strong>{t('financeApp.pay2.debugMode')}</strong> {t('financeApp.pay2.receiptVisible')} 
            <br/>{t('financeApp.pay2.receiptNum')}{receiptData.receiptNumber}{t('financeApp.pay2.readyToPrint')}
          </div>
        )}
      </div>

      {/* Exemption Management Modal */}
      {showExemptionModal && selectedStudent && (
        <div className={styles.modal} onClick={() => setShowExemptionModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2>{t('financeApp.pay2.manageExemption')}</h2>
            
            <div style={{ marginTop: '20px', padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '20px' }}>
              <p><strong>{t('financeApp.pay2.studentIdColon')}</strong> {selectedStudent}</p>
              {classDetails && classDetails.students && (
                <p><strong>{t('financeApp.pay2.studentNameColon')}</strong> {classDetails.students.find(s => s.studentId === selectedStudent)?.studentName || t('financeApp.shell.common.unknown')}</p>
              )}
              <p><strong>{t('financeApp.pay2.classColon')}</strong> {selectedClass}</p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              
              if (!selectedClass || !selectedStudent) {
                alert(t('financeApp.pay3.missingStudentInfo'));
                return;
              }

              // Validate: if marking as free, exemption type is required
              if (exemptionForm.is_free && !exemptionForm.exemption_type) {
                alert(t('financeApp.pay3.selectExemption'));
                return;
              }

              try {
                const parts = selectedStudent.split('-');
                if (parts.length >= 5) {
                  const schoolId = parseInt(parts[3], 10);
                  const classId = parseInt(parts[4], 10);
                  
                  await api.put(
                    `/student-list/toggle-free/${selectedClass}/${schoolId}/${classId}`,
                    exemptionForm
                  );
                  
                  alert(exemptionForm.is_free 
                    ? t('financeApp.pay3.markedFree', { type: exemptionForm.exemption_type })
                    : t('financeApp.pay3.exemptionRemoved')
                  );
                  
                  setShowExemptionModal(false);
                  
                  // Refresh data
                  if (selectedClass) {
                    await fetchClassDetails();
                  }
                  await fetchOverview();
                }
              } catch (error) {
                console.error('Error updating exemption:', error);
                alert(t('financeApp.pay3.failedUpdateExemption') + (error.response?.data?.error || error.message));
              }
            }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '1.1em', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    checked={exemptionForm.is_free}
                    onChange={(e) => setExemptionForm({
                      ...exemptionForm,
                      is_free: e.target.checked,
                      exemption_type: e.target.checked ? exemptionForm.exemption_type : '',
                      exemption_reason: e.target.checked ? exemptionForm.exemption_reason : ''
                    })}
                    style={{ marginRight: '10px', width: '20px', height: '20px' }}
                  />
                  {t('financeApp.pay2.learningFreeCheck')}
                </label>
              </div>

              {exemptionForm.is_free && (
                <>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      {t('financeApp.pay2.exemptionType')} <span style={{ color: 'red' }}>*</span>
                    </label>
                    <select
                      value={exemptionForm.exemption_type}
                      onChange={(e) => setExemptionForm({ ...exemptionForm, exemption_type: e.target.value })}
                      required={exemptionForm.is_free}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: '1em'
                      }}
                    >
                      <option value="">{t('financeApp.pay2.selectExemptionType')}</option>
                      <option value="Scholarship">{t('financeApp.pay2.scholarship')}</option>
                      <option value="Orphan">{t('financeApp.pay2.orphan')}</option>
                      <option value="Staff Child">{t('financeApp.pay2.staffChild')}</option>
                      <option value="Financial Hardship">{t('financeApp.pay2.financialHardship')}</option>
                      <option value="Other">{t('financeApp.pay2.other')}</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      {t('financeApp.pay2.reasonDetails')}
                    </label>
                    <textarea
                      value={exemptionForm.exemption_reason}
                      onChange={(e) => setExemptionForm({ ...exemptionForm, exemption_reason: e.target.value })}
                      placeholder={t('financeApp.pay2.reasonPh')}
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: '1em',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      {t('financeApp.pay2.registrationFeeType') || 'Registration Fee Type'} <span style={{ color: 'red' }}>*</span>
                    </label>
                    <select
                      value={exemptionForm.registration_fee_type}
                      onChange={(e) => setExemptionForm({ ...exemptionForm, registration_fee_type: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: '1em'
                      }}
                    >
                      <option value="new">New Registration Fee</option>
                      <option value="old">Old Registration Fee</option>
                    </select>
                    <p style={{ marginTop: '8px', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
                      💡 Free students still pay the one-time Registration Fee only (no monthly tuition).
                    </p>
                  </div>
                </>
              )}

              <div className={styles.modalActions} style={{ marginTop: '25px' }}>
                <button 
                  type="submit" 
                  className={styles.submitButton}
                  style={{
                    padding: '12px 30px',
                    fontSize: '1em',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: '600',
                    marginRight: '10px'
                  }}
                >
                  {t('financeApp.pay2.saveChanges')}
                </button>
                <button 
                  type="button" 
                  className={styles.cancelButton} 
                  onClick={() => setShowExemptionModal(false)}
                  style={{
                    padding: '12px 30px',
                    fontSize: '1em',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--card-bg)',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {t('financeApp.shell.common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check Invoice Modal - look up invoice by 10-digit reference code (cross-branch) */}
      {showInvoiceLookupModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '760px' }}>
            <h2 style={{ marginTop: 0 }}>{t('financeApp.pay3.checkInvoice')}</h2>
            <form onSubmit={handleInvoiceLookup}>
              <div className={styles.formGroup}>
                <label>{t('financeApp.pay3.invoiceCodeLabel')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={invoiceLookupCode}
                  onChange={(e) => {
                    setInvoiceLookupCode(e.target.value.replace(/\D/g, ''));
                    setInvoiceLookupError('');
                    setInvoiceLookupResult(null);
                  }}
                  placeholder={t('financeApp.pay3.invoiceCodePlaceholder')}
                  style={{
                    padding: '12px 14px',
                    fontSize: '1.1em',
                    letterSpacing: '2px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--card-bg)',
                    color: 'var(--text-color)',
                    width: '100%'
                  }}
                  required
                />
              </div>

              {invoiceLookupError && (
                <div style={{
                  padding: '14px 18px',
                  borderRadius: '8px',
                  background: '#fdecea',
                  color: '#c0392b',
                  border: '1px solid #f5b7b1',
                  marginBottom: '16px',
                  fontWeight: '600'
                }}>
                  {invoiceLookupError}
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="submit" className={styles.submitButton} disabled={invoiceLookupLoading}>
                  {invoiceLookupLoading 
                    ? t('financeApp.pay3.searching') 
                    : t('financeApp.pay3.searchInvoice')}
                </button>
                <button type="button" className={styles.cancelButton} onClick={closeInvoiceLookup}>
                  {t('financeApp.shell.common.cancel')}
                </button>
              </div>
            </form>

            {invoiceLookupResult && (
              <div style={{ marginTop: '24px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',
                  color: 'white',
                  marginBottom: '16px'
                }}>
                  <div>
                    <strong style={{ fontSize: '1.15em' }}>{invoiceLookupResult.student.name}</strong>
                    <div style={{ fontSize: '0.9em', opacity: 0.92, marginTop: '4px' }}>
                      {invoiceLookupResult.branchCode} · {invoiceLookupResult.student.className || '—'}{invoiceLookupResult.student.isFree ? ' · 🎓 FREE' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8em', opacity: 0.92 }}>Invoice ID</div>
                    <strong style={{ fontSize: '1.3em', letterSpacing: '2px' }}>{invoiceLookupResult.invoice.invoiceRefCode}</strong>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95em' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.studentName')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{invoiceLookupResult.student.name}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.studentId')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{invoiceLookupResult.student.studentId}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.branch')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{invoiceLookupResult.branchCode}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.month')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{invoiceLookupResult.invoice.month}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.amount')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{Number(invoiceLookupResult.invoice.netAmount).toFixed(2)} {t('financeApp.shell.common.birr')}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.paid')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{Number(invoiceLookupResult.invoice.paidAmount).toFixed(2)} {t('financeApp.shell.common.birr')}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.balance')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{Number(invoiceLookupResult.invoice.balance).toFixed(2)} {t('financeApp.shell.common.birr')}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.paymentDate')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>{formatLookupDate(invoiceLookupResult.invoice.paidDate)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: '700' }}>{t('financeApp.pay3.status')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                        <span className={`${styles.statusBadge} ${getStatusColor(invoiceLookupResult.invoice.status)}`}>
                          {getStatusText(invoiceLookupResult.invoice.status)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {invoiceLookupResult.payments && invoiceLookupResult.payments.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>{t('financeApp.pay3.paymentHistory')}</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92em' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>#</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>{t('financeApp.pay3.receipt')}</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>{t('financeApp.pay3.paymentDate')}</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '2px solid var(--border-color)' }}>{t('financeApp.pay3.amount')}</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>{t('financeApp.pay3.paymentMethod')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceLookupResult.payments.map((p, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>{p.receiptNumber || '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>{formatLookupDate(p.paymentDate)}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>{Number(p.amount).toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                              <span className={styles.methodBadge}>
                                {(p.paymentMethod || '').replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {invoiceLookupResult.invoice.items && invoiceLookupResult.invoice.items.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>{t('financeApp.pay3.invoiceItems')}</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92em' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>{t('financeApp.pay3.description')}</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '2px solid var(--border-color)' }}>{t('financeApp.pay3.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceLookupResult.invoice.items.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>{item.description || item.feeCategory || '—'}</td>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>{Number(item.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyPaymentsNew;
