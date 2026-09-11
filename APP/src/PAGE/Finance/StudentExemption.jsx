import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api';

// Standalone "Student Exemption" page.
// Lists all classes with free-student counts, then per class lets an admin
// toggle students between "paying" and "free (exempt)". Free students still pay
// a one-time Registration Fee (Old or New) — no monthly tuition.
const StudentExemption = () => {
  const { t } = useTranslation();
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [loadingClass, setLoadingClass] = useState(false);

  // Toggle modal state
  const [targetStudent, setTargetStudent] = useState(null);
  const [form, setForm] = useState({ is_free: false, exemption_type: '', exemption_reason: '', registration_fee_type: 'new' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await api.get('/finance/monthly-payments-view/overview');
      setOverview(res.data);
    } catch (e) {
      console.error('Failed to fetch overview', e);
      setError('Failed to load classes');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchClassDetails = useCallback(async (className) => {
    setLoadingClass(true);
    try {
      const res = await api.get(`/finance/monthly-payments-view/class/${className}`);
      setClassDetails(res.data);
    } catch (e) {
      console.error('Failed to fetch class details', e);
      setError('Failed to load class students');
    } finally {
      setLoadingClass(false);
    }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    if (selectedClass) fetchClassDetails(selectedClass);
  }, [selectedClass, fetchClassDetails]);

  const openToggle = (student) => {
    setTargetStudent(student);
    setForm({
      is_free: student.is_free || false,
      exemption_type: student.exemption_type || '',
      exemption_reason: student.exemption_reason || '',
      registration_fee_type: student.registration_fee_type || 'new'
    });
    setError('');
  };

  const closeModal = () => { setTargetStudent(null); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (!targetStudent || !selectedClass) return;

    if (form.is_free && !form.exemption_type) {
      setError('Exemption type is required when marking as free');
      return;
    }
    if (form.is_free && !form.registration_fee_type) {
      setError('Registration Fee Type is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      // studentId format: 00000000-0000-0000-XXXX-YYYYYYYYYYYY (schoolId-classId)
      const parts = (targetStudent.studentId || '').split('-');
      const schoolId = parseInt(parts[3], 10);
      const classId = parseInt(parts[4], 10);

      await api.put(`/student-list/toggle-free/${selectedClass}/${schoolId}/${classId}`, form);

      closeModal();
      // refresh class + overview (free count)
      await fetchClassDetails(selectedClass);
      await fetchOverview();
    } catch (err) {
      console.error('Error toggling exemption', err);
      setError(err.response?.data?.error || 'Failed to update exemption');
    } finally {
      setSaving(false);
    }
  };

  const classes = overview?.classes || [];
  const totalFree = classes.reduce((sum, c) => sum + (c.freeStudents || 0), 0);
  const totalStudents = classes.reduce((sum, c) => sum + (c.totalStudents || 0), 0);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.6em' }}>🎓 Student Exemption</h1>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', borderRadius: '12px', padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8em', fontWeight: 800 }}>{totalFree}</div>
            <div style={{ fontSize: '0.8em', opacity: 0.9 }}>Free Students</div>
          </div>
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8em', fontWeight: 800 }}>{totalStudents}</div>
            <div style={{ fontSize: '0.8em' }}>Total Students</div>
          </div>
        </div>
      </div>

      {error && <div style={{ background: '#fdecea', color: '#c0392b', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      {loadingOverview ? (
        <p>Loading…</p>
      ) : (
        <>
          {/* Class list */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {classes.map((c) => (
              <button
                key={c.className || c.name}
                onClick={() => setSelectedClass(c.className || c.name)}
                style={{
                  background: selectedClass === (c.className || c.name) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'var(--bg-tertiary)',
                  color: selectedClass === (c.className || c.name) ? '#fff' : 'var(--text-color)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '1em'
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '8px' }}>{c.className || c.name}</div>
                <div style={{ fontSize: '0.85em', opacity: 0.9 }}>🎓 {c.freeStudents || 0} free</div>
                <div style={{ fontSize: '0.85em', opacity: 0.9 }}>{c.payingStudents || 0} paying</div>
              </button>
            ))}
          </div>

          {/* Selected class students */}
          {selectedClass && (
            <div>
              <h2 style={{ marginBottom: '16px' }}>Class {selectedClass}</h2>
              {loadingClass ? (
                <p>Loading students…</p>
              ) : classDetails?.students ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Student</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Exemption Type</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Reg Fee</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classDetails.students.map((s) => (
                      <tr key={s.studentId} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px' }}>{s.studentName}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '0.8em',
                            fontWeight: 700,
                            background: s.is_free ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#e8f5e9',
                            color: s.is_free ? '#fff' : '#2e7d32'
                          }}>
                            {s.is_free ? 'FREE' : 'PAYING'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>{s.exemption_type || '—'}</td>
                        <td style={{ padding: '12px' }}>{s.registration_fee_type || '—'}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => openToggle(s)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '8px',
                              border: 'none',
                              cursor: 'pointer',
                              fontWeight: 600,
                              background: s.is_free ? '#6c757d' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: '#fff'
                            }}
                          >
                            {s.is_free ? 'Remove Exemption' : 'Make Free'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No students found.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Toggle modal */}
      {targetStudent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={closeModal}
        >
          <div
            style={{ background: 'var(--bg-secondary)', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>
              {form.is_free ? '🎓 Make Student Free' : 'Manage Exemption'}
            </h2>
            <p style={{ marginBottom: '16px' }}><strong>{targetStudent.studentName}</strong></p>

            <form onSubmit={submit}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_free}
                  onChange={(e) => setForm({ ...form, is_free: e.target.checked, exemption_type: e.target.checked ? form.exemption_type : '' })}
                  style={{ width: '20px', height: '20px' }}
                />
                Learning for free (exempt from tuition)
              </label>

              {form.is_free && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>Exemption Type *</label>
                    <select
                      value={form.exemption_type}
                      onChange={(e) => setForm({ ...form, exemption_type: e.target.value })}
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    >
                      <option value="">Select type…</option>
                      <option value="Scholarship">Scholarship</option>
                      <option value="Orphan">Orphan</option>
                      <option value="Staff Child">Staff Child</option>
                      <option value="Financial Hardship">Financial Hardship</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>Reason (optional)</label>
                    <textarea
                      value={form.exemption_reason}
                      onChange={(e) => setForm({ ...form, exemption_reason: e.target.value })}
                      rows={3}
                      placeholder="Reason details"
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>Registration Fee Type *</label>
                    <select
                      value={form.registration_fee_type}
                      onChange={(e) => setForm({ ...form, registration_fee_type: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    >
                      <option value="new">New Registration Fee</option>
                      <option value="old">Old Registration Fee</option>
                    </select>
                    <p style={{ marginTop: '6px', fontSize: '0.85em', opacity: 0.8 }}>
                      💡 Free students still pay the one-time Registration Fee only (no monthly tuition).
                    </p>
                  </div>
                </>
              )}

              {error && <div style={{ color: '#c0392b', marginBottom: '12px' }}>{error}</div>}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={closeModal} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentExemption;
