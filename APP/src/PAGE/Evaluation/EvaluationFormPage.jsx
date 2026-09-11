import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FiArrowLeft, FiSave, FiUser, FiBook,
  FiCalendar, FiUsers, FiBarChart2, FiAlertCircle
} from 'react-icons/fi';
import styles from './EvaluationFormPage.module.css';

const EvaluationFormPage = () => {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationForm, setEvaluationForm] = useState(null);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const API_BASE = '/api/evaluations';
  
  const fetchEvaluationForm = useCallback(async ( ) => {
    try {
      setLoading(true);
      setError('');
      
      const formResponse = await fetch(`${API_BASE}/${evaluationId}/form`);
      if (!formResponse.ok) {
        const errorData = await formResponse.json();
        throw new Error(errorData.error || 'Failed to fetch evaluation form');
      }
      
      const formData = await formResponse.json();
      
      setEvaluation(formData.evaluation);
      setEvaluationForm(formData);
      setStudents(formData.students || []);
      
      // Initialize scores state from the fetched data
      const initialScores = {};
      (formData.students || []).forEach(student => {
        initialScores[student.student_name] = {};
        (formData.areas || []).forEach(area => {
          (area.criteria || []).forEach(criterion => {
            // --- THIS IS THE CORRECTED LOGIC ---
            // The backend sends a 'scores' object on the student.
            // We access the score directly using the criterion's ID as the key.
            const existingScore = student.scores?.[criterion.id];
            
            initialScores[student.student_name][criterion.id] = {
              score: existingScore?.score || 0,
              notes: existingScore?.notes || ''
            };
          });
        });
      });
      setScores(initialScores);
      
    } catch (err) {
      console.error('Error fetching evaluation form:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    if (evaluationId) {
      fetchEvaluationForm();
    }
  }, [evaluationId, fetchEvaluationForm]);
  
  const updateScore = (studentName, criteriaId, field, value) => {
    setScores(prev => ({
      ...prev,
      [studentName]: {
        ...prev[studentName],
        [criteriaId]: {
          ...prev[studentName]?.[criteriaId],
          [field]: field === 'score' ? parseInt(value) || 0 : value
        }
      }
    }));
  };
  
  const calculateStudentTotal = (studentName) => {
    if (!evaluationForm?.areas || !scores[studentName]) return 0;
    
    return evaluationForm.areas.reduce((total, area) => {
      area.criteria?.forEach(criterion => {
        total += scores[studentName]?.[criterion.id]?.score || 0;
      });
      return total;
    }, 0);
  };
  
  const saveAllScores = async () => {
    setIsSubmitting(true);
    setError('');

    const responsesPayload = students.map(student => {
        const studentScores = {};
        evaluationForm.areas.forEach(area => {
            area.criteria.forEach(criterion => {
                const scoreData = scores[student.student_name]?.[criterion.id];
                if (scoreData) {
                    // The backend POST /responses endpoint expects the column_name
                    studentScores[criterion.criteria_name] = {
                        score: scoreData.score,
                        notes: scoreData.notes
                    };
                }
            });
        });

        return {
            student_name: student.student_name,
            student_age: student.student_age,
            student_gender: student.student_gender,
            student_class: evaluation.class_name,
            scores: studentScores
        };
    });

    try {
        const response = await fetch(`${API_BASE}/${evaluationId}/responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responses: responsesPayload }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save scores');
        }
        
        alert('All scores saved successfully!');
        navigate('/evaluation');

    } catch (err) {
        console.error('Error saving all scores:', err);
        setError(err.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}><div className={styles.spinner}></div><p>Loading evaluation form...</p></div></div>;
  }
  
  if (error) {
    return <div className={styles.container}><div className={styles.error}><FiAlertCircle/><h3>Error Loading Form</h3><p>{error}</p><button onClick={() => navigate('/evaluation')} className={styles.backButton}><FiArrowLeft />Back</button></div></div>;
  }
  
  if (!evaluation || !evaluationForm) {
    return <div className={styles.container}><div className={styles.error}><h3>Evaluation Not Found</h3></div></div>;
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/evaluation')} className={styles.backButton}><FiArrowLeft />Back</button>
        <div className={styles.evaluationInfo}>
          <h1 className={styles.title}>{evaluation.evaluation_name}</h1>
          <div className={styles.metadata}>
            <span><FiBook />{evaluation.subject_name}</span>
            <span><FiUsers />{evaluation.class_name}</span>
            <span><FiCalendar />{evaluation.term}</span>
            <span><FiUser />{evaluation.staff_name}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button onClick={saveAllScores} className={styles.saveAllButton} disabled={isSubmitting}><FiSave />{isSubmitting ? 'Saving...' : 'Save All'}</button>
        </div>
      </div>
      
      <div className={styles.formContainer}>
        <div className={styles.studentsTable}>
          <div className={styles.tableHeader}>
            <div className={styles.studentInfo}>Student Information</div>
            <div className={styles.areasHeader}>
              <span>Evaluation Criteria</span>
              <div className={styles.areasSubheader}>
                {evaluationForm.areas?.map(area => (
                  <div key={area.id} className={styles.areaColumn}>
                    <div className={styles.areaName}>{area.area_name}</div>
                    <div className={styles.criteriaHeaders}>
                      {area.criteria?.map(criterion => (
                        <div key={criterion.id} className={styles.criterionHeader}>{criterion.criteria_name} (/{criterion.max_points})</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.totalHeader}><FiBarChart2 />Total</div>
          </div>
          
          {students.map((student, index) => (
            <motion.div key={student.student_name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={styles.studentRow}>
              <div className={styles.studentInfo}>
                <div className={styles.studentName}>{student.student_name}</div>
                <div className={styles.studentDetails}><span>Age: {student.student_age}</span><span>Gender: {student.student_gender}</span></div>
              </div>
              <div className={styles.areasScores}>
                {evaluationForm.areas?.map(area => (
                  <div key={area.id} className={styles.areaScores}>
                    {area.criteria?.map(criterion => (
                      <div key={criterion.id} className={styles.criterionScore}>
                        <select value={scores[student.student_name]?.[criterion.id]?.score || 0} onChange={(e) => updateScore(student.student_name, criterion.id, 'score', e.target.value)} className={styles.scoreSelect}>
                          {Array.from({ length: criterion.max_points + 1 }, (_, i) => (<option key={i} value={i}>{i}</option>))}
                        </select>
                        <textarea placeholder="Notes..." value={scores[student.student_name]?.[criterion.id]?.notes || ''} onChange={(e) => updateScore(student.student_name, criterion.id, 'notes', e.target.value)} className={styles.notesInput} rows={1}/>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className={styles.totalScore}><span className={styles.scoreValue}>{calculateStudentTotal(student.student_name)}</span></div>
            </motion.div>
          ))}
        </div>
        {students.length === 0 && <div className={styles.emptyState}><FiUsers /><h3>No Students Found</h3></div>}
      </div>
    </div>
  );
};

export default EvaluationFormPage;