import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FiArrowLeft, FiSend, FiUser, FiCalendar, FiStar, FiCheck, FiAlertCircle 
} from 'react-icons/fi';
import styles from './GuardianFeedbackForm.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const GuardianFeedbackForm = () => {
  const { evaluationId } = useParams();
  const [searchParams] = useSearchParams();
  const guardianId = searchParams.get('guardianId');
  const navigate = useNavigate();

  const [evaluation, setEvaluation] = useState(null);
  const [template, setTemplate] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchEvaluation = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/daily/${evaluationId}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('Access denied');
        throw new Error('Failed to fetch evaluation');
      }
      
      const data = await res.json();
      setEvaluation(data);
      setFeedbackText(data.feedback_text || '');

      // Fetch template if available
      if (data.template_id) {
        const templateRes = await fetch(`${API_BASE}/templates/${data.template_id}`);
        if (templateRes.ok) {
          setTemplate(await templateRes.json());
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!feedbackText.trim()) {
      setError('Please enter your feedback');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_evaluation_id: parseInt(evaluationId),
          guardian_id: guardianId,
          feedback_text: feedbackText.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setSuccess('Feedback submitted successfully!');
      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderFieldValue = (field, value) => {
    if (field.field_type === 'rating') {
      return (
        <div className={styles.ratingDisplay}>
          {[...Array(field.max_rating || 5)].map((_, i) => (
            <FiStar key={i} className={i < value ? styles.filled : ''} />
          ))}
          <span>{value}/{field.max_rating || 5}</span>
        </div>
      );
    }
    return <span>{value || '-'}</span>;
  };

  if (loading) {
    return <div className={styles.loading}>Loading evaluation...</div>;
  }

  if (error && !evaluation) {
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
        <h2>Evaluation Feedback</h2>
      </div>

      {error && <div className={styles.error}><FiAlertCircle /> {error}</div>}
      {success && <div className={styles.success}><FiCheck /> {success}</div>}

      {evaluation && (
        <>
          <div className={styles.evaluationInfo}>
            <div className={styles.infoRow}>
              <FiUser />
              <span className={styles.studentName}>{evaluation.student_name}</span>
            </div>
            <div className={styles.infoRow}>
              <FiCalendar />
              <span>{new Date(evaluation.evaluation_date).toLocaleDateString()}</span>
              <span className={styles.className}>{evaluation.class_name}</span>
            </div>
          </div>

          {template && evaluation.field_values && (
            <div className={styles.teacherEvaluation}>
              <h3>Teacher's Evaluation</h3>
              <div className={styles.fieldsGrid}>
                {template.fields?.filter(f => !f.is_guardian_field).map(field => (
                  <div key={field.id} className={styles.fieldItem}>
                    <label>{field.field_name}</label>
                    {renderFieldValue(field, evaluation.field_values[field.id])}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.feedbackForm}>
            <h3>Your Feedback</h3>
            <p className={styles.hint}>Share your observations about your ward's progress</p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Enter your feedback here..."
              rows={5}
              disabled={submitting}
            />
            <button type="submit" disabled={submitting || !feedbackText.trim()}>
              <FiSend /> {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default GuardianFeedbackForm;
