import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';
import api from '../../utils/api';
import styles from './Setting.module.css';
import yearRolloverStyles from './YearRollover.module.css';
import { useApp } from '../../context/AppContext';
import { FiUser, FiLock, FiGlobe, FiSun, FiImage, FiSave, FiCheck, FiX, FiCamera, FiUpload, FiHome, FiSmartphone, FiDownload, FiShare2, FiCopy, FiUsers, FiShield } from 'react-icons/fi';
import LanguageSelector from '../../COMPONENTS/LanguageSelector';
import FileUpload from '../../COMPONENTS/FileUpload';
import Input from '../../COMPONENTS/Input/Input';
import Button from '../../COMPONENTS/Button/Button';
import PermissionSelector from '../../COMPONENTS/PermissionSelector';

const AdminSubAccountsPanel = lazy(() => import('../AdminSubAccounts/AdminSubAccounts'));

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

const Setting = () => {
  const { theme, updateTheme, language, updateLanguage, profile, updateProfile, websiteName, updateWebsiteName, t: appT } = useApp();
  const { t } = useTranslation();
  
  const fileInputRef = useRef(null);
  const iconInputRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('schoolInfo');
  const [defaultPermissions, setDefaultPermissions] = useState([]);
  
  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState('');
  
  // Local profile state for form
  const [localProfile, setLocalProfile] = useState({
    name: profile.name,
    email: profile.email,
    profileImage: profile.profileImage
  });
  
  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [usernameData, setUsernameData] = useState({
    newUsername: JSON.parse(localStorage.getItem('adminUser') || '{}').username || ''
  });
  
  // Local theme state
  const [localTheme, setLocalTheme] = useState(theme);
  
  // Web icon state - loaded from database
  const [webIcon, setWebIcon] = useState(null);
  const [webIconUrl, setWebIconUrl] = useState(null);
  
  // Website name state - loaded from database
  const [localWebsiteName, setLocalWebsiteName] = useState(websiteName);
  
  // School info state
  const [schoolInfo, setSchoolInfo] = useState({
    address: '',
    phone: '',
    email: '',
    academicYear: ''
  });
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState(null);
  const logoInputRef = useRef(null);
  
  // Messages
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  
  // Year Rollover state
  const [yearRolloverStatus, setYearRolloverStatus] = useState(null);
  const [archives, setArchives] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [showRolloverConfirm, setShowRolloverConfirm] = useState(false);
  const [rolloverLoading, setRolloverLoading] = useState(false);
  
  // Load branding settings from database on mount
  useEffect(() => {
    loadBrandingSettings();
  }, []);
  
  // Capture PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('PWA install prompt captured');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);
  
  // PWA Install handlers
  const handleInstallApp = async (appType) => {
    if (!deferredPrompt) {
      // Check if we're on desktop
      const isDesktop = window.innerWidth > 768;
      
      if (isDesktop) {
        setInstallMessage('Look for the install icon (⊕) in your browser address bar, or use Chrome menu → Install Skoolific');
      } else {
        setInstallMessage('Please open this page in Chrome or Safari to install the app');
      }
      
      setTimeout(() => setInstallMessage(''), 8000);
      return;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setInstallMessage(`${appType} app installed successfully!`);
      } else {
        setInstallMessage('Installation cancelled');
      }
      
      setDeferredPrompt(null);
      setTimeout(() => setInstallMessage(''), 5000);
    } catch (error) {
      console.error('Install error:', error);
      setInstallMessage('Installation failed. Please try again.');
      setTimeout(() => setInstallMessage(''), 5000);
    }
  };

  const copyInstallLink = (appType, url) => {
    navigator.clipboard.writeText(url);
    setInstallMessage(`${appType} link copied! Share it on Telegram.`);
    setTimeout(() => setInstallMessage(''), 3000);
  };

  const shareOnTelegram = (appType, url) => {
    const message = `Install Skoolific ${appType} App: ${url}`;
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Install Skoolific ${appType} App`)}`;
    window.open(telegramUrl, '_blank');
  };
  
  // Helper function to update favicon and manifest
  const updateFaviconAndManifest = (iconUrl) => {
    // Update standard favicon
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = iconUrl;
    document.getElementsByTagName('head')[0].appendChild(link);
    
    // Update apple touch icon
    let appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.getElementsByTagName('head')[0].appendChild(appleLink);
    }
    appleLink.href = iconUrl;
    
    // Update manifest
    updateManifestIcons(iconUrl);
  };
  
  const loadBrandingSettings = async () => {
    try {
      const response = await api.get('/admin/branding');
      const data = response.data;
      
      setLocalWebsiteName(data.website_name || 'School Management System');
      updateWebsiteName(data.website_name || 'School Management System');
      
      // Set favicon - use custom icon if uploaded, otherwise use default skoolific-icon.png
      const faviconUrl = data.website_icon 
        ? `${import.meta.env.VITE_API_URL.replace('/api', '')}/uploads/branding/${data.website_icon}`
        : '/skoolific-icon.png';
      
      if (data.website_icon) {
        setWebIcon(data.website_icon);
      }
      setWebIconUrl(faviconUrl);
      
      // Update favicon and manifest in browser
      updateFaviconAndManifest(faviconUrl);
      
      // Load school info
      setSchoolInfo({
        address: data.school_address || '',
        phone: data.school_phone || '',
        email: data.school_email || '',
        academicYear: data.academic_year || ''
      });
      
      if (data.school_logo) {
        const logoUrl = `${import.meta.env.VITE_API_URL.replace('/api', '')}/uploads/branding/${data.school_logo}`;
        setSchoolLogo(data.school_logo);
        setSchoolLogoUrl(logoUrl);
      }
      
      // Update theme from database
      if (data.primary_color || data.secondary_color) {
        const newTheme = {
          ...theme,
          primaryColor: data.primary_color || theme.primaryColor,
          secondaryColor: data.secondary_color || theme.secondaryColor,
          mode: data.theme_mode || theme.mode
        };
        setLocalTheme(newTheme);
        updateTheme(newTheme);
      }
    } catch (error) {
      console.error('Failed to load branding settings:', error);
      // On error, set default Skoolific favicon
      updateFaviconAndManifest('/skoolific-icon.png');
    }
  };

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'om', name: 'Afaan Oromoo', flag: '🇪🇹' },
    { code: 'am', name: 'አማርኛ (Amharic)', flag: '🇪🇹' },
    { code: 'so', name: 'Soomaali', flag: '🇸🇴' },
    { code: 'ar', name: 'العربية (Arabic)', flag: '🇸🇦' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' }
  ];

  const colorPresets = [
    { name: 'Purple', primary: '#667eea', secondary: '#764ba2' },
    { name: 'Blue', primary: '#2196F3', secondary: '#1976D2' },
    { name: 'Green', primary: '#4CAF50', secondary: '#388E3C' },
    { name: 'Orange', primary: '#FF9800', secondary: '#F57C00' },
    { name: 'Red', primary: '#f44336', secondary: '#d32f2f' },
    { name: 'Teal', primary: '#009688', secondary: '#00796B' },
    { name: 'Pink', primary: '#E91E63', secondary: '#C2185B' },
    { name: 'Indigo', primary: '#3F51B5', secondary: '#303F9F' }
  ];

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // Profile handlers
  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setLocalProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalProfile(prev => ({ ...prev, profileImage: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      updateProfile(localProfile);
      showMessage('success', t('success') + '! Profile updated.');
    } catch (error) {
      showMessage('error', t('error') + ': Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  // Password handlers
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleUsernameChange = (e) => {
    setUsernameData({ newUsername: e.target.value });
  };

  const changeUsername = async () => {
    if (!usernameData.newUsername || usernameData.newUsername.length < 3) {
      showMessage('error', 'Username must be at least 3 characters');
      return;
    }
    setLoading(true);
    try {
      const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
      await api.post('/admin/change-username', {
        currentUsername: adminUser.username,
        newUsername: usernameData.newUsername
      });
      adminUser.username = usernameData.newUsername;
      localStorage.setItem('adminUser', JSON.stringify(adminUser));
      showMessage('success', 'Username changed successfully!');
    } catch (error) {
      showMessage('error', error.response?.data?.error || 'Failed to change username');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
      await api.post('/admin/change-password', {
        username: adminUser.username,
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      showMessage('success', t('success') + '! Password changed.');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      showMessage('error', error.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  // Theme handlers
  const handleColorPreset = (preset) => {
    const newTheme = { ...localTheme, primaryColor: preset.primary, secondaryColor: preset.secondary };
    setLocalTheme(newTheme);
    updateTheme(newTheme);
  };

  const handleCustomColor = (e, colorType) => {
    const newTheme = { ...localTheme, [colorType]: e.target.value };
    setLocalTheme(newTheme);
    updateTheme(newTheme);
  };

  const toggleDarkMode = () => {
    const newTheme = { ...localTheme, mode: localTheme.mode === 'light' ? 'dark' : 'light' };
    setLocalTheme(newTheme);
    updateTheme(newTheme);
  };

  const saveTheme = async () => {
    setLoading(true);
    try {
      updateTheme(localTheme);
      await saveThemeToDatabase();
      showMessage('success', t('success') + '! Theme saved to database.');
    } catch (error) {
      showMessage('error', 'Failed to save theme');
    } finally {
      setLoading(false);
    }
  };

  // Language handler
  const handleLanguageChange = (langCode) => {
    updateLanguage(langCode);
    i18n.changeLanguage(langCode);
    showMessage('success', `Language changed to ${languages.find(l => l.code === langCode)?.name}`);
  };

  // Website name handler
  const handleWebsiteNameChange = (e) => {
    setLocalWebsiteName(e.target.value);
  };

  const saveWebsiteName = async () => {
    setLoading(true);
    try {
      await api.put('/admin/branding', {
        website_name: localWebsiteName
      });
      
      // Update context and document title
      updateWebsiteName(localWebsiteName);
      document.title = localWebsiteName;
      showMessage('success', 'Website name saved to database!');
    } catch (error) {
      console.error('Failed to save website name:', error);
      showMessage('error', 'Failed to save website name');
    } finally {
      setLoading(false);
    }
  };

  // School info handlers
  const handleSchoolInfoChange = (e) => {
    const { name, value } = e.target;
    setSchoolInfo(prev => ({ ...prev, [name]: value }));
  };

  const saveSchoolInfo = async () => {
    setLoading(true);
    try {
      await api.put('/admin/branding', {
        school_address: schoolInfo.address,
        school_phone: schoolInfo.phone,
        school_email: schoolInfo.email
      });
      showMessage('success', 'School information saved successfully!');
    } catch (error) {
      console.error('Failed to save school info:', error);
      showMessage('error', 'Failed to save school information');
    } finally {
      setLoading(false);
    }
  };

  // School logo handler
  const handleSchoolLogoChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append('logo', file);
        
        const response = await api.post('/admin/branding/logo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        const logoUrl = `${API_BASE_URL}${response.data.logoUrl}`;
        setSchoolLogo(response.data.logo);
        setSchoolLogoUrl(logoUrl);
        
        showMessage('success', 'School logo saved successfully!');
      } catch (error) {
        console.error('Failed to upload logo:', error);
        showMessage('error', 'Failed to upload logo');
      } finally {
        setLoading(false);
      }
    }
  };

  // Web icon handler - uploads to server and saves to database
  const handleWebIconChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append('icon', file);
        
        const response = await api.post('/admin/branding/icon', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        const iconUrl = `${API_BASE_URL}${response.data.iconUrl}`;
        setWebIcon(response.data.icon);
        setWebIconUrl(iconUrl);
        
        // Update favicon
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = iconUrl;
        document.getElementsByTagName('head')[0].appendChild(link);
        
        // Update apple touch icon
        let appleLink = document.querySelector("link[rel='apple-touch-icon']");
        if (!appleLink) {
          appleLink = document.createElement('link');
          appleLink.rel = 'apple-touch-icon';
          document.getElementsByTagName('head')[0].appendChild(appleLink);
        }
        appleLink.href = iconUrl;
        
        // Update manifest icons
        updateManifestIcons(iconUrl);
        
        showMessage('success', 'Web icon saved to database!');
      } catch (error) {
        console.error('Failed to upload icon:', error);
        showMessage('error', 'Failed to upload icon');
      } finally {
        setLoading(false);
      }
    }
  };
  
  // Helper function to update manifest icons dynamically
  const updateManifestIcons = (iconUrl) => {
    try {
      let manifestLink = document.querySelector("link[rel='manifest']");
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        document.getElementsByTagName('head')[0].appendChild(manifestLink);
      }
      
      const manifest = {
        short_name: "Skoolific",
        name: "Skoolific School Management",
        icons: [
          {
            src: iconUrl,
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: iconUrl,
            sizes: "512x512",
            type: "image/png"
          }
        ],
        start_url: "/",
        display: "standalone",
        theme_color: "#667eea",
        background_color: "#ffffff",
        orientation: "portrait"
      };
      
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const manifestURL = URL.createObjectURL(manifestBlob);
      manifestLink.href = manifestURL;
    } catch (error) {
      console.error('Error updating manifest:', error);
    }
  };
  
  // Save theme to database
  const saveThemeToDatabase = async () => {
    try {
      await api.put('/admin/branding', {
        primary_color: localTheme.primaryColor,
        secondary_color: localTheme.secondaryColor,
        theme_mode: localTheme.mode
      });
    } catch (error) {
      console.error('Failed to save theme to database:', error);
    }
  };
  
  // Year Rollover functions
  const loadYearRolloverStatus = async () => {
    try {
      const response = await api.get('/year-rollover/status');
      setYearRolloverStatus(response.data);
    } catch (error) {
      console.error('Failed to load year rollover status:', error);
    }
  };
  
  const loadArchives = async () => {
    try {
      const response = await api.get('/year-rollover/archives');
      setArchives(response.data.archives || []);
    } catch (error) {
      console.error('Failed to load archives:', error);
    }
  };
  
  const viewArchiveDetails = async (archiveId) => {
    try {
      const response = await api.get(`/year-rollover/archives/${archiveId}`);
      setSelectedArchive(response.data);
    } catch (error) {
      console.error('Failed to load archive details:', error);
      showMessage('error', 'Failed to load archive details');
    }
  };
  
  const exportArchiveData = async (archiveId) => {
    try {
      const response = await api.get(`/year-rollover/archives/${archiveId}/export`);
      
      // Convert to Excel-friendly format
      const data = response.data.data;
      const archive = response.data.archive;
      
      // Create CSV content
      let csvContent = `Academic Year: ${archive.academic_year}\n`;
      csvContent += `Ethiopian Year: ${archive.ethiopian_year}\n`;
      csvContent += `Archive Date: ${new Date(archive.archive_date).toLocaleDateString()}\n\n`;
      
      // Students
      csvContent += `STUDENTS (${data.students.length})\n`;
      csvContent += `ID,Student ID,Class Name,Final Status,Created At\n`;
      data.students.forEach(s => {
        csvContent += `${s.id},${s.student_id},${s.class_name || 'N/A'},${s.final_status},${new Date(s.created_at).toLocaleDateString()}\n`;
      });
      
      csvContent += `\n\nATTENDANCE RECORDS (${data.attendance.length})\n`;
      csvContent += `ID,Student ID,Total Records,Total Present,Total Absent,Attendance %\n`;
      data.attendance.forEach(a => {
        csvContent += `${a.id},${a.student_id},${a.total_records || 0},${a.total_present || 0},${a.total_absent || 0},${a.attendance_percentage || 0}%\n`;
      });
      
      csvContent += `\n\nMARKS (${data.marks.length})\n`;
      csvContent += `ID,Student ID,Total Records,Overall %,Overall Grade\n`;
      data.marks.forEach(m => {
        csvContent += `${m.id},${m.student_id},${m.total_records || 0},${m.overall_percentage || 0}%,${m.overall_grade || 'N/A'}\n`;
      });
      
      csvContent += `\n\nPAYMENTS (${data.payments.length})\n`;
      csvContent += `ID,Student ID,Total Records,Total Fees,Total Paid,Outstanding\n`;
      data.payments.forEach(p => {
        csvContent += `${p.id},${p.student_id},${p.total_records || 0},${p.total_fees || 0},${p.total_paid || 0},${p.total_outstanding || 0}\n`;
      });
      
      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `archive_${archive.academic_year.replace('/', '-')}_${Date.now()}.csv`;
      link.click();
      
      showMessage('success', 'Archive data exported successfully!');
    } catch (error) {
      console.error('Failed to export archive:', error);
      showMessage('error', 'Failed to export archive data');
    }
  };
  
  const executeYearRollover = async () => {
    setRolloverLoading(true);
    try {
      const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
      const response = await api.post('/year-rollover/execute', {
        archivedBy: adminUser.id || 1
      });
      
      if (response.data.success) {
        showMessage('success', `Year rollover completed! ${response.data.data.oldYear} → ${response.data.data.newYear}`);
        setShowRolloverConfirm(false);
        
        // Reload status and archives
        await loadYearRolloverStatus();
        await loadArchives();
      } else {
        showMessage('error', response.data.error || 'Year rollover failed');
      }
    } catch (error) {
      console.error('Year rollover failed:', error);
      showMessage('error', error.response?.data?.error || 'Year rollover failed');
    } finally {
      setRolloverLoading(false);
    }
  };
  
  // Load year rollover data when tab is active
  useEffect(() => {
    if (activeTab === 'yearRollover') {
      loadYearRolloverStatus();
      loadArchives();
    }
  }, [activeTab]);

  const tabs = [
    { id: 'schoolInfo', label: t('settings.tabs.schoolInfo', 'School Info'), icon: <FiHome /> },
    { id: 'branding', label: t('settings.tabs.branding', 'Branding'), icon: <FiImage /> },
    { id: 'language', label: t('settings.tabs.language', 'Language'), icon: <FiGlobe /> },
    { id: 'password', label: t('settings.tabs.password', 'Password'), icon: <FiLock /> },
    { id: 'subAccounts', label: t('settings.tabs.subAccounts', 'Sub-Accounts'), icon: <FiUsers /> },
    { id: 'permissions', label: t('settings.tabs.permissions', 'Permissions'), icon: <FiShield /> },
    { id: 'profile', label: appT('profile'), icon: <FiUser /> },
    { id: 'theme', label: appT('theme'), icon: <FiSun /> },
    { id: 'yearRollover', label: 'Year Rollover', icon: <FiDownload /> },
    { id: 'apps', label: 'Apps', icon: <FiSmartphone /> }
  ];

  return (
    <main className={styles.container} aria-label={t('settings.title', 'Settings')}>
      <header className={styles.header}>
        <h1 className={styles.title}>{appT('settingsTitle') || t('settings.title', 'Settings')}</h1>
        <p className={styles.subtitle}>{appT('settingsSubtitle')}</p>
      </header>

      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? <FiCheck /> : <FiX />}
          {message.text}
        </div>
      )}

      <div className={styles.settingsLayout}>
        <div className={styles.sidebar}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={activeTab === tab.id ? {
                background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`
              } : {}}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('profileSettings')}</h2>
              
              <div className={styles.profileImageSection}>
                <div className={styles.profileImageWrapper}>
                  {localProfile.profileImage ? (
                    <img src={localProfile.profileImage} alt="Profile" className={styles.profileImage} />
                  ) : (
                    <div className={styles.profilePlaceholder} style={{
                      background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`
                    }}>
                      <FiUser />
                    </div>
                  )}
                  <button 
                    className={styles.changeImageBtn}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: theme.primaryColor }}
                  >
                    <FiCamera />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfileImageChange}
                  style={{ display: 'none' }}
                />
                <p className={styles.imageHint}>Click to change profile picture</p>
              </div>

              <div className={styles.formGroup}>
                <label>{t('fullName')}</label>
                <input
                  type="text"
                  name="name"
                  value={localProfile.name}
                  onChange={handleProfileChange}
                  placeholder="Enter your name"
                />
              </div>

              <div className={styles.formGroup}>
                <label>{t('emailAddress')}</label>
                <input
                  type="email"
                  name="email"
                  value={localProfile.email}
                  onChange={handleProfileChange}
                  placeholder="Enter your email"
                />
              </div>

              <button 
                className={styles.saveBtn} 
                onClick={saveProfile} 
                disabled={loading}
                style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
              >
                <FiSave /> {loading ? t('loading') : t('saveProfile')}
              </button>
            </div>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('changePassword')}</h2>
              
              {/* Change Username Section */}
              <div className={styles.brandingSection}>
                <h3>Change Username</h3>
                <p className={styles.hint}>Current: {JSON.parse(localStorage.getItem('adminUser') || '{}').username}</p>
                <div className={styles.formGroup}>
                  <label>New Username</label>
                  <input
                    type="text"
                    name="newUsername"
                    value={usernameData.newUsername}
                    onChange={handleUsernameChange}
                    placeholder="Enter new username"
                  />
                </div>
                <button 
                  className={styles.saveBtn}
                  onClick={changeUsername}
                  disabled={loading}
                  style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
                >
                  <FiUser /> {loading ? 'Saving...' : 'Change Username'}
                </button>
              </div>
              
              <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />
              
              <h2 className={styles.sectionTitle}>{t('changePassword')}</h2>
              
              <div className={styles.formGroup}>
                <label>{t('currentPassword')}</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  placeholder="Enter current password"
                />
              </div>

              <div className={styles.formGroup}>
                <label>{t('newPassword')}</label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="Enter new password"
                />
              </div>

              <div className={styles.formGroup}>
                <label>{t('confirmPassword')}</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="Confirm new password"
                />
              </div>

              <button 
                className={styles.saveBtn} 
                onClick={changePassword} 
                disabled={loading}
                style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
              >
                <FiLock /> {loading ? t('loading') : t('changePassword')}
              </button>
            </div>
          )}

          {/* Theme Tab */}
          {activeTab === 'theme' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('themeSettings')}</h2>
              
              <div className={styles.themeToggle}>
                <span>{t('darkMode')}</span>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={localTheme.mode === 'dark'}
                    onChange={toggleDarkMode}
                  />
                  <span className={styles.slider} style={localTheme.mode === 'dark' ? {
                    background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`
                  } : {}}></span>
                </label>
              </div>

              <div className={styles.colorPresets}>
                <h3>{t('colorPresets')}</h3>
                <div className={styles.presetGrid}>
                  {colorPresets.map(preset => (
                    <button
                      key={preset.name}
                      className={styles.presetBtn}
                      style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }}
                      onClick={() => handleColorPreset(preset)}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.customColors}>
                <h3>{t('customColors')}</h3>
                <div className={styles.colorPickers}>
                  <div className={styles.colorPicker}>
                    <label>{t('primaryColor')}</label>
                    <div className={styles.colorInputWrapper}>
                      <input
                        type="color"
                        value={localTheme.primaryColor}
                        onChange={(e) => handleCustomColor(e, 'primaryColor')}
                      />
                      <span>{localTheme.primaryColor}</span>
                    </div>
                  </div>
                  <div className={styles.colorPicker}>
                    <label>{t('secondaryColor')}</label>
                    <div className={styles.colorInputWrapper}>
                      <input
                        type="color"
                        value={localTheme.secondaryColor}
                        onChange={(e) => handleCustomColor(e, 'secondaryColor')}
                      />
                      <span>{localTheme.secondaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.themePreview}>
                <h3>{t('preview')}</h3>
                <div 
                  className={styles.previewBox}
                  style={{ background: `linear-gradient(135deg, ${localTheme.primaryColor}, ${localTheme.secondaryColor})` }}
                >
                  <span>Theme Preview</span>
                </div>
              </div>

              <button 
                className={styles.saveBtn} 
                onClick={saveTheme}
                style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
              >
                <FiSave /> {t('saveTheme')}
              </button>
            </div>
          )}

          {activeTab === 'subAccounts' && (
            <div className={styles.section}>
              <Suspense fallback={<p>{t('common.loading', 'Loading...')}</p>}>
                <AdminSubAccountsPanel />
              </Suspense>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('settings.tabs.permissions', 'Permissions')}</h2>
              <p className={styles.subtitle}>{t('settings.permissionsHint', 'Default permission groups for sub-accounts')}</p>
              <PermissionSelector
                selectedPermissions={defaultPermissions}
                onChange={setDefaultPermissions}
              />
            </div>
          )}

          {activeTab === 'language' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{appT('languageSettings') || t('settings.language', 'Language')}</h2>
              <LanguageSelector variant="dropdown" showFlags />
              
              <div className={styles.languageGrid}>
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    className={`${styles.languageBtn} ${language === lang.code ? styles.active : ''}`}
                    onClick={() => handleLanguageChange(lang.code)}
                    style={language === lang.code ? {
                      borderColor: theme.primaryColor,
                      background: `linear-gradient(135deg, ${theme.primaryColor}15, ${theme.secondaryColor}15)`
                    } : {}}
                  >
                    <span className={styles.flag}>{lang.flag}</span>
                    <span className={styles.langName}>{lang.name}</span>
                    {language === lang.code && <FiCheck className={styles.checkIcon} style={{ color: theme.primaryColor }} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Branding Tab */}
          {activeTab === 'branding' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('brandingSettings')}</h2>
              <p className={styles.hint} style={{ marginBottom: '20px', color: '#4CAF50' }}>
                ✓ All branding settings are saved to the database and persist across sessions
              </p>
              
              {/* Website Name Section */}
              <div className={styles.brandingSection}>
                <h3>Website / School Name</h3>
                <p className={styles.hint}>This name appears in the header and browser title</p>
                
                <div className={styles.formGroup}>
                  <input
                    type="text"
                    value={localWebsiteName}
                    onChange={handleWebsiteNameChange}
                    placeholder="Enter your school or website name"
                    className={styles.websiteNameInput}
                  />
                </div>
                
                <div className={styles.namePreview}>
                  <span className={styles.previewLabel}>Preview:</span>
                  <span className={styles.previewName} style={{ color: theme.primaryColor }}>{localWebsiteName}</span>
                </div>
                
                <button 
                  className={styles.saveBtn}
                  onClick={saveWebsiteName}
                  disabled={loading}
                  style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
                >
                  <FiSave /> {loading ? 'Saving...' : 'Save Name to Database'}
                </button>
              </div>
              
              {/* Website Icon Section */}
              <div className={styles.brandingSection}>
                <h3>{t('websiteIcon')}</h3>
                <p className={styles.hint}>This icon appears in browser tabs (saved to database)</p>
                
                <div className={styles.iconUpload}>
                  <div className={styles.iconPreview}>
                    {webIconUrl ? (
                      <img src={webIconUrl} alt="Web Icon" />
                    ) : (
                      <img src="/skoolific-icon.png" alt="Default Icon" />
                    )}
                  </div>
                  <button 
                    className={styles.uploadBtn}
                    onClick={() => iconInputRef.current?.click()}
                    disabled={loading}
                    style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                  >
                    <FiUpload /> {loading ? 'Uploading...' : t('uploadIcon')}
                  </button>
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleWebIconChange}
                    style={{ display: 'none' }}
                  />
                </div>
                <p className={styles.iconHint}>Recommended: 32x32 or 64x64 pixels, PNG or ICO format</p>
              </div>
            </div>
          )}

          {/* School Info Tab */}
          {activeTab === 'schoolInfo' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('schoolInfo') || 'School Information'}</h2>
              <p className={styles.hint} style={{ marginBottom: '20px', color: '#4CAF50' }}>
                ✓ School information is displayed on report cards and official documents
              </p>
              
              {/* School Logo Section */}
              <div className={styles.brandingSection}>
                <h3>{t('schoolLogo') || 'School Logo'}</h3>
                <p className={styles.hint}>This logo appears on report cards and official documents</p>
                
                <div className={styles.iconUpload}>
                  <div className={styles.logoPreview}>
                    {schoolLogoUrl ? (
                      <img src={schoolLogoUrl} alt="School Logo" />
                    ) : (
                      <div className={styles.iconPlaceholder}>🏫</div>
                    )}
                  </div>
                  <button 
                    className={styles.uploadBtn}
                    onClick={() => logoInputRef.current?.click()}
                    disabled={loading}
                    style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                  >
                    <FiUpload /> {loading ? 'Uploading...' : t('uploadLogo') || 'Upload Logo'}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSchoolLogoChange}
                    style={{ display: 'none' }}
                  />
                </div>
                <p className={styles.iconHint}>Recommended: 200x200 pixels or larger, PNG or JPG format</p>
              </div>
              
              {/* School Details Section */}
              <div className={styles.brandingSection}>
                <h3>{t('schoolDetails') || 'School Details'}</h3>
                
                <div className={styles.formGroup}>
                  <label>{t('schoolAddress') || 'School Address'}</label>
                  <input
                    type="text"
                    name="address"
                    value={schoolInfo.address}
                    onChange={handleSchoolInfoChange}
                    placeholder="Enter school address"
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label>{t('schoolPhone') || 'Phone Number'}</label>
                  <input
                    type="text"
                    name="phone"
                    value={schoolInfo.phone}
                    onChange={handleSchoolInfoChange}
                    placeholder="Enter phone number"
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label>{t('schoolEmail') || 'Email Address'}</label>
                  <input
                    type="email"
                    name="email"
                    value={schoolInfo.email}
                    onChange={handleSchoolInfoChange}
                    placeholder="Enter email address"
                  />
                </div>
                
                {schoolInfo.academicYear && (
                  <div className={styles.namePreview} style={{ marginBottom: '16px' }}>
                    <span className={styles.previewLabel}>{t('academicYear') || 'Academic Year'}:</span>
                    <span className={styles.previewName} style={{ color: theme.primaryColor }}>{schoolInfo.academicYear}</span>
                    <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>(Set from Task 1)</span>
                  </div>
                )}
                
                <button 
                  className={styles.saveBtn}
                  onClick={saveSchoolInfo}
                  disabled={loading}
                  style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
                >
                  <FiSave /> {loading ? 'Saving...' : t('saveSchoolInfo') || 'Save School Information'}
                </button>
              </div>
            </div>
          )}

          {/* Year Rollover Tab */}
          {activeTab === 'yearRollover' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>📅 Academic Year Rollover</h2>
              <p className={styles.subtitle}>Archive current year data and transition to the next academic year</p>
              
              {/* Current Year Status */}
              {yearRolloverStatus && (
                <div className={yearRolloverStyles.yearStatusCard}>
                  <h3>Current Academic Year</h3>
                  <div className={yearRolloverStyles.yearInfo}>
                    <div className={yearRolloverStyles.yearBadge} style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}>
                      {yearRolloverStatus.currentYear.academicYear}
                    </div>
                    <span className={yearRolloverStyles.ethiopianYear}>
                      Ethiopian Year: {yearRolloverStatus.currentYear.ethiopianYear}
                    </span>
                  </div>
                  
                  <div className={yearRolloverStyles.dataStats}>
                    <div className={yearRolloverStyles.statCard}>
                      <FiUser size={24} />
                      <div>
                        <span className={yearRolloverStyles.statValue}>{yearRolloverStatus.currentData.students}</span>
                        <span className={yearRolloverStyles.statLabel}>Students</span>
                      </div>
                    </div>
                    <div className={yearRolloverStyles.statCard}>
                      <FiCheck size={24} />
                      <div>
                        <span className={yearRolloverStyles.statValue}>{yearRolloverStatus.currentData.attendance}</span>
                        <span className={yearRolloverStyles.statLabel}>Attendance Records</span>
                      </div>
                    </div>
                    <div className={yearRolloverStyles.statCard}>
                      <FiSave size={24} />
                      <div>
                        <span className={yearRolloverStyles.statValue}>{yearRolloverStatus.currentData.marks}</span>
                        <span className={yearRolloverStyles.statLabel}>Marks</span>
                      </div>
                    </div>
                    <div className={yearRolloverStyles.statCard}>
                      <FiDownload size={24} />
                      <div>
                        <span className={yearRolloverStyles.statValue}>{yearRolloverStatus.currentData.payments}</span>
                        <span className={yearRolloverStyles.statLabel}>Payments</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={yearRolloverStyles.warningBox}>
                    <strong>⚠️ Important:</strong> Year rollover will:
                    <ul>
                      <li>Archive all current year data (students, attendance, marks, payments)</li>
                      <li>Clear year-specific data (attendance, marks, payments, invoices)</li>
                      <li>Increment academic year to {yearRolloverStatus.currentYear.ethiopianYear + 1}/{yearRolloverStatus.currentYear.ethiopianYear + 2}</li>
                      <li>Students and staff records will be preserved</li>
                    </ul>
                  </div>
                  
                  <button 
                    className={yearRolloverStyles.rolloverBtn}
                    onClick={() => setShowRolloverConfirm(true)}
                    disabled={rolloverLoading}
                    style={{ background: 'linear-gradient(135deg, #f44336, #d32f2f)' }}
                  >
                    <FiDownload /> {rolloverLoading ? 'Processing...' : 'Start Year Rollover'}
                  </button>
                </div>
              )}
              
              {/* Confirmation Dialog */}
              {showRolloverConfirm && (
                <div className={yearRolloverStyles.confirmOverlay}>
                  <div className={yearRolloverStyles.confirmDialog}>
                    <h3>⚠️ Confirm Year Rollover</h3>
                    <p>
                      Are you sure you want to rollover to the next academic year?
                    </p>
                    <p style={{ color: '#f44336', fontWeight: 'bold' }}>
                      This action cannot be undone!
                    </p>
                    <div className={yearRolloverStyles.confirmButtons}>
                      <button 
                        className={yearRolloverStyles.cancelBtn}
                        onClick={() => setShowRolloverConfirm(false)}
                        disabled={rolloverLoading}
                      >
                        Cancel
                      </button>
                      <button 
                        className={yearRolloverStyles.confirmBtn}
                        onClick={executeYearRollover}
                        disabled={rolloverLoading}
                        style={{ background: 'linear-gradient(135deg, #f44336, #d32f2f)' }}
                      >
                        {rolloverLoading ? 'Processing...' : 'Yes, Rollover Now'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Archived Years */}
              <div className={yearRolloverStyles.archivesSection}>
                <h3>📦 Archived Academic Years ({archives.length})</h3>
                
                {archives.length === 0 ? (
                  <p className={yearRolloverStyles.noArchives}>No archived years yet</p>
                ) : (
                  <div className={yearRolloverStyles.archivesGrid}>
                    {archives.map(archive => (
                      <div key={archive.id} className={yearRolloverStyles.archiveCard}>
                        <div className={yearRolloverStyles.archiveHeader}>
                          <h4>{archive.academic_year}</h4>
                          <span className={yearRolloverStyles.archiveDate}>
                            {new Date(archive.archive_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className={yearRolloverStyles.archiveStats}>
                          <span>👥 {archive.total_students} Students</span>
                          <span>👨‍🏫 {archive.total_staff} Staff</span>
                        </div>
                        <div className={yearRolloverStyles.archiveActions}>
                          <button 
                            className={yearRolloverStyles.viewBtn}
                            onClick={() => viewArchiveDetails(archive.id)}
                            style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                          >
                            View Details
                          </button>
                          <button 
                            className={yearRolloverStyles.exportBtn}
                            onClick={() => exportArchiveData(archive.id)}
                            style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}
                          >
                            <FiDownload /> Export
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Archive Details Modal */}
              {selectedArchive && (
                <div className={yearRolloverStyles.confirmOverlay} onClick={() => setSelectedArchive(null)}>
                  <div className={yearRolloverStyles.archiveDetailsDialog} onClick={(e) => e.stopPropagation()}>
                    <h3>Archive Details: {selectedArchive.archive.academic_year}</h3>
                    <div className={yearRolloverStyles.detailsGrid}>
                      <div className={yearRolloverStyles.detailItem}>
                        <span className={yearRolloverStyles.detailLabel}>Ethiopian Year:</span>
                        <span className={yearRolloverStyles.detailValue}>{selectedArchive.archive.ethiopian_year}</span>
                      </div>
                      <div className={yearRolloverStyles.detailItem}>
                        <span className={yearRolloverStyles.detailLabel}>Archive Date:</span>
                        <span className={yearRolloverStyles.detailValue}>
                          {new Date(selectedArchive.archive.archive_date).toLocaleString()}
                        </span>
                      </div>
                      <div className={yearRolloverStyles.detailItem}>
                        <span className={yearRolloverStyles.detailLabel}>Total Students:</span>
                        <span className={yearRolloverStyles.detailValue}>{selectedArchive.archive.total_students}</span>
                      </div>
                      <div className={yearRolloverStyles.detailItem}>
                        <span className={yearRolloverStyles.detailLabel}>Total Staff:</span>
                        <span className={yearRolloverStyles.detailValue}>{selectedArchive.archive.total_staff}</span>
                      </div>
                    </div>
                    
                    <h4>Archived Records</h4>
                    <div className={yearRolloverStyles.recordsGrid}>
                      <div className={yearRolloverStyles.recordCard}>
                        <FiUser size={32} />
                        <span className={yearRolloverStyles.recordValue}>{selectedArchive.archivedRecords.students}</span>
                        <span className={yearRolloverStyles.recordLabel}>Students</span>
                      </div>
                      <div className={yearRolloverStyles.recordCard}>
                        <FiCheck size={32} />
                        <span className={yearRolloverStyles.recordValue}>{selectedArchive.archivedRecords.attendance}</span>
                        <span className={yearRolloverStyles.recordLabel}>Attendance</span>
                      </div>
                      <div className={yearRolloverStyles.recordCard}>
                        <FiSave size={32} />
                        <span className={yearRolloverStyles.recordValue}>{selectedArchive.archivedRecords.marks}</span>
                        <span className={yearRolloverStyles.recordLabel}>Marks</span>
                      </div>
                      <div className={yearRolloverStyles.recordCard}>
                        <FiDownload size={32} />
                        <span className={yearRolloverStyles.recordValue}>{selectedArchive.archivedRecords.payments}</span>
                        <span className={yearRolloverStyles.recordLabel}>Payments</span>
                      </div>
                    </div>
                    
                    <button 
                      className={yearRolloverStyles.closeBtn}
                      onClick={() => setSelectedArchive(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Apps Tab */}
          {activeTab === 'apps' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Mobile Apps (PWA)</h2>
              <p className={styles.subtitle}>Install Skoolific apps directly on your mobile devices</p>
              
              {installMessage && (
                <div className={styles.installMessage}>
                  <FiCheck /> {installMessage}
                </div>
              )}
              
              <div className={styles.appsGrid}>
                {/* Student App */}
                <div className={styles.appCard}>
                  <div className={styles.appIcon} style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    <FiSmartphone size={40} />
                  </div>
                  <h3 className={styles.appTitle}>Student App</h3>
                  <p className={styles.appDescription}>
                    Access student profiles, attendance, grades, and more on mobile devices.
                  </p>
                  <div className={styles.appFeatures}>
                    <span>✓ View Profile</span>
                    <span>✓ Check Attendance</span>
                    <span>✓ View Grades</span>
                    <span>✓ Offline Access</span>
                  </div>
                  <button 
                    className={styles.downloadBtn}
                    onClick={() => window.location.href = '/install-student.html'}
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                  >
                    <FiDownload /> Install Student App
                  </button>
                  <div className={styles.shareButtons}>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => copyInstallLink('Student', `${window.location.origin}/install-student.html`)}
                      title="Copy link"
                    >
                      <FiCopy /> Copy Link
                    </button>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => shareOnTelegram('Student', `${window.location.origin}/install-student.html`)}
                      title="Share on Telegram"
                    >
                      <FiShare2 /> Share on Telegram
                    </button>
                  </div>
                  <p className={styles.installHint}>
                    Works on Android & iPhone • No download needed
                  </p>
                </div>

                {/* Staff App */}
                <div className={styles.appCard}>
                  <div className={styles.appIcon} style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)' }}>
                    <FiSmartphone size={40} />
                  </div>
                  <h3 className={styles.appTitle}>Staff App</h3>
                  <p className={styles.appDescription}>
                    Manage attendance, grades, and communicate with students on the go.
                  </p>
                  <div className={styles.appFeatures}>
                    <span>✓ Mark Attendance</span>
                    <span>✓ Enter Grades</span>
                    <span>✓ View Schedule</span>
                    <span>✓ Quick Access</span>
                  </div>
                  <button 
                    className={styles.downloadBtn}
                    onClick={() => window.location.href = '/install-staff.html'}
                    style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)' }}
                  >
                    <FiDownload /> Install Staff App
                  </button>
                  <div className={styles.shareButtons}>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => copyInstallLink('Staff', `${window.location.origin}/install-staff.html`)}
                      title="Copy link"
                    >
                      <FiCopy /> Copy Link
                    </button>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => shareOnTelegram('Staff', `${window.location.origin}/install-staff.html`)}
                      title="Share on Telegram"
                    >
                      <FiShare2 /> Share on Telegram
                    </button>
                  </div>
                  <p className={styles.installHint}>
                    Works on Android & iPhone • No download needed
                  </p>
                </div>

                {/* Guardian App */}
                <div className={styles.appCard}>
                  <div className={styles.appIcon} style={{ background: 'linear-gradient(135deg, #28a745, #68d391)' }}>
                    <FiSmartphone size={40} />
                  </div>
                  <h3 className={styles.appTitle}>Guardian App</h3>
                  <p className={styles.appDescription}>
                    Monitor your ward's progress, attendance, and payments from anywhere.
                  </p>
                  <div className={styles.appFeatures}>
                    <span>✓ Track Progress</span>
                    <span>✓ View Attendance</span>
                    <span>✓ Check Payments</span>
                    <span>✓ Stay Updated</span>
                  </div>
                  <button 
                    className={styles.downloadBtn}
                    onClick={() => window.location.href = '/install-guardian.html'}
                    style={{ background: 'linear-gradient(135deg, #28a745, #68d391)' }}
                  >
                    <FiDownload /> Install Guardian App
                  </button>
                  <div className={styles.shareButtons}>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => copyInstallLink('Guardian', `${window.location.origin}/install-guardian.html`)}
                      title="Copy link"
                    >
                      <FiCopy /> Copy Link
                    </button>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => shareOnTelegram('Guardian', `${window.location.origin}/install-guardian.html`)}
                      title="Share on Telegram"
                    >
                      <FiShare2 /> Share on Telegram
                    </button>
                  </div>
                  <p className={styles.installHint}>
                    Works on Android & iPhone • No download needed
                  </p>
                </div>

                {/* Admin App */}
                <div className={styles.appCard}>
                  <div className={styles.appIcon} style={{ background: 'linear-gradient(135deg, #ff6b35, #f7931e)' }}>
                    <FiSmartphone size={40} />
                  </div>
                  <h3 className={styles.appTitle}>Admin App</h3>
                  <p className={styles.appDescription}>
                    Full school management system access on mobile and desktop devices.
                  </p>
                  <div className={styles.appFeatures}>
                    <span>✓ Complete Dashboard</span>
                    <span>✓ Manage All Users</span>
                    <span>✓ Reports & Analytics</span>
                    <span>✓ Mobile & Desktop</span>
                  </div>
                  
                  {/* Two Install Buttons */}
                  <div className={styles.dualInstallButtons}>
                    <button 
                      className={styles.installBtnHalf}
                      onClick={() => handleInstallApp('Admin (Desktop)')}
                      style={{ background: 'linear-gradient(135deg, #ff6b35, #f7931e)' }}
                    >
                      <FiDownload /> Install on Desktop
                    </button>
                    <button 
                      className={styles.installBtnHalf}
                      onClick={() => handleInstallApp('Admin (Mobile)')}
                      style={{ background: 'linear-gradient(135deg, #f7931e, #ff6b35)' }}
                    >
                      <FiDownload /> Install on Mobile
                    </button>
                  </div>
                  
                  <div className={styles.shareButtons}>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => copyInstallLink('Admin', `${window.location.origin}/`)}
                      title="Copy link"
                    >
                      <FiCopy /> Copy Link
                    </button>
                    <button 
                      className={styles.shareBtn}
                      onClick={() => shareOnTelegram('Admin', `${window.location.origin}/`)}
                      title="Share on Telegram"
                    >
                      <FiShare2 /> Share on Telegram
                    </button>
                  </div>
                  <p className={styles.installHint}>
                    Works on Mobile, Tablet & Desktop • Full features
                  </p>
                </div>
              </div>

              {/* Installation Instructions */}
              <div className={styles.instructionsSection}>
                <h3 className={styles.instructionsTitle}>📱 💻 How to Share & Install</h3>
                
                <div className={styles.instructionsGrid}>
                  <div className={styles.instructionCard}>
                    <h4>Desktop Installation</h4>
                    <ol>
                      <li>Click "Install on Desktop" button</li>
                      <li>Browser shows install prompt</li>
                      <li>Click "Install" in the popup</li>
                      <li>App opens in standalone window!</li>
                      <li>Find it in Start Menu/Applications</li>
                    </ol>
                  </div>
                  
                  <div className={styles.instructionCard}>
                    <h4>Mobile Installation</h4>
                    <ol>
                      <li>Click "Install on Mobile" button</li>
                      <li>Browser shows "Add to Home Screen"</li>
                      <li>Tap "Install" or "Add"</li>
                      <li>App icon appears on home screen!</li>
                      <li>Open like any other app</li>
                    </ol>
                  </div>
                  
                  <div className={styles.instructionCard}>
                    <h4>Share with Others</h4>
                    <ol>
                      <li>Click "Share on Telegram" button</li>
                      <li>Choose group or contact</li>
                      <li>Recipients click the link</li>
                      <li>They install on their device</li>
                      <li>Works on mobile & desktop!</li>
                    </ol>
                  </div>
                </div>

                <div className={styles.qrCodeSection}>
                  <p className={styles.qrHint}>
                    💡 <strong>Pro Tip:</strong> Admin app works on desktop, tablet, and mobile! 
                    Both buttons trigger the same PWA install - just labeled for clarity. 
                    Use "Copy Link" to share via WhatsApp, Email, or SMS!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default Setting;
