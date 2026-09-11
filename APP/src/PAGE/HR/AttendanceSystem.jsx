import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { FiCalendar, FiUsers, FiClock, FiTrendingUp, FiX, FiTrash2 } from 'react-icons/fi';
import styles from './AttendanceSystem.module.css';
import Button from '../../COMPONENTS/Button/Button';
import Card from '../../COMPONENTS/Card/Card';
import { getCurrentEthiopianMonth, getEthiopianMonthName, ethiopianToGregorian } from '../../utils/ethiopianCalendar';

const API_URL = import.meta.env.VITE_API_URL || '';

const ethiopianMonths = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

const TeacherAttendance = () => {
  const { t } = useTranslation();
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentEthMonth = getCurrentEthiopianMonth();
  const [selectedEthMonth, setSelectedEthMonth] = useState(currentEthMonth.month); // 1-13
  const [selectedEthYear, setSelectedEthYear] = useState(currentEthMonth.year);
  const [activeTab, setActiveTab] = useState('shift1'); // Shift tab state
  const [showModal, setShowModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [weekendDays, setWeekendDays] = useState([0, 6]); // Default: Sunday and Saturday
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Convert 24-hour time to 12-hour format with AM/PM
  const formatTime12Hour = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12; // Convert 0 to 12
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Get shift badge styling
  const getShiftBadge = (shiftAssignment) => {
    const badges = {
      'shift1': { icon: '🌅', label: 'Shift 1', color: '#FFB74D', bg: '#FFF3E0' },
      'shift2': { icon: '🌆', label: 'Shift 2', color: '#7E57C2', bg: '#EDE7F6' },
      'both': { icon: '🔄', label: 'Both', color: '#42A5F5', bg: '#E3F2FD' }
    };
    return badges[shiftAssignment] || badges['shift1'];
  };

  useEffect(() => {
    fetchAttendance();
    fetchStaff();
    fetchWeekendSettings();
  }, [selectedEthMonth, selectedEthYear]);

  const fetchAttendance = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      console.log('📡 Fetching attendance for:', { 
        ethMonth: selectedEthMonth, 
        ethYear: selectedEthYear 
      });
      
      const response = await axios.get(
        `${API_URL}/hr/attendance/ethiopian-month?ethMonth=${selectedEthMonth}&ethYear=${selectedEthYear}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        console.log('✅ Fetched attendance records:', response.data.data.length, 'records');
        if (response.data.data.length > 0) {
          console.log('📄 All records:', response.data.data);
        }
        setAttendanceRecords(response.data.data);
      }
    } catch (error) {
      console.error('❌ Error fetching attendance:', error);
      console.error('Error details:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const types = ['Teachers'];
      let allStaff = [];
      
      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(
            `${API_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`
          );
          
          for (const className of classesResponse.data) {
            try {
              const dataResponse = await axios.get(
                `${API_URL}/staff/data/${staffType}/${className}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );
              
      const staffWithMeta = dataResponse.data.data.map(staff => {
                // Get Machine ID directly from database (no more hardcoded mapping!)
                const machineId = staff.machine_id || null;
                const shiftAssignment = staff.shift_assignment || 'shift1';
                
                return {
                  id: staff.global_staff_id || staff.staff_id || staff.id,
                  name: staff.full_name || staff.name || 'Unknown',
                  firstName: (staff.full_name || staff.name || '').split(' ')[0],
                  lastName: (staff.full_name || staff.name || '').split(' ').slice(1).join(' '),
                  department: staffType,
                  staffType,
                  className,
                  email: staff.email,
                  phone: staff.phone,
                  role: staff.role,
                  machineId: machineId, // Machine ID from database
                  shiftAssignment: shiftAssignment // Shift assignment from database
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
      
      setStaff(allStaff);
      console.log('👥 Loaded staff:', allStaff.length, 'members');
      if (allStaff.length > 0) {
        console.log('📄 All staff IDs:', allStaff.map(s => ({ 
          id: s.id, 
          name: s.name,
          machineId: s.machineId
        })));
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const fetchWeekendSettings = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/hr/attendance/time-settings`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success && response.data.data) {
        const settings = response.data.data;
        if (settings.weekend_days && Array.isArray(settings.weekend_days)) {
          setWeekendDays(settings.weekend_days);
        }
      }
    } catch (error) {
      console.error('Error fetching weekend settings:', error);
    }
  };

  const markAttendance = async (staffId, staffName, ethDay, checkIn, checkOut) => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/hr/attendance/ethiopian`,
        {
          staffId,
          staffName,
          ethMonth: selectedEthMonth,
          ethYear: selectedEthYear,
          ethDay,
          checkIn,
          checkOut
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        fetchAttendance();
      }
    } catch (error) {
      console.error('Error marking attendance:', error);
      alert('Failed to mark attendance');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'PRESENT': '#4CAF50',
      'ABSENT': '#F44336',
      'LATE': '#FF9800',
      'HALF_DAY': '#2196F3',
      'LEAVE': '#9C27B0',
      'LATE + HALF_DAY': '#FF5722',
      'PRESENT + without check out': '#FFC107',
      'LATE + without check out': '#FF6F00',
      'HALF_DAY + without check out': '#0288D1',
      'LATE + HALF_DAY + without check out': '#D32F2F'
    };
    return colors[status] || '#9E9E9E';
  };

  const getStatusBadge = (status) => {
    const badges = {
      'PRESENT': 'P',
      'ABSENT': 'A',
      'LATE': 'L',
      'HALF_DAY': 'H',
      'LEAVE': 'V',
      'LATE + HALF_DAY': 'L+H',
      'PRESENT + without check out': 'P+NCO',
      'LATE + without check out': 'L+NCO',
      'HALF_DAY + without check out': 'H+NCO',
      'LATE + HALF_DAY + without check out': 'L+H+NCO'
    };
    return badges[status] || '-';
  };

  // Get days in Ethiopian month (30 days for months 1-12, 5-6 for Pagume)
  const getDaysInEthiopianMonth = () => {
    if (selectedEthMonth === 13) {
      // Pagume has 5 or 6 days depending on leap year
      return Array.from({ length: 5 }, (_, i) => i + 1);
    }
    return Array.from({ length: 30 }, (_, i) => i + 1);
  };

  // Check if an Ethiopian date is a weekend
  const isWeekend = (ethDay) => {
    const gregDate = ethiopianToGregorian(selectedEthYear, selectedEthMonth, ethDay);
    return weekendDays.includes(gregDate.getDay());
  };

  // Get filtered days (excluding weekends)
  const getFilteredDays = () => {
    return getDaysInEthiopianMonth().filter(day => !isWeekend(day));
  };

  // Get day name (short format: Mon, Tue, etc.)
  const getDayName = (ethDay) => {
    const gregDate = ethiopianToGregorian(selectedEthYear, selectedEthMonth, ethDay);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[gregDate.getDay()];
  };

  // Filter staff by shift
  const getFilteredStaff = (shiftType) => {
    if (shiftType === 'all') return staff;
    return staff.filter(s => s.shiftAssignment === shiftType || s.shiftAssignment === 'both');
  };

  // Get attendance for specific staff and Ethiopian day (with optional shift type)
  const getAttendanceForDay = (staffId, ethDay, shiftType = null) => {
    // Get the staff member's machine_id or global_staff_id
    const staffMember = staff.find(s => String(s.id) === String(staffId));
    const machineId = staffMember?.machineId;
    const globalStaffId = staffMember?.id;
    const staffName = staffMember?.name;
    
    // Match by machine_id if available, otherwise by global_staff_id or staff name
    const record = attendanceRecords.find(r => {
      const recordStaffId = String(r.staff_id);
      const recordStaffName = String(r.staff_name || '').toLowerCase();
      const recordDay = parseInt(r.ethiopian_day);
      const recordMonth = parseInt(r.ethiopian_month);
      const recordYear = parseInt(r.ethiopian_year);
      const recordShiftType = r.shift_type;
      
      const dayMatch = recordDay === parseInt(ethDay);
      const monthMatch = recordMonth === parseInt(selectedEthMonth);
      const yearMatch = recordYear === parseInt(selectedEthYear);
      
      // Match by machine_id (if staff has one) OR by global_staff_id OR by staff name (for N/A staff)
      const idMatch = machineId 
        ? recordStaffId === String(machineId)
        : (recordStaffId === String(globalStaffId) || recordStaffName === String(staffName || '').toLowerCase());
      
      // If shiftType is specified, also match by shift_type
      const shiftMatch = shiftType ? recordShiftType === shiftType : true;
      
      return idMatch && dayMatch && monthMatch && yearMatch && shiftMatch;
    });
    
    return record;
  };

  // Calculate monthly statistics
  const getMonthlyStats = (shiftType = 'all') => {
    const filteredRecords = shiftType === 'all' 
      ? attendanceRecords 
      : attendanceRecords.filter(r => r.shift_type === shiftType);

    const stats = {
      totalPresent: 0,
      totalAbsent: 0,
      totalLate: 0,
      totalLeave: 0,
      totalHalfDay: 0,
      totalLateHalfDay: 0,
      totalWithoutCheckout: 0
    };

    filteredRecords.forEach(record => {
      const status = record.status;
      
      // Each record is counted ONCE in its primary category
      if (status === 'PRESENT') {
        stats.totalPresent++;
      } else if (status === 'PRESENT + without check out') {
        stats.totalPresent++;
        stats.totalWithoutCheckout++;
      } else if (status === 'ABSENT') {
        stats.totalAbsent++;
      } else if (status === 'LEAVE') {
        stats.totalLeave++;
      } else if (status === 'LATE') {
        stats.totalLate++;
      } else if (status === 'LATE + without check out') {
        stats.totalLate++;
        stats.totalWithoutCheckout++;
      } else if (status === 'HALF_DAY') {
        stats.totalHalfDay++;
      } else if (status === 'HALF_DAY + without check out') {
        stats.totalHalfDay++;
        stats.totalWithoutCheckout++;
      } else if (status === 'LATE + HALF_DAY') {
        stats.totalLateHalfDay++;
      } else if (status === 'LATE + HALF_DAY + without check out') {
        stats.totalLateHalfDay++;
        stats.totalWithoutCheckout++;
      }
    });

    return stats;
  };

  const stats = getMonthlyStats(activeTab === 'all' ? 'all' : activeTab);
  const days = getFilteredDays();
  const filteredStaff = getFilteredStaff(activeTab === 'all' ? 'all' : activeTab);
  const selectedMonthName = getEthiopianMonthName(selectedEthMonth);

  const handleCellClick = (staffMember, day, attendance, shiftType) => {
    setSelectedCell({
      staff: staffMember,
      day,
      attendance,
      shiftType // Add shift type to the cell object
    });
    setShowTimeModal(true);
  };

  return (
    <div className={styles.container}>
      {/* Modern Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            <FiUsers className={styles.headerIcon} />
            <div>
              <h1>Teacher Attendance</h1>
              <p>Track and manage staff attendance with Ethiopian calendar</p>
            </div>
          </div>
          <div className={styles.headerControls}>
            {/* Live Clock */}
            <div className={styles.clockContainer}>
              <FiClock className={styles.clockIcon} />
              <div className={styles.clockContent}>
                <div className={styles.clockTime}>
                  {currentTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: true 
                  })}
                </div>
                <div className={styles.clockDate}>
                  {currentTime.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
              </div>
            </div>
            <select
              value={selectedEthMonth}
              onChange={(e) => setSelectedEthMonth(parseInt(e.target.value))}
              className={styles.select}
            >
              {ethiopianMonths.map((month, index) => (
                <option key={index + 1} value={index + 1}>{month}</option>
              ))}
            </select>
            <input
              type="number"
              value={selectedEthYear}
              onChange={(e) => setSelectedEthYear(parseInt(e.target.value))}
              min="2010"
              max="2030"
              className={styles.yearInput}
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} style={{ borderLeft: '4px solid #10b981' }}>
          <div className={styles.statIcon} style={{ background: '#d1fae5' }}>
            <FiTrendingUp style={{ color: '#10b981' }} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Present</div>
            <div className={styles.statValue}>{stats.totalPresent}</div>
          </div>
        </div>
        <div className={styles.statCard} style={{ borderLeft: '4px solid #ef4444' }}>
          <div className={styles.statIcon} style={{ background: '#fee2e2' }}>
            <FiX style={{ color: '#ef4444' }} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Absent</div>
            <div className={styles.statValue}>{stats.totalAbsent}</div>
          </div>
        </div>
        <div className={styles.statCard} style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className={styles.statIcon} style={{ background: '#fef3c7' }}>
            <FiClock style={{ color: '#f59e0b' }} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Late</div>
            <div className={styles.statValue}>{stats.totalLate}</div>
          </div>
        </div>
        <div className={styles.statCard} style={{ borderLeft: '4px solid #3b82f6' }}>
          <div className={styles.statIcon} style={{ background: '#dbeafe' }}>
            <FiCalendar style={{ color: '#3b82f6' }} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Half Day</div>
            <div className={styles.statValue}>{stats.totalHalfDay}</div>
          </div>
        </div>
      </div>

      {/* Shift Tabs */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span className={styles.tabIcon}>📊</span>
            All Staff
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'shift1' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('shift1')}
          >
            <span className={styles.tabIcon}>🌅</span>
            Shift 1 (Morning)
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'shift2' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('shift2')}
          >
            <span className={styles.tabIcon}>🌆</span>
            Shift 2 (Afternoon)
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendBadge} style={{ background: '#10b981' }}>P</span>
          <span>Present</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBadge} style={{ background: '#ef4444' }}>A</span>
          <span>Absent</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBadge} style={{ background: '#f59e0b' }}>L</span>
          <span>Late</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBadge} style={{ background: '#3b82f6' }}>H</span>
          <span>Half Day</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBadge} style={{ background: '#8b5cf6' }}>V</span>
          <span>Leave</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBadge} style={{ background: '#fbbf24' }}>*</span>
          <span>No Check-Out</span>
        </div>
      </div>

      {/* Attendance Table */}
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading attendance data...</p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.stickyCol}>Staff Name</th>
                <th className={styles.stickyCol2}>Machine ID</th>
                <th className={styles.stickyCol3}>Department</th>
                {days.map(day => (
                  <th key={day} className={styles.dayHeader}>
                    <div className={styles.dayNumber}>{day}</div>
                    <div className={styles.dayName}>{getDayName(day)}</div>
                  </th>
                ))}
                <th className={styles.totalHeader}>Total P</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 4} className={styles.noData}>
                    No staff found for this shift
                  </td>
                </tr>
              ) : (
                filteredStaff.flatMap(staffMember => {
                  // For staff with "both" shifts, create 2 rows (one for each shift)
                  const shifts = activeTab === 'all' && staffMember.shiftAssignment === 'both'
                    ? ['shift1', 'shift2']
                    : [activeTab === 'all' ? staffMember.shiftAssignment : activeTab];

                  return shifts.map((shiftType, shiftIndex) => {
                    const presentCount = days.filter(day => {
                      const attendance = getAttendanceForDay(staffMember.id, day, shiftType);
                      return attendance?.status === 'PRESENT';
                    }).length;

                    const showName = shiftIndex === 0;

                    return (
                      <tr key={`${staffMember.id}-${shiftType}`}>
                        <td className={styles.stickyCol}>
                          {showName ? (
                            <div className={styles.staffName}>
                              <span>{staffMember.name}</span>
                              {staffMember.shiftAssignment === 'both' && (
                                <span className={styles.bothBadge}>Both Shifts</span>
                              )}
                            </div>
                          ) : (
                            <div className={styles.shiftLabel}>
                              {shiftType === 'shift1' ? '🌅 S1' : '🌆 S2'}
                            </div>
                          )}
                        </td>
                        <td className={styles.stickyCol2}>
                          {showName && (
                            <span className={`${styles.machineId} ${staffMember.machineId ? styles.machineIdActive : ''}`}>
                              {staffMember.machineId || 'N/A'}
                            </span>
                          )}
                        </td>
                        <td className={styles.stickyCol3}>
                          {showName ? staffMember.department : ''}
                        </td>
                        {days.map(day => {
                          const attendance = getAttendanceForDay(staffMember.id, day, shiftType);
                          
                          return (
                            <td key={day} className={styles.dayCell}>
                              <div
                                className={styles.attendanceCell}
                                style={{
                                  background: attendance ? `${getStatusColor(attendance.status)}15` : '#f9fafb',
                                  borderColor: attendance ? getStatusColor(attendance.status) : '#e5e7eb'
                                }}
                                onClick={() => handleCellClick(staffMember, day, attendance, shiftType)}
                              >
                                {attendance ? (
                                  <>
                                    <div 
                                      className={styles.statusBadge}
                                      style={{ color: getStatusColor(attendance.status) }}
                                    >
                                      {getStatusBadge(attendance.status)}
                                    </div>
                                    {attendance.check_in && (
                                      <div className={styles.timeText}>
                                        {formatTime12Hour(attendance.check_in)}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className={styles.emptyCell}>-</div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className={styles.totalCell}>{presentCount}</td>
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <BulkAttendanceModal 
          staff={staff}
          ethMonth={selectedEthMonth}
          ethYear={selectedEthYear}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchAttendance(); }}
        />
      )}

      {showTimeModal && selectedCell && (
        <TimeModal
          cell={selectedCell}
          ethMonth={selectedEthMonth}
          ethYear={selectedEthYear}
          onClose={() => { setShowTimeModal(false); setSelectedCell(null); }}
          onSuccess={() => { setShowTimeModal(false); setSelectedCell(null); fetchAttendance(); }}
        />
      )}
    </div>
  );
};

const TimeModal = ({ cell, ethMonth, ethYear, onClose, onSuccess }) => {
  const attendance = cell.attendance;
  const hasCheckedIn = attendance && attendance.check_in;
  const hasCheckedOut = attendance && attendance.check_out;
  const isLeave = attendance && attendance.status === 'LEAVE';
  
  const [checkIn, setCheckIn] = useState(attendance?.check_in || '08:00');
  const [checkOut, setCheckOut] = useState(attendance?.check_out || '17:00');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(hasCheckedIn && !hasCheckedOut ? 'checkout' : 'checkin');

  // If this is a LEAVE day, show info and prevent editing
  if (isLeave) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
          <div className={styles.modalHeader}>
            <h2>🏖️ Leave Day</h2>
            <button className={styles.closeButton} onClick={onClose}>×</button>
          </div>
          
          <div style={{ 
            padding: '20px', 
            background: '#f3e5f5', 
            borderRadius: '8px', 
            marginBottom: '20px',
            border: '2px solid #9C27B0'
          }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
              <strong>Staff:</strong> {cell.staff.name}
            </div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
              <strong>Department:</strong> {cell.staff.department}
            </div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
              <strong>Date:</strong> Day {cell.day}, {getEthiopianMonthName(ethMonth)} {ethYear}
            </div>
            
            <div style={{ 
              padding: '16px', 
              background: '#9C27B0', 
              color: 'white', 
              borderRadius: '8px',
              marginTop: '12px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                🏖️ ON LEAVE
              </div>
              <div style={{ fontSize: '13px' }}>
                {attendance.notes || 'This staff member is on approved leave'}
              </div>
            </div>
          </div>

          <div style={{ 
            padding: '16px', 
            background: '#fff3e0', 
            borderRadius: '8px', 
            marginBottom: '20px',
            border: '1px solid #FF9800'
          }}>
            <div style={{ fontSize: '14px', color: '#e65100', fontWeight: 600, marginBottom: '8px' }}>
              ℹ️ About Leave Days:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#e65100' }}>
              <li>Leave days cannot be edited from attendance</li>
              <li>No check-in/check-out required for leave</li>
              <li>No salary deduction will be applied</li>
              <li>Manage leave from Leave Management page</li>
            </ul>
          </div>

          <div className={styles.modalActions}>
            <button 
              type="button" 
              onClick={onClose}
              style={{
                padding: '12px 24px',
                background: '#9C27B0',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleCheckIn = async (e) => {
    e.preventDefault();
    
    setLoading(true);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // Use machine ID if available, otherwise use staff name as ID
      const staffId = cell.staff.machineId || cell.staff.name;
      
      console.log('Marking check-in for:', {
        staffId: staffId,
        name: cell.staff.name,
        day: cell.day,
        shiftType: cell.shiftType,
        hasMachineId: !!cell.staff.machineId
      });
      
      const response = await axios.post(
        `${API_URL}/hr/attendance/ethiopian`,
        {
          staffId: staffId, // Use machine ID or name
          staffName: cell.staff.name,
          ethMonth: parseInt(ethMonth),
          ethYear: parseInt(ethYear),
          ethDay: parseInt(cell.day),
          checkIn,
          checkOut: null, // Only check-in, no check-out yet
          shiftType: cell.shiftType // Add shift type for proper validation
        },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (response.data.success) {
        alert('✅ Check-in recorded successfully!');
        onSuccess();
      }
    } catch (error) {
      console.error('❌ Error recording check-in:', error);
      alert(`❌ Failed to record check-in: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // IMPORTANT: For check-out, we need to use the SAME staffId that was used for check-in
      // This should match what's stored in the database
      const staffId = attendance.staff_id; // Use the staff_id from the existing attendance record
      
      console.log('🔴 Recording check-out for:', {
        staffId: staffId,
        staffName: cell.staff.name,
        day: cell.day,
        ethMonth: parseInt(ethMonth),
        ethYear: parseInt(ethYear),
        shiftType: cell.shiftType,
        existingCheckIn: attendance.check_in,
        newCheckOut: checkOut,
        fullAttendanceRecord: attendance
      });
      
      const response = await axios.post(
        `${API_URL}/hr/attendance/ethiopian`,
        {
          staffId: staffId, // Use the staff_id from existing record
          staffName: cell.staff.name,
          ethMonth: parseInt(ethMonth),
          ethYear: parseInt(ethYear),
          ethDay: parseInt(cell.day),
          checkIn: attendance.check_in, // Keep existing check-in
          checkOut, // Add check-out
          shiftType: cell.shiftType // Add shift type for proper validation
        },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      console.log('✅ Check-out response:', response.data);

      if (response.data.success) {
        alert('✅ Check-out recorded successfully!');
        onSuccess();
      }
    } catch (error) {
      console.error('❌ Error recording check-out:', error);
      console.error('❌ Error details:', error.response?.data);
      alert(`❌ Failed to record check-out: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!cell.attendance) return;
    
    if (!confirm('Are you sure you want to delete this attendance record?')) return;

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.delete(
        `${API_URL}/hr/attendance/ethiopian/${cell.attendance.id}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('✅ Attendance deleted successfully!');
        onSuccess();
      }
    } catch (error) {
      console.error('❌ Error deleting attendance:', error);
      alert('❌ Failed to delete attendance');
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className={styles.modalHeader}>
          <h2>
            {!hasCheckedIn && '🔵 Check-In'}
            {hasCheckedIn && !hasCheckedOut && '🔴 Check-Out'}
            {hasCheckedIn && hasCheckedOut && '✏️ Edit Attendance'}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <div style={{ padding: '20px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <strong>Staff:</strong> {cell.staff.name}
          </div>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <strong>Department:</strong> {cell.staff.department}
          </div>
          {cell.shiftType && (
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
              <strong>Shift:</strong> {cell.shiftType === 'shift1' ? '🌅 Shift 1 (Morning)' : '🌆 Shift 2 (Afternoon)'}
            </div>
          )}
          <div style={{ fontSize: '14px', color: '#666' }}>
            <strong>Date:</strong> Day {cell.day}, {getEthiopianMonthName(ethMonth)} {ethYear}
          </div>
          
          {hasCheckedIn && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#e8f5e9', borderRadius: '6px' }}>
              <div style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 600 }}>
                ✅ Checked In: {attendance.check_in}
              </div>
            </div>
          )}
          
          {hasCheckedOut && (
            <div style={{ marginTop: '8px', padding: '12px', background: '#ffebee', borderRadius: '6px' }}>
              <div style={{ fontSize: '13px', color: '#c62828', fontWeight: 600 }}>
                ✅ Checked Out: {attendance.check_out}
              </div>
            </div>
          )}
        </div>

        {/* Check-In Form */}
        {(!hasCheckedIn || (hasCheckedIn && hasCheckedOut)) && (
          <form onSubmit={handleCheckIn} className={styles.form}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                Check-In Time *
              </label>
              <input
                type="time"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  fontSize: '16px'
                }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                When did the staff member arrive?
              </div>
            </div>

            <div className={styles.modalActions}>
              {cell.attendance && (
                <button 
                  type="button" 
                  onClick={handleDelete}
                  style={{
                    padding: '10px 20px',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  🗑️ Delete
                </button>
              )}
              <button type="button" onClick={onClose} className={styles.cancelButton}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={styles.submitButton}>
                {loading ? 'Recording...' : (hasCheckedIn ? '🔵 Update Check-In' : '🔵 Check-In')}
              </button>
            </div>
          </form>
        )}

        {/* Check-Out Form */}
        {hasCheckedIn && !hasCheckedOut && (
          <form onSubmit={handleCheckOut} className={styles.form}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                Check-Out Time *
              </label>
              <input
                type="time"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  fontSize: '16px'
                }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                When did the staff member leave?
              </div>
            </div>

            <div className={styles.modalActions}>
              <button 
                type="button" 
                onClick={handleDelete}
                style={{
                  padding: '10px 20px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                🗑️ Delete
              </button>
              <button type="button" onClick={onClose} className={styles.cancelButton}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={styles.submitButton}>
                {loading ? 'Recording...' : '🔴 Check-Out'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const BulkAttendanceModal = ({ staff, ethMonth, ethYear, onClose, onSuccess }) => {
  const [selectedDay, setSelectedDay] = useState('');
  const [checkIn, setCheckIn] = useState('08:00');
  const [checkOut, setCheckOut] = useState('17:00');
  const [loading, setLoading] = useState(false);

  // Get days in the Ethiopian month
  const getDaysInEthiopianMonth = () => {
    if (ethMonth === 13) {
      return Array.from({ length: 5 }, (_, i) => i + 1);
    }
    return Array.from({ length: 30 }, (_, i) => i + 1);
  };

  const days = getDaysInEthiopianMonth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedDay) {
      alert('Please select a day');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      // Build records array from all staff
      const records = staff.map(staffMember => ({
        staffId: staffMember.id,
        staffName: staffMember.name,
        ethMonth: parseInt(ethMonth),
        ethYear: parseInt(ethYear),
        ethDay: parseInt(selectedDay),
        checkIn,
        checkOut
      }));

      console.log('Sending bulk attendance:', { records });

      const response = await axios.post(
        `${API_URL}/hr/attendance/ethiopian/bulk`,
        { records },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (response.data.success) {
        console.log('✅ Bulk attendance marked:', response.data.count, 'records');
        console.log('📄 Sample saved record:', response.data.data[0]);
        alert(`✅ Attendance marked successfully for ${response.data.count} staff members!`);
        onSuccess(); // This will close modal and refresh
      } else {
        alert('❌ Failed to mark attendance');
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ Error marking attendance:', error);
      alert(`❌ Failed to mark attendance: ${error.response?.data?.error || error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>📊 Bulk Mark Attendance - {getEthiopianMonthName(ethMonth)} {ethYear}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Select Day *
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: '10px', 
                borderRadius: '8px', 
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            >
              <option value="">Choose a day...</option>
              {days.map(day => (
                <option key={day} value={day}>
                  Day {day}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Check-In Time *
            </label>
            <input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '16px'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Standard check-in time for all staff
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Check-Out Time *
            </label>
            <input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '16px'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Standard check-out time for all staff
            </div>
          </div>

          <div style={{ 
            background: '#e3f2fd', 
            padding: '15px', 
            borderRadius: '8px', 
            marginBottom: '20px',
            border: '1px solid #2196F3'
          }}>
            <div style={{ fontSize: '14px', color: '#1976d2', marginBottom: '8px', fontWeight: 600 }}>
              📋 Bulk Marking Summary
            </div>
            <div style={{ fontSize: '13px', color: '#555' }}>
              This will mark attendance for <strong>{staff.length} staff members</strong> on the selected day with the specified check-in and check-out times.
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? 'Marking...' : `Mark Attendance for ${staff.length} Staff`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TeacherAttendance;
