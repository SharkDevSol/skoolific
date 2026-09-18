import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SuperFinanceLogin from './SuperFinanceLogin';
import styles from './SuperFinanceApp.module.css';

// ---- Finance (shared with Finance App) ----
const MonthlyPayments = lazy(() => import('../Finance/MonthlyPaymentsNew'));
const MonthlyPaymentSettings = lazy(() => import('../Finance/MonthlyPaymentSettings'));
const FinanceReports = lazy(() => import('../Finance/FinanceReports'));
const StudentExemption = lazy(() => import('../Finance/StudentExemption'));
const CreateRegisterStudent = lazy(() => import('../CreateRegister/CreateRegisterStudent/CreateRegisterStudent'));
const CreateRegisterStaff = lazy(() => import('../CreateRegister/CreateRegisterStaff/CreateRegisterStaff'));
const ListStudent = lazy(() => import('../List/ListStudent/ListStudent'));
const ListStaff = lazy(() => import('../List/ListStaff/ListStaff'));
const ListGuardian = lazy(() => import('../List/ListGuardian/ListGuardian'));
const SmsCounter = lazy(() => import('../SmsCounter/SmsCounter'));
const SuperFinanceSettings = lazy(() => import('./SuperFinanceSettings'));

// ---- Finance Management (remaining pages) ----
const FinanceDashboard = lazy(() => import('../Finance/FinanceDashboard'));
const ChartOfAccounts = lazy(() => import('../Finance/ChartOfAccounts/ChartOfAccounts'));
const FeeManagement = lazy(() => import('../Finance/FeeManagement/FeeManagement'));
const InvoiceManagement = lazy(() => import('../Finance/InvoiceManagement'));
const FeePaymentManagement = lazy(() => import('../Finance/FeePaymentManagement'));
const ExpenseManagement = lazy(() => import('../Finance/ExpenseManagement'));
const ExpenseApproval = lazy(() => import('../Finance/ExpenseApproval'));
const BudgetManagement = lazy(() => import('../Finance/BudgetManagement'));
const PayrollManagement = lazy(() => import('../Finance/PayrollManagement'));

// ---- Inventory & Stock ----
const InventoryDashboard = lazy(() => import('../Inventory/InventoryDashboard'));
const ItemMaster = lazy(() => import('../Inventory/ItemMaster'));
const PurchaseOrders = lazy(() => import('../Inventory/PurchaseOrders'));
const StockMovements = lazy(() => import('../Inventory/StockMovements'));
const SupplierManagement = lazy(() => import('../Inventory/SupplierManagement'));
const InventoryReports = lazy(() => import('../Inventory/InventoryReports'));

// ---- Asset Management ----
const AssetDashboard = lazy(() => import('../Assets/AssetDashboard'));
const AssetRegistry = lazy(() => import('../Assets/AssetRegistry'));
const AssetAssignment = lazy(() => import('../Assets/AssetAssignment'));
const AssetMaintenance = lazy(() => import('../Assets/AssetMaintenance'));
const AssetDepreciation = lazy(() => import('../Assets/AssetDepreciation'));
const AssetDisposal = lazy(() => import('../Assets/AssetDisposal'));
const AssetReports = lazy(() => import('../Assets/AssetReports'));

// ---- HR & Staff Management ----
const HRDashboard = lazy(() => import('../HR/HRDashboard'));
const SalaryManagement = lazy(() => import('../HR/SalaryManagement'));
const AttendanceSystem = lazy(() => import('../HR/AttendanceSystem'));
const AttendanceDeductionSettings = lazy(() => import('../HR/AttendanceDeductionSettings'));
const AttendanceTimeSettings = lazy(() => import('../HR/AttendanceTimeSettingsCombined'));
const DeviceStatus = lazy(() => import('../HR/DeviceStatus'));
const LeaveManagement = lazy(() => import('../HR/LeaveManagement'));
const PayrollSystem = lazy(() => import('../HR/PayrollSystem'));
const HRReports = lazy(() => import('../HR/HRReports'));

const PageLoader = () => {
  const { t } = useTranslation();
  return <div className={styles.loader}>{t('financeApp.shell.app.loading')}</div>;
};

