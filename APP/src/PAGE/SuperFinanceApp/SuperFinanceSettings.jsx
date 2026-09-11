import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api';
import styles from './SuperFinanceApp.module.css';

const SuperFinanceSettings = ({ user, onUserUpdate, onLogout }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [usernamePw, setUsernamePw] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [usernameMsg, setUsernameMsg] = useState(null);
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const forceLogoutAfterChange = () => {
    setLoggingOut(true);
    setTimeout(() => {
      localStorage.removeItem('superFinanceToken');
      localStorage.removeItem('superFinanceUser');
      localStorage.removeItem('authToken');
      localStorage.removeItem('isLoggedIn');
      sessionStorage.removeItem('branchCode');
      localStorage.removeItem('branchCode');
      if (onLogout) onLogout();
      window.location.href = '/app/super-finance/login';
    }, 1500);
  };

  const handleChangeUsername = async (e) => {
    e.preventDefault();
    setUsernameMsg(null);
    if (!username || !usernamePw) {
      setUsernameMsg({ type: 'error', text: t('financeApp.shell.settings.fillAllFields') });
      return;
    }
    setSavingUsername(true);
    try {
      const response = await api.post('/super-finance/change-username', {
        currentUsername: user?.username,
        newUsername: username,
        password: usernamePw
      });
      if (response.data.success) {
        setUsernameMsg({ type: 'success', text: t('financeApp.shell.settings.usernameChanged', { newUsername: response.data.newUsername }) });
        setUsername('');
        setUsernamePw('');
        if (onUserUpdate) onUserUpdate({ ...user, username: response.data.newUsername });
        forceLogoutAfterChange();
      } else {
        setUsernameMsg({ type: 'error', text: response.data.error || t('financeApp.shell.settings.failedUsername') });
      }
    } catch (err) {
      setUsernameMsg({ type: 'error', text: err.response?.data?.error || t('financeApp.shell.settings.failedUsername') });
    } finally {
      setSavingUsername(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: t('financeApp.shell.settings.fillAllFields') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: t('financeApp.shell.settings.passwordsMismatch') });
      return;
    }
    setSavingPassword(true);
    try {
      const response = await api.post('/super-finance/change-password', {
        username: user?.username,
        currentPassword,
        newPassword
      });
      if (response.data.success) {
        if (response.data.warnings && response.data.warnings.length > 0) {
          setPasswordMsg({ type: 'warning', text: t('financeApp.shell.settings.passwordWeak') });
        } else {
          setPasswordMsg({ type: 'success', text: t('financeApp.shell.settings.passwordChanged') });
        }
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        forceLogoutAfterChange();
      } else {
        setPasswordMsg({ type: 'error', text: response.data.error || t('financeApp.shell.settings.failedPassword') });
      }
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err.response?.data?.error || t('financeApp.shell.settings.failedPassword') });
    } finally {
      setSavingPassword(false);
    }
  };

  const renderMsg = (msg) => {
    if (!msg) return null;
    const cls = msg.type === 'success' ? styles.settingsSuccess : msg.type === 'warning' ? styles.settingsWarning : styles.settingsError;
    return (
      <div className={cls}>
        {msg.text}
      </div>
    );
  };

  return (
    <div className={styles.settingsContainer}>
      <h2 className={styles.settingsTitle}>{t('financeApp.shell.settings.title')}</h2>
      <p className={styles.settingsSubtitle}>
        {t('financeApp.shell.settings.loggedInAs', { username: user?.username, branchCode: t('superFinance.allBranches', 'All Branches') })}
        {' — '}
        {t('financeApp.shell.settings.appliesTo')}
      </p>

      <div className={styles.settingsGrid}>
        <div className={styles.settingsCard}>
          <h3>{t('financeApp.shell.settings.changeUsername')}</h3>
          <form onSubmit={handleChangeUsername}>
            <div className={styles.formGroup}>
              <label>{t('financeApp.shell.settings.currentUsername')}</label>
              <input type="text" value={user?.username || ''} disabled />
            </div>
            <div className={styles.formGroup}>
              <label>{t('financeApp.shell.settings.newUsername')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('financeApp.shell.settings.newUsernamePlaceholder')}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('financeApp.shell.settings.currentPassword')}</label>
              <input
                type="password"
                value={usernamePw}
                onChange={(e) => setUsernamePw(e.target.value)}
                placeholder={t('financeApp.shell.settings.currentPasswordPlaceholder')}
                required
              />
            </div>
            {renderMsg(usernameMsg)}
            {loggingOut && <div className={styles.settingsInfo}>{t('financeApp.shell.settings.loggingOut')}</div>}
            <button type="submit" className={styles.settingsButton} disabled={savingUsername || loggingOut}>
              {savingUsername ? t('financeApp.shell.settings.saving') : t('financeApp.shell.settings.updateUsername')}
            </button>
          </form>
        </div>

        <div className={styles.settingsCard}>
          <h3>{t('financeApp.shell.settings.changePassword')}</h3>
          <form onSubmit={handleChangePassword}>
            <div className={styles.formGroup}>
              <label>{t('financeApp.shell.settings.currentPassword')}</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('financeApp.shell.settings.currentPasswordPlaceholder')}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('financeApp.shell.settings.newPassword')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('financeApp.shell.settings.newPasswordPlaceholder')}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('financeApp.shell.settings.confirmNewPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('financeApp.shell.settings.confirmNewPasswordPlaceholder')}
                required
              />
            </div>
            {renderMsg(passwordMsg)}
            {loggingOut && <div className={styles.settingsInfo}>{t('financeApp.shell.settings.loggingOut')}</div>}
            <button type="submit" className={styles.settingsButton} disabled={savingPassword || loggingOut}>
              {savingPassword ? t('financeApp.shell.settings.saving') : t('financeApp.shell.settings.updatePassword')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SuperFinanceSettings;
