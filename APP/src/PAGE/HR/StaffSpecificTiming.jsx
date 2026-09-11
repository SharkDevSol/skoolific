import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../Finance/PaymentManagement.module.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const StaffSpecificTiming = () => {
  const [staff, setStaff] = useState([]);
  const [specificTimings, setSpecificTimings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    shift_type: 'shift1',
    custom_check_in: '',
    custom_check_out: '',
    custom_late_threshold: '',
    anytime_check: false,
    notes: ''
  });

  useEffect(() => {
    fetchAllStaff();
    fetchSpecificTimings();
  }, []);

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
      setMessage('Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

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

  const handleStaffSelect = (staffMember) => {
    setSelectedStaff(staffMember);
    setFormData({
      shift_type: staffMember.shift_assignment === 'both' ? 'shift1' : staffMember.shift_assignment,
      custom_check_in: '',
      custom_check_out: '',
      custom_late_threshold: '',
      anytime_check: false,
      notes: ''
    });
    setShowModal(true);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
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
          shift_type: formData.shift_type,
          custom_check_in: formData.custom_check_in || null,
          custom_check_out: formData.custom_check_out || null,
          custom_late_threshold: formData.custom_late_threshold || null,
          anytime_check: formData.anytime_check,
          notes: formData.notes
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

  const handleDelete = async (staffId, shiftType) => {
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

  const filteredStaff = staff.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime12Hour = (time24) => {
    if (!time24) return 'Not set';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>⏰ Staff-Specific Shift Timing</h1>
        <p>Set custom check-in/out times for individual staff members</p>
      </div>

      {message && (
        <div className={message.includes('✅') ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h3>Current Specific Timings ({specificTimings.length})</h3>
        {specificTimings.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No specific timings configured yet</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Shift</th>
                  <th>Custom Check-In</th>
                  <th>Custom Check-Out</th>
                  <th>Custom Late Time</th>
                  <th>Anytime Check</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {specificTimings.map((timing) => (
                  <tr key={`${timing.staff_id}-${timing.shift_type}`}>
                    <td>{timing.staff_name}</td>
                    <td>
                      <span className={timing.shift_type === 'shift1' ? styles.shiftBadge1 : styles.shiftBadge2}>
                        {timing.shift_type === 'shift1' ? 'Shift 1' : 'Shift 2'}
                      </span>
                    </td>
                    <td>{formatTime12Hour(timing.custom_check_in)}</td>
                    <td>{formatTime12Hour(timing.custom_check_out)}</td>
                    <td>{formatTime12Hour(timing.custom_late_threshold)}</td>
                    <td>
                      {timing.anytime_check ? (
                        <span style={{ color: 'green', fontWeight: 'bold' }}>✓ Yes</span>
                      ) : (
                        <span style={{ color: '#999' }}>No</span>
                      )}
                    </td>
                    <td>{timing.notes || '-'}</td>
                    <td>
                      <button
                        onClick={() => handleDelete(timing.staff_id, timing.shift_type)}
                        className={styles.deleteButton}
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '30px' }}>
        <h3>Add Specific Timing for Staff</h3>
        <input
          type="text"
          placeholder="Search staff by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.input}
          style={{ marginBottom: '15px', width: '100%', maxWidth: '400px' }}
        />

        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Current Shift</th>
                <th>Email</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((staffMember) => (
                <tr key={`${staffMember.id}-${staffMember.className}`}>
                  <td>{staffMember.name}</td>
                  <td>{staffMember.department}</td>
                  <td>
                    <span className={
                      staffMember.shift_assignment === 'shift1' ? styles.shiftBadge1 :
                      staffMember.shift_assignment === 'shift2' ? styles.shiftBadge2 :
                      styles.shiftBadgeBoth
                    }>
                      {staffMember.shift_assignment === 'shift1' ? 'Shift 1' :
                       staffMember.shift_assignment === 'shift2' ? 'Shift 2' : 'Both'}
                    </span>
                  </td>
                  <td>{staffMember.email || '-'}</td>
                  <td>
                    <button
                      onClick={() => handleStaffSelect(staffMember)}
                      className={styles.button}
                      style={{ padding: '5px 15px', fontSize: '13px' }}
                    >
                      Set Specific Time
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedStaff && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: '600px' }}>
            <h2>Set Specific Timing for {selectedStaff.name}</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Current Shift: <strong>{selectedStaff.shift_assignment}</strong>
            </p>

            <div className={styles.formGroup}>
              <label>Select Shift to Configure:</label>
              <select
                value={formData.shift_type}
                onChange={(e) => handleInputChange('shift_type', e.target.value)}
                className={styles.input}
              >
                {selectedStaff.shift_assignment === 'both' ? (
                  <>
                    <option value="shift1">Shift 1</option>
                    <option value="shift2">Shift 2</option>
                  </>
                ) : (
                  <option value={selectedStaff.shift_assignment}>
                    {selectedStaff.shift_assignment === 'shift1' ? 'Shift 1' : 'Shift 2'}
                  </option>
                )}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={formData.anytime_check}
                  onChange={(e) => handleInputChange('anytime_check', e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <strong>Anytime Check</strong> - Staff can come anytime (no late/half-day/absent deductions)
              </label>
            </div>

            {!formData.anytime_check && (
              <>
                <div className={styles.formGroup}>
                  <label>Custom Check-In Time:</label>
                  <input
                    type="time"
                    value={formData.custom_check_in}
                    onChange={(e) => handleInputChange('custom_check_in', e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Custom Check-Out Time:</label>
                  <input
                    type="time"
                    value={formData.custom_check_out}
                    onChange={(e) => handleInputChange('custom_check_out', e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Custom Late Threshold:</label>
                  <input
                    type="time"
                    value={formData.custom_late_threshold}
                    onChange={(e) => handleInputChange('custom_late_threshold', e.target.value)}
                    className={styles.input}
                  />
                </div>
              </>
            )}

            <div className={styles.formGroup}>
              <label>Notes (optional):</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className={styles.input}
                rows="3"
                placeholder="Any additional notes..."
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className={styles.button}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className={styles.cancelButton}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffSpecificTiming;
