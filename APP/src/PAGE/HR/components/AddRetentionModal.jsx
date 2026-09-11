import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

const AddRetentionModal = ({ onClose }) => {
  const [staffTypes, setStaffTypes] = useState([]);
  const [staffType, setStaffType] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [formData, setFormData] = useState({
    staffId: '',
    staffName: '',
    retentionType: '',
    amount: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const retentionTypes = [
    { value: 'tuition_waiver', label: 'Tuition Waiver' },
    { value: 'merit_pay', label: 'Merit Pay' }
  ];

  useEffect(() => {
    fetchStaffTypes();
  }, []);

  useEffect(() => {
    if (staffType) {
      fetchStaffByType(staffType);
    } else {
      setStaffList([]);
      setFormData({ ...formData, staffId: '', staffName: '' });
    }
  }, [staffType]);

  const fetchStaffTypes = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/hr/salary/staff-types`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setStaffTypes(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching staff types:', err);
    }
  };

  const fetchStaffByType = async (type) => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/hr/salary/staff?staffType=${type}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setStaffList(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching staff:', err);
    }
  };

  const handleStaffChange = (e) => {
    const selectedStaffId = e.target.value;
    const selectedStaff = staffList.find(s => s.id === selectedStaffId);
    
    let fullName = '';
    if (selectedStaff) {
      const firstName = selectedStaff.firstName || '';
      const lastName = selectedStaff.lastName || '';
      fullName = `${firstName} ${lastName}`.trim();
    }
    
    setFormData({
      ...formData,
      staffId: selectedStaffId,
      staffName: fullName
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const payload = {
        staffId: formData.staffId,
        staffName: formData.staffName,
        retentionType: formData.retentionType,
        amount: parseFloat(formData.amount)
      };

      const response = await axios.post(
        `${API_URL}/hr/salary/retentions`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('Retention benefit added successfully!');
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add retention benefit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Staff Retention</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Staff Type *</label>
            <select
              value={staffType}
              onChange={(e) => setStaffType(e.target.value)}
              required
            >
              <option value="">Select Staff Type</option>
              {staffTypes.map(type => (
                <option key={type.type} value={type.type}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {staffType && (
            <div className="form-group">
              <label>Staff Name *</label>
              <select
                value={formData.staffId}
                onChange={handleStaffChange}
                required
              >
                <option value="">Select Staff Member</option>
                {staffList.map(staff => (
                  <option key={staff.id} value={staff.id}>
                    {staff.firstName} {staff.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Retention Type *</label>
            <select
              value={formData.retentionType}
              onChange={(e) => setFormData({ ...formData, retentionType: e.target.value })}
              required
            >
              <option value="">Select Retention Type</option>
              {retentionTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Enter amount"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Adding...' : 'Add Retention Benefit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRetentionModal;
