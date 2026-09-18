import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import styles from './SuperFinanceApp.module.css';

const SuperFinanceLogin = ({ onLogin }) => {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const baseURL = import.meta.env.VITE_API_URL || '';
      const response = await axios.post(`${baseURL}/api/super-finance/login`, {
        username,
        password
      });

      if (response.data.success) {
        const { user, token } = response.data;
        localStorage.setItem('superFinanceToken', token);
        localStorage.setItem('superFinanceUser', JSON.stringify(user));
        // Set auth for underlying components that use the api.js interceptor
        localStorage.setItem('authToken', token);
        localStorage.setItem('isLoggedIn', 'true');
        // Default branch = first allowed branch
        const firstBranch = (user.branches?.[0]?.branchCode) || (user.allowedBranches?.[0] || 'BRANCH1');
        sessionStorage.setItem('branchCode', firstBranch);
        if (onLogin) onLogin(user);
        navigate('/app/super-finance/');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || t('financeApp.shell.login.loginFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer} dir={i18n.dir(i18n.language)}>
      <div className={styles.loginCard}>
        <div className={styles.loginHeader}>
          <img src="/skoolific-icon.png" alt="Logo" className={styles.loginLogo} />
          <h1>{t('superFinance.title', 'Super Finance App')}</h1>
          <p>{t('superFinance.subtitle', 'Sign in with your super finance account')}</p>
          <div className={styles.loginBadge}>♛ Executive Access</div>
        </div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.formGroup}>
            <label>{t('financeApp.shell.login.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('financeApp.shell.login.usernamePlaceholder')}
              required
              autoFocus
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('financeApp.shell.login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('financeApp.shell.login.passwordPlaceholder')}
              required
            />
          </div>
          {error && <div className={styles.errorMessage}>{error}</div>}
          <button type="submit" className={styles.loginButton} disabled={loading}>
            {loading ? t('financeApp.shell.login.signingIn') : t('financeApp.shell.login.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SuperFinanceLogin;
