import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
    FiPlus, FiX, FiCheck, FiTrash2, FiSave, FiUser, FiBook, FiUsers, FiCalendar, 
    FiClipboard, FiEye, FiEdit2, FiSearch, FiAlertCircle, FiFolder, FiChevronDown, FiChevronUp
} from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './Evaluation.module.css';

// --- CreateEvaluation Component ---
const CreateEvaluation = ({ evaluationId, onEvaluationCreated, onCancel }) => {
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
    const [dependencies, setDependencies] = useState({
        areas: [],
        subjects: [],
        roles: [],
        terms: [],
        classes: [],
        staff: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const API_BASE = '/api/evaluations';

    const fetchDependencies = useCallback(async ( ) => {
        try {
            setLoading(true);
            const [areasRes, subjectsRes, rolesRes, termsRes] = await Promise.all([
                fetch(`${API_BASE}/areas`),
                fetch(`${API_BASE}/subjects`),
                fetch(`${API_BASE}/roles`),
                fetch(`${API_BASE}/terms`)
            ]);

            if (!areasRes.ok || !subjectsRes.ok || !rolesRes.ok || !termsRes.ok) {
                throw new Error("Failed to fetch one or more dependencies.");
            }

            const areas = await areasRes.json();
            const subjects = await subjectsRes.json();
            const roles = await rolesRes.json();
            const terms = await termsRes.json();

            setDependencies(prev => ({ ...prev, areas, subjects, roles, terms }));

            if (evaluationId) {
                const evalRes = await fetch(`${API_BASE}/${evaluationId}`);
                const evalData = await evalRes.json();
                setFormData({
                    ...evalData,
                    form_columns: evalData.form_columns?.map(c => ({ name: c.column_name, max_points: c.max_points })) || [{ name: '', max_points: 10 }]
                });
            }
        } catch (err) {
            setError('Failed to load required data. Please check the network and backend server.');
        } finally {
            setLoading(false);
        }
    }, [evaluationId]);

    useEffect(() => {
        fetchDependencies();
    }, [fetchDependencies]);

    useEffect(() => {
        const fetchDynamicDeps = async () => {
            try {
                if (formData.subject_name) {
                    const res = await fetch(`${API_BASE}/subjects-classes`);
                    if (res.ok) {
                        const mappings = await res.json();
                        setDependencies(p => ({ ...p, classes: [...new Set(mappings.filter(m => m.subject_name === formData.subject_name).map(m => m.class_name))] }));
                    }
                }
                if (formData.staff_role) {
                    const res = await fetch(`${API_BASE}/staff/${formData.staff_role}`);
                    if (res.ok) {
                        const staffData = await res.json();
                        setDependencies(p => ({ ...p, staff: Array.isArray(staffData) ? staffData : [] }));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch dynamic dependencies", err);
            }
        };
        fetchDynamicDeps();
    }, [formData.subject_name, formData.staff_role]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(p => ({ ...p, [name]: value }));
        if (name === 'subject_name') setFormData(p => ({ ...p, class_name: '' }));
        if (name === 'staff_role') setFormData(p => ({ ...p, staff_global_id: '', staff_name: '' }));
        if (name === 'staff_global_id') {
            const selectedStaff = dependencies.staff.find(s => s.global_staff_id.toString() === value);
            setFormData(p => ({ ...p, staff_name: selectedStaff?.name || '' }));
        }
    };

    const handleColumnChange = (index, e) => {
        const newColumns = [...formData.form_columns];
        newColumns[index][e.target.name] = e.target.value;
        setFormData(p => ({ ...p, form_columns: newColumns }));
    };

    const addColumn = () => setFormData(p => ({ ...p, form_columns: [...p.form_columns, { name: '', max_points: 10 }] }));
    const removeColumn = (index) => { if (formData.form_columns.length > 1) setFormData(p => ({ ...p, form_columns: p.form_columns.filter((_, i) => i !== index) })); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (!formData.evaluation_area_id) {
                throw new Error("Please select an Evaluation Area.");
            }
            
            // <<< FIX: ADD THIS CONSOLE.LOG TO DEBUG >>>
            console.log("Submitting the following data:", JSON.stringify(formData, null, 2));

            const response = await fetch(evaluationId ? `${API_BASE}/${evaluationId}` : API_BASE, {
                method: evaluationId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Submission failed');
            }
            onEvaluationCreated(await response.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !formData.evaluation_name) return <div className={styles.evaluationManagerLoading}>Loading Form...</div>;

    return (
        <motion.div className={styles.createEvaluationContainer} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <form onSubmit={handleSubmit}>
                <div className={styles.formHeader}><h2>{evaluationId ? 'Edit Evaluation' : 'Create New Evaluation'}</h2></div>
                {error && <div className={styles.errorMessage}><FiAlertCircle /> {error}</div>}
                
                <div className={styles.formGroup} style={{gridColumn: '1 / -1'}}>
                    <label>Evaluation Area</label>
                    <select name="evaluation_area_id" value={formData.evaluation_area_id} onChange={handleInputChange} required>
                        <option value="">Select an Evaluation Area...</option>
                        {dependencies.areas.map(area => <option key={area.id} value={area.id}>{area.area_name}</option>)}
                    </select>
                </div>

                <div className={styles.formGrid}>
                    <div className={styles.formGroup}><label>Evaluation Name</label><input name="evaluation_name" type="text" value={formData.evaluation_name} onChange={handleInputChange} required /></div>
                    <div className={styles.formGroup}><label>Term</label><select name="term" value={formData.term} onChange={handleInputChange} required><option value="">Select Term</option>{dependencies.terms.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className={styles.formGroup}><label>Subject</label><select name="subject_name" value={formData.subject_name} onChange={handleInputChange} required><option value="">Select Subject</option>{dependencies.subjects.map(s => <option key={s.id} value={s.subject_name}>{s.subject_name}</option>)}</select></div>
                    <div className={styles.formGroup}><label>Class</label><select name="class_name" value={formData.class_name} onChange={handleInputChange} required disabled={!formData.subject_name}><option value="">Select Class</option>{dependencies.classes.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div className={styles.formGroup}><label>Staff Role</label><select name="staff_role" value={formData.staff_role} onChange={handleInputChange} required><option value="">Select Role</option>{dependencies.roles.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div className={styles.formGroup}><label>Staff Member</label><select name="staff_global_id" value={formData.staff_global_id} onChange={handleInputChange} required disabled={!formData.staff_role || dependencies.staff.length === 0}><option value="">Select Staff</option>{dependencies.staff.map(s => <option key={s.global_staff_id} value={s.global_staff_id}>{s.name}</option>)}</select></div>
                </div>
                <div className={styles.columnsSection}>
                    <h3>Evaluation Criteria</h3>
                    {formData.form_columns.map((col, i) => (<div key={i} className={styles.columnRow}><input name="name" type="text" placeholder="Criterion Name" value={col.name} onChange={(e) => handleColumnChange(i, e)} required /><input name="max_points" type="number" placeholder="Max Pts" value={col.max_points} onChange={(e) => handleColumnChange(i, e)} required min="1" /><button type="button" onClick={() => removeColumn(i)} disabled={formData.form_columns.length <= 1}><FiTrash2 /></button></div>))}
                    <button type="button" className={styles.addColumnButton} onClick={addColumn}><FiPlus /> Add Criterion</button>
                </div>
                <div className={styles.formActions}><button type="button" onClick={onCancel} disabled={loading}>Cancel</button><button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Evaluation'}</button></div>
            </form>
        </motion.div>
    );
};

// --- Manage Evaluation Areas Component ---
const ManageEvaluationAreas = ({ onAreaCreated }) => {
    const [areas, setAreas] = useState([]);
    const [newAreaName, setNewAreaName] = useState('');
    const [newAreaDescription, setNewAreaDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const API_BASE = '/api/evaluations';

    const fetchAreas = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/areas`);
            if (res.ok) {
                const data = await res.json();
                setAreas(data);
            }
        } catch (err) {
            console.error('Failed to fetch areas:', err);
        }
    }, []);

    useEffect(() => {
        if (isExpanded) {
            fetchAreas();
        }
    }, [isExpanded, fetchAreas]);

    const handleCreateArea = async (e) => {
        e.preventDefault();
        if (!newAreaName.trim()) {
            setError('Area name is required');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${API_BASE}/areas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    area_name: newAreaName.trim(),
                    description: newAreaDescription.trim()
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to create area');
            }

            setSuccess('Evaluation area created successfully!');
            setNewAreaName('');
            setNewAreaDescription('');
            fetchAreas();
            if (onAreaCreated) onAreaCreated();
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteArea = async (areaId) => {
        if (!window.confirm('Are you sure you want to delete this evaluation area?')) return;

        try {
            const res = await fetch(`${API_BASE}/areas/${areaId}`, { method: 'DELETE' });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to delete area');
            }
            fetchAreas();
            if (onAreaCreated) onAreaCreated();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className={styles.manageAreasContainer}>
            <div 
                className={styles.manageAreasHeader} 
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={styles.manageAreasTitle}>
                    <FiFolder /> Manage Evaluation Areas
                </div>
                <button className={styles.expandButton}>
                    {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                </button>
            </div>

            {isExpanded && (
                <motion.div 
                    className={styles.manageAreasContent}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                >
                    {error && <div className={styles.errorMessage}><FiAlertCircle /> {error}</div>}
                    {success && <div className={styles.successMessage}><FiCheck /> {success}</div>}

                    {/* Create New Area Form */}
                    <form onSubmit={handleCreateArea} className={styles.createAreaForm}>
                        <h4>Create New Area</h4>
                        <div className={styles.createAreaInputs}>
                            <input
                                type="text"
                                placeholder="Area Name (e.g., Academic, Behavioral, Sports)"
                                value={newAreaName}
                                onChange={(e) => setNewAreaName(e.target.value)}
                                required
                            />
                            <input
                                type="text"
                                placeholder="Description (optional)"
                                value={newAreaDescription}
                                onChange={(e) => setNewAreaDescription(e.target.value)}
                            />
                            <button type="submit" disabled={loading}>
                                <FiPlus /> {loading ? 'Creating...' : 'Add Area'}
                            </button>
                        </div>
                    </form>

                    {/* Existing Areas List */}
                    <div className={styles.existingAreasList}>
                        <h4>Existing Areas ({areas.length})</h4>
                        {areas.length === 0 ? (
                            <p className={styles.noAreasText}>No evaluation areas created yet.</p>
                        ) : (
                            <div className={styles.areasGrid}>
                                {areas.map(area => (
                                    <div key={area.id} className={styles.areaItem}>
                                        <div className={styles.areaInfo}>
                                            <span className={styles.areaName}>{area.area_name}</span>
                                            {area.description && (
                                                <span className={styles.areaDescription}>{area.description}</span>
                                            )}
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteArea(area.id)}
                                            className={styles.deleteAreaButton}
                                            title="Delete Area"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

// --- EvaluationManager Component (The Main Export) ---
const EvaluationManager = () => {
    const [currentView, setCurrentView] = useState('list');
    const [editingEvaluationId, setEditingEvaluationId] = useState(null);
    const [showCreateArea, setShowCreateArea] = useState(false);
    const [areasRefreshKey, setAreasRefreshKey] = useState(0);
    const navigate = useNavigate();
    const [evaluations, setEvaluations] = useState([]);
    const [filteredEvaluations, setFilteredEvaluations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ role: '', subject: '', class: '', search: '' });
    const [filterOptions, setFilterOptions] = useState({ roles: [], subjects: [], classes: [] });
    const API_BASE = '/api/evaluations';

    const fetchAllEvaluations = useCallback(async ( ) => {
        try {
            setLoading(true);
            setError('');
            const response = await fetch(`${API_BASE}/list`);
            if (!response.ok) throw new Error('Failed to fetch evaluations');
            const data = await response.json();
            setEvaluations(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchFilterOptions = useCallback(async () => {
        try {
            const [rolesRes, subjectsRes] = await Promise.all([fetch(`${API_BASE}/roles`), fetch(`${API_BASE}/subjects`)]);
            const uniqueClasses = [...new Set(evaluations.map(e => e.class_name))].sort();
            if (rolesRes.ok && subjectsRes.ok) {
                setFilterOptions({ roles: await rolesRes.json(), subjects: await subjectsRes.json(), classes: uniqueClasses });
            }
        } catch (err) {
            console.error("Could not load filter options:", err);
        }
    }, [evaluations]);

    useEffect(() => {
        if (currentView === 'list') {
            fetchAllEvaluations();
        }
    }, [currentView, fetchAllEvaluations]);

    useEffect(() => {
        if (evaluations.length > 0 && currentView === 'list') {
            fetchFilterOptions();
        }
    }, [evaluations, currentView, fetchFilterOptions]);

    useEffect(() => {
        let filtered = [...evaluations];
        const searchTerm = filters.search.toLowerCase();
        if (searchTerm) filtered = filtered.filter(e => e.evaluation_name.toLowerCase().includes(searchTerm) || e.subject_name.toLowerCase().includes(searchTerm) || e.class_name.toLowerCase().includes(searchTerm) || e.evaluator_name.toLowerCase().includes(searchTerm));
        if (filters.role) filtered = filtered.filter(e => e.role_type === filters.role);
        if (filters.subject) filtered = filtered.filter(e => e.subject_name === filters.subject);
        if (filters.class) filtered = filtered.filter(e => e.class_name === filters.class);
        setFilteredEvaluations(filtered);
    }, [filters, evaluations]);

    const handleCreateNew = () => { setEditingEvaluationId(null); setShowCreateArea(true); };
    const handleEdit = (id) => { setEditingEvaluationId(id); setShowCreateArea(true); };
    const handleOpenForm = (id) => navigate(`/evaluation-form/${id}`);
    const handleViewDetails = (id) => navigate(`/evaluation/${id}`);
    const handleDelete = async (id) => { if (window.confirm('Are you sure? This action cannot be undone.')) { try { const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error('Delete failed'); fetchAllEvaluations(); } catch (err) { setError(err.message); } } };
    const handleCloseCreateArea = () => { setShowCreateArea(false); setEditingEvaluationId(null); };
    const handleEvaluationSaved = () => { handleCloseCreateArea(); fetchAllEvaluations(); };
    const handleAreaCreated = () => { setAreasRefreshKey(prev => prev + 1); };
    const handleFilterChange = (name, value) => setFilters(p => ({ ...p, [name]: value }));
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return (
        <div className={styles.evaluationManagerContainer}>
            <div className={styles.evaluationManagerHeader}>
                <div><h2>Student Evaluations</h2><p>Manage, create, and review all student evaluations.</p></div>
                <button 
                    onClick={() => showCreateArea ? handleCloseCreateArea() : handleCreateNew()} 
                    className={`${styles.evaluationManagerCreateButton} ${showCreateArea ? styles.closeButton : ''}`}
                >
                    {showCreateArea ? <FiX /> : <FiPlus />} {showCreateArea ? 'Close Form' : 'Create New Evaluation'}
                </button>
            </div>
            {error && <div className={styles.errorMessage}><FiAlertCircle /> {error}</div>}
            
            {/* Manage Evaluation Areas Section */}
            <ManageEvaluationAreas key={areasRefreshKey} onAreaCreated={handleAreaCreated} />
            
            {/* Create Evaluation Area */}
            {showCreateArea && (
                <motion.div 
                    className={styles.createEvaluationArea}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <CreateEvaluation 
                        evaluationId={editingEvaluationId} 
                        onEvaluationCreated={handleEvaluationSaved} 
                        onCancel={handleCloseCreateArea} 
                    />
                </motion.div>
            )}
            <div className={styles.evaluationManagerFilters}>
                <div className={styles.evaluationManagerFilterGroup}><FiSearch /><input type="text" placeholder="Search evaluations..." value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)} /></div>
                <select value={filters.role} onChange={(e) => handleFilterChange('role', e.target.value)}><option value="">All Roles</option>{filterOptions.roles.map(o => <option key={o} value={o}>{o}</option>)}</select>
                <select value={filters.subject} onChange={(e) => handleFilterChange('subject', e.target.value)}><option value="">All Subjects</option>{filterOptions.subjects.map(o => <option key={o.id} value={o.subject_name}>{o.subject_name}</option>)}</select>
                <select value={filters.class} onChange={(e) => handleFilterChange('class', e.target.value)}><option value="">All Classes</option>{filterOptions.classes.map(o => <option key={o} value={o}>{o}</option>)}</select>
            </div>
            {loading ? <div className={styles.evaluationManagerLoading}>Loading...</div> : (
                <div className={styles.evaluationManagerGrid}>
                    {filteredEvaluations.length === 0 ? (
                        <div className={styles.evaluationManagerEmpty}>
                            <FiClipboard size={48} />
                            <h3>No evaluations found</h3>
                            <p>Try adjusting your filters or create a new evaluation to get started.</p>
                        </div>
                    ) : (
                        filteredEvaluations.map(ev => (
                            <motion.div key={ev.id} className={styles.evaluationManagerCard} whileHover={{ y: -5 }}>
                                <div className={styles.evaluationManagerCardHeader}>
                                    <h3>{ev.evaluation_name}</h3>
                                    <span className={`${styles.evaluationManagerStatusBadge} ${styles[`status${ev.status}`]}`}>{ev.status}</span>
                                </div>
                                <div className={styles.evaluationManagerCardContent}>
                                    <span><FiBook /> {ev.subject_name}</span>
                                    <span><FiUsers /> {ev.class_name}</span>
                                    <span><FiCalendar /> {ev.term}</span>
                                    <span><FiUser /> {ev.evaluator_name}</span>
                                </div>
                                <div className={styles.evaluationManagerCardFooter}>
                                    <span className={styles.date}>Created: {formatDate(ev.created_at)}</span>
                                    <div className={styles.evaluationManagerCardActions}>
                                        <button onClick={() => handleViewDetails(ev.id)} title="View Details"><FiEye /></button>
                                        <button onClick={() => handleOpenForm(ev.id)} title="Open Form"><FiClipboard /></button>
                                        <button onClick={() => handleEdit(ev.id)} title="Edit"><FiEdit2 /></button>
                                        <button onClick={() => handleDelete(ev.id)} title="Delete" className={styles.deleteButton}><FiTrash2 /></button>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export { EvaluationManager };
