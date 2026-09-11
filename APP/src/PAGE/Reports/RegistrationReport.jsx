import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { FiUsers, FiArrowLeft, FiRefreshCw, FiUserPlus, FiDollarSign } from 'react-icons/fi';
import styles from './Reports.module.css';

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

const RegistrationReport = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(() => new Date().toISOString().substring(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().substring(0, 10));

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/registration-report', {
        timeout: 90000,
        params: { from: from || undefined, to: to || undefined }
      });
      setData(res.data.data || null);
    } catch (error) {
      console.error('Error fetching registration report:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const applyFilter = (e) => {
    e.preventDefault();
    fetchData();
  };

  return (
    <div className={styles.reportPage}>
      <div className={styles.header}>
        <button onClick={() => navigate(-1)} className={styles.backBtn}>
          <FiArrowLeft /> Back
        </button>
        <div className={styles.headerTitle}>
          <FiUserPlus className={styles.headerIcon} />
          <div>
            <h1>Registration Report</h1>
            <p>New vs Old students (by registration fee type), students added by date, and today's collection</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button onClick={fetchData} className={styles.refreshBtn}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading registration report...</p>
        </div>
      ) : (
        data && (
          <>
            <div className={styles.summaryCards}>
              <div className={styles.card}>
                <h3>Total Students</h3>
                <p className={styles.bigNumber}>{fmt(data.total)}</p>
                <span className={styles.subtitle}>All registered students</span>
              </div>
              <div className={styles.card}>
                <h3>New Students</h3>
                <p className={styles.bigNumber}>{fmt(data.newCount)}</p>
                <span className={styles.subtitle}>Paid the NEW registration fee</span>
              </div>
              <div className={styles.card}>
                <h3>Old Students</h3>
                <p className={styles.bigNumber} style={{ color: '#4caf50' }}>{fmt(data.oldCount)}</p>
                <span className={styles.subtitle}>Paid the OLD registration fee</span>
              </div>
              <div className={styles.card}>
                <h3>Added Today</h3>
                <p className={styles.bigNumber} style={{ color: '#2196f3' }}>{fmt(data.addedToday)}</p>
                <span className={styles.subtitle}>Students registered today</span>
              </div>
              <div className={styles.card}>
                <h3><FiDollarSign /> Collected Today</h3>
                <p className={styles.bigNumber} style={{ color: '#f7931e' }}>{fmt(data.collectedToday)}</p>
                <span className={styles.subtitle}>Birr collected today</span>
              </div>
            </div>

            <div className={styles.section}>
              <h2>Students Added by Date</h2>
              <form onSubmit={applyFilter} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', color: '#666' }}>
                  From
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.95rem' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', color: '#666' }}>
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.95rem' }} />
                </label>
                <button type="submit" className={styles.refreshBtn}>Apply</button>
              </form>

              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Registration Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.added.map((s, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><strong>{s.studentName}</strong></td>
                        <td>{s.className}</td>
                        <td>{s.date}</td>
                        <td>
                          <span className={s.type === 'new' ? styles.warning : s.type === 'old' ? styles.success : ''}>
                            {s.type === 'new' ? 'NEW' : s.type === 'old' ? 'OLD' : '—'}
                          </span>
                        </td>
                        <td>{fmt(s.regFee)}</td>
                      </tr>
                    ))}
                    {data.added.length === 0 && (
                      <tr><td colSpan={6} className={styles.noData}>No students added in this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.section}>
              <h2>New vs Old by Class</h2>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Total</th>
                      <th>New</th>
                      <th>Old</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byClass.map((c) => (
                      <tr key={c.className}>
                        <td><strong>{c.className}</strong></td>
                        <td>{fmt(c.total)}</td>
                        <td className={styles.warning}>{fmt(c.newCount)}</td>
                        <td className={styles.success}>{fmt(c.oldCount)}</td>
                      </tr>
                    ))}
                    {data.byClass.length === 0 && (
                      <tr><td colSpan={4} className={styles.noData}>No classes found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default RegistrationReport;