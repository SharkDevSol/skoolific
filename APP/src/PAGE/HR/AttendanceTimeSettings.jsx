import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../Finance/PaymentManagement.module.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const AttendanceTimeSettings = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    standardCheckIn: '08:00',
    lateThreshold: '08:15',
    standardCheckOut: '17:00',
    minimumWorkHours: '8',
    halfDayThreshold: '4',
    gracePeriodMinutes: '15',
    maxCheckoutHours: '3.0',
    absentThresholdTime: '15:00'
  });

  // Staff-specific times state
  const [staffSpecificTimes, setStaffSpecificTimes] = useState([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [editingStaffTime, setEditingStaffTime] = useState(null);
  const [staffFormData, setStaffFormData] = useState({
    staffId: '',
    staffName: '',
    staffType: '',
    checkInTime: '08:00',
    checkOutTime: '17:00',
    lateThreshold: '08:15',
    minimumWorkHours: '8',
    halfDayThreshold: '4',
    gracePeriodMinutes: '15',
    notes: ''
  });

  useEffect(() => {
    fetchSettings();
    fetchStaffSpecificTimes();
  }, []);

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
          absentThresholdTime: response.data.data.absent_threshold_time || '15:00'
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffSpecificTimes = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/hr/attendance/staff-specific-times`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setStaffSpecificTimes(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching staff-specific times:', error);
    }
  };

  const fetchStaffList = async () => {
    setLoadingStaff(true);
    try {
      const types = ['Teachers', 'Administrative Staff', 'Supportive Staff', 'Finance'];
      let allStaff = [];
      
      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(
            `/api/staff/classes?staffType=${encodeURIComponent(staffType)}`
          );
          
          for (const className of classesResponse.data) {
            const dataResponse = await axios.get(
              `/api/staff/data/${staffType}/${className}`
            );
            
            const staffWithMeta = dataResponse.data.data.map(staff => ({
              id: staff.id || staff.staff_id || staff.global_staff_id,
              name: staff.full_name || staff.name,
              staffType,
              className
            }));
            
            allStaff = [...allStaff, ...staffWithMeta];
          }
        } catch (err) {
          console.warn(`No data for: ${staffType}`);
        }
      }
      
      setStaffList(allStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleOpenStaffModal = () => {
    setEditingStaffTime(null);
    setShowStaffModal(true);
    fetchStaffList();
  };

  const handleEditStaffTime = (staffTime) => {
    setEditingStaffTime(staffTime);
    setStaffFormData({
      staffId: staffTime.staff_id,
      staffName: staffTime.staff_name,
      staffType: staffTime.staff_type || '',
      checkInTime: staffTime.check_in_time,
      checkOutTime: staffTime.check_out_time,
      lateThreshold: staffTime.late_threshold,
      minimumWorkHours: staffTime.minimum_work_hours?.toString() || '8',
      halfDayThreshold: staffTime.half_day_threshold?.toString() || '4',
      gracePeriodMinutes: staffTime.grace_period_minutes?.toString() || '15',
      notes: staffTime.notes || ''
    });
    setShowStaffModal(true);
    fetchStaffList();
  };

  const handleStaffChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'staffId') {
      const selectedStaff = staffList.find(s => String(s.id) === String(value));
      if (selectedStaff) {
        setStaffFormData({
          ...staffFormData,
          staffId: value,
          staffName: selectedStaff.name,
          staffType: selectedStaff.staffType
        });
      }
    } else {
      setStaffFormData({
        ...staffFormData,
        [name]: value
      });
    }
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/hr/attendance/staff-specific-times`,
        {
          staffId: staffFormData.staffId,
          staffName: staffFormData.staffName,
          staffType: staffFormData.staffType,
          checkInTime: staffFormData.checkInTime,
          checkOutTime: staffFormData.checkOutTime,
          lateThreshold: staffFormData.lateThreshold,
          minimumWorkHours: parseFloat(staffFormData.minimumWorkHours),
          halfDayThreshold: parseFloat(staffFormData.halfDayThreshold),
          gracePeriodMinutes: parseInt(staffFormData.gracePeriodMinutes),
          notes: staffFormData.notes
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert(`✅ Staff-specific time ${editingStaffTime ? 'updated' : 'saved'} successfully!`);
        setShowStaffModal(false);
        setEditingStaffTime(null);
        fetchStaffSpecificTimes();
        // Reset form
        setStaffFormData({
          staffId: '',
          staffName: '',
          staffType: '',
          checkInTime: '08:00',
          checkOutTime: '17:00',
          lateThreshold: '08:15',
          minimumWorkHours: '8',
          halfDayThreshold: '4',
          gracePeriodMinutes: '15',
          notes: ''
        });
      }
    } catch (error) {
      console.error('Error saving staff-specific time:', error);
      alert('❌ Failed to save staff-specific time');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaffTime = async (id) => {
    if (!window.confirm('Are you sure you want to delete this staff-specific time setting?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.delete(
        `${API_URL}/hr/attendance/staff-specific-times/${id}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('✅ Staff-specific time deleted successfully!');
        fetchStaffSpecificTimes();
      }
    } catch (error) {
      console.error('Error deleting staff-specific time:', error);
      alert('❌ Failed to delete staff-specific time');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

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
          absentThresholdTime: formData.absentThresholdTime
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('✅ Settings saved successfully!');
        fetchSettings();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('❌ Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const calculateExamples = () => {
    const examples = [];

    // Example 1: On Time
    examples.push({
      title: 'On Time Staff',
      checkIn: formData.standardCheckIn,
      checkOut: formData.standardCheckOut,
      status: 'PRESENT ✅',
      color: '#4CAF50'
    });

    // Example 2: Late
    const [lateHour, lateMin] = formData.lateThreshold.split(':').map(Number);
    const lateTime = `${String(lateHour).padStart(2, '0')}:${String(lateMin + 1).padStart(2, '0')}`;
    examples.push({
      title: 'Late Arrival',
      checkIn: lateTime,
      checkOut: formData.standardCheckOut,
      status: 'LATE ⏰',
      color: '#FF9800'
    });

    // Example 3: Half Day (early checkout)
    const [outHour] = formData.standardCheckOut.split(':').map(Number);
    const halfDayOut = `${String(outHour - 5).padStart(2, '0')}:00`;
    examples.push({
      title: 'Half Day (Early Leave)',
      checkIn: formData.standardCheckIn,
      checkOut: halfDayOut,
      status: 'HALF_DAY ⏱️',
      color: '#2196F3'
    });

    // Example 4: Half Day (late + early)
    examples.push({
      title: 'Half Day (Late + Early)',
      checkIn: '10:00',
      checkOut: '14:00',
      status: 'HALF_DAY ⏱️',
      color: '#2196F3'
    });

    return examples;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>⏰ Attendance Time Settings</h1>
          <p>Configure standard work hours and attendance rules</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading settings...</div>
      ) : (
        <>
          {/* Global Settings Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          {/* Settings Form */}
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ marginBottom: '24px', fontSize: '20px', color: '#333' }}>
              🌍 Global Work Time Configuration
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Standard Check-In Time */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Standard Check-In Time
                </label>
                <input
                  type="time"
                  name="standardCheckIn"
                  value={formData.standardCheckIn}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Expected arrival time for staff
                </div>
              </div>

              {/* Late Threshold */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Late Threshold Time
                </label>
                <input
                  type="time"
                  name="lateThreshold"
                  value={formData.lateThreshold}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Staff arriving after this time are marked as LATE
                </div>
              </div>

              {/* Grace Period */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  name="gracePeriodMinutes"
                  value={formData.gracePeriodMinutes}
                  onChange={handleChange}
                  required
                  min="0"
                  max="60"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Allowed delay before marking as late (typically 15 minutes)
                </div>
              </div>

              {/* Standard Check-Out Time */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Standard Check-Out Time
                </label>
                <input
                  type="time"
                  name="standardCheckOut"
                  value={formData.standardCheckOut}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Expected departure time for staff
                </div>
              </div>

              {/* Minimum Work Hours */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Minimum Work Hours (Full Day)
                </label>
                <input
                  type="number"
                  name="minimumWorkHours"
                  value={formData.minimumWorkHours}
                  onChange={handleChange}
                  required
                  min="1"
                  max="24"
                  step="0.5"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Required hours for a full working day
                </div>
              </div>

              {/* Half Day Threshold */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  Half Day Threshold (Hours)
                </label>
                <input
                  type="number"
                  name="halfDayThreshold"
                  value={formData.halfDayThreshold}
                  onChange={handleChange}
                  required
                  min="1"
                  max="12"
                  step="0.5"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Working less than this is marked as HALF_DAY
                </div>
              </div>

              {/* Maximum Check-Out Hours */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  🤖 Maximum Check-Out Hours (Auto-Marker)
                </label>
                <input
                  type="number"
                  name="maxCheckoutHours"
                  value={formData.maxCheckoutHours}
                  onChange={handleChange}
                  required
                  min="0.5"
                  max="12"
                  step="0.5"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Hours to wait before marking "without check out" (e.g., 3.0 = 3 hours)
                </div>
              </div>

              {/* Absent Threshold Time */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
                  🤖 Absent Threshold Time (Auto-Marker)
                </label>
                <input
                  type="time"
                  name="absentThresholdTime"
                  value={formData.absentThresholdTime}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '16px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Time after which staff are marked ABSENT if no check-in (e.g., 15:00 = 3:00 PM)
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : '💾 Save Global Settings'}
              </button>
            </form>
          </div>

          {/* Examples & Rules */}
          <div>
            {/* Current Rules */}
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '16px', fontSize: '18px', color: '#333' }}>
                📋 Current Rules
              </h2>
              
              <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#555' }}>
                <div style={{ marginBottom: '12px', padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <strong>✅ PRESENT:</strong> Check-in before {formData.lateThreshold} and work at least {formData.minimumWorkHours} hours
                </div>
                
                <div style={{ marginBottom: '12px', padding: '12px', background: '#fff3e0', borderRadius: '8px' }}>
                  <strong>⏰ LATE:</strong> Check-in after {formData.lateThreshold}
                </div>
                
                <div style={{ marginBottom: '12px', padding: '12px', background: '#e3f2fd', borderRadius: '8px' }}>
                  <strong>⏱️ HALF_DAY:</strong> Work less than {formData.halfDayThreshold} hours
                </div>
                
                <div style={{ padding: '12px', background: '#ffebee', borderRadius: '8px' }}>
                  <strong>❌ ABSENT:</strong> No check-in record
                </div>
              </div>
            </div>

            {/* Examples */}
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <h2 style={{ marginBottom: '16px', fontSize: '18px', color: '#333' }}>
                📊 Examples
              </h2>

              {calculateExamples().map((example, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: '16px',
                    padding: '16px',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${example.color}`
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>
                    {example.title}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                    Check-in: <strong>{example.checkIn}</strong> | Check-out: <strong>{example.checkOut}</strong>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: example.color }}>
                    Status: {example.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Staff-Specific Times Section */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '20px', color: '#333', marginBottom: '8px' }}>
                👤 Staff-Specific Time Settings
              </h2>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Configure custom work hours for individual staff members (overrides global settings)
              </p>
            </div>
            <button
              onClick={handleOpenStaffModal}
              style={{
                padding: '12px 24px',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ➕ Add Staff-Specific Time
            </button>
          </div>

          {staffSpecificTimes.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '48px', 
              background: '#f8f9fa', 
              borderRadius: '8px',
              color: '#666'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>👤</div>
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>No staff-specific times configured</p>
              <p style={{ fontSize: '14px' }}>Click "Add Staff-Specific Time" to set custom hours for individual staff</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '14px'
              }}>
                <thead>
                  <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Staff Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Check-In</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Late After</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Check-Out</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Min Hours</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Grace (min)</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Notes</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSpecificTimes.map((staffTime) => (
                    <tr key={staffTime.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                      <td style={{ padding: '12px' }}>
                        <strong>{staffTime.staff_name}</strong>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          background: '#e3f2fd', 
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {staffTime.staff_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ 
                          padding: '6px 12px', 
                          background: '#e8f5e9', 
                          borderRadius: '6px',
                          fontWeight: 600,
                          color: '#2e7d32'
                        }}>
                          {staffTime.check_in_time}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ 
                          padding: '6px 12px', 
                          background: '#fff3e0', 
                          borderRadius: '6px',
                          fontWeight: 600,
                          color: '#e65100'
                        }}>
                          {staffTime.late_threshold}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ 
                          padding: '6px 12px', 
                          background: '#fce4ec', 
                          borderRadius: '6px',
                          fontWeight: 600,
                          color: '#c2185b'
                        }}>
                          {staffTime.check_out_time}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {staffTime.minimum_work_hours}h
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {staffTime.grace_period_minutes} min
                      </td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#666' }}>
                        {staffTime.notes || '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleEditStaffTime(staffTime)}
                            style={{
                              padding: '6px 12px',
                              background: '#2196F3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDeleteStaffTime(staffTime.id)}
                            style={{
                              padding: '6px 12px',
                              background: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Staff-Specific Time Modal */}
        {showStaffModal && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => {
              setShowStaffModal(false);
              setEditingStaffTime(null);
            }}
          >
            <div 
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '32px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ marginBottom: '24px', fontSize: '24px', color: '#333' }}>
                {editingStaffTime ? '✏️ Edit Staff-Specific Time' : '👤 Add Staff-Specific Time'}
              </h2>

              <form onSubmit={handleStaffSubmit}>
                {/* Staff Selection */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Select Staff Member *
                  </label>
                  {loadingStaff ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                      Loading staff...
                    </div>
                  ) : editingStaffTime ? (
                    <div style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      background: '#f8f9fa',
                      fontSize: '14px',
                      color: '#333'
                    }}>
                      <strong>{staffFormData.staffName}</strong> ({staffFormData.staffType})
                    </div>
                  ) : (
                    <select
                      name="staffId"
                      value={staffFormData.staffId}
                      onChange={handleStaffChange}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">-- Select Staff --</option>
                      {staffList.map((staff) => (
                        <option key={`${staff.id}-${staff.staffType}`} value={staff.id}>
                          {staff.name} ({staff.staffType})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Check-In Time */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Check-In Time *
                  </label>
                  <input
                    type="time"
                    name="checkInTime"
                    value={staffFormData.checkInTime}
                    onChange={handleStaffChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Late Threshold */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Late Threshold *
                  </label>
                  <input
                    type="time"
                    name="lateThreshold"
                    value={staffFormData.lateThreshold}
                    onChange={handleStaffChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Check-Out Time */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Check-Out Time *
                  </label>
                  <input
                    type="time"
                    name="checkOutTime"
                    value={staffFormData.checkOutTime}
                    onChange={handleStaffChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Minimum Work Hours */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Minimum Work Hours *
                  </label>
                  <input
                    type="number"
                    name="minimumWorkHours"
                    value={staffFormData.minimumWorkHours}
                    onChange={handleStaffChange}
                    required
                    min="1"
                    max="24"
                    step="0.5"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Half Day Threshold */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Half Day Threshold (Hours) *
                  </label>
                  <input
                    type="number"
                    name="halfDayThreshold"
                    value={staffFormData.halfDayThreshold}
                    onChange={handleStaffChange}
                    required
                    min="1"
                    max="12"
                    step="0.5"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Grace Period */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Grace Period (Minutes) *
                  </label>
                  <input
                    type="number"
                    name="gracePeriodMinutes"
                    value={staffFormData.gracePeriodMinutes}
                    onChange={handleStaffChange}
                    required
                    min="0"
                    max="60"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Notes */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Notes (Optional)
                  </label>
                  <textarea
                    name="notes"
                    value={staffFormData.notes}
                    onChange={handleStaffChange}
                    rows="3"
                    placeholder="e.g., Night shift, Part-time schedule, etc."
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStaffModal(false);
                      setEditingStaffTime(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: '#e0e0e0',
                      color: '#333',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    {saving ? 'Saving...' : editingStaffTime ? '💾 Update Staff-Specific Time' : '💾 Save Staff-Specific Time'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
      )}
    </div>
  );
};

export default AttendanceTimeSettings;
