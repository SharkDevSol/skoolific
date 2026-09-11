import { useState, useEffect } from 'react';
import api from '../../utils/api';
import styles from './SmsTemplates.module.css';

const TEMPLATE_KEYS = {
  student_welcome: 'Student Welcome SMS',
  guardian_welcome: 'Guardian Welcome SMS',
  payment_receipt: 'Payment Receipt SMS',
  staff_welcome: 'Staff Welcome SMS'
};

const SmsTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/sms/templates');
      if (response.data.success) setTemplates(response.data.data);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tmpl) => {
    setEditing(tmpl);
    setEditText(tmpl.template_text);
    setMessage('');
  };

  const handleSave = async () => {
    if (!editing || !editText.trim()) return;
    setSaving(true);
    try {
      await api.put(`/sms/templates/${editing.template_key}`, { template_text: editText });
      setMessage(`✅ ${TEMPLATE_KEYS[editing.template_key] || editing.template_key} updated successfully`);
      setEditing(null);
      fetchTemplates();
    } catch (err) {
      setMessage('❌ Failed to update template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.container}><p>Loading...</p></div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>SMS Templates</h1>
        <p>Customize SMS messages for each branch. Each branch has its own templates.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.templateList}>
        {templates.map(tmpl => (
          <div key={tmpl.id} className={styles.templateCard}>
            <div className={styles.templateHeader}>
              <h3>{TEMPLATE_KEYS[tmpl.template_key] || tmpl.template_key}</h3>
              <span className={`${styles.badge} ${tmpl.is_active ? styles.active : styles.inactive}`}>
                {tmpl.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className={styles.variables}>
              <strong>Available variables:</strong>{' '}
              {tmpl.template_key === 'payment_receipt' ? '{guardian_name}, {student_name}, {months_paid}, {amount_paid}, {school_name}' :
               tmpl.template_key === 'staff_welcome' ? '{staff_name}, {Branch}, {branchcode}, {staff_username}, {staff_password}' :
               '{student_name}, {student_username}, {student_password}, {guardian_name}, {guardian_username}, {guardian_password}, {school_name}'}
            </div>
            {editing?.id === tmpl.id ? (
              <div className={styles.editArea}>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={6} />
                <div className={styles.editActions}>
                  <button onClick={handleSave} disabled={saving} className={styles.saveBtn}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditing(null)} className={styles.cancelBtn}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <pre className={styles.templateText}>{tmpl.template_text}</pre>
                <button onClick={() => handleEdit(tmpl)} className={styles.editBtn}>Edit</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SmsTemplates;
