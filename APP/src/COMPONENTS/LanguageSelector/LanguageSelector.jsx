import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import styles from './LanguageSelector.module.css';

/**
 * LanguageSelector component - Select application language with dropdown or button variants
 * 
 * @param {Object} props - Component props
 * @param {'dropdown' | 'buttons'} [props.variant='dropdown'] - Display variant (dropdown or button group)
 * @param {boolean} [props.showFlags=false] - Whether to show flag icons
 * @param {string} [props.className] - Additional CSS class
 * @returns {JSX.Element} Language selector component
 */
const LanguageSelector = ({ variant = 'dropdown', showFlags = false, className = '' }) => {
  const { language, changeLanguage } = useLanguage();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const languages = [
    { 
      code: 'en', 
      name: 'English', 
      nativeName: 'English',
      flag: '🇬🇧'
    },
    { 
      code: 'am', 
      name: 'Amharic', 
      nativeName: 'አማርኛ',
      flag: '🇪🇹'
    },
    { 
      code: 'ar', 
      name: 'Arabic', 
      nativeName: 'العربية',
      flag: '🇸🇦'
    },
    { 
      code: 'so', 
      name: 'Somali', 
      nativeName: 'Soomaali',
      flag: '🇸🇴'
    },
    { 
      code: 'om', 
      name: 'Oromo', 
      nativeName: 'Afaan Oromoo',
      flag: '🇪🇹'
    }
  ];
  
  const currentLanguage = languages.find(l => l.code === language);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    if (variant !== 'dropdown') return;
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant]);
  
  // Handle keyboard navigation for dropdown
  useEffect(() => {
    if (variant !== 'dropdown' || !isOpen) return;
    
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [variant, isOpen]);
  
  const handleLanguageChange = (lng) => {
    changeLanguage(lng);
    if (variant === 'dropdown') {
      setIsOpen(false);
    }
  };
  
  // Button group variant
  if (variant === 'buttons') {
    return (
      <div className={`${styles.languageSelector} ${styles.buttonGroup} ${className}`} role="group" aria-label="Language selection">
        {languages.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`${styles.languageButton} ${styles.groupButton} ${language === lang.code ? styles.active : ''}`}
            aria-label={`Select ${lang.name}`}
            aria-pressed={language === lang.code}
          >
            {showFlags && <span className={styles.flag} aria-hidden="true">{lang.flag}</span>}
            <span className={styles.languageName}>{lang.nativeName}</span>
            {language === lang.code && (
              <Check className={styles.checkIcon} size={16} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    );
  }
  
  // Dropdown variant (default)
  return (
    <div className={`${styles.languageSelector} ${className}`} ref={dropdownRef}>
      <button
        className={styles.languageButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {showFlags && <span className={styles.flag} aria-hidden="true">{currentLanguage?.flag}</span>}
        <Globe className={styles.icon} size={20} aria-hidden="true" />
        <span className={styles.languageName}>{currentLanguage?.nativeName}</span>
      </button>
      
      {isOpen && (
        <div className={styles.languageDropdown} role="menu" aria-label="Language options">
          {languages.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`${styles.languageOption} ${language === lang.code ? styles.active : ''}`}
              role="menuitem"
              aria-label={`Select ${lang.name}`}
            >
              {showFlags && <span className={styles.flag} aria-hidden="true">{lang.flag}</span>}
              <div className={styles.languageInfo}>
                <span className={styles.nativeName}>{lang.nativeName}</span>
                <span className={styles.englishName}>{lang.name}</span>
              </div>
              {language === lang.code && (
                <Check className={styles.checkIcon} size={16} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
