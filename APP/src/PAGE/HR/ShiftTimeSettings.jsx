import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import styles from './ShiftTimeSettings.module.css';
import Card from '../../COMPONENTS/Card/Card';
import Button from '../../COMPONENTS/Button/Button';
import Input from '../../COMPONENTS/Input/Input';

const API_URL = import.meta.env.VITE_API_URL || '';

const ShiftTimeSettings = () => {
  const { t } = useTranslation();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [totalShifts, setTotalShifts] = useState(2);

  useEffect(() => {
    fetchShiftSettings();
    // Load total_shifts from Task 1 config
    axios.get(`${API_URL}/api/schedule/config`).then(r => {
      if (r.data && r.data.total_shifts) setTotalShifts(r.data.total_shifts);
    }).catch(() => {});
  }, []);

  const fetchShiftSettings = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/hr/shift-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setShifts(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching shift settings:', error);
      setMessage(t('hr.shift.loadError', 'Failed to load shift settings'));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (shiftName, field, value) => {
    setShifts((prevShifts) =>
      prevShifts.map((shift) =>
        shift.shift_name === shiftName ? { ...shift, [field]: value } : shift
      )
    );
  };

  const handleSave = async (shiftName) => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const shift = shifts.find((s) => s.shift_name === shiftName);

      const response = await axios.put(
        `${API_URL}/hr/shift-settings/${shiftName}`,
        {
          check_in_time: shift.check_in_time,
          check_out_time: shift.check_out_time,
          late_threshold: shift.late_threshold,
          minimum_work_hours: parseFloat(shift.minimum_work_hours),
          half_day_threshold: parseFloat(shift.half_day_threshold),
          grace_period_minutes: parseInt(shift.grace_period_minutes, 10)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMessage(
          t('hr.shift.saveSuccess', '{{shift}} settings saved successfully!', {
            shift: shiftName === 'shift1' ? t('hr.shift.shift1', 'Shift 1') : t('hr.shift.shift2', 'Shift 2')
          })
        );
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving shift settings:', error);
      setMessage(t('hr.shift.saveError', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const formatTime12Hour = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return <div className={styles.loading} role="status">{t('common.loading', 'Loading...')}</div>;
  }

  return (
    <main className={styles.container} aria-label={t('hr.shift.title', 'Shift Time Settings')}>
      <header className={styles.header}>
        <h1>{t('hr.shift.title', 'Shift Time Settings')}</h1>
        <p>{t('hr.shift.subtitle', 'Configure check-in/out times for Shift 1 and Shift 2')}</p>
      </header>

      {message && (
        <div
          className={message.includes(t('hr.shift.saveSuccess', '').slice(0, 3)) || message.includes('success') ? styles.successMessage : styles.errorMessage}
          role="status"
        >
          {message}
        </div>
      )}

      <div className={styles.shiftGrid}>
        {shifts.filter(s => totalShifts >= 2 || s.shift_name !== 'shift2').map((shift) => (
          <Card key={shift.shift_name} className={styles.shiftCard} title={shift.shift_name === 'shift1' ? t('hr.shift.shift1', 'Shift 1 (Morning)') : t('hr.shift.shift2', 'Shift 2 (Afternoon)')}>
            <div className={styles.formGrid}>
              <div>
                <Input
                  type="time"
                  label={t('hr.shift.checkIn', 'Check-In Time')}
                  value={shift.check_in_time}
                  onChange={(val) => handleInputChange(shift.shift_name, 'check_in_time', val)}
                />
                <p className={styles.previewTime}>{formatTime12Hour(shift.check_in_time)}</p>
              </div>
              <div>
                <Input
                  type="time"
                  label={t('hr.shift.lateThreshold', 'Late Threshold')}
                  value={shift.late_threshold}
                  onChange={(val) => handleInputChange(shift.shift_name, 'late_threshold', val)}
                />
                <p className={styles.previewTime}>{formatTime12Hour(shift.late_threshold)}</p>
              </div>
              <div>
                <Input
                  type="time"
                  label={t('hr.shift.checkOut', 'Check-Out Time')}
                  value={shift.check_out_time}
                  onChange={(val) => handleInputChange(shift.shift_name, 'check_out_time', val)}
                />
                <p className={styles.previewTime}>{formatTime12Hour(shift.check_out_time)}</p>
              </div>
              <Input
                type="number"
                label={t('hr.shift.gracePeriod', 'Grace Period (minutes)')}
                value={String(shift.grace_period_minutes)}
                onChange={(val) => handleInputChange(shift.shift_name, 'grace_period_minutes', val)}
              />
              <Input
                type="number"
                label={t('hr.shift.minHours', 'Minimum Work Hours')}
                value={String(shift.minimum_work_hours)}
                onChange={(val) => handleInputChange(shift.shift_name, 'minimum_work_hours', val)}
              />
              <Input
                type="number"
                label={t('hr.shift.halfDay', 'Half-Day Threshold (hours)')}
                value={String(shift.half_day_threshold)}
                onChange={(val) => handleInputChange(shift.shift_name, 'half_day_threshold', val)}
              />
            </div>
            <div className={styles.cardActions}>
              <Button variant="primary" onClick={() => handleSave(shift.shift_name)} disabled={saving} loading={saving}>
                {t('common.save', 'Save')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
};

export default ShiftTimeSettings;
