import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Building2, User as UserIcon, Lock } from 'lucide-react';
import styles from './GuardianLogin.module.css';
import Input from './Input/Input';
import Button from './Button/Button';
import { getBranchCode, setBranchCode } from '../utils/branchCode';
import { initGuardianPush, ensurePushPermission } from '../utils/pushNotifications';
import ThemeToggle from './ThemeToggle/ThemeToggle';
import LanguageSelector from './LanguageSelector/LanguageSelector';
import Toast from './Toast/Toast';

const GuardianLogin = () => {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState({ username: '', password: '', branchCode: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [isLoading, setIsLoading] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);
  const navigate = useNavigate();

  // On app open: check notification permission. If denied, show a guide to settings.
  React.useEffect(() => {
    (async () => {
      const res = await ensurePushPermission();
      if (res.status === 'denied') {
        setNotifDenied(true);
      }
    })();
  }, []);

  // Load saved branch code from localStorage on mount
  React.useEffect(() => {
    const savedBranchCode = getBranchCode();
    if (savedBranchCode) {
      setCredentials(prev => ({ ...prev, branchCode: savedBranchCode }));
    }
  }, []);

  // Auto-redirect if the guardian is already logged in (session persistence).
  // Prevents the app asking for login again after it's closed/reopened.
  React.useEffect(() => {
    const token = localStorage.getItem('authToken');
    let user = null;
    try { user = JSON.parse(localStorage.getItem('guardianUser') || 'null'); } catch (e) {}
    if (token && user?.username) {
      navigate(`/app/guardian/${user.username}`, { replace: true });
    }
  }, [navigate]);

  const handleInputChange = (field, value) => {
        const processedValue = field === 'branchCode' ? value.toUpperCase().trim() : value;
        setCredentials(prev => ({ ...prev, [field]: processedValue }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Mark all fields as touched
    setTouched({ username: true, password: true, branchCode: true });
    
    // Validate all fields
    const newErrors = {};
    if (!credentials.branchCode) newErrors.branchCode = 'Branch code is required';
    if (!credentials.username) newErrors.username = 'Username is required';
    if (!credentials.password) newErrors.password = 'Password is required';
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      setToastMessage('Please fill in all required fields');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post('/api/v2/branches/login', {
        ...credentials,
        branchCode: (credentials.branchCode || '').toUpperCase().trim(),
        userType: 'guardian'
      });

      const { role } = response.data.user || {};
      
      if (role === 'guardian') {
        setBranchCode(credentials.branchCode, true);
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('guardianUser', JSON.stringify(response.data.user));
        // Register this device for push notifications (safe no-op on plain web;
        // fully guarded so it can never block or crash login)
        initGuardianPush(credentials.username).catch(() => {});
        navigate(`/app/guardian/${credentials.username}`);
      } else {
        setToastMessage('Please use the Student Login page for student accounts.');
        setToastType('error');
        setShowToast(true);
      }
    } catch (err) {
      setToastMessage(err.response?.data?.error || 'Login failed. Please try again.');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.loginCard}>
          <div className={styles.cardTopBar}>
            <LanguageSelector />
            <ThemeToggle />
          </div>

          <div className={styles.logoSection}>
            <img src="/uploads/branding/icon-1785006632472.png" alt="IQRA" className={styles.logo} />
            <h1 className={styles.title}>{t('auth.guardianPortalTitle', 'IQRA Parent')}</h1>
            <p className={styles.subtitle}>{t('auth.guardianPortalSubtitle', "Stay connected with your child's school")}</p>
          </div>
          
          <form onSubmit={handleLogin} className={styles.form}>
            <Input
              label={t('auth.branchCode', 'Branch Code')}
              name="branchCode"
              value={credentials.branchCode}
              onChange={(value) => handleInputChange('branchCode', value)}
              onBlur={() => handleBlur('branchCode')}
              icon={<Building2 size={20} />}
              placeholder={t('auth.branchCodePlaceholder', 'Enter branch code')}
              error={touched.branchCode && errors.branchCode}
              disabled={isLoading}
              required
            />
            
            <Input
              label={t('auth.username', 'Username')}
              name="username"
              value={credentials.username}
              onChange={(value) => handleInputChange('username', value)}
              onBlur={() => handleBlur('username')}
              icon={<UserIcon size={20} />}
              placeholder={t('auth.usernamePlaceholder', 'Enter your username')}
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
              onChange={(value) => handleInputChange('password', value)}
              onBlur={() => handleBlur('password')}
              icon={<Lock size={20} />}
              placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
              error={touched.password && errors.password}
              disabled={isLoading}
              autoComplete="current-password"
              required
            />
            
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
            <p>
              Need help? Contact your school administrator or{' '}
              <a href="/app/student-login" className={styles.link}>try Student Login</a>
            </p>
          </div>
        </div>
      </div>

      <Toast
        isOpen={showToast}
        onClose={() => setShowToast(false)}
        message={toastMessage}
        type={toastType}
        duration={5000}
        position="top-right"
      />

      {/* Notification permission denied — guide to settings */}
      {notifDenied && (
        <div className={styles.notifOverlay}>
          <div className={styles.notifModal}>
            <div className={styles.notifIcon}>🔔</div>
            <h3 className={styles.notifTitle}>Enable Notifications</h3>
            <p className={styles.notifDesc}>
              Notifications are turned off. Turn them on so you receive updates
              about your child's marks, payments and attendance.
            </p>
            <div className={styles.notifBtns}>
              <button className={styles.notifBtnPrimary} onClick={() => setNotifDenied(false)}>
                Open Settings
              </button>
              <button className={styles.notifBtnSecondary} onClick={() => setNotifDenied(false)}>
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardianLogin;