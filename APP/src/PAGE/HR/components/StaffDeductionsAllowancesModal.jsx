import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'https://iqrab3.skoolific.com/api'));

const StaffDeductionsAllowancesModal = ({ staff, onClose }) => {
  const [deductions, setDeductions] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [salary, setSalary] = useState(null);
  const [attendanceDeductions, setAttendanceDeductions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStaffDeductionsAndAllowances();
  }, []);

  const fetchStaffDeductionsAndAllowances = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // Fetch salary info
      const salaryResponse = await axios.get(
        `${API_URL}/hr/salary/all-salaries`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Find salary for this staff
      if (salaryResponse.data.success) {
        const staffSalary = salaryResponse.data.data.find(
          s => String(s.staffId) === String(staff.id)
        );
        setSalary(staffSalary);
      }
      
      // Fetch deductions
      const deductionsResponse = await axios.get(
        `${API_URL}/hr/salary/deductions?staffId=${staff.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Fetch allowances
      const allowancesResponse = await axios.get(
        `${API_URL}/hr/salary/allowances?staffId=${staff.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Fetch attendance-based deductions for current Ethiopian month
      const currentEthMonth = getCurrentEthiopianMonthNumber();
      const currentEthYear = 2018; // Current Ethiopian year
      
      try {
        const attendanceDeductionsResponse = await axios.get(
          `${API_URL}/api/hr/attendance/calculate-deductions?staffId=${staff.id}&staffType=${encodeURIComponent(staff.staffType)}&ethMonth=${currentEthMonth}&ethYear=${currentEthYear}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (attendanceDeductionsResponse.data.success) {
          setAttendanceDeductions(attendanceDeductionsResponse.data.data);
        }
      } catch (err) {
        console.log('No attendance deductions found or not configured');
      }
      
      if (deductionsResponse.data.success) {
        setDeductions(deductionsResponse.data.data);
      }
      
      if (allowancesResponse.data.success) {
        setAllowances(allowancesResponse.data.data);
      }
    } catch (err) {
      setError('Failed to fetch deductions and allowances');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get current Ethiopian month number (1-13)
  const getCurrentEthiopianMonthNumber = () => {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    let ethMonth = month + 4;
    if (ethMonth > 13) ethMonth -= 13;
    return ethMonth;
  };

  // Get current Ethiopian month
  const getCurrentEthiopianMonth = () => {
    const ethiopianMonths = [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ];
    
    const monthNumber = getCurrentEthiopianMonthNumber();
    return ethiopianMonths[monthNumber - 1];
  };

  const calculateTotalDeductions = () => {
    const deductionsTotal = deductions.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    return deductionsTotal.toFixed(2);
  };

  const calculateTotalAllowances = () => {
    return allowances.reduce((sum, a) => sum + parseFloat(a.amount), 0).toFixed(2);
  };

  // Calculate deductions for CURRENT MONTH ONLY
  const calculateCurrentMonthDeductions = () => {
    const currentMonth = getCurrentEthiopianMonth();
    const currentMonthDeductions = deductions.filter(d => d.ethiopian_month === currentMonth);
    const deductionsTotal = currentMonthDeductions.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    
    // Add attendance-based deductions
    const attendanceTotal = attendanceDeductions?.deductions?.total || 0;
    
    return (deductionsTotal + attendanceTotal).toFixed(2);
  };

  // Calculate allowances for CURRENT MONTH ONLY
  const calculateCurrentMonthAllowances = () => {
    const currentMonth = getCurrentEthiopianMonth();
    const currentMonthAllowances = allowances.filter(a => a.ethiopian_month === currentMonth);
    return currentMonthAllowances.reduce((sum, a) => sum + parseFloat(a.amount), 0).toFixed(2);
  };

  // Calculate net salary for CURRENT MONTH ONLY
  const calculateCurrentMonthNetSalary = () => {
    if (!salary) return 0;
    const baseSalary = parseFloat(salary.baseSalary) || 0;
    const totalDeductions = parseFloat(calculateCurrentMonthDeductions()) || 0;
    const totalAllowances = parseFloat(calculateCurrentMonthAllowances()) || 0;
    
    // Net Salary = Base Salary - Current Month Deductions + Current Month Allowances
    return (baseSalary - totalDeductions + totalAllowances).toFixed(2);
  };

  const calculateNetSalary = () => {
    if (!salary) return 0;
    const baseSalary = parseFloat(salary.baseSalary) || 0;
    const totalDeductions = parseFloat(calculateTotalDeductions()) || 0;
    const totalAllowances = parseFloat(calculateTotalAllowances()) || 0;
    
    // Net Salary = Base Salary - Total Deductions (including tax) + Allowances
    return (baseSalary - totalDeductions + totalAllowances).toFixed(2);
  };

  // Get deductions grouped by type for ALL MONTHS
  const getDeductionsByType = () => {
    const byType = {};
    deductions.forEach(d => {
      const type = d.deduction_type;
      byType[type] = (byType[type] || 0) + parseFloat(d.amount);
    });
    return byType;
  };

  // Get allowances grouped by type for ALL MONTHS
  const getAllowancesByType = () => {
    const byType = {};
    allowances.forEach(a => {
      // Support both old (allowance_name) and new (allowance_type) columns
      const type = a.allowance_type || a.allowance_name || 'Other';
      byType[type] = (byType[type] || 0) + parseFloat(a.amount);
    });
    return byType;
  };

  const handleDeleteDeduction = async (id) => {
    if (!confirm('Are you sure you want to delete this deduction?')) return;
    
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.delete(
        `${API_URL}/hr/salary/deductions/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        alert('Deduction deleted successfully!');
        fetchStaffDeductionsAndAllowances(); // Refresh data
      }
    } catch (err) {
      console.error('Error deleting deduction:', err);
      alert('Failed to delete deduction');
    }
  };

  const handleDeleteAllowance = async (id) => {
    if (!confirm('Are you sure you want to delete this allowance?')) return;
    
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.delete(
        `${API_URL}/hr/salary/allowances/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        alert('Allowance deleted successfully!');
        fetchStaffDeductionsAndAllowances(); // Refresh data
      }
    } catch (err) {
      console.error('Error deleting allowance:', err);
      alert('Failed to delete allowance');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Deductions & Allowances - {staff.fullName}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="deductions-allowances-content">
            {/* Salary Info Card */}
            {salary && (
              <div className="salary-info-card">
                <h3 className="section-title">💰 Current Month Salary ({getCurrentEthiopianMonth()} 2018)</h3>
                <div className="salary-breakdown">
                  <div className="salary-row">
                    <span>Base Salary:</span>
                    <strong>Birr {parseFloat(salary.baseSalary).toFixed(2)}</strong>
                  </div>
                  <div className="salary-row">
                    <span>Current Month Deductions:</span>
                    <strong className="text-red">-Birr {calculateCurrentMonthDeductions()}</strong>
                  </div>
                  <div className="salary-row">
                    <span>Current Month Allowances:</span>
                    <strong className="text-green">+Birr {calculateCurrentMonthAllowances()}</strong>
                  </div>
                  <div className="salary-row salary-total">
                    <span>Net Salary (This Month):</span>
                    <strong className="text-blue">Birr {calculateCurrentMonthNetSalary()}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Attendance-Based Deductions Card */}
            {attendanceDeductions && attendanceDeductions.deductions.total > 0 && (
              <div className="attendance-deductions-card" style={{
                background: '#fff3cd',
                border: '2px solid #ffc107',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <h3 className="section-title" style={{ color: '#856404', marginBottom: '15px' }}>
                  ⚠️ Attendance-Based Deductions ({getCurrentEthiopianMonth()} 2018)
                </h3>
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ fontSize: '14px', color: '#856404', marginBottom: '10px' }}>
                    Automatic deductions based on attendance records:
                  </p>
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    {attendanceDeductions.deductions.breakdown.map((item, index) => (
                      <div key={index} style={{
                        background: 'white',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #ffc107',
                        minWidth: '200px'
                      }}>
                        <div style={{ fontSize: '12px', color: '#856404', marginBottom: '4px' }}>
                          {item.type === 'ABSENT' && '❌ Absent Days'}
                          {item.type === 'LATE' && '⏰ Late Arrivals'}
                          {item.type === 'HALF_DAY' && '⏱️ Half Days'}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#d9534f', marginBottom: '4px' }}>
                          Birr {item.totalAmount.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          {item.count} × Birr {item.amountPerOccurrence.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{
                  borderTop: '1px solid #ffc107',
                  paddingTop: '15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#856404' }}>
                    Total Attendance Deductions:
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#d9534f' }}>
                    Birr {attendanceDeductions.deductions.total.toFixed(2)}
                  </span>
                </div>
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#856404' }}>
                  💡 These deductions are calculated automatically based on your attendance records and the configured deduction rules.
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="summary-cards">
              <div className="summary-card deductions-card">
                <div className="summary-icon">📉</div>
                <div className="summary-info">
                  <h3>Current Month Deductions</h3>
                  <p className="summary-amount">Birr {calculateCurrentMonthDeductions()}</p>
                  <small>{deductions.filter(d => d.ethiopian_month === getCurrentEthiopianMonth()).length} entries this month</small>
                </div>
              </div>
              
              <div className="summary-card allowances-card">
                <div className="summary-icon">📈</div>
                <div className="summary-info">
                  <h3>Current Month Allowances</h3>
                  <p className="summary-amount">Birr {calculateCurrentMonthAllowances()}</p>
                  <small>{allowances.filter(a => a.ethiopian_month === getCurrentEthiopianMonth()).length} entries this month</small>
                </div>
              </div>
            </div>

            {/* Deductions Section */}
            <div className="details-section">
              <h3 className="section-title">📉 Deductions</h3>
              
              {/* Deductions by Type Breakdown */}
              {deductions.length > 0 && Object.keys(getDeductionsByType()).length > 0 && (
                <div className="type-breakdown">
                  <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#7f8c8d' }}>
                    Total Breakdown by Type (All Months):
                  </h4>
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '15px' }}>
                    {Object.entries(getDeductionsByType()).map(([type, total]) => (
                      <div key={type} style={{ 
                        padding: '8px 15px', 
                        background: '#ffe6e6', 
                        borderRadius: '8px',
                        border: '1px solid #ffcccc'
                      }}>
                        <strong style={{ color: '#e74c3c', textTransform: 'capitalize' }}>
                          {type}:
                        </strong>
                        <span style={{ marginLeft: '8px', color: '#2c3e50' }}>
                          Birr {total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {deductions.length === 0 ? (
                <p className="empty-message">No deductions found</p>
              ) : (
                <div className="details-table-container">
                  <table className="details-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Ethiopian Month</th>
                        <th>Period</th>
                        <th>Date Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductions.map(deduction => (
                        <tr key={deduction.id}>
                          <td>
                            <span className="deduction-badge">
                              {deduction.deduction_type.charAt(0).toUpperCase() + deduction.deduction_type.slice(1)}
                            </span>
                          </td>
                          <td className="amount-cell">
                            <strong>Birr {parseFloat(deduction.amount).toFixed(2)}</strong>
                          </td>
                          <td>
                            <strong>{deduction.ethiopian_month} {deduction.ethiopian_year}</strong>
                          </td>
                          <td>
                            <small>{deduction.start_date} to {deduction.end_date}</small>
                          </td>
                          <td>
                            <small>{new Date(deduction.created_at).toLocaleDateString()}</small>
                          </td>
                          <td>
                            <button 
                              onClick={() => handleDeleteDeduction(deduction.id)}
                              className="btn-delete-small"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Allowances Section */}
            <div className="details-section">
              <h3 className="section-title">📈 Allowances</h3>
              
              {/* Allowances by Type Breakdown */}
              {allowances.length > 0 && Object.keys(getAllowancesByType()).length > 0 && (
                <div className="type-breakdown">
                  <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#7f8c8d' }}>
                    Total Breakdown by Type (All Months):
                  </h4>
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '15px' }}>
                    {Object.entries(getAllowancesByType()).map(([type, total]) => (
                      <div key={type} style={{ 
                        padding: '8px 15px', 
                        background: '#e6f7e6', 
                        borderRadius: '8px',
                        border: '1px solid #b3e6b3'
                      }}>
                        <strong style={{ color: '#27ae60', textTransform: 'capitalize' }}>
                          {type}:
                        </strong>
                        <span style={{ marginLeft: '8px', color: '#2c3e50' }}>
                          Birr {total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {allowances.length === 0 ? (
                <p className="empty-message">No allowances found</p>
              ) : (
                <div className="details-table-container">
                  <table className="details-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Ethiopian Month</th>
                        <th>Period</th>
                        <th>Date Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allowances.map(allowance => {
                        // Support both old (allowance_name) and new (allowance_type) columns
                        const displayType = allowance.allowance_type || allowance.allowance_name || 'Other';
                        return (
                          <tr key={allowance.id}>
                            <td>
                              <span className="allowance-badge">
                                {displayType.charAt(0).toUpperCase() + displayType.slice(1)}
                              </span>
                            </td>
                            <td className="amount-cell">
                              <strong>Birr {parseFloat(allowance.amount).toFixed(2)}</strong>
                            </td>
                            <td>
                              <strong>{allowance.ethiopian_month} {allowance.ethiopian_year}</strong>
                            </td>
                            <td>
                              <small>{allowance.start_date} to {allowance.end_date}</small>
                            </td>
                            <td>
                              <small>{new Date(allowance.created_at).toLocaleDateString()}</small>
                            </td>
                            <td>
                              <button 
                                onClick={() => handleDeleteAllowance(allowance.id)}
                                className="btn-delete-small"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} className="btn-cancel">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffDeductionsAllowancesModal;
