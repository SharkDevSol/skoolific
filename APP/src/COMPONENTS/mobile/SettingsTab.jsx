import React, { useEffect, useState } from 'react';
import { FiGlobe, FiMoon, FiSun, FiCheck, FiDownload, FiSmartphone, FiKey, FiUser, FiLogOut } from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import api from '../../utils/api';
import styles from './SettingsTab.module.css';

// Available languages
const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'am', name: 'አማርኛ', flag: '🇪🇹' },
  { code: 'om', name: 'Oromoo', flag: '🇪🇹' },
  { code: 'so', name: 'Soomaali', flag: '🇸🇴' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' }
];

// Helper: Get user-specific localStorage key
export const getUserSettingsKey = (userId, userType) => {
  return `userSettings_${userType}_${userId || 'anonymous'}`;
};

// Helper: Save user settings to localStorage
export const saveUserSettings = (userId, userType, settings) => {
  try {
    const key = getUserSettingsKey(userId, userType);
    localStorage.setItem(key, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving user settings:', error);
  }
};

// Helper: Load user settings from localStorage
export const loadUserSettings = (userId, userType) => {
  try {
    const key = getUserSettingsKey(userId, userType);
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
  return null;
};

const SettingsTab = ({ userId, userType, appType, appName, onLogout }) => {
  const { language, updateLanguage, theme, updateTheme, t } = useApp();
  const [currentLanguage, setCurrentLanguage] = useState(language || 'en');
  const [isDarkMode, setIsDarkMode] = useState(theme?.mode === 'dark');
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt(appType);
  const [installing, setInstalling] = useState(false);

  // Account (change username / password)
  const [showAccount, setShowAccount] = useState(false);
  const [accLoading, setAccLoading] = useState(false);
  const [accMsg, setAccMsg] = useState('');
  const [accError, setAccError] = useState('');
  const [usernameForm, setUsernameForm] = useState({ currentUsername: '', newUsername: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  // Debug logging
  useEffect(() => {
    console.log('SettingsTab - Install Status:', {
      appType,
      appName,
      isInstallable,
      isInstalled,
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      protocol: window.location.protocol,
      hasServiceWorker: 'serviceWorker' in navigator
    });

    // Check if beforeinstallprompt was already fired
    if (window.deferredPrompt) {
      console.log('Found deferred prompt in window');
    }
  }, [appType, appName, isInstallable, isInstalled]);

  // Load saved settings on mount
  useEffect(() => {
    const savedSettings = loadUserSettings(userId, userType);
    if (savedSettings) {
      if (savedSettings.language) {
        setCurrentLanguage(savedSettings.language);
        updateLanguage(savedSettings.language);
      }
      if (savedSettings.darkMode !== undefined) {
        setIsDarkMode(savedSettings.darkMode);
        updateTheme({ ...theme, mode: savedSettings.darkMode ? 'dark' : 'light' });
      }
    }
  }, [userId, userType]);

  // Sync with context changes
  useEffect(() => {
    setCurrentLanguage(language || 'en');
    setIsDarkMode(theme?.mode === 'dark');
  }, [language, theme]);

  // Handle language change
  const handleLanguageChange = (langCode) => {
    setCurrentLanguage(langCode);
    updateLanguage(langCode);
    
    // Save to localStorage
    const currentSettings = loadUserSettings(userId, userType) || {};
    saveUserSettings(userId, userType, {
      ...currentSettings,
      language: langCode
    });
  };

  // Handle dark mode toggle
  const handleDarkModeToggle = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    updateTheme({ ...theme, mode: newDarkMode ? 'dark' : 'light' });
    
    // Save to localStorage
    const currentSettings = loadUserSettings(userId, userType) || {};
    saveUserSettings(userId, userType, {
      ...currentSettings,
      darkMode: newDarkMode
    });
  };

  // Handle app installation
  const handleInstallApp = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } catch (error) {
      console.error('Installation error:', error);
    } finally {
      setInstalling(false);
    }
  };

  // Change username
  const handleChangeUsername = async (e) => {
    e.preventDefault();
    setAccMsg(''); setAccError('');
    setAccLoading(true);
    try {
      const res = await api.post('/user-profile/guardian/change-username', {
        currentUsername: usernameForm.currentUsername,
        newUsername: usernameForm.newUsername,
        password: usernameForm.password
      });
      setAccMsg(res.data.message || 'Username changed successfully');
      setUsernameForm({ currentUsername: '', newUsername: '', password: '' });
    } catch (err) {
      setAccError(err.response?.data?.error || 'Failed to change username');
    } finally {
      setAccLoading(false);
    }
  };

  // Change password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setAccMsg(''); setAccError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setAccError('Passwords do not match');
      return;
    }
    setAccLoading(true);
    try {
      const res = await api.post('/user-profile/guardian/change-password', {
        username: userId,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setAccMsg(res.data.message || 'Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setAccError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setAccLoading(false);
    }
  };

  // Get app icon based on type
  const getAppIcon = () => {
    const icons = {
      student: '🎓',
      staff: '👨‍🏫',
      guardian: '👨‍👩‍👧'
    };
    return icons[appType] || '📱';
  };

  // Get app color based on type
  const getAppColor = () => {
    const colors = {
      student: '#3B82F6',
      staff: '#10B981',
      guardian: '#8B5CF6'
    };
    return colors[appType] || '#667eea';
  };

  return (
    <div className={styles.settingsContainer}>
      <h2 className={styles.tabTitle}>{t('settings') || 'Settings'}</h2>

      {/* Language Section */}
      <div className={styles.settingsSection}>
        <div className={styles.sectionHeader}>
          <FiGlobe className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>{t('language') || 'Language'}</span>
        </div>
        <div className={styles.languageGrid}>
          {languages.map((lang) => (
            <button
              key={lang.code}
              className={`${styles.languageBtn} ${currentLanguage === lang.code ? styles.languageActive : ''}`}
              onClick={() => handleLanguageChange(lang.code)}
            >
              <span className={styles.languageFlag}>{lang.flag}</span>
              <span className={styles.languageName}>{lang.name}</span>
              {currentLanguage === lang.code && (
                <FiCheck className={styles.checkIcon} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Dark Mode Section */}
      <div className={styles.settingsSection}>
        <div className={styles.sectionHeader}>
          {isDarkMode ? <FiMoon className={styles.sectionIcon} /> : <FiSun className={styles.sectionIcon} />}
          <span className={styles.sectionTitle}>{t('darkMode') || 'Dark Mode'}</span>
        </div>
        <div className={styles.toggleContainer}>
          <span className={styles.toggleLabel}>
            {isDarkMode ? (t('darkModeOn') || 'Dark mode is on') : (t('darkModeOff') || 'Dark mode is off')}
          </span>
          <button
            className={`${styles.toggleSwitch} ${isDarkMode ? styles.toggleActive : ''}`}
            onClick={handleDarkModeToggle}
            aria-label="Toggle dark mode"
          >
            <span className={styles.toggleKnob}>
              {isDarkMode ? <FiMoon size={14} /> : <FiSun size={14} />}
            </span>
          </button>
        </div>
      </div>

      {/* Account (change username / password) */}
      <div className={styles.settingsSection}>
        <div className={styles.sectionHeader} onClick={() => setShowAccount(v => !v)} style={{ cursor: 'pointer' }}>
          <FiKey className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>Account</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8em', opacity: 0.6 }}>{showAccount ? '▾' : '▸'}</span>
        </div>

        {showAccount && (
          <div className={styles.accountForms}>
            {accMsg && <div className={styles.accSuccess}>{accMsg}</div>}
            {accError && <div className={styles.accErrorText}>{accError}</div>}

            {/* Username */}
            <form onSubmit={handleChangeUsername} className={styles.accForm}>
              <p className={styles.accFormTitle}><FiUser size={13} /> Change Username</p>
              <input className={styles.accInput} type="text" placeholder="Current username" value={usernameForm.currentUsername} onChange={(e) => setUsernameForm({ ...usernameForm, currentUsername: e.target.value })} required />
              <input className={styles.accInput} type="text" placeholder="New username" value={usernameForm.newUsername} onChange={(e) => setUsernameForm({ ...usernameForm, newUsername: e.target.value })} required />
              <input className={styles.accInput} type="password" placeholder="Password to confirm" value={usernameForm.password} onChange={(e) => setUsernameForm({ ...usernameForm, password: e.target.value })} required />
              <button className={styles.accBtn} type="submit" disabled={accLoading}>Update Username</button>
            </form>

            {/* Password */}
            <form onSubmit={handleChangePassword} className={styles.accForm}>
              <p className={styles.accFormTitle}>🔒 Change Password</p>
              <input className={styles.accInput} type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required />
              <input className={styles.accInput} type="password" placeholder="New password (min 8 chars)" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required />
              <input className={styles.accInput} type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required />
              <button className={styles.accBtn} type="submit" disabled={accLoading}>Update Password</button>
            </form>
          </div>
        )}
      </div>

      {/* Install App Section */}
      <div className={styles.settingsSection}>
        <div className={styles.sectionHeader}>
          <FiSmartphone className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>Install App</span>
        </div>
        <div className={styles.installContainer}>
          {isInstalled ? (
            <div className={styles.installedBadge}>
              <FiCheck className={styles.installedIcon} />
              <div>
                <p className={styles.installedTitle}>App Installed</p>
                <p className={styles.installedDesc}>
                  You can access this app from your home screen
                </p>
              </div>
            </div>
          ) : isInstallable ? (
            <button
              className={styles.installButton}
              onClick={handleInstallApp}
              disabled={installing}
              style={{ background: `linear-gradient(135deg, ${getAppColor()} 0%, ${getAppColor()}dd 100%)` }}
            >
              <span className={styles.installIcon}>{getAppIcon()}</span>
              <div className={styles.installContent}>
                <span className={styles.installTitle}>
                  {installing ? 'Installing...' : 'Install App'}
                </span>
                <span className={styles.installDesc}>
                  {appName || 'School App'} - Quick access & offline support
                </span>
              </div>
              <FiDownload className={styles.installArrow} />
            </button>
          ) : (
            <div className={styles.installInfo}>
              <FiSmartphone className={styles.infoIcon} />
              <div>
                <p className={styles.infoTitle}>Install Not Available</p>
                <p className={styles.infoDesc}>
                  To install this app, please use Chrome or Edge browser. Make sure you're accessing the app via HTTPS or localhost.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className={styles.infoSection}>
        <p className={styles.infoText}>
          {t('settingsInfo') || 'Your preferences are saved automatically and will be remembered next time you log in.'}
        </p>
      </div>

      {/* Logout */}
      {onLogout && (
        <div className={styles.settingsSection}>
          <button className={styles.logoutButton} onClick={onLogout}>
            <FiLogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
