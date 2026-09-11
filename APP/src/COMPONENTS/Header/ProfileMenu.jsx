import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getBranchCode } from '../../utils/branchCode';
import styles from './ProfileMenu.module.css';

/**
 * ProfileMenu component for user profile dropdown
 * Shows user information and logout option
 * 
 * @param {Object} props - Component props
 * @param {Object} props.user - User information object
 * @param {Function} props.onLogout - Callback function for logout action
 * @param {Function} props.onProfileClick - Callback function when profile is clicked
 * @param {string} props.className - Additional CSS classes
 */
const ProfileMenu = ({ user, onLogout, onProfileClick, className = '' }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const branchCode = getBranchCode();

  const profileMenuClasses = [
    styles.profileMenu,
    className
  ].filter(Boolean).join(' ');

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle escape key to close dropdown
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleProfileClick = () => {
    setIsOpen(false);
    onProfileClick?.();
  };

  const handleLogout = () => {
    setIsOpen(false);
    onLogout();
  };

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user?.name) return '?';
    const names = user.name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return user.name.substring(0, 2).toUpperCase();
  };

  return (
    <div className={profileMenuClasses} ref={dropdownRef}>
      <button
        className={styles.profileButton}
        onClick={toggleDropdown}
        aria-label={t('common.userMenu', 'User menu')}
        aria-expanded={isOpen}
        aria-haspopup="true"
        type="button"
      >
        <div className={styles.avatar}>
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className={styles.avatarImage}
            />
          ) : (
            <span className={styles.avatarInitials} aria-hidden="true">
              {getUserInitials()}
            </span>
          )}
        </div>

        <div className={styles.userInfo}>
          <span className={styles.userName}>{user?.name || t('common.user', 'User')}</span>
          <span className={styles.userRole}>{user?.role || ''}</span>
          {branchCode && (
            <span className={styles.branchBadge} title={`Connected to branch: ${branchCode}`}>
              {branchCode}
            </span>
          )}
        </div>

        <ChevronDown
          size={16}
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.dropdownHeader}>
            <div className={styles.dropdownAvatar}>
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className={styles.avatarImage}
                />
              ) : (
                <span className={styles.avatarInitials} aria-hidden="true">
                  {getUserInitials()}
                </span>
              )}
            </div>
            <div className={styles.dropdownUserInfo}>
              <p className={styles.dropdownUserName}>{user?.name || t('common.user', 'User')}</p>
              <p className={styles.dropdownUserRole}>{user?.role || ''}</p>
              {branchCode && (
                <p className={styles.dropdownBranchBadge}>Branch: {branchCode}</p>
              )}
            </div>
          </div>

          <div className={styles.dropdownDivider} />

          <div className={styles.dropdownMenu}>
            {onProfileClick && (
              <button
                className={styles.menuItem}
                onClick={handleProfileClick}
                role="menuitem"
                type="button"
              >
                <User size={18} aria-hidden="true" />
                <span>{t('common.profile', 'Profile')}</span>
              </button>
            )}

            <button
              className={styles.menuItem}
              onClick={() => {
                setIsOpen(false);
                // Navigate to settings page
              }}
              role="menuitem"
              type="button"
            >
              <Settings size={18} aria-hidden="true" />
              <span>{t('common.settings', 'Settings')}</span>
            </button>
          </div>

          <div className={styles.dropdownDivider} />

          <div className={styles.dropdownFooter}>
            <button
              className={`${styles.menuItem} ${styles.logoutButton}`}
              onClick={handleLogout}
              role="menuitem"
              type="button"
            >
              <LogOut size={18} aria-hidden="true" />
              <span>{t('common.logout', 'Logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

ProfileMenu.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
    avatar: PropTypes.string
  }).isRequired,
  onLogout: PropTypes.func.isRequired,
  onProfileClick: PropTypes.func,
  className: PropTypes.string
};

export default ProfileMenu;
