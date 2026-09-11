import { useState, useEffect } from 'react';
import styles from './AccountSelector.module.css';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/finance/accounts`;

const AccountSelector = ({ value, onChange, excludeId, type, disabled = false }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, [type]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const queryParams = new URLSearchParams({
        isActive: 'true',
        limit: 1000,
        ...(type && { type })
      });

      const response = await fetch(`${API_BASE}?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      
      if (response.ok) {
        // Filter out the current account if editing
        const filteredAccounts = excludeId 
          ? result.data.filter(acc => acc.id !== excludeId)
          : result.data;
        setAccounts(filteredAccounts);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <select disabled className={styles.select}>
        <option>Loading accounts...</option>
      </select>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={styles.select}
    >
      <option value="">-- No Parent (Root Account) --</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.code} - {account.name}
        </option>
      ))}
    </select>
  );
};

export default AccountSelector;
