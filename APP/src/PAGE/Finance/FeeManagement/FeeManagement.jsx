import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tag } from 'lucide-react';
import { getBranchCode } from '../../../utils/branchCode';
import styles from './FeeManagement.module.css';

import Card from '../../../COMPONENTS/Card/Card';
import Button from '../../../COMPONENTS/Button/Button';

const FeeManagement = () => {
  const { t } = useTranslation();
  const [feeStructures, setFeeStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [showFeeTypesSection, setShowFeeTypesSection] = useState(false);
  const [customFeeTypes, setCustomFeeTypes] = useState([]);

  const branchHeaders = () => ({ 'x-branch-code': getBranchCode() });

  useEffect(() => {
    fetchFeeStructures();
    fetchCustomFeeTypes();
  }, []);

  const fetchFeeStructures = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') {
        setLoading(false);
        return;
      }
      const response = await fetch('/api/simple-fees', {
        headers: { 'Authorization': `Bearer ${token}`, ...branchHeaders() }
      });
      if (response.ok) {
        const data = await response.json();
        setFeeStructures(data.data);
      }
    } catch (error) {
      console.error('Error fetching fee structures:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomFeeTypes = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch('/api/simple-fees', {
        headers: { 'Authorization': `Bearer ${token}`, ...branchHeaders() }
      });
      if (response.ok) {
        const data = await response.json();
        // Extract unique custom fee types
        const customTypes = [];
        data.data.forEach(structure => {
          if (structure.feeType === 'CUSTOM' && structure.customFeeName) {
            const existing = customTypes.find(ct => ct.name === structure.customFeeName);
            if (!existing) {
              customTypes.push({
                id: structure.customFeeName,
                name: structure.customFeeName,
                icon: '💰',
                color: '#00BCD4',
                isCustom: true
              });
            }
          }
        });
        setCustomFeeTypes(customTypes);
      }
    } catch (error) {
      console.error('Error fetching custom fee types:', error);
    }
  };

  // Predefined fee types
  const predefinedTypes = [
    { id: 'TUITION', name: 'Tuition', icon: '📚', color: '#4CAF50' },
    { id: 'TRANSPORT', name: 'Transport', icon: '🚌', color: '#FF9800' },
    { id: 'LIBRARY', name: 'Library', icon: '📖', color: '#2196F3' },
    { id: 'LAB', name: 'Laboratory', icon: '🔬', color: '#9C27B0' },
    { id: 'SPORTS', name: 'Sports', icon: '⚽', color: '#F44336' },
    { id: 'EXAM', name: 'Examination', icon: '📝', color: '#FF5722' },
    { id: 'BOOKS', name: 'Books', icon: '📕', color: '#795548' },
    { id: 'PHONE', name: 'Phone', icon: '📱', color: '#607D8B' },
    { id: 'UNIFORM', name: 'Uniform', icon: '👔', color: '#3F51B5' },
    { id: 'MEALS', name: 'Meals', icon: '🍽️', color: '#FF5722' }
  ];

  const handleDelete = async (id) => {
    if (!confirm('Delete this fee structure?')) return;
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(`/api/simple-fees/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, ...branchHeaders() }
      });
      if (response.ok) {
        fetchFeeStructures();
      } else {
        console.error('Failed to delete:', response.status);
      }
    } catch (error) {
      console.error('Error deleting fee structure:', error);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{t('finance.feeManagement.title', 'Fee Management')}</h1>
          <p>{t('finance.feeManagement.subtitle', 'Configure fee structures and fee types')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant={showFeeTypesSection ? 'primary' : 'secondary'}
            icon={<Tag size={16} />}
            onClick={() => setShowFeeTypesSection(!showFeeTypesSection)}
          >
            {showFeeTypesSection
              ? t('finance.feeManagement.viewStructures', 'View fee structures')
              : t('finance.feeManagement.viewTypes', 'View fee types')}
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setEditingFee(null); setShowModal(true); }}>
            {t('finance.feeManagement.addStructure', 'Add fee structure')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>{t('common.loading', 'Loading...')}</div>
      ) : showFeeTypesSection ? (
        <>
          {/* Fee Types Section */}
          <div className={styles.section}>
            <h2>Predefined Fee Types</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              These are standard fee types available for all fee structures
            </p>
            <div className={styles.grid}>
              {predefinedTypes.map(type => (
                <div key={type.id} className={styles.card} style={{ borderLeft: `4px solid ${type.color}` }}>
                  <div className={styles.cardHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '2rem' }}>{type.icon}</span>
                      <h3>{type.name}</h3>
                    </div>
                    <span className={`${styles.badge} ${styles.active}`}>Built-in</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p><strong>Type ID:</strong> {type.id}</p>
                    <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '8px' }}>
                      This is a standard fee type available for all fee structures
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {customFeeTypes.length > 0 && (
            <div className={styles.section} style={{ marginTop: '40px' }}>
              <h2>Custom Fee Types</h2>
              <p style={{ color: '#666', marginBottom: '20px' }}>
                Custom fee types created for specific needs
              </p>
              <div className={styles.grid}>
                {customFeeTypes.map(type => (
                  <div key={type.id} className={styles.card} style={{ borderLeft: `4px solid ${type.color}` }}>
                    <div className={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '2rem' }}>{type.icon}</span>
                        <h3>{type.name}</h3>
                      </div>
                      <span className={`${styles.badge}`} style={{ backgroundColor: '#00BCD4' }}>Custom</span>
                    </div>
                    <div className={styles.cardBody}>
                      <p><strong>Type ID:</strong> {type.id}</p>
                      <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '8px' }}>
                        Custom fee type created for specific needs
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ 
            marginTop: '30px', 
            padding: '20px', 
            background: '#E3F2FD', 
            borderRadius: '8px',
            border: '1px solid #2196F3'
          }}>
            <p style={{ margin: 0, color: '#1976D2' }}>
              ℹ️ <strong>Note:</strong> Custom fee types are automatically created when you add a fee structure 
              with a custom fee category. You can use any name you want when creating fee structures.
            </p>
          </div>
        </>
      ) : (
        <div className={styles.grid}>
          {feeStructures.length === 0 ? (
            <div className={styles.noData}>No fee structures found</div>
          ) : (
            feeStructures.map(fee => (
              <Card key={fee.id} className={styles.feeCard}>
                <div className={styles.cardHeader}>
                  <h3>{fee.name}</h3>
                  <span className={`${styles.badge} ${fee.isActive ? styles.active : styles.inactive}`}>
                    {fee.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <p><strong>Classes:</strong> {fee.classNames && fee.classNames.length > 0 ? fee.classNames.join(', ') : 'All Classes'}</p>
                  <p><strong>Academic Year:</strong> {fee.academicYear}</p>
                  <p><strong>Term:</strong> {fee.term || 'All Terms'}</p>
                  <p><strong>Amount:</strong> <span className={styles.amount}>${parseFloat(fee.amount).toFixed(2)}</span></p>
                  <p><strong>Type:</strong> {fee.feeType === 'CUSTOM' && fee.customFeeName ? fee.customFeeName : fee.feeType}</p>
                  {fee.isRecurring && <p className={styles.recurring}>🔄 Recurring</p>}
                  {fee.dueDate && <p><strong>Due:</strong> {new Date(fee.dueDate).toLocaleDateString()}</p>}
                </div>
                <div className={styles.cardActions}>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingFee(fee); setShowModal(true); }}>
                    {t('common.edit', 'Edit')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(fee.id)}>
                    {t('common.delete', 'Delete')}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {showModal && (
        <FeeModal 
          fee={editingFee}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchFeeStructures(); fetchCustomFeeTypes(); }}
        />
      )}
    </div>
  );
};

const FeeModal = ({ fee, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: fee?.name || '',
    classNames: fee?.classNames || [],
    academicYear: fee?.academicYear || new Date().getFullYear().toString(),
    term: fee?.term || '',
    amount: fee?.amount || '',
    feeType: fee?.feeType || 'TUITION',
    customFeeName: fee?.customFeeName || '',
    isRecurring: fee?.isRecurring || false,
    dueDate: fee?.dueDate || ''
  });
  const branchHeaders = () => ({ 'x-branch-code': getBranchCode() });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [metadata, setMetadata] = useState({
    classes: [],
    academicYears: [],
    terms: []
  });
  const [loadingMetadata, setLoadingMetadata] = useState(true);

  // Fetch metadata on mount
  useEffect(() => {
    fetchMetadata();
  }, []);

  const fetchMetadata = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch('/api/simple-fees/metadata', {
        headers: { 'Authorization': `Bearer ${token}`, ...branchHeaders() }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMetadata(data.data);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
    } finally {
      setLoadingMetadata(false);
    }
  };

  const handleClassToggle = (className) => {
    setFormData(prev => ({
      ...prev,
      classNames: prev.classNames.includes(className)
        ? prev.classNames.filter(c => c !== className)
        : [...prev.classNames, className]
    }));
  };

  const handleSelectAllClasses = () => {
    setFormData(prev => ({
      ...prev,
      classNames: prev.classNames.length === metadata.classes.length ? [] : [...metadata.classes]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Fee name is required';
    if (formData.classNames.length === 0) newErrors.classes = 'Select at least one class';
    if (!formData.amount || parseFloat(formData.amount) <= 0) newErrors.amount = 'Amount must be greater than 0';
    if (formData.feeType === 'CUSTOM' && !formData.customFeeName.trim()) newErrors.customFeeName = 'Custom fee type name is required';
    if (formData.academicYear && formData.academicYear.length !== 4) newErrors.academicYear = 'Invalid academic year';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const url = fee ? `/api/simple-fees/${fee.id}` : '/api/simple-fees';
      const method = fee ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...branchHeaders()
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(`Fee structure ${fee ? 'updated' : 'created'} successfully!`);
        onSuccess();
      } else {
        setErrors({ api: result.error || 'Operation failed. Please try again.' });
        console.error('Error response:', result);
      }
    } catch (error) {
      console.error('Error:', error);
      setErrors({ api: 'Network error. Please check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  // Fee type benefits
  const feeTypeBenefits = {
    TUITION: '📚 Core educational fees - tracked separately for academic reporting',
    TRANSPORT: '🚌 Transportation costs - helps manage bus routes and schedules',
    LIBRARY: '📖 Library access and book fees - tracks reading program participation',
    LAB: '🔬 Laboratory and practical fees - monitors science program costs',
    SPORTS: '⚽ Sports and athletics fees - supports extracurricular activities',
    EXAM: '📝 Examination fees - separates assessment costs from tuition',
    BOOKS: '📕 Textbook and material fees - tracks educational resource costs',
    PHONE: '📱 Communication and technology fees - manages digital infrastructure',
    UNIFORM: '👔 Uniform and dress code fees - ensures proper student attire',
    MEALS: '🍽️ Meal and cafeteria fees - supports nutrition programs',
    CUSTOM: '💰 Custom fee type - create your own category for specific needs'
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className={styles.modalHeader}>
          <h2>{fee ? 'Edit Fee Structure' : 'Add Fee Structure'}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        {errors.api && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {errors.api}
          </div>
        )}
        
        {loadingMetadata ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>Loading form data...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label>Fee Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Grade 1 Tuition Fee"
                style={errors.name ? { borderColor: '#ef4444' } : {}}
              />
              {errors.name && <span style={{ color: '#ef4444', fontSize: '0.8125rem', marginTop: '0.25rem', display: 'block' }}>{errors.name}</span>}
            </div>

            {/* Multi-select Classes */}
            <div className={styles.formGroup}>
              <label>
                Classes * 
                <button 
                  type="button" 
                  onClick={handleSelectAllClasses}
                  style={{ 
                    marginLeft: '10px', 
                    padding: '4px 8px', 
                    fontSize: '0.85rem',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {formData.classNames.length === metadata.classes.length ? 'Deselect All' : 'Select All'}
                </button>
              </label>
              <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                padding: '10px',
                maxHeight: '150px',
                overflowY: 'auto',
                background: '#f9f9f9'
              }}>
                {metadata.classes.length === 0 ? (
                  <p style={{ color: '#666', margin: 0 }}>No classes found in database</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                    {metadata.classes.map(className => (
                      <label 
                        key={className}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          padding: '6px',
                          background: formData.classNames.includes(className) ? '#e3f2fd' : 'white',
                          border: `1px solid ${formData.classNames.includes(className) ? '#2196F3' : '#ddd'}`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formData.classNames.includes(className)}
                          onChange={() => handleClassToggle(className)}
                        />
                        <span style={{ fontSize: '0.9rem' }}>{className}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
                Selected: {formData.classNames.length} class(es)
              </small>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Academic Year *</label>
                <select
                  required
                  value={formData.academicYear}
                  onChange={(e) => setFormData({...formData, academicYear: e.target.value})}
                >
                  {metadata.academicYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Term</label>
                <select
                  value={formData.term}
                  onChange={(e) => setFormData({...formData, term: e.target.value})}
                >
                  <option value="">All Terms</option>
                  {metadata.terms.map(term => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Amount *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                placeholder="0.00"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Fee Type *</label>
              <select
                required
                value={formData.feeType}
                onChange={(e) => setFormData({...formData, feeType: e.target.value})}
              >
                <option value="TUITION">Tuition</option>
                <option value="TRANSPORT">Transport</option>
                <option value="LIBRARY">Library</option>
                <option value="LAB">Laboratory</option>
                <option value="SPORTS">Sports</option>
                <option value="EXAM">Examination</option>
                <option value="BOOKS">Books</option>
                <option value="PHONE">Phone</option>
                <option value="UNIFORM">Uniform</option>
                <option value="MEALS">Meals</option>
                <option value="CUSTOM">Custom/Other</option>
              </select>
              {formData.feeType && (
                <div style={{ 
                  marginTop: '8px', 
                  padding: '10px', 
                  background: '#f0f7ff', 
                  borderLeft: '3px solid #2196F3',
                  borderRadius: '4px',
                  fontSize: '0.9rem'
                }}>
                  <strong>Benefit:</strong> {feeTypeBenefits[formData.feeType]}
                </div>
              )}
            </div>

            {formData.feeType === 'CUSTOM' && (
              <div className={styles.formGroup}>
                <label>Custom Fee Name *</label>
                <input
                  type="text"
                  required
                  value={formData.customFeeName || ''}
                  onChange={(e) => setFormData({...formData, customFeeName: e.target.value})}
                  placeholder="Enter custom fee name"
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label>Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
              />
            </div>

            <div className={styles.checkboxGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={formData.isRecurring}
                  onChange={(e) => setFormData({...formData, isRecurring: e.target.checked})}
                />
                <span>Recurring Fee (charged every term/year)</span>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
              <button type="submit" disabled={loading || formData.classNames.length === 0} className={styles.submitButton}>
                {loading ? 'Saving...' : 'Save Fee Structure'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeeManagement;
