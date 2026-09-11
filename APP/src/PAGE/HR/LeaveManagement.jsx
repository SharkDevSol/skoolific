import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Plus } from 'lucide-react';
import styles from './LeaveManagement.module.css';
import { getCurrentEthiopianMonth, getEthiopianMonthName } from '../../utils/ethiopianCalendar';
import Card from '../../COMPONENTS/Card/Card';
import Button from '../../COMPONENTS/Button/Button';
import Select from '../../COMPONENTS/Select/Select';
import Input from '../../COMPONENTS/Input/Input';
import Table from '../../COMPONENTS/Table/Table';
import Badge from '../../COMPONENTS/Badge/Badge';

const API_URL = import.meta.env.VITE_API_URL || '';

const LeaveManagement = () => {
  const { t } = useTranslation();
  const [attendanceIssues, setAttendanceIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING'); // PENDING, APPROVED, REJECTED, ALL
  const [activeTab, setActiveTab] = useState('issues'); // 'issues' or 'leave-records'
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [approvalStats, setApprovalStats] = useState({ approved: 0, rejected: 0, total: 0 });
  const currentEthMonth = getCurrentEthiopianMonth();
  const [selectedEthMonth, setSelectedEthMonth] = useState(currentEthMonth.month);
  const [selectedEthYear, setSelectedEthYear] = useState(currentEthMonth.year);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showLeaveRequestModal, setShowLeaveRequestModal] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });

  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  useEffect(() => {
    fetchAttendanceIssues();
    fetchStaffList();
    fetchLeaveRecords();
    fetchApprovalStats();
  }, [selectedEthMonth, selectedEthYear, filter]);

  const fetchStaffList = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // Fetch all staff from all departments using the same approach as ListStaff
      const types = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
      let allStaff = [];
      
      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(
            `${API_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`
          );
          
          console.log(`📚 Classes for ${staffType}:`, classesResponse.data);
          
          for (const className of classesResponse.data) {
            try {
              const dataResponse = await axios.get(
                `${API_URL}/staff/data/${staffType}/${className}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );
              
              console.log(`👥 Staff in ${staffType}/${className}:`, dataResponse.data.data);
              
              const staffWithMeta = dataResponse.data.data.map(staff => {
                const staffId = staff.global_staff_id || staff.staff_id || staff.id;
                const staffName = staff.full_name || staff.name || 'Unknown';
                
                console.log(`  - ${staffName} (ID: ${staffId})`);
                
                return {
                  id: staffId,
                  name: staffName,
                  staffType,
                  className,
                  email: staff.email,
                  phone: staff.phone
                };
              });
              
              allStaff = [...allStaff, ...staffWithMeta];
            } catch (err) {
              console.warn(`No data for: ${staffType}/${className}`);
            }
          }
        } catch (err) {
          console.warn(`No classes for: ${staffType}`);
        }
      }

      setStaffList(allStaff);
      console.log('✅ Loaded staff for leave:', allStaff.length, 'members');
      console.log('📋 Staff list:', allStaff);
    } catch (error) {
      console.error('Error fetching staff list:', error);
    }
  };

  const fetchAttendanceIssues = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      console.log(`📋 Fetching attendance issues for ${ethiopianMonths[selectedEthMonth - 1]} ${selectedEthYear}, filter: ${filter}`);
      
      const response = await axios.get(
        `${API_URL}/hr/leave/attendance-issues?ethMonth=${selectedEthMonth}&ethYear=${selectedEthYear}&status=${filter}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        console.log(`✅ Received ${response.data.data.length} attendance issues`);
        console.log('📊 Issues breakdown:', {
          total: response.data.data.length,
          pending: response.data.data.filter(i => i.permission_status === 'PENDING').length,
          approved: response.data.data.filter(i => i.permission_status === 'APPROVED').length,
          rejected: response.data.data.filter(i => i.permission_status === 'REJECTED').length
        });
        setAttendanceIssues(response.data.data);
      }
    } catch (error) {
      console.error('❌ Error fetching attendance issues:', error);
      console.error('Error details:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaveRecords = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      console.log(`🏖️ Fetching leave records for ${ethiopianMonths[selectedEthMonth - 1]} ${selectedEthYear}`);
      
      const response = await axios.get(
        `${API_URL}/hr/leave/leave-records?ethMonth=${selectedEthMonth}&ethYear=${selectedEthYear}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        console.log(`✅ Received ${response.data.data.length} leave records`);
        console.log('📊 Total leave days:', response.data.data.reduce((sum, r) => sum + (r.total_days || 0), 0));
        setLeaveRecords(response.data.data);
      }
    } catch (error) {
      console.error('❌ Error fetching leave records:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const fetchApprovalStats = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      console.log('📊 Fetching approval stats...');
      
      const response = await axios.get(
        `${API_URL}/hr/leave/approval-stats`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      console.log('📈 Approval stats response:', response.data);

      if (response.data.success) {
        setApprovalStats(response.data.data);
        console.log('✅ Approval stats set:', response.data.data);
      }
    } catch (error) {
      console.error('Error fetching approval stats:', error);
    }
  };

  const handleApprove = async (issue) => {
    setSelectedIssue(issue);
    setShowPermissionModal({ type: 'approve', issue });
  };

  const handleReject = async (issue) => {
    setSelectedIssue(issue);
    setShowPermissionModal({ type: 'reject', issue });
  };

  const submitPermission = async (type, reason) => {
    if (!reason || reason.trim() === '') {
      setMessage({ type: 'error', text: 'Please provide a reason' });
      return;
    }

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const endpoint = type === 'approve' ? 'approve-permission' : 'reject-permission';
      
      const response = await axios.post(
        `${API_URL}/hr/leave/${endpoint}`,
        {
          attendanceId: selectedIssue.attendance_id,
          reason
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        if (type === 'approve') {
          setMessage({ type: 'success', text: 'Permission approved! No deduction will be applied.' });
        } else {
          setMessage({ type: 'success', text: 'Permission rejected. Deduction will be applied.' });
        }
        setShowPermissionModal(false);
        setSelectedIssue(null);
        fetchAttendanceIssues();
        fetchApprovalStats();
      }
    } catch (error) {
      console.error('Error processing permission:', error);
      setMessage({ type: 'error', text: 'Failed to process permission' });
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'LATE': '#FF9800',
      'ABSENT': '#F44336',
      'HALF_DAY': '#2196F3',
      'H': '#2196F3',
      'LATE_HALF_DAY': '#9C27B0',
      'L+H': '#9C27B0',
      'LATE + HALF_DAY': '#9C27B0',
      'NO_CHECKOUT': '#FF5722',
      'NCO': '#FF5722',
      'L+NCO': '#E91E63',
      'LATE + without check out': '#E91E63'
    };
    return colors[status] || '#9E9E9E';
  };

  const getPermissionStatusBadge = (permissionStatus) => {
    if (permissionStatus === 'APPROVED') {
      return <span style={{ padding: '4px 12px', background: '#4CAF50', color: 'white', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>✅ APPROVED</span>;
    } else if (permissionStatus === 'REJECTED') {
      return <span style={{ padding: '4px 12px', background: '#F44336', color: 'white', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>❌ REJECTED</span>;
    } else {
      return <span style={{ padding: '4px 12px', background: '#FFC107', color: '#000', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>⏳ PENDING</span>;
    }
  };

  const getDeductionInfo = (issue) => {
    if (issue.permission_status === 'APPROVED') {
      return <span style={{ color: '#4CAF50', fontWeight: 600 }}>No Deduction</span>;
    } else {
      return <span style={{ color: '#F44336', fontWeight: 600 }}>{issue.deduction_amount ? `${issue.deduction_amount} Birr` : 'Will be deducted'}</span>;
    }
  };

  const stats = {
    total: attendanceIssues.length,
    pending: attendanceIssues.filter(i => i.permission_status === 'PENDING').length,
    approved: attendanceIssues.filter(i => i.permission_status === 'APPROVED').length,
    rejected: attendanceIssues.filter(i => i.permission_status === 'REJECTED').length,
    totalDeductions: attendanceIssues
      .filter(i => i.permission_status !== 'APPROVED')
      .reduce((sum, i) => sum + parseFloat(i.deduction_amount || 0), 0)
  };

  // Calculate leave records stats
  const leaveStats = {
    totalStaffOnLeave: leaveRecords.length,
    totalLeaveDays: leaveRecords.reduce((sum, record) => sum + (record.total_days || 0), 0)
  };

  const monthOptions = useMemo(
    () => ethiopianMonths.map((month, index) => ({ value: String(index + 1), label: month })),
    [ethiopianMonths]
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: 'PENDING', label: t('hr.leave.status.pending', 'Pending') },
      { value: 'APPROVED', label: t('hr.leave.status.approved', 'Approved') },
      { value: 'REJECTED', label: t('hr.leave.status.rejected', 'Rejected') },
      { value: 'ALL', label: t('common.all', 'All') }
    ],
    [t]
  );

  return (
    <main className={styles.container} aria-label={t('hr.leave.title', 'Leave Management')}>
      <header className={styles.header}>
        <div>
          <h1>{t('hr.leave.title', 'Leave Management')}</h1>
          <p>{t('hr.leave.subtitle', 'Manage attendance issues and permission requests')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowLeaveRequestModal(true)}>
          {t('hr.leave.grantLeave', 'Grant Leave')}
        </Button>
      </header>

      {message.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: message.type === 'success' ? '#f0fdf4' : '#fef2f2', color: message.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{message.type === 'success' ? '✅' : '❌'}</span>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: '', text: '' })} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.125rem', color: message.type === 'success' ? '#16a34a' : '#dc2626' }}>×</button>
        </div>
      )}

      <Card className={styles.filtersCard}>
        <div className={styles.filters}>
          <Select
            label={t('hr.leave.month', 'Month')}
            value={String(selectedEthMonth)}
            onChange={(val) => setSelectedEthMonth(parseInt(val, 10))}
            options={monthOptions}
          />
          <Input
            label={t('hr.leave.year', 'Year')}
            type="number"
            value={String(selectedEthYear)}
            onChange={(val) => setSelectedEthYear(parseInt(val, 10) || currentEthMonth.year)}
            min={2010}
            max={2030}
          />
          <Select
            label={t('hr.leave.statusFilter', 'Status')}
            value={filter}
            onChange={setFilter}
            options={statusFilterOptions}
          />
        </div>
      </Card>

      <div className={styles.statsRow}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Issues</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#333' }}>{stats.total}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>Attendance issues</div>
        </div>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Pending</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#FFC107' }}>{stats.pending}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>Awaiting decision</div>
        </div>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Approved</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#4CAF50' }}>{stats.approved}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>No deduction</div>
        </div>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Rejected</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#F44336' }}>{stats.rejected}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>With deduction</div>
        </div>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Deductions</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#F44336' }}>{stats.totalDeductions.toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>Birr</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #9C27B0 0%, #E91E63 100%)', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', color: 'white' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.9 }}>🏖️ Staff on Leave</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{leaveStats.totalStaffOnLeave}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>This month</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #00BCD4 0%, #2196F3 100%)', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', color: 'white' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.9 }}>📅 Total Leave Days</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{leaveStats.totalLeaveDays}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Days granted this month</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', color: 'white' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.9 }}>My Approvals</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{approvalStats.approved}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Total approved by you</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', color: 'white' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.9 }}>My Rejections</div>
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{approvalStats.rejected}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Total rejected by you</div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', borderBottom: '2px solid #e0e0e0' }}>
        <button
          onClick={() => setActiveTab('issues')}
          style={{
            padding: '12px 24px',
            background: 'transparent',
            color: activeTab === 'issues' ? '#2196F3' : '#666',
            border: 'none',
            borderBottom: activeTab === 'issues' ? '3px solid #2196F3' : '3px solid transparent',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '15px'
          }}
        >
          📋 Attendance Issues
        </button>
        <button
          onClick={() => setActiveTab('leave-records')}
          style={{
            padding: '12px 24px',
            background: 'transparent',
            color: activeTab === 'leave-records' ? '#2196F3' : '#666',
            border: 'none',
            borderBottom: activeTab === 'leave-records' ? '3px solid #2196F3' : '3px solid transparent',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '15px'
          }}
        >
          🏖️ Leave Records
        </button>
      </div>

      {/* Attendance Issues Tab */}
      {activeTab === 'issues' && (
        <>
          {/* Filter Tabs */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setFilter('PENDING')}
              style={{
                padding: '10px 20px',
                background: filter === 'PENDING' ? '#FFC107' : 'white',
                color: filter === 'PENDING' ? 'white' : '#666',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ⏳ Pending ({stats.pending})
            </button>
            <button
              onClick={() => setFilter('APPROVED')}
              style={{
                padding: '10px 20px',
                background: filter === 'APPROVED' ? '#4CAF50' : 'white',
                color: filter === 'APPROVED' ? 'white' : '#666',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ✅ Approved ({stats.approved})
            </button>
            <button
              onClick={() => setFilter('REJECTED')}
              style={{
                padding: '10px 20px',
                background: filter === 'REJECTED' ? '#F44336' : 'white',
                color: filter === 'REJECTED' ? 'white' : '#666',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ❌ Rejected ({stats.rejected})
            </button>
            <button
              onClick={() => setFilter('ALL')}
              style={{
                padding: '10px 20px',
                background: filter === 'ALL' ? '#2196F3' : 'white',
                color: filter === 'ALL' ? 'white' : '#666',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              📋 All ({stats.total})
            </button>
          </div>
        </>
      )}

      {/* Issues Table */}
      {activeTab === 'issues' && (
        <>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600 }}>Staff Name</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600 }}>Department</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Issue Type</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Check-In</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Check-Out</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Permission</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Approved By</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Deduction</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceIssues.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                        No attendance issues found for this period
                      </td>
                    </tr>
                  ) : (
                    attendanceIssues.map(issue => (
                      <tr key={issue.attendance_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '16px', fontWeight: 600 }}>
                          {issue.staff_name}
                        </td>
                        <td style={{ padding: '16px', color: '#666' }}>
                          {issue.department_name || 'N/A'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontWeight: 600 }}>Day {issue.ethiopian_day}</div>
                          <div style={{ fontSize: '12px', color: '#999' }}>
                            {getEthiopianMonthName(issue.ethiopian_month)} {issue.ethiopian_year}
                          </div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <span style={{
                            padding: '6px 12px',
                            background: getStatusColor(issue.status) + '20',
                            color: getStatusColor(issue.status),
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '13px'
                          }}>
                            {issue.status === 'LATE' && '⏰ LATE'}
                            {issue.status === 'ABSENT' && '❌ ABSENT'}
                            {issue.status === 'HALF_DAY' && '⏱️ HALF DAY'}
                            {issue.status === 'H' && '⏱️ HALF DAY'}
                            {issue.status === 'LATE_HALF_DAY' && '🕐 LATE + HALF DAY'}
                            {issue.status === 'L+H' && '🕐 LATE + HALF DAY'}
                            {issue.status === 'LATE + HALF_DAY' && '🕐 LATE + HALF DAY'}
                            {issue.status === 'NO_CHECKOUT' && '🚪 NO CHECK-OUT'}
                            {issue.status === 'NCO' && '🚪 NO CHECK-OUT'}
                            {issue.status === 'L+NCO' && '🔴 LATE + NO CHECK-OUT'}
                            {issue.status === 'LATE + without check out' && '🔴 LATE + NO CHECK-OUT'}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                          {issue.check_in || '-'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                          {issue.check_out || '-'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {getPermissionStatusBadge(issue.permission_status)}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#666' }}>
                          {issue.approved_by || '-'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {getDeductionInfo(issue)}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {issue.permission_status === 'PENDING' && (
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleApprove(issue)}
                                style={{
                                  padding: '6px 12px',
                                  background: '#4CAF50',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 600
                                }}
                              >
                                ✅ Approve
                              </button>
                              <button
                                onClick={() => handleReject(issue)}
                                style={{
                                  padding: '6px 12px',
                                  background: '#F44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 600
                                }}
                              >
                                ❌ Reject
                              </button>
                            </div>
                          )}
                          {issue.permission_status !== 'PENDING' && (
                            <div style={{ fontSize: '12px', color: '#999' }}>
                              {issue.permission_reason || 'No reason provided'}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Leave Records Table */}
      {activeTab === 'leave-records' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600 }}>Staff Name</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600 }}>Department</th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Leave Period</th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Total Days</th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600 }}>Leave Reason</th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>Granted Date</th>
              </tr>
            </thead>
            <tbody>
              {leaveRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    No leave records found for this period
                  </td>
                </tr>
              ) : (
                leaveRecords.map((record, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '16px', fontWeight: 600 }}>
                      {record.staff_name}
                    </td>
                    <td style={{ padding: '16px', color: '#666' }}>
                      {record.department_name || 'N/A'}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 600 }}>
                        Day {record.start_day} - Day {record.end_day}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        {ethiopianMonths[selectedEthMonth - 1]} {selectedEthYear}
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '6px 12px',
                        background: '#9C27B020',
                        color: '#9C27B0',
                        borderRadius: '6px',
                        fontWeight: 600,
                        fontSize: '13px'
                      }}>
                        🏖️ {record.total_days} days
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: '#666' }}>
                      {record.leave_reason?.replace('Leave: ', '') || 'N/A'}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
                      {new Date(record.granted_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPermissionModal && (
        <PermissionModal
          type={showPermissionModal.type}
          issue={showPermissionModal.issue}
          onClose={() => { setShowPermissionModal(false); setSelectedIssue(null); }}
          onSubmit={submitPermission}
        />
      )}

      {showLeaveRequestModal && (
        <LeaveRequestModal
          staffList={staffList}
          onClose={() => setShowLeaveRequestModal(false)}
          onSuccess={() => {
            setShowLeaveRequestModal(false);
            fetchAttendanceIssues();
          }}
        />
      )}
    </main>
  );
};

const PermissionModal = ({ type, issue, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onSubmit(type, reason);
    setLoading(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>
            {type === 'approve' ? '✅ Approve Permission' : '❌ Reject Permission'}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '20px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <strong>Staff:</strong> {issue.staff_name}
          </div>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <strong>Department:</strong> {issue.department_name || 'N/A'}
          </div>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <strong>Date:</strong> Day {issue.ethiopian_day}, {getEthiopianMonthName(issue.ethiopian_month)} {issue.ethiopian_year}
          </div>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <strong>Issue:</strong>{' '}
            <span style={{
              padding: '4px 8px',
              background: type === 'approve' ? '#4CAF5020' : '#F4433620',
              color: type === 'approve' ? '#4CAF50' : '#F44336',
              borderRadius: '4px',
              fontWeight: 600
            }}>
              {issue.status}
            </span>
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            <strong>Deduction Amount:</strong> {issue.deduction_amount ? `${issue.deduction_amount} Birr` : 'N/A'}
          </div>
        </div>

        {type === 'approve' && (
          <div style={{ 
            padding: '16px', 
            background: '#e8f5e9', 
            borderRadius: '8px', 
            marginBottom: '20px',
            border: '1px solid #4CAF50'
          }}>
            <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 600, marginBottom: '8px' }}>
              ✅ Approving this permission will:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#2e7d32' }}>
              <li>Prevent salary deduction for this attendance issue</li>
              <li>Mark this as an excused absence/lateness</li>
              <li>Record your approval reason for future reference</li>
            </ul>
          </div>
        )}

        {type === 'reject' && (
          <div style={{ 
            padding: '16px', 
            background: '#ffebee', 
            borderRadius: '8px', 
            marginBottom: '20px',
            border: '1px solid #F44336'
          }}>
            <div style={{ fontSize: '14px', color: '#c62828', fontWeight: 600, marginBottom: '8px' }}>
              ❌ Rejecting this permission will:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#c62828' }}>
              <li>Apply the configured salary deduction ({issue.deduction_amount} Birr)</li>
              <li>Mark this as an unexcused absence/lateness</li>
              <li>Record your rejection reason for the staff member</li>
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Reason * {type === 'approve' ? '(Why are you approving?)' : '(Why are you rejecting?)'}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows="4"
              placeholder={
                type === 'approve' 
                  ? 'e.g., Medical emergency verified, Family emergency, Valid excuse provided...'
                  : 'e.g., No valid reason provided, Unexcused absence, Repeated offense...'
              }
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              This reason will be recorded and visible to the staff member
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: type === 'approve' ? '#4CAF50' : '#F44336',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Processing...' : (type === 'approve' ? '✅ Approve Permission' : '❌ Reject Permission')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const LeaveRequestModal = ({ staffList, onClose, onSuccess }) => {
  const [selectedStaff, setSelectedStaff] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [startMonth, setStartMonth] = useState(1);
  const [startDay, setStartDay] = useState(1);
  const [startYear, setStartYear] = useState(2018);
  const [leaveDuration, setLeaveDuration] = useState('days');
  const [numberOfDays, setNumberOfDays] = useState(1);
  const [numberOfMonths, setNumberOfMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  const getDaysInMonth = (month) => {
    return month === 13 ? 5 : 30;
  };

  const calculateTotalDays = () => {
    if (leaveDuration === 'days') {
      return numberOfDays;
    } else if (leaveDuration === 'months') {
      return numberOfMonths * 30; // Approximate
    } else if (leaveDuration === 'year') {
      return 365; // Full Ethiopian year
    }
    return 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedStaff) {
      setMessage({ type: 'error', text: 'Please select a staff member' });
      return;
    }

    if (!leaveReason || leaveReason.trim() === '') {
      setMessage({ type: 'error', text: 'Please provide a reason for leave' });
      return;
    }

    const totalDays = calculateTotalDays();
    
    if (totalDays > 365) {
      setMessage({ type: 'error', text: 'Leave duration cannot exceed 365 days (1 year)' });
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const staff = staffList.find(s => String(s.id) === String(selectedStaff));
      
      if (!staff) {
        setMessage({ type: 'error', text: 'Selected staff not found. Please try selecting again.' });
        setLoading(false);
        return;
      }

      const response = await axios.post(
        `${API_URL}/hr/leave/grant-leave`,
        {
          staffId: staff.id,
          staffName: staff.name,
          departmentName: staff.staffType,
          startMonth: parseInt(startMonth),
          startDay: parseInt(startDay),
          startYear: parseInt(startYear),
          numberOfDays: totalDays,
          reason: leaveReason
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        let durationText = '';
        if (leaveDuration === 'days') {
          durationText = `${numberOfDays} day(s)`;
        } else if (leaveDuration === 'months') {
          durationText = `${numberOfMonths} month(s) (${totalDays} days)`;
        } else if (leaveDuration === 'year') {
          durationText = `1 year (${totalDays} days)`;
        }
        
        setMessage({ type: 'success', text: `Leave granted successfully! ${durationText} marked as LEAVE for ${staff.name}` });
        onSuccess();
      }
    } catch (error) {
      console.error('Error granting leave:', error);
      setMessage({ type: 'error', text: 'Failed to grant leave: ' + (error.response?.data?.error || error.message) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className={styles.modalHeader}>
          <h2>🏖️ Grant Leave Permission</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {message.text && (
          <div style={{ padding: '0.75rem 1rem', margin: '0 1.5rem', borderRadius: '8px', background: message.type === 'success' ? '#f0fdf4' : '#fef2f2', color: message.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{message.type === 'success' ? '✅' : '❌'}</span>
            <span>{message.text}</span>
            <button onClick={() => setMessage({ type: '', text: '' })} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: message.type === 'success' ? '#16a34a' : '#dc2626' }}>×</button>
          </div>
        )}

        <div style={{ 
          padding: '16px', 
          background: '#e3f2fd', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #2196F3'
        }}>
          <div style={{ fontSize: '14px', color: '#1565c0', fontWeight: 600, marginBottom: '8px' }}>
            ℹ️ About Leave Permissions:
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#1565c0' }}>
            <li>Grant multi-day leave to staff members</li>
            <li>Selected days will automatically be marked as "LEAVE" in attendance</li>
            <li>No salary deduction will be applied for leave days</li>
            <li>Leave reason will be recorded for reference</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Staff Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Select Staff Member *
            </label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            >
              <option value="">-- Select Staff --</option>
              {staffList.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} ({staff.staffType})
                </option>
              ))}
            </select>
          </div>

          {/* Leave Reason */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Leave Reason *
            </label>
            <select
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            >
              <option value="">-- Select Reason --</option>
              <option value="Sick Leave">Sick Leave</option>
              <option value="Annual Leave">Annual Leave</option>
              <option value="Maternity Leave">Maternity Leave</option>
              <option value="Paternity Leave">Paternity Leave</option>
              <option value="Emergency Leave">Emergency Leave</option>
              <option value="Bereavement Leave">Bereavement Leave</option>
              <option value="Study Leave">Study Leave</option>
              <option value="Unpaid Leave">Unpaid Leave</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Start Date */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Leave Start Date *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <select
                value={startMonth}
                onChange={(e) => {
                  setStartMonth(parseInt(e.target.value));
                  // Reset day if it exceeds the new month's days
                  const maxDays = getDaysInMonth(parseInt(e.target.value));
                  if (startDay > maxDays) {
                    setStartDay(maxDays);
                  }
                }}
                required
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  fontSize: '14px'
                }}
              >
                {ethiopianMonths.map((month, index) => (
                  <option key={index + 1} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={startDay}
                onChange={(e) => setStartDay(parseInt(e.target.value))}
                required
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  fontSize: '14px'
                }}
              >
                {Array.from({ length: getDaysInMonth(startMonth) }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>Day {day}</option>
                ))}
              </select>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value))}
                min="2010"
                max="2030"
                required
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  fontSize: '14px'
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Selected: Day {startDay}, {ethiopianMonths[startMonth - 1]} {startYear}
            </div>
          </div>

          {/* Number of Days */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Leave Duration Type *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setLeaveDuration('days')}
                style={{
                  padding: '12px',
                  background: leaveDuration === 'days' ? '#2196F3' : 'white',
                  color: leaveDuration === 'days' ? 'white' : '#666',
                  border: `2px solid ${leaveDuration === 'days' ? '#2196F3' : '#e0e0e0'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                📅 Days
              </button>
              <button
                type="button"
                onClick={() => setLeaveDuration('months')}
                style={{
                  padding: '12px',
                  background: leaveDuration === 'months' ? '#2196F3' : 'white',
                  color: leaveDuration === 'months' ? 'white' : '#666',
                  border: `2px solid ${leaveDuration === 'months' ? '#2196F3' : '#e0e0e0'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                📆 Months
              </button>
              <button
                type="button"
                onClick={() => setLeaveDuration('year')}
                style={{
                  padding: '12px',
                  background: leaveDuration === 'year' ? '#2196F3' : 'white',
                  color: leaveDuration === 'year' ? 'white' : '#666',
                  border: `2px solid ${leaveDuration === 'year' ? '#2196F3' : '#e0e0e0'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                🗓️ Year
              </button>
            </div>

            {leaveDuration === 'days' && (
              <>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Number of Days *
                </label>
                <input
                  type="number"
                  value={numberOfDays}
                  onChange={(e) => setNumberOfDays(parseInt(e.target.value))}
                  min="1"
                  max="365"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '14px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Leave will be granted for {numberOfDays} consecutive day(s)
                </div>
              </>
            )}

            {leaveDuration === 'months' && (
              <>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Number of Months *
                </label>
                <input
                  type="number"
                  value={numberOfMonths}
                  onChange={(e) => setNumberOfMonths(parseInt(e.target.value))}
                  min="1"
                  max="12"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    fontSize: '14px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Leave will be granted for {numberOfMonths} month(s) (approximately {numberOfMonths * 30} days)
                </div>
              </>
            )}

            {leaveDuration === 'year' && (
              <div style={{ 
                padding: '16px', 
                background: '#e3f2fd', 
                borderRadius: '8px',
                border: '1px solid #2196F3'
              }}>
                <div style={{ fontSize: '14px', color: '#1565c0', fontWeight: 600, marginBottom: '8px' }}>
                  🗓️ Full Year Leave
                </div>
                <div style={{ fontSize: '13px', color: '#1565c0' }}>
                  Leave will be granted for 1 full Ethiopian year (365 days)
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          {selectedStaff && (
            <div style={{ 
              padding: '16px', 
              background: '#f5f5f5', 
              borderRadius: '8px', 
              marginBottom: '20px' 
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                📋 Leave Summary:
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                <strong>Staff:</strong> {staffList.find(s => s.id === selectedStaff)?.name}<br />
                <strong>Department:</strong> {staffList.find(s => s.id === selectedStaff)?.staffType}<br />
                <strong>Reason:</strong> {leaveReason || 'Not selected'}<br />
                <strong>Start Date:</strong> Day {startDay}, {ethiopianMonths[startMonth - 1]} {startYear}<br />
                <strong>Duration:</strong> {
                  leaveDuration === 'days' ? `${numberOfDays} day(s)` :
                  leaveDuration === 'months' ? `${numberOfMonths} month(s) (~${numberOfMonths * 30} days)` :
                  '1 year (365 days)'
                }<br />
                <strong>Total Days:</strong> {calculateTotalDays()} days<br />
                <strong>Status:</strong> Will be marked as LEAVE (no deduction)
              </div>
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Granting Leave...' : '🏖️ Grant Leave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeaveManagement;
