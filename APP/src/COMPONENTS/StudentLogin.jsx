import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Building2, User as UserIcon, Lock } from 'lucide-react';
import styles from './StudentLogin.module.css';
import Input from './Input/Input';
import Button from './Button/Button';
import { getBranchCode, setBranchCode } from '../utils/branchCode';
import ThemeToggle from './ThemeToggle/ThemeToggle';
import LanguageSelector from './LanguageSelector/LanguageSelector';
import Toast from './Toast/Toast';

const StudentLogin = () => {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState({ username: '', password: '', branchCode: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Load saved branch code from localStorage on mount
  React.useEffect(() => {
    const savedBranchCode = getBranchCode();
    if (savedBranchCode) {
      setCredentials(prev => ({ ...prev, branchCode: savedBranchCode }));
    }
  }, []);

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
        userType: 'student'
      });
      
      const user = response.data.user || {};
      const role = user.role;
      
      if (role === 'student') {
        if (response.data.token) localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('studentUser', JSON.stringify(user));
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userType', 'student');
        setBranchCode(credentials.branchCode, true);
        navigate(`/app/student/${user.username || credentials.username}`);
      } else {
        setToastMessage('Please use the Guardian Login page for guardian accounts.');
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
      <div className={styles.headerControls}>
        <LanguageSelector />
        <ThemeToggle />
      </div>

      <div className={styles.content}>
        <div className={styles.loginCard}>
          <div className={styles.logoSection}>
            <img src="/skoolific-icon.png" alt="Skoolific" className={styles.logo} />
            <h1 className={styles.title}>{t('auth.studentPortalTitle', 'Student Portal')}</h1>
            <p className={styles.subtitle}>{t('auth.studentPortalSubtitle', 'Access your academic resources')}</p>
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
            <p>Need help? Contact your school administrator</p>
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

export default StudentLogin;