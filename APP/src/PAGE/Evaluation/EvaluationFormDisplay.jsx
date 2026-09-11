import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiSave, FiArrowLeft, FiUser, FiClipboard, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import styles from './Evaluation.module.css'; // Assuming shared styles

const EvaluationFormDisplay = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [evaluation, setEvaluation] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    const fetchEvaluationData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch evaluation details
        const evaluationRes = await fetch(`/api/evaluations/${id}`);
        if (!evaluationRes.ok) {
          throw new Error(`Failed to fetch evaluation details: ${evaluationRes.statusText}`);
        }
        const evaluationData = await evaluationRes.json();
        setEvaluation(evaluationData);

        // Fetch students and their existing responses
        const studentsRes = await fetch(`/api/evaluations/${id}/students`);
        if (!studentsRes.ok) {
          throw new Error(`Failed to fetch students for evaluation: ${studentsRes.statusText}`);
        }
        const studentsData = await studentsRes.json();
        setStudents(studentsData);

      } catch (err) {
        console.error('Error fetching evaluation data:', err);
        setError(err.message || 'Failed to load evaluation data.');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchEvaluationData();
    }
  }, [id]);

  const handleScoreChange = (studentName, columnName, score) => {
    setStudents(prevStudents =>
      prevStudents.map(student =>
        student.student_name === studentName
          ? {
              ...student,
              responses: {
                ...student.responses,
                [columnName]: { ...student.responses[columnName], score: parseInt(score) || 0 }
              }
            }
          : student
      )
    );
  };

  const handleNotesChange = (studentName, columnName, notes) => {
    setStudents(prevStudents =>
      prevStudents.map(student =>
        student.student_name === studentName
          ? {
              ...student,
              responses: {
                ...student.responses,
                [columnName]: { ...student.responses[columnName], notes: notes }
              }
            }
          : student
      )
    );
  };

  const handleSubmitResponses = async () => {
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const formattedResponses = students.map(student => ({
      student_name: student.student_name,
      student_age: student.age,
      student_gender: student.gender,
      student_class: student.class,
      scores: Object.entries(student.responses).reduce((acc, [columnName, data]) => {
        acc[columnName] = { score: data.score, notes: data.notes };
        return acc;
      }, {})
    }));

    try {
      const response = await fetch(`/api/evaluations/${id}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ responses: formattedResponses }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit responses');
      }

      setSuccessMessage('Evaluation responses submitted successfully!');
    } catch (err) {
      console.error('Error submitting responses:', err);
      setError(err.message || 'Failed to submit responses.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>Loading evaluation form...</div></div>;
  }

  if (error) {
    return <div className={styles.container}><div className={styles.error}>Error: {error}</div></div>;
  }

  if (!evaluation) {
    return <div className={styles.container}><div className={styles.error}>Evaluation not found.</div></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate(-1)} className={styles.backButton}>
          <FiArrowLeft /> Back
        </button>
        <h1 className={styles.title}>Evaluation Form: {evaluation.evaluation_name}</h1>
        <button
          onClick={handleSubmitResponses}
          className={styles.saveButton}
          disabled={submitting}
        >
          {submitting ? 'Saving...' : <><FiSave /> Save Responses</>}
        </button>
      </div>

      {successMessage && (
        <div className={styles.successMessage}>
          <FiCheckCircle /> {successMessage}
        </div>
      )}
      {error && (
        <div className={styles.errorMessage}>
          <FiXCircle /> {error}
        </div>
      )}

      <div className={styles.evaluationDetailsCard}>
        <p><strong>Area:</strong> {evaluation.area_name}</p>
        <p><strong>Subject:</strong> {evaluation.subject_name}</p>
        <p><strong>Class:</strong> {evaluation.class_name}</p>
        <p><strong>Staff:</strong> {evaluation.staff_name} ({evaluation.staff_role})</p>
        <p><strong>Term:</strong> {evaluation.term}</p>
      </div>

      <div className={styles.studentsEvaluationSection}>
        <h2 className={styles.sectionTitle}>Student Evaluations</h2>
        {students.length === 0 ? (
          <div className={styles.noStudents}>
            <FiUser /> No students found for this class.
          </div>
        ) : (
          students.map(student => (
            <div key={student.student_name} className={styles.studentCard}>
              <h3 className={styles.studentName}><FiUser /> {student.student_name}</h3>
              <p>Age: {student.age || 'N/A'}, Gender: {student.gender || 'N/A'}</p>
              <div className={styles.evaluationColumnsGrid}>
                {evaluation.form_columns.map(column => (
                  <div key={column.column_name} className={styles.columnInputGroup}>
                    <label className={styles.columnLabel}>{column.column_name} (Max: {column.max_points})</label>
                    <input
                      type="number"
                      min="0"
                      max={column.max_points}
                      value={student.responses[column.column_name]?.score || ''}
                      onChange={(e) => handleScoreChange(student.student_name, column.column_name, e.target.value)}
                      className={styles.scoreInput}
                    />
                    <textarea
                      placeholder="Notes..."
                      value={student.responses[column.column_name]?.notes || ''}
                      onChange={(e) => handleNotesChange(student.student_name, column.column_name, e.target.value)}
                      className={styles.notesTextarea}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EvaluationFormDisplay;