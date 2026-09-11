import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './AccountForm.module.css';
import { FiSave, FiX, FiArrowLeft } from 'react-icons/fi';
import { toast } from 'react-toastify';
import AccountSelector from './AccountSelector';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/finance/accounts`;

const AccountForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'ASSET',
    parentId: null,
    campusId: null
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchAccount();
    }
  }, [id]);

  const fetchAccount = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      
      if (response.ok) {
        setFormData({
          code: result.data.code,
          name: result.data.name,
          type: result.data.type,
          parentId: result.data.parentId,
          campusId: result.data.campusId
        });
      } else {
        toast.error(result.message || 'Failed to load account');
        navigate('/finance/accounts');
      }
    } catch (error) {
      console.error('Error fetching account:', error);
      toast.error('Failed to load account');
      navigate('/finance/accounts');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.code.trim()) {
      newErrors.code = 'Account code is required';
    } else if (!/^[A-Z0-9-]+$/.test(formData.code)) {
      newErrors.code = 'Account code must contain only uppercase letters, numbers, and hyphens';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Account name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Account name must be at least 3 characters';
    }

    if (!formData.type) {
      newErrors.type = 'Account type is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      
      const url = isEdit ? `${API_BASE}/${id}` : API_BASE;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (response.ok) {
        toast.success(isEdit ? 'Account updated successfully' : 'Account created successfully');
        navigate('/finance/accounts');
      } else {
        if (result.error === 'CONFLICT') {
          setErrors({ code: 'This account code already exists' });
        }
        toast.error(result.message || 'Failed to save account');
      }
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Failed to save account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading account...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button 
          className={styles.backButton}
          onClick={() => navigate('/finance/accounts')}
        >
          <FiArrowLeft /> Back to Accounts
        </button>
        <h1>{isEdit ? 'Edit Account' : 'Create New Account'}</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="code">
              Account Code <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              id="code"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="e.g., ASSET-001"
              className={errors.code ? styles.inputError : ''}
              disabled={isEdit} // Code cannot be changed after creation
            />
            {errors.code && <span className={styles.error}>{errors.code}</span>}
            <small className={styles.hint}>
              Use uppercase letters, numbers, and hyphens only
            </small>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="name">
              Account Name <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Cash in Bank"
              className={errors.name ? styles.inputError : ''}
            />
            {errors.name && <span className={styles.error}>{errors.name}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="type">
              Account Type <span className={styles.required}>*</span>
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className={errors.type ? styles.inputError : ''}
            >
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </select>
            {errors.type && <span className={styles.error}>{errors.type}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="parentId">Parent Account</label>
            <AccountSelector
              value={formData.parentId}
              onChange={(value) => setFormData(prev => ({ ...prev, parentId: value }))}
              excludeId={id}
              type={formData.type}
            />
            <small className={styles.hint}>
              Leave empty for root-level account
            </small>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => navigate('/finance/accounts')}
            disabled={submitting}
          >
            <FiX /> Cancel
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            <FiSave /> {submitting ? 'Saving...' : (isEdit ? 'Update Account' : 'Create Account')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccountForm;
