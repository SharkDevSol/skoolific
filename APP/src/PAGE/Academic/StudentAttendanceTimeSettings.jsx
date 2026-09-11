import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiClock, FiSave, FiAlertCircle, FiCheckCircle, FiCalendar, FiUsers, FiShuffle } from 'react-icons/fi';
import styles from './StudentAttendanceTimeSettings.module.css';

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') return window.location.origin + '/api';
  return 'http://localhost:5052/api';
};
const API_BASE_URL = getApiBaseUrl();

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS = DAY_NAMES.slice(1);

const DEFAULT_TIMES = {
  check_in_start_time: '07:00:00',
  check_in_end_time: '08:30:00',
  late_threshold_time: '08:00:00',
  absent_marking_time: '09:00:00',
  shift1_check_in_start: '07:00:00',
  shift1_check_in_end: '08:30:00',
  shift1_late_threshold: '08:00:00',
  shift1_absent_marking: '09:00:00',
  shift2_check_in_start: '13:00:00',
  shift2_check_in_end: '14:30:00',
  shift2_late_threshold: '14:00:00',
  shift2_absent_marking: '15:00:00'
};

const TIME_FIELDS = Object.keys(DEFAULT_TIMES);

const getBranchCode = () => {
  return (sessionStorage.getItem('branchCode') || localStorage.getItem('branchCode') || '').toUpperCase();
};

