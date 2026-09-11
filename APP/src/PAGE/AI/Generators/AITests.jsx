import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiList, FiPlay, FiRefreshCw } from 'react-icons/fi';
import styles from './AITests.module.css';

const AITests = () => {
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTests = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/ai/list-tests');
      if (res.data.success) {
        setTests(res.data.data);
      } else {
        setError(res.data.error || 'Failed to load tests');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTests(); }, []);

  const playTest = (t) => {
    const params = new URLSearchParams({
      subject: t.subject,
      class: t.className,
      term: t.termNumber,
      component: t.componentName
    });
    navigate(`/ai-test-player?${params.toString()}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><FiList /></div>
        <div>
          <h1>Saved AI Tests</h1>
          <p>All generated tests across subjects and classes</p>
        </div>
        <button className={styles.refreshBtn} onClick={fetchTests}><FiRefreshCw /> Refresh</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.placeholder}>Loading tests...</div>
      ) : tests.length === 0 ? (
        <div className={styles.placeholder}>
          <p>No tests saved yet.</p>
          <p className={styles.sub}>Go to Test Generator to create your first test.</p>
          <button className={styles.generateBtn} onClick={() => navigate('/ai-test-generator')}>+ Create Test</button>
        </div>
      ) : (
        <div className={styles.testGrid}>
          {tests.map(t => (
            <div key={t.id} className={styles.testCard}>
              <div className={styles.testHeader}>
                <span className={styles.subjectBadge}>{t.subject}</span>
                <span className={styles.classBadge}>{t.className}</span>
              </div>
              <h3>{t.componentName}</h3>
              <p className={styles.meta}>Term {t.termNumber} · {t.questionCount} questions</p>
              <button className={styles.playBtn} onClick={() => playTest(t)}><FiPlay /> Play Test</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AITests;
