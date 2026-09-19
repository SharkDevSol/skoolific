import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { User as UserIcon, Lock } from 'lucide-react';
import styles from './Login.module.css';
import { getPermissionPath } from '../../config/adminPermissions';
import { ValidationRules, ErrorMessages } from '../../utils/validation';
import Input from '../../COMPONENTS/Input/Input';
import Button from '../../COMPONENTS/Button/Button';
import { getBranchCode, setBranchCode } from '../../utils/branchCode';
import ThemeToggle from '../../COMPONENTS/ThemeToggle/ThemeToggle';
import LanguageSelector from '../../COMPONENTS/LanguageSelector/LanguageSelector';
import Toast from '../../COMPONENTS/Toast/Toast';

const REMEMBER_KEY = 'rememberedCredentials';

const Login = () => {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState({ username: '', password: '', branchCode: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
      return;
    }

    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCredentials(prev => ({ ...prev, ...parsed }));
        setRememberMe(true);
      } catch {}
    } else {
      // Use rememberedBranchCode for login form pre-fill (won't affect API calls)
      const savedBranchCode = localStorage.getItem('rememberedBranchCode') || getBranchCode();
      if (savedBranchCode) {
        setCredentials(prev => ({ ...prev, branchCode: savedBranchCode }));
      }
    }
  }, [navigate, location]);

  const handleInputChange = (field, value) => {
    const processedValue = field === 'branchCode' ? value.toUpperCase() : value;
    setCredentials(prev => ({ ...prev, [field]: processedValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const value = credentials[field];
    let error = '';

    if (field === 'branchCode') {
      if (!ValidationRules.required(value)) error = ErrorMessages.required;
    } else if (field === 'username') {
      if (!ValidationRules.required(value)) error = ErrorMessages.required;
      else if (!ValidationRules.minLength(3)(value)) error = ErrorMessages.minLength(3);
    } else if (field === 'password') {
      if (!ValidationRules.required(value)) error = ErrorMessages.required;
      else if (!ValidationRules.minLength(6)(value)) error = ErrorMessages.minLength(6);
    }

    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ username: true, password: true });

    const newErrors = {};
    if (!ValidationRules.required(credentials.username)) newErrors.username = ErrorMessages.required;
    else if (!ValidationRules.minLength(3)(credentials.username)) newErrors.username = ErrorMessages.minLength(3);
    if (!ValidationRules.required(credentials.password)) newErrors.password = ErrorMessages.required;
    else if (!ValidationRules.minLength(6)(credentials.password)) newErrors.password = ErrorMessages.minLength(6);

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      showToast(t('auth.fixErrors', 'Please fix the errors before submitting'));
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post('/api/v2/branches/login', {
        ...credentials,
        branchCode: credentials.branchCode.toUpperCase() || 'BILAL',
        userType: 'admin'
      });

      if (response.data.message === 'Login successful' || response.data.success) {
        const { user, token } = response.data;

        if (token) localStorage.setItem('authToken', token);
        localStorage.setItem('adminUser', JSON.stringify(user));
        localStorage.setItem('userType', user.userType || 'admin');
        localStorage.setItem('isLoggedIn', 'true');
        setBranchCode(credentials.branchCode, true);

        if (user.permissions) {
          localStorage.setItem('userPermissions', JSON.stringify(user.permissions));
        } else {
          localStorage.removeItem('userPermissions');
        }

        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({
            username: credentials.username,
            branchCode: credentials.branchCode
          }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }

        let redirectPath = '/';
        if (user.userType === 'sub-account' && user.permissions?.length > 0) {
          const firstPermittedPath = getPermissionPath(user.permissions[0]);
          if (firstPermittedPath) redirectPath = firstPermittedPath;
        } else if (user.userType === 'admin') {
          redirectPath = location.state?.from?.pathname || '/';
        }

        navigate(redirectPath, { replace: true });
      }
    } catch (error) {
      showToast(error.response?.data?.error || t('auth.loginFailed', 'Login failed. Please check your credentials.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerControls}>
        <LanguageSelector />
        <ThemeToggle />
      </div>

      <div className={styles.content}>
        <div className={styles.loginCard}>
          <div className={styles.logoSection}>
            <img src="/skoolific-icon.png" alt="Skoolific" className={styles.logo} />
            <h1 className={styles.title}>{t('auth.adminPortalTitle', 'School Management System')}</h1>
            <p className={styles.subtitle}>{t('auth.adminPortalSubtitle', 'Admin Login')}</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Single-school template: no branch code — the school domain IS
                the branch. Backend default-routes to this school's DB. */}

            <Input
              label={t('auth.username', 'Username')}
              name="username"
              value={credentials.username}
              onChange={(v) => handleInputChange('username', v)}
              onBlur={() => handleBlur('username')}
              icon={<UserIcon size={20} />}
              placeholder={t('auth.adminUsernamePlaceholder', 'Enter admin username')}
              error={touched.username && errors.username}
              disabled={isLoading}
              autoComplete="username"
              required
            />

            <Input
              label={t('auth.password', 'Password')}
              type="password"
              name="password"
              value={credentials.password}
              onChange={(v) => handleInputChange('password', v)}
              onBlur={() => handleBlur('password')}
              icon={<Lock size={20} />}
              placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
              error={touched.password && errors.password}
              disabled={isLoading}
              autoComplete="current-password"
              required
            />

            <div className={styles.options}>
              <label className={styles.rememberMe}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>{t('auth.rememberMe', 'Remember me')}</span>
              </label>
              <a href="#" className={styles.forgotPassword}>{t('auth.forgotPassword', 'Forgot password?')}</a>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              className={styles.loginButton}
            >
              {t('auth.signIn', 'Sign In')}
            </Button>
          </form>

          <div className={styles.footer}>
            <p>© 2025 Skoolific. {t('common.allRightsReserved', 'All rights reserved.')}</p>
          </div>
        </div>
      </div>

      <Toast
        isOpen={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
        message={toast.message}
        type={toast.type}
        duration={5000}
        position="top-right"
      />
    </div>
  );
};

export default Login;
