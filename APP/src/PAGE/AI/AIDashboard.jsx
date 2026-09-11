import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiCpu, FiBook, FiFileText, FiUsers, FiTrendingUp, FiUpload, FiClock, FiEdit3, FiShuffle, FiGrid, FiClipboard, FiHelpCircle, FiBookOpen, FiSearch } from 'react-icons/fi';
import styles from './AIDashboard.module.css';

const quickActions = [
  { path: '/ai/generate/lesson-plan', icon: <FiFileText />, label: 'Lesson Plan', color: 'var(--color-primary)' },
  { path: '/ai/generate/lesson-note', icon: <FiBookOpen />, label: 'Lesson Note', color: 'var(--color-secondary)' },
  { path: '/ai/generate/homework', icon: <FiClipboard />, label: 'Homework', color: 'var(--color-accent)' },
  { path: '/ai/generate/worksheet', icon: <FiGrid />, label: 'Worksheet', color: 'var(--color-warning)' },
  { path: '/ai/generate/quiz', icon: <FiHelpCircle />, label: 'Quiz', color: 'var(--color-success)' },
  { path: '/ai/generate/exam', icon: <FiEdit3 />, label: 'Exam', color: 'var(--color-danger)' },
  { path: '/ai/generate/scramble-exam', icon: <FiShuffle />, label: 'Scramble', color: 'var(--color-primary)' },
  { path: '/ai/test-generator', icon: <FiEdit3 />, label: 'Test Generator', color: 'var(--color-secondary)' },
];

export default function AIDashboard() {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/ai/admin/dashboard').then(r => setStats(r.data.data)).catch(() => {});
    axios.get('/api/ai/history', { params: { limit: 5 } }).then(r => setHistory(r.data.data)).catch(() => {});
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><FiCpu /></div>
          <div>
            <h1>AI Dashboard</h1>
            <p>Generate educational content from your uploaded books</p>
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{stats?.totalBooks || 0}</span>
            <span className={styles.statLabel}>Books</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{stats?.totalChunks || 0}</span>
            <span className={styles.statLabel}>Chunks</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{stats?.generationsToday || 0}</span>
            <span className={styles.statLabel}>Today</span>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input placeholder="Search generators..." />
        </div>
        <button className={styles.toolBtn} onClick={() => navigate('/ai/books/upload')}><FiUpload /> Upload Books</button>
      </div>

      <div style={{marginBottom:24}}>
        <div className={styles.actionGrid}>
          {quickActions.map((action) => (
            <button key={action.path} className={styles.actionCard} onClick={() => navigate(action.path)} aria-label={action.label}
              style={{ '--btn-color': action.color }}>
              <span className={styles.actionIcon}>{action.icon}</span>
              <span className={styles.actionLabel}>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent Generations</h2>
          {history.length === 0 ? (
            <div className={styles.empty}>
              <FiClock className={styles.emptyIcon} />
              <p>No generations yet</p>
            </div>
          ) : (
            <div className={styles.historyList}>
              {history.map((item) => (
                <div key={item.id} className={styles.historyItem}>
                  <span className={styles.featureBadge}>{item.feature}</span>
                  <span className={styles.topicLabel}>{item.topic}</span>
                  <span className={styles.dateLabel}>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick Stats</h2>
          <div className={styles.flexCol}>
            <div className={styles.statsCard} style={{'--accent':'var(--color-primary)'}}>
              <FiBook className={styles.statsIcon} />
              <span className={styles.statsValue}>{stats?.totalBooks || 0}</span>
              <span className={styles.statsLabel}>Books Indexed</span>
            </div>
            <div className={styles.statsCard} style={{'--accent':'var(--color-secondary)'}}>
              <FiUsers className={styles.statsIcon} />
              <span className={styles.statsValue}>{stats?.activeTeachers || 0}</span>
              <span className={styles.statsLabel}>Active Teachers</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
