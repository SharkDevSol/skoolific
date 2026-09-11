import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUserCheck, FiUsers, FiRefreshCw, FiPlus, FiTrash2, 
  FiCheck, FiX, FiEdit2, FiSave
} from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './ClassTeacherAssignment.module.css';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const ClassTeacherAssignment = () => {
  const { t } = useApp();
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersRes, classesRes, assignmentsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/class-teacher/teachers`),
        axios.get(`${API_BASE_URL}/class-teacher/classes`),
        axios.get(`${API_BASE_URL}/class-teacher/assignments`)
      ]);
      setTeachers(teachersRes.data);
      setClasses(classesRes.data);
      setAssignments(assignmentsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedTeacher || !selectedClass) {
      setMessage({ type: 'error', text: 'Please select both teacher and class' });
      return;
    }

    const teacher = teachers.find(t => t.global_staff_id.toString() === selectedTeacher);
    if (!teacher) {
      setMessage({ type: 'error', text: 'Teacher not found' });
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/class-teacher/assign`, {
        global_staff_id: parseInt(selectedTeacher),
        teacher_name: teacher.teacher_name,
        assigned_class: selectedClass
      });
      
      setMessage({ type: 'success', text: `${teacher.teacher_name} assigned to ${selectedClass}` });
      setSelectedTeacher('');
      setSelectedClass('');
      fetchData();
    } catch (error) {
      console.error('Error assigning teacher:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to assign teacher' });
    }
  };

  const handleUnassign = async (className) => {
    if (!window.confirm(`Remove class teacher from ${className}?`)) return;

    try {
      await axios.delete(`${API_BASE_URL}/class-teacher/unassign/${className}`);
      setMessage({ type: 'success', text: `Teacher unassigned from ${className}` });
      fetchData();
    } catch (error) {
      console.error('Error unassigning teacher:', error);
      setMessage({ type: 'error', text: 'Failed to unassign teacher' });
    }
  };

  // Get unassigned classes
  const assignedClasses = assignments.map(a => a.assigned_class);
  const unassignedClasses = classes.filter(c => !assignedClasses.includes(c));

  return (
    <motion.div className={styles.container} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><FiUserCheck /></div>
          <div>
            <h1>{t('classTeacherAssignment')}</h1>
            <p>{t('classTeacherAssignmentDesc')}</p>
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={fetchData}>
          <FiRefreshCw /> {t('refresh')}
        </button>
      </div>

      {message.text && (
        <motion.div 
          className={`${styles.message} ${styles[message.type]}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {message.type === 'success' ? <FiCheck /> : <FiX />}
          {message.text}
          <button onClick={() => setMessage({ type: '', text: '' })}><FiX /></button>
        </motion.div>
      )}

      {/* Assignment Form */}
      <div className={styles.assignmentForm}>
        <h3><FiPlus /> {t('assignClassTeacher')}</h3>
        <div className={styles.formRow}>
          <div className={styles.selectGroup}>
            <label>{t('selectTeacherLabel')}</label>
            <select 
              value={selectedTeacher} 
              onChange={(e) => setSelectedTeacher(e.target.value)}
            >
              <option value="">{t('selectTeacher')}</option>
              {teachers.map(teacher => (
                <option key={teacher.global_staff_id} value={teacher.global_staff_id}>
                  {teacher.teacher_name} ({teacher.staff_work_time})
                </option>
              ))}
            </select>
          </div>
          <div className={styles.selectGroup}>
            <label>{t('selectClassLabel')}</label>
            <select 
              value={selectedClass} 
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">{t('selectClass')}</option>
              {unassignedClasses.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
          <button className={styles.assignBtn} onClick={handleAssign}>
            <FiSave /> {t('assign')}
          </button>
        </div>
      </div>

      {/* Current Assignments */}
      <div className={styles.assignmentsSection}>
        <h3><FiUsers /> {t('currentAssignments')} ({assignments.length})</h3>
        
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loader}></div>
            <p>{t('loading')}</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className={styles.emptyState}>
            <FiUserCheck size={48} />
            <p>{t('noClassTeachersAssigned')}</p>
          </div>
        ) : (
          <div className={styles.assignmentsGrid}>
            <AnimatePresence>
              {assignments.map((assignment, idx) => (
                <motion.div 
                  key={assignment.id}
                  className={styles.assignmentCard}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.className}>{assignment.assigned_class}</span>
                    <button 
                      className={styles.removeBtn}
                      onClick={() => handleUnassign(assignment.assigned_class)}
                      title="Remove assignment"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.teacherInfo}>
                      <FiUserCheck className={styles.teacherIcon} />
                      <div>
                        <span className={styles.teacherName}>{assignment.teacher_name}</span>
                        <span className={styles.workTime}>{assignment.staff_work_time || 'Full Time'}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardFooter}>
                    <span>{t('assigned')}: {new Date(assignment.assigned_at).toLocaleDateString()}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Unassigned Classes */}
      {unassignedClasses.length > 0 && (
        <div className={styles.unassignedSection}>
          <h3>{t('unassignedClasses')} ({unassignedClasses.length})</h3>
          <div className={styles.unassignedList}>
            {unassignedClasses.map(cls => (
              <span key={cls} className={styles.unassignedClass}>{cls}</span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ClassTeacherAssignment;
