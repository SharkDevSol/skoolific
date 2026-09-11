import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../Finance/PaymentManagement.module.css';
import { getCurrentEthiopianMonth } from '../../utils/ethiopianCalendar';

const API_URL = import.meta.env.VITE_API_URL || '';

const PayrollSystem = () => {
  const [payrollData, setPayrollData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [currentEthiopianDate, setCurrentEthiopianDate] = useState(() => {
    return getCurrentEthiopianMonth();
  });

  useEffect(() => {
    // Update Ethiopian date every minute
    const interval = setInterval(() => {
      setCurrentEthiopianDate(getCurrentEthiopianMonth());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const handleGeneratePayroll = async (ethMonth, ethYear) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      if (!token) {
        alert('❌ Authentication required. Please login again.');
        return;
      }

      console.log(`📊 Generating payroll for Ethiopian month ${ethMonth}/${ethYear}`);
      
      const response = await axios.post(
        `${API_URL}/hr/payroll/generate`,
        { ethMonth, ethYear },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setPayrollData(response.data.data);
        setSelectedMonth(ethMonth);
        setSelectedYear(ethYear);
        setShowModal(false);
        alert('✅ Payroll generated successfully!');
      }
    } catch (error) {
      console.error('Error generating payroll:', error);
      if (error.response?.status === 404) {
        alert('❌ No salary records found. Please add salaries in Salary Management first.');
      } else if (error.response?.status === 403) {
        alert('❌ Access denied. Please check your permissions.');
      } else {
        alert('❌ Failed to generate payroll: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!payrollData) return;

    setExporting(true);
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/hr/payroll/export-excel`,
        {
          ethMonth: selectedMonth,
          ethYear: selectedYear,
          payrollData: payrollData.payroll
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Payroll_${selectedMonth}_${selectedYear}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert('✅ Payroll exported successfully!');
    } catch (error) {
      console.error('Error exporting payroll:', error);
      alert('❌ Failed to export payroll');
    } finally {
      setExporting(false);
    }
  };

  const getMonthName = (month) => {
    const ethiopianMonths = [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ];
    return ethiopianMonths[month - 1] || month;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>💰 Payroll System</h1>
          <p>Generate payroll from salary management data</p>
          <div style={{ 
            marginTop: '10px', 
            padding: '8px 15px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            borderRadius: '8px',
            display: 'inline-block',
            fontSize: '0.9em',
            fontWeight: '500'
          }}>
            📅 Current Ethiopian Date: {currentEthiopianDate.day} {currentEthiopianDate.monthName} {currentEthiopianDate.year}
          </div>
        </div>
        <button 
          className={styles.recordButton} 
          onClick={() => setShowModal(true)}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 600
          }}
        >
          📊 Generate Payroll
        </button>
      </div>

      {payrollData ? (
        <>
          {/* Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '20px', 
            marginBottom: '24px' 
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '24px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Period</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>
                {getMonthName(payrollData.month)} {payrollData.year}
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              padding: '24px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(240, 147, 251, 0.3)'
            }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Staff Count</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{payrollData.staff_count}</div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              padding: '24px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(79, 172, 254, 0.3)'
            }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Total Gross</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>
                {payrollData.total_gross.toFixed(2)} Birr
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              padding: '24px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(250, 112, 154, 0.3)'
            }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Total Deductions</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>
                {payrollData.total_deductions.toFixed(2)} Birr
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
              padding: '24px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(67, 233, 123, 0.3)'
            }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Total Net Salary</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>
                {payrollData.total_net.toFixed(2)} Birr
              </div>
            </div>
          </div>

          {/* Export Button */}
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              style={{
                padding: '12px 24px',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                opacity: exporting ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginLeft: 'auto'
              }}
            >
              📥 {exporting ? 'Exporting...' : 'Export to Excel'}
            </button>
          </div>

          {/* Payroll Table */}
          <div style={{ 
            background: 'white', 
            borderRadius: '12px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '20px', 
              borderBottom: '1px solid #e0e0e0',
              background: '#f8f9fa'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', color: '#333' }}>
                Payroll Details - {getMonthName(payrollData.month)} {payrollData.year}
              </h2>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '14px'
              }}>
                <thead>
                  <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>No.</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Staff Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Staff Type</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Account Number</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Base Salary</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Allowances</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Gross Salary</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Deductions</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Net Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollData.payroll.map((item, index) => (
                    <tr key={`${item.staff_id}-${index}`} style={{ borderBottom: '1px solid #e0e0e0' }}>
                      <td style={{ padding: '12px' }}>{index + 1}</td>
                      <td style={{ padding: '12px' }}>
                        <strong>{item.staff_name}</strong>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          background: '#e3f2fd', 
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {item.staff_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                        {item.account_number}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                        {item.base_salary.toFixed(2)} Birr
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#4CAF50', fontWeight: 600 }}>
                        +{item.total_allowances.toFixed(2)} Birr
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#2196F3' }}>
                        {item.gross_salary.toFixed(2)} Birr
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#f44336', fontWeight: 600 }}>
                        -{item.total_deductions.toFixed(2)} Birr
                      </td>
                      <td style={{ 
                        padding: '12px', 
                        textAlign: 'right', 
                        fontWeight: 700, 
                        fontSize: '16px',
                        color: '#4CAF50'
                      }}>
                        {item.net_salary.toFixed(2)} Birr
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8f9fa', borderTop: '2px solid #e0e0e0', fontWeight: 700 }}>
                    <td colSpan="4" style={{ padding: '12px', textAlign: 'right' }}>TOTAL:</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {payrollData.payroll.reduce((sum, item) => sum + item.base_salary, 0).toFixed(2)} Birr
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#4CAF50' }}>
                      +{payrollData.total_gross - payrollData.payroll.reduce((sum, item) => sum + item.base_salary, 0).toFixed(2)} Birr
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#2196F3' }}>
                      {payrollData.total_gross.toFixed(2)} Birr
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#f44336' }}>
                      -{payrollData.total_deductions.toFixed(2)} Birr
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: '18px', color: '#4CAF50' }}>
                      {payrollData.total_net.toFixed(2)} Birr
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>📊</div>
          <h3 style={{ fontSize: '24px', marginBottom: '12px', color: '#333' }}>
            No Payroll Generated Yet
          </h3>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '24px' }}>
            Click "Generate Payroll" to create payroll from salary management data
          </p>
          <button 
            className={styles.recordButton} 
            onClick={() => setShowModal(true)}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            📊 Generate Payroll
          </button>
        </div>
      )}

      {showModal && (
        <GeneratePayrollModal
          onClose={() => setShowModal(false)}
          onGenerate={handleGeneratePayroll}
          loading={loading}
        />
      )}
    </div>
  );
};

const GeneratePayrollModal = ({ onClose, onGenerate, loading }) => {
  const currentEthiopianDate = getCurrentEthiopianMonth();
  const [ethMonth, setEthMonth] = useState(currentEthiopianDate.month);
  const [ethYear, setEthYear] = useState(currentEthiopianDate.year);

  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate(ethMonth, ethYear);
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '24px', fontSize: '24px', color: '#333' }}>
          📊 Generate Payroll
        </h2>

        <div style={{ 
          padding: '12px', 
          background: '#e3f2fd', 
          borderRadius: '8px', 
          marginBottom: '20px',
          fontSize: '14px',
          color: '#1976d2'
        }}>
          <strong>📅 Current Month:</strong> {currentEthiopianDate.monthName} {currentEthiopianDate.year}
          <br />
          <small>Generating payroll for the selected Ethiopian month</small>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Ethiopian Month *
            </label>
            <select
              value={ethMonth}
              onChange={(e) => setEthMonth(parseInt(e.target.value))}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            >
              {ethiopianMonths.map((month, index) => (
                <option key={index + 1} value={index + 1}>
                  {month} ({index + 1})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Ethiopian Year *
            </label>
            <input
              type="number"
              value={ethYear}
              onChange={(e) => setEthYear(parseInt(e.target.value))}
              required
              min="2000"
              max="2100"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ 
            padding: '16px', 
            background: '#e3f2fd', 
            borderRadius: '8px', 
            marginBottom: '24px',
            fontSize: '14px',
            color: '#1976d2'
          }}>
            <strong>ℹ️ Note:</strong> Payroll will be generated from salary data in Salary Management for the selected month.
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                background: '#e0e0e0',
                color: '#333',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Generating...' : '📊 Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayrollSystem;
