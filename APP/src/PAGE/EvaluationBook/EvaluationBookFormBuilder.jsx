import React, { useState, useEffect, useCallback } from 'react';
import { motion, Reorder } from 'framer-motion';
import { FiPlus, FiTrash2, FiSave, FiX, FiEdit2, FiList, 
  FiType, FiStar, FiAlignLeft, FiMove, FiCheck, FiAlertCircle,
  FiChevronDown, FiCheckSquare, FiCalendar, FiUpload, FiHash, FiBarChart2 } from 'react-icons/fi';
import styles from './EvaluationBookFormBuilder.module.css';
import EvaluationBookReports from './EvaluationBookReports';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: FiType },
  { value: 'number', label: 'Number', icon: FiHash },
  { value: 'textarea', label: 'Text Area', icon: FiAlignLeft },
  { value: 'rating', label: 'Rating Scale', icon: FiStar },
  { value: 'select', label: 'Dropdown', icon: FiChevronDown },
  { value: 'multi-select', label: 'Multi-Select', icon: FiCheckSquare },
  { value: 'checkbox', label: 'Checkbox', icon: FiCheckSquare },
  { value: 'date', label: 'Date', icon: FiCalendar },
  { value: 'upload', label: 'File Upload', icon: FiUpload }
];

const EvaluationBookFormBuilder = () => {
  const [templates, setTemplates] = useState([]);
  const [currentView, setCurrentView] = useState('list'); // 'list' | 'create' | 'edit'
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReports, setShowReports] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    template_name: '',
    description: '',
    is_active: true,
    fields: [{ field_name: '', field_type: 'text', is_guardian_field: false, max_rating: 5, required: true, options: [] }]
  });

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/templates`);
      if (!res.ok) throw new Error('Failed to fetch templates');
      setTemplates(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'list') fetchTemplates();
  }, [currentView, fetchTemplates]);

  const resetForm = () => {
    setFormData({
      template_name: '',
      description: '',
      is_active: true,
      fields: [{ field_name: '', field_type: 'text', is_guardian_field: false, max_rating: 5, required: true, options: [] }]
    });
    setEditingTemplate(null);
    setError('');
    setSuccess('');
  };

  const handleCreateNew = () => {
    resetForm();
    setCurrentView('create');
  };


  const handleEdit = async (template) => {
    try {
      const res = await fetch(`${API_BASE}/templates/${template.id}`);
      if (!res.ok) throw new Error('Failed to fetch template');
      const data = await res.json();
      setFormData({
        template_name: data.template_name,
        description: data.description || '',
        is_active: data.is_active,
        fields: data.fields.length > 0 ? data.fields.map(f => ({ ...f, options: f.options || [] })) : [{ field_name: '', field_type: 'text', is_guardian_field: false, max_rating: 5, required: true, options: [] }]
      });
      setEditingTemplate(data);
      setCurrentView('edit');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      const res = await fetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete template');
      setSuccess('Template deleted successfully');
      fetchTemplates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.template_name.trim()) {
      setError('Template name is required');
      return;
    }
    if (formData.fields.some(f => !f.field_name.trim())) {
      setError('All fields must have a name');
      return;
    }

    try {
      setLoading(true);
      const url = editingTemplate 
        ? `${API_BASE}/templates/${editingTemplate.id}` 
        : `${API_BASE}/templates`;
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          created_by: 1 // TODO: Get from auth context
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setSuccess(editingTemplate ? 'Template updated successfully' : 'Template created successfully');
      setTimeout(() => {
        setCurrentView('list');
        resetForm();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (index, key, value) => {
    const newFields = [...formData.fields];
    newFields[index] = { ...newFields[index], [key]: value };
    setFormData(prev => ({ ...prev, fields: newFields }));
  };

  const addField = () => {
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, { field_name: '', field_type: 'text', is_guardian_field: false, max_rating: 5, required: true, options: [] }]
    }));
  };

  const handleAddOption = (fieldIndex) => {
    const newFields = [...formData.fields];
    newFields[fieldIndex].options = [...(newFields[fieldIndex].options || []), ''];
    setFormData(prev => ({ ...prev, fields: newFields }));
  };

  const handleOptionChange = (fieldIndex, optionIndex, value) => {
    const newFields = [...formData.fields];
    newFields[fieldIndex].options[optionIndex] = value;
    setFormData(prev => ({ ...prev, fields: newFields }));
  };

  const handleRemoveOption = (fieldIndex, optionIndex) => {
    const newFields = [...formData.fields];
    newFields[fieldIndex].options = newFields[fieldIndex].options.filter((_, i) => i !== optionIndex);
    setFormData(prev => ({ ...prev, fields: newFields }));
  };

  const removeField = (index) => {
    if (formData.fields.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  const handleReorder = (newOrder) => {
    setFormData(prev => ({ ...prev, fields: newOrder }));
  };


  // List View
  if (currentView === 'list') {
    if (showReports) {
      return (
        <div className={styles.container}>
          <div className={styles.header}>
            <div>
              <h2>Evaluation Reports</h2>
              <p>View evaluation response reports and analytics</p>
            </div>
            <button onClick={() => setShowReports(false)} className={styles.backButton}>
              <FiBarChart2 /> Back to Templates
            </button>
          </div>
          <EvaluationBookReports />
        </div>
      );
    }
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h2>Evaluation Book Templates</h2>
            <p>Create and manage evaluation form templates for daily student assessments</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowReports(true)} className={styles.createButton} style={{ background: '#6366f1' }}>
              <FiBarChart2 /> View Reports
            </button>
            <button onClick={handleCreateNew} className={styles.createButton}>
              <FiPlus /> Create Template
            </button>
          </div>
        </div>

        {error && <div className={styles.error}><FiAlertCircle /> {error}</div>}
        {success && <div className={styles.success}><FiCheck /> {success}</div>}

        {loading ? (
          <div className={styles.loading}>Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className={styles.empty}>
            <FiList size={48} />
            <h3>No templates yet</h3>
            <p>Create your first evaluation template to get started</p>
          </div>
        ) : (
          <div className={styles.templateGrid}>
            {templates.map(template => (
              <motion.div 
                key={template.id} 
                className={styles.templateCard}
                whileHover={{ y: -4 }}
              >
                <div className={styles.cardHeader}>
                  <h3>{template.template_name}</h3>
                  <span className={`${styles.badge} ${template.is_active ? styles.active : styles.inactive}`}>
                    {template.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {template.description && <p className={styles.description}>{template.description}</p>}
                <div className={styles.cardMeta}>
                  <span>{template.field_count || 0} fields</span>
                  <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.cardActions}>
                  <button onClick={() => handleEdit(template)} title="Edit">
                    <FiEdit2 /> Edit
                  </button>
                  <button onClick={() => handleDelete(template.id)} className={styles.deleteBtn} title="Delete">
                    <FiTrash2 /> Delete
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Create/Edit View
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>{editingTemplate ? 'Edit Template' : 'Create New Template'}</h2>
          <p>Define the fields for your evaluation form</p>
        </div>
        <button onClick={() => { setCurrentView('list'); resetForm(); }} className={styles.backButton}>
          <FiX /> Cancel
        </button>
      </div>

      {error && <div className={styles.error}><FiAlertCircle /> {error}</div>}
      {success && <div className={styles.success}><FiCheck /> {success}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formSection}>
          <h3>Template Details</h3>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Template Name *</label>
              <input
                type="text"
                value={formData.template_name}
                onChange={(e) => setFormData(prev => ({ ...prev, template_name: e.target.value }))}
                placeholder="e.g., Daily Student Evaluation"
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this template"
              />
            </div>
            <div className={styles.formGroupCheckbox}>
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                Active Template
              </label>
            </div>
          </div>
        </div>


        <div className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <h3>Form Fields</h3>
            <button type="button" onClick={addField} className={styles.addFieldBtn}>
              <FiPlus /> Add Field
            </button>
          </div>

          <Reorder.Group axis="y" values={formData.fields} onReorder={handleReorder} className={styles.fieldsList}>
            {formData.fields.map((field, index) => (
              <Reorder.Item key={index} value={field} className={styles.fieldItem}>
                <div className={styles.fieldDrag}>
                  <FiMove />
                </div>
                <div className={styles.fieldContent}>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldInput}>
                      <label>Field Name *</label>
                      <input
                        type="text"
                        value={field.field_name}
                        onChange={(e) => handleFieldChange(index, 'field_name', e.target.value)}
                        placeholder="e.g., Behavior, Homework, Participation"
                        required
                      />
                    </div>
                    <div className={styles.fieldInput}>
                      <label>Field Type</label>
                      <select
                        value={field.field_type}
                        onChange={(e) => handleFieldChange(index, 'field_type', e.target.value)}
                      >
                        {FIELD_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    {field.field_type === 'rating' && (
                      <div className={styles.fieldInput} style={{ maxWidth: '120px' }}>
                        <label>Max Rating</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={field.max_rating}
                          onChange={(e) => handleFieldChange(index, 'max_rating', parseInt(e.target.value) || 5)}
                        />
                      </div>
                    )}
                  </div>
                  {(field.field_type === 'select' || field.field_type === 'multi-select') && (
                    <div className={styles.optionsSection}>
                      <label>Options</label>
                      <div className={styles.optionsList}>
                        {(field.options || []).map((option, optIndex) => (
                          <div key={optIndex} className={styles.optionItem}>
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => handleOptionChange(index, optIndex, e.target.value)}
                              placeholder={`Option ${optIndex + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(index, optIndex)}
                              className={styles.removeOptionBtn}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddOption(index)}
                          className={styles.addOptionBtn}
                        >
                          <FiPlus /> Add Option
                        </button>
                      </div>
                    </div>
                  )}
                  <div className={styles.fieldOptions}>
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={field.is_guardian_field}
                        onChange={(e) => handleFieldChange(index, 'is_guardian_field', e.target.checked)}
                      />
                      Guardian Response Field
                    </label>
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => handleFieldChange(index, 'required', e.target.checked)}
                      />
                      Required
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  className={styles.removeFieldBtn}
                  disabled={formData.fields.length <= 1}
                >
                  <FiTrash2 />
                </button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={() => { setCurrentView('list'); resetForm(); }} className={styles.cancelBtn}>
            Cancel
          </button>
          <button type="submit" className={styles.saveBtn} disabled={loading}>
            <FiSave /> {loading ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EvaluationBookFormBuilder;
