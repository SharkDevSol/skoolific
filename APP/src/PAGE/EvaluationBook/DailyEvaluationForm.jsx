import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FiSave, FiSend, FiArrowLeft, FiUser, FiStar, FiAlertCircle, FiCheck, FiCalendar 
} from 'react-icons/fi';
import styles from './DailyEvaluationForm.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const DailyEvaluationForm = () => {
  const { className } = useParams();
  const [searchParams] = useSearchParams();
  const teacherId = searchParams.get('teacherId');
  const navigate = useNavigate();

  const [template, setTemplate] = useState(null);
  const [students, setStudents] = useState([]);
  const [evaluationDate, setEvaluationDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch class details with students and template
      const res = await fetch(`${API_BASE}/teacher/${teacherId}/class/${encodeURIComponent(className)}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('Access denied to this class');
        throw new Error('Failed to fetch class data');
      }
      
      const data = await res.json();
      setStudents(data.students || []);
      
      if (data.template) {
        // Fetch full template with fields
        const templateRes = await fetch(`${API_BASE}/templates/${data.template.id}`);
        if (templateRes.ok) {
          setTemplate(await templateRes.json());
        }
      }

      // Initialize entries for each student
      const initialEntries = {};
      (data.students || []).forEach(student => {
        initialEntries[student.student_name] = { field_values: {} };
      });
      setEntries(initialEntries);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [className, teacherId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFieldChange = (studentName, fieldId, value) => {
    setEntries(prev => ({
      ...prev,
      [studentName]: {
        ...prev[studentName],
        field_values: {
          ...prev[studentName]?.field_values,
          [fieldId]: value
        }
      }
    }));
  };

  const validateEntries = () => {
    if (!template?.fields) return true;
    
    for (const student of students) {
      const studentEntry = entries[student.student_name];
      for (const field of template.fields) {
        if (field.required && !field.is_guardian_field) {
          const value = studentEntry?.field_values?.[field.id];
          if (value === undefined || value === '' || value === null) {
            return false;
          }
          if (field.field_type === 'rating' && field.max_rating) {
            if (value < 0 || value > field.max_rating) {
              return false;
            }
          }
        }
      }
    }
    return true;
  };


  const handleSave = async (sendToGuardians = false) => {
    setError('');
    setSuccess('');

    if (!validateEntries()) {
      setError('Please fill in all required fields for all students');
      return;
    }

    try {
      setSaving(true);

      // Prepare entries for API
      const apiEntries = students.map(student => ({
        student_name: student.student_name,
        guardian_id: student.guardian_id || null,
        field_values: entries[student.student_name]?.field_values || {}
      }));

      // Save evaluations
      const saveRes = await fetch(`${API_BASE}/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template?.id,
          teacher_global_id: parseInt(teacherId),
          class_name: className,
          evaluation_date: evaluationDate,
          entries: apiEntries
        })
      });

      if (!saveRes.ok) {
        const data = await saveRes.json();
        throw new Error(data.error || 'Failed to save evaluations');
      }

      const savedEntries = await saveRes.json();

      // Send to guardians if requested
      if (sendToGuardians && savedEntries.length > 0) {
        const sendRes = await fetch(`${API_BASE}/daily/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evaluation_ids: savedEntries.map(e => e.id)
          })
        });

        if (!sendRes.ok) {
          throw new Error('Saved but failed to send to guardians');
        }

        setSuccess('Evaluations saved and sent to guardians!');
      } else {
        setSuccess('Evaluations saved as draft');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field, studentName) => {
    const value = entries[studentName]?.field_values?.[field.id] ?? '';

    if (field.is_guardian_field) {
      return (
        <div className={styles.guardianField}>
          <span>Guardian response field</span>
        </div>
      );
    }

    switch (field.field_type) {
      case 'rating':
        return (
          <div className={styles.ratingInput}>
            {[...Array(field.max_rating || 5)].map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.ratingStar} ${value >= i + 1 ? styles.active : ''}`}
                onClick={() => handleFieldChange(studentName, field.id, i + 1)}
              >
                <FiStar />
              </button>
            ))}
            <span className={styles.ratingValue}>{value || 0}/{field.max_rating || 5}</span>
          </div>
        );
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(studentName, field.id, e.target.value)}
            placeholder={`Enter ${field.field_name.toLowerCase()}...`}
            rows={2}
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(studentName, field.id, e.target.value)}
            placeholder={`Enter ${field.field_name.toLowerCase()}...`}
          />
        );
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading evaluation form...</div>;
  }

  if (error && !template) {
    return (
      <div className={styles.errorPage}>
        <FiAlertCircle size={48} />
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}><FiArrowLeft /> Go Back</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate(-1)} className={styles.backBtn}>
          <FiArrowLeft /> Back
        </button>
        <div className={styles.headerInfo}>
          <h2>Daily Evaluation - {decodeURIComponent(className)}</h2>
          <div className={styles.dateSelector}>
            <FiCalendar />
            <input
              type="date"
              value={evaluationDate}
              onChange={(e) => setEvaluationDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <div className={styles.error}><FiAlertCircle /> {error}</div>}
      {success && <div className={styles.success}><FiCheck /> {success}</div>}

      {!template ? (
        <div className={styles.noTemplate}>
          <FiAlertCircle size={32} />
          <p>No active evaluation template found. Please contact your administrator.</p>
        </div>
      ) : (
        <>
          <div className={styles.templateInfo}>
            <h3>{template.template_name}</h3>
            {template.description && <p>{template.description}</p>}
          </div>

          <div className={styles.studentsList}>
            {students.map((student, index) => (
              <motion.div
                key={student.student_name}
                className={styles.studentCard}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className={styles.studentHeader}>
                  <FiUser />
                  <span className={styles.studentName}>{student.student_name}</span>
                  {student.gender && <span className={styles.studentMeta}>{student.gender}</span>}
                </div>
                <div className={styles.fieldsGrid}>
                  {template.fields?.filter(f => !f.is_guardian_field).map(field => (
                    <div key={field.id} className={styles.fieldGroup}>
                      <label>
                        {field.field_name}
                        {field.required && <span className={styles.required}>*</span>}
                      </label>
                      {renderField(field, student.student_name)}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <div className={styles.actions}>
            <button onClick={() => handleSave(false)} disabled={saving} className={styles.saveBtn}>
              <FiSave /> {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button onClick={() => handleSave(true)} disabled={saving} className={styles.sendBtn}>
              <FiSend /> {saving ? 'Sending...' : 'Save & Send to Guardians'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default DailyEvaluationForm;
