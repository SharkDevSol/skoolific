import React, { useState } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

const EditSalaryModal = ({ onClose, staff, existingSalary, onSuccess }) => {
  console.log('✏️ EditSalaryModal opened');
  console.log('✏️ staff:', staff);
  console.log('✏️ existingSalary:', existingSalary);

  const [formData, setFormData] = useState({
    accountName: existingSalary?.accountName || '',
    baseSalary: existingSalary?.baseSalary || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const payload = {
        staffId: staff.id,
        staffName: staff.fullName,
        staffType: staff.staffType,
        accountName: formData.accountName,
        baseSalary: parseFloat(formData.baseSalary),
        taxAmount: 0,
        netSalary: parseFloat(formData.baseSalary),
        effectiveFrom: new Date().toISOString().split('T')[0]
      };

      console.log('✏️ Updating salary with payload:', payload);

      const response = await axios.put(
        `${API_URL}/hr/salary/update-complete/${existingSalary.id}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ Update response:', response.data);

      if (response.data.success) {
        alert('Salary updated successfully!');
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('❌ Error updating salary:', err);
      setError(err.response?.data?.error?.message || 'Failed to update salary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✏️ Edit Salary - {staff.fullName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Account Number *</label>
            <input
              type="text"
              value={formData.accountName}
              onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
              placeholder="Enter account number"
              required
            />
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
              {loading ? 'Updating...' : '✅ Update Salary'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditSalaryModal;
