import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FiInbox, FiUser, FiCalendar, FiMessageSquare, FiCheck, FiAlertCircle, FiFilter 
} from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './GuardianEvaluationInbox.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const GuardianEvaluationInbox = ({ guardianId }) => {
  const { t } = useApp();
  const [evaluations, setEvaluations] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedWard, setSelectedWard] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchEvaluations = useCallback(async () => {
    if (!guardianId) {
      setError('Guardian ID is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let url = `${API_BASE}/daily/guardian/${guardianId}`;
      if (selectedWard) {
        url += `?studentName=${encodeURIComponent(selectedWard)}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch evaluations');
      
      const data = await res.json();
      setEvaluations(data);
      
      // Extract unique wards
      const uniqueWards = [...new Set(data.map(e => e.student_name))];
      setWards(uniqueWards);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [guardianId, selectedWard]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  const handleEvaluationClick = (evaluation) => {
    navigate(`/evaluation-book/guardian/feedback/${evaluation.id}?guardianId=${guardianId}`);
  };

  const getStatusBadge = (status, hasFeedback) => {
    if (hasFeedback) return { label: t('responded'), class: styles.responded };
    switch (status) {
      case 'sent': return { label: t('pendingResponse'), class: styles.pending };
      case 'responded': return { label: t('responded'), class: styles.responded };
      case 'completed': return { label: t('completed'), class: styles.completed };
      default: return { label: status, class: '' };
    }
  };

  const pendingCount = evaluations.filter(e => e.status === 'sent' && !e.feedback_text).length;

  if (loading) {
    return <div className={styles.loading}>{t('loading')}</div>;
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
          <h2><FiInbox /> {t('evaluationInbox')}</h2>
          <p>{t('evaluationInboxDesc')}</p>
        </div>
        {pendingCount > 0 && (
          <div className={styles.pendingBadge}>
            {pendingCount} {t('pending')}
          </div>
        )}
      </div>

      {wards.length > 1 && (
        <div className={styles.filterBar}>
          <FiFilter />
          <select value={selectedWard} onChange={(e) => setSelectedWard(e.target.value)}>
            <option value="">{t('allWards')}</option>
            {wards.map(ward => (
              <option key={ward} value={ward}>{ward}</option>
            ))}
          </select>
        </div>
      )}

      {evaluations.length === 0 ? (
        <div className={styles.empty}>
          <FiInbox size={48} />
          <h3>{t('noEvaluationsYet')}</h3>
          <p>{t('noEvaluationsDesc')}</p>
        </div>
      ) : (
        <div className={styles.evaluationsList}>
          {evaluations.map((evaluation, index) => {
            const statusInfo = getStatusBadge(evaluation.status, evaluation.feedback_text);
            return (
              <motion.div
                key={evaluation.id}
                className={styles.evaluationCard}
                onClick={() => handleEvaluationClick(evaluation)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.01 }}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.studentInfo}>
                    <FiUser />
                    <span>{evaluation.student_name}</span>
                  </div>
                  <span className={`${styles.statusBadge} ${statusInfo.class}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <div className={styles.cardContent}>
                  <div className={styles.meta}>
                    <span><FiCalendar /> {new Date(evaluation.evaluation_date).toLocaleDateString()}</span>
                    <span>{evaluation.class_name}</span>
                  </div>
                  {evaluation.feedback_text ? (
                    <div className={styles.feedbackPreview}>
                      <FiMessageSquare />
                      <span>{evaluation.feedback_text.substring(0, 100)}...</span>
                    </div>
                  ) : (
                    <div className={styles.actionHint}>
                      <FiCheck /> {t('tapToAddFeedback')}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GuardianEvaluationInbox;
