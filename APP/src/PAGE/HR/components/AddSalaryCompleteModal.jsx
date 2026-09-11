import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

// Edit Salary Modal Component - Updated
const AddSalaryCompleteModal = ({ onClose, preSelectedStaff }) => {
  // Debug logging
  console.log('🔍 Modal opened with preSelectedStaff:', preSelectedStaff);
  console.log('🔍 existingSalary:', preSelectedStaff?.existingSalary);
  
  const isEditMode = preSelectedStaff?.existingSalary ? true : false;
  const existingSalary = preSelectedStaff?.existingSalary;
  
  console.log('🔍 isEditMode:', isEditMode);
  console.log('🔍 existingSalary data:', existingSalary);
  
  const [staffTypes, setStaffTypes] = useState([]);
  const [staffType, setStaffType] = useState(preSelectedStaff?.staffType || '');
  const [staffList, setStaffList] = useState(preSelectedStaff ? [preSelectedStaff] : []);
  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState({
    staffId: preSelectedStaff?.id || '',
    staffName: preSelectedStaff?.fullName || '',
    accountId: existingSalary?.accountId || '',
    accountName: existingSalary?.accountName || '',
    baseSalary: existingSalary?.baseSalary || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  console.log('🔍 Initial formData:', formData);

  useEffect(() => {
    fetchAccounts();
    fetchStaffTypes();
  }, []);

  useEffect(() => {
    if (staffType) {
      fetchStaffByType(staffType);
    } else {
      setStaffList([]);
      setFormData({ ...formData, staffId: '', staffName: '', accountId: '', accountName: '' });
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
      // Fallback to default types if API fails
      setStaffTypes([
        { type: 'TEACHER', label: 'Teacher' },
        { type: 'SUPPORTIVE', label: 'Supportive' },
        { type: 'ADMINISTRATIVE', label: 'Administrative' }
      ]);
    }
  };

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/finance/accounts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setAccounts(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
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
      setError('Failed to fetch staff list');
    }
  };

  const handleStaffChange = (e) => {
    const selectedStaffId = e.target.value;
    const selectedStaff = staffList.find(s => s.id === selectedStaffId);
    
    // Get the full name from the staff object
    let fullName = '';
    if (selectedStaff) {
      const firstName = selectedStaff.firstName || '';
      const lastName = selectedStaff.lastName || '';
      fullName = `${firstName} ${lastName}`.trim();
      
      // If name is still empty, try to get it from other fields
      if (!fullName && selectedStaff.email) {
        fullName = selectedStaff.email.split('@')[0];
      }
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
      
      // Just use whatever the user typed in the account field
      const accountInput = formData.accountName.trim();
      
      if (!accountInput) {
        setError('Please enter an account number');
        setLoading(false);
        return;
      }
      
      const payload = {
        staffId: formData.staffId,
        staffName: formData.staffName,
        staffType: staffType,
        accountName: accountInput,
        baseSalary: parseFloat(formData.baseSalary),
        taxAmount: 0,  // Tax is now added as a deduction
        netSalary: parseFloat(formData.baseSalary),  // Net = Base (no tax here)
        effectiveFrom: new Date().toISOString().split('T')[0]
      };

      console.log('💰 Submitting salary data:', payload);

      let response;
      if (isEditMode && existingSalary?.id) {
        // Update existing salary
        console.log('✏️ Updating salary ID:', existingSalary.id);
        response = await axios.put(
          `${API_URL}/hr/salary/update-complete/${existingSalary.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        // Create new salary
        console.log('➕ Creating new salary');
        response = await axios.post(
          `${API_URL}/hr/salary/add-complete`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      console.log('✅ Salary save response:', response.data);

      if (response.data.success) {
        alert(isEditMode ? 'Salary updated successfully!' : 'Salary added successfully! Add tax as a deduction if needed.');
        onClose();
      }
    } catch (err) {
      console.error('❌ Error saving salary:', err);
      setError(err.response?.data?.error?.message || 'Failed to add salary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditMode ? `Edit Salary - ${preSelectedStaff.fullName}` : (preSelectedStaff ? `Add Salary - ${preSelectedStaff.fullName}` : 'Add Salary')}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

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
                        {staff.firstName} {staff.lastName} ({staff.employeeNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label>Account Number *</label>
            <input
              type="text"
              list="accounts-list"
              value={formData.accountName}
              onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
              placeholder="Type or select account number (e.g., 5100 - Salary Expense)"
              required
            />
            <datalist id="accounts-list">
              {accounts.map(account => (
                <option key={account.id} value={`${account.code} - ${account.name}`} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label>Base Salary Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.baseSalary}
              onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
              placeholder="Enter base salary"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Salary' : 'Add Salary')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSalaryCompleteModal;
