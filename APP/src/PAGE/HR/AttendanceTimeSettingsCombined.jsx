import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../Finance/PaymentManagement.module.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const AttendanceTimeSettingsCombined = () => {
  const [activeTab, setActiveTab] = useState('global'); // 'global', 'shifts', 'staff-assignment', 'staff-specific'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Global settings state
  const [settings, setSettings] = useState(null);
  const [formData, setFormData] = useState({
    standardCheckIn: '08:00',
    lateThreshold: '08:15',
    standardCheckOut: '17:00',
    minimumWorkHours: '8',
    halfDayThreshold: '4',
    gracePeriodMinutes: '15',
    maxCheckoutHours: '3.0',
    absentThresholdTime: '15:00',
    weekendDays: [] // Array of weekend day numbers (0=Sunday, 6=Saturday)
  });

  // Shift settings state
  const [shifts, setShifts] = useState([]);

  // Staff shift assignment state
  const [staff, setStaff] = useState([]);
  const [filterShift, setFilterShift] = useState('ALL');
  const [filterDepartment, setFilterDepartment] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Staff-specific timing state
  const [specificTimings, setSpecificTimings] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [specificFormData, setSpecificFormData] = useState({
    shift_type: 'shift1',
    custom_check_in: '',
    custom_check_out: '',
    custom_late_threshold: '',
    anytime_check: false,
    notes: ''
  });

  useEffect(() => {
    fetchSettings();
    fetchShiftSettings();
    fetchAllStaff();
    fetchSpecificTimings();
  }, []);

  // Global Settings Functions
  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/hr/attendance/time-settings`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success && response.data.data) {
        setSettings(response.data.data);
        setFormData({
          standardCheckIn: response.data.data.standard_check_in || '08:00',
          lateThreshold: response.data.data.late_threshold || '08:15',
          standardCheckOut: response.data.data.standard_check_out || '17:00',
          minimumWorkHours: response.data.data.minimum_work_hours?.toString() || '8',
          halfDayThreshold: response.data.data.half_day_threshold?.toString() || '4',
          gracePeriodMinutes: response.data.data.grace_period_minutes?.toString() || '15',
          maxCheckoutHours: response.data.data.max_checkout_hours?.toString() || '3.0',
          absentThresholdTime: response.data.data.absent_threshold_time || '15:00',
          weekendDays: response.data.data.weekend_days || []
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/hr/attendance/time-settings`,
        {
          standardCheckIn: formData.standardCheckIn,
          lateThreshold: formData.lateThreshold,
          standardCheckOut: formData.standardCheckOut,
          minimumWorkHours: parseFloat(formData.minimumWorkHours),
          halfDayThreshold: parseFloat(formData.halfDayThreshold),
          gracePeriodMinutes: parseInt(formData.gracePeriodMinutes),
          maxCheckoutHours: parseFloat(formData.maxCheckoutHours),
          absentThresholdTime: formData.absentThresholdTime,
          weekendDays: formData.weekendDays
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMessage('✅ Global settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
        fetchSettings();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('❌ Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Shift Settings Functions
  const fetchShiftSettings = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/hr/shift-settings`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setShifts(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching shift settings:', error);
    }
  };

  const handleShiftInputChange = (shiftName, field, value) => {
    setShifts(prevShifts =>
      prevShifts.map(shift =>
        shift.shift_name === shiftName
          ? { ...shift, [field]: value }
          : shift
      )
    );
  };

  const handleShiftSave = async (shiftName) => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const shift = shifts.find(s => s.shift_name === shiftName);

      const response = await axios.put(
        `${API_URL}/hr/shift-settings/${shiftName}`,
        {
          check_in_time: shift.check_in_time,
          check_out_time: shift.check_out_time,
          late_threshold: shift.late_threshold,
          minimum_work_hours: parseFloat(shift.minimum_work_hours),
          half_day_threshold: parseFloat(shift.half_day_threshold),
          grace_period_minutes: parseInt(shift.grace_period_minutes)
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMessage(`✅ ${shiftName === 'shift1' ? 'Shift 1' : 'Shift 2'} settings saved successfully!`);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving shift settings:', error);
      setMessage('❌ Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Staff Shift Assignment Functions
  const fetchAllStaff = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const types = ['Teachers', 'Administrative Staff', 'Supportive Staff', 'Finance'];
      let allStaff = [];

      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(
            `${API_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`
          );

          for (const className of classesResponse.data) {
            try {
              const dataResponse = await axios.get(
                `${API_URL}/staff/data/${staffType}/${className}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );

              const staffWithMeta = dataResponse.data.data.map(staff => ({
                id: staff.global_staff_id || staff.staff_id || staff.id,
                name: staff.full_name || staff.name || 'Unknown',
                department: staffType,
                className,
                shift_assignment: staff.shift_assignment || 'shift1',
                email: staff.email,
                phone: staff.phone
              }));

              allStaff = [...allStaff, ...staffWithMeta];
            } catch (error) {
              console.error(`Error fetching ${staffType} - ${className}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error fetching classes for ${staffType}:`, error);
        }
      }

      setStaff(allStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const handleStaffShiftChange = async (staffMember, newShift) => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.put(
        `${API_URL}/hr/shift-settings/staff/${staffMember.department}/${staffMember.className}/${staffMember.id}/shift`,
        { shift_assignment: newShift },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setStaff(prevStaff =>
          prevStaff.map(s =>
            s.id === staffMember.id && s.className === staffMember.className
              ? { ...s, shift_assignment: newShift }
              : s
          )
        );
        setMessage(`✅ ${staffMember.name}'s shift updated to ${getShiftLabel(newShift)}`);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error updating shift:', error);
      setMessage(`❌ Failed to update ${staffMember.name}'s shift`);
    } finally {
      setSaving(false);
    }
  };

  const getShiftLabel = (shift) => {
    switch (shift) {
      case 'shift1': return 'Shift 1 (Morning)';
      case 'shift2': return 'Shift 2 (Afternoon)';
      case 'both': return 'Both Shifts';
      default: return shift;
    }
  };

  const getShiftBadgeClass = (shift) => {
    switch (shift) {
      case 'shift1': return styles.shiftBadge1;
      case 'shift2': return styles.shiftBadge2;
      case 'both': return styles.shiftBadgeBoth;
      default: return styles.shiftBadge1;
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesShift = filterShift === 'ALL' || s.shift_assignment === filterShift;
    const matchesDepartment = filterDepartment === 'ALL' || s.department === filterDepartment;
    const matchesSearch = searchTerm === '' || 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesShift && matchesDepartment && matchesSearch;
  });

  const shiftCounts = {
    shift1: staff.filter(s => s.shift_assignment === 'shift1').length,
    shift2: staff.filter(s => s.shift_assignment === 'shift2').length,
    both: staff.filter(s => s.shift_assignment === 'both').length
  };

  const formatTime12Hour = (time24) => {
    if (!time24) return 'Not set';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Staff-Specific Timing Functions
  const fetchSpecificTimings = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/hr/shift-settings/staff-specific-timing`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSpecificTimings(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching specific timings:', error);
    }
  };

  const handleStaffSelectForSpecific = (staffMember) => {
    setSelectedStaff(staffMember);
    setSpecificFormData({
      shift_type: staffMember.shift_assignment === 'both' ? 'shift1' : staffMember.shift_assignment,
      custom_check_in: '',
      custom_check_out: '',
      custom_late_threshold: '',
      anytime_check: false,
      notes: ''
    });
    setShowModal(true);
  };

  const handleSaveSpecificTiming = async () => {
    if (!selectedStaff) return;

    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/hr/shift-settings/staff-specific-timing`,
        {
          staff_id: selectedStaff.id,
          staff_name: selectedStaff.name,
          shift_type: specificFormData.shift_type,
          custom_check_in: specificFormData.custom_check_in || null,
          custom_check_out: specificFormData.custom_check_out || null,
          custom_late_threshold: specificFormData.custom_late_threshold || null,
          anytime_check: specificFormData.anytime_check,
          notes: specificFormData.notes
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMessage(`✅ Specific timing saved for ${selectedStaff.name}`);
        setShowModal(false);
        fetchSpecificTimings();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving specific timing:', error);
      setMessage('❌ Failed to save specific timing');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpecificTiming = async (staffId, shiftType) => {
    if (!confirm('Are you sure you want to delete this specific timing?')) return;

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.delete(
        `${API_URL}/hr/shift-settings/staff-specific-timing/${staffId}/${shiftType}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMessage('✅ Specific timing deleted');
        fetchSpecificTimings();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error deleting specific timing:', error);
      setMessage('❌ Failed to delete specific timing');
    }
  };

  const toggleWeekendDay = (dayNumber) => {
    setFormData(prev => ({
      ...prev,
      weekendDays: prev.weekendDays.includes(dayNumber)
        ? prev.weekendDays.filter(d => d !== dayNumber)
        : [...prev.weekendDays, dayNumber]
    }));
  };

  const weekDays = [
    { number: 0, name: 'Sunday', short: 'Sun' },
    { number: 1, name: 'Monday', short: 'Mon' },
    { number: 2, name: 'Tuesday', short: 'Tue' },
    { number: 3, name: 'Wednesday', short: 'Wed' },
    { number: 4, name: 'Thursday', short: 'Thu' },
    { number: 5, name: 'Friday', short: 'Fri' },
    { number: 6, name: 'Saturday', short: 'Sat' }
  ];

  if (loading) {
    return <div className={styles.loading}>Loading settings...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>⏰ Attendance Time Settings</h1>
        <p>Configure work hours, shifts, and staff assignments</p>
      </div>

      {message && (
        <div className={message.includes('✅') ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        borderBottom: '2px solid #e0e0e0'
      }}>
        <button
          onClick={() => setActiveTab('global')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'global' ? '#2196F3' : 'transparent',
            color: activeTab === 'global' ? 'white' : '#666',
            border: 'none',
            borderBottom: activeTab === 'global' ? '3px solid #2196F3' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.3s'
          }}
        >
          🌍 Global Settings
        </button>
        <button
          onClick={() => setActiveTab('shifts')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'shifts' ? '#2196F3' : 'transparent',
            color: activeTab === 'shifts' ? 'white' : '#666',
            border: 'none',
            borderBottom: activeTab === 'shifts' ? '3px solid #2196F3' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.3s'
          }}
        >
          🌅 Shift Settings
        </button>
        <button
          onClick={() => setActiveTab('staff-assignment')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'staff-assignment' ? '#2196F3' : 'transparent',
            color: activeTab === 'staff-assignment' ? 'white' : '#666',
            border: 'none',
            borderBottom: activeTab === 'staff-assignment' ? '3px solid #2196F3' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.3s'
          }}
        >
          👥 Staff Shift Assignment
        </button>
      </div>

      {/* Global Settings Tab */}
      {activeTab === 'global' && (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginBottom: '24px', fontSize: '20px', color: '#333' }}>
            🌍 Global Work Time Configuration
          </h2>

          <form onSubmit={handleGlobalSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Standard Check-In Time
                </label>
                <input
                  type="time"
                  name="standardCheckIn"
                  value={formData.standardCheckIn}
                  onChange={(e) => setFormData({ ...formData, standardCheckIn: e.target.value })}
                  required
                  className={styles.input}
                />
                <small>{formatTime12Hour(formData.standardCheckIn)}</small>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Late Threshold Time
                </label>
                <input
                  type="time"
                  name="lateThreshold"
                  value={formData.lateThreshold}
                  onChange={(e) => setFormData({ ...formData, lateThreshold: e.target.value })}
                  required
                  className={styles.input}
                />
                <small>{formatTime12Hour(formData.lateThreshold)}</small>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Standard Check-Out Time
                </label>
                <input
                  type="time"
                  name="standardCheckOut"
                  value={formData.standardCheckOut}
                  onChange={(e) => setFormData({ ...formData, standardCheckOut: e.target.value })}
                  required
                  className={styles.input}
                />
                <small>{formatTime12Hour(formData.standardCheckOut)}</small>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  name="gracePeriodMinutes"
                  value={formData.gracePeriodMinutes}
                  onChange={(e) => setFormData({ ...formData, gracePeriodMinutes: e.target.value })}
                  required
                  min="0"
                  max="60"
                  className={styles.input}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Minimum Work Hours
                </label>
                <input
                  type="number"
                  name="minimumWorkHours"
                  value={formData.minimumWorkHours}
                  onChange={(e) => setFormData({ ...formData, minimumWorkHours: e.target.value })}
                  required
                  min="1"
                  max="24"
                  step="0.5"
                  className={styles.input}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Half-Day Threshold (Hours)
                </label>
                <input
                  type="number"
                  name="halfDayThreshold"
                  value={formData.halfDayThreshold}
                  onChange={(e) => setFormData({ ...formData, halfDayThreshold: e.target.value })}
                  required
                  min="1"
                  max="12"
                  step="0.5"
                  className={styles.input}
                />
              </div>
            </div>

            {/* Weekend Days Configuration */}
            <div style={{ marginTop: '32px', padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '16px', color: '#333' }}>
                📅 Weekend Days Configuration
              </h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
                Select which days are weekends. Staff will NOT be marked as absent on these days.
              </p>
              
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {weekDays.map(day => (
                  <button
                    key={day.number}
                    type="button"
                    onClick={() => toggleWeekendDay(day.number)}
                    style={{
                      padding: '12px 20px',
                      background: formData.weekendDays.includes(day.number) ? '#4CAF50' : 'white',
                      color: formData.weekendDays.includes(day.number) ? 'white' : '#666',
                      border: `2px solid ${formData.weekendDays.includes(day.number) ? '#4CAF50' : '#e0e0e0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.3s',
                      minWidth: '100px'
                    }}
                  >
                    {formData.weekendDays.includes(day.number) ? '✓ ' : ''}{day.name}
                  </button>
                ))}
              </div>

              {formData.weekendDays.length > 0 && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '12px', 
                  background: '#e8f5e9', 
                  borderRadius: '6px',
                  border: '1px solid #4CAF50'
                }}>
                  <strong style={{ color: '#2e7d32' }}>Selected Weekends:</strong>{' '}
                  {formData.weekendDays
                    .sort((a, b) => a - b)
                    .map(d => weekDays.find(wd => wd.number === d)?.name)
                    .join(', ')}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className={styles.saveButton}
              style={{ marginTop: '24px', width: '100%' }}
            >
              {saving ? 'Saving...' : '💾 Save Global Settings'}
            </button>
          </form>
        </div>
      )}

      {/* Shift Settings Tab */}
      {activeTab === 'shifts' && (
        <div className={styles.shiftsGrid}>
          {shifts.map((shift) => (
            <div key={shift.shift_name} className={styles.shiftCard}>
              <div className={styles.shiftHeader}>
                <h2>
                  {shift.shift_name === 'shift1' ? '🌅 Shift 1 (Morning)' : '🌆 Shift 2 (Afternoon)'}
                </h2>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Check-In Time</label>
                  <input
                    type="time"
                    value={shift.check_in_time}
                    onChange={(e) => handleShiftInputChange(shift.shift_name, 'check_in_time', e.target.value)}
                    className={styles.input}
                  />
                  <small>{formatTime12Hour(shift.check_in_time)}</small>
                </div>

                <div className={styles.formGroup}>
                  <label>Late Threshold</label>
                  <input
                    type="time"
                    value={shift.late_threshold}
                    onChange={(e) => handleShiftInputChange(shift.shift_name, 'late_threshold', e.target.value)}
                    className={styles.input}
                  />
                  <small>{formatTime12Hour(shift.late_threshold)}</small>
                </div>

                <div className={styles.formGroup}>
                  <label>Check-Out Time</label>
                  <input
                    type="time"
                    value={shift.check_out_time}
                    onChange={(e) => handleShiftInputChange(shift.shift_name, 'check_out_time', e.target.value)}
                    className={styles.input}
                  />
                  <small>{formatTime12Hour(shift.check_out_time)}</small>
                </div>

                <div className={styles.formGroup}>
                  <label>Grace Period (minutes)</label>
                  <input
                    type="number"
                    value={shift.grace_period_minutes}
                    onChange={(e) => handleShiftInputChange(shift.shift_name, 'grace_period_minutes', e.target.value)}
                    className={styles.input}
                    min="0"
                    max="60"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Minimum Work Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={shift.minimum_work_hours}
                    onChange={(e) => handleShiftInputChange(shift.shift_name, 'minimum_work_hours', e.target.value)}
                    className={styles.input}
                    min="0"
                    max="12"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Half-Day Threshold (hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={shift.half_day_threshold}
                    onChange={(e) => handleShiftInputChange(shift.shift_name, 'half_day_threshold', e.target.value)}
                    className={styles.input}
                    min="0"
                    max="8"
                  />
                </div>
              </div>

              <div className={styles.buttonGroup}>
                <button
                  onClick={() => handleShiftSave(shift.shift_name)}
                  disabled={saving}
                  className={styles.saveButton}
                >
                  {saving ? 'Saving...' : `Save ${shift.shift_name === 'shift1' ? 'Shift 1' : 'Shift 2'} Settings`}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Staff Shift Assignment Tab */}
      {activeTab === 'staff-assignment' && (
        <>
          {/* Summary Cards */}
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <h3>🌅 Shift 1</h3>
              <div className={styles.summaryValue}>{shiftCounts.shift1}</div>
              <p>Morning Staff</p>
            </div>
            <div className={styles.summaryCard}>
              <h3>🌆 Shift 2</h3>
              <div className={styles.summaryValue}>{shiftCounts.shift2}</div>
              <p>Afternoon Staff</p>
            </div>
            <div className={styles.summaryCard}>
              <h3>🔄 Both Shifts</h3>
              <div className={styles.summaryValue}>{shiftCounts.both}</div>
              <p>Dual Shift Staff</p>
            </div>
            <div className={styles.summaryCard}>
              <h3>👥 Total</h3>
              <div className={styles.summaryValue}>{staff.length}</div>
              <p>All Staff</p>
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filters} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <input
              type="text"
              placeholder="🔍 Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />

            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="ALL">All Shifts</option>
              <option value="shift1">Shift 1 Only</option>
              <option value="shift2">Shift 2 Only</option>
              <option value="both">Both Shifts</option>
            </select>

            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="ALL">All Departments</option>
              <option value="Teachers">Teachers</option>
              <option value="Administrative Staff">Administrative Staff</option>
              <option value="Supportive Staff">Supportive Staff</option>
            </select>
          </div>

          {/* Staff Table */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Staff ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Class</th>
                  <th>Current Shift</th>
                  <th>Assign Shift</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan="6" className={styles.noData}>
                      No staff found matching filters
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staffMember, index) => (
                    <tr key={`${staffMember.id}-${staffMember.className}-${index}`}>
                      <td>{staffMember.id}</td>
                      <td>
                        <strong>{staffMember.name}</strong>
                        {staffMember.email && <div className={styles.subText}>{staffMember.email}</div>}
                      </td>
                      <td>{staffMember.department}</td>
                      <td>{staffMember.className}</td>
                      <td>
                        <span className={getShiftBadgeClass(staffMember.shift_assignment)}>
                          {getShiftLabel(staffMember.shift_assignment)}
                        </span>
                      </td>
                      <td>
                        <select
                          value={staffMember.shift_assignment}
                          onChange={(e) => handleStaffShiftChange(staffMember, e.target.value)}
                          disabled={saving}
                          className={styles.shiftSelect}
                        >
                          <option value="shift1">🌅 Shift 1</option>
                          <option value="shift2">🌆 Shift 2</option>
                          <option value="both">🔄 Both</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
};

export default AttendanceTimeSettingsCombined;
