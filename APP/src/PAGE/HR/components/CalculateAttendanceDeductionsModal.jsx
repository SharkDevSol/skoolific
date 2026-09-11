import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import { getCurrentEthiopianMonth, getCurrentEthiopianMonthRange } from '../../../utils/ethiopianCalendar';

const STAFF_TYPES = ['Teachers', 'Supportive Staff', 'Administrative Staff', 'Finance'];

const CalculateAttendanceDeductionsModal = ({ onClose }) => {
  const [allStaff, setAllStaff] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedStaffType, setSelectedStaffType] = useState('');
  const ethMonth = getCurrentEthiopianMonth();
  const [month, setMonth] = useState(ethMonth.month);
  const [year, setYear] = useState(ethMonth.year);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const ethMonths = ['Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miazia','Ginbot','Sene','Hamle','Nehase','Pagume'];

  useEffect(() => {
    fetchAllStaff();
  }, []);

  const fetchAllStaff = async () => {
    let combined = [];
    for (const staffType of STAFF_TYPES) {
      try {
        const res = await api.get(`/staff/classes?staffType=${encodeURIComponent(staffType)}`);
        for (const cls of res.data) {
          const dataRes = await api.get(`/staff/data/${staffType}/${cls}`);
          (dataRes.data.data || []).forEach(s => combined.push({
            id: s.global_staff_id || s.id,
            name: s.full_name || s.name || 'Unknown',
            type: staffType
          }));
        }
      } catch {}
    }
    setAllStaff(combined);
  };

  const filteredStaff = allStaff.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCalculate = async () => {
    if (!selectedStaffId) return;
    setLoading(true);
    setResult(null);
    try {
      const staff = allStaff.find(s => s.id === selectedStaffId);
      const staffType = selectedStaffType || 'Teachers';
      const res = await api.get('/hr/attendance/calculate-deductions', {
        params: { staffId: selectedStaffId, staffType, ethMonth: month, ethYear: year }
      });
      setResult(res.data.data);
    } catch (err) {
      console.error('Error calculating deductions:', err);
      alert('Failed to calculate deductions');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDeductions = async () => {
    if (!result) return;
    try {
      const monthName = ethMonths[result.ethMonth - 1];
      const monthRange = getCurrentEthiopianMonthRange();
      for (const item of result.deductions.breakdown) {
        await api.post('/hr/salary/deductions', {
          staffId: result.staffId,
          staffName: allStaff.find(s => s.id === result.staffId)?.name || '',
          deductionType: item.type.toLowerCase(),
          amount: item.totalAmount,
          ethiopianMonth: monthName,
          ethiopianYear: result.ethYear,
          startDate: monthRange.startDate,
          endDate: monthRange.endDate,
          isRecurring: false
        });
      }
      alert('Deductions applied successfully!');
      onClose();
    } catch (err) {
      console.error('Error applying deductions:', err);
      alert('Failed to apply some deductions');
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '24px',
        width: '480px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', color: '#1a1a2e' }}>Calculate Attendance Deductions</h2>

        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#2c3e50', fontSize: '14px' }}>Search Staff</label>
        <input
          type="text" placeholder="Type to search staff..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '12px', boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#2c3e50', fontSize: '14px' }}>Staff</label>
        <select
          value={selectedStaffId}
          onChange={e => {
            setSelectedStaffId(e.target.value);
            const s = allStaff.find(x => x.id === e.target.value);
            if (s) setSelectedStaffType(s.type);
          }}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '12px' }}
        >
          <option value="">Select staff...</option>
          {filteredStaff.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#2c3e50', fontSize: '14px' }}>Ethiopian Month</label>
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
              {ethMonths.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#2c3e50', fontSize: '14px' }}>Year</label>
            <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={handleCalculate} disabled={!selectedStaffId || loading}
            style={{ flex: 1, padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>

        {result && (
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#1e293b' }}>
              {allStaff.find(s => s.id === result.staffId)?.name || 'Staff'} — {ethMonths[result.ethMonth - 1]} {result.ethYear}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
              Attendance records found: {result.attendanceRecords}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: '#475569' }}>Type</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', color: '#475569' }}>Count</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.deductions.breakdown.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>No deductions calculated</td></tr>
                )}
                {result.deductions.breakdown.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px' }}>{item.type}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.count}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{item.totalAmount.toFixed(2)} Birr</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 600 }}>
                  <td style={{ padding: '8px' }}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}></td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{result.deductions.total.toFixed(2)} Birr</td>
                </tr>
              </tbody>
            </table>
            {result.deductions.breakdown.length > 0 && (
              <button onClick={handleApplyDeductions}
                style={{ width: '100%', padding: '10px', marginTop: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                Apply Deductions to Salary
              </button>
            )}
          </div>
        )}

        <button onClick={onClose}
          style={{ width: '100%', padding: '10px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
          Close
        </button>
      </div>
    </div>
  );
};

export default CalculateAttendanceDeductionsModal;
