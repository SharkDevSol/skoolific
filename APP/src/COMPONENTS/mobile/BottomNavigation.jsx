import React from 'react';
import { FiMoreHorizontal, FiPlus } from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import { FloatingButton, FloatingButtonItem } from './FloatingButton';
import styles from './BottomNavigation.module.css';
import floatingStyles from './FloatingButton.module.css';

const MAX_VISIBLE_ITEMS = 5;

const BottomNavigation = ({ items, activeItem, onItemClick }) => {
  const { theme } = useApp();
  
  const activeStyle = {
    color: theme?.primaryColor || '#7c3aed'
  };

  // Split items if more than MAX_VISIBLE_ITEMS
  const hasOverflow = items.length > MAX_VISIBLE_ITEMS;
  const visibleItems = hasOverflow ? items.slice(0, MAX_VISIBLE_ITEMS - 1) : items;
  const overflowItems = hasOverflow ? items.slice(MAX_VISIBLE_ITEMS - 1) : [];
  
  // Check if any overflow item is active
  const isOverflowActive = overflowItems.some(item => item.id === activeItem);

  return (
    <nav className={`${styles.bottomNav} ${theme?.mode === 'dark' ? styles.darkMode : ''}`}>
      {visibleItems.map((item) => (
        <button
          key={item.id}
          className={`${styles.navItem} ${activeItem === item.id ? styles.active : ''} ${item.centered ? styles.centered : ''}`}
          onClick={() => onItemClick(item.id)}
          aria-label={item.label}
          aria-current={activeItem === item.id ? 'page' : undefined}
          style={activeItem === item.id ? activeStyle : {}}
        >
          <span className={`${styles.iconWrapper} ${item.centered ? styles.centeredIcon : ''}`}>
            {item.icon}
            {item.badge && (
              <span className={styles.badge}>{item.badge}</span>
            )}
          </span>
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
      
      {/* Floating button for overflow items */}
      {hasOverflow && (
        <FloatingButton
          triggerContent={
            <button 
              className={`${floatingStyles.floatingNavBtn} ${isOverflowActive ? floatingStyles.floatingMenuBtnActive : ''}`}
              aria-label="More options"
            >
              <FiPlus />
            </button>
          }
        >
          {overflowItems.map((item) => (
            <FloatingButtonItem key={item.id} onClick={() => onItemClick(item.id)}>
              <button 
                className={`${floatingStyles.floatingMenuBtn} ${activeItem === item.id ? floatingStyles.floatingMenuBtnActive : ''}`}
                style={activeItem === item.id ? activeStyle : {}}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </FloatingButtonItem>
          ))}
        </FloatingButton>
      )}
    </nav>
  );
};

export default BottomNavigation;
