import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

const AddSalaryModal = ({ staff, onClose }) => {
  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState({
    accountId: '',
    baseSalary: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/hr/salary/staff/${staff.id}/salary`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('Salary added successfully!');
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add salary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Salary - {staff.firstName} {staff.lastName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Account *</label>
            <select
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              required
            >
              <option value="">Select Account</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Base Salary *</label>
            <input
              type="number"
              step="0.01"
              value={formData.baseSalary}
              onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Effective From *</label>
            <input
              type="date"
              value={formData.effectiveFrom}
              onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows="3"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Adding...' : 'Add Salary'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSalaryModal;