// Section index for every route prefix (menu order: 0 Finance, 1 Inventory, 2 HR, 3 Assets, 4 Students, 5 SMS, 6 Account)
const SECTION_PATH_PREFIXES = [
  ['/app/super-finance/finance', 0],
  ['/app/super-finance/monthly-payments', 0],
  ['/app/super-finance/monthly-payment-settings', 0],
  ['/app/super-finance/student-exemption', 0],
  ['/app/super-finance/accounts', 0],
  ['/app/super-finance/fee-management', 0],
  ['/app/super-finance/invoices', 0],
  ['/app/super-finance/payments', 0],
  ['/app/super-finance/payroll', 0],
  ['/app/super-finance/expenses', 0],
  ['/app/super-finance/expense-approval', 0],
  ['/app/super-finance/budgets', 0],
  ['/app/super-finance/reports', 0],
  ['/app/super-finance/inventory', 1],
  ['/app/super-finance/hr', 2],
  ['/app/super-finance/assets', 3],
  ['/app/super-finance/list-student', 4],
  ['/app/super-finance/list-staff', 4],
  ['/app/super-finance/list-guardian', 4],
  ['/app/super-finance/register-student', 4],
  ['/app/super-finance/register-staff', 4],
  ['/app/super-finance/sms-counter', 5],
  ['/app/super-finance/settings', 6],
];

