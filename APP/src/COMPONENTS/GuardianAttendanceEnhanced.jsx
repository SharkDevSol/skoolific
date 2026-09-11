import React from 'react';
import { FiCalendar, FiDownload, FiTrendingUp, FiBarChart2 } from 'react-icons/fi';
import { SkeletonLoader } from './mobile';
import styles from './GuardianProfile.module.css';

export const AttendanceViewSelector = ({ view, onViewChange }) => (
  <div className={styles.attendanceViewSelector}>
    <button
      className={`${styles.viewBtn} ${view === 'weekly' ? styles.viewBtnActive : ''}`}
      onClick={() => onViewChange('weekly')}
    >
      <FiCalendar /> Weekly
    </button>
    <button
      className={`${styles.viewBtn} ${view === 'monthly' ? styles.viewBtnActive : ''}`}
      onClick={() => onViewChange('monthly')}
    >
      <FiBarChart2 /> Monthly
    </button>
    <button
      className={`${styles.viewBtn} ${view === 'trends' ? styles.viewBtnActive : ''}`}
      onClick={() => onViewChange('trends')}
    >
      <FiTrendingUp /> Trends
    </button>
  </div>
);

export const MonthlySummaryView = ({ 
  summary, 
  loading, 
  selectedMonth, 
  selectedYear, 
  onMonthChange, 
  onYearChange,
  onDownload,
  dailyAttendance = [] // New prop for daily details
}) => {
  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];
  
  const years = [2016, 2017, 2018, 2019, 2020]; // Ethiopian years

  // Helper to format time in 12-hour format
  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Helper to get status badge
  const getStatusBadge = (status) => {
    const badges = {
      'PRESENT': { label: 'Present', color: '#10b981', icon: '✓' },
      'ABSENT': { label: 'Absent', color: '#ef4444', icon: '✗' },
      'LATE': { label: 'Late', color: '#f59e0b', icon: '⏰' },
      'LEAVE': { label: 'Leave', color: '#8b5cf6', icon: 'L' }
    };
    return badges[status] || { label: status, color: '#6b7280', icon: '?' };
  };

  return (
    <div className={styles.monthlySummaryView}>
      <div className={styles.monthYearSelector}>
        <div className={styles.selectWrapper}>
          <span className={styles.selectLabel}>Month</span>
          <select 
            value={selectedMonth} 
            onChange={(e) => onMonthChange(parseInt(e.target.value))}
            className={styles.monthSelect}
          >
            {ethiopianMonths.map((month, idx) => (
              <option key={idx} value={idx + 1}>{month}</option>
            ))}
          </select>
        </div>
        <div className={styles.selectWrapper}>
          <span className={styles.selectLabel}>Year</span>
          <select 
            value={selectedYear} 
            onChange={(e) => onYearChange(parseInt(e.target.value))}
            className={styles.yearSelect}
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        {onDownload && (
          <button 
            className={styles.downloadBtn}
            onClick={onDownload}
            title="Download Report"
          >
            <FiDownload />
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonLoader type="card" count={1} />
      ) : summary ? (
        <>
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                <FiCalendar />
              </div>
              <div className={styles.summaryCardContent}>
                <span className={styles.summaryCardValue}>{summary.summary.present}</span>
                <span className={styles.summaryCardLabel}>Present Days</span>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon} style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                <FiCalendar />
              </div>
              <div className={styles.summaryCardContent}>
                <span className={styles.summaryCardValue}>{summary.summary.absent}</span>
                <span className={styles.summaryCardLabel}>Absent Days</span>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon} style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                <FiCalendar />
              </div>
              <div className={styles.summaryCardContent}>
                <span className={styles.summaryCardValue}>{summary.summary.late}</span>
                <span className={styles.summaryCardLabel}>Late Days</span>
              </div>
            </div>
          </div>

          <div className={styles.attendancePercentageCard}>
            <div className={styles.percentageCircle}>
              <svg viewBox="0 0 100 100" className={styles.percentageSvg}>
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="8"
                  strokeDasharray={`${summary.percentage * 2.827} 282.7`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <div className={styles.percentageText}>
                <span className={styles.percentageValue}>{summary.percentage}%</span>
                <span className={styles.percentageLabel}>Attendance</span>
              </div>
            </div>
            <div className={styles.percentageDetails}>
              <p className={styles.percentageTitle}>Overall Attendance Rate</p>
              <p className={styles.percentageSubtitle}>
                {summary.summary.present} out of {summary.summary.total} days
              </p>
            </div>
          </div>

          {/* Daily Attendance Details */}
          {dailyAttendance && dailyAttendance.length > 0 && (
            <div className={styles.dailyAttendanceSection}>
              <h3 className={styles.dailyAttendanceTitle}>
                <FiCalendar /> Daily Attendance Details
              </h3>
              <div className={styles.dailyAttendanceList}>
                {dailyAttendance.map((record, index) => {
                  const badge = getStatusBadge(record.status);
                  return (
                    <div key={index} className={styles.dailyAttendanceCard}>
                      <div className={styles.dailyAttendanceDate}>
                        <span className={styles.dailyAttendanceDay}>
                          {ethiopianMonths[record.ethiopian_month - 1]} {record.ethiopian_day}
                        </span>
                        <span className={styles.dailyAttendanceDayOfWeek}>
                          {record.day_of_week}
                        </span>
                      </div>
                      <div className={styles.dailyAttendanceStatus}>
                        <span 
                          className={styles.dailyAttendanceBadge}
                          style={{ backgroundColor: badge.color }}
                        >
                          {badge.icon} {badge.label}
                        </span>
                        {record.check_in_time && (
                          <span className={styles.dailyAttendanceTime}>
                            {formatTime(record.check_in_time)}
                          </span>
                        )}
                      </div>
                      {record.notes && (
                        <div className={styles.dailyAttendanceNotes}>
                          📝 {record.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <FiCalendar className={styles.emptyIcon} />
          <p>No attendance data for this month</p>
        </div>
      )}
    </div>
  );
};

export const TrendsView = ({ trends, loading }) => {
  if (loading) {
    return <SkeletonLoader type="card" count={2} />;
  }

  if (!trends || trends.length === 0) {
    return (
      <div className={styles.emptyState}>
        <FiTrendingUp className={styles.emptyIcon} />
        <p>No attendance trends available</p>
      </div>
    );
  }

  return (
    <div className={styles.trendsView}>
      <div className={styles.trendsChart}>
        {trends.map((trend, index) => {
          const maxHeight = 200;
          const presentHeight = (trend.present / trend.total) * maxHeight;
          const absentHeight = (trend.absent / trend.total) * maxHeight;
          const lateHeight = (trend.late / trend.total) * maxHeight;

          return (
            <div key={index} className={styles.trendBar}>
              <div className={styles.trendBarStack}>
                <div 
                  className={styles.trendBarSegment}
                  style={{ 
                    height: `${presentHeight}px`,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  }}
                  title={`Present: ${trend.present}`}
                />
                <div 
                  className={styles.trendBarSegment}
                  style={{ 
                    height: `${lateHeight}px`,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  }}
                  title={`Late: ${trend.late}`}
                />
                <div 
                  className={styles.trendBarSegment}
                  style={{ 
                    height: `${absentHeight}px`,
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  }}
                  title={`Absent: ${trend.absent}`}
                />
              </div>
              <span className={styles.trendBarLabel}>
                {new Date(trend.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className={styles.trendBarPercentage}>{trend.percentage}%</span>
            </div>
          );
        })}
      </div>

      <div className={styles.trendsLegend}>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#10b981' }} />
          <span>Present</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#f59e0b' }} />
          <span>Late</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#ef4444' }} />
          <span>Absent</span>
        </div>
      </div>
    </div>
  );
};
