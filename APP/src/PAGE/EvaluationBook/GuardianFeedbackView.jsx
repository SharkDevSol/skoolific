import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiMessageSquare, FiUser, FiCalendar, FiChevronDown, FiChevronUp, 
  FiCheck, FiClock, FiFilter, FiAlertCircle 
} from 'react-icons/fi';
import styles from './GuardianFeedbackView.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const GuardianFeedbackView = ({ teacherId }) => {
  const [evaluations, setEvaluations] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchData = useCallback(async () => {
    if (!teacherId) {
      setError('Teacher ID is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get teacher's assigned classes
      const classesRes = await fetch(`${API_BASE}/teacher/${teacherId}/classes`);
      if (!classesRes.ok) throw new Error('Failed to fetch classes');
      const classesData = await classesRes.json();
      setClasses(classesData);

      // Get evaluations with feedback for teacher's classes
      const reportsRes = await fetch(`${API_BASE}/reports/teacher/${teacherId}`);
      if (!reportsRes.ok) throw new Error('Failed to fetch evaluations');
      const reportsData = await reportsRes.json();
      
      // Filter to show only sent/responded evaluations
      const withFeedbackStatus = reportsData.entries.filter(e => 
        e.status !== 'pending'
      );
      setEvaluations(withFeedbackStatus);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredEvaluations = selectedClass
    ? evaluations.filter(e => e.class_name === selectedClass)
    : evaluations;

  const getStatusInfo = (evaluation) => {
    if (evaluation.feedback_text) {
      return { icon: FiCheck, label: 'Responded', class: styles.responded };
    }
    return { icon: FiClock, label: 'Awaiting Response', class: styles.pending };
  };

  const respondedCount = evaluations.filter(e => e.feedback_text).length;
  const pendingCount = evaluations.filter(e => !e.feedback_text && e.status === 'sent').length;

  if (loading) {
    return <div className={styles.loading}>Loading feedback...</div>;
  }

  if (error) {
    return (
      <div className={styles.error}>
        <FiAlertCircle size={24} />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2><FiMessageSquare /> Guardian Feedback</h2>
          <p>View responses from guardians on your evaluations</p>
        </div>
        <div className={styles.stats}>
          <span className={styles.statResponded}>{respondedCount} responded</span>
          <span className={styles.statPending}>{pendingCount} pending</span>
        </div>
      </div>

      {classes.length > 1 && (
        <div className={styles.filterBar}>
          <FiFilter />
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(cls => (
              <option key={cls.class_name} value={cls.class_name}>{cls.class_name}</option>
            ))}
          </select>
        </div>
      )}

      {filteredEvaluations.length === 0 ? (
        <div className={styles.empty}>
          <FiMessageSquare size={48} />
          <h3>No Evaluations</h3>
          <p>No evaluations have been sent to guardians yet.</p>
        </div>
      ) : (
        <div className={styles.evaluationsList}>
          {filteredEvaluations.map((evaluation) => {
            const statusInfo = getStatusInfo(evaluation);
            const isExpanded = expandedId === evaluation.id;
            
            return (
              <motion.div
                key={evaluation.id}
                className={styles.evaluationCard}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div 
                  className={styles.cardHeader}
                  onClick={() => setExpandedId(isExpanded ? null : evaluation.id)}
                >
                  <div className={styles.studentInfo}>
                    <FiUser />
                    <span>{evaluation.student_name}</span>
                    <span className={styles.className}>{evaluation.class_name}</span>
                  </div>
                  <div className={styles.headerRight}>
                    <span className={`${styles.statusBadge} ${statusInfo.class}`}>
                      <statusInfo.icon /> {statusInfo.label}
                    </span>
                    {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                  </div>
                </div>
                
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      className={styles.cardContent}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <div className={styles.meta}>
                        <FiCalendar />
                        <span>{new Date(evaluation.evaluation_date).toLocaleDateString()}</span>
                      </div>
                      
                      {evaluation.feedback_text ? (
                        <div className={styles.feedbackSection}>
                          <h4>Guardian's Response</h4>
                          <p>{evaluation.feedback_text}</p>
                          {evaluation.feedback_submitted_at && (
                            <span className={styles.timestamp}>
                              Submitted {new Date(evaluation.feedback_submitted_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className={styles.noFeedback}>
                          <FiClock />
                          <span>Waiting for guardian response...</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GuardianFeedbackView;
