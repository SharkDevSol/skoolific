// PAGE/CreateMarklist/SubjectMappingSetup.jsx
import React, { useState, useEffect } from 'react';
import { getBranchCode } from '../../utils/branchCode';
import styles from './CreateMarklist/CreateMarklist.module.css';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));
const branchHeaders = () => ({ 'x-branch-code': getBranchCode() });

const PRESET_SUBJECTS = [
  'English', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'Amharic', 'Afan Oromo', 'Arabic',
  'Islamic Studies', 'ICT', 'Physical Education', 'Art', 'Music',
  'Civic & Ethical Education', 'Science', 'Economics'
];

const SubjectConfiguration = ({ onSubjectsConfigured }) => {
  const [subjects, setSubjects] = useState([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/mark-list/subjects`, {
        headers: branchHeaders()
      });
      const data = await res.json();
      // FIX: guard against 400/500 responses that return an error object —
      // subjects must always be an array or .some()/.map() crash the page
      setSubjects(Array.isArray(data) ? data : []);
      if (!res.ok) {
        console.error('Error fetching subjects:', data?.message || data?.error || res.status);
      }
    } catch (err) {
      console.error('Error fetching subjects:', err);
      setSubjects([]);
    }
  };

  const handleAdd = async () => {
    if (!newSubjectName.trim()) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/mark-list/add-subject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...branchHeaders() },
        body: JSON.stringify({ subject_name: newSubjectName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewSubjectName('');
        setMessage('Subject added!');
        fetchSubjects();
      } else {
        setMessage(data.error || 'Failed to add subject');
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (presetName) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/mark-list/add-subject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...branchHeaders() },
        body: JSON.stringify({ subject_name: presetName }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`"${presetName}" added!`);
        fetchSubjects();
      } else {
        setMessage(data.error || 'Failed to add subject');
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id) => {
    if (!editingName.trim()) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/mark-list/update-subject/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...branchHeaders() },
        body: JSON.stringify({ subject_name: editingName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingId(null);
        setEditingName('');
        setMessage('Subject updated!');
        fetchSubjects();
      } else {
        setMessage(data.error || 'Failed to update');
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/mark-list/delete-subject/${id}`, {
        method: 'DELETE',
        headers: branchHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Subject deleted!');
        fetchSubjects();
      } else {
        setMessage(data.error || 'Failed to delete');
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.content}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>📚</div>
        <h2>Subject Configuration</h2>
        <p>Add, edit, or remove subjects. Existing subjects are preserved.</p>
      </div>

      {/* Quick add basic subjects */}
      <div className={styles.inputGroup}>
        <label>Quick Add Basic Subjects</label>
        <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.85rem' }}>
          Click a subject below to add it, or type a custom one and click Add.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {PRESET_SUBJECTS
            .filter(p => !subjects.some(s => s.subject_name.toLowerCase() === p.toLowerCase()))
            .map(p => (
              <button
                key={p}
                onClick={() => handleQuickAdd(p)}
                disabled={loading}
                style={{
                  padding: '0.45rem 1rem', borderRadius: '20px', cursor: 'pointer',
                  background: '#f0f4ff', border: '1.5px solid #93c5fd', color: '#1d4ed8',
                  fontSize: '0.85rem', fontWeight: 600
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f0f4ff'; }}
              >
                + {p}
              </button>
            ))}
          {PRESET_SUBJECTS.every(p => subjects.some(s => s.subject_name.toLowerCase() === p.toLowerCase())) && (
            <span style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.3rem 0' }}>
              All basic subjects added ✓
            </span>
          )}
        </div>
      </div>

      {/* Add new subject */}
      <div className={styles.inputGroup}>
        <label>Add Custom Subject</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Enter subject name"
            className={styles.modernInput}
            style={{ flex: 1 }}
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newSubjectName.trim()}
            className={styles.primaryButton}
            style={{ whiteSpace: 'nowrap' }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Existing subjects list */}
      {subjects.length > 0 && (
        <div className={styles.inputGroup}>
          <label>Current Subjects ({subjects.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {subjects.map((s) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: '#f8f9fa', borderRadius: '8px', padding: '0.5rem 0.75rem'
              }}>
                {editingId === s.id ? (
                  <>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit(s.id)}
                      className={styles.modernInput}
                      style={{ flex: 1, padding: '0.4rem 0.6rem' }}
                      autoFocus
                    />
                    <button onClick={() => handleEdit(s.id)} disabled={loading}
                      style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Save
                    </button>
                    <button onClick={() => { setEditingId(null); setEditingName(''); }}
                      style={{ background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 500 }}>{s.subject_name}</span>
                    <button onClick={() => { setEditingId(s.id); setEditingName(s.subject_name); }}
                      style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(s.id, s.subject_name)} disabled={loading}
                      style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className={`${styles.message} ${message.includes('!') ? styles.success : styles.error}`}>
          {message}
        </div>
      )}

      {/* V2 Enhancement: Separate navigation button */}
      {subjects.length > 0 && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid #e5e7eb' }}>
          <div className={styles.buttonGroup}>
            <button 
              onClick={() => onSubjectsConfigured && onSubjectsConfigured()} 
              className={styles.primaryButton}
              style={{ width: '100%', padding: '1rem', fontSize: '1rem', fontWeight: '600' }}
            >
              Next: Class Mapping →
            </button>
          </div>
          <p style={{ textAlign: 'center', marginTop: '0.75rem', color: '#6b7280', fontSize: '0.9rem' }}>
            You have {subjects.length} subject{subjects.length !== 1 ? 's' : ''} configured. Click above to proceed to class mapping.
          </p>
        </div>
      )}
    </div>
  );
};

const ClassSubjectMapping = ({ onMappingCompleted }) => {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [existingMappings, setExistingMappings] = useState([]);
  const [addSubjectsForClass, setAddSubjectsForClass] = useState(null);
  const [selectedSubjects, setSelectedSubjects] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [classesRes, subjectsRes, mappingsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/mark-list/classes`, { headers: branchHeaders() }),
        fetch(`${API_BASE_URL}/mark-list/subjects`, { headers: branchHeaders() }),
        fetch(`${API_BASE_URL}/mark-list/subjects-classes`, { headers: branchHeaders() })
      ]);
      const [classesData, subjectsData, mappingsData] = await Promise.all([
        classesRes.json(), subjectsRes.json(), mappingsRes.json()
      ]);
      setClasses(classesData);
      setSubjects(subjectsData);
      setExistingMappings(mappingsData);
      const mappingState = {};
      mappingsData.forEach(m => { mappingState[`${m.class_name}-${m.subject_name}`] = true; });
      setMappings(mappingState);
    } catch (err) {
      setMessage('Error loading data: ' + err.message);
    }
  };

  const handleMappingChange = (className, subjectName, isChecked) => {
    setMappings(prev => ({ ...prev, [`${className}-${subjectName}`]: isChecked }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMessage('');
    try {
      const mappingsArray = Object.entries(mappings)
        .filter(([, v]) => v)
        .map(([key]) => {
          const idx = key.indexOf('-');
          return { className: key.substring(0, idx), subjectName: key.substring(idx + 1) };
        });
      const res = await fetch(`${API_BASE_URL}/mark-list/map-subjects-classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...branchHeaders() },
        body: JSON.stringify({ mappings: mappingsArray }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Mappings saved!');
        fetchData();
        if (onMappingCompleted) onMappingCompleted();
      } else {
        setMessage(data.error || 'Failed to save');
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (classes.length === 0 || subjects.length === 0) {
    return (
      <div className={styles.content}>
        <div className={styles.emptyState}>
          <h3>No Data Available</h3>
          <p>{classes.length === 0 ? 'No classes found.' : 'No subjects found. Please add subjects first.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.content}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>🔄</div>
        <h2>Class-Subject Mapping</h2>
        <p>Click subjects to assign them to each class</p>
      </div>
      {message && (
        <div className={`${styles.message} ${message.includes('!') ? styles.success : styles.error}`}>{message}</div>
      )}
      <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {classes.map(className => {
          const mappedSubjects = subjects.filter(s => mappings[`${className}-${s.subject_name}`]);
          return (
            <div key={className} style={{
              background: '#fff', borderRadius: 12, padding: 16,
              border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#111827', marginBottom: 10 }}>
                {className}
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8, fontWeight: 400 }}>
                  ({mappedSubjects.length} subject{mappedSubjects.length !== 1 ? 's' : ''})
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {subjects.filter(s => mappings[`${className}-${s.subject_name}`]).map(s => (
                  <span key={s.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', background: '#ede9fe', color: '#6d28d9',
                    borderRadius: 20, fontSize: 13, fontWeight: 500
                  }}>
                    {s.subject_name}
                    <span onClick={() => handleMappingChange(className, s.subject_name, false)}
                      style={{ cursor: 'pointer', marginLeft: 2, fontSize: 14, lineHeight: 1 }}>✕</span>
                  </span>
                ))}
                {addSubjectsForClass === className ? (
                  <div style={{ width: '100%', marginTop: 8, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {subjects.filter(s => !mappings[`${className}-${s.subject_name}`]).map(s => (
                        <label key={s.id} onClick={() => setSelectedSubjects(prev => ({ ...prev, [s.subject_name]: !prev[s.subject_name] }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, padding: '4px 8px', borderRadius: 6, background: selectedSubjects[s.subject_name] ? '#ede9fe' : 'transparent' }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4,
                            background: selectedSubjects[s.subject_name] ? '#7c3aed' : '#fff',
                            border: selectedSubjects[s.subject_name] ? 'none' : '2px solid #d1d5db',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {selectedSubjects[s.subject_name] && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                          </div>
                          {s.subject_name}
                        </label>
                      ))}
                      {subjects.filter(s => !mappings[`${className}-${s.subject_name}`]).length === 0 && (
                        <div style={{ fontSize: 13, color: '#9ca3af', padding: 8 }}>All subjects already assigned</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => {
                        const toAdd = Object.keys(selectedSubjects).filter(k => selectedSubjects[k]);
                        toAdd.forEach(name => handleMappingChange(className, name, true));
                        setSelectedSubjects({});
                        setAddSubjectsForClass(null);
                      }}
                        disabled={Object.keys(selectedSubjects).filter(k => selectedSubjects[k]).length === 0}
                        style={{ padding: '6px 16px', background: Object.keys(selectedSubjects).filter(k => selectedSubjects[k]).length === 0 ? '#d1d5db' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: Object.keys(selectedSubjects).filter(k => selectedSubjects[k]).length === 0 ? 'default' : 'pointer' }}>
                        Add Selected ({Object.keys(selectedSubjects).filter(k => selectedSubjects[k]).length})
                      </button>
                      <button onClick={() => { setAddSubjectsForClass(null); setSelectedSubjects({}); }}
                        style={{ padding: '6px 16px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <span onClick={() => { setAddSubjectsForClass(className); setSelectedSubjects({}); }}
                    style={{ padding: '4px 12px', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 20, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
                    + Add Subjects
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {classes.length > 0 && (
        <div className={styles.buttonGroup}>
          <button onClick={handleSubmit} disabled={loading} className={styles.primaryButton}>
            {loading ? 'Saving...' : 'Save Mappings'}
          </button>
        </div>
      )}
    </div>
  );
};

const SubjectMappingSetup = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [subjectsConfigured, setSubjectsConfigured] = useState(false);
  const [mappingCompleted, setMappingCompleted] = useState(false);

  const steps = [
    { number: 1, title: 'Subject Setup', completed: subjectsConfigured },
    { number: 2, title: 'Class Mapping', completed: mappingCompleted }
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Subject & Class Setup</h1>
        <p>Configure subjects and map them to classes</p>
        <div className={styles.progressSteps}>
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <button
                className={`${styles.stepIndicator} ${step.completed ? styles.completed : currentStep === step.number ? styles.active : ''}`}
                onClick={() => setCurrentStep(step.number)}
              >
                <span className={styles.stepIconInner}>{step.completed ? '✓' : step.number}</span>
              </button>
              {index < steps.length - 1 && <div className={styles.stepConnector}></div>}
            </React.Fragment>
          ))}
        </div>
      </div>
      {currentStep === 1 && (
        <SubjectConfiguration onSubjectsConfigured={() => { setSubjectsConfigured(true); setCurrentStep(2); }} />
      )}
      {currentStep === 2 && (
        <ClassSubjectMapping onMappingCompleted={() => { setMappingCompleted(true); if (onComplete) onComplete(); }} />
      )}
    </div>
  );
};

export default SubjectMappingSetup;
