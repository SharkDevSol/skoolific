import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getCurrentEthiopianMonthRange } from '../../../utils/ethiopianCalendar';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

const AddAllowanceModal = ({ onClose, preSelectedStaff }) => {
  const [staffTypes, setStaffTypes] = useState([]);
  const [staffType, setStaffType] = useState(preSelectedStaff?.staffType || '');
  const [staffList, setStaffList] = useState(preSelectedStaff ? [preSelectedStaff] : []);
  const [monthInfo, setMonthInfo] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringEndMonth, setRecurringEndMonth] = useState('');
  const [formData, setFormData] = useState({
    staffId: preSelectedStaff?.id || '',
    staffName: preSelectedStaff?.fullName || '',
    allowanceType: '',
    amount: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const allowanceTypes = [
    { value: 'housing', label: 'Housing' },
    { value: 'transport', label: 'Transport' },
    { value: 'food', label: 'Food' },
    { value: 'medical', label: 'Medical' },
    { value: 'education', label: 'Education' },
    { value: 'bonus', label: 'Bonus' },
    { value: 'overtime', label: 'Overtime' },
    { value: 'other', label: 'Other' }
  ];

  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  useEffect(() => {
    fetchStaffTypes();
    // Get current Ethiopian month info
    const currentMonth = getCurrentEthiopianMonthRange();
    setMonthInfo(currentMonth);
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
        allowanceType: formData.allowanceType,
        amount: parseFloat(formData.amount),
        ethiopianMonth: monthInfo.ethiopianMonth,
        ethiopianYear: monthInfo.ethiopianYear,
        startDate: monthInfo.startDate,
        endDate: monthInfo.endDate,
        isRecurring: isRecurring,
        recurringEndMonth: isRecurring ? recurringEndMonth : null
      };

      const response = await axios.post(
        `${API_URL}/hr/salary/allowances`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        if (isRecurring) {
          alert(`Recurring allowance added! Will continue until ${recurringEndMonth} ${monthInfo.ethiopianYear}.`);
        } else {
          alert(`Allowance added for ${monthInfo.ethiopianMonth} ${monthInfo.ethiopianYear}!`);
        }
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add allowance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{preSelectedStaff ? `Add Allowance - ${preSelectedStaff.fullName}` : 'Add Allowance'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {monthInfo && (
          <div className="ethiopian-month-info">
            <strong>📅 Ethiopian Month:</strong> {monthInfo.displayText}
            <br />
            <small>Period: {monthInfo.startDate} to {monthInfo.endDate}</small>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Only show staff selection if NOT pre-selected */}
          {!preSelectedStaff && (
            <>
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
            </>
          )}

          <div className="form-group">
            <label>Allowance Type *</label>
            <select
              value={formData.allowanceType}
              onChange={(e) => setFormData({ ...formData, allowanceType: e.target.value })}
              required
            >
              <option value="">Select Allowance Type</option>
              {allowanceTypes.map(type => (
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

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              <span>Recurring (repeat monthly until selected month)</span>
            </label>
          </div>

          {isRecurring && (
            <div className="form-group">
              <label>Recurring Until Month *</label>
              <select
                value={recurringEndMonth}
                onChange={(e) => setRecurringEndMonth(e.target.value)}
                required={isRecurring}
              >
                <option value="">Select end month</option>
                {ethiopianMonths.map((month, index) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
              <small style={{ color: '#7f8c8d', marginTop: '5px', display: 'block' }}>
                This allowance will be applied every month from {monthInfo?.ethiopianMonth} until {recurringEndMonth || '...'} {monthInfo?.ethiopianYear}
              </small>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Adding...' : 'Add Allowance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAllowanceModal;
