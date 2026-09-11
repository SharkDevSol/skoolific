import React, { forwardRef, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Check } from 'lucide-react';
import styles from './Select.module.css';

/**
 * Select/Dropdown component with single and multi-select support
 * @param {Object} props - Component props
 * @param {string} props.label - Select label
 * @param {Array} props.options - Options array [{value, label, disabled?, group?}] or grouped [{group, options: []}]
 * @param {string|string[]} props.value - Selected value(s) - string for single, array for multiple
 * @param {Function} props.onChange - Change handler - receives string for single, array for multiple
 * @param {boolean} props.multiple - Enable multi-select mode
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.error - Error message
 * @param {string} props.helperText - Helper text
 * @param {boolean} props.required - Required field
 * @param {boolean} props.disabled - Disabled state
 * @param {boolean} props.searchable - Enable search/filter
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.id - Input ID for accessibility
 * @param {string} props.name - Input name
 */
const Select = forwardRef(({ 
  label,
  options = [],
  value,
  onChange,
  multiple = false,
  placeholder = 'Select an option',
  error,
  helperText,
  required,
  disabled,
  searchable = false,
  className = '',
  id,
  name,
  ...props 
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const selectRef = useRef(null);
  const selectWrapperRef = useRef(null);
  const searchInputRef = useRef(null);

  // Calculate dropdown position relative to viewport for portal rendering
  useEffect(() => {
    if (!isOpen || !selectWrapperRef.current) return;
    const updatePos = () => {
      const rect = selectWrapperRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen]);

  // Normalize options to handle both flat and grouped structures
  const normalizedOptions = React.useMemo(() => {
    if (options.length === 0) return [];
    
    // Check if options are grouped
    const isGrouped = options.some(opt => opt.group && opt.options);
    
    if (isGrouped) {
      return options;
    }
    
    // Check if flat options have group property
    const hasGroups = options.some(opt => opt.group);
    
    if (hasGroups) {
      // Group flat options by their group property
      const grouped = {};
      options.forEach(opt => {
        const groupName = opt.group || 'Other';
        if (!grouped[groupName]) {
          grouped[groupName] = [];
        }
        grouped[groupName].push(opt);
      });
      
      return Object.entries(grouped).map(([group, opts]) => ({
        group,
        options: opts
      }));
    }
    
    // Return flat options as-is
    return [{ group: null, options }];
  }, [options]);

  // Get flat list of all options for keyboard navigation
  const flatOptions = React.useMemo(() => {
    return normalizedOptions.flatMap(group => 
      group.options.filter(opt => !opt.disabled)
    );
  }, [normalizedOptions]);

  // Get selected option(s) for display
  const getSelectedDisplay = () => {
    if (multiple) {
      const selectedValues = Array.isArray(value) ? value : [];
      if (selectedValues.length === 0) return placeholder;
      
      const selectedLabels = flatOptions
        .filter(opt => selectedValues.includes(opt.value))
        .map(opt => opt.label);
      
      return selectedLabels.join(', ');
    } else {
      const selectedOption = flatOptions.find(opt => opt.value === value);
      return selectedOption ? selectedOption.label : placeholder;
    }
  };

  const displayText = getSelectedDisplay();
  const hasSelection = multiple 
    ? (Array.isArray(value) && value.length > 0)
    : value !== undefined && value !== null && value !== '';

  // Filter options based on search term
  const filteredOptions = React.useMemo(() => {
    if (!searchable || !searchTerm) return normalizedOptions;
    
    const term = searchTerm.toLowerCase();
    return normalizedOptions.map(group => ({
      ...group,
      options: group.options.filter(opt => 
        opt.label.toLowerCase().includes(term)
      )
    })).filter(group => group.options.length > 0);
  }, [normalizedOptions, searchable, searchTerm]);

  // Handle click outside to close dropdown
  // When portal is open, clicking inside portal or select button doesn't close it
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      // Don't close if click is inside the select button
      if (selectRef.current && selectRef.current.contains(event.target)) return;
      // Don't close if click is inside the portal
      const portal = document.getElementById('select-dropdown-portal');
      if (portal && portal.contains(event.target)) return;
      setIsOpen(false);
      setSearchTerm('');
      setFocusedIndex(-1);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = (option) => {
    if (option.disabled) return;

    if (multiple) {
      const selectedValues = Array.isArray(value) ? value : [];
      const newValues = selectedValues.includes(option.value)
        ? selectedValues.filter(v => v !== option.value)
        : [...selectedValues, option.value];
      onChange?.(newValues);
    } else {
      onChange?.(option.value);
      setIsOpen(false);
      setSearchTerm('');
      setFocusedIndex(-1);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.(multiple ? [] : '');
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
        break;
      
      case 'Enter':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (focusedIndex >= 0 && focusedIndex < flatOptions.length) {
          handleSelect(flatOptions[focusedIndex]);
        }
        break;
      
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex(prev => 
            prev < flatOptions.length - 1 ? prev + 1 : prev
          );
        }
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setFocusedIndex(prev => prev > 0 ? prev - 1 : 0);
        }
        break;
      
      case 'Tab':
        if (isOpen) {
          setIsOpen(false);
          setSearchTerm('');
          setFocusedIndex(-1);
        }
        break;
      
      default:
        break;
    }
  };

  const isSelected = (option) => {
    if (multiple) {
      const selectedValues = Array.isArray(value) ? value : [];
      return selectedValues.includes(option.value);
    }
    return option.value === value;
  };

  const inputId = id || `select-${name || Math.random().toString(36).substr(2, 9)}`;

  return (
    <div 
      className={`${styles.selectGroup} ${className}`} 
      ref={selectRef}
      dir="auto"
    >
      {label && (
        <label className={styles.label} htmlFor={inputId} id={`${inputId}-label`}>
          {label}
          {required && <span className={styles.required} aria-label="required">*</span>}
        </label>
      )}
      
      <div className={`${styles.selectWrapper} ${error ? styles.error : ''} ${disabled ? styles.disabled : ''}`} ref={selectWrapperRef}>
        <button
          type="button"
          id={inputId}
          name={name}
          className={styles.selectButton}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={label ? `${inputId}-label` : undefined}
          aria-invalid={error ? 'true' : 'false'}
          aria-required={required ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          ref={ref}
          {...props}
        >
          <span className={`${styles.selectText} ${!hasSelection ? styles.placeholder : ''}`}>
            {displayText}
          </span>
          <div className={styles.iconGroup}>
            {hasSelection && !disabled && (
              <X 
                size={16} 
                className={styles.clearIcon}
                onClick={handleClear}
                aria-label="Clear selection"
              />
            )}
            <ChevronDown 
              size={20} 
              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
              aria-hidden="true"
            />
          </div>
        </button>
      </div>
      
      {/* Dropdown rendered via portal to avoid clipping by overflow:hidden parents */}
      {isOpen && createPortal(
        <div 
          id="select-dropdown-portal"
          style={{ position: 'fixed', zIndex: 99999 }}
        >
          <div 
            className={styles.dropdown} 
            role="presentation"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 1,
            }}
          >
          {searchable && (
            <div className={styles.searchWrapper}>
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search options"
              />
            </div>
          )}
          
          <ul 
            className={styles.optionsList} 
            role="listbox"
            aria-multiselectable={multiple ? 'true' : 'false'}
            aria-label={label || 'Select options'}
          >
            {filteredOptions.length === 0 ? (
              <li className={styles.noOptions} role="presentation">
                No options found
              </li>
            ) : (
              filteredOptions.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {group.group && (
                    <li className={styles.groupLabel} role="presentation">
                      {group.group}
                    </li>
                  )}
                  {group.options.map((option, optionIndex) => {
                    const flatIndex = flatOptions.findIndex(o => o.value === option.value);
                    const isFocused = flatIndex === focusedIndex;
                    const selected = isSelected(option);
                    
                    return (
                      <li
                        key={option.value}
                        className={`${styles.option} ${selected ? styles.selected : ''} ${option.disabled ? styles.optionDisabled : ''} ${isFocused ? styles.focused : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleSelect(option); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        role="option"
                        aria-selected={selected}
                        aria-disabled={option.disabled}
                      >
                        {multiple && (
                          <span className={styles.checkbox}>
                            {selected && <Check size={16} aria-hidden="true" />}
                          </span>
                        )}
                        <span className={styles.optionLabel}>{option.label}</span>
                      </li>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </ul>
        </div>
      </div>
      , document.body)}
      
      {error && (
        <span 
          id={`${inputId}-error`}
          className={`${styles.helperText} ${styles.errorText}`}
          role="alert"
          aria-live="polite"
        >
          {error}
        </span>
      )}
      
      {!error && helperText && (
        <span 
          id={`${inputId}-helper`}
          className={styles.helperText}
        >
          {helperText}
        </span>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
