// EditStaff.jsx - Edit Staff Component
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiArrowLeft, FiSave, FiX } from 'react-icons/fi';
import styles from './EditStaff.module.css';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const EditStaff = () => {
  const { staffType, className, uniqueId } = useParams();
  const navigate = useNavigate();
  const [staffData, setStaffData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [formData, setFormData] = useState({});
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    loadStaffData();
    fetchColumns();
  }, []);

  const loadStaffData = () => {
    const savedData = sessionStorage.getItem('editStaffData');
    if (savedData) {
      const data = JSON.parse(savedData);
      setStaffData(data);
      setFormData(data);
      setLoading(false);
    } else {
      setMessage('Staff data not found. Redirecting...');
      setMessageType('error');
      setTimeout(() => navigate('/list-staff'), 2000);
    }
  };

  const fetchColumns = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/staff/columns/${encodeURIComponent(staffType)}/${encodeURIComponent(className)}`
      );
      setColumns(response.data);
    } catch (error) {
      console.error('Error fetching columns:', error);
      setMessage('Error loading form structure');
      setMessageType('error');
    }
  };

  const handleInputChange = (fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) {
        setMessage('File size too large. Max 30MB.');
        setMessageType('error');
        return;
      }
      setFiles(prev => ({ ...prev, [fieldName]: file }));
      setMessage(`File "${file.name}" selected`);
      setMessageType('success');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const formDataToSend = new FormData();
    formDataToSend.append('staffType', staffType);
    formDataToSend.append('class', className);

    // Add all form data
    Object.keys(formData).forEach(key => {
      if (formData[key] !== null && formData[key] !== undefined) {
        if (Array.isArray(formData[key])) {
          formDataToSend.append(key, JSON.stringify(formData[key]));
        } else {
          formDataToSend.append(key, formData[key]);
        }
      }
    });

    // Add new files
    Object.keys(files).forEach(key => {
      if (files[key]) {
        formDataToSend.append(key, files[key]);
      }
    });

    try {
      const response = await axios.put(
        `${API_BASE_URL}/staff/update/${staffData.global_staff_id || staffData.id}`,
        formDataToSend,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setMessage('✅ Staff updated successfully!');
      setMessageType('success');
      
      // Clear session storage
      sessionStorage.removeItem('editStaffData');
      
      // Redirect after 2 seconds
      setTimeout(() => navigate('/list-staff'), 2000);
    } catch (error) {
      console.error('Error updating staff:', error);
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const formatFieldLabel = (fieldName) => {
    return fieldName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const renderField = (col) => {
    const fieldName = col.column_name;
    const value = formData[fieldName] || '';
    const isRequired = col.is_nullable === 'NO';

    // Skip system fields
    if (['id', 'global_staff_id', 'staff_id', 'uniqueId', 'className'].includes(fieldName)) {
      return null;
    }

    // File upload fields - check by data_type or field name
    if (col.data_type === 'upload' || col.data_type === 'file' || 
        fieldName === 'image_staff' || fieldName === 'degree' || 
        fieldName.includes('document') || fieldName.includes('certificate')) {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <label>{formatFieldLabel(fieldName)} {isRequired && <span className={styles.required}>*</span>}</label>
          <div className={styles.fileSection}>
            {value && !files[fieldName] && (
              <div className={styles.currentFile}>
                <span>📄 Current file: {typeof value === 'string' ? value.split('/').pop() : 'Uploaded'}</span>
                {typeof value === 'string' && value.startsWith('http') && (
                  <a href={value} target="_blank" rel="noopener noreferrer" className={styles.viewLink}>
                    View File
                  </a>
                )}
              </div>
            )}
            <input
              type="file"
              onChange={(e) => handleFileChange(e, fieldName)}
              className={styles.fileInput}
              accept={fieldName === 'image_staff' ? 'image/*' : '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx'}
            />
            {files[fieldName] && (
              <div className={styles.newFile}>
                ✅ New file selected: {files[fieldName].name}
              </div>
            )}
            <small className={styles.fileHint}>
              {fieldName === 'image_staff' 
                ? 'Images only (JPEG, PNG) - Max 30MB' 
                : 'Documents (PDF, Word, Excel, Images) - Max 30MB'}
            </small>
          </div>
        </div>
      );
    }

    // Checkbox
    if (col.data_type === 'checkbox' || col.data_type === 'boolean') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handleInputChange(fieldName, e.target.checked)}
            />
            {formatFieldLabel(fieldName)}
          </label>
        </div>
      );
    }

    // Select dropdown
    if (col.data_type === 'select' && col.options) {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <label>{formatFieldLabel(fieldName)}</label>
          <select
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
            className={styles.select}
          >
            <option value="">Select {formatFieldLabel(fieldName)}</option>
            {col.options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    // Textarea
    if (col.data_type === 'textarea') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <label>{formatFieldLabel(fieldName)}</label>
          <textarea
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
            className={styles.textarea}
            rows={4}
          />
        </div>
      );
    }

    // Number
    if (col.data_type === 'integer' || col.data_type === 'numeric') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <label>{formatFieldLabel(fieldName)}</label>
          <input
            type="number"
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
            className={styles.input}
          />
        </div>
      );
    }

    // Date
    if (col.data_type === 'date') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <label>{formatFieldLabel(fieldName)}</label>
          <input
            type="date"
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
            className={styles.input}
          />
        </div>
      );
    }

    // Default text input
    return (
      <div key={fieldName} className={styles.fieldGroup}>
        <label>{formatFieldLabel(fieldName)}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(fieldName, e.target.value)}
          className={styles.input}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading staff data...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/list-staff')} className={styles.backBtn}>
          <FiArrowLeft /> Back to List
        </button>
        <h1>Edit Staff Member</h1>
        <div className={styles.staffInfo}>
          <span>{staffData?.full_name || staffData?.name}</span>
          <span className={styles.badge}>{staffType}</span>
        </div>
      </div>

      {message && (
        <div className={`${styles.message} ${styles[messageType]}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGrid}>
          {columns.map(col => renderField(col))}
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            onClick={() => navigate('/list-staff')}
            className={styles.cancelBtn}
            disabled={saving}
          >
            <FiX /> Cancel
          </button>
          <button
            type="submit"
            className={styles.saveBtn}
            disabled={saving}
          >
            <FiSave /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditStaff;
