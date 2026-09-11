import React, { useState, useEffect } from 'react';
import { formatAPIError } from '../../utils/errorMessages';
import { getBranchCode } from '../../utils/branchCode';

const API = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));
const h = () => ({ 'x-branch-code': getBranchCode() });

const KGEvaluation = () => {
  const [view, setView] = useState('list');
  const [kgClasses, setKgClasses] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [areas, setAreas] = useState([]);
  const [criteria, setCriteria] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // New evaluation form
  const [newEval, setNewEval] = useState({ class_name: '', term_number: 1, notes: '' });

  // Evaluation scoring
  const [activeEval, setActiveEval] = useState(null);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [activeStudent, setActiveStudent] = useState('');

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  useEffect(() => {
    fetchKGClasses();
    fetchAreas();
    fetchEvaluations();
  }, []);

  const fetchKGClasses = async () => {
    try {
      const res = await fetch(`${API}/students/form-structure`, { headers: h() });
      if (res.ok) {
        const data = await res.json();
        const configs = data.classConfigs || {};
        const kgList = Object.entries(configs)
          .filter(([, cfg]) => cfg.isKG)
          .map(([name]) => name);
        setKgClasses(kgList);
      }
    } catch (e) {
      console.error('Error fetching KG classes:', e);
    }
  };

  const fetchAreas = async () => {
    try {
      const res = await fetch(`${API}/kg-evaluations/areas`, { headers: h() });
      if (res.ok) {
        const data = await res.json();
        setAreas(data);
        const critMap = {};
        for (const area of data) {
          const cres = await fetch(`${API}/kg-evaluations/areas/${area.id}/criteria`, { headers: h() });
          if (cres.ok) critMap[area.id] = await cres.json();
        }
        setCriteria(critMap);
      }
    } catch (e) {
      console.error('Error fetching areas:', e);
    }
  };

  const fetchEvaluations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/kg-evaluations`, { headers: h() });
      if (res.ok) setEvaluations(await res.json());
    } catch (e) {
      console.error('Error fetching evaluations:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvaluation = async () => {
    if (!newEval.class_name) { showMessage('error', 'Select a KG class'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/kg-evaluations`, {
        method: 'POST',
        headers: { ...h(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: newEval.class_name,
          termNumber: newEval.term_number,
          notes: newEval.notes,
          createdBy: localStorage.getItem('username') || 'admin'
        })
      });
      if (res.ok) {
        const data = await res.json();
        showMessage('success', `Evaluation created for ${newEval.class_name}`);
        setNewEval({ class_name: '', term_number: 1, notes: '' });
        fetchEvaluations();
      } else {
        const err = await res.json();
        showMessage('error', err.error || 'Failed to create evaluation');
      }
    } catch (e) {
      showMessage('error', formatAPIError(e, 'Failed to create evaluation'));
    } finally {
      setLoading(false);
    }
  };

  const handleStartEvaluation = async (evalItem) => {
    setActiveEval(evalItem);
    setView('score');
    try {
      const res = await fetch(`${API}/kg-evaluations/${evalItem.id}/form`, { headers: h() });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        const existing = {};
        for (const s of data.existingScores || []) {
          const key = `${s.student_name}-${s.criteria_id}`;
          existing[key] = s;
        }
        setScores(existing);
        if (data.students?.length > 0) setActiveStudent(data.students[0].student_name);
      }
    } catch (e) {
      showMessage('error', 'Failed to load evaluation form');
    }
  };

  const handleScoreChange = (studentName, criteriaId, value) => {
    setScores(prev => ({
      ...prev,
      [`${studentName}-${criteriaId}`]: {
        student_name: studentName,
        criteria_id: parseInt(criteriaId),
        score: parseInt(value) || 0,
        rating: parseInt(value) >= 4 ? 'Excellent' : parseInt(value) >= 3 ? 'Good' : parseInt(value) >= 2 ? 'Needs Improvement' : 'Below Expectation'
      }
    }));
  };

  const handleSaveScores = async () => {
    if (!activeEval) return;
    setLoading(true);
    try {
      const responses = Object.values(scores).filter(s => s.student_name === activeStudent || !activeStudent);
      if (responses.length === 0) { showMessage('error', 'No scores to save'); setLoading(false); return; }
      const res = await fetch(`${API}/kg-evaluations/${activeEval.id}/responses`, {
        method: 'POST',
        headers: { ...h(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses })
      });
      if (res.ok) {
        showMessage('success', `Scores saved for ${activeStudent || 'all students'}`);
      } else {
        const err = await res.json();
        showMessage('error', err.error || 'Failed to save scores');
      }
    } catch (e) {
      showMessage('error', 'Failed to save scores');
    } finally {
      setLoading(false);
    }
  };

  // Styles
  const style = {
    container: { padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
    card: { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '1rem' },
    btn: { padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
    primaryBtn: { background: '#6366f1', color: '#fff' },
    successBtn: { background: '#22c55e', color: '#fff' },
    dangerBtn: { background: '#ef4444', color: '#fff' },
    outlineBtn: { background: 'transparent', border: '2px solid #e5e7eb', color: '#374151' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #f3f4f6', fontWeight: 600, color: '#6b7280', fontSize: '0.8125rem', textTransform: 'uppercase' },
    td: { padding: '0.75rem', borderBottom: '1px solid #f3f4f6', color: '#374151' },
    input: { padding: '0.5rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' },
    select: { padding: '0.5rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', background: '#fff' },
    badge: { display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }
  };

  if (view === 'score' && activeEval) {
    return (
      <div style={style.container}>
        <div style={style.header}>
          <div>
            <h1 style={{ margin: 0 }}>KG Scoring — {activeEval.class_name}</h1>
            <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>Term {activeEval.term_number} | {activeEval.evaluation_date?.split('T')[0]}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={{ ...style.btn, ...style.outlineBtn }} onClick={() => { setView('list'); setActiveEval(null); }}>Back</button>
            <button style={{ ...style.btn, ...style.successBtn }} onClick={handleSaveScores} disabled={loading}>{loading ? 'Saving...' : 'Save Scores'}</button>
          </div>
        </div>

        {message.text && (
          <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: message.type === 'error' ? '#fef2f2' : '#f0fdf4', color: message.type === 'error' ? '#dc2626' : '#16a34a', border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`, fontSize: '0.875rem' }}>
            {message.text}
          </div>
        )}

        {/* Student selector */}
        <div style={{ ...style.card, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600 }}>Student:</label>
          <select style={style.select} value={activeStudent} onChange={e => setActiveStudent(e.target.value)}>
            {students.map(s => <option key={s.student_name} value={s.student_name}>{s.student_name}</option>)}
          </select>
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{students.length} student(s)</span>
        </div>

        {/* Areas & Criteria */}
        {areas.map(area => {
          const areaCrit = criteria[area.id] || [];
          return (
            <div key={area.id} style={style.card}>
              <h3 style={{ margin: '0 0 0.75rem 0', color: '#374151' }}>{area.area_name}</h3>
              {areaCrit.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No criteria</p>}
              <table style={style.table}>
                <thead>
                  <tr>
                    <th style={style.th}>Criterion</th>
                    <th style={{ ...style.th, width: '120px' }}>Score (0-5)</th>
                    <th style={style.th}>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {areaCrit.map(c => {
                    const key = `${activeStudent}-${c.id}`;
                    const existing = scores[key] || {};
                    return (
                      <tr key={c.id}>
                        <td style={style.td}>{c.criteria_name}</td>
                        <td style={style.td}>
                          <select
                            style={{ ...style.select, width: '100%' }}
                            value={existing.score || 0}
                            onChange={e => handleScoreChange(activeStudent, c.id, e.target.value)}
                          >
                            {[0, 1, 2, 3, 4, 5].map(v => (
                              <option key={v} value={v}>{v} — {v === 0 ? 'N/A' : v === 1 ? 'Needs Support' : v === 2 ? 'Emerging' : v === 3 ? 'Developing' : v === 4 ? 'Proficient' : 'Exemplary'}</option>
                            ))}
                          </select>
                        </td>
                        <td style={style.td}>
                          <span style={{
                            ...style.badge,
                            background: existing.score >= 4 ? '#dcfce7' : existing.score >= 3 ? '#fef9c3' : existing.score >= 2 ? '#ffedd5' : existing.score > 0 ? '#fee2e2' : '#f3f4f6',
                            color: existing.score >= 4 ? '#16a34a' : existing.score >= 3 ? '#ca8a04' : existing.score >= 2 ? '#ea580c' : existing.score > 0 ? '#dc2626' : '#9ca3af'
                          }}>
                            {existing.rating || 'Not Rated'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={style.container}>
      <div style={style.header}>
        <h1 style={{ margin: 0 }}>KG Evaluation</h1>
        <button style={{ ...style.btn, ...style.primaryBtn }} onClick={() => setView(view === 'create' ? 'list' : 'create')}>
          {view === 'create' ? 'View Evaluations' : '+ New Evaluation'}
        </button>
      </div>

      {message.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: message.type === 'error' ? '#fef2f2' : '#f0fdf4', color: message.type === 'error' ? '#dc2626' : '#16a34a', border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`, fontSize: '0.875rem' }}>
          {message.text}
        </div>
      )}

      {view === 'create' && (
        <div style={style.card}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Create New KG Evaluation</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem', fontSize: '0.875rem' }}>KG Class</label>
              <select style={style.select} value={newEval.class_name} onChange={e => setNewEval(p => ({ ...p, class_name: e.target.value }))}>
                <option value="">Select KG class</option>
                {kgClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem', fontSize: '0.875rem' }}>Term</label>
              <select style={style.select} value={newEval.term_number} onChange={e => setNewEval(p => ({ ...p, term_number: parseInt(e.target.value) }))}>
                {[1, 2].map(t => <option key={t} value={t}>Term {t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem', fontSize: '0.875rem' }}>Notes (optional)</label>
            <textarea style={style.input} rows={2} value={newEval.notes} onChange={e => setNewEval(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes..." />
          </div>
          <button style={{ ...style.btn, ...style.primaryBtn }} onClick={handleCreateEvaluation} disabled={loading}>
            {loading ? 'Creating...' : 'Create Evaluation'}
          </button>
        </div>
      )}

      {view === 'list' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading...</div>
          ) : evaluations.length === 0 ? (
            <div style={{ ...style.card, textAlign: 'center', color: '#6b7280' }}>
              <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No KG evaluations yet</p>
              <p>Create one to start evaluating KG students.</p>
            </div>
          ) : (
            <div style={style.card}>
              <table style={style.table}>
                <thead>
                  <tr>
                    <th style={style.th}>Class</th>
                    <th style={style.th}>Term</th>
                    <th style={style.th}>Date</th>
                    <th style={style.th}>Status</th>
                    <th style={style.th}>Notes</th>
                    <th style={style.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map(ev => (
                    <tr key={ev.id}>
                      <td style={style.td}><strong>{ev.class_name}</strong></td>
                      <td style={style.td}>Term {ev.term_number}</td>
                      <td style={style.td}>{ev.evaluation_date?.split('T')[0]}</td>
                      <td style={style.td}>
                        <span style={{
                          ...style.badge,
                          background: ev.status === 'completed' ? '#dcfce7' : ev.status === 'in_progress' ? '#fef9c3' : '#f3f4f6',
                          color: ev.status === 'completed' ? '#16a34a' : ev.status === 'in_progress' ? '#ca8a04' : '#6b7280'
                        }}>
                          {ev.status || 'draft'}
                        </span>
                      </td>
                      <td style={{ ...style.td, color: '#6b7280', fontSize: '0.875rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.notes || '-'}
                      </td>
                      <td style={style.td}>
                        <button style={{ ...style.btn, ...style.primaryBtn, padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }} onClick={() => handleStartEvaluation(ev)}>
                          Score
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* KG Classes info */}
      {kgClasses.length === 0 && !loading && view === 'list' && (
        <div style={{ ...style.card, background: '#fef9c3', border: '1px solid #fde68a' }}>
          <p style={{ margin: 0, color: '#92400e' }}>No KG classes found. Enable KG in Task 1 and create KG classes in Task 2.</p>
        </div>
      )}
    </div>
  );
};

export default KGEvaluation;
