import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './FinanceApp.module.css';

const LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'am', label: '🇪🇹 አማርኛ' },
  { code: 'om', label: '🇪🇹 Afaan Oromoo' },
  { code: 'so', label: '🇸🇴 Soomaali' },
  { code: 'ar', label: '🇸🇦 العربية' },
];

const FinanceSidebar = ({ user, darkMode, onToggleDark, onLogout, mobileOpen, onNavClose }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const menuItems = [
    { section: t('financeApp.shell.sidebar.finance'), items: [
      { path: '/app/finance/monthly-payments', label: t('financeApp.shell.sidebar.monthlyPayments'), icon: '💳' },
      { path: '/app/finance/reports', label: t('financeApp.shell.sidebar.reports'), icon: '📈' },
    ]},
    { section: t('financeApp.shell.sidebar.students'), items: [
      { path: '/app/finance/create-register-student', label: t('financeApp.shell.sidebar.registerStudent'), icon: '➕' },
      { path: '/app/finance/list-student', label: t('financeApp.shell.sidebar.listStudents'), icon: '📋' },
    ]},
    { section: t('financeApp.shell.sidebar.account'), items: [
      { path: '/app/finance/settings', label: t('financeApp.shell.sidebar.settings'), icon: '⚙️' },
    ]},
  ];

  const handleLogout = () => {
    localStorage.removeItem('financeToken');
    localStorage.removeItem('financeUser');
    localStorage.removeItem('authToken');
    localStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('branchCode');
    localStorage.removeItem('branchCode');
    if (onNavClose) onNavClose();
    if (onLogout) onLogout();
    navigate('/app/finance/login');
  };

  return (
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarBrand}>
          <span className={styles.sidebarLogoWrap}>
            <img src="/skoolific-icon.png" alt="Skoolific" className={styles.sidebarLogo} />
          </span>
          <h2 className={styles.sidebarTitle}>{t('financeApp.shell.app.title')}</h2>
        </div>
        <div className={styles.sidebarBranch}>
          <span className={styles.sidebarBranchDot} />
          <small>{t('financeApp.shell.sidebar.branchSuffix', { branchCode: user?.branchCode, staffType: user?.staffType })}</small>
        </div>
      </div>

      <nav className={styles.sidebarNav}>
        {menuItems.map((group) => (
          <div key={group.section} className={styles.sidebarGroup}>
            <div className={styles.sidebarGroupLabel}>{group.section}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/app/finance/'}
                onClick={() => onNavClose && onNavClose()}
                className={({ isActive }) => `${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
              >
                <span className={styles.sidebarIcon}>{item.icon}</span>
                <span className={styles.sidebarItemLabel}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.languageSelector}>
        <label className={styles.languageLabel} htmlFor="financeLanguage">
          {t('financeApp.shell.sidebar.language', 'Language')}
        </label>
        <select
          id="financeLanguage"
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
        <button onClick={onToggleDark} className={styles.darkModeButton}>
          <span className={styles.sidebarBtnIcon}>{darkMode ? '☀️' : '🌙'}</span>
          <span>{darkMode ? t('financeApp.shell.sidebar.lightMode') : t('financeApp.shell.sidebar.darkMode')}</span>
        </button>
        <button onClick={handleLogout} className={styles.logoutButton}>
          <span className={styles.sidebarBtnIcon}>↪</span>
          <span>{t('financeApp.shell.sidebar.logout')}</span>
        </button>
      </div>
    </aside>
  );
};

export default FinanceSidebar;