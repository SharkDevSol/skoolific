import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiX, FiPlus, FiTrash2, FiAlertCircle, FiClipboard, FiUsers, FiUser, FiBook, FiCalendar } from 'react-icons/fi';
import styles from './CreateEvaluation.module.css'; // We will create this CSS file next

const API_BASE = '/api/evaluations';

const CreateEvaluation = ({ evaluationId, onEvaluationCreated, onCancel } ) => {
  const [formData, setFormData] = useState({
    evaluation_name: '',
    evaluation_area_id: '',
    subject_name: '',
    class_name: '',
    staff_role: '',
    staff_global_id: '',
    staff_name: '',
    term: '',
    form_columns: [{ name: '', max_points: 10 }]
  });

  const [areas, setAreas] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [roles, setRoles] = useState([]);
  const [staff, setStaff] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch initial data for dropdowns
  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [areasRes, subjectsRes, rolesRes] = await Promise.all([
        fetch(`${API_BASE}/areas`),
        fetch(`${API_BASE}/subjects`),
        fetch(`${API_BASE}/roles`)
      ]);

      if (areasRes.ok) setAreas(await areasRes.json());
      if (subjectsRes.ok) setSubjects(await subjectsRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());

      // If editing, fetch the existing evaluation data
      if (evaluationId) {
        const evalRes = await fetch(`${API_BASE}/${evaluationId}`);
        if (!evalRes.ok) throw new Error('Failed to fetch evaluation data for editing.');
        const evalData = await evalRes.json();
        setFormData({
          evaluation_name: evalData.evaluation_name || '',
          evaluation_area_id: evalData.evaluation_area_id || '',
          subject_name: evalData.subject_name || '',
          class_name: evalData.class_name || '',
          staff_role: evalData.staff_role || '',
          staff_global_id: evalData.staff_global_id || '',
          staff_name: evalData.staff_name || '',
          term: evalData.term || '',
          form_columns: evalData.form_columns?.length > 0 ? evalData.form_columns.map(c => ({ name: c.column_name, max_points: c.max_points })) : [{ name: '', max_points: 10 }]
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load required data.');
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Fetch staff when role changes
  useEffect(() => {
    if (formData.staff_role) {
      const fetchStaff = async () => {
        try {
          const res = await fetch(`${API_BASE}/staff/${formData.staff_role}`);
          if (res.ok) setStaff(await res.json());
        } catch (err) { console.error("Failed to fetch staff"); }
      };
      fetchStaff();
    }
  }, [formData.staff_role]);

  // Fetch classes when subject changes
  useEffect(() => {
    if (formData.subject_name) {
        const fetchClasses = async () => {
            try {
                const mappingsRes = await fetch(`${API_BASE}/subjects-classes`);
                if(mappingsRes.ok) {
                    const mappings = await mappingsRes.json();
                    const subjectClasses = mappings
                        .filter(m => m.subject_name === formData.subject_name)
                        .map(m => m.class_name);
                    setClasses([...new Set(subjectClasses)]);
                }
            } catch (err) { console.error("Failed to fetch classes"); }
        };
        fetchClasses();
    }
  }, [formData.subject_name]);


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'staff_role') {
        setFormData(prev => ({ ...prev, staff_global_id: '', staff_name: '' }));
    }
    if (name === 'staff_global_id') {
        const selectedStaff = staff.find(s => s.global_staff_id.toString() === value);
        if (selectedStaff) {
            setFormData(prev => ({ ...prev, staff_name: selectedStaff.name }));
        }
    }
  };

  const handleColumnChange = (index, e) => {
    const { name, value } = e.target;
    const newColumns = [...formData.form_columns];
    newColumns[index][name] = value;
    setFormData(prev => ({ ...prev, form_columns: newColumns }));
  };

  const addColumn = () => {
    setFormData(prev => ({ ...prev, form_columns: [...prev.form_columns, { name: '', max_points: 10 }] }));
  };

  const removeColumn = (index) => {
    if (formData.form_columns.length <= 1) return;
    const newColumns = formData.form_columns.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, form_columns: newColumns }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    // Basic validation
    if (formData.form_columns.some(c => !c.name.trim() || !c.max_points)) {
        setError('All criteria must have a name and max points.');
        setIsSubmitting(false);
        return;
    }

    try {
      const url = evaluationId ? `${API_BASE}/${evaluationId}` : API_BASE;
      const method = evaluationId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${evaluationId ? 'update' : 'create'} evaluation.`);
      }

      const result = await response.json();
      onEvaluationCreated(result);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading form...</div>;
  }

  return (
    <motion.div className={styles.formContainer} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <form onSubmit={handleSubmit}>
        <div className={styles.formHeader}>
          <h2>{evaluationId ? 'Edit Evaluation' : 'Create New Evaluation'}</h2>
          <p>Fill out the details below to set up an evaluation.</p>
        </div>

        {error && (
          <div className={styles.errorMessage}>
            <FiAlertCircle /> {error}
          </div>
        )}

        <div className={styles.formGrid}>
            {/* Evaluation Name */}
            <div className={styles.formGroup}>
                <label><FiClipboard /> Evaluation Name</label>
                <input type="text" name="evaluation_name" value={formData.evaluation_name} onChange={handleInputChange} required />
            </div>

            {/* Term */}
            <div className={styles.formGroup}>
                <label><FiCalendar /> Term</label>
                <select name="term" value={formData.term} onChange={handleInputChange} required>
                    <option value="">Select a Term</option>
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                    <option value="Semester 1">Semester 1</option>
                    <option value="Semester 2">Semester 2</option>
                    <option value="Annual">Annual</option>
                </select>
            </div>

            {/* Evaluation Area */}
            <div className={styles.formGroup}>
                <label><FiBook /> Evaluation Area</label>
                <select name="evaluation_area_id" value={formData.evaluation_area_id} onChange={handleInputChange} required>
                    <option value="">Select an Area</option>
                    {areas.map(area => <option key={area.id} value={area.id}>{area.area_name}</option>)}
                </select>
            </div>

            {/* Subject */}
            <div className={styles.formGroup}>
                <label><FiBook /> Subject</label>
                <select name="subject_name" value={formData.subject_name} onChange={handleInputChange} required>
                    <option value="">Select a Subject</option>
                    {subjects.map(sub => <option key={sub.id} value={sub.subject_name}>{sub.subject_name}</option>)}
                </select>
            </div>

            {/* Class */}
            <div className={styles.formGroup}>
                <label><FiUsers /> Class</label>
                <select name="class_name" value={formData.class_name} onChange={handleInputChange} required disabled={!formData.subject_name || classes.length === 0}>
                    <option value="">Select a Class</option>
                    {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                </select>
            </div>

            {/* Staff Role */}
            <div className={styles.formGroup}>
                <label><FiUser /> Staff Role</label>
                <select name="staff_role" value={formData.staff_role} onChange={handleInputChange} required>
                    <option value="">Select a Role</option>
                    {roles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>
            </div>

            {/* Staff Member */}
            <div className={styles.formGroupFull}>
                <label><FiUser /> Staff Member</label>
                <select name="staff_global_id" value={formData.staff_global_id} onChange={handleInputChange} required disabled={!formData.staff_role || staff.length === 0}>
                    <option value="">Select a Staff Member</option>
                    {staff.map(s => <option key={s.global_staff_id} value={s.global_staff_id}>{s.name}</option>)}
                </select>
            </div>
        </div>

        {/* Dynamic Form Columns */}
        <div className={styles.columnsSection}>
            <h3>Evaluation Criteria</h3>
            {formData.form_columns.map((col, index) => (
                <div key={index} className={styles.columnRow}>
                    <input type="text" name="name" placeholder="Criterion Name (e.g., Speed)" value={col.name} onChange={(e) => handleColumnChange(index, e)} required />
                    <input type="number" name="max_points" placeholder="Max Pts" value={col.max_points} onChange={(e) => handleColumnChange(index, e)} required min="1" />
                    <button type="button" onClick={() => removeColumn(index)} disabled={formData.form_columns.length <= 1}><FiTrash2 /></button>
                </div>
            ))}
            <button type="button" className={styles.addColumnButton} onClick={addColumn}><FiPlus /> Add Criterion</button>
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={onCancel} className={styles.cancelButton} disabled={isSubmitting}>
            <FiX /> Cancel
          </button>
          <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
            <FiSave /> {isSubmitting ? 'Saving...' : 'Save Evaluation'}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default CreateEvaluation;