import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AccountList.module.css';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiEye, FiFilter } from 'react-icons/fi';
import { toast } from 'react-toastify';

const API_BASE = `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/finance/accounts`;

const AccountList = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: '',
    isActive: 'true',
    campusId: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    fetchAccounts();
  }, [filters, pagination.page]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const queryParams = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...(filters.type && { type: filters.type }),
        ...(filters.isActive && { isActive: filters.isActive }),
        ...(filters.campusId && { campusId: filters.campusId }),
        ...(searchTerm && { search: searchTerm })
      });

      const response = await fetch(`${API_BASE}?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      
      if (response.ok) {
        setAccounts(result.data);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages
        }));
      } else {
        toast.error(result.message || 'Failed to load accounts');
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchAccounts();
  };

  const handleDeactivate = async (accountId) => {
    if (!window.confirm('Are you sure you want to deactivate this account?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      
      if (response.ok) {
        toast.success('Account deactivated successfully');
        fetchAccounts();
      } else {
        toast.error(result.message || 'Failed to deactivate account');
      }
    } catch (error) {
      console.error('Error deactivating account:', error);
      toast.error('Failed to deactivate account');
    }
  };

  const getAccountTypeColor = (type) => {
    const colors = {
      ASSET: '#10b981',
      LIABILITY: '#ef4444',
      INCOME: '#3b82f6',
      EXPENSE: '#f59e0b'
    };
    return colors[type] || '#6b7280';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1>Chart of Accounts</h1>
          <p>Manage your financial account structure</p>
        </div>
        <button 
          className={styles.createButton}
          onClick={() => navigate('/finance/accounts/new')}
        >
          <FiPlus /> Create Account
        </button>
      </div>

      <div className={styles.controls}>
        <form onSubmit={handleSearch} className={styles.searchBar}>
          <FiSearch className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        <div className={styles.filters}>
          <FiFilter className={styles.filterIcon} />
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">All Types</option>
            <option value="ASSET">Assets</option>
            <option value="LIABILITY">Liabilities</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expenses</option>
          </select>

          <select
            value={filters.isActive}
            onChange={(e) => setFilters({ ...filters, isActive: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading accounts...</div>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Parent</th>
                  <th>Status</th>
                  <th>Children</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan="7" className={styles.noData}>
                      No accounts found
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => (
                    <tr key={account.id}>
                      <td className={styles.code}>{account.code}</td>
                      <td>{account.name}</td>
                      <td>
                        <span 
                          className={styles.typeBadge}
                          style={{ backgroundColor: getAccountTypeColor(account.type) }}
                        >
                          {account.type}
                        </span>
                      </td>
                      <td>
                        {account.parent ? (
                          <span className={styles.parentInfo}>
                            {account.parent.code} - {account.parent.name}
                          </span>
                        ) : (
                          <span className={styles.noParent}>Root</span>
                        )}
                      </td>
                      <td>
                        <span className={account.isActive ? styles.active : styles.inactive}>
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={styles.centered}>
                        {account._count?.children || 0}
                      </td>
                      <td className={styles.actions}>
                        <button
                          className={styles.viewButton}
                          onClick={() => navigate(`/finance/accounts/${account.id}`)}
                          title="View Details"
                        >
                          <FiEye />
                        </button>
                        <button
                          className={styles.editButton}
                          onClick={() => navigate(`/finance/accounts/${account.id}/edit`)}
                          title="Edit Account"
                        >
                          <FiEdit2 />
                        </button>
                        {account.isActive && (
                          <button
                            className={styles.deleteButton}
                            onClick={() => handleDeactivate(account.id)}
                            title="Deactivate Account"
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                disabled={pagination.page === 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AccountList;
