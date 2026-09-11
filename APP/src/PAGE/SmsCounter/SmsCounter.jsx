import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import styles from './SmsCounter.module.css';

const TEMPLATE_LABELS = {
  student_welcome: 'Student Welcome',
  guardian_welcome: 'Guardian Welcome',
  payment_receipt: 'Payment Receipt',
  staff_welcome: 'Staff Welcome',
  staff_credential_change: 'Credential Change',
  notification: 'Notification',
  manual_compose: 'Manual Compose'
};

const labelFor = (key) => TEMPLATE_LABELS[key] || key || 'Custom / Other';

const SmsCounter = () => {
  const [totals, setTotals] = useState(null);
  const [byTemplate, setByTemplate] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Compose state
  const [message, setMessage] = useState('');
  const [group, setGroup] = useState('all');
  const [classFilter, setClassFilter] = useState('');
  const [classOptions, setClassOptions] = useState([]);
  const [query, setQuery] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [templates, setTemplates] = useState([]);

  const fetchCounter = useCallback(async () => {
    try {
      const res = await api.get('/sms/counter');
      if (res.data.success) {
        setTotals(res.data.data.totals);
        setByTemplate(res.data.data.byTemplate);
      }
    } catch (err) {
      console.error('Error fetching SMS counter:', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', 50);
      if (filterTemplate) params.set('template', filterTemplate);
      if (filterStatus) params.set('status', filterStatus);
      const res = await api.get(`/sms/logs?${params.toString()}`);
      if (res.data.success) setLogs(res.data.data);
    } catch (err) {
      console.error('Error fetching SMS logs:', err);
    }
  }, [filterTemplate, filterStatus]);

  const fetchRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const params = new URLSearchParams();
      params.set('group', group);
      if (classFilter) params.set('class', classFilter);
      const res = await api.get(`/sms/recipients?${params.toString()}`);
      if (res.data.success) {
        setRecipients(res.data.data);
        const classes = [...new Set(res.data.data.map(r => r.class).filter(Boolean))].sort();
        setClassOptions(classes);
      }
    } catch (err) {
      console.error('Error fetching recipients:', err);
    } finally {
      setLoadingRecipients(false);
    }
  }, [group, classFilter]);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchCounter(), fetchLogs(), fetchRecipients()]);
      const tplRes = await api.get('/sms/templates').catch(() => null);
      if (tplRes && tplRes.data.success) setTemplates(tplRes.data.data);
      setLoading(false);
    })();
  }, [fetchCounter, fetchLogs, fetchRecipients]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCounter(), fetchLogs()]);
    setRefreshing(false);
  };

  const maxTemplateCount = byTemplate.length ? Math.max(...byTemplate.map(t => Number(t.sends))) : 1;

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? recipients.filter(r => r.name.toLowerCase().includes(normalizedQuery) || r.phone.includes(normalizedQuery))
    : recipients;

  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.phone));
  const toggleVisible = () => {
    const next = new Set(selected);
    visible.forEach(r => (allVisibleSelected ? next.delete(r.phone) : next.add(r.phone)));
    setSelected(next);
  };
  const toggleOne = (phone) => {
    const next = new Set(selected);
    if (next.has(phone)) next.delete(phone);
    else next.add(phone);
    setSelected(next);
  };

  const segmentsPerSms = Math.max(1, Math.ceil(message.length / 159));
  const credits = segmentsPerSms * selected.size;

  const handleSend = async () => {
    if (!message.trim()) { alert('Write a message first'); return; }
    if (selected.size === 0) { alert('Select at least one recipient'); return; }
    if (!window.confirm(`Send this SMS to ${selected.size} recipient(s)?\n\nCredits: ${credits} (${segmentsPerSms} per recipient)`)) return;
    setSending(true);
    setSendResult(null);
    try {
      const recipientsList = recipients.filter(r => selected.has(r.phone));
      const res = await api.post('/sms/send', { message: message.trim(), recipients: recipientsList });
      if (res.data.success) {
        setSendResult(res.data.data);
        setSelected(new Set());
        setMessage('');
        await Promise.all([fetchCounter(), fetchLogs()]);
      } else {
        alert(res.data.error || 'Send failed');
      }
    } catch (err) {
      console.error('Error sending SMS:', err);
      alert('Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className={styles.container}><p>Loading...</p></div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>SMS Counter</h1>
        <p>Every SMS sent by this branch, counted and grouped by template.</p>
        <button onClick={handleRefresh} className={styles.refreshBtn} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Compose & Send */}
      <div className={styles.composeSection}>
        <div className={styles.composeGrid}>
          <div className={styles.composeLeft}>
            <h2>Write & Send SMS</h2>
            <textarea
              className={styles.msgArea}
              rows={5}
              placeholder="Type your message here…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className={styles.msgMeta}>
              <span className={message.length > 159 ? styles.over : ''}>{message.length} chars</span>
              <span>· {segmentsPerSms} SMS per recipient</span>
              <span>· ≈ {credits} credits</span>
            </div>
            {templates.length > 0 && (
              <select
                className={styles.tplSelect}
                onChange={(e) => e.target.value && setMessage(e.target.value)}
                value=""
              >
                <option value="">Insert template…</option>
                {templates.filter(t => t.is_active).map(t => (
                  <option key={t.template_key} value={t.template_text}>{labelFor(t.template_key)}</option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.composeRight}>
            <h2>Recipients</h2>
            <div className={styles.recFilters}>
              <select value={group} onChange={(e) => { setGroup(e.target.value); setSelected(new Set()); }}>
                <option value="all">All (guardians, students, staff)</option>
                <option value="guardians">Guardians</option>
                <option value="students">Students</option>
                <option value="staff">Staff</option>
              </select>
              {classOptions.length > 0 && (
                <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setSelected(new Set()); }}>
                  <option value="">All classes</option>
                  {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <input
                className={styles.recSearch}
                placeholder="Search name or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className={styles.recHeader}>
              <label className={styles.selectAll}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
                Select all ({visible.length})
              </label>
              <span className={styles.recCount}>{selected.size} selected</span>
            </div>

            <div className={styles.recList}>
              {loadingRecipients ? (
                <p className={styles.empty}>Loading recipients…</p>
              ) : visible.length === 0 ? (
                <p className={styles.empty}>No recipients found.</p>
              ) : (
                visible.map(r => (
                  <label key={r.phone} className={styles.recRow}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.phone)}
                      onChange={() => toggleOne(r.phone)}
                    />
                    <span className={styles.recName}>{r.name}</span>
                    <span className={styles.recType}>{r.type === 'guardian' ? 'Guardian' : r.type === 'staff' ? 'Staff' : 'Student'}</span>
                    {r.class && <span className={styles.recClass}>{r.class}</span>}
                    <span className={styles.recPhone}>+{r.phone}</span>
                  </label>
                ))
              )}
            </div>

            <div className={styles.sendRow}>
              <span className={styles.sendInfo}>
                {selected.size} recipient(s) · {segmentsPerSms} SMS each · {credits} credits
              </span>
              <button className={styles.sendBtn} onClick={handleSend} disabled={sending}>
                {sending ? 'Sending…' : `Send SMS (${selected.size})`}
              </button>
            </div>

            {sendResult && (
              <div className={styles.sendResult}>
                <p>
                  <strong className={styles.okCount}>{sendResult.sent} sent</strong>
                  {' · '}
                  <strong className={styles.failCount}>{sendResult.failed} failed</strong>
                  {' · '}
                  {sendResult.credits} credits used
                </p>
                {sendResult.failed > 0 && (
                  <ul className={styles.failList}>
                    {sendResult.results.filter(r => !r.success).map((r, i) => (
                      <li key={i}>{r.name} (+{r.phone}) — {r.error || 'failed'}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {totals && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{totals.total_sends}</span>
            <span className={styles.statLabel}>Total SMS Sent</span>
            <span className={styles.statSub}>{totals.total_segments} SMS credits used</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{totals.today_sends}</span>
            <span className={styles.statLabel}>Sent Today</span>
            <span className={styles.statSub}>{totals.today_segments} SMS credits today</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: totals.sent > 0 ? '#166534' : '#64748b' }}>{totals.sent}</span>
            <span className={styles.statLabel}>Delivered (sent)</span>
            <span className={styles.statSub}>successfully accepted by provider</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: totals.failed > 0 ? '#dc2626' : '#64748b' }}>{totals.failed}</span>
            <span className={styles.statLabel}>Failed</span>
            <span className={styles.statSub}>provider rejected the message</span>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2>Sends by Template</h2>
        {byTemplate.length === 0 ? (
          <p className={styles.empty}>No SMS sent yet for this branch.</p>
        ) : (
          <div className={styles.templateBars}>
            {byTemplate.map(t => (
              <div key={t.template_key || 'custom'} className={styles.templateRow}>
                <div className={styles.templateLabel}>
                  <span>{labelFor(t.template_key)}</span>
                  <span className={styles.templateCount}>{t.sends} SMS</span>
                </div>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(Number(t.sends) / maxTemplateCount) * 100}%` }}
                  />
                </div>
                <div className={styles.templateSub}>
                  {t.sent} sent · {t.failed} failed · {t.segments} credits
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Recent Sends</h2>
          <div className={styles.filters}>
            <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)}>
              <option value="">All templates</option>
              {['student_welcome', 'guardian_welcome', 'payment_receipt', 'staff_welcome', 'staff_credential_change', 'notification'].map(k => (
                <option key={k} value={k}>{labelFor(k)}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {logs.length === 0 ? (
          <p className={styles.empty}>No SMS logs yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Template</th>
                  <th>Recipient</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className={styles.dateCell}>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{labelFor(log.template_key)}</td>
                    <td>{log.recipient_name || '—'}</td>
                    <td>{log.phone || '—'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${log.status === 'sent' ? styles.sent : styles.failed}`}>
                        {log.status === 'sent' ? 'Sent' : 'Failed'}
                      </span>
                    </td>
                    <td>{log.provider || '—'}</td>
                    <td className={styles.msgCell}>
                      <div className={styles.msgText} title={log.error || log.message}>{log.error || log.message}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmsCounter;