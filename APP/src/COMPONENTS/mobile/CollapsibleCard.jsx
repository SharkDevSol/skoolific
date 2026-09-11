import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './CollapsibleCard.module.css';

const CollapsibleCard = ({ 
  title, 
  icon, 
  defaultExpanded = true, 
  children,
  className = ''
}) => {
  const { theme } = useApp();
  
  const iconStyle = {
    background: `linear-gradient(135deg, ${theme?.primaryColor || '#7c3aed'} 0%, ${theme?.secondaryColor || '#8b5cf6'} 100%)`
  };
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(defaultExpanded ? 'auto' : 0);
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      if (isExpanded) {
        setContentHeight(contentRef.current.scrollHeight);
        // After animation, set to auto for dynamic content
        const timer = setTimeout(() => setContentHeight('auto'), 300);
        return () => clearTimeout(timer);
      } else {
        // First set to actual height, then to 0 for smooth animation
        setContentHeight(contentRef.current.scrollHeight);
        requestAnimationFrame(() => {
          setContentHeight(0);
        });
      }
    }
  }, [isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`${styles.card} ${className} ${theme?.mode === 'dark' ? styles.darkMode : ''}`}>
      <button 
        className={styles.header}
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
      >
        <div className={styles.headerLeft}>
          {icon && <span className={styles.icon} style={iconStyle}>{icon}</span>}
          <h3 className={styles.title}>{title}</h3>
        </div>
        <FiChevronDown 
          className={`${styles.chevron} ${isExpanded ? styles.expanded : ''}`}
        />
      </button>
      
      <div 
        ref={contentRef}
        className={styles.content}
        style={{ 
          height: contentHeight,
          overflow: isExpanded && contentHeight === 'auto' ? 'visible' : 'hidden'
        }}
      >
        <div className={styles.contentInner}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleCard;
