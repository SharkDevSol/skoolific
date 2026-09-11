import { useState, useEffect } from 'react';
import api from '../../utils/api';
import styles from './DataBackup.module.css';

const formatDate = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return ts;
  }
};

const DataBackup = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadBackups = async () => {
    try {
      const res = await api.get('/backup');
      if (res.data && res.data.success) {
        setFiles(res.data.files || []);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const createSqlBackup = async () => {
    setSqlLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/backup/sql');
      if (res.data.success) {
        setMessage(`SQL backup created: ${res.data.file.name} (${res.data.file.sizeHuman})`);
        await loadBackups();
      } else {
        setError(res.data.error);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSqlLoading(false);
    }
  };

  const createExcelBackup = async () => {
    setExcelLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/backup/excel', {}, { timeout: 120000 });
      if (res.data.success) {
        setMessage(`Excel backup created: ${res.data.files.length} category files`);
        await loadBackups();
      } else {
        setError(res.data.error);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setExcelLoading(false);
    }
  };

  const downloadFile = async (name) => {
    try {
      const res = await api.get('/backup/download', { params: { file: name }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = name.split('/').pop();
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError('Download failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const deleteFile = async (name) => {
    if (!window.confirm(`Delete backup "${name}"?`)) return;
    try {
      const res = await api.delete('/backup/delete', { params: { file: name } });
      if (res.data.success) {
        setMessage('Backup deleted');
        await loadBackups();
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const sqlFiles = files.filter(f => f.type === 'sql');
  const excelBatches = files.filter(f => f.type === 'excel');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Data Backup</h1>
        <p className={styles.pageSubtitle}>Create full database or Excel backups for the current branch</p>
      </div>

      {message && <div className={styles.successMsg}>{message}</div>}
      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Full Database Backup (SQL)</div>
          <p className={styles.cardDesc}>
            Creates a complete SQL dump of the entire branch database — all tables, structure and data.
            Restorable with pg_restore/psql.
          </p>
          <button
            className={styles.primaryBtn}
            onClick={createSqlBackup}
            disabled={sqlLoading}
          >
            {sqlLoading ? 'Creating...' : 'Create SQL Backup'}
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Excel Data Backup</div>
          <p className={styles.cardDesc}>
            Exports 8 category files: Students, Staff, Subjects, Marklist Forms, Marklist Components,
            Student Attendance, Staff Attendance, Monthly Payments.
          </p>
          <button
            className={styles.primaryBtn}
            onClick={createExcelBackup}
            disabled={excelLoading}
          >
            {excelLoading ? 'Creating...' : 'Create Excel Backup'}
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>SQL Backups (last 10 kept)</h2>
        {sqlFiles.length === 0 ? (
          <div className={styles.empty}>No SQL backups yet</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sqlFiles.map(f => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td>{f.sizeHuman}</td>
                  <td>{formatDate(f.modified)}</td>
                  <td>
                    <button className={styles.smallBtn} onClick={() => downloadFile(f.name)}>Download</button>
                    <button className={styles.dangerBtn} onClick={() => deleteFile(f.name)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Excel Backups (last 10 kept)</h2>
        {excelBatches.length === 0 ? (
          <div className={styles.empty}>No Excel backups yet</div>
        ) : (
          excelBatches.map(batch => (
            <div key={batch.name} className={styles.batch}>
              <div className={styles.batchHeader}>
                <span className={styles.batchName}>{batch.name}</span>
                <span className={styles.batchDate}>{formatDate(batch.modified)}</span>
                <button className={styles.dangerBtn} onClick={() => deleteFile(batch.name)}>Delete batch</button>
              </div>
              <div className={styles.batchFiles}>
                {(batch.files || []).map(f => (
                  <div key={f.name} className={styles.batchFile}>
                    <span>{f.name.split('/').pop()}</span>
                    <span className={styles.batchFileSize}>{f.sizeHuman}</span>
                    <button className={styles.smallBtn} onClick={() => downloadFile(f.name)}>Download</button>
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

export default DataBackup;
