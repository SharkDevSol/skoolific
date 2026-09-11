import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  FiSearch, FiFilter, FiCalendar, FiUsers, FiUser, FiFileText, 
  FiCheck, FiClock, FiAlertCircle, FiDownload, FiEye, FiMessageSquare
} from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './EvaluationBookReports.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/evaluation-book`;

const EvaluationBookReports = () => {
  const { t } = useApp();
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({ totalEvaluations: 0, pendingResponses: 0, completedResponses: 0, responseRate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    className: '',
    studentName: ''
  });
  const [classes, setClasses] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Detail view
  const [selectedReport, setSelectedReport] = useState(null);

  const fetchClasses = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/classes`);
      if (res.ok) setClasses(await res.json());
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.className) params.append('className', filters.className);
      if (filters.studentName) params.append('studentName', filters.studentName);
      
      const res = await fetch(`${API_BASE}/reports/admin?${params}`);
      if (!res.ok) throw new Error('Failed to fetch reports');
      
      const data = await res.json();
      setReports(data.entries || []);
      setSummary(data.summary || { totalEvaluations: 0, pendingResponses: 0, completedResponses: 0, responseRate: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ startDate: '', endDate: '', className: '', studentName: '' });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'responded':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}><FiCheck /> {t('responded')}</span>;
      case 'sent':
        return <span className={`${styles.badge} ${styles.badgeWarning}`}><FiClock /> {t('pending')}</span>;
      default:
        return <span className={`${styles.badge} ${styles.badgeDefault}`}>{status}</span>;
    }
  };

  const groupByClass = () => {
    const grouped = {};
    reports.forEach(r => {
      if (!grouped[r.class_name]) grouped[r.class_name] = [];
      grouped[r.class_name].push(r);
    });
    return grouped;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>{t('evaluationBookReports')}</h2>
          <p>{t('evaluationBookReportsDesc')}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <FiFileText className={styles.summaryIcon} />
          <div>
            <span className={styles.summaryValue}>{summary.totalEvaluations}</span>
            <span className={styles.summaryLabel}>{t('totalEvaluations')}</span>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <FiClock className={styles.summaryIcon} style={{ color: '#f59e0b' }} />
          <div>
            <span className={styles.summaryValue}>{summary.pendingResponses}</span>
            <span className={styles.summaryLabel}>{t('pendingResponses')}</span>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <FiCheck className={styles.summaryIcon} style={{ color: '#10b981' }} />
          <div>
            <span className={styles.summaryValue}>{summary.completedResponses}</span>
            <span className={styles.summaryLabel}>{t('completed')}</span>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <FiUsers className={styles.summaryIcon} style={{ color: '#6366f1' }} />
          <div>
            <span className={styles.summaryValue}>{summary.responseRate}%</span>
            <span className={styles.summaryLabel}>{t('responseRate')}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersSection}>
        <button className={styles.filterToggle} onClick={() => setShowFilters(!showFilters)}>
          <FiFilter /> {t('filters')} {showFilters ? '▲' : '▼'}
        </button>
        
        {showFilters && (
          <motion.div 
            className={styles.filtersGrid}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <div className={styles.filterGroup}>
              <label><FiCalendar /> {t('startDate')}</label>
              <input type="date" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} />
            </div>
            <div className={styles.filterGroup}>
              <label><FiCalendar /> {t('endDate')}</label>
              <input type="date" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} />
            </div>
            <div className={styles.filterGroup}>
              <label><FiUsers /> {t('classComm')}</label>
              <select value={filters.className} onChange={(e) => handleFilterChange('className', e.target.value)}>
                <option value="">{t('allClasses')}</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label><FiSearch /> {t('studentName')}</label>
              <input type="text" placeholder={t('searchStudent')} value={filters.studentName} onChange={(e) => handleFilterChange('studentName', e.target.value)} />
            </div>
            <button className={styles.clearBtn} onClick={clearFilters}>{t('clearFilters')}</button>
          </motion.div>
        )}
      </div>

      {error && <div className={styles.error}><FiAlertCircle /> {error}</div>}

      {/* Reports List */}
      {loading ? (
        <div className={styles.loading}>{t('loading')}</div>
      ) : reports.length === 0 ? (
        <div className={styles.empty}>
          <FiFileText size={48} />
          <h3>{t('noReportsFound')}</h3>
          <p>{t('adjustFiltersOrWait')}</p>
        </div>
      ) : (
        <div className={styles.reportsList}>
          {Object.entries(groupByClass()).map(([className, classReports]) => (
            <div key={className} className={styles.classGroup}>
              <div className={styles.classHeader}>
                <FiUsers /> {className}
                <span className={styles.classCount}>{classReports.length} {t('evaluations')}</span>
              </div>
              <div className={styles.reportsGrid}>
                {classReports.map(report => (
                  <motion.div 
                    key={report.id} 
                    className={styles.reportCard}
                    whileHover={{ y: -2 }}
                    onClick={() => setSelectedReport(report)}
                  >
                    <div className={styles.reportHeader}>
                      <span className={styles.studentName}>{report.student_name}</span>
                      {getStatusBadge(report.status)}
                    </div>
                    <div className={styles.reportMeta}>
                      <span><FiCalendar /> {new Date(report.evaluation_date).toLocaleDateString()}</span>
                    </div>
                    {report.feedback_text && (
                      <div className={styles.feedbackIndicator}>
                        <FiMessageSquare /> {t('responded')}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedReport && (
        <div className={styles.modalOverlay} onClick={() => setSelectedReport(null)}>
          <motion.div 
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3>{selectedReport.student_name}</h3>
              <button onClick={() => setSelectedReport(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('classComm')}:</span>
                <span>{selectedReport.class_name}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('startDate')}:</span>
                <span>{new Date(selectedReport.evaluation_date).toLocaleDateString()}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('status')}:</span>
                {getStatusBadge(selectedReport.status)}
              </div>
              
              <h4>{t('evaluationData')}</h4>
              <div className={styles.fieldValues}>
                {Object.entries(selectedReport.field_values || {}).map(([key, value]) => (
                  <div key={key} className={styles.fieldItem}>
                    <span className={styles.fieldKey}>{key}:</span>
                    <span className={styles.fieldValue}>{value}</span>
                  </div>
                ))}
              </div>
              
              {selectedReport.feedback_text && (
                <>
                  <h4>{t('guardianFeedback')}</h4>
                  <div className={styles.feedbackBox}>
                    <p>{selectedReport.feedback_text}</p>
                    <small>{t('submitted')}: {new Date(selectedReport.feedback_submitted_at).toLocaleString()}</small>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default EvaluationBookReports;
