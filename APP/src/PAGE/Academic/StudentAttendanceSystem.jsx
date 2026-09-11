import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Printer,
  BarChart3,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import styles from './StudentAttendanceSystem.module.css';

import Button from '../../COMPONENTS/Button/Button';
import Select from '../../COMPONENTS/Select/Select';
import Input from '../../COMPONENTS/Input/Input';
import Card from '../../COMPONENTS/Card/Card';
import Modal from '../../COMPONENTS/Modal/Modal';
import StatCard from '../../COMPONENTS/StatCard/StatCard';
import Textarea from '../../COMPONENTS/Textarea/Textarea';
import { useToast } from '../../COMPONENTS/Toast/useToast';
import ToastContainer from '../../COMPONENTS/Toast/ToastContainer';

// API base URL
const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') return window.location.origin + '/api';
  return 'http://localhost:5052/api';
};
const API_BASE_URL = getApiBaseUrl();

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];

const StudentAttendanceSystem = ({ preSelectedClass = null }) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [selectedClass, setSelectedClass] = useState(preSelectedClass || '');
  const [selectedYear, setSelectedYear] = useState(2018);
  const [selectedWeekId, setSelectedWeekId] = useState('');
  const [filterStudentType, setFilterStudentType] = useState('all'); // New state for student type filter
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, leave: 0, late: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentEthiopianDate, setCurrentEthiopianDate] = useState(null);
  const [settings, setSettings] = useState(null);
  const [schoolWeeks, setSchoolWeeks] = useState([]);
  const [editModal, setEditModal] = useState({
    show: false,
    student: null,
    dayInfo: null,
    currentStatus: null
  });
  const [editForm, setEditForm] = useState({
    status: 'PRESENT',
    checkInTime: '08:00',
    notes: ''
  });
  const [showCurrentWeekModal, setShowCurrentWeekModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Report feature states
  const [showReport, setShowReport] = useState(false);
  const [reportClass, setReportClass] = useState('');
  const [reportDate, setReportDate] = useState({ year: 2018, month: 1, day: 1 });
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSummary, setReportSummary] = useState({ present: 0, absent: 0, leave: 0, late: 0, total: 0 });

  const ethiopianMonths = useMemo(
    () => [
      'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
      'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ],
    []
  );

  const studentTypeOptions = useMemo(
    () => [
      { value: 'all', label: t('students.attendance.allTypes', 'All Student Types') },
      { value: 'regular', label: t('students.attendance.regular', 'Regular Students') },
      { value: 'kg', label: t('students.attendance.kg', 'KG Students') },
      { value: 'evening', label: t('students.attendance.evening', 'Evening Class Students') },
      { value: 'kg_evening', label: t('students.attendance.kgEvening', 'KG + Evening Students') }
    ],
    [t]
  );

  const classSelectOptions = useMemo(
    () => classes.map((cls) => ({ value: cls, label: cls })),
    [classes]
  );

  const weekSelectOptions = useMemo(
    () =>
      schoolWeeks.map((week) => ({
        value: week.id,
        label: `${week.label}${week.isCurrent ? ` ${t('students.attendance.currentWeekLabel', '(Current)')}` : ''}`
      })),
    [schoolWeeks, t]
  );

  const reportClassOptions = useMemo(
    () => [
      { value: '', label: t('students.attendance.selectClass', 'Select Class') },
      ...classes.map((cls) => ({ value: cls, label: cls }))
    ],
    [classes, t]
  );

  const monthSelectOptions = useMemo(
    () => ethiopianMonths.map((month, index) => ({ value: String(index + 1), label: month })),
    [ethiopianMonths]
  );

  // Fetch initial data
  useEffect(() => {
    fetchCurrentDate();
    fetchClasses();
    fetchSettings();

    // Update current time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Update selectedClass when preSelectedClass prop changes
  useEffect(() => {
    if (preSelectedClass) {
      setSelectedClass(preSelectedClass);
    }
  }, [preSelectedClass]);

  // Generate school weeks when settings and date are loaded
  useEffect(() => {
    if (settings && currentEthiopianDate) {
      generateSchoolWeeks();
    }
  }, [settings, currentEthiopianDate, selectedYear]);

  // Fetch attendance when class or week changes
  useEffect(() => {
    if (selectedClass && selectedWeekId) {
      fetchAttendance();
    }
  }, [selectedClass, selectedWeekId]);

  // Recalculate summary whenever attendanceData changes
  useEffect(() => {
    if (attendanceData.length >= 0) {
      calculateSummary();
    }
  }, [attendanceData]);

  // Fetch students when class changes
  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
    }
  }, [selectedClass, filterStudentType]); // Add filterStudentType as dependency

  // Auto-run absent marker when page loads
  useEffect(() => {
    if (settings && settings.auto_absent_enabled) {
      runAutoMarkerSilently();
    }
  }, [settings]);

  // Auto-refresh attendance data every 30 seconds to catch machine logs
  useEffect(() => {
    if (!selectedClass || !selectedWeekId) return;

    // Set up auto-refresh interval
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing attendance data...');
      fetchAttendance();
      // Summary will auto-calculate when attendanceData updates
    }, 30000); // Refresh every 30 seconds

    // Cleanup interval on unmount or when dependencies change
    return () => clearInterval(refreshInterval);
  }, [selectedClass, selectedWeekId]);

  // Run auto-marker silently in background
  const runAutoMarkerSilently = async () => {
    try {
      console.log('Running auto-marker in background...');
      await axios.post(`${API_BASE_URL}/academic/student-attendance/mark-absent`);
      console.log('Auto-marker completed');
      // Refresh attendance data if we're viewing current data
      if (selectedClass && selectedWeekId) {
        await fetchAttendance();
        // Summary will auto-calculate when attendanceData updates
      }
    } catch (err) {
      console.error('Auto-marker error:', err);
      // Fail silently - don't show error to user
    }
  };

  const fetchCurrentDate = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/academic/student-attendance/current-date`);
      if (response.data.success) {
        const date = response.data.data;
        setCurrentEthiopianDate(date);
        setSelectedYear(date.year);
      }
    } catch (err) {
      console.error('Error fetching current date:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      // Use Task1 schedule config as single source of truth
      const response = await axios.get(`${API_BASE_URL}/schedule/config`);
      if (response.data) {
        const config = response.data;
        // Convert numeric school_days to day names (1=Monday, 2=Tuesday, ..., 5=Friday)
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let schoolDays = config.school_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (Array.isArray(schoolDays) && typeof schoolDays[0] === 'number') {
          schoolDays = schoolDays.map(d => dayNames[d] || d);
        }
        setSettings({
          school_days: schoolDays,
          shift_count: config.total_shifts || 1,
          shift_rotation: config.shift_rotation || false,
          periods_per_shift: config.periods_per_shift || 8,
          period_duration: config.period_duration || 40
        });
      }
    } catch (err) {
      console.error('Error fetching schedule config:', err);
      setSettings({
        school_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      });
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/academic/student-attendance/classes`);
      if (response.data.success) {
        setClasses(response.data.data);
        // Only set first class if no preSelectedClass is provided
        if (response.data.data.length > 0 && !preSelectedClass) {
          setSelectedClass(response.data.data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
      setError('Failed to fetch classes');
    }
  };

  const fetchStudents = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/academic/student-attendance/students`, {
        params: { 
          class: selectedClass,
          studentType: filterStudentType // Add student type filter
        }
      });
      if (response.data.success) {
        setStudents(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Failed to fetch students');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate school weeks starting from Mondays (OPTIMIZED - single API call)
  const generateSchoolWeeks = async () => {
    if (!settings || !settings.school_days) return;

    setIsLoading(true);
    
    try {
      // Make a single API call to generate all weeks on the backend
      const response = await axios.get(`${API_BASE_URL}/academic/student-attendance/generate-weeks`, {
        params: {
          year: selectedYear,
          schoolDays: settings.school_days.join(',')
        }
      });

      if (response.data.success) {
        const weeks = response.data.data.weeks;
        const currentWeekId = response.data.data.currentWeekId;
        
        // Mark current week (prefer backend's currentWeekId)
        const weeksWithCurrent = weeks.map(week => ({
          ...week,
          isCurrent: currentWeekId ? week.id === currentWeekId : false
        }));
        
        setSchoolWeeks(weeksWithCurrent);
        
        console.log(`Loaded ${weeksWithCurrent.length} school weeks for year ${selectedYear}`);
        console.log('Current Ethiopian date:', currentEthiopianDate);
        
        // Select current week if found, otherwise first week
        const currentWeek = weeksWithCurrent.find(w => w.isCurrent);
        if (currentWeek) {
          console.log('Auto-selecting current week:', currentWeek.label);
          setSelectedWeekId(currentWeek.id);
        } else {
          console.log('Current week not found, selecting first week');
          if (weeksWithCurrent.length > 0) {
            setSelectedWeekId(weeksWithCurrent[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Error generating weeks:', err);
      setError('Failed to generate school weeks');
    } finally {
      setIsLoading(false);
    }
  };

  // Go to current week - show modal with calendar info
  const goToCurrentWeek = () => {
    setShowCurrentWeekModal(true);
  };

  // Actually navigate to current week
  const navigateToCurrentWeek = () => {
    // First, check if we're viewing the current year
    if (currentEthiopianDate && selectedYear !== currentEthiopianDate.year) {
      setSelectedYear(currentEthiopianDate.year);
      setShowCurrentWeekModal(false);
      return;
    }

    const currentWeek = schoolWeeks.find(w => w.isCurrent);
    if (currentWeek) {
      setSelectedWeekId(currentWeek.id);
      setShowCurrentWeekModal(false);
    } else {
      alert('Current week not found in the generated weeks. Try refreshing the page.');
    }
  };

  // Get current week info for display
  const getCurrentWeekInfo = () => {
    if (!currentEthiopianDate) return null;
    
    const currentWeek = schoolWeeks.find(w => w.isCurrent);
    
    return {
      today: currentEthiopianDate,
      todayFormatted: `${ethiopianMonths[currentEthiopianDate.month - 1]} ${currentEthiopianDate.day}, ${currentEthiopianDate.year}`,
      currentWeek: currentWeek,
      isCurrentYear: selectedYear === currentEthiopianDate.year,
      totalWeeks: schoolWeeks.length
    };
  };

  const getSelectedWeek = () => {
    return schoolWeeks.find(w => w.id === selectedWeekId);
  };

  const fetchAttendance = async () => {
    const selectedWeek = getSelectedWeek();
    if (!selectedWeek || !selectedWeek.days) return;

    try {
      setIsLoading(true);
      
      // Fetch attendance for all days in the week
      const promises = selectedWeek.days.map(day =>
        axios.get(`${API_BASE_URL}/academic/student-attendance/weekly`, {
          params: {
            week: Math.ceil(day.day / 7),
            year: day.year,
            month: day.month,
            class: selectedClass
          }
        })
      );

      const responses = await Promise.all(promises);
      const allData = responses.flatMap(r => r.data.success ? r.data.data : []);
      
      setAttendanceData(allData);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateSummary = () => {
    const selectedWeek = getSelectedWeek();
    if (!selectedWeek) {
      setSummary({ present: 0, absent: 0, leave: 0, late: 0, total: 0 });
      return;
    }

    // Calculate summary ONLY from current attendanceData (which is already filtered by class and week)
    // Count unique student-day combinations to avoid counting same student multiple times
    const uniqueRecords = new Map();
    
    attendanceData.forEach(record => {
      const key = `${record.student_id}-${record.ethiopian_year}-${record.ethiopian_month}-${record.ethiopian_day}`;
      uniqueRecords.set(key, record);
    });
    
    const records = Array.from(uniqueRecords.values());
    
    const present = records.filter(a => a.status === 'PRESENT').length;
    const absent = records.filter(a => a.status === 'ABSENT').length;
    const leave = records.filter(a => a.status === 'LEAVE').length;
    const late = records.filter(a => a.status === 'LATE').length;
    
    console.log('📊 Summary Calculation:', {
      totalRecords: records.length,
      present,
      late,
      absent,
      leave
    });
    
    setSummary({
      present,
      late,
      absent,
      leave,
      total: records.length
    });
  };

  const getAttendanceStatus = (studentId, dayInfo) => {
    const record = attendanceData.find(
      att => att.student_id === studentId && 
             att.ethiopian_year === dayInfo.year &&
             att.ethiopian_month === dayInfo.month &&
             att.ethiopian_day === dayInfo.day
    );
    return record ? record.status : null;
  };

  const getAttendanceRecord = (studentId, dayInfo) => {
    const record = attendanceData.find(
      att => att.student_id === studentId && 
             att.ethiopian_year === dayInfo.year &&
             att.ethiopian_month === dayInfo.month &&
             att.ethiopian_day === dayInfo.day
    );
    return record;
  };

  // Check if an Ethiopian day is in the future (after today)
  const isFutureDay = (dayInfo) => {
    if (!currentEthiopianDate) return false;
    if (dayInfo.year > currentEthiopianDate.year) return true;
    if (dayInfo.year < currentEthiopianDate.year) return false;
    if (dayInfo.month > currentEthiopianDate.month) return true;
    if (dayInfo.month < currentEthiopianDate.month) return false;
    return dayInfo.day > currentEthiopianDate.day;
  };

  const handleCellClick = (student, dayInfo) => {
    const currentRecord = attendanceData.find(
      att => att.student_id === student.student_id && 
             att.ethiopian_year === dayInfo.year &&
             att.ethiopian_month === dayInfo.month &&
             att.ethiopian_day === dayInfo.day
    );

    setEditModal({
      show: true,
      student,
      dayInfo,
      currentStatus: currentRecord?.status || null
    });

    setEditForm({
      status: currentRecord?.status || 'PRESENT',
      checkInTime: currentRecord?.check_in_time?.substring(0, 5) || '08:00',
      notes: currentRecord?.notes || ''
    });
  };

  const handleSaveAttendance = async () => {
    try {
      setIsLoading(true);

      const response = await axios.put(`${API_BASE_URL}/academic/student-attendance/update`, {
        studentId: editModal.student.student_id,
        className: editModal.student.class_name,
        ethYear: editModal.dayInfo.year,
        ethMonth: editModal.dayInfo.month,
        ethDay: editModal.dayInfo.day,
        status: editForm.status,
        checkInTime: editForm.checkInTime + ':00',
        notes: editForm.notes
      });

      if (response.data.success) {
        await fetchAttendance();
        // Summary will auto-calculate when attendanceData updates
        closeModal();
      }
    } catch (err) {
      console.error('Error saving attendance:', err);
      setError('Failed to save attendance');
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setEditModal({ show: false, student: null, dayInfo: null, currentStatus: null });
    setEditForm({ status: 'PRESENT', checkInTime: '08:00', notes: '' });
  };

  const renderStatusBadge = (record) => {
    if (!record || !record.status) return <span className={styles.noData}>-</span>;

    const status = record.status;
    const checkInTime = record.check_in_time;

    const statusConfig = {
      PRESENT: { className: styles.present, label: '✓' },
      ABSENT: { className: styles.absent, label: '✗' },
      LEAVE: { className: styles.leave, label: 'L' },
      LATE: { className: styles.late, label: '⏰' }
    };

    const config = statusConfig[status] || statusConfig.ABSENT;

    // Show time for PRESENT and LATE statuses
    const showTime = (status === 'PRESENT' || status === 'LATE') && checkInTime;
    
    // Convert 24-hour time to 12-hour format with AM/PM
    let timeDisplay = null;
    if (showTime) {
      const [hours, minutes] = checkInTime.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12; // Convert 0 to 12 for midnight
      timeDisplay = `${hour12}:${minutes} ${ampm}`;
    }

    return (
      <div className={styles.statusContainer}>
        <span className={`${styles.statusBadge} ${config.className}`}>
          {config.label}
        </span>
        {timeDisplay && (
          <span className={styles.checkInTime}>{timeDisplay}</span>
        )}
      </div>
    );
  };

  const formatCurrentTime = () => {
    return currentTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  };

  const formatCurrentDate = () => {
    return currentTime.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Fetch report data for specific date
  const fetchReportData = async () => {
    if (!reportClass || !reportDate.year || !reportDate.month || !reportDate.day) {
      alert('Please select class and date');
      return;
    }

    try {
      setReportLoading(true);
      const response = await axios.get(`${API_BASE_URL}/academic/student-attendance/weekly`, {
        params: {
          week: Math.ceil(reportDate.day / 7),
          year: reportDate.year,
          month: reportDate.month,
          class: reportClass
        }
      });

      if (response.data.success) {
        // Filter data for the specific date
        const dateData = response.data.data.filter(
          record => record.ethiopian_year === reportDate.year &&
                   record.ethiopian_month === reportDate.month &&
                   record.ethiopian_day === reportDate.day
        );
        
        setReportData(dateData);
        
        // Calculate summary
        const present = dateData.filter(a => a.status === 'PRESENT').length;
        const absent = dateData.filter(a => a.status === 'ABSENT').length;
        const leave = dateData.filter(a => a.status === 'LEAVE').length;
        const late = dateData.filter(a => a.status === 'LATE').length;
        
        setReportSummary({
          present,
          late,
          absent,
          leave,
          total: dateData.length
        });
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      alert('Failed to fetch report data');
    } finally {
      setReportLoading(false);
    }
  };

  const printReport = () => {
    window.print();
  };

  const getTodayDayInfo = useCallback(() => {
    const week = schoolWeeks.find((w) => w.id === selectedWeekId);
    if (!week?.days || !currentEthiopianDate) return null;
    return (
      week.days.find(
        (d) =>
          d.year === currentEthiopianDate.year &&
          d.month === currentEthiopianDate.month &&
          d.day === currentEthiopianDate.day
      ) || null
    );
  }, [schoolWeeks, selectedWeekId, currentEthiopianDate]);

  const handleQuickMarkStatus = async (student, status) => {
    const dayInfo = getTodayDayInfo();
    if (!dayInfo) {
      toast.error(
        t(
          'students.attendance.notSchoolDay',
          'Today is not a school day in the selected week, or no week is selected.'
        )
      );
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.put(`${API_BASE_URL}/academic/student-attendance/update`, {
        studentId: student.student_id,
        className: student.class_name,
        ethYear: dayInfo.year,
        ethMonth: dayInfo.month,
        ethDay: dayInfo.day,
        status,
        checkInTime: '08:00:00',
        notes: ''
      });

      if (response.data.success) {
        await fetchAttendance();
      }
    } catch (err) {
      console.error('Error marking attendance:', err);
      toast.error(t('students.attendance.failedToSave', 'Failed to save attendance'));
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusButtonVariant = (currentStatus, buttonStatus) => {
    if (currentStatus !== buttonStatus) return 'secondary';
    switch (buttonStatus) {
      case 'PRESENT':
        return 'success';
      case 'ABSENT':
        return 'danger';
      case 'LATE':
        return 'warning';
      default:
        return 'primary';
    }
  };

  const selectedWeek = getSelectedWeek();
  const todayDayInfo = getTodayDayInfo();

  const editModalFooter = (
    <>
      <Button type="button" variant="secondary" onClick={closeModal}>
        {t('students.attendance.cancel', 'Cancel')}
      </Button>
      <Button
        type="button"
        variant="primary"
        onClick={handleSaveAttendance}
        loading={isLoading}
        disabled={isLoading}
      >
        {isLoading
          ? t('students.attendance.saving', 'Saving...')
          : t('students.attendance.save', 'Save')}
      </Button>
    </>
  );

  const statusEditOptions = [
    { value: 'PRESENT', label: t('students.attendance.present', 'Present') },
    { value: 'ABSENT', label: t('students.attendance.absent', 'Absent') },
    { value: 'LEAVE', label: t('students.attendance.leave', 'Leave') },
    { value: 'LATE', label: t('students.attendance.late', 'Late') }
  ];

  return (
    <div className={styles.container}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} position={toast.position} />

      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            <Users size={28} aria-hidden="true" />
            {t('students.attendance.title', 'Student Attendance')}
          </h1>
          <p className={styles.pageSubtitle}>
            {t('students.attendance.subtitle', 'School week attendance tracking with Ethiopian calendar')}
          </p>
        </div>
        {currentEthiopianDate && (
          <div className={styles.todayBadge}>
            <Calendar size={18} aria-hidden="true" />
            <span>
              {t('students.attendance.today', 'Today')}: {ethiopianMonths[currentEthiopianDate.month - 1]}{' '}
              {currentEthiopianDate.day}, {currentEthiopianDate.year}
            </span>
          </div>
        )}
      </header>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <Card className={styles.timeCard} padding="md">
        <div className={styles.timeCardHeader}>
          <Clock size={18} className={styles.timeCardIcon} aria-hidden="true" />
          <span>{t('students.attendance.currentTime', 'Current Time')}</span>
        </div>
        <div className={styles.timeCardBody}>
          <div className={styles.liveClock}>{formatCurrentTime()}</div>
          <div className={styles.liveDate}>{formatCurrentDate()}</div>
        </div>
      </Card>

      <Card title={t('common.filter', 'Filter')} className={styles.filtersCard} padding="lg">
        <div className={styles.filtersGrid}>
          {preSelectedClass ? (
            <div className={styles.filterField}>
              <span className={styles.filterLabel}>{t('students.attendance.assignedClass', 'Assigned Class')}</span>
              <div className={styles.assignedClassBadge}>{selectedClass}</div>
            </div>
          ) : (
            <Select
              label={t('students.attendance.class', 'Class')}
              options={classSelectOptions}
              value={selectedClass}
              onChange={setSelectedClass}
              disabled={classes.length === 0}
            />
          )}

          <Select
            label={t('students.attendance.studentType', 'Student Type')}
            options={studentTypeOptions}
            value={filterStudentType}
            onChange={setFilterStudentType}
          />

          <Input
            type="number"
            label={t('students.attendance.year', 'Year')}
            value={String(selectedYear)}
            onChange={(v) => setSelectedYear(parseInt(v, 10) || selectedYear)}
            min={2000}
            max={2100}
          />

          <Select
            label={t('students.attendance.schoolWeek', 'School Week')}
            options={
              schoolWeeks.length === 0
                ? [{ value: '', label: t('students.attendance.loadingWeeks', 'Loading weeks...') }]
                : weekSelectOptions
            }
            value={selectedWeekId}
            onChange={setSelectedWeekId}
            disabled={schoolWeeks.length === 0}
          />

          <div className={styles.filterActions}>
            <span className={styles.filterLabel}>{t('students.attendance.quickActions', 'Quick Actions')}</span>
            <div className={styles.buttonGroup}>
              <Button
                type="button"
                variant="secondary"
                icon={<Calendar size={18} />}
                onClick={goToCurrentWeek}
                disabled={schoolWeeks.length === 0}
              >
                {t('students.attendance.currentWeek', 'Current Week')}
              </Button>
              <Button
                type="button"
                variant="primary"
                icon={<RefreshCw size={18} />}
                onClick={() => fetchAttendance()}
                disabled={!selectedClass || !selectedWeekId}
                loading={isLoading}
              >
                {t('students.attendance.refresh', 'Refresh')}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card
        className={styles.reportSection}
        title={t('students.attendance.reportTitle', 'Attendance Report by Date')}
        actions={
          <Button
            type="button"
            variant="ghost"
            icon={showReport ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            onClick={() => setShowReport(!showReport)}
          >
            {showReport
              ? t('students.attendance.hideReport', 'Hide Report')
              : t('students.attendance.showReport', 'Show Report')}
          </Button>
        }
      >

        {showReport && (
          <div className={styles.reportContent}>
            <div className={styles.reportFilters}>
              <Select
                label={t('students.attendance.class', 'Class')}
                options={reportClassOptions}
                value={reportClass}
                onChange={setReportClass}
              />
              <Input
                type="number"
                label={t('students.attendance.year', 'Year')}
                value={String(reportDate.year)}
                onChange={(v) => setReportDate({ ...reportDate, year: parseInt(v, 10) || reportDate.year })}
                min={2000}
                max={2100}
              />
              <Select
                label={t('students.attendance.month', 'Month')}
                options={monthSelectOptions}
                value={String(reportDate.month)}
                onChange={(v) => setReportDate({ ...reportDate, month: parseInt(v, 10) })}
              />
              <Input
                type="number"
                label={t('students.attendance.day', 'Day')}
                value={String(reportDate.day)}
                onChange={(v) => setReportDate({ ...reportDate, day: parseInt(v, 10) || reportDate.day })}
                min={1}
                max={30}
              />
              <div className={styles.filterActions}>
                <span className={styles.filterLabel}>{t('students.attendance.actions', 'Actions')}</span>
                <div className={styles.buttonGroup}>
                  <Button
                    type="button"
                    variant="primary"
                    icon={<BarChart3 size={18} />}
                    onClick={fetchReportData}
                    disabled={!reportClass || reportLoading}
                    loading={reportLoading}
                  >
                    {t('students.attendance.generateReport', 'Generate Report')}
                  </Button>
                  {reportData.length > 0 && (
                    <Button type="button" variant="secondary" icon={<Printer size={18} />} onClick={printReport}>
                      {t('students.attendance.print', 'Print')}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {reportData.length > 0 && (
              <>
                {/* Report Summary */}
                <div className={styles.reportSummary}>
                  <h3 className={styles.reportSummaryTitle}>
                    {reportClass} — {ethiopianMonths[reportDate.month - 1]} {reportDate.day}, {reportDate.year}
                  </h3>
                  <div className={styles.summaryCards}>
                    <StatCard title={t('students.attendance.present', 'Present')} value={reportSummary.present} icon={<CheckCircle size={24} />} variant="success" />
                    <StatCard title={t('students.attendance.late', 'Late')} value={reportSummary.late} icon={<Clock size={24} />} variant="warning" />
                    <StatCard title={t('students.attendance.absent', 'Absent')} value={reportSummary.absent} icon={<XCircle size={24} />} variant="error" />
                    <StatCard title={t('students.attendance.leave', 'Leave')} value={reportSummary.leave} icon={<Calendar size={24} />} variant="secondary" />
                    <StatCard title={t('students.attendance.totalRecords', 'Total')} value={reportSummary.total} icon={<Users size={24} />} variant="primary" />
                  </div>
                </div>

                {/* Report Table */}
                <div className={styles.reportTable}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student Name</th>
                        <th>Class ID</th>
                        <th>Machine ID</th>
                        <th>Status</th>
                        <th>Check-in Time</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((record, index) => (
                        <tr key={record.id || index}>
                          <td>{index + 1}</td>
                          <td className={styles.studentName}>{record.student_name}</td>
                          <td>{record.class_id || 'N/A'}</td>
                          <td>{record.smachine_id || 'Not Set'}</td>
                          <td>{renderStatusBadge(record)}</td>
                          <td>{record.check_in_time || '-'}</td>
                          <td>{record.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {reportData.length === 0 && !reportLoading && reportClass && (
              <div className={styles.noData}>
                {t('students.attendance.noReportData', 'No attendance records found for the selected date.')}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className={styles.summaryCards}>
        <StatCard
          title={t('students.attendance.presentCount', 'Present')}
          value={summary.present}
          icon={<CheckCircle size={24} />}
          variant="success"
        />
        <StatCard
          title={t('students.attendance.lateCount', 'Late')}
          value={summary.late}
          icon={<Clock size={24} />}
          variant="warning"
        />
        <StatCard
          title={t('students.attendance.absentCount', 'Absent')}
          value={summary.absent}
          icon={<XCircle size={24} />}
          variant="error"
        />
        <StatCard
          title={t('students.attendance.leaveCount', 'On Leave')}
          value={summary.leave}
          icon={<Calendar size={24} />}
          variant="secondary"
        />
        <StatCard
          title={t('students.attendance.totalRecords', 'Total Records')}
          value={summary.total}
          icon={<Users size={24} />}
          variant="primary"
        />
      </div>

      {settings?.school_days && (
        <div className={styles.schoolDaysInfo}>
          <strong>{t('students.attendance.schoolDays', 'School Days')}:</strong> {settings.school_days.join(', ')}
          <span className={styles.hint}>
            ({t('students.attendance.schoolDaysHint', 'Weeks start from Monday and show only these days')})
          </span>
        </div>
      )}

      <Card
        title={t('students.attendance.markToday', "Mark today's attendance")}
        subtitle={t('students.attendance.markTodaySubtitle', 'Use toggle buttons to mark present, absent, late, or leave')}
        className={styles.markTodayCard}
      >
        {!todayDayInfo ? (
          <p className={styles.noData}>
            {t(
              'students.attendance.notSchoolDay',
              'Today is not a school day in the selected week, or no week is selected.'
            )}
          </p>
        ) : students.length === 0 ? (
          <p className={styles.noData}>{t('students.attendance.noStudents', 'No students found for this class')}</p>
        ) : (
          <ul className={styles.markTodayList}>
            {students.map((student) => {
              const record = getAttendanceRecord(student.student_id, todayDayInfo);
              const currentStatus = record?.status || null;
              return (
                <li key={`${student.student_id}-${student.class_name}`} className={styles.markTodayRow}>
                  <div className={styles.studentMeta}>
                    <span className={styles.studentName}>{student.student_name}</span>
                    <span className={styles.studentMetaSub}>
                      {t('students.attendance.classId', 'Class ID')}: {student.class_id || 'N/A'} ·{' '}
                      {t('students.attendance.machineId', 'Machine ID')}: {student.smachine_id || '—'}
                    </span>
                  </div>
                  <div className={styles.statusToggles} role="group" aria-label={student.student_name}>
                    {ATTENDANCE_STATUSES.map((status) => (
                      <Button
                        key={status}
                        type="button"
                        size="small"
                        variant={getStatusButtonVariant(currentStatus, status)}
                        onClick={() => handleQuickMarkStatus(student, status)}
                        disabled={isLoading}
                        aria-pressed={currentStatus === status}
                      >
                        {status === 'PRESENT' && t('students.attendance.present', 'Present')}
                        {status === 'ABSENT' && t('students.attendance.absent', 'Absent')}
                        {status === 'LATE' && t('students.attendance.late', 'Late')}
                        {status === 'LEAVE' && t('students.attendance.leave', 'Leave')}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t('students.attendance.weeklyView', 'Weekly attendance')} className={styles.weeklyCard} padding="none">
      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loading}>{t('students.attendance.loading', 'Loading...')}</div>
        ) : !selectedWeek ? (
          <div className={styles.noData}>{t('students.attendance.selectWeek', 'Please select a school week')}</div>
        ) : students.length === 0 ? (
          <div className={styles.noData}>{t('students.attendance.noStudents', 'No students found for this class')}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('students.attendance.studentName', 'Student Name')}</th>
                <th>{t('students.attendance.classId', 'Class ID')}</th>
                <th>{t('students.attendance.machineId', 'Machine ID')}</th>
                {selectedWeek.days.map((dayInfo, index) => (
                  <th key={index}>
                    {ethiopianMonths[dayInfo.month - 1]?.substring(0, 3)} {dayInfo.day} ({dayInfo.dayOfWeek?.substring(0, 3)})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={`${student.student_id}-${student.class_name}`}>
                  <td className={styles.studentName}>{student.student_name}</td>
                  <td className={styles.classId}>{student.class_id || 'N/A'}</td>
                  <td className={styles.machineId}>{student.smachine_id || 'Not Set'}</td>
                  {selectedWeek.days.map((dayInfo, index) => (
                    <td 
                      key={index} 
                      className={`${styles.statusCell} ${styles.clickable}`}
                      onClick={() => handleCellClick(student, dayInfo)}
                      title={t('students.attendance.clickToEdit', 'Click to edit')}
                    >
                      {renderStatusBadge(getAttendanceRecord(student.student_id, dayInfo))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </Card>

      <Card className={styles.infoSection} padding="md">
        <h3 className={styles.infoTitle}>{t('students.attendance.howItWorks', 'How it works')}</h3>
        <ul className={styles.infoList}>
          <li>{t('students.attendance.legendPresent', 'Present — student checked in on time')}</li>
          <li>{t('students.attendance.legendLate', 'Late — student checked in late')}</li>
          <li>{t('students.attendance.legendAbsent', 'Absent — student did not check in')}</li>
          <li>{t('students.attendance.legendLeave', 'Leave — student on approved leave')}</li>
          <li>{t('students.attendance.legendNoData', 'No data — no record for this day')}</li>
        </ul>
        <p className={styles.note}>{t('students.attendance.weeklyNote', 'School weeks start from Monday.')}</p>
        <p className={styles.note}>{t('students.attendance.editHint', 'Click any cell in the weekly table to edit attendance details.')}</p>
      </Card>

      <Modal
        isOpen={editModal.show}
        onClose={closeModal}
        title={t('students.attendance.editAttendance', 'Edit Attendance')}
        footer={editModalFooter}
        size="medium"
      >
        <div className={styles.modalInfo}>
          <p>
            <strong>{t('students.attendance.studentName', 'Student Name')}:</strong> {editModal.student?.student_name}
          </p>
          <p>
            <strong>{t('students.attendance.date', 'Date')}:</strong>{' '}
            {ethiopianMonths[editModal.dayInfo?.month - 1]} {editModal.dayInfo?.day}, {editModal.dayInfo?.year} (
            {editModal.dayInfo?.dayOfWeek})
          </p>
          <p>
            <strong>{t('students.attendance.currentStatus', 'Current Status')}:</strong>{' '}
            {editModal.currentStatus || t('students.attendance.notMarked', 'Not Marked')}
          </p>
        </div>

        <Select
          label={t('students.attendance.status', 'Status')}
          options={statusEditOptions}
          value={editForm.status}
          onChange={(v) => setEditForm({ ...editForm, status: v })}
        />

        <Input
          type="time"
          label={t('students.attendance.checkInTime', 'Check-in Time')}
          value={editForm.checkInTime}
          onChange={(v) => setEditForm({ ...editForm, checkInTime: v })}
        />

        <Textarea
          label={t('students.attendance.notes', 'Notes (Optional)')}
          value={editForm.notes}
          onChange={(v) => setEditForm({ ...editForm, notes: v })}
          placeholder={t('students.attendance.notesPlaceholder', 'Add any notes about this attendance record...')}
          rows={3}
        />
      </Modal>

      {showCurrentWeekModal && (() => {
        const weekInfo = getCurrentWeekInfo();
        const currentWeekFooter = (
          <>
            <Button type="button" variant="secondary" onClick={() => setShowCurrentWeekModal(false)}>
              {t('students.attendance.close', 'Close')}
            </Button>
            {weekInfo?.currentWeek && (
              <Button type="button" variant="primary" icon={<Calendar size={18} />} onClick={navigateToCurrentWeek}>
                {t('students.attendance.goToThisWeek', 'Go to This Week')}
              </Button>
            )}
            {weekInfo && !weekInfo.isCurrentYear && (
              <Button
                type="button"
                variant="primary"
                icon={<Calendar size={18} />}
                onClick={() => {
                  setSelectedYear(weekInfo.today.year);
                  setShowCurrentWeekModal(false);
                }}
              >
                {t('students.attendance.switchToYear', 'Switch to Year {{year}}', { year: weekInfo.today.year })}
              </Button>
            )}
          </>
        );

        return (
          <Modal
            isOpen={showCurrentWeekModal}
            onClose={() => setShowCurrentWeekModal(false)}
            title={t('students.attendance.currentWeekInfo', 'Current Week Information')}
            footer={currentWeekFooter}
            size="medium"
          >
            {weekInfo ? (
              <div className={styles.currentWeekInfo}>
                <div className={styles.weekModalToday}>
                  <Calendar size={32} aria-hidden="true" />
                  <div>
                    <h4>{t('students.attendance.todayDate', "Today's Date")}</h4>
                    <p className={styles.todayDateText}>{weekInfo.todayFormatted}</p>
                  </div>
                </div>

                {!weekInfo.isCurrentYear && (
                  <div className={styles.warningBox}>
                    <strong>{t('students.attendance.differentYear', 'Different Year')}</strong>
                    <p>
                      {t('students.attendance.viewingYear', 'You are viewing year {{year}}, but today is in year {{todayYear}}.', {
                        year: selectedYear,
                        todayYear: weekInfo.today.year
                      })}
                    </p>
                  </div>
                )}

                {weekInfo.currentWeek ? (
                  <div className={styles.weekDetailsBox}>
                    <h4>{t('students.attendance.currentWeekFound', 'Current Week Found')}</h4>
                    <p className={styles.weekRange}>{weekInfo.currentWeek.label}</p>
                    <div className={styles.weekDaysList}>
                      <strong>{t('students.attendance.schoolDaysInWeek', 'School Days in This Week')}:</strong>
                      <ul>
                        {weekInfo.currentWeek.days.map((day, index) => (
                          <li
                            key={index}
                            className={
                              day.year === weekInfo.today.year &&
                              day.month === weekInfo.today.month &&
                              day.day === weekInfo.today.day
                                ? styles.todayHighlight
                                : ''
                            }
                          >
                            {ethiopianMonths[day.month - 1]} {day.day} ({day.dayOfWeek})
                            {day.year === weekInfo.today.year &&
                              day.month === weekInfo.today.month &&
                              day.day === weekInfo.today.day &&
                              ` — ${t('students.attendance.todayInWeek', 'Today')}`}
                          </li>
                        ))}
                      </ul>
                      <p className={styles.weekNote}>{t('students.attendance.todayInWeekNote', 'Today falls within this school week range.')}</p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.warningBox}>
                    <strong>{t('students.attendance.currentWeekNotFound', 'Current Week Not Found')}</strong>
                    <p>
                      {t('students.attendance.currentWeekNotFoundDetail', "Today's date is not in any of the {{count}} generated school weeks.", {
                        count: weekInfo.totalWeeks
                      })}
                    </p>
                    <ul>
                      <li>{t('students.attendance.notSchoolDayReason', 'Today is not a configured school day')}</li>
                      <li>{t('students.attendance.weeksLoading', 'Weeks are still loading')}</li>
                      <li>{t('students.attendance.weeksError', 'There was an error generating weeks')}</li>
                    </ul>
                    <p>{t('students.attendance.checkSettings', 'Check your school days settings or try refreshing the page.')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.warningBox}>
                <p>{t('students.attendance.loadingCalendar', 'Loading calendar information...')}</p>
              </div>
            )}
          </Modal>
        );
      })()}
    </div>
  );
};

export default StudentAttendanceSystem;
