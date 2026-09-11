import React, { useState, useRef, useCallback } from 'react';
import { FiRefreshCw, FiBell } from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './MobileProfileLayout.module.css';

const MobileProfileLayout = ({ 
  children, 
  title, 
  onLogout, 
  onRefresh,
  isLoading = false,
  onNotificationClick,
  notificationCount = 0
}) => {
  const { theme } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const contentRef = useRef(null);
  const startY = useRef(0);
  const isPulling = useRef(false);

  const PULL_THRESHOLD = 80;

  const handleTouchStart = useCallback((e) => {
    if (contentRef.current?.scrollTop === 0 && onRefresh) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [onRefresh]);

  const handleTouchMove = useCallback((e) => {
    if (!isPulling.current || !onRefresh) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0 && contentRef.current?.scrollTop === 0) {
      e.preventDefault();
      setPullDistance(Math.min(diff * 0.5, PULL_THRESHOLD * 1.5));
    }
  }, [onRefresh]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || !onRefresh) return;
    
    isPulling.current = false;
    
    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  // Dynamic theme styles
  const headerStyle = {
    background: `linear-gradient(135deg, ${theme?.primaryColor || '#7c3aed'} 0%, ${theme?.secondaryColor || '#8b5cf6'} 100%)`
  };

  return (
    <div className={`${styles.mobileLayout} ${theme?.mode === 'dark' ? styles.darkMode : ''}`}>
      {/* App Header */}
      <header className={styles.appHeader} style={headerStyle}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.headerActions}>
          {onRefresh && (
            <button 
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setIsRefreshing(false);
                }
              }} 
              className={styles.refreshButton}
              disabled={isRefreshing}
            >
              <FiRefreshCw 
                size={20} 
                className={isRefreshing ? styles.spinning : ''}
              />
            </button>
          )}
          {onNotificationClick && (
            <button onClick={onNotificationClick} className={styles.notificationButton}>
              <FiBell size={20} />
              {notificationCount > 0 && (
                <span className={styles.notificationBadge}>{notificationCount}</span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Pull to Refresh Indicator */}
      {onRefresh && (
        <div 
          className={styles.pullIndicator}
          style={{ 
            height: pullDistance,
            opacity: pullDistance / PULL_THRESHOLD 
          }}
        >
          <FiRefreshCw 
            className={`${styles.refreshIcon} ${isRefreshing ? styles.spinning : ''}`}
            style={{ 
              transform: `rotate(${pullDistance * 2}deg)` 
            }}
          />
          <span className={styles.pullText}>
            {isRefreshing ? 'Refreshing...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {/* Content Area */}
      <main 
        ref={contentRef}
        className={styles.contentArea}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </main>
    </div>
  );
};

export default MobileProfileLayout;
