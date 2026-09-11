// StaffFormBuilder.jsx - COMPLETELY UPDATED WITH FIELD NAME VALIDATION AND TRANSLATIONS
import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useLanguageSelection } from '../../../context/LanguageSelectionContext';

// Icon Components
const PlusIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const TrashIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"></path>
  </svg>
);

const StaffFormBuilder = ({ onSuccess }) => {
  const { selectedLanguages, getLanguageName, getLanguageNativeName } = useLanguageSelection();
  const [staffType, setStaffType] = useState('');
  const [className, setClassName] = useState('');
  const [customFields, setCustomFields] = useState([]);
  const [newField, setNewField] = useState({ 
    name: '', 
    type: 'text', 
    required: false,
    options: [],
    translations: {} // { langCode: { label: '', options: [] } }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [optionCount, setOptionCount] = useState(2);
  const [tempOptions, setTempOptions] = useState(['', '']);

  const staffTypes = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
  
  // Field types with clear distinction
  const fieldTypes = [
    'text', 'number', 'date', 'checkbox', 
    'select',        // Single select dropdown
    'multiple-checkbox', // Multiple selection checkboxes
    'textarea', 'upload'
  ];

  // PostgreSQL reserved keywords
  const reservedKeywords = [
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 
    'authorization', 'binary', 'both', 'case', 'cast', 'check', 'collate', 'column', 
    'concurrently', 'constraint', 'create', 'cross', 'current_catalog', 'current_date', 
    'current_role', 'current_schema', 'current_time', 'current_timestamp', 'current_user', 
    'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 
    'fetch', 'for', 'foreign', 'from', 'grant', 'group', 'having', 'in', 'initially', 
    'intersect', 'into', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime', 
    'localtimestamp', 'natural', 'not', 'null', 'offset', 'on', 'only', 'or', 'order', 
    'using', 'verbose', 'when', 'where', 'window', 'with'
  ];

  // Field name validation
  const validateFieldName = (fieldName) => {
    if (!fieldName.trim()) {
      return 'Field name is required.';
    }

    // Check if field name starts with letter or underscore
    if (!/^[a-zA-Z_]/.test(fieldName)) {
      return 'Field name must start with a letter or underscore.';
    }

    // Check if field name contains only valid characters
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
      return 'Field name can only contain letters, numbers, and underscores.';
    }

    // Check if field name is a reserved keyword
    if (reservedKeywords.includes(fieldName.toLowerCase())) {
      return `"${fieldName}" is a PostgreSQL reserved keyword. Please choose a different name.`;
    }

    // Check if field name is too short
    if (fieldName.length < 2) {
      return 'Field name must be at least 2 characters long.';
    }

    return null;
  };

  // Handle adding new field
  const handleAddField = () => {
    const validationError = validateFieldName(newField.name);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const sanitizedName = newField.name.toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');

    if (sanitizedName.length === 0) {
      setErrorMessage('Field name is invalid after sanitization.');
      return;
    }

    if (customFields.some(field => field.name === sanitizedName)) {
      setErrorMessage(`Field name "${newField.name}" already exists.`);
      return;
    }

    // Validate options for select and multiple-checkbox
    if ((newField.type === 'select' || newField.type === 'multiple-checkbox') && 
        tempOptions.filter(opt => opt.trim() !== '').length === 0) {
      setErrorMessage('Please add at least one option for select/multiple-checkbox fields.');
      return;
    }

    // Validate translations for selected languages
    for (const langCode of selectedLanguages) {
      if (!newField.translations[langCode]?.label?.trim()) {
        setErrorMessage(`Please provide a label translation for ${getLanguageName(langCode)}`);
        return;
      }
      // Validate option translations for select fields
      if ((newField.type === 'select' || newField.type === 'multiple-checkbox') && tempOptions.filter(opt => opt.trim() !== '').length > 0) {
        const langOptions = newField.translations[langCode]?.options || [];
        const validOptions = tempOptions.filter(opt => opt.trim() !== '');
        if (langOptions.length !== validOptions.length || langOptions.some(opt => !opt.trim())) {
          setErrorMessage(`Please provide all option translations for ${getLanguageName(langCode)}`);
          return;
        }
      }
    }

    const fieldToAdd = { 
      ...newField, 
      name: sanitizedName,
      options: (newField.type === 'select' || newField.type === 'multiple-checkbox') 
        ? tempOptions.filter(opt => opt.trim() !== '') 
        : [],
      translations: { ...newField.translations }
    };

    setCustomFields([...customFields, fieldToAdd]);
    setNewField({ name: '', type: 'text', required: false, options: [], translations: {} });
    setTempOptions(['', '']);
    setOptionCount(2);
    setErrorMessage('');
  };

  // Handle translation label change
  const handleTranslationLabelChange = (langCode, value) => {
    setNewField(prev => ({
      ...prev,
      translations: {
        ...prev.translations,
        [langCode]: {
          ...prev.translations[langCode],
          label: value
        }
      }
    }));
  };

  // Handle translation option change
  const handleTranslationOptionChange = (langCode, optionIndex, value) => {
    setNewField(prev => {
      const currentOptions = prev.translations[langCode]?.options || [];
      const newOptions = [...currentOptions];
      newOptions[optionIndex] = value;
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [langCode]: {
            ...prev.translations[langCode],
            options: newOptions
          }
        }
      };
    });
  };

  // Handle removing field
  const handleRemoveField = (index) => {
    const newFields = customFields.filter((_, i) => i !== index);
    setCustomFields(newFields);
  };

  // Handle option count change
  const handleOptionCountChange = (count) => {
    const newCount = Math.max(1, Math.min(10, count));
    setOptionCount(newCount);
    
    const newOptions = [...tempOptions];
    if (newCount > tempOptions.length) {
      while (newOptions.length < newCount) newOptions.push('');
    } else {
      newOptions.length = newCount;
    }
    setTempOptions(newOptions);
  };

  // Handle option value change
  const handleOptionChange = (index, value) => {
    const newOptions = [...tempOptions];
    newOptions[index] = value;
    setTempOptions(newOptions);
  };

  // Handle field type change
  const handleFieldTypeChange = (type) => {
    setNewField({ ...newField, type });
    // Reset options when switching between field types
    if (type !== 'select' && type !== 'multiple-checkbox') {
      setTempOptions(['', '']);
      setOptionCount(2);
    }
  };

  // Handle form creation
  const handleCreateForm = async () => {
    if (!staffType || !className) {
      setErrorMessage('Please select staff type and enter form name');
      return;
    }

    // Validate all field names again before submission
    for (const field of customFields) {
      const validationError = validateFieldName(field.name);
      if (validationError) {
        setErrorMessage(`Validation error for field "${field.name}": ${validationError}`);
        return;
      }
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        staffType,
        className,
        customFields
      };

      console.log('Creating form with payload:', payload);

      await axios.post('/api/staff/create-form', payload, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      setStaffType('');
      setClassName('');
      setCustomFields([]);
      setErrorMessage('🎉 Form created successfully!');
      
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      const serverError = err.response?.data?.error || 'An unexpected error occurred.';
      setErrorMessage(`❌ ${serverError}`);
      console.error('Create form error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Get field type display name
  const getFieldTypeDisplay = (type) => {
    const typeMap = {
      'text': 'Text Input',
      'number': 'Number Input',
      'date': 'Date Picker',
      'checkbox': 'Checkbox',
      'select': 'Dropdown Select',
      'multiple-checkbox': 'Multiple Checkboxes',
      'textarea': 'Text Area',
      'upload': 'File Upload'
    };
    return typeMap[type] || type;
  };

  // Styles
  const styles = {
    container: {
      maxWidth: '900px',
      margin: '0 auto',
      padding: '2rem',
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
      fontFamily: 'Segoe UI, system-ui, sans-serif'
    },
    section: {
      marginBottom: '2rem',
      borderBottom: '1px solid #e9ecef',
      paddingBottom: '1.5rem'
    },
    title: {
      textAlign: 'center',
      color: '#2c3e50',
      marginBottom: '2rem',
      fontSize: '2.5rem',
      fontWeight: '700'
    },
    subtitle: {
      color: '#495057',
      marginBottom: '1rem',
      fontSize: '1.25rem',
      fontWeight: '600'
    },
    input: {
      width: '100%',
      padding: '14px',
      margin: '8px 0',
      border: '2px solid #e9ecef',
      borderRadius: '12px',
      boxSizing: 'border-box',
      fontSize: '16px',
      transition: 'all 0.3s ease',
      backgroundColor: '#f8f9fa'
    },
    select: {
      width: '100%',
      padding: '14px',
      margin: '8px 0',
      border: '2px solid #e9ecef',
      borderRadius: '12px',
      boxSizing: 'border-box',
      backgroundColor: '#f8f9fa',
      fontSize: '16px',
      cursor: 'pointer'
    },
    fieldInput: {
      display: 'flex',
      gap: '15px',
      alignItems: 'center',
      marginBottom: '15px',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      borderRadius: '12px',
      border: '2px solid #e9ecef',
      flexWrap: 'wrap'
    },
    readOnlyInput: {
      backgroundColor: '#e9ecef',
      flex: '2',
      minWidth: '200px',
      color: '#495057'
    },
    fieldMeta: {
      fontSize: '0.8rem',
      color: '#6c757d',
      flexShrink: '0',
      minWidth: '120px',
      textAlign: 'center',
      fontWeight: '600',
      padding: '8px 12px',
      backgroundColor: 'white',
      borderRadius: '8px',
      border: '1px solid #dee2e6'
    },
    checkboxLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '0.95rem',
      flexShrink: '0',
      fontWeight: '500',
      color: '#495057'
    },
    button: {
      backgroundColor: '#007bff',
      color: 'white',
      padding: '14px 24px',
      border: 'none',
      borderRadius: '12px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '16px',
      fontWeight: '600',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 12px rgba(0, 123, 255, 0.3)'
    },
    deleteButton: {
      backgroundColor: '#dc3545',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      padding: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      transition: 'all 0.3s ease'
    },
    errorMessage: {
      color: '#dc3545',
      marginTop: '1rem',
      padding: '16px',
      backgroundColor: '#f8d7da',
      border: '2px solid #f5c6cb',
      borderRadius: '12px',
      textAlign: 'center',
      fontWeight: '600',
      fontSize: '16px'
    },
    successMessage: {
      color: '#155724',
      marginTop: '1rem',
      padding: '16px',
      backgroundColor: '#d4edda',
      border: '2px solid #c3e6cb',
      borderRadius: '12px',
      textAlign: 'center',
      fontWeight: '600',
      fontSize: '16px'
    },
    optionSection: {
      marginTop: '20px',
      padding: '20px',
      backgroundColor: '#e7f3ff',
      borderRadius: '12px',
      border: '2px solid #b3d9ff'
    },
    optionInput: {
      width: '100%',
      padding: '12px',
      margin: '6px 0',
      border: '2px solid #ced4da',
      borderRadius: '8px',
      fontSize: '15px',
      backgroundColor: 'white'
    },
    optionGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '12px',
      marginTop: '12px'
    },
    fieldCounter: {
      backgroundColor: '#007bff',
      color: 'white',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '0.8rem',
      fontWeight: '600',
      marginLeft: '10px'
    },
    optionTypeInfo: {
      padding: '12px',
      backgroundColor: '#fff3cd',
      border: '2px solid #ffeaa7',
      borderRadius: '8px',
      marginBottom: '15px',
      fontSize: '14px',
      color: '#856404',
      fontWeight: '500'
    },
    uploadInfo: {
      padding: '12px',
      backgroundColor: '#d1ecf1',
      border: '2px solid #bee5eb',
      borderRadius: '8px',
      marginTop: '10px',
      fontSize: '14px',
      color: '#0c5460',
      fontWeight: '500'
    },
    validationHint: {
      fontSize: '0.8rem',
      color: '#6c757d',
      marginTop: '5px',
      fontStyle: 'italic'
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      style={styles.container}
    >
      <h1 style={styles.title}>Staff Form Builder</h1>
      
      {/* Staff Type Selection */}
      <div style={styles.section}>
        <h3 style={styles.subtitle}>1. Select Staff Type</h3>
        <select
          value={staffType}
          onChange={(e) => { setStaffType(e.target.value); setErrorMessage(''); }}
          style={styles.select}
          disabled={isLoading}
        >
          <option value="">Select Staff Type</option>
          {staffTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* Form Name */}
      <div style={styles.section}>
        <h3 style={styles.subtitle}>2. Enter Form Name</h3>
        <input
          type="text"
          value={className}
          onChange={(e) => { setClassName(e.target.value); setErrorMessage(''); }}
          placeholder="Form Name (e.g., Senior Teachers)"
          style={styles.input}
          disabled={isLoading}
        />
      </div>

      {/* Custom Fields Section */}
      <div style={styles.section}>
        <h3 style={styles.subtitle}>
          3. Define Custom Fields 
          <span style={styles.fieldCounter}>{customFields.length} fields</span>
        </h3>
        
        {/* Field Name Guidelines */}
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '2px solid #b3d9ff'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#0056b3' }}>Field Name Guidelines:</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#495057' }}>
            <li>Must start with a letter or underscore</li>
            <li>Can only contain letters, numbers, and underscores</li>
            <li>Avoid PostgreSQL reserved keywords (e.g., "as", "select", "where")</li>
            <li>At least 2 characters long</li>
          </ul>
        </div>
        
        {/* Existing Fields List */}
        {customFields.map((field, index) => (
          <motion.div 
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={styles.fieldInput}
          >
            <input
              type="text"
              value={field.name}
              readOnly
              style={{ ...styles.input, ...styles.readOnlyInput }}
              title={`Database Column: ${field.name}`}
            />
            <span style={styles.fieldMeta}>
              {getFieldTypeDisplay(field.type)}
              {field.options.length > 0 && ` (${field.options.length} options)`}
              <br />
              {field.required ? 'REQUIRED' : 'OPTIONAL'}
            </span>
            <button 
              onClick={() => handleRemoveField(index)} 
              disabled={isLoading} 
              style={styles.deleteButton}
              title="Remove field"
            >
              <TrashIcon size={18} />
            </button>
          </motion.div>
        ))}

        {/* Add New Field Form */}
        <motion.div 
          style={styles.fieldInput}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={{ flex: '2', minWidth: '200px' }}>
            <input
              type="text"
              value={newField.name}
              onChange={(e) => setNewField({...newField, name: e.target.value})}
              placeholder="Field name (e.g., highest_degree)"
              style={styles.input}
              disabled={isLoading}
            />
            <div style={styles.validationHint}>
              Examples: highest_degree, years_experience, department_name
            </div>
          </div>
          
          <select
            value={newField.type}
            onChange={(e) => handleFieldTypeChange(e.target.value)}
            style={{ ...styles.select, flex: '1' }}
            disabled={isLoading}
          >
            {fieldTypes.map(type => (
              <option key={type} value={type}>
                {getFieldTypeDisplay(type)}
              </option>
            ))}
          </select>
          
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={newField.required}
              onChange={(e) => setNewField({...newField, required: e.target.checked})}
              disabled={isLoading}
            />
            Required
          </label>
          
          <button 
            onClick={handleAddField} 
            disabled={isLoading || !newField.name} 
            style={{
              ...styles.button, 
              backgroundColor: '#007bff',
              opacity: (!newField.name || isLoading) ? 0.6 : 1
            }}
          >
            <PlusIcon size={18} /> Add Field
          </button>
        </motion.div>

        {/* Upload Field Info */}
        {newField.type === 'upload' && (
          <motion.div 
            style={styles.uploadInfo}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <strong>📎 File Upload Field</strong>
            <br />
            This field will allow file uploads. Users will be able to upload documents, images, or other files.
            File size limit: 5MB per file.
          </motion.div>
        )}

        {/* Options Section for Select/Multiple Checkbox */}
        {(newField.type === 'select' || newField.type === 'multiple-checkbox') && (
          <motion.div 
            style={styles.optionSection}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <div style={styles.optionTypeInfo}>
              <strong>
                {newField.type === 'select' ? '🔽 Dropdown Select' : '☑️ Multiple Checkboxes'}
              </strong>
              <br />
              {newField.type === 'select' 
                ? 'Users can select only ONE option from the dropdown'
                : 'Users can select MULTIPLE options using checkboxes'
              }
            </div>

            <h4 style={{ marginBottom: '1rem', color: '#155724', fontSize: '1.1rem' }}>
              Define Options for {newField.type === 'select' ? 'Dropdown' : 'Checkboxes'}
            </h4>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#495057' }}>
                Number of Options:
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={optionCount}
                onChange={(e) => handleOptionCountChange(parseInt(e.target.value))}
                style={{ ...styles.input, width: '120px' }}
              />
            </div>

            <div style={styles.optionGrid}>
              {tempOptions.map((option, index) => (
                <div key={index} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    style={styles.optionInput}
                  />
                  {option.trim() && (
                    <span style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#28a745',
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </span>
                  )}
                </div>
              ))}
            </div>

            {tempOptions.filter(opt => opt.trim() !== '').length > 0 && (
              <div style={{
                marginTop: '15px',
                padding: '12px',
                backgroundColor: '#d4edda',
                border: '2px solid #c3e6cb',
                borderRadius: '8px',
                color: '#155724',
                fontWeight: '500'
              }}>
                ✅ {tempOptions.filter(opt => opt.trim() !== '').length} option(s) defined
              </div>
            )}
          </motion.div>
        )}

        {/* Translation Section */}
        {selectedLanguages.length > 0 && newField.name && (
          <motion.div 
            style={{
              marginTop: '20px',
              padding: '20px',
              background: 'linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)',
              borderRadius: '12px',
              border: '2px solid #90caf9'
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#1565c0', margin: '0 0 16px 0' }}>
              🌐 Translations
            </h4>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '16px' }}>
              Provide translations for the selected languages. English label is the field name above.
            </p>
            {selectedLanguages.map(langCode => (
              <div key={langCode} style={{
                background: 'white',
                borderRadius: '10px',
                padding: '1.25rem',
                marginBottom: '1rem',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '1rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #e0e0e0'
                }}>
                  <span style={{
                    background: 'linear-gradient(135deg, #1976d2, #42a5f5)',
                    color: 'white',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}>{getLanguageName(langCode)}</span>
                  <span style={{ color: '#666', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    {getLanguageNativeName(langCode)}
                  </span>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#495057' }}>
                    Label in {getLanguageName(langCode)}:
                  </label>
                  <input 
                    type="text"
                    value={newField.translations[langCode]?.label || ''} 
                    onChange={(e) => handleTranslationLabelChange(langCode, e.target.value)} 
                    style={styles.input}
                    placeholder={`e.g., ${newField.name || 'Field label'} in ${getLanguageName(langCode)}`}
                  />
                </div>
                {/* Option translations for select fields */}
                {(newField.type === 'select' || newField.type === 'multiple-checkbox') && tempOptions.filter(opt => opt.trim() !== '').length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #e0e0e0' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#495057' }}>
                      Options in {getLanguageName(langCode)}:
                    </label>
                    {tempOptions.map((opt, i) => opt.trim() && (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                        <span style={{
                          minWidth: '120px',
                          padding: '8px 12px',
                          background: '#f5f5f5',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          color: '#555',
                          border: '1px solid #e0e0e0'
                        }}>{opt}</span>
                        <span style={{ margin: '0 8px' }}>→</span>
                        <input 
                          type="text"
                          value={newField.translations[langCode]?.options?.[i] || ''} 
                          onChange={(e) => handleTranslationOptionChange(langCode, i, e.target.value)} 
                          style={{ ...styles.input, flex: 1 }}
                          placeholder={`Translation for "${opt}"`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* No Languages Selected Info */}
        {selectedLanguages.length === 0 && newField.name && (
          <div style={{
            background: '#fff3e0',
            border: '1px solid #ffcc80',
            borderRadius: '10px',
            padding: '1rem',
            marginTop: '1rem',
            textAlign: 'center',
            color: '#e65100'
          }}>
            <strong>💡 Tip:</strong> You can add additional languages in Task 1 (School Year Setup) to provide translations for field labels.
          </div>
        )}
      </div>

      {/* Create Form Button */}
      <motion.button 
        onClick={handleCreateForm} 
        disabled={isLoading || !staffType || !className} 
        style={{
          ...styles.button, 
          backgroundColor: isLoading ? '#6c757d' : '#28a745',
          width: '100%',
          justifyContent: 'center',
          fontSize: '18px',
          padding: '18px',
          opacity: (isLoading || !staffType || !className) ? 0.6 : 1
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {isLoading ? '🔄 Creating Form...' : '🚀 Create Staff Form'}
      </motion.button>
      
      {/* Error Message */}
      {errorMessage && (
        <motion.div 
          style={errorMessage.includes('✅') || errorMessage.includes('🎉') ? styles.successMessage : styles.errorMessage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {errorMessage}
        </motion.div>
      )}
    </motion.div>
  );
};

export default StaffFormBuilder;