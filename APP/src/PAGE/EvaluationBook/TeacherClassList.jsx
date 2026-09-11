import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUsers, FiChevronRight, FiClipboard, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import styles from './TeacherClassList.module.css';

const API_BASE = '/api/evaluation-book';

const TeacherClassList = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Get teacher ID from localStorage or auth context
  const getTeacherId = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.global_staff_id || user.id || null;
  };

  const fetchAssignedClasses = useCallback(async () => {
    const teacherId = getTeacherId();
    if (!teacherId) {
      setError('Teacher ID not found. Please log in again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const res = await fetch(`${API_BASE}/teacher/${teacherId}/classes`);
      if (!res.ok) {
        throw new Error('Failed to fetch assigned classes');
      }
      
      const data = await res.json();
      setClasses(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignedClasses();
  }, [fetchAssignedClasses]);

  const handleClassClick = (className) => {
    navigate(`/evaluation-book/daily/${encodeURIComponent(className)}`);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading your assigned classes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <FiAlertCircle size={32} />
          <p>{error}</p>
          <button onClick={fetchAssignedClasses} className={styles.retryBtn}>
            <FiRefreshCw /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>My Classes</h2>
        <p>Select a class to fill out daily evaluations</p>
      </div>

      {classes.length === 0 ? (
        <div className={styles.empty}>
          <FiUsers size={48} />
          <h3>No Classes Assigned</h3>
          <p>You haven't been assigned to any classes yet. Please contact an administrator.</p>
        </div>
      ) : (
        <div className={styles.classList}>
          {classes.map((classItem, index) => (
            <div
              key={classItem.class_name || index}
              className={styles.classCard}
              onClick={() => handleClassClick(classItem.class_name)}
            >
              <div className={styles.classIcon}>
                <FiUsers />
              </div>
              <div className={styles.classInfo}>
                <h3>{classItem.class_name}</h3>
                <span className={styles.studentCount}>
                  {classItem.student_count || 0} students
                </span>
              </div>
              <div className={styles.classAction}>
                <FiClipboard />
                <span>Evaluate</span>
                <FiChevronRight />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherClassList;
