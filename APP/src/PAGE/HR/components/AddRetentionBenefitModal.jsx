import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

const AddRetentionBenefitModal = ({ staff, onClose }) => {
  const [retentionBenefitTypes, setRetentionBenefitTypes] = useState([]);
  const [formData, setFormData] = useState({
    retentionBenefitTypeId: '',
    amount: '',
    calculationType: 'FIXED',
    effectiveFrom: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRetentionBenefitTypes();
  }, []);

  const fetchRetentionBenefitTypes = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/hr/salary/retention-benefit-types`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setRetentionBenefitTypes(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching retention benefit types:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/hr/salary/staff/${staff.id}/retention-benefits`,
        formData,
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
          <h2>Add Retention Benefit - {staff.firstName} {staff.lastName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Retention Benefit Type *</label>
            <select
              value={formData.retentionBenefitTypeId}
              onChange={(e) => setFormData({ ...formData, retentionBenefitTypeId: e.target.value })}
              required
            >
              <option value="">Select Retention Benefit Type</option>
              {retentionBenefitTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.type})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Calculation Type *</label>
            <select
              value={formData.calculationType}
              onChange={(e) => setFormData({ ...formData, calculationType: e.target.value })}
              required
            >
              <option value="FIXED">Fixed Amount</option>
              <option value="PERCENTAGE">Percentage</option>
            </select>
          </div>

          <div className="form-group">
            <label>Amount * {formData.calculationType === 'PERCENTAGE' && '(%)'}</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
              {loading ? 'Adding...' : 'Add Retention Benefit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRetentionBenefitModal;
