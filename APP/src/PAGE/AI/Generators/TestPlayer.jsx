import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import styles from './TestPlayer.module.css';

const TestPlayer = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = searchParams.get('subject');
  const className = searchParams.get('class');
  const term = searchParams.get('term');
  const component = searchParams.get('component');

  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subject || !className || !term || !component) {
      navigate('/ai-tests');
      return;
    }
    const fetchTest = async () => {
      try {
        const res = await axios.get('/api/ai/get-test', {
          params: { subject, className, termNumber: term, componentName: component }
        });
        if (res.data.success) {
          setTest(res.data.data);
        } else {
          navigate('/ai-tests');
        }
      } catch (err) {
        console.error('Error fetching test:', err);
        navigate('/ai-tests');
      } finally {
        setLoading(false);
      }
    };
    fetchTest();
  }, [subject, className, term, component, navigate]);

  const setAnswer = (qId, value) => {
    setAnswers(a => ({ ...a, [qId]: value }));
  };

  const isAutoGradable = (type) => ['mcq', 'multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'transformation', 'matching', 'numeric'].includes(type);

  const submitTest = async () => {
    if (!test) return;
    setSubmitted(true);
    try {
      const res = await axios.post('/api/ai/submit-exam', {
        schemaName: `test_${subject.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`,
        tableName: `${className.toLowerCase()}_term${term}_${component.toLowerCase().replace(/[\s\-\.]+/g, '_')}`,
        subjectName: subject,
        className,
        termNumber: parseInt(term),
        componentName: component,
        totalMarks: test.totalMarks,
        studentId: '',
        studentName: '',
        answers
      });
      setResult(res.data);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit: ' + (err.response?.data?.error || err.message));
      setSubmitted(false);
    }
  };

  if (loading) return <div className={styles.container}><p className={styles.center}>Loading test...</p></div>;
  if (!test) return <div className={styles.container}><p className={styles.center}>Test not found</p></div>;

  const answeredCount = Object.keys(answers).filter(k => answers[k] && (typeof answers[k] === 'string' ? answers[k].trim() : Object.keys(answers[k]).length > 0)).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{test.subject} — {test.className}</h1>
          <p>Term {test.termNumber} · {test.componentName} · {test.questions.length} questions · {test.totalMarks} marks</p>
        </div>
        <button className={styles.backBtn} onClick={() => navigate('/ai-tests')}>← Back</button>
      </div>

      {submitted && result && (
        <div className={styles.resultBanner}>
          <h2>Auto-graded Score: {result.obtainedMarks} / {result.totalMarks} ({result.percentage}%)</h2>
          <p>Answers have been recorded. {result.bonusMarks > 0 ? `Bonus: +${result.bonusMarks} marks` : ''}</p>
        </div>
      )}

      {test.questions.map((q, i) => {
        const answered = answers[q.id];
        const isCorrect = submitted && q.answer && String(answered || '').trim().toLowerCase() === String(q.answer).trim().toLowerCase();
        const isWrong = submitted && q.answer && answered && String(answered).trim().toLowerCase() !== String(q.answer).trim().toLowerCase();

        return (
          <div key={q.id} className={styles.questionCard}>
            <div className={styles.qHeader}>
              <span className={styles.qNum}>{i + 1}</span>
              <span className={styles.qType}>{q.type}</span>
              <span className={styles.qMarks}>{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
              {submitted && isCorrect && <span className={styles.correct}>✓ Correct</span>}
              {submitted && isWrong && <span className={styles.incorrect}>✗ Incorrect</span>}
            </div>
            <p className={styles.qText}>{q.question}</p>

            {(q.type === 'mcq' || q.type === 'multiple_choice') && q.options && (
              <div className={styles.options}>
                {q.options.map((opt, j) => (
                  <label key={j} className={`${styles.option} ${submitted && String(opt).toLowerCase() === String(q.answer).toLowerCase() ? styles.optionCorrect : ''} ${submitted && answered === opt && String(opt).toLowerCase() !== String(q.answer).toLowerCase() ? styles.optionWrong : ''}`}>
                    <input
                      type="radio"
                      name={`q${q.id}`}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                      disabled={submitted}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {(q.type === 'true_false') && (
              <div className={styles.trueFalse}>
                {['True', 'False'].map(opt => (
                  <label key={opt} className={`${styles.tfOption} ${submitted && String(opt).toLowerCase() === String(q.answer).toLowerCase() ? styles.optionCorrect : ''} ${submitted && answers[q.id] === opt && String(opt).toLowerCase() !== String(q.answer).toLowerCase() ? styles.optionWrong : ''}`}>
                    <input
                      type="radio"
                      name={`q${q.id}`}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                      disabled={submitted}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {(q.type === 'matching' && q.leftColumn && q.rightColumn) && (
              <div className={styles.matching}>
                {q.leftColumn.map(left => (
                  <div key={left} className={styles.matchRow}>
                    <span className={styles.matchLeft}>{left}</span>
                    <span className={styles.matchArrow}>→</span>
                    <select
                      value={answers[q.id]?.[left] || ''}
                      onChange={e => setAnswer(q.id, { ...(answers[q.id] || {}), [left]: e.target.value })}
                      disabled={submitted}
                    >
                      <option value="">Select…</option>
                      {q.rightColumn.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {(q.type === 'fill_blank' || q.type === 'short_answer' || q.type === 'transformation' || q.type === 'numeric') && (
              <input
                type="text"
                className={styles.textInput}
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                placeholder="Type your answer..."
                disabled={submitted}
              />
            )}

            {q.type === 'essay' && (
              <textarea
                className={styles.textArea}
                value={answers[q.id] || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                placeholder="Write your answer..."
                rows={4}
                disabled={submitted}
              />
            )}

            {submitted && q.explanation && (
              <div className={styles.explanation}>
                <strong>Explanation:</strong> {q.explanation}
              </div>
            )}
          </div>
        );
      })}

      {!submitted && (
        <div className={styles.submitArea}>
          <button className={styles.submitBtn} onClick={submitTest} disabled={answeredCount === 0}>
            Submit Test ({answeredCount} / {test.questions.length} answered)
          </button>
        </div>
      )}
    </div>
  );
};

export default TestPlayer;
