import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiDownload, FiArchive, FiRefreshCw, FiUsers, FiBook, FiCalendar } from 'react-icons/fi';
import { getBranchCode } from '../../utils/branchCode';
import styles from './YearRollover.module.css';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));
const branchHeaders = () => ({ 'x-branch-code': (getBranchCode() || '').toUpperCase() });
const authHeaders = () => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  return { ...branchHeaders(), ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
};

const YearRollover = () => {
  const [status, setStatus] = useState(null);
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        fetch(`${API_BASE_URL}/year-rollover/status`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/year-rollover/archives`, { headers: authHeaders() })
      ]);
      if (sRes.ok) { const d = await sRes.json(); setStatus(d.data); }
      if (aRes.ok) { const d = await aRes.json(); setArchives(Array.isArray(d.data) ? d.data : []); }
    } catch (e) { setMessage('Failed to load data'); }
    finally { setLoading(false); }
  };

  const handleRollover = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/year-rollover/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ ${data.message}`);
        setConfirming(false);
        fetchData();
      } else {
        setMessage(`❌ ${data.error || 'Rollover failed'}`);
      }
    } catch (e) { setMessage('❌ Error executing rollover'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {message && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '1rem',
          background: message.includes('✅') ? '#d1fae5' : message.includes('❌') ? '#fee2e2' : '#fef3c7',
          color: message.includes('✅') ? '#065f46' : message.includes('❌') ? '#991b1b' : '#92400e' }}>
          {message}
        </div>
      )}

      <div className={styles.yearStatusCard}>
        <h3>Current Academic Year</h3>
        {status ? (
          <>
            <div className={styles.yearInfo}>
              <div className={styles.yearBadge} style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                {status.ethiopianYear}
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>Year {status.ethiopianYear}</div>
                <div className={styles.ethiopianYear}>{status.currentYear}</div>
              </div>
            </div>

            <div className={styles.dataStats}>
              <div className={styles.statCard}>
                <FiBook size={24} />
                <div>
                  <span className={styles.statValue}>{status.totalClasses}</span>
                  <span className={styles.statLabel}>Classes</span>
                </div>
              </div>
              <div className={styles.statCard}>
                <FiCalendar size={24} />
                <div>
                  <span className={styles.statValue}>{status.terms}</span>
                  <span className={styles.statLabel}>Terms</span>
                </div>
              </div>
            </div>
          </>
        ) : loading ? <p>Loading...</p> : <p>Unable to load status</p>}
      </div>

      <div className={styles.warningBox}>
        <strong>⚠️ Year-End Rollover</strong>
        <p>Starting a new academic year will:</p>
        <ul>
          <li>Archive current student records</li>
          <li>Clear student attendance records</li>
          <li>Reset mark list components for new year</li>
          <li>Advance the academic year</li>
        </ul>
        <p style={{ marginTop: '12px', fontWeight: 600 }}>This action cannot be undone. Make sure to export any needed data first.</p>
      </div>

      <button
        className={styles.rolloverBtn}
        style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
        onClick={() => setConfirming(true)}
        disabled={loading}
      >
        <FiRefreshCw size={20} />
        {loading ? 'Processing...' : 'Start New Academic Year'}
      </button>

      <div className={styles.archivesSection}>
        <h3>Archived Years</h3>
        {archives.length === 0 ? (
          <div className={styles.noArchives}>No archived years yet</div>
        ) : (
          <div className={styles.archivesGrid}>
            {archives.map(a => (
              <div key={a.id} className={styles.archiveCard}>
                <div className={styles.archiveHeader}>
                  <h4>{a.archived_year}</h4>
                  <span className={styles.archiveDate}>{new Date(a.archived_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.archiveStats}>
                  <span>Students: {a.student_count || 0}</span>
                  <span>Staff: {a.staff_count || 0}</span>
                </div>
                <div className={styles.archiveActions}>
                  <button className={styles.viewBtn}>
                    <FiArchive size={16} /> View
                  </button>
                  <button className={styles.exportBtn} style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    <FiDownload size={16} /> Export
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirming && (
        <div className={styles.confirmOverlay} onClick={() => setConfirming(false)}>
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <FiAlertTriangle size={40} style={{ color: '#ef4444', marginBottom: '16px' }} />
            <h3>⚠️ Confirm New Academic Year</h3>
            <p>This will archive all current year data and prepare the system for a new academic year.</p>
            <p><strong>After this operation:</strong></p>
            <ul>
              <li>Student data will be archived</li>
              <li>Attendance records will be cleared</li>
              <li>Mark components will be reset</li>
              <li>Academic year will advance</li>
            </ul>
            <div className={styles.confirmButtons}>
              <button className={styles.cancelBtn} onClick={() => setConfirming(false)} disabled={loading}>Cancel</button>
              <button className={styles.confirmBtn} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                onClick={handleRollover} disabled={loading}>
                {loading ? 'Processing...' : 'Yes, Start New Year'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YearRollover;
