import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { User as UserIcon, Lock } from 'lucide-react';
import styles from './StaffLogin.module.css';
import Input from './Input/Input';
import Button from './Button/Button';
import { getBranchCode, setBranchCode } from '../utils/branchCode';
import ThemeToggle from './ThemeToggle/ThemeToggle';
import LanguageSelector from './LanguageSelector/LanguageSelector';
import Toast from './Toast/Toast';

const StaffLogin = () => {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState({ username: '', password: '', branchCode: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  // Load saved branch code from localStorage on mount
  useEffect(() => {
    const savedBranchCode = getBranchCode();
    if (savedBranchCode) {
      setCredentials(prev => ({ ...prev, branchCode: savedBranchCode }));
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (lockoutSeconds > 0) {
      timerRef.current = setInterval(() => {
        setLockoutSeconds(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setToastMessage('');
            setShowToast(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [lockoutSeconds]);

  const handleInputChange = (field, value) => {
        setCredentials(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    
    // Mark all fields as touched
    setTouched({ username: true, password: true, branchCode: true });
    
    // Validate all fields
    const newErrors = {};
    if (!credentials.username) newErrors.username = t('auth.username', 'Username') + ' ' + t('common.required', 'Required').toLowerCase();
    if (!credentials.password) newErrors.password = t('auth.password', 'Password') + ' ' + t('common.required', 'Required').toLowerCase();
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      setToastMessage(t('auth.fillRequired', 'Please fill in all required fields'));
      setToastType('error');
      setShowToast(true);
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await axios.post('/api/v2/branches/login', {
        ...credentials,
        branchCode: credentials.branchCode?.toUpperCase() || 'BILAL',
        userType: 'staff'
      });
      
      if (response.data.message === 'Login successful') {
        if (response.data.token) localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('staffUser', JSON.stringify(response.data.user));
        localStorage.setItem('staffProfile', JSON.stringify(response.data.profile));
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userType', 'staff');
        setBranchCode(credentials.branchCode, true);
        navigate('/app/staff');
      }
    } catch (error) {
      if (error.response?.status === 429) {
        const seconds = error.response?.data?.retryAfter || 60;
        setLockoutSeconds(seconds);
        setToastMessage(t('auth.tooManyAttemptsWait', 'Too many attempts. Please wait {{seconds}} seconds.', { seconds }));
        setToastType('error');
        setShowToast(true);
      } else {
        setToastMessage(error.response?.data?.error || t('auth.loginFailed', 'Login failed. Please check your credentials.'));
        setToastType('error');
        setShowToast(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isLocked = lockoutSeconds > 0;

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
            <h1 className={styles.title}>{t('auth.staffPortalTitle', 'Staff Portal')}</h1>
            <p className={styles.subtitle}>{t('auth.staffPortalSubtitle', 'Access your staff profile and resources')}</p>
          </div>
          
          {isLocked && (
            <div className={styles.lockoutBanner}>
              <p>{t('auth.tooManyAttempts', 'Too many login attempts')}</p>
              <div className={styles.lockoutTimer}>{lockoutSeconds}s</div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Single-school template: no branch code field */}
            <Input
              label={t('auth.username', 'Username')}
              name="username"
              value={credentials.username}
              onChange={(value) => handleInputChange('username', value)}
              onBlur={() => handleBlur('username')}
              icon={<UserIcon size={20} />}
              placeholder={t('auth.usernamePlaceholder', 'Enter your username')}
              error={touched.username && errors.username}
              disabled={isLoading || isLocked}
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
              disabled={isLoading || isLocked}
              autoComplete="current-password"
              required
            />
            
            <Button 
              type="submit" 
              variant="primary"
              size="lg"
              loading={isLoading}
              disabled={isLocked}
              className={styles.loginButton}
            >
              {isLocked ? t('auth.signInWait', 'Wait {{seconds}}s', { seconds: lockoutSeconds }) : t('auth.signIn', 'Sign In')}
            </Button>
          </form>
          
          <div className={styles.footer}>
            <p>{t('auth.needHelp', 'Need help? Contact your administrator')}</p>
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
    </div>
  );
};

export default StaffLogin;

