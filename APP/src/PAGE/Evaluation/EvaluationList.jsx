import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  FiSearch, 
  FiEye, 
  FiEdit2, 
  FiTrash2,
  FiPlus,
  FiCalendar,
  FiUser,
  FiBook,
  FiUsers,
  FiClipboard,
  FiAlertCircle
} from 'react-icons/fi';
import styles from './EvaluationList.module.css';

const EvaluationList = ({ onCreateNew, onViewEvaluation, onEditEvaluation, onOpenForm }) => {
  const [evaluations, setEvaluations] = useState([]);
  const [filteredEvaluations, setFilteredEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterClass, setFilterClass] = useState('');
  
  // Options for filters
  const [roles, setRoles] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  
  const API_BASE = '/api/evaluations';
  
  const fetchEvaluations = useCallback(async ( ) => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_BASE}/list`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch evaluations');
      }
      const data = await response.json();
      setEvaluations(data);
      // Extract unique classes from the fetched evaluations
      const uniqueClasses = [...new Set(data.map(evaluation => evaluation.class_name))].sort();
      setClasses(uniqueClasses);
    } catch (err) {
      console.error('Error fetching evaluations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      // Fetch roles
      const rolesResponse = await fetch(`${API_BASE}/roles`);
      if (rolesResponse.ok) {
        const rolesData = await rolesResponse.json();
        if (Array.isArray(rolesData)) setRoles(rolesData);
      }
      
      // Fetch subjects
      const subjectsResponse = await fetch(`${API_BASE}/subjects`);
      if (subjectsResponse.ok) {
        const subjectsData = await subjectsResponse.json();
        if (Array.isArray(subjectsData)) setSubjects(subjectsData);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
      // Non-critical error, so we don't set the main error state
    }
  }, []);
  
  useEffect(() => {
    fetchEvaluations();
    fetchFilterOptions();
  }, [fetchEvaluations, fetchFilterOptions]);
  
  useEffect(() => {
    let filtered = evaluations;
    
    if (searchTerm) {
      filtered = filtered.filter(evaluation =>
        evaluation.evaluation_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evaluation.evaluator_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evaluation.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evaluation.class_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filterRole) filtered = filtered.filter(evaluation => evaluation.role_type === filterRole);
    if (filterSubject) filtered = filtered.filter(evaluation => evaluation.subject_name === filterSubject);
    if (filterClass) filtered = filtered.filter(evaluation => evaluation.class_name === filterClass);
    
    setFilteredEvaluations(filtered);
  }, [evaluations, searchTerm, filterRole, filterSubject, filterClass]);
  
  const handleDeleteEvaluation = async (evaluationId) => {
    if (!window.confirm('Are you sure you want to delete this evaluation? This action is permanent.')) return;
    
    try {
      const response = await fetch(`${API_BASE}/${evaluationId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete evaluation');
      }
      // Refresh evaluations list after successful deletion
      fetchEvaluations();
    } catch (err) {
      console.error('Error deleting evaluation:', err);
      setError('Failed to delete evaluation: ' + err.message);
    }
  };
  
  const clearFilters = () => {
    setSearchTerm('');
    setFilterRole('');
    setFilterSubject('');
    setFilterClass('');
  };
  
  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}><div className={styles.spinner}></div><p>Loading evaluations...</p></div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}><h1 className={styles.title}>Student Evaluations</h1><p className={styles.subtitle}>Manage and view all student evaluations</p></div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={styles.createButton} onClick={onCreateNew}>
          <FiPlus className={styles.buttonIcon} /> Create New Evaluation
        </motion.button>
      </div>
      
      {error && (
        <div className={styles.errorMessage}>
          <FiAlertCircle /> <span>{error}</span>
          <button onClick={() => setError('')} className={styles.closeError}>×</button>
        </div>
      )}
      
      <div className={styles.filtersSection}>
        <div className={styles.searchContainer}>
          <FiSearch className={styles.searchIcon} /><input type="text" placeholder="Search evaluations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={styles.searchInput} />
        </div>
        <div className={styles.filters}>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className={styles.filterSelect}>
            <option value="">All Roles</option>
            {roles.map(role => (<option key={role} value={role}>{role}</option>))}
          </select>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className={styles.filterSelect}>
            <option value="">All Subjects</option>
            {subjects.map(subject => (<option key={subject.id} value={subject.subject_name}>{subject.subject_name}</option>))}
          </select>
          <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className={styles.filterSelect}>
            <option value="">All Classes</option>
            {classes.map(className => (<option key={className} value={className}>{className}</option>))}
          </select>
          <button onClick={clearFilters} className={styles.clearFilters}>Clear Filters</button>
        </div>
      </div>
      
      <div className={styles.evaluationsGrid}>
        {filteredEvaluations.length === 0 ? (
          <div className={styles.emptyState}>
            <FiUsers className={styles.emptyIcon} />
            <h3>No evaluations found</h3>
            <p>{evaluations.length === 0 ? "Create your first evaluation to get started" : "Try adjusting your search or filter criteria"}</p>
          </div>
        ) : (
          filteredEvaluations.map((evaluation) => (
            <motion.div key={evaluation.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -5 }} className={styles.evaluationCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.evaluationName}>{evaluation.evaluation_name}</h3>
                <div className={styles.cardActions}>
                  <button onClick={() => onViewEvaluation(evaluation.id)} className={styles.actionButton} title="View Details"><FiEye /></button>
                  <button onClick={() => onOpenForm(evaluation.id)} className={styles.actionButton} title="Open Form"><FiClipboard /></button>
                  <button onClick={() => onEditEvaluation(evaluation.id)} className={styles.actionButton} title="Edit"><FiEdit2 /></button>
                  <button onClick={() => handleDeleteEvaluation(evaluation.id)} className={`${styles.actionButton} ${styles.deleteButton}`} title="Delete"><FiTrash2 /></button>
                </div>
              </div>
              <div className={styles.cardContent}>
                <div className={styles.infoItem}><FiBook className={styles.infoIcon} /><span>{evaluation.subject_name}</span></div>
                <div className={styles.infoItem}><FiUsers className={styles.infoIcon} /><span>{evaluation.class_name}</span></div>
                <div className={styles.infoItem}><FiCalendar className={styles.infoIcon} /><span>{evaluation.term}</span></div>
                <div className={styles.infoItem}><FiUser className={styles.infoIcon} /><span>{evaluation.evaluator_name} ({evaluation.role_type})</span></div>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.createdDate}>Created: {formatDate(evaluation.created_at)}</span>
                <span className={`${styles.status} ${styles[evaluation.status]}`}>{evaluation.status}</span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default EvaluationList;
