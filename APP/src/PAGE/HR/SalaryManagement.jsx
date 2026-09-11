import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Plus, RefreshCw } from 'lucide-react';
import styles from './SalaryManagement.module.css';
import AddSalaryCompleteModal from './components/AddSalaryCompleteModal';
import Card from '../../COMPONENTS/Card/Card';
import Button from '../../COMPONENTS/Button/Button';
import EditSalaryModal from './components/EditSalaryModal';
import { getCurrentEthiopianMonth } from '../../utils/ethiopianCalendar';

const API_URL = import.meta.env.VITE_API_URL || '';

const SalaryManagement = () => {
  const { t } = useTranslation();
  const [allStaff, setAllStaff] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [activeTab, setActiveTab] = useState('staff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStaffForSalary, setSelectedStaffForSalary] = useState(null);
  
  // Modals
  const [showAddSalaryModal, setShowAddSalaryModal] = useState(false);
  const [showEditSalaryModal, setShowEditSalaryModal] = useState(false);
  const [currentEthiopianDate, setCurrentEthiopianDate] = useState(() => {
    return getCurrentEthiopianMonth();
  });

  useEffect(() => {
    fetchAllStaff();
    fetchSalaries();
    
    // Update Ethiopian date every minute
    const interval = setInterval(() => {
      setCurrentEthiopianDate(getCurrentEthiopianMonth());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchAllStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const types = ['Teachers', 'Supportive Staff', 'Administrative Staff', 'Finance'];
      let allStaffMembers = [];
      
      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(
            `${API_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`
          );
          
          for (const className of classesResponse.data) {
            try {
              const dataResponse = await axios.get(
                `${API_URL}/staff/data/${staffType}/${className}`
              );
              const staffData = dataResponse.data.data || [];
              
              const transformedStaff = staffData.map(staff => ({
                id: staff.global_staff_id || staff.id,
                employeeNumber: staff.global_staff_id || staff.id,
                firstName: (staff.full_name || staff.name || '').split(' ')[0] || '',
                lastName: (staff.full_name || staff.name || '').split(' ').slice(1).join(' ') || '',
                fullName: staff.full_name || staff.name || 'Unknown',
                email: staff.email || '',
                phone: staff.phone || '',
                staffType: staffType,
                role: staff.role || staff.position || staffType,
                profilePhotoUrl: staff.image_staff || null
              }));
              
              allStaffMembers = [...allStaffMembers, ...transformedStaff];
            } catch (err) {
              console.log(`Error fetching ${className}:`, err.message);
            }
          }
        } catch (err) {
          console.log(`No data for: ${staffType}`);
        }
      }
      
      setAllStaff(allStaffMembers);
    } catch (err) {
      setError('Failed to fetch staff members');
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalaries = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.get(`${API_URL}/hr/salary/all-salaries`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setSalaries(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching salaries:', err);
    }
  };

  // Check if staff has salary
  const staffHasSalary = (staffId) => {
    // Convert both to strings for comparison
    const staffIdStr = String(staffId);
    const hasSalary = salaries.some(salary => String(salary.staffId) === staffIdStr);
    console.log(`🔍 Checking salary for staff ${staffIdStr}:`, hasSalary, 'Salaries:', salaries.map(s => String(s.staffId)));
    return hasSalary;
  };

  // Get salary for staff
  const getStaffSalary = (staffId) => {
    const staffIdStr = String(staffId);
    return salaries.find(salary => String(salary.staffId) === staffIdStr);
  };

  // Handle add salary for specific staff
  const handleAddSalaryForStaff = (staff) => {
    // Check if staff already has a salary
    const existingSalary = salaries.find(s => s.staffId === staff.id);
    
    console.log('🔍 handleAddSalaryForStaff called');
    console.log('🔍 staff:', staff);
    console.log('🔍 staff.id:', staff.id);
    console.log('🔍 all salaries:', salaries);
    console.log('🔍 existingSalary found:', existingSalary);
    
    setSelectedStaffForSalary({
      ...staff,
      existingSalary: existingSalary || null
    });
    setShowAddSalaryModal(true);
  };

  // Handle edit salary for specific staff
  const handleEditSalaryForStaff = (staff) => {
    console.log('✏️ handleEditSalaryForStaff called');
    console.log('✏️ staff:', staff);
    console.log('✏️ staff.id:', staff.id, 'type:', typeof staff.id);
    console.log('✏️ all salaries:', salaries);
    
    // Try to find salary with different comparison methods
    const existingSalary1 = salaries.find(s => s.staffId === staff.id);
    const existingSalary2 = salaries.find(s => String(s.staffId) === String(staff.id));
    const existingSalary3 = salaries.find(s => parseInt(s.staffId) === parseInt(staff.id));
    
    console.log('✏️ existingSalary (===):', existingSalary1);
    console.log('✏️ existingSalary (String):', existingSalary2);
    console.log('✏️ existingSalary (parseInt):', existingSalary3);
    
    const existingSalary = existingSalary1 || existingSalary2 || existingSalary3;
    
    if (!existingSalary) {
      console.error('❌ No salary found!');
      console.error('❌ Looking for staff.id:', staff.id);
      console.error('❌ Available staffIds in salaries:', salaries.map(s => ({id: s.staffId, type: typeof s.staffId})));
      alert('No salary found for this staff member');
      return;
    }
    
    console.log('✅ Found salary:', existingSalary);
    
    setSelectedStaffForSalary({
      ...staff,
      existingSalary: existingSalary
    });
    setShowEditSalaryModal(true);
  };


  const tabs = [
    { id: 'staff', label: t('hr.salary.tabs.staff', 'All Staff') }
  ];

  return (
    <main className={styles.container} aria-label={t('hr.salary.title', 'Salary Management')}>
      <header className={styles.header}>
        <div>
          <h1>{t('hr.salary.title', 'Salary Management')}</h1>
          <p>{t('hr.salary.subtitle', 'Manage staff salaries and payroll')}</p>
          <div className={styles.dateBadge} role="status">
            {t('hr.salary.currentDate', 'Current Ethiopian Date')}: {currentEthiopianDate.day} {currentEthiopianDate.monthName} {currentEthiopianDate.year}
          </div>
        </div>
      </header>

      <nav className={styles.tabNavigation} aria-label={t('hr.salary.tabsLabel', 'Salary sections')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'staff' && (
        <div className={styles.actionBar}>
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            onClick={() => {
              fetchAllStaff();
              fetchSalaries();
            }}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className={styles.loading} role="status">{t('common.loading', 'Loading...')}</div>
      ) : error ? (
        <div className={styles.error} role="alert">{error}</div>
      ) : (
        <>
          {/* All Staff Tab */}
          {activeTab === 'staff' && (
            <Card className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.staffTable}>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Staff Name</th>
                    <th>Staff Type</th>
                    <th>Role</th>
                    <th>Account Number</th>
                    <th>Salary Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allStaff.length === 0 ? (
                    <tr>
                      <td colSpan="7" className={styles.emptyCell}>
                        {t('hr.salary.noStaff', 'No staff members found.')}
                      </td>
                    </tr>
                  ) : (
                    allStaff.map(staff => {
                      const hasSalary = staffHasSalary(staff.id);
                      const salary = getStaffSalary(staff.id);
                      
                      return (
                        <tr key={staff.id}>
                          <td>
                            {staff.profilePhotoUrl ? (
                              <img 
                                src={`${API_URL}/uploads/${staff.profilePhotoUrl}`}
                                alt={staff.fullName}
                                className={styles.staffPhoto}
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            ) : (
                              <div className={styles.staffPhotoPlaceholder} aria-hidden="true">
                                {staff.firstName.charAt(0)}{staff.lastName.charAt(0)}
                              </div>
                            )}
                          </td>
                          <td>
                            <strong>{staff.fullName}</strong>
                            <br />
                            <small className={styles.subText}>ID: {staff.employeeNumber}</small>
                          </td>
                          <td>
                            <span className={styles.staffTypeBadge}>
                              {staff.staffType}
                            </span>
                          </td>
                          <td>{staff.role}</td>
                          <td>
                            {hasSalary && salary?.accountName ? (
                              <span style={{ fontWeight: '500', color: '#2c3e50' }}>
                                {salary.accountName}
                              </span>
                            ) : (
                              <span style={{ color: '#95a5a6' }}>-</span>
                            )}
                          </td>
                          <td>
                            {hasSalary ? (
                              <div className={styles.salaryInfo}>
                                <span className={styles.salaryBadgeHas}>{t('hr.salary.hasSalary', 'Salary Added')}</span>
                                <div className={styles.salaryDetails}>
                                  <small>Base: {parseFloat(salary.baseSalary).toFixed(2)} Birr</small>
                                  <small>Net: {parseFloat(salary.netSalary).toFixed(2)} Birr</small>
                                </div>
                              </div>
                            ) : (
                              <span className={styles.salaryBadgeNo}>{t('hr.salary.noSalary', 'No Salary')}</span>
                            )}
                          </td>
                          <td>
                            {!hasSalary ? (
                              <Button size="sm" variant="primary" onClick={() => handleAddSalaryForStaff(staff)}>
                                {t('hr.salary.addSalary', 'Add Salary')}
                              </Button>
                            ) : (
                              <div className={styles.actionButtonsGroup}>
                                <Button size="sm" variant="secondary" onClick={() => handleEditSalaryForStaff(staff)}>
                                  {t('common.edit', 'Edit')}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            </Card>
          )}

          {/* Deductions Tab */}
          {activeTab === 'deductions' && (
            <Card className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.staffTable}>
                <thead>
                  <tr>
                    <th>Staff Name</th>
                    <th>Deduction Type</th>
                    <th>Amount</th>
                    <th>Ethiopian Month</th>
                    <th>Period</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                        No deductions added yet. Click "Add Deduction" to get started.
                      </td>
                    </tr>
                  ) : (
                    deductions.map(deduction => (
                      <tr key={deduction.id}>
                        <td>{deduction.staff_name}</td>
                        <td>
                          <span className={styles.deductionBadge}>
                            {deduction.deduction_type.charAt(0).toUpperCase() + deduction.deduction_type.slice(1)}
                          </span>
                        </td>
                        <td>${parseFloat(deduction.amount).toFixed(2)}</td>
                        <td>
                          <strong>{deduction.ethiopian_month} {deduction.ethiopian_year}</strong>
                        </td>
                        <td>
                          <small>{deduction.start_date} to {deduction.end_date}</small>
                        </td>
                        <td>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteDeduction(deduction.id)}>
                            {t('common.delete', 'Delete')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </Card>
          )}

          {/* Allowances Tab */}
          {activeTab === 'allowances' && (
            <Card className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.staffTable}>
                <thead>
                  <tr>
                    <th>Staff Name</th>
                    <th>Allowance Name</th>
                    <th>Amount</th>
                    <th>Ethiopian Month</th>
                    <th>Period</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allowances.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                        No allowances added yet. Click "Add Allowance" to get started.
                      </td>
                    </tr>
                  ) : (
                    allowances.map(allowance => (
                      <tr key={allowance.id}>
                        <td>{allowance.staff_name}</td>
                        <td>
                          <span className={styles.allowanceBadge}>
                            {allowance.allowance_name}
                          </span>
                        </td>
                        <td>${parseFloat(allowance.amount).toFixed(2)}</td>
                        <td>
                          <strong>{allowance.ethiopian_month} {allowance.ethiopian_year}</strong>
                        </td>
                        <td>
                          <small>{allowance.start_date} to {allowance.end_date}</small>
                        </td>
                        <td>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteAllowance(allowance.id)}>
                            {t('common.delete', 'Delete')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </Card>
          )}

          {/* Retentions Tab */}
          {activeTab === 'retentions' && (
            <Card className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.staffTable}>
                <thead>
                  <tr>
                    <th>Staff Name</th>
                    <th>Retention Type</th>
                    <th>Amount</th>
                    <th>Date Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {retentions.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                        No retention benefits added yet. Click "Add Retention Benefit" to get started.
                      </td>
                    </tr>
                  ) : (
                    retentions.map(retention => (
                      <tr key={retention.id}>
                        <td>{retention.staff_name}</td>
                        <td>
                          <span className={styles.retentionBadge}>
                            {retention.retention_type.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                        </td>
                        <td>${parseFloat(retention.amount).toFixed(2)}</td>
                        <td>{new Date(retention.created_at).toLocaleDateString()}</td>
                        <td>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteRetention(retention.id)}>
                            {t('common.delete', 'Delete')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </Card>
          )}
        </>
      )}

      {/* Modals */}
      {showAddSalaryModal && (
        <AddSalaryCompleteModal
          preSelectedStaff={selectedStaffForSalary}
          onClose={() => {
            setShowAddSalaryModal(false);
            setSelectedStaffForSalary(null);
            fetchSalaries().then(() => {
              fetchAllStaff();
            });
          }}
        />
      )}

      {showEditSalaryModal && selectedStaffForSalary && (
        <EditSalaryModal
          staff={selectedStaffForSalary}
          existingSalary={selectedStaffForSalary.existingSalary}
          onClose={() => {
            setShowEditSalaryModal(false);
            setSelectedStaffForSalary(null);
          }}
          onSuccess={() => {
            fetchSalaries().then(() => {
              fetchAllStaff();
            });
          }}
        />
      )}
    </main>
  );
};

export default SalaryManagement;
