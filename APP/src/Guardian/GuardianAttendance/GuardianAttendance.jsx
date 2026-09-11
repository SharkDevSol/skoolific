import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCalendar, FiCheck, FiX, FiClock, FiUser } from 'react-icons/fi';
import axios from 'axios';
import styles from './GuardianAttendance.module.css';

const GuardianAttendance = () => {
  const [selectedWard, setSelectedWard] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [wards, setWards] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, late: 0, percentage: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedYear]);

  const fetchAttendance = async () => {
    try {
      const guardianInfo = JSON.parse(localStorage.getItem('guardianInfo') || '{}');
      const response = await axios.get(
        `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/guardian-attendance/guardian-attendance/${guardianInfo.guardian_username}`,
        {
          params: {
            year: selectedYear,
            month: selectedMonth
          }
        }
      );
      
      if (response.data.success) {
        setWards(response.data.data.wards);
        setAttendanceData(response.data.data.attendance);
        setStats(response.data.data.stats);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toUpperCase()) {
      case 'PRESENT':
        return <FiCheck className={styles.iconPresent} />;
      case 'ABSENT':
        return <FiX className={styles.iconAbsent} />;
      case 'LATE':
        return <FiClock className={styles.iconLate} />;
      default:
        return null;
    }
  };

  const getStatusClass = (status) => {
    const statusLower = status?.toLowerCase() || '';
    return styles[`status${statusLower.charAt(0).toUpperCase() + statusLower.slice(1)}`];
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading attendance...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <h1>Attendance</h1>
          <p>Track your wards' attendance records</p>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <select
            value={selectedWard}
            onChange={(e) => setSelectedWard(e.target.value)}
            className={styles.select}
          >
            <option value="all">All Wards</option>
            {wards.map((ward, index) => (
              <option key={index} value={ward.student_name}>{ward.student_name}</option>
            ))}
          </select>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className={styles.select}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Month {i + 1}
              </option>
            ))}
          </select>
        </div>

        {/* Stats Cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(40, 167, 69, 0.1)' }}>
              <FiCheck style={{ color: '#28a745' }} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValue}>{stats.present}</div>
              <div className={styles.statLabel}>Present</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
              <FiX style={{ color: '#ef4444' }} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValue}>{stats.absent}</div>
              <div className={styles.statLabel}>Absent</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(255, 193, 7, 0.1)' }}>
              <FiClock style={{ color: '#ffc107' }} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValue}>{stats.late}</div>
              <div className={styles.statLabel}>Late</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(0, 123, 255, 0.1)' }}>
              <FiCalendar style={{ color: '#007bff' }} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValue}>{stats.percentage}%</div>
              <div className={styles.statLabel}>Attendance Rate</div>
            </div>
          </div>
        </div>

        {/* Attendance List */}
        <div className={styles.attendanceList}>
          <h2>Recent Attendance</h2>
          {attendanceData.length === 0 ? (
            <div className={styles.empty}>
              <FiCalendar size={48} />
              <p>No attendance records found</p>
            </div>
          ) : (
            <div className={styles.records}>
              {attendanceData
                .filter(record => selectedWard === 'all' || record.ward === selectedWard)
                .map((record, index) => (
                  <motion.div
                    key={index}
                    className={styles.recordCard}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className={styles.recordDate}>
                      <FiCalendar />
                      <span>{record.date ? new Date(record.date).toLocaleDateString() : `${record.ethiopian_day}/${record.ethiopian_month}/${record.ethiopian_year}`}</span>
                    </div>
                    <div className={styles.recordWard}>
                      <FiUser />
                      <span>{record.ward}</span>
                    </div>
                    <div className={`${styles.recordStatus} ${getStatusClass(record.status)}`}>
                      {getStatusIcon(record.status)}
                      <span>{record.status}</span>
                    </div>
                  </motion.div>
                ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default GuardianAttendance;