const StudentAttendanceTimeSettings = () => {
  const [task1, setTask1] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_TIMES, school_days: [1, 2, 3, 4, 5], auto_absent_enabled: true });
  const [classConfigs, setClassConfigs] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadAll();
  }, []);

  const branchHeaders = () => ({ 'x-branch-code': getBranchCode() });

  const loadAll = async () => {
    try {
      const [cfgRes, setRes, ccRes, clsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/schedule/config`, { headers: branchHeaders() }),
        axios.get(`${API_BASE_URL}/academic/student-attendance/settings`, { headers: branchHeaders() }),
        axios.get(`${API_BASE_URL}/academic/student-attendance/class-shifts`, { headers: branchHeaders() }),
        axios.get(`${API_BASE_URL}/academic/student-attendance/classes`, { headers: branchHeaders() })
      ]);

      if (cfgRes.data) setTask1(cfgRes.data);

      if (setRes.data.success) {
        const d = setRes.data.data;
        const merged = { ...DEFAULT_TIMES };
        TIME_FIELDS.forEach(f => { if (d[f]) merged[f] = d[f]; });
        if (Array.isArray(d.school_days) && d.school_days.length > 0) merged.school_days = d.school_days;
        merged.auto_absent_enabled = d.auto_absent_enabled !== undefined ? d.auto_absent_enabled : true;
        setSettings(merged);
      }

      if (ccRes.data.success) setClassConfigs(ccRes.data.data || {});

      const cls = clsRes.data.data || [];
      setClassConfigs(prev => {
        if (Object.keys(prev).length > 0) return prev;
        const derived = {};
        cls.forEach(c => { derived[c] = { shift_number: 1, isKG: false, isEvening: false }; });
        return derived;
      });
    } catch (err) {
      console.error('Error loading settings:', err);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    }
  };

  const handleTimeChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleDayToggle = (dayIndex) => {
    setSettings(prev => {
      const days = Array.isArray(prev.school_days) ? prev.school_days : [];
      return {
        ...prev,
        school_days: days.includes(dayIndex)
          ? days.filter(d => d !== dayIndex)
          : [...days, dayIndex].sort((a, b) => a - b)
      };
    });
  };

  const handleClassShiftChange = (className, shiftNumber) => {
    setClassConfigs(prev => ({
      ...prev,
      [className]: { ...(prev[className] || { isKG: false, isEvening: false }), shift_number: parseInt(shiftNumber) }
    }));
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setMessage({ type: '', text: '' });

      // 1) Save school days / shifts / rotation to Task 1 schedule config
      if (task1) {
        const schoolDaysNumeric = (settings.school_days || [])
          .map(d => (typeof d === 'number' ? d : DAY_NAMES.indexOf(d)))
          .filter(d => d > 0);
        await axios.put(`${API_BASE_URL}/schedule/config`, {
          ...task1,
          school_days: schoolDaysNumeric,
          teaching_days_per_week: schoolDaysNumeric.length,
          total_shifts: task1.total_shifts || 1
        }, { headers: branchHeaders() });
      }

      // 2) Save attendance time settings + auto-absent + school days
      const dayNames = (settings.school_days || [])
        .map(d => (typeof d === 'number' ? DAY_NAMES[d] : d))
        .filter(Boolean);
      const timesPayload = {};
      TIME_FIELDS.forEach(f => { timesPayload[f] = settings[f] || DEFAULT_TIMES[f]; });
      await axios.put(`${API_BASE_URL}/academic/student-attendance/settings`, {
        ...timesPayload,
        school_days: dayNames,
        auto_absent_enabled: settings.auto_absent_enabled
      }, { headers: branchHeaders() });

      // 3) Save class shift assignments (Task 2 class_configs)
      const classConfigsPayload = {};
      Object.entries(classConfigs).forEach(([className, cfg]) => {
        classConfigsPayload[className] = {
          shift: cfg.shift_number || cfg.shift || 1,
          isKG: cfg.isKG || false,
          isEvening: cfg.isEvening || false
        };
      });
      await axios.put(`${API_BASE_URL}/academic/student-attendance/class-configs`, { classConfigs: classConfigsPayload }, { headers: branchHeaders() });

      setMessage({ type: 'success', text: 'All settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (time) => (time || '').substring(0, 5);

  const shiftCount = task1?.total_shifts || 1;

  const TimeField = ({ label, field, hint }) => (
    <div className={styles.timeField}>
      <label>{label}</label>
      <input
        type="time"
        value={formatTime(settings[field])}
        onChange={(e) => handleTimeChange(field, e.target.value + ':00')}
        className={styles.timeInput}
        disabled={isLoading}
      />
      <p className={styles.hint}>{hint}</p>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1><FiClock /> Student Attendance Settings</h1>
        <p>Configure school days, shifts, class shift assignment, and auto-absent marking</p>
      </div>

      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          <span>{message.text}</span>
        </div>
      )}

      <div className={styles.content}>
        {/* School Days */}
        <div className={styles.section}>
          <h2><FiCalendar /> School Days</h2>
          <p className={styles.sectionDesc}>Select which days of the week attendance is tracked (saved to Task 1 config)</p>
          <div className={styles.daysGrid}>
            {DAYS.map((day, i) => {
              const dayIndex = i + 1;
              const active = (settings.school_days || []).includes(dayIndex) || (settings.school_days || []).includes(day);
              return (
                <label key={day} className={styles.dayCheckbox}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => handleDayToggle(dayIndex)}
                    disabled={isLoading}
                  />
                  <span className={styles.dayLabel}>{day}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Number of Shifts + Shift Rotation */}
        <div className={styles.section}>
          <h2><FiUsers /> Number of Shifts & Shift Rotation</h2>
          <p className={styles.sectionDesc}>Number of shifts and rotation come from Task 1 (School Setup)</p>
          <div className={styles.timeGrid}>
            <div className={styles.timeField}>
              <label>Number of Shifts</label>
              <select
                className={styles.shiftSelect}
                value={shiftCount}
                onChange={(e) => setTask1(prev => ({ ...prev, total_shifts: parseInt(e.target.value) }))}
                disabled={isLoading}
              >
                <option value={1}>1 Shift</option>
                <option value={2}>2 Shifts</option>
              </select>
              <p className={styles.hint}>Total shifts for the school (from Task 1)</p>
            </div>

            <div className={styles.timeField}>
              <label>Enable Shift Rotation</label>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={Boolean(task1?.shift_rotation)}
                  onChange={(e) => setTask1(prev => ({ ...prev, shift_rotation: e.target.checked }))}
                  disabled={isLoading}
                />
                <span className={styles.toggleSwitch}></span>
                <span className={styles.toggleText}>
                  {task1?.shift_rotation ? 'Weekly rotation enabled' : 'Fixed shifts'}
                </span>
              </label>
              <p className={styles.hint}>Classes alternate between shifts weekly when enabled (from Task 1)</p>
            </div>

            {task1?.shift_rotation && (
              <div className={styles.timeField}>
                <label>Rotation Frequency</label>
                <select
                  className={styles.shiftSelect}
                  value={task1?.rotation_frequency || 'weekly'}
                  onChange={(e) => setTask1(prev => ({ ...prev, rotation_frequency: e.target.value }))}
                  disabled={isLoading}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <p className={styles.hint}>How often shifts rotate (from Task 1)</p>
              </div>
            )}
          </div>
        </div>

        {/* Class Shift Assignment (Task 2) */}
        <div className={styles.section}>
          <h2><FiUsers /> Class Shift Assignment (from Task 2)</h2>
          <p className={styles.sectionDesc}>Assign each class to Shift 1 or Shift 2 (updates Task 2 class configs)</p>
          <div className={styles.classShiftGrid}>
            {Object.entries(classConfigs).map(([className, cfg]) => (
              <div key={className} className={styles.classShiftItem}>
                <span className={styles.classLabel}>{className}{cfg.isKG ? ' (KG)' : ''}</span>
                <select
                  value={cfg.shift_number || cfg.shift || 1}
                  onChange={(e) => handleClassShiftChange(className, e.target.value)}
                  className={styles.shiftSelect}
                  disabled={isLoading}
                >
                  <option value={1}>Shift 1</option>
                  <option value={2}>Shift 2</option>
                </select>
              </div>
            ))}
          </div>
          {Object.keys(classConfigs).length === 0 && (
            <p className={styles.noData}>No classes found. Complete Task 2 (Class Registration) first.</p>
          )}
        </div>

        {/* Auto-Absent Marking */}
        <div className={styles.section}>
          <h2><FiShuffle /> Auto-Absent Marking</h2>
          <p className={styles.sectionDesc}>Automatically mark students ABSENT when they haven't checked in by the configured time</p>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={Boolean(settings.auto_absent_enabled)}
              onChange={(e) => handleTimeChange('auto_absent_enabled', e.target.checked)}
              disabled={isLoading}
              className={styles.toggleInput}
            />
            <span className={styles.toggleSwitch}></span>
            <span className={styles.toggleText}>
              {settings.auto_absent_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>

          <p className={styles.featureDesc}>
            When enabled, students who haven't checked in by the auto-absent marking time
            will automatically be marked as ABSENT. The marker runs hourly on school days.
          </p>

          {shiftCount >= 1 && (
            <div className={styles.sectionInner}>
              <h3>Shift 1 Times</h3>
              <div className={styles.timeGrid}>
                <TimeField label="Check-in Start" field="shift1_check_in_start" hint="When Shift 1 students can start checking in" />
                <TimeField label="Check-in End" field="shift1_check_in_end" hint="Last time Shift 1 students can check in" />
                <TimeField label="Late Threshold" field="shift1_late_threshold" hint="Check-ins after this are marked LATE" />
                <TimeField label="Auto-Absent Marking Time" field="shift1_absent_marking" hint="Students without check-in marked ABSENT" />
              </div>
            </div>
          )}

          {shiftCount >= 2 && (
            <div className={styles.sectionInner}>
              <h3>Shift 2 Times</h3>
              <div className={styles.timeGrid}>
                <TimeField label="Check-in Start" field="shift2_check_in_start" hint="When Shift 2 students can start checking in" />
                <TimeField label="Check-in End" field="shift2_check_in_end" hint="Last time Shift 2 students can check in" />
                <TimeField label="Late Threshold" field="shift2_late_threshold" hint="Check-ins after this are marked LATE" />
                <TimeField label="Auto-Absent Marking Time" field="shift2_absent_marking" hint="Students without check-in marked ABSENT" />
              </div>
            </div>
          )}

          <div className={styles.sectionInner}>
            <h3>Global Times (legacy / fallback)</h3>
            <div className={styles.timeGrid}>
              <TimeField label="Check-in Start" field="check_in_start_time" hint="Default check-in window opens" />
              <TimeField label="Check-in End" field="check_in_end_time" hint="Default check-in window closes" />
              <TimeField label="Late Threshold" field="late_threshold_time" hint="Check-ins after this are marked LATE" />
              <TimeField label="Auto-Absent Marking Time" field="absent_marking_time" hint="Default auto-absent marking time" />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className={styles.actions}>
          <button onClick={handleSave} disabled={isLoading} className={styles.saveButton}>
            <FiSave />
            {isLoading ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentAttendanceTimeSettings;