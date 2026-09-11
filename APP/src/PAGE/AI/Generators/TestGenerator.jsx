import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiEdit3, FiLoader, FiSave, FiPlay, FiRefreshCw, FiUpload, FiList, FiCheck } from 'react-icons/fi';
import styles from './TestGenerator.module.css';

const COMPONENTS = ['Monthly Exam', 'Mid-Term Exam', 'Final Exam', 'Quiz', 'Class Work', 'Homework', 'Test'];
const SUBJECTS = ['Mathematics', 'English', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'Civics', 'ICT', 'Amharic', 'Arabic', 'Oromo', 'Business', 'Economics', 'General Science'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const QUESTION_TYPES = [
  { type: 'mcq', label: 'Multiple Choice' },
  { type: 'true_false', label: 'True/False' },
  { type: 'matching', label: 'Matching' },
  { type: 'numeric', label: 'Numeric' },
  { type: 'fill_blank', label: 'Fill in the Blank' },
  { type: 'short_answer', label: 'Short Answer' },
  { type: 'essay', label: 'Essay / Open-Ended' },
  { type: 'transformation', label: 'Transformation' },
];

const TestGenerator = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState({
    subjectName: '', className: '', termNumber: 1, componentName: 'Monthly Exam',
    difficulty: ['Medium'], language: 'English', topic: '', timeLimit: 40, teacherNotes: ''
  });
  const [questionTypes, setQuestionTypes] = useState(
    QUESTION_TYPES.map(qt => ({ ...qt, count: 0, marksPerQuestion: 1 }))
  );
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    axios.get('/api/ai/list-classes')
      .then(r => {
        if (r.data.success) {
          setClasses(r.data.data.classes || []);
          if (r.data.data.subjects?.length) setSubjects(r.data.data.subjects);
        }
      })
      .catch(e => console.error('Error fetching classes:', e));
  }, []);

  const totalMarks = questionTypes.reduce((s, q) => s + q.count * q.marksPerQuestion, 0);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDifficulty = (d) => {
    setForm(f => {
      const has = f.difficulty.includes(d);
      return { ...f, difficulty: has ? f.difficulty.filter(x => x !== d) : [...f.difficulty, d] };
    });
  };

  const setQt = (type, field, val) => {
    setQuestionTypes(qs => qs.map(q => q.type === type ? { ...q, [field]: Math.max(0, parseInt(val) || 0) } : q));
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await axios.post('/api/ai/extract-text', fd);
      if (r.data.success && r.data.text) {
        const note = `[Uploaded ${file.name}]\n${r.data.text.slice(0, 4000)}`;
        setForm(f => ({ ...f, teacherNotes: f.teacherNotes ? f.teacherNotes + '\n\n' + note : note }));
        alert('✅ File content added to Teacher Notes');
      }
    } catch (err) {
      alert('❌ Upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const generate = async () => {
    if (!form.subjectName || !form.className || !form.componentName) {
      setError('Please select Subject, Class, and Component'); return;
    }
    const activeTypes = questionTypes.filter(q => q.count > 0);
    if (activeTypes.length === 0) {
      setError('Set at least one question type with a count above 0'); return;
    }
    setLoading(true); setError(''); setGenerated(null); setSaved(false);
    try {
      const payload = {
        ...form,
        totalMarks,
        difficulty: form.difficulty.length ? form.difficulty.map(d => d.toLowerCase()).join(', ') : 'medium',
        questionTypes: activeTypes.map(q => ({ type: q.type, count: q.count, marksPerQuestion: q.marksPerQuestion })),
        bonusQuestions: null,
      };
      const res = await axios.post('/api/ai/generate-test', payload);
      if (res.data.success) setGenerated(res.data);
      else setError(res.data.error || 'Generation failed');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate test');
    } finally {
      setLoading(false);
    }
  };

  const saveTest = async () => {
    if (!generated) return;
    setSaving(true);
    try {
      await axios.post('/api/ai/save-test', {
        subjectName: form.subjectName,
        className: form.className,
        termNumber: form.termNumber,
        componentName: form.componentName,
        questions: generated.questions,
        timeLimit: form.timeLimit,
        language: form.language,
        isPublished: false
      });
      setSaved(true);
      alert('✅ Test saved successfully!');
    } catch (err) {
      alert('❌ Failed to save test: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const playTest = () => {
    if (!saved && !confirm('The test is not saved yet. Play without saving?')) return;
    const params = new URLSearchParams({
      subject: form.subjectName, class: form.className,
      term: form.termNumber, component: form.componentName
    });
    navigate(`/ai-test-player?${params.toString()}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><FiEdit3 /></div>
        <div style={{ flex: 1 }}>
          <h1>AI Test Generator</h1>
          <p>Generate exams using AI. Configure the settings and click Generate.</p>
        </div>
        <button className={styles.savedTestsBtn} onClick={() => navigate('/ai-tests')}>
          <FiList /> Saved Tests
        </button>
      </div>

      <h2 className={styles.stepHeader}>Step 1: Test Configuration</h2>

      <div className={styles.mainGrid}>
        <div className={styles.formCard}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Subject <span className={styles.req}>*</span></label>
              <select value={form.subjectName} onChange={e => setField('subjectName', e.target.value)}>
                <option value="">Select Subject</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Class <span className={styles.req}>*</span></label>
              <select value={form.className} onChange={e => setField('className', e.target.value)}>
                <option value="">Select Class</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Term</label>
              <select value={form.termNumber} onChange={e => setField('termNumber', parseInt(e.target.value))}>
                {[1, 2, 3, 4].map(t => <option key={t} value={t}>Term {t}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Component <span className={styles.req}>*</span></label>
              <select value={form.componentName} onChange={e => setField('componentName', e.target.value)}>
                {COMPONENTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Total Marks</label>
              <input type="number" value={totalMarks} readOnly className={styles.readonly} />
            </div>
            <div className={styles.field}>
              <label>Difficulty (select one or more)</label>
              <div className={styles.diffRow}>
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={form.difficulty.includes(d) ? `${styles.diffCheck} ${styles.diffChecked}` : styles.diffCheck}
                    onClick={() => toggleDifficulty(d)}
                  >
                    {form.difficulty.includes(d) && <FiCheck />} {d}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label>Language</label>
              <select value={form.language} onChange={e => setField('language', e.target.value)}>
                {['English', 'Arabic', 'Somali', 'Amharic', 'Oromo'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Time Limit (minutes, 0 = no limit)</label>
              <input type="number" value={form.timeLimit} onChange={e => setField('timeLimit', parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className={styles.field}>
            <label>Topic/Unit (optional)</label>
            <input type="text" value={form.topic} onChange={e => setField('topic', e.target.value)} placeholder="e.g., Unit 2: Cell Biology" />
          </div>

          <div className={styles.field}>
            <label>Teacher Notes (optional)</label>
            <textarea
              className={styles.textarea}
              rows={4}
              value={form.teacherNotes}
              onChange={e => setField('teacherNotes', e.target.value)}
              placeholder="Any specific instructions for the AI..."
            />
          </div>

          <button className={styles.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><FiLoader className={styles.spin} /> Extracting...</> : <><FiUpload /> Upload PDF/DOC/Excel</>}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={handleUpload} />

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.formCard}>
          <h2 className={styles.stepHeader}>Step 2: Question Distribution</h2>
          <div className={styles.distTable}>
            <div className={`${styles.distRow} ${styles.distHead}`}>
              <span>Question Type</span>
              <span>Count</span>
              <span>Marks each</span>
            </div>
            {questionTypes.map(qt => (
              <div key={qt.type} className={styles.distRow}>
                <span>{qt.label}</span>
                <input type="number" min="0" value={qt.count} onChange={e => setQt(qt.type, 'count', e.target.value)} />
                <input type="number" min="1" value={qt.marksPerQuestion} onChange={e => setQt(qt.type, 'marksPerQuestion', e.target.value)} />
              </div>
            ))}
          </div>
          <div className={styles.totalMarks}>Total marks: <strong>{totalMarks}</strong></div>

          <button className={styles.generateBtn} onClick={generate} disabled={loading}>
            {loading ? <><FiLoader className={styles.spin} /> Generating...</> : '⚡ Generate Test'}
          </button>
        </div>
      </div>

      <div className={styles.resultCard}>
        {loading && (
          <div className={styles.placeholder}>
            <FiLoader className={styles.spin} />
            <p>Generating your test with AI...</p>
            <p className={styles.sub}>This may take 30-60 seconds</p>
          </div>
        )}
        {!loading && !generated && (
          <div className={styles.placeholder}>
            <FiEdit3 />
            <p>Fill in the settings and click Generate Test</p>
          </div>
        )}
        {!loading && generated && (
          <div className={styles.resultContent}>
            <div className={styles.resultHeader}>
              <h3>Generated Test — {generated.questions.length} questions</h3>
              <div className={styles.resultActions}>
                <button onClick={saveTest} disabled={saving || saved} className={styles.saveBtn}><FiSave /> {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Test'}</button>
                <button onClick={playTest} className={styles.playBtn}><FiPlay /> Play</button>
                <button onClick={generate} className={styles.regenBtn}><FiRefreshCw /> Regenerate</button>
              </div>
            </div>
            {generated.stats && (
              <div className={styles.statsBar}>
                {Object.entries(generated.stats).filter(([k]) => k !== 'total').map(([k, v]) => (
                  <span key={k} className={styles.statPill}>{k}: {v}</span>
                ))}
              </div>
            )}
            <div className={styles.questionList}>
              {generated.questions.map((q, i) => (
                <div key={i} className={styles.questionCard}>
                  <div className={styles.qHeader}>
                    <span className={styles.qNum}>{i + 1}</span>
                    <span className={styles.qType}>{q.type}</span>
                    <span className={styles.qMarks}>{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                  </div>
                  <p className={styles.qText}>{q.question}</p>
                  {q.options && q.options.length > 0 && (
                    <div className={styles.qOptions}>
                      {q.options.map((o, j) => <div key={j} className={styles.qOption}>{o}</div>)}
                    </div>
                  )}
                  <div className={styles.qAnswer}><strong>Answer:</strong> {q.answer}</div>
                  {q.explanation && <div className={styles.qExplanation}><strong>Explanation:</strong> {q.explanation}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestGenerator;
