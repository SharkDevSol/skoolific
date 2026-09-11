import React from 'react';
import { useApp } from '../../context/AppContext';
import styles from './ProfileHeader.module.css';

const ProfileHeader = ({ 
  imageUrl, 
  name, 
  subtitle, 
  fallbackInitial,
  size = 'large' // 'small' | 'medium' | 'large'
}) => {
  const { theme } = useApp();
  
  const headerStyle = {
    background: `linear-gradient(135deg, ${theme?.primaryColor || '#7c3aed'} 0%, ${theme?.secondaryColor || '#8b5cf6'} 100%)`
  };
  const getInitial = () => {
    if (fallbackInitial) return fallbackInitial;
    if (name) return name.charAt(0).toUpperCase();
    return '?';
  };

  return (
    <div className={`${styles.profileHeader} ${styles[size]}`} style={headerStyle}>
      <div className={styles.avatarContainer}>
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={`${name}'s profile`}
            className={styles.avatar}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className={styles.avatarPlaceholder}
          style={{ display: imageUrl ? 'none' : 'flex' }}
        >
          {getInitial()}
        </div>
      </div>
      
      <div className={styles.userInfo}>
        <h2 className={styles.name}>{name || 'User'}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </div>
  );
};

export default ProfileHeader;
