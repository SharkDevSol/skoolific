import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MonthlyPaymentSettings.module.css';
import api from '../../utils/api';
import { getCurrentEthiopianMonth, getEthiopianDate } from '../../utils/ethiopianCalendar';

const MonthlyPaymentSettings = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('classes');
  const [loading, setLoading] = useState(false);
  const [feeStructures, setFeeStructures] = useState([]);
  const [lateFeeRules, setLateFeeRules] = useState([]);
  const [availableClasses, setAvailableClasses] = useState([]);
  const [defaultAccount, setDefaultAccount] = useState(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [showAddLateFee, setShowAddLateFee] = useState(false);
  const [currentEthiopianDate, setCurrentEthiopianDate] = useState(() => {
    return getEthiopianDate();
  });

  const [classForm, setClassForm] = useState({
    selectedClasses: [],
    monthlyFee: '',
    oldRegistrationFee: '',
    newRegistrationFee: '',
    description: '',
    selectedMonths: []
  });

  // Ethiopian calendar months
  const months = [
    { value: 1, name: 'Meskerem (መስከረም)', days: 30 },
    { value: 2, name: 'Tikimt (ጥቅምት)', days: 30 },
    { value: 3, name: 'Hidar (ኅዳር)', days: 30 },
    { value: 4, name: 'Tahsas (ታኅሣሥ)', days: 30 },
    { value: 5, name: 'Tir (ጥር)', days: 30 },
    { value: 6, name: 'Yekatit (የካቲት)', days: 30 },
    { value: 7, name: 'Megabit (መጋቢት)', days: 30 },
    { value: 8, name: 'Miazia (ሚያዝያ)', days: 30 },
    { value: 9, name: 'Ginbot (ግንቦት)', days: 30 },
    { value: 10, name: 'Sene (ሰኔ)', days: 30 },
    { value: 11, name: 'Hamle (ሐምሌ)', days: 30 },
    { value: 12, name: 'Nehase (ነሐሴ)', days: 30 },
    { value: 13, name: 'Pagume (ጳጉሜን)', days: 5 }
  ];

  const [lateFeeForm, setLateFeeForm] = useState({
    name: '',
    gracePeriodDays: 0,
    penaltyType: 'FIXED_AMOUNT',
    penaltyValue: '',
    applicableFeeCategories: ['TUITION']
  });

  const [generatingInvoices, setGeneratingInvoices] = useState(false);

  // General Settings state
  const [generalSettings, setGeneralSettings] = useState({
    paymentMethods: {
      cash: true,
      bankTransfer: true,
      mobileMoney: true,
      onlinePayment: true
    },
    invoiceSettings: {
      defaultDueDays: 30,
      invoicePrefix: 'INV-'
    },
    notifications: {
      paymentReminders: true,
      paymentConfirmations: true,
      overdueNotifications: false
    }
  });

  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    // Fetch available classes and default account on component mount
    fetchAvailableClasses();
    fetchDefaultAccount();
    
    // Update Ethiopian date every minute
    const interval = setInterval(() => {
      setCurrentEthiopianDate(getCurrentEthiopianMonth());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'classes') {
      fetchFeeStructures();
    } else if (activeTab === 'latefees') {
      fetchLateFeeRules();
    }
  }, [activeTab]);

  const fetchAvailableClasses = async () => {
    try {
      const response = await api.get('/finance/classes');
      setAvailableClasses(response.data.data || []);
    } catch (error) {
      console.error('Error fetching available classes:', error);
      // Don't show error to user, just log it
    }
  };

  const fetchDefaultAccount = async () => {
    try {
      // Fetch accounts and find an income account for tuition
      const response = await api.get('/finance/accounts/tree');
      const accounts = response.data.data || [];
      
      // Find an income account (preferably for tuition)
      const findIncomeAccount = (accts) => {
        for (const acc of accts) {
          if (acc.type === 'INCOME' && acc.isActive && acc.isLeaf) {
            return acc;
          }
          if (acc.children && acc.children.length > 0) {
            const found = findIncomeAccount(acc.children);
            if (found) return found;
          }
        }
        return null;
      };

      const incomeAccount = findIncomeAccount(accounts);
      if (incomeAccount) {
        setDefaultAccount(incomeAccount);
      } else {
        console.warn('No income account found. Please create one first.');
      }
    } catch (error) {
      console.error('Error fetching default account:', error);
    }
  };

  const fetchFeeStructures = async () => {
    setLoading(true);
    try {
      const response = await api.get('/finance/fee-structures');
      setFeeStructures(response.data.data || []);
    } catch (error) {
      console.error('Error fetching fee structures:', error);
      // If tables don't exist yet, show empty state instead of error
      if (error.response?.status === 500) {
        setFeeStructures([]);
        console.log('Fee structures table may not exist yet. Run setup script first.');
      } else {
        alert(t('financeApp.pset2.failedFetchStructures'));
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchLateFeeRules = async () => {
    setLoading(true);
    try {
      const response = await api.get('/finance/late-fee-rules');
      setLateFeeRules(response.data.data || []);
    } catch (error) {
      console.error('Error fetching late fee rules:', error);
      // If tables don't exist yet, show empty state instead of error
      if (error.response?.status === 500) {
        setLateFeeRules([]);
        console.log('Late fee rules table may not exist yet. Run setup script first.');
      } else {
        alert(t('financeApp.pset2.failedFetchRules'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async (e) => {
    e.preventDefault();
    
    if (!defaultAccount) {
      alert(t('financeApp.pset2.noIncomeAccountAlert'));
      return;
    }

    if (classForm.selectedClasses.length === 0) {
      alert(t('financeApp.pset2.selectClassAlert'));
      return;
    }

    if (classForm.selectedMonths.length === 0) {
      alert(t('financeApp.pset2.selectMonthAlert'));
      return;
    }

    try {
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      const academicYearName = `${currentYear}-${nextYear}`;
      const academicYearId = '00000000-0000-0000-0000-' + currentYear.toString().padStart(12, '0');

      const monthsData = {
        months: classForm.selectedMonths,
        description: classForm.description || t('financeApp.pset.monthlyTuitionFeeDesc'),
        oldRegistrationFee: parseFloat(classForm.oldRegistrationFee) || 0,
        newRegistrationFee: parseFloat(classForm.newRegistrationFee) || 0
      };

      let successCount = 0;
      let failCount = 0;
      let failReasons = [];

      for (const className of classForm.selectedClasses) {
        try {
          await api.post('/finance/fee-structures', {
            name: `${className} Monthly Fee ${academicYearName}`,
            academicYearId: academicYearId,
            gradeLevel: className,
            description: JSON.stringify(monthsData),
            items: [{
              feeCategory: 'TUITION',
              amount: parseFloat(classForm.monthlyFee),
              accountId: defaultAccount.id,
              paymentType: 'RECURRING',
              description: classForm.description || t('financeApp.pset.monthlyTuitionFeeDesc')
            }]
          });
          successCount++;
        } catch (innerErr) {
          failCount++;
          failReasons.push(`${className}: ${innerErr.response?.data?.message || innerErr.message}`);
        }
      }

      const oldTotal = parseFloat(classForm.monthlyFee) + parseFloat(classForm.oldRegistrationFee);
      const newTotal = parseFloat(classForm.monthlyFee) + parseFloat(classForm.newRegistrationFee);
      let msg = t('financeApp.pset2.classesSuccess', { count: successCount }) + '\n\n';
      msg += t('financeApp.pset2.feeLine', { amount: classForm.monthlyFee });
      if (parseFloat(classForm.oldRegistrationFee) > 0 || parseFloat(classForm.newRegistrationFee) > 0) {
        msg += '\n' + t('financeApp.pset2.oldRegLine', { amount: classForm.oldRegistrationFee || 0 });
        msg += '\n' + t('financeApp.pset2.newRegLine', { amount: classForm.newRegistrationFee || 0 });
      }
      msg += '\n' + t('financeApp.pset2.monthsLine', { count: classForm.selectedMonths.length }) + '\n';
      msg += '\n' + t('financeApp.pset2.firstMonthOld', { amount: oldTotal });
      msg += '\n' + t('financeApp.pset2.firstMonthNew', { amount: newTotal });
      
      if (failCount > 0) {
        msg += '\n\n' + t('financeApp.pset2.classesFailed', { count: failCount }) + '\n' + failReasons.join('\n');
      }
      
      alert(msg);
      setShowAddClass(false);
      setClassForm({ selectedClasses: [], monthlyFee: '', oldRegistrationFee: '', newRegistrationFee: '', description: '', selectedMonths: [] });
      fetchFeeStructures();
    } catch (error) {
      console.error('Error adding class:', error);
      const errorMsg = error.response?.data?.message || t('financeApp.pset2.failedAddClass');
      const errorDetails = error.response?.data?.details;
      
      if (errorDetails && Array.isArray(errorDetails)) {
        const detailMsg = errorDetails.map(d => d.message).join('\n');
        alert(`${errorMsg}\n\n${detailMsg}`);
      } else {
        alert(errorMsg);
      }
    }
  };

  const handleAddLateFee = async (e) => {
    e.preventDefault();
    try {
      await api.post('/finance/late-fee-rules', {
        name: lateFeeForm.name,
        type: lateFeeForm.penaltyType,
        value: parseFloat(lateFeeForm.penaltyValue),
        gracePeriodDays: parseInt(lateFeeForm.gracePeriodDays),
        applicableFeeCategories: lateFeeForm.applicableFeeCategories,
        isActive: true
      });

      alert(t('financeApp.pset2.ruleAdded'));
      setShowAddLateFee(false);
      setLateFeeForm({
        name: '',
        gracePeriodDays: 0,
        penaltyType: 'FIXED_AMOUNT',
        penaltyValue: '',
        applicableFeeCategories: ['TUITION']
      });
      fetchLateFeeRules();
    } catch (error) {
      console.error('Error adding late fee rule:', error);
      const errorMsg = error.response?.data?.message || t('financeApp.pset2.failedAddRule');
      const errorDetails = error.response?.data?.details;
      
      if (errorDetails && Array.isArray(errorDetails)) {
        const detailMsg = errorDetails.map(d => d.message).join('\n');
        alert(`${errorMsg}\n\n${detailMsg}`);
      } else {
        alert(errorMsg);
      }
    }
  };

  const handleToggleActive = async (id, currentStatus, type) => {
    try {
      if (type === 'feeStructure') {
        await api.put(`/finance/fee-structures/${id}`, {
          isActive: !currentStatus
        });
        fetchFeeStructures();
      } else if (type === 'lateFee') {
        await api.put(`/finance/late-fee-rules/${id}`, {
          isActive: !currentStatus
        });
        fetchLateFeeRules();
      }
      alert(t('financeApp.pset2.statusUpdated'));
    } catch (error) {
      console.error('Error updating status:', error);
      alert(t('financeApp.pset2.failedUpdateStatus'));
    }
  };

  const handleDeleteFeeStructure = async (id, className) => {
    if (!confirm(t('financeApp.pset2.confirmDeleteStructure', { className }))) {
      return;
    }

    try {
      await api.delete(`/finance/fee-structures/${id}`);
      alert(t('financeApp.pset2.structureDeleted'));
      fetchFeeStructures();
    } catch (error) {
      console.error('Error deleting fee structure:', error);
      const errorMsg = error.response?.data?.message || t('financeApp.pset2.failedDeleteStructure');
      alert(errorMsg);
    }
  };

  const handleDeleteLateFeeRule = async (id, ruleName) => {
    if (!confirm(t('financeApp.pset2.confirmDeleteRule', { ruleName }))) {
      return;
    }

    try {
      await api.delete(`/finance/late-fee-rules/${id}`);
      alert(t('financeApp.pset2.ruleDeleted'));
      fetchLateFeeRules();
    } catch (error) {
      console.error('Error deleting late fee rule:', error);
      const errorMsg = error.response?.data?.message || t('financeApp.pset2.failedDeleteRule');
      alert(errorMsg);
    }
  };

  const handleApplyLateFees = async () => {
    if (!confirm(t('financeApp.pset2.confirmApplyLateFees'))) {
      return;
    }

    try {
      const response = await api.post('/finance/apply-late-fees');
      const { appliedCount, results } = response.data;
      
      if (appliedCount === 0) {
        alert(t('financeApp.pset2.noLateFeesApplied'));
      } else {
        alert(t('financeApp.pset2.lateFeesApplied', { count: appliedCount }));
      }
    } catch (error) {
      console.error('Error applying late fees:', error);
      alert(t('financeApp.pset2.failedApplyLateFees') + (error.response?.data?.message || error.message));
    }
  };

  const handleSaveGeneralSettings = async () => {
    setSavingSettings(true);
    try {
      // Store settings in localStorage for now
      // In production, this would be saved to the backend
      localStorage.setItem('financeGeneralSettings', JSON.stringify(generalSettings));
      alert(t('financeApp.pset2.settingsSaved'));
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(t('financeApp.pset2.failedSaveSettings'));
    } finally {
      setSavingSettings(false);
    }
  };

  // Load general settings on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('financeGeneralSettings');
      if (savedSettings) {
        setGeneralSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, []);

  const handleGenerateInvoices = async (feeStructure) => {
    setGeneratingInvoices(true);
    try {
      // Validate fee structure has required data
      if (!feeStructure || !feeStructure.id) {
        alert(t('financeApp.pset2.invalidStructure'));
        setGeneratingInvoices(false);
        return;
      }

      // Parse months data to show in confirmation
      let selectedMonths = [];
      try {
        let desc = feeStructure.description || '{}';
        // Decode HTML entities if present (e.g. &quot; -> ")
        desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        const monthsData = JSON.parse(desc);
        selectedMonths = monthsData.months || [];
      } catch (error) {
        console.error('Error parsing months data:', error);
      }

      const ethiopianMonthNames = [
        'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
        'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
      ];

      const monthsList = selectedMonths.map(m => ethiopianMonthNames[m - 1]).join(', ');

      if (!confirm(t('financeApp.pset2.generateConfirm', {
        count: selectedMonths.length,
        grade: feeStructure.gradeLevel,
        months: monthsList,
        invoices: selectedMonths.length
      }))) {
        setGeneratingInvoices(false);
        return;
      }

      // Generate ALL invoices at once
      const response = await api.post('/finance/progressive-invoices/generate-all', {
        feeStructureId: feeStructure.id
      });

      const result = response.data.data;

      let message = t('financeApp.pset2.generatedSuccess');
      message += t('financeApp.pset2.totalMonthsLine', { count: result.totalMonths });
      message += t('financeApp.pset2.newStudentsLine', { count: result.summary.newStudents });
      if (result.summary.existingStudents > 0) {
        message += t('financeApp.pset2.existingInvoicesLine', { count: result.summary.existingStudents });
      }
      message += t('financeApp.pset2.totalInvoicesLine', { count: result.totalInvoices });
      message += t('financeApp.pset2.monthlyFeeLine', { amount: result.summary.monthlyFee });
      if (result.summary.oldRegistrationFee > 0 || result.summary.newRegistrationFee > 0) {
        message += t('financeApp.pset2.oldRegFeeLine', { amount: result.summary.oldRegistrationFee });
        message += t('financeApp.pset2.newRegFeeLine', { amount: result.summary.newRegistrationFee });
        message += t('financeApp.pset2.firstMonthOldRate', { amount: result.summary.firstMonthOldTotal });
        message += t('financeApp.pset2.firstMonthNewRate', { amount: result.summary.firstMonthNewTotal });
        message += t('financeApp.pset2.chooseOldNew');
      }
      message += t('financeApp.pset2.totalPerStudentLine', { amount: result.summary.totalPerStudent });
      message += t('financeApp.pset2.monthlyBreakdown');
      
      result.monthlyResults.slice(0, 5).forEach(month => {
        message += t('financeApp.pset2.invoiceBullet', { monthName: month.monthName, count: month.successCount }) + '\n';
      });
      
      if (result.monthlyResults.length > 5) {
        message += t('financeApp.pset2.moreMonths', { count: result.monthlyResults.length - 5 }) + '\n';
      }
      
      message += t('financeApp.pset2.balanceNote');

      alert(message);
      
      // Refresh fee structures to update UI
      fetchFeeStructures();
      
    } catch (error) {
      console.error('Error generating invoices:', error);
      const errorMsg = error.response?.data?.message || error.message;
      const errorDetails = error.response?.data?.details;
      
      // More detailed error message
      let fullErrorMsg = t('financeApp.pset2.generateFailed') + errorMsg;
      
      if (errorDetails) {
        fullErrorMsg += t('financeApp.pset2.detailsColon') + errorDetails;
      }
      
      // Add helpful hints based on error type
      if (errorMsg.includes('No months configured')) {
        fullErrorMsg += t('financeApp.pset2.hintNoMonths');
      } else if (errorMsg.includes('No students found')) {
        fullErrorMsg += t('financeApp.pset2.hintNoStudents');
      } else if (errorMsg.includes('already generated')) {
        // Ask if user wants to regenerate
        const shouldRegenerate = confirm(fullErrorMsg + t('financeApp.pset2.regenerateConfirm'));
        
        if (shouldRegenerate) {
          // Retry with regenerate flag
          try {
            const response = await api.post('/finance/progressive-invoices/generate-all', {
              feeStructureId: feeStructure.id,
              regenerate: true
            });

            const result = response.data.data;

            let message = t('financeApp.pset2.regeneratedSuccess');
            message += t('financeApp.pset2.previousDeleted');
            message += t('financeApp.pset2.totalMonthsLine', { count: result.totalMonths });
            message += t('financeApp.pset2.regTotalStudents', { count: result.summary.newStudents });
            message += t('financeApp.pset2.totalInvoicesLine', { count: result.totalInvoices });
            message += t('financeApp.pset2.monthlyFeeLine', { amount: result.summary.monthlyFee });
            if (result.summary.registrationFee > 0) {
              message += t('financeApp.pset2.regRegistrationFee', { amount: result.summary.registrationFee });
              message += t('financeApp.pset2.firstMonthTotal', { amount: result.summary.firstMonthTotal });
            }
            message += t('financeApp.pset2.totalPerStudentLine', { amount: result.summary.totalPerStudent });
            message += t('financeApp.pset2.monthlyBreakdown');
            
            result.monthlyResults.slice(0, 5).forEach(month => {
              message += t('financeApp.pset2.invoiceBullet', { monthName: month.monthName, count: month.successCount }) + '\n';
            });
            
            if (result.monthlyResults.length > 5) {
              message += t('financeApp.pset2.moreMonths', { count: result.monthlyResults.length - 5 }) + '\n';
            }

            alert(message);
            fetchFeeStructures();
          } catch (regenerateError) {
            console.error('Error regenerating invoices:', regenerateError);
            alert(t('financeApp.pset2.regFailed') + (regenerateError.response?.data?.message || regenerateError.message));
          }
        }
        return; // Exit early, don't show the error alert again
      }
      
      alert(fullErrorMsg);
    } finally {
      setGeneratingInvoices(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{t('financeApp.pset.title')}</h1>
          <p>{t('financeApp.pset.subtitle')}</p>
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
            {t('financeApp.pset.currentEthiopianDate')}{currentEthiopianDate.day} {currentEthiopianDate.monthName} {currentEthiopianDate.year}
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'classes' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('classes')}
        >
          {t('financeApp.pset.tabClassFees')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'latefees' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('latefees')}
        >
          {t('financeApp.pset.tabLateFees')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'general' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('general')}
        >
          {t('financeApp.pset.tabGeneral')}
        </button>
      </div>

      {loading && <div className={styles.loading}>{t('financeApp.pset.loading')}</div>}

      {/* Class Fees Tab */}
      {activeTab === 'classes' && !loading && (
        <div className={styles.tabContent}>
          <div className={styles.sectionHeader}>
            <h2>{t('financeApp.pset.classMonthlyFees')}</h2>
            <button 
              className={styles.addButton}
              onClick={() => setShowAddClass(true)}
            >
              {t('financeApp.pset.addClassFee')}
            </button>
          </div>

          <div className={styles.cardGrid}>
            {feeStructures.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>{t('financeApp.pset.noClassFees')}</h3>
                <p>{t('financeApp.pset.noClassFeesHint')}</p>
                <p className={styles.hint}>{t('financeApp.pset.setupTip')}</p>
                <code>cd backend && node scripts/setup-monthly-payments.js</code>
              </div>
            ) : (
              feeStructures.map((structure) => {
                // Parse months data
                let selectedMonths = [];
                  let monthsDescription = '';
                  try {
                    let desc = structure.description || '{}';
                    desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
                    const monthsData = JSON.parse(desc);
                    selectedMonths = monthsData.months || [];
                    monthsDescription = monthsData.description || '';
                  } catch (error) {
                  // If parsing fails, it's an old structure without months data
                }

                const ethiopianMonthNames = [
                  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
                  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
                ];
                const monthsText = selectedMonths.length > 0 
                  ? selectedMonths.map(m => ethiopianMonthNames[m - 1]).join(', ')
                  : t('financeApp.pset.allMonths');

                return (
                  <div key={structure.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <h3>{structure.gradeLevel || structure.name}</h3>
                      <div className={styles.cardActions}>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={structure.isActive}
                            onChange={() => handleToggleActive(structure.id, structure.isActive, 'feeStructure')}
                          />
                          <span className={styles.slider}></span>
                        </label>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDeleteFeeStructure(structure.id, structure.gradeLevel || structure.name)}
                          title={t('financeApp.pset.deleteFeeTitle')}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.feeAmount}>
                        ${structure.items?.[0]?.amount || 0}{t('financeApp.pset.perMonth')}
                      </div>
                      <div className={styles.cardDetails}>
                        <p><strong>{t('financeApp.pset.academicYear')}</strong> {structure.academicYearId}</p>
                        <p><strong>{t('financeApp.pset.statusColon')}</strong> {structure.isActive ? t('financeApp.pset.active') : t('financeApp.pset.inactive')}</p>
                        {selectedMonths.length > 0 && (
                          <>
                            <p><strong>{t('financeApp.pset.paymentMonths')}</strong> {selectedMonths.length} {t('financeApp.pset.monthsWord')}</p>
                            <p className={styles.monthsList}>{monthsText}</p>
                          </>
                        )}
                      </div>
                      <button 
                        className={styles.generateButton}
                        onClick={() => handleGenerateInvoices(structure)}
                        disabled={generatingInvoices || !structure.isActive}
                      >
                        {generatingInvoices ? t('financeApp.pset.generating') : t('financeApp.pset.generateAllMonths')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showAddClass && (
            <div className={styles.modal}>
              <div className={styles.modalContent}>
                <h2>{t('financeApp.pset.addStructure')}</h2>
                
                {!defaultAccount && (
                  <div className={styles.warningBox}>
                    <strong>{t('financeApp.pset.setupRequired')}</strong>
                    <p>{t('financeApp.pset.noIncomeAccount')}</p>
                    <code>cd backend && node scripts/setup-default-accounts.js</code>
                  </div>
                )}
                
                <form onSubmit={handleAddClass}>
                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.selectClasses')} <span style={{fontSize:'0.8em',color:'#666'}}>{t('financeApp.pset.chooseOneOrMore')}</span></label>
                    <div className={styles.monthGrid}>
                      {availableClasses.map((cls) => (
                        <label key={cls.value} className={styles.monthCheckbox}>
                          <input
                            type="checkbox"
                            checked={classForm.selectedClasses.includes(cls.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setClassForm({
                                  ...classForm,
                                  selectedClasses: [...classForm.selectedClasses, cls.value]
                                });
                              } else {
                                setClassForm({
                                  ...classForm,
                                  selectedClasses: classForm.selectedClasses.filter(c => c !== cls.value)
                                });
                              }
                            }}
                            disabled={!defaultAccount}
                          />
                          <span>{cls.name}</span>
                        </label>
                      ))}
                    </div>
                    <small className={styles.hint}>
                      {classForm.selectedClasses.length > 0 
                        ? t('financeApp.pset.classesSelected', { count: classForm.selectedClasses.length })
                        : t('financeApp.pset.selectClassesHint')}
                    </small>
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.monthlyFeeAmount')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={classForm.monthlyFee}
                      onChange={(e) => setClassForm({...classForm, monthlyFee: e.target.value})}
                      placeholder={t('financeApp.pset.monthlyFeePh')}
                      required
                      disabled={!defaultAccount}
                    />
                    <small className={styles.hint}>
                      {t('financeApp.pset.chargedMonthly')}
                    </small>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>{t('financeApp.pset.oldRegFee')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={classForm.oldRegistrationFee}
                        onChange={(e) => setClassForm({...classForm, oldRegistrationFee: e.target.value})}
                        placeholder={t('financeApp.pset.oldRegPh')}
                        required
                        disabled={!defaultAccount}
                      />
                      <small className={styles.hint}>
                        {t('financeApp.pset.oldRegHint')}
                      </small>
                    </div>
                    <div className={styles.formGroup}>
                      <label>{t('financeApp.pset.newRegFee')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={classForm.newRegistrationFee}
                        onChange={(e) => setClassForm({...classForm, newRegistrationFee: e.target.value})}
                        placeholder={t('financeApp.pset.newRegPh')}
                        required
                        disabled={!defaultAccount}
                      />
                      <small className={styles.hint}>
                        {t('financeApp.pset.newRegHint')}
                      </small>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.selectMonths')}</label>
                    <div className={styles.infoBox} style={{ 
                      background: '#e3f2fd', 
                      padding: '10px', 
                      borderRadius: '6px', 
                      marginBottom: '10px',
                      fontSize: '0.9em'
                    }}>
                      <strong>{t('financeApp.pset.currentMonth')}</strong> {currentEthiopianDate.monthName} ({t('financeApp.pset.monthWord')} {currentEthiopianDate.month})
                      <br />
                      <small>{t('financeApp.pset.monthsNote')}</small>
                    </div>
                    <div className={styles.monthGrid}>
                      {months.map((month) => {
                        const isPastOrCurrent = month.value <= currentEthiopianDate.month;
                        const isFuture = month.value > currentEthiopianDate.month;
                        
                        return (
                          <label 
                            key={month.value} 
                            className={styles.monthCheckbox}
                            style={isFuture ? { opacity: 0.6 } : {}}
                          >
                            <input
                              type="checkbox"
                              checked={classForm.selectedMonths.includes(month.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setClassForm({
                                    ...classForm,
                                    selectedMonths: [...classForm.selectedMonths, month.value].sort((a, b) => a - b)
                                  });
                                } else {
                                  setClassForm({
                                    ...classForm,
                                    selectedMonths: classForm.selectedMonths.filter(m => m !== month.value)
                                  });
                                }
                              }}
                              disabled={!defaultAccount}
                            />
                            <span>
                              {month.name}
                              {isPastOrCurrent && <span style={{ color: '#4CAF50', marginLeft: '5px' }}>✓</span>}
                              {isFuture && <span style={{ color: '#999', marginLeft: '5px' }}>🔒</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <small className={styles.hint}>
                      {classForm.selectedMonths.length > 0 
                        ? t('financeApp.pset.monthsSelected', { count: classForm.selectedMonths.length }) 
                        : t('financeApp.pset.selectMonthsHint')}
                      <br />
                      <strong>{t('financeApp.pset.noteColon')}</strong> {t('financeApp.pset.monthsUnlockNote')}
                    </small>
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.description')}</label>
                    <textarea
                      value={classForm.description}
                      onChange={(e) => setClassForm({...classForm, description: e.target.value})}
                      placeholder={t('financeApp.pset.descriptionPh')}
                      rows="3"
                      disabled={!defaultAccount}
                    />
                  </div>

                  <div className={styles.modalActions}>
                    <button 
                      type="submit" 
                      className={styles.submitButton}
                      disabled={!defaultAccount}
                    >
                      {t('financeApp.pset.addClassFeeButton')}
                    </button>
                    <button 
                      type="button" 
                      className={styles.cancelButton}
                      onClick={() => setShowAddClass(false)}
                    >
                      {t('financeApp.pset.cancel')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Late Fees Tab */}
      {activeTab === 'latefees' && !loading && (
        <div className={styles.tabContent}>
          <div className={styles.sectionHeader}>
            <h2>{t('financeApp.pset.lateFeeRules')}</h2>
            <div className={styles.headerButtons}>
              <button 
                className={styles.applyButton}
                onClick={handleApplyLateFees}
              >
                {t('financeApp.pset.applyLateFees')}
              </button>
              <button 
                className={styles.addButton}
                onClick={() => setShowAddLateFee(true)}
                disabled={lateFeeRules.length >= 2}
                title={lateFeeRules.length >= 2 ? t('financeApp.pset.maxLateRules') : t('financeApp.pset.addLateRuleTitle')}
              >
                {t('financeApp.pset.addLateRule')} {lateFeeRules.length >= 2 && t('financeApp.pset.max2')}
              </button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            {lateFeeRules.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>{t('financeApp.pset.noLateRules')}</h3>
                <p>{t('financeApp.pset.noLateRulesHint')}</p>
                <p className={styles.hint}>{t('financeApp.pset.lateFeesTip')}</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('financeApp.pset.thRuleName')}</th>
                    <th>{t('financeApp.pset.thGracePeriod')}</th>
                    <th>{t('financeApp.pset.thPenaltyType')}</th>
                    <th>{t('financeApp.pset.thPenaltyValue')}</th>
                    <th>{t('financeApp.pset.thStatus')}</th>
                    <th>{t('financeApp.pset.thActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lateFeeRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.name}</td>
                      <td>{rule.gracePeriodDays} {t('financeApp.pset.days')}</td>
                      <td>{rule.type}</td>
                      <td>
                        {rule.type === 'PERCENTAGE' ? `${rule.value}%` : `$${rule.value}`}
                      </td>
                      <td>
                        <span className={rule.isActive ? styles.statusActive : styles.statusInactive}>
                          {rule.isActive ? t('financeApp.pset.active') : t('financeApp.pset.inactive')}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={rule.isActive}
                              onChange={() => handleToggleActive(rule.id, rule.isActive, 'lateFee')}
                            />
                            <span className={styles.slider}></span>
                          </label>
                          <button
                            className={styles.deleteButton}
                            onClick={() => handleDeleteLateFeeRule(rule.id, rule.name)}
                            title={t('financeApp.pset.deleteRuleTitle')}
                          >
                            {t('financeApp.pset.deleteShort')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {showAddLateFee && (
            <div className={styles.modal}>
              <div className={styles.modalContent}>
                <h2>{t('financeApp.pset.addRuleStructure')}</h2>
                <form onSubmit={handleAddLateFee}>
                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.ruleName')}</label>
                    <input
                      type="text"
                      value={lateFeeForm.name}
                      onChange={(e) => setLateFeeForm({...lateFeeForm, name: e.target.value})}
                      placeholder={t('financeApp.pset.ruleNamePh')}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.graceDays')}</label>
                    <input
                      type="number"
                      value={lateFeeForm.gracePeriodDays}
                      onChange={(e) => setLateFeeForm({...lateFeeForm, gracePeriodDays: e.target.value})}
                      placeholder={t('financeApp.pset.graceDaysPh')}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.penaltyType')}</label>
                    <select
                      value={lateFeeForm.penaltyType}
                      onChange={(e) => setLateFeeForm({...lateFeeForm, penaltyType: e.target.value})}
                      required
                    >
                      <option value="FIXED_AMOUNT">{t('financeApp.pset.fixedAmount')}</option>
                      <option value="PERCENTAGE">{t('financeApp.pset.percentage')}</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t('financeApp.pset.penaltyValue')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={lateFeeForm.penaltyValue}
                      onChange={(e) => setLateFeeForm({...lateFeeForm, penaltyValue: e.target.value})}
                      placeholder={lateFeeForm.penaltyType === 'PERCENTAGE' ? t('financeApp.pset.percentagePh') : t('financeApp.pset.fixedPh')}
                      required
                    />
                  </div>

                  <div className={styles.modalActions}>
                    <button type="submit" className={styles.submitButton}>
                      {t('financeApp.pset.addRuleStructure')}
                    </button>
                    <button 
                      type="button" 
                      className={styles.cancelButton}
                      onClick={() => setShowAddLateFee(false)}
                    >
                      {t('financeApp.pset.cancel')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className={styles.tabContent}>
          <h2>{t('financeApp.pset.generalTitle')}</h2>
          
          <div className={styles.settingsSection}>
            <h3>{t('financeApp.pset.paymentMethods')}</h3>
            <div className={styles.checkboxGroup}>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.paymentMethods.cash}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    paymentMethods: { ...generalSettings.paymentMethods, cash: e.target.checked }
                  })}
                /> {t('financeApp.pset.cash')}
              </label>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.paymentMethods.bankTransfer}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    paymentMethods: { ...generalSettings.paymentMethods, bankTransfer: e.target.checked }
                  })}
                /> {t('financeApp.pset.bankTransfer')}
              </label>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.paymentMethods.mobileMoney}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    paymentMethods: { ...generalSettings.paymentMethods, mobileMoney: e.target.checked }
                  })}
                /> {t('financeApp.pset.mobileMoney')}
              </label>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.paymentMethods.onlinePayment}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    paymentMethods: { ...generalSettings.paymentMethods, onlinePayment: e.target.checked }
                  })}
                /> {t('financeApp.pset.onlinePayment')}
              </label>
            </div>
          </div>

          <div className={styles.settingsSection}>
            <h3>{t('financeApp.pset.invoiceSettings')}</h3>
            <div className={styles.formGroup}>
              <label>{t('financeApp.pset.defaultDueDate')}</label>
              <input 
                type="number" 
                value={generalSettings.invoiceSettings.defaultDueDays}
                onChange={(e) => setGeneralSettings({
                  ...generalSettings,
                  invoiceSettings: { ...generalSettings.invoiceSettings, defaultDueDays: parseInt(e.target.value) || 30 }
                })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('financeApp.pset.invoicePrefix')}</label>
              <input 
                type="text" 
                value={generalSettings.invoiceSettings.invoicePrefix}
                onChange={(e) => setGeneralSettings({
                  ...generalSettings,
                  invoiceSettings: { ...generalSettings.invoiceSettings, invoicePrefix: e.target.value }
                })}
              />
            </div>
          </div>

          <div className={styles.settingsSection}>
            <h3>{t('financeApp.pset.notifications')}</h3>
            <div className={styles.checkboxGroup}>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.notifications.paymentReminders}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    notifications: { ...generalSettings.notifications, paymentReminders: e.target.checked }
                  })}
                /> {t('financeApp.pset.sendReminders')}
              </label>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.notifications.paymentConfirmations}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    notifications: { ...generalSettings.notifications, paymentConfirmations: e.target.checked }
                  })}
                /> {t('financeApp.pset.sendConfirmations')}
              </label>
              <label>
                <input 
                  type="checkbox" 
                  checked={generalSettings.notifications.overdueNotifications}
                  onChange={(e) => setGeneralSettings({
                    ...generalSettings,
                    notifications: { ...generalSettings.notifications, overdueNotifications: e.target.checked }
                  })}
                /> {t('financeApp.pset.sendOverdue')}
              </label>
            </div>
          </div>

          <button 
            className={styles.saveButton}
            onClick={handleSaveGeneralSettings}
            disabled={savingSettings}
          >
            {savingSettings ? t('financeApp.pset.saving') : t('financeApp.pset.saveSettings')}
          </button>
        </div>
      )}
    </div>
  );
};

export default MonthlyPaymentSettings;