const SuperFinanceApp = () => {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('financeDarkMode') === 'true');
  const [checked, setChecked] = useState(false);
  const [branchCode, setBranchCodeState] = useState(() => sessionStorage.getItem('branchCode') || '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const branches = (user?.branches && user.branches.length > 0)
    ? user.branches
    : (user?.allowedBranches || []).map(b => ({ branchCode: b, branchName: b }));

  useEffect(() => {
    // Boss theme: dark by default; the toggle switches to the light variant
    if (darkMode) {
      document.documentElement.classList.remove('sf-light');
    } else {
      document.documentElement.classList.add('sf-light');
    }
  }, [darkMode]);

  useEffect(() => {
    const token = localStorage.getItem('superFinanceToken');
    const userData = localStorage.getItem('superFinanceUser');
    const hasAuthToken = !!localStorage.getItem('authToken');

    if (token && userData && hasAuthToken) {
      try {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        // Restore auth + branch for underlying components
        localStorage.setItem('authToken', token);
        localStorage.setItem('isLoggedIn', 'true');
        // Default branch = first allowed branch (or previously selected one)
        const savedBranch = sessionStorage.getItem('branchCode');
        const firstBranch = (parsed.branches?.[0]?.branchCode) || (parsed.allowedBranches?.[0] || 'BRANCH1');
        if (!savedBranch) {
          sessionStorage.setItem('branchCode', firstBranch);
          setBranchCodeState(firstBranch);
        }
      } catch {}
    } else if (token && userData && !hasAuthToken) {
      localStorage.removeItem('superFinanceToken');
      localStorage.removeItem('superFinanceUser');
    }
    setChecked(true);
  }, []);

  // Collapsible sidebar sections (keyed by menu section index).
  // Hooks MUST be declared before any conditional return.
  const [openSections, setOpenSections] = useState(null);
  useEffect(() => {
    const active = SECTION_PATH_PREFIXES.find(([p]) => location.pathname.startsWith(p));
    if (active) {
      setOpenSections(prev => {
        if (prev === null) return new Set([active[1]]);
        if (prev.has(active[1])) return prev;
        const next = new Set(prev);
        next.add(active[1]);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isLoginPage = location.pathname === '/app/super-finance/login';

  if (!checked) return null;

  if (!user && !isLoginPage) {
    return <Navigate to="/app/super-finance/login" replace />;
  }

  if (user && isLoginPage) {
    return <Navigate to="/app/super-finance/" replace />;
  }

  const handleBranchChange = (code) => {
    sessionStorage.setItem('branchCode', code);
    setBranchCodeState(code);
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('superFinanceToken');
    localStorage.removeItem('superFinanceUser');
    localStorage.removeItem('authToken');
    localStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('branchCode');
    setUser(null);
    setBranchCodeState('');
    window.location.href = '/app/super-finance/login';
  };

  const LANGUAGES = [
    { code: 'en', label: '🇬🇧 English' },
    { code: 'am', label: '🇪🇹 አማርኛ' },
    { code: 'om', label: '🇪🇹 Afaan Oromoo' },
    { code: 'so', label: '🇸🇴 Soomaali' },
    { code: 'ar', label: '🇸🇦 العربية' },
  ];

  const P = (key, fallback) => t('sfPages.' + key, fallback);
  const F = (key, fallback) => t('financeApp.shell.sidebar.' + key, fallback);

  const menuItems = [
    { section: F('finance', 'Finance'), items: [
      { path: '/app/super-finance/finance', label: P('financeDashboard', 'Finance Dashboard'), icon: '📊' },
      { path: '/app/super-finance/monthly-payments', label: F('monthlyPayments', 'Monthly Payments'), icon: '💳' },
      { path: '/app/super-finance/student-exemption', label: F('studentExemption', 'Student Exemption'), icon: '🎓' },
      { path: '/app/super-finance/monthly-payment-settings', label: F('paymentSettings', 'Payment Settings'), icon: '⚙️' },
      { path: '/app/super-finance/accounts', label: P('accounts', 'Chart of Accounts'), icon: '📒' },
      { path: '/app/super-finance/fee-management', label: P('feeManagement', 'Fee Management'), icon: '🎓' },
      { path: '/app/super-finance/invoices', label: P('invoices', 'Invoices'), icon: '🧾' },
      { path: '/app/super-finance/payments', label: P('payments', 'Payments'), icon: '💰' },
      { path: '/app/super-finance/payroll', label: P('payroll', 'Payroll'), icon: '🧑‍💼' },
      { path: '/app/super-finance/expenses', label: P('expenses', 'Expenses'), icon: '💸' },
      { path: '/app/super-finance/expense-approval', label: P('expenseApproval', 'Expense Approval'), icon: '✅' },
      { path: '/app/super-finance/budgets', label: P('budgets', 'Budgets'), icon: '📈' },
      { path: '/app/super-finance/reports', label: F('reports', 'Reports'), icon: '📊' },
    ]},
    { section: P('inventory', 'Inventory & Stock'), items: [
      { path: '/app/super-finance/inventory', label: P('inventoryDashboard', 'Inventory Dashboard'), icon: '📦' },
      { path: '/app/super-finance/inventory/items', label: P('items', 'Items'), icon: '🏷️' },
      { path: '/app/super-finance/inventory/purchase-orders', label: P('purchaseOrders', 'Purchase Orders'), icon: '🛒' },
      { path: '/app/super-finance/inventory/movements', label: P('stockMovements', 'Stock Movements'), icon: '🔄' },
      { path: '/app/super-finance/inventory/suppliers', label: P('suppliers', 'Suppliers'), icon: '🚚' },
      { path: '/app/super-finance/inventory/reports', label: P('inventoryReports', 'Inventory Reports'), icon: '📋' },
    ]},
    { section: P('hr', 'HR & Staff Management'), items: [
      { path: '/app/super-finance/hr', label: P('hrDashboard', 'HR Dashboard'), icon: '👥' },
      { path: '/app/super-finance/hr/salary', label: P('salary', 'Salary'), icon: '💵' },
      { path: '/app/super-finance/hr/attendance', label: P('attendance', 'Attendance'), icon: '🕐' },
      { path: '/app/super-finance/device-status', label: P('deviceStatus', 'Device Status'), icon: '📟' },
      { path: '/app/super-finance/hr/attendance-deduction-settings', label: P('deductionSettings', 'Deduction Settings'), icon: '➖' },
      { path: '/app/super-finance/hr/attendance-time-settings', label: P('timeSettings', 'Time Settings'), icon: '⏰' },
      { path: '/app/super-finance/hr/leave', label: P('leave', 'Leave'), icon: '🏖️' },
      { path: '/app/super-finance/hr/payroll', label: P('payrollSystem', 'Payroll System'), icon: '🧾' },
      { path: '/app/super-finance/hr/reports', label: P('hrReports', 'HR Reports'), icon: '📊' },
    ]},
    { section: P('assets', 'Asset Management'), items: [
      { path: '/app/super-finance/assets', label: P('assetDashboard', 'Asset Dashboard'), icon: '🏛️' },
      { path: '/app/super-finance/assets/registry', label: P('registry', 'Registry'), icon: '🗂️' },
      { path: '/app/super-finance/assets/assignments', label: P('assignments', 'Assignments'), icon: '📤' },
      { path: '/app/super-finance/assets/maintenance', label: P('maintenance', 'Maintenance'), icon: '🔧' },
      { path: '/app/super-finance/assets/depreciation', label: P('depreciation', 'Depreciation'), icon: '📉' },
      { path: '/app/super-finance/assets/disposal', label: P('disposal', 'Disposal'), icon: '🗑️' },
      { path: '/app/super-finance/assets/reports', label: P('assetReports', 'Asset Reports'), icon: '📊' },
    ]},
    { section: F('students', 'Students'), items: [
      { path: '/app/super-finance/register-student', label: P('registerStudent', 'Register Student'), icon: '➕' },
      { path: '/app/super-finance/register-staff', label: P('registerStaff', 'Register Staff'), icon: '🧑‍🏫' },
      { path: '/app/super-finance/list-student', label: F('listStudents', 'List Students'), icon: '🎓' },
      { path: '/app/super-finance/list-staff', label: P('staffList', 'Staff List'), icon: '🧑‍🏫' },
      { path: '/app/super-finance/list-guardian', label: P('guardianList', 'Guardian List'), icon: '👨‍👩‍👧' },
    ]},
    { section: 'SMS', items: [
      { path: '/app/super-finance/sms-counter', label: 'SMS Counter', icon: '📊' },
    ]},
    { section: F('account', 'Account'), items: [
      { path: '/app/super-finance/settings', label: F('settings', 'Settings'), icon: '⚙️' },
    ]},
  ];

  const toggleSection = (idx) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const isSectionOpen = (idx) => openSections === null || openSections.has(idx);

  return (
    <div className={styles.appContainer}>
      {/* Mobile drawer overlay */}
      {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

      {user && (
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarBrand}>
            <span className={styles.sidebarLogoWrap}>
              <img src="/skoolific-icon.png" alt="Skoolific" className={styles.sidebarLogo} />
            </span>
            <h2 className={styles.sidebarTitle}>{t('superFinance.title', 'Super Finance App')}</h2>
          </div>
          <div className={styles.sidebarBranch}>
            <span className={styles.sidebarBranchDot} />
            <small>{user?.username} — {t('superFinance.allBranches', 'All Branches')}</small>
          </div>
        </div>

        <nav className={styles.sidebarNav}>
          {menuItems.map((group, idx) => {
            const open = isSectionOpen(idx);
            return (
              <div key={group.section} className={styles.sidebarGroup}>
                <button
                  type="button"
                  className={styles.sidebarGroupHeader}
                  onClick={() => toggleSection(idx)}
                >
                  <span className={styles.sidebarGroupLabel}>{group.section}</span>
                  <span className={`${styles.sidebarGroupChevron} ${open ? styles.sidebarGroupChevronOpen : ''}`}>▾</span>
                </button>
                {open && group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => `${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                  >
                    <span className={styles.sidebarIcon}>{item.icon}</span>
                    <span className={styles.sidebarItemLabel}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className={styles.languageSelector}>
          <label className={styles.languageLabel} htmlFor="superFinanceLanguage">
            {F('language', 'Language')}
          </label>
          <select
            id="superFinanceLanguage"
            className={styles.languageSelect}
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.sidebarFooter}>
          <button onClick={() => { setDarkMode(d => { const next = !d; localStorage.setItem('financeDarkMode', next); return next; }); }} className={styles.darkModeButton}>
            <span className={styles.sidebarBtnIcon}>{darkMode ? '☀️' : '🌙'}</span>
            <span>{darkMode ? F('lightMode', 'Light Mode') : F('darkMode', 'Dark Mode')}</span>
          </button>
          <button onClick={handleLogout} className={styles.logoutButton}>
            <span className={styles.sidebarBtnIcon}>↪</span>
            <span>{F('logout', 'Logout')}</span>
          </button>
        </div>
      </aside>
      )}

      <div className={styles.mainContent}>
        {/* Branch selector header */}
        {user && (
        <div className={styles.topBar}>
          <div className={styles.topBarTitle}>
            <button
              type="button"
              className={styles.hamburger}
              onClick={() => setSidebarOpen(v => !v)}
              aria-label="Menu"
            >
              ☰
            </button>
            <span className={styles.topBarCrown}>♛</span>
            {t('superFinance.title', 'Super Finance App')}
          </div>
          <div className={styles.topBarRight}>
            <span className={styles.userChip}>{user?.username}</span>
            <span className={styles.branchLabel}>
              {t('superFinance.selectBranch', 'Branch')}:
            </span>
            <select
              className={styles.branchSelect}
              value={branchCode}
              onChange={(e) => handleBranchChange(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.branchCode} value={b.branchCode}>
                  {b.branchCode}{b.branchName && b.branchName !== b.branchCode ? ` — ${b.branchName}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        )}

        <Suspense fallback={<PageLoader />}>
          {/* key={branchCode} forces pages to remount + refetch data for the selected branch */}
          <div key={branchCode}>
            <Routes>
              <Route path="login" element={<SuperFinanceLogin onLogin={setUser} />} />
              <Route index element={<Navigate to="/app/super-finance/monthly-payments" replace />} />

              {/* Finance */}
              <Route path="monthly-payments" element={<MonthlyPayments />} />
              <Route path="monthly-payment-settings" element={<MonthlyPaymentSettings />} />
              <Route path="student-exemption" element={<StudentExemption />} />
              <Route path="reports" element={<FinanceReports />} />
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="accounts" element={<ChartOfAccounts />} />
              <Route path="fee-management" element={<FeeManagement />} />
              <Route path="invoices" element={<InvoiceManagement />} />
              <Route path="payments" element={<FeePaymentManagement />} />
              <Route path="payroll" element={<PayrollManagement />} />
              <Route path="expenses" element={<ExpenseManagement />} />
              <Route path="expense-approval" element={<ExpenseApproval />} />
              <Route path="budgets" element={<BudgetManagement />} />

              {/* Inventory & Stock */}
              <Route path="inventory" element={<InventoryDashboard />} />
              <Route path="inventory/items" element={<ItemMaster />} />
              <Route path="inventory/purchase-orders" element={<PurchaseOrders />} />
              <Route path="inventory/movements" element={<StockMovements />} />
              <Route path="inventory/suppliers" element={<SupplierManagement />} />
              <Route path="inventory/reports" element={<InventoryReports />} />

              {/* Asset Management */}
              <Route path="assets" element={<AssetDashboard />} />
              <Route path="assets/registry" element={<AssetRegistry />} />
              <Route path="assets/assignments" element={<AssetAssignment />} />
              <Route path="assets/maintenance" element={<AssetMaintenance />} />
              <Route path="assets/depreciation" element={<AssetDepreciation />} />
              <Route path="assets/disposal" element={<AssetDisposal />} />
              <Route path="assets/reports" element={<AssetReports />} />

              {/* HR & Staff Management */}
              <Route path="hr" element={<HRDashboard />} />
              <Route path="hr/salary" element={<SalaryManagement />} />
              <Route path="hr/attendance" element={<AttendanceSystem />} />
              <Route path="device-status" element={<DeviceStatus />} />
              <Route path="hr/attendance-deduction-settings" element={<AttendanceDeductionSettings />} />
              <Route path="hr/attendance-time-settings" element={<AttendanceTimeSettings />} />
              <Route path="hr/leave" element={<LeaveManagement />} />
              <Route path="hr/payroll" element={<PayrollSystem />} />
              <Route path="hr/reports" element={<HRReports />} />

              {/* Students + Account */}
              <Route path="register-student" element={<CreateRegisterStudent />} />
              <Route path="register-staff" element={<CreateRegisterStaff />} />
              <Route path="list-student" element={<ListStudent />} />
              <Route path="list-staff" element={<ListStaff />} />
              <Route path="list-guardian" element={<ListGuardian />} />
              <Route path="sms-counter" element={<SmsCounter />} />
              <Route path="settings" element={<SuperFinanceSettings user={user} onUserUpdate={setUser} onLogout={() => setUser(null)} />} />

              <Route path="*" element={<Navigate to="/app/super-finance/monthly-payments" replace />} />
            </Routes>
          </div>
        </Suspense>
      </div>
    </div>
  );
};

export default SuperFinanceApp;
