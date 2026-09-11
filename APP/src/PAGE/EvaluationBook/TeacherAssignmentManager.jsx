import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiTrash2, FiUsers, FiUser, FiCheck, FiAlertCircle, FiSearch } from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './TeacherAssignmentManager.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const TeacherAssignmentManager = () => {
  const { t } = useApp();
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    teacher_global_id: '',
    teacher_name: '',
    class_name: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [assignmentsRes, teachersRes, classesRes] = await Promise.all([
        fetch(`${API_BASE}/assignments`),
        fetch(`${API_BASE}/teachers`),
        fetch(`${API_BASE}/classes`)
      ]);

      if (!assignmentsRes.ok || !teachersRes.ok || !classesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      setAssignments(await assignmentsRes.json());
      setTeachers(await teachersRes.json());
      setClasses(await classesRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTeacherChange = (e) => {
    const teacherId = e.target.value;
    const teacher = teachers.find(t => t.global_staff_id?.toString() === teacherId);
    setFormData(prev => ({
      ...prev,
      teacher_global_id: teacherId,
      teacher_name: teacher?.name || ''
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.teacher_global_id || !formData.class_name) {
      setError('Please select both a teacher and a class');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`${API_BASE}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          assigned_by: 1 // TODO: Get from auth context
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create assignment');
      }

      setSuccess('Teacher assigned successfully');
      setFormData({ teacher_global_id: '', teacher_name: '', class_name: '' });
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/assignments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove assignment');
      setSuccess('Assignment removed');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredAssignments = assignments.filter(a =>
    a.teacher_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.class_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group assignments by class
  const groupedByClass = filteredAssignments.reduce((acc, a) => {
    if (!acc[a.class_name]) acc[a.class_name] = [];
    acc[a.class_name].push(a);
    return acc;
  }, {});

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>{t('teacherAssignments')}</h2>
          <p>{t('teacherAssignmentsDesc')}</p>
        </div>
      </div>

      {error && <div className={styles.error}><FiAlertCircle /> {error}</div>}
      {success && <div className={styles.success}><FiCheck /> {success}</div>}

      {/* Assignment Form */}
      <div className={styles.formCard}>
        <h3><FiPlus /> {t('newAssignment')}</h3>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label><FiUser /> {t('teacher')}</label>
            <select value={formData.teacher_global_id} onChange={handleTeacherChange} required>
              <option value="">{t('selectTeacher')}</option>
              {teachers.map(teacher => (
                <option key={teacher.global_staff_id} value={teacher.global_staff_id}>{teacher.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label><FiUsers /> {t('classComm')}</label>
            <select value={formData.class_name} onChange={(e) => setFormData(prev => ({ ...prev, class_name: e.target.value }))} required>
              <option value="">{t('selectClass')}</option>
              {classes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
            <FiPlus /> {isSubmitting ? t('assigning') : t('assignTeacher')}
          </button>
        </form>
      </div>


      {/* Search */}
      <div className={styles.searchBar}>
        <FiSearch />
        <input
          type="text"
          placeholder={t('searchByNameEmailUsername')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Assignments List */}
      {loading ? (
        <div className={styles.loading}>{t('loading')}</div>
      ) : Object.keys(groupedByClass).length === 0 ? (
        <div className={styles.empty}>
          <FiUsers size={48} />
          <h3>{t('noAssignmentsYet')}</h3>
          <p>{t('assignTeachersAbove')}</p>
        </div>
      ) : (
        <div className={styles.assignmentsList}>
          {Object.entries(groupedByClass).sort(([a], [b]) => a.localeCompare(b)).map(([className, classAssignments]) => (
            <motion.div 
              key={className} 
              className={styles.classCard}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className={styles.classHeader}>
                <FiUsers />
                <h4>{className}</h4>
                <span className={styles.count}>{classAssignments.length} {t('teacherCount')}</span>
              </div>
              <div className={styles.teachersList}>
                {classAssignments.map(a => (
                  <div key={a.id} className={styles.teacherItem}>
                    <div className={styles.teacherInfo}>
                      <FiUser />
                      <span>{a.teacher_name}</span>
                    </div>
                    <button 
                      onClick={() => handleDelete(a.id)} 
                      className={styles.removeBtn}
                      title="Remove assignment"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherAssignmentManager;
