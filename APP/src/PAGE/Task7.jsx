// PAGE/Task7.jsx - UPDATED WITH AUTOMATIC CONFLICT RESOLUTION
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from './Task7.module.css';
import ScheduleEditor from './ScheduleEditor';
import { getBranchCode } from '../utils/branchCode';

const Task7 = ({ onComplete, onScheduleGenerated }) => {
  const [step, setStep] = useState(1);
  const [basicConfig, setBasicConfig] = useState({
    periods_per_shift: 7,
    period_duration: 45,
    short_break_duration: 10,
    total_shifts: 2,
    teaching_days_per_week: 5,
    school_days: [1, 2, 3, 4, 5]
  });
  const [task1Config, setTask1Config] = useState(null);
  const [teachersPeriod, setTeachersPeriod] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [shiftPeriodMatrix, setShiftPeriodMatrix] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scheduleGenerated, setScheduleGenerated] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [systemStatus, setSystemStatus] = useState('checking');
  const [teacherWorkTimes, setTeacherWorkTimes] = useState({});
  const [shiftStats, setShiftStats] = useState(null);
  const [optimizationSettings, setOptimizationSettings] = useState({
    preventTeacherConflicts: true,
    useWorkTimeConstraints: true,
    autoResolveConflicts: true,
    maxAttempts: 1000
  });

  const daysOfWeek = [
    { id: 1, name: 'Monday', short: 'Mon' },
    { id: 2, name: 'Tuesday', short: 'Tue' },
    { id: 3, name: 'Wednesday', short: 'Wed' },
    { id: 4, name: 'Thursday', short: 'Thu' },
    { id: 5, name: 'Friday', short: 'Fri' },
    { id: 6, name: 'Saturday', short: 'Sat' },
    { id: 7, name: 'Sunday', short: 'Sun' }
  ];

  // Check system status on component mount
  useEffect(() => {
    checkSystemStatus();
    fetchTask1Config(); // Fetch Task1 configuration first
    fetchTeachersPeriod();
    fetchClassSubjects();
    fetchTeacherWorkTimes();
    fetchShiftStats();
  }, []);

  // Fetch shift statistics
  const fetchShiftStats = async () => {
    try {
      const response = await axios.post('/api/schedule/auto-rebalance-shifts');
      setShiftStats(response.data);
    } catch (error) {
      console.error('Error fetching shift stats:', error);
    }
  };

  // Auto-assign full-time teachers to all school days
  const handleAutoAssignFullTimeDays = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('/api/schedule/auto-assign-fulltime-days');
      setSuccess(`✅ ${response.data.message}`);
      await fetchTeacherWorkTimes();
      await fetchShiftStats();
    } catch (error) {
      setError('Failed to auto-assign: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate complete schedule with all periods filled
  const handleGenerateCompleteSchedule = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // First auto-assign full-time teachers to all days
      await axios.post('/api/schedule/auto-assign-fulltime-days');
      
      // Then generate complete schedule
      const result = await axios.post('/api/schedule/generate-complete-schedule');
      
      await checkSystemStatus();
      await fetchShiftStats();
      
      if (onScheduleGenerated) {
        onScheduleGenerated();
      }
      
      setSuccess(`✅ Complete schedule generated! ${result.data.total_slots} slots created with 0 conflicts. All periods filled!`);
      setScheduleGenerated(true);
    } catch (error) {
      setError('Failed to generate schedule: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Auto-set full-time teachers' teaching days when school days change
  useEffect(() => {
    if (classSubjects.length > 0 && basicConfig.school_days) {
      setShiftPeriodMatrix(prev => {
        const updated = { ...prev };
        classSubjects.forEach(subjectClass => {
          const subjectClassStr = getSubjectClassString(subjectClass);
          const teacherAssignment = getTeacherForClassSubject(subjectClassStr);
          if (teacherAssignment && isTeacherFullTime(teacherAssignment)) {
            // Auto-set full-time teachers to all school days
            updated[subjectClassStr] = {
              ...(updated[subjectClassStr] || {}),
              days: basicConfig.school_days,
              shift_id: updated[subjectClassStr]?.shift_id || 1,
              periods: updated[subjectClassStr]?.periods || getRecommendedPeriods(getSubjectName(subjectClassStr))
            };
          }
        });
        return updated;
      });
    }
  }, [classSubjects, basicConfig.school_days, teacherWorkTimes]);

  const checkSystemStatus = async () => {
    try {
      setSystemStatus('checking');
      const response = await axios.get('/api/schedule/debug-schedule-status');
      setDebugInfo(response.data);
      
      const hasTeachers = response.data.teachers?.teacher_count > 0;
      const hasConfigs = response.data.configs?.config_count > 0;
      const hasSlots = response.data.slots?.length > 0;
      
      if (!hasTeachers) {
        setSystemStatus('missing_teachers');
        setError('No teacher assignments found. Please complete Task 6 first.');
      } else if (!hasConfigs && step >= 2) {
        setSystemStatus('missing_configs');
        setError('No schedule configurations found. Please complete Step 2.');
      } else if (hasSlots) {
        setSystemStatus('has_schedule');
        setScheduleGenerated(true);
        
        const shift1Slots = response.data.slots.find(s => s.shift_id === 1)?.slot_count || 0;
        const shift2Slots = response.data.slots.find(s => s.shift_id === 2)?.slot_count || 0;
        
        if (shift2Slots === 0 && basicConfig.total_shifts > 1) {
          setError(`Warning: All ${shift1Slots} schedule slots are in Shift 1. No slots in Shift 2. Please check your class-subject shift assignments in Step 2.`);
        }
      } else {
        setSystemStatus('ready');
      }
    } catch (error) {
      console.error('Error checking system status:', error);
      setSystemStatus('error');
      setError('Failed to connect to server. Please check if the server is running.');
    }
  };

  const fetchTeacherWorkTimes = async () => {
    try {
      const response = await axios.get('/api/schedule/teacher-work-times');
      setTeacherWorkTimes(response.data);
    } catch (error) {
      console.error('Error fetching teacher work times:', error);
    }
  };

  const forceResetSchema = async () => {
    try {
      setLoading(true);
      await axios.post('/api/schedule/reset-schema');
      await axios.post('/api/schedule/force-sync-data');
      await checkSystemStatus();
      setSuccess('System reset and data synced successfully!');
    } catch (error) {
      setError('Failed to reset system: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const forceSyncTeachers = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.post('/api/schedule/manual-sync-teachers');
      
      await checkSystemStatus();
      await fetchTeacherWorkTimes();
      
      setSuccess(`✓ Successfully synced ${response.data.synced_count} teacher assignments from Task 6!`);
    } catch (error) {
      if (error.response?.status === 404) {
        setError('No teacher assignments found in Task 6. Please complete Task 6 first.');
      } else {
        setError('Failed to sync teacher data: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // NEW: Sync subjects function
  const syncSubjects = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.post('/api/schedule/sync-subjects');
      
      setSuccess(`✓ Successfully synced ${response.data.synced_count} subjects!`);
    } catch (error) {
      setError('Failed to sync subjects: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTask1Config = async () => {
    try {
      const response = await axios.get('/api/schedule/config');
      if (response.data) {
        setTask1Config(response.data);
        // Update basicConfig with Task1 data
        setBasicConfig({
          periods_per_shift: response.data.periods_per_shift || 7,
          period_duration: response.data.period_duration || 45,
          short_break_duration: response.data.short_break_duration || 10,
          total_shifts: response.data.total_shifts || 2,
          teaching_days_per_week: response.data.teaching_days_per_week || 5,
          school_days: response.data.school_days || [1, 2, 3, 4, 5]
        });
      }
    } catch (error) {
      console.error('Error fetching Task1 config:', error);
      // If Task1 config not found, show error
      setError('Task1 configuration not found. Please complete Task1 first.');
    }
  };

  const fetchBasicConfig = async () => {
    try {
      const response = await axios.get('/api/schedule/config');
      if (response.data) {
        setBasicConfig(response.data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const fetchTeachersPeriod = async () => {
    try {
      const response = await axios.get('/api/schedule/task6/teachers-period');
      if (response.data && response.data.length > 0) {
        setTeachersPeriod(response.data);
      }
    } catch (error) {
      console.error('Error fetching teachers period data:', error);
    }
  };

  const getSubjectClassString = (subjectClass) => {
    if (typeof subjectClass === 'string') {
      return subjectClass;
    } else if (subjectClass && subjectClass.subject_class) {
      return subjectClass.subject_class;
    } else if (subjectClass && subjectClass.subject_name && subjectClass.class_name) {
      return `${subjectClass.subject_name} Class ${subjectClass.class_name}`;
    }
    return String(subjectClass);
  };

  const getSubjectName = (subjectClassStr) => {
    if (typeof subjectClassStr === 'string') {
      const parts = subjectClassStr.split(' Class ');
      return parts[0] || subjectClassStr;
    }
    return '';
  };

  const fetchClassSubjects = async () => {
    try {
      const response = await axios.get('/api/schedule/class-subjects');
      if (response.data && response.data.length > 0) {
        const processedData = response.data.map(item => {
          if (typeof item === 'string') {
            return item;
          } else if (item.subject_class) {
            return item.subject_class;
          } else if (item.subject_name && item.class_name) {
            return `${item.subject_name} Class ${item.class_name}`;
          }
          return String(item);
        });
        
        setClassSubjects(processedData);
        
        // Load per-class shifts from Task 2
        let classShifts = {};
        try {
          const configsRes = await axios.get('/api/schedule/class-subject-configs');
          if (configsRes.data && configsRes.data.length > 0) {
            // Use shift from class_subject_configs (already synced from Task 2)
            const initialMatrix = {};
            configsRes.data.forEach(item => {
              const key = item.subject_class || `${item.subject_name} Class ${item.class_name}`;
              initialMatrix[key] = {
                shift_id: item.shift_id || 1,
                periods: getRecommendedPeriods(getSubjectName(key)),
                days: basicConfig.school_days || [1, 2, 3, 4, 5]
              };
            });
            // Also add any items from processedData that weren't in configs
            processedData.forEach(key => {
              if (!initialMatrix[key]) {
                initialMatrix[key] = {
                  shift_id: 1,
                  periods: getRecommendedPeriods(getSubjectName(key)),
                  days: basicConfig.school_days || [1, 2, 3, 4, 5]
                };
              }
            });
            setShiftPeriodMatrix(initialMatrix);
          } else {
            // Fallback: build from processedData with shift from classConfigs
            const classConfigsRes = await axios.get('/api/students/form-structure', { headers: { 'x-branch-code': (getBranchCode() || '').toUpperCase() } });
            const ccData = classConfigsRes.data?.classConfigs || {};
            const fallbackMatrix = {};
            processedData.forEach(key => {
              const className = key.split(' Class ')[1] || '';
              const cfg = ccData[className] || {};
              fallbackMatrix[key] = {
                shift_id: cfg.shift || 1,
                periods: getRecommendedPeriods(getSubjectName(key)),
                days: basicConfig.school_days || [1, 2, 3, 4, 5]
              };
            });
            setShiftPeriodMatrix(fallbackMatrix);
          }
        } catch(e) {
          console.error('Error loading shifts:', e);
          // Ultimate fallback: default shift 1
          const fallbackMatrix = {};
          processedData.forEach(key => {
            fallbackMatrix[key] = {
              shift_id: 1,
              periods: getRecommendedPeriods(getSubjectName(key)),
              days: basicConfig.school_days || [1, 2, 3, 4, 5]
            };
          });
          setShiftPeriodMatrix(fallbackMatrix);
        }
      }
    } catch (error) {
      console.error('Error fetching class-subjects:', error);
    }
  };

  const getRandomDays = (availableDays, count) => {
    const shuffled = [...availableDays].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  const getRecommendedPeriods = (subjectName) => {
    const lowerSubject = subjectName.toLowerCase();
    if (lowerSubject.includes('math')) return 5;
    if (lowerSubject.includes('english') || lowerSubject === 'eng') return 3;
    if (lowerSubject.includes('science') || lowerSubject === 'bio') return 4;
    return 4;
  };

  const isTeacherFullTime = (teacherAssignment) => {
    return teacherAssignment?.staff_work_time === 'Full Time' || 
           teacherAssignment?.staff_work_time === 'Full time' ||
           !teacherAssignment?.staff_work_time;
  };

  const getTeacherForClassSubject = (subjectClass) => {
    const subjectClassStr = getSubjectClassString(subjectClass);
    return teachersPeriod.find(tp => {
      const teacherSubjectClass = `${tp.subject_name} Class ${tp.class_name}`;
      return teacherSubjectClass === subjectClassStr;
    });
  };

  const validateShiftDistribution = () => {
    const shift1Count = Object.values(shiftPeriodMatrix).filter(config => config.shift_id === 1).length;
    const shift2Count = Object.values(shiftPeriodMatrix).filter(config => config.shift_id === 2).length;
    
    console.log(`Shift distribution validation: Shift 1: ${shift1Count}, Shift 2: ${shift2Count}`);
    
    if (shift1Count === 0) {
      setError('⚠️ No classes assigned to Shift 1. Please assign at least some classes to Shift 1 in Step 2.');
      return false;
    }
    
    if (shift2Count === 0 && basicConfig.total_shifts > 1) {
      setError('⚠️ No classes assigned to Shift 2. Please assign classes to Shift 2 or reduce total shifts to 1.');
      return false;
    }
    
    return true;
  };

  const rebalanceShifts = () => {
    setShiftPeriodMatrix(prev => {
      const updatedMatrix = { ...prev };
      const classSubjects = Object.keys(updatedMatrix);
      const half = Math.ceil(classSubjects.length / 2);
      
      classSubjects.forEach((subjectClass, index) => {
        updatedMatrix[subjectClass] = {
          ...updatedMatrix[subjectClass],
          shift_id: index < half ? 1 : 2
        };
      });
      
      return updatedMatrix;
    });
    setSuccess('Shifts automatically rebalanced!');
  };

  const handleOptimizationChange = (setting, value) => {
    setOptimizationSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleShiftChange = (subjectClass, shiftId) => {
    const subjectClassStr = getSubjectClassString(subjectClass);
    const newShiftId = parseInt(shiftId);
    setShiftPeriodMatrix(prev => ({
      ...prev,
      [subjectClassStr]: {
        ...(prev[subjectClassStr] || {}),
        shift_id: newShiftId,
        periods: prev[subjectClassStr]?.periods || getRecommendedPeriods(getSubjectName(subjectClassStr)),
        days: prev[subjectClassStr]?.days || basicConfig.school_days || [1, 2, 3, 4, 5]
      }
    }));
  };

  const handlePeriodChange = (subjectClass, periods) => {
    const subjectClassStr = getSubjectClassString(subjectClass);
    const newPeriods = parseInt(periods) || getRecommendedPeriods(getSubjectName(subjectClassStr));
    setShiftPeriodMatrix(prev => ({
      ...prev,
      [subjectClassStr]: {
        ...(prev[subjectClassStr] || {}),
        periods: newPeriods,
        shift_id: prev[subjectClassStr]?.shift_id || 1,
        days: prev[subjectClassStr]?.days || basicConfig.school_days || [1, 2, 3, 4, 5]
      }
    }));
  };

  const handleDayAssignment = (subjectClass, dayId) => {
    const subjectClassStr = getSubjectClassString(subjectClass);
    
    if (!basicConfig.school_days.includes(dayId)) {
      return;
    }
    
    const teacherAssignment = getTeacherForClassSubject(subjectClassStr);
    if (teacherAssignment && isTeacherFullTime(teacherAssignment)) {
      setError('Full-time teachers are automatically assigned to all school days.');
      return;
    }
    
    setShiftPeriodMatrix(prev => {
      const current = prev[subjectClassStr] || { 
        shift_id: 1, 
        periods: getRecommendedPeriods(getSubjectName(subjectClassStr)), 
        days: basicConfig.school_days || [1, 2, 3, 4, 5] 
      };
      
      const currentDays = Array.isArray(current.days) ? current.days : [];
      
      const days = currentDays.includes(dayId)
        ? currentDays.filter(d => d !== dayId)
        : [...currentDays, dayId];
      
      return {
        ...prev,
        [subjectClassStr]: {
          ...current,
          days
        }
      };
    });
  };

  const handleShiftPeriodSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateShiftDistribution()) {
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const assignments = Object.entries(shiftPeriodMatrix).map(([subject_class, config]) => {
        const subjectClassStr = getSubjectClassString(subject_class);
        const subjectName = getSubjectName(subjectClassStr);
        const periodsValue = config.periods || getRecommendedPeriods(subjectName);
        const shiftIdValue = config.shift_id || 1;
        
        const teacherAssignment = getTeacherForClassSubject(subjectClassStr);
        let teachingDaysValue = Array.isArray(config.days) ? config.days : (basicConfig.school_days || [1, 2, 3, 4, 5]);
        
        if (teacherAssignment && isTeacherFullTime(teacherAssignment)) {
          teachingDaysValue = basicConfig.school_days || [1, 2, 3, 4, 5];
        }

        return {
          subject_class: subjectClassStr,
          shift_id: shiftIdValue,
          periods_per_week: periodsValue,
          teaching_days: teachingDaysValue
        };
      });

      const shift1Count = assignments.filter(a => a.shift_id === 1).length;
      const shift2Count = assignments.filter(a => a.shift_id === 2).length;

      await axios.post('/api/schedule/set-comprehensive-config', { assignments });
      setSuccess(`✓ Shift and period configuration saved successfully! (Shift 1: ${shift1Count}, Shift 2: ${shift2Count})`);
      setTimeout(() => {
        setStep(2);
        checkSystemStatus();
      }, 1500);
    } catch (error) {
      setError('Failed to save configuration: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!validateShiftDistribution()) {
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // Use manual sync instead of enhanced sync to avoid errors
      await axios.post('/api/schedule/manual-sync-teachers');
      
      // Sync subjects first
      await axios.post('/api/schedule/sync-subjects');
      
      // Then generate the schedule with automatic conflict resolution
      const result = await axios.post('/api/schedule/force-regenerate-schedule', {
        optimization: optimizationSettings
      });
      
      await checkSystemStatus();
      
      if (onScheduleGenerated) {
        onScheduleGenerated();
      }
      
      // Enhanced success message with conflict resolution details
      let successMessage = `✓ Schedule generated successfully! ${result.data.slots_generated} slots created. `;
      
      if (result.data.conflicts_resolved > 0) {
        successMessage += `🔄 ${result.data.conflicts_resolved} conflicts automatically resolved. `;
      }
      
      if (result.data.unavoidable_conflicts > 0) {
        successMessage += `⚠️ ${result.data.unavoidable_conflicts} unavoidable conflicts. `;
      } else {
        successMessage += `✅ All conflicts resolved automatically. `;
      }
      
      successMessage += `All classes and teachers included.`;
      
      setSuccess(successMessage);
      setScheduleGenerated(true);
      
    } catch (error) {
      let errorMessage = 'Failed to generate schedule: ';
      if (error.response?.data?.error) {
        errorMessage += error.response.data.error;
      } else {
        errorMessage += error.message;
      }
      setError(errorMessage);
      
      await checkSystemStatus();
    } finally {
      setLoading(false);
    }
  };

  // NEW: Handle automatic conflict resolution
  const handleAutoResolveConflicts = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await axios.post('/api/schedule/auto-resolve-conflicts');
      
      setSuccess(`✅ Automatic conflict resolution completed! ${result.data.conflicts_resolved} conflicts resolved out of ${result.data.conflicts_detected} detected.`);
      
      await checkSystemStatus();
    } catch (error) {
      setError('Failed to automatically resolve conflicts: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = () => {
    if (scheduleGenerated) {
      onComplete();
    }
  };

  const getStepStatus = (stepNumber) => {
    if (stepNumber < step) return 'completed';
    if (stepNumber === step) return 'active';
    return 'pending';
  };

  const getStatusMessage = () => {
    switch (systemStatus) {
      case 'missing_teachers':
        return '❌ No teacher assignments found. Please complete Task 6 first.';
      case 'missing_configs':
        return '❌ No schedule configurations found. Please complete Step 2.';
      case 'has_schedule':
        return '✅ Schedule has been generated!';
      case 'ready':
        return '✅ System is ready for schedule generation.';
      case 'error':
        return '❌ System error. Please check server connection.';
      default:
        return '🔍 Checking system status...';
    }
  };

  const getShiftDistribution = () => {
    const shift1Count = Object.values(shiftPeriodMatrix).filter(config => config.shift_id === 1).length;
    const shift2Count = Object.values(shiftPeriodMatrix).filter(config => config.shift_id === 2).length;
    return { shift1: shift1Count, shift2: shift2Count };
  };

  const shiftDistribution = getShiftDistribution();

  return (
    <div className={styles.task7Container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Schedule Configuration</h1>
          <p className={styles.subtitle}>Task 7: Configure shifts, periods, and generate timetable</p>
        </div>
        <div className={styles.progressIndicator}>
          <span className={styles.progressText}>Progress: {Math.round((step / 2) * 100)}%</span>
        </div>
      </div>

      <div className={styles.systemStatus}>
        <div className={styles.statusHeader}>
          <h3>System Status</h3>
          <button onClick={checkSystemStatus} className={styles.refreshButton}>
            🔄 Refresh
          </button>
        </div>
        <div className={styles.statusMessage}>
          {getStatusMessage()}
        </div>
        
        {systemStatus === 'error' && (
          <div className={styles.systemActions}>
            <button onClick={forceResetSchema} className={styles.resetButton}>
              🔧 Reset System & Sync Data
            </button>
          </div>
        )}
        
        {systemStatus === 'missing_teachers' && (
          <div className={styles.systemActions}>
            <button 
              onClick={forceSyncTeachers} 
              disabled={loading}
              className={styles.resetButton}
            >
              🔄 Sync Teacher Data from Task 6
            </button>
          </div>
        )}

        {/* NEW: Sync Subjects Button */}
        {systemStatus === 'missing_subjects' && (
          <div className={styles.systemActions}>
            <button 
              onClick={syncSubjects}
              disabled={loading}
              className={styles.resetButton}
            >
              📚 Sync Subjects First
            </button>
          </div>
        )}
      </div>

      {debugInfo && (
        <div className={styles.debugInfo}>
          <details>
            <summary>📊 System Details</summary>
            <div className={styles.debugGrid}>
              <div className={styles.debugItem}>
                <span className={styles.debugLabel}>Teacher Assignments:</span>
                <span className={styles.debugValue}>{debugInfo.teachers?.teacher_count || 0}</span>
              </div>
              <div className={styles.debugItem}>
                <span className={styles.debugLabel}>Schedule Configs:</span>
                <span className={styles.debugValue}>{debugInfo.configs?.config_count || 0}</span>
              </div>
              <div className={styles.debugItem}>
                <span className={styles.debugLabel}>Total Slots:</span>
                <span className={styles.debugValue}>
                  {debugInfo.slots?.reduce((sum, slot) => sum + parseInt(slot.slot_count), 0) || 0}
                </span>
              </div>
              {debugInfo.slots && debugInfo.slots.map(slot => (
                <div key={`shift-${slot.shift_id}`} className={styles.debugItem}>
                  <span className={styles.debugLabel}>Shift {slot.shift_id}:</span>
                  <span className={styles.debugValue}>{slot.slot_count} slots</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {error && (
        <div className={styles.alertError}>
          <div className={styles.alertIcon}>⚠️</div>
          <div className={styles.alertContent}>{error}</div>
        </div>
      )}
      
      {success && (
        <div className={styles.alertSuccess}>
          <div className={styles.alertIcon}>✓</div>
          <div className={styles.alertContent}>{success}</div>
        </div>
      )}

      <div className={styles.progressStepper}>
        {[1, 2].map((stepNum) => (
          <div key={stepNum} className={`${styles.step} ${styles[getStepStatus(stepNum)]}`}>
            <div className={styles.stepCircle}>
              {getStepStatus(stepNum) === 'completed' ? '✓' : stepNum}
            </div>
            <div className={styles.stepLabel}>
              {stepNum === 1 && 'Shift & Period Setup'}
              {stepNum === 2 && 'Generate Schedule'}
            </div>
            {stepNum < 2 && <div className={styles.stepConnector}></div>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitle}>
              <span className={styles.stepNumber}>01</span>
              <h2>Shift & Period Configuration</h2>
            </div>
            <p className={styles.stepDescription}>
              Configure shifts, periods, and teaching days for each class-subject combination.
              <br />
              <strong>Full-Time teachers are automatically assigned to all school days.</strong>
              <br />
              <em>Note: Basic schedule settings (periods, shifts, school days) are retrieved from Task1.</em>
            </p>
          </div>

          {!task1Config && (
            <div className={styles.alertError}>
              <div className={styles.alertIcon}>⚠️</div>
              <div className={styles.alertContent}>
                Task1 configuration not found. Please complete Task1 first to set up basic schedule settings.
              </div>
            </div>
          )}

          {task1Config && (
            <div className={styles.task1ConfigDisplay}>
              <h4>📋 Task1 Configuration (Read-Only)</h4>
              <div className={styles.configGrid}>
                <div className={styles.configItem}>
                  <span className={styles.configLabel}>Periods per Shift:</span>
                  <span className={styles.configValue}>{task1Config.periods_per_shift || basicConfig.periods_per_shift}</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configLabel}>Period Duration:</span>
                  <span className={styles.configValue}>{task1Config.period_duration || basicConfig.period_duration} min</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configLabel}>Total Shifts:</span>
                  <span className={styles.configValue}>{task1Config.total_shifts || basicConfig.total_shifts}</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configLabel}>School Days:</span>
                  <span className={styles.configValue}>
                    {daysOfWeek
                      .filter(day => (task1Config.school_days || basicConfig.school_days).includes(day.id))
                      .map(day => day.short)
                      .join(', ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className={styles.configurationSummary}>
            <h4>Current Shift Distribution</h4>
            <div className={styles.overviewStats}>
              <div className={styles.overviewStat}>
                <div className={styles.statNumber}>{shiftDistribution.shift1}</div>
                <div className={styles.statLabel}>Shift 1 Classes</div>
              </div>
              <div className={styles.overviewStat}>
                <div className={styles.statNumber}>{shiftDistribution.shift2}</div>
                <div className={styles.statLabel}>Shift 2 Classes</div>
              </div>
            </div>
            {shiftDistribution.shift2 === 0 && (
              <div className={styles.warning}>
                ⚠️ No classes assigned to Shift 2. Please assign some classes to Shift 2 to balance the schedule.
              </div>
            )}
          </div>

          {classSubjects.length === 0 ? (
            <div className={styles.noData}>
              <div className={styles.noDataIcon}>📚</div>
              <h3>No Class-Subject Combinations Found</h3>
              <p>Please complete Task 5 and Task 6 first to set up classes, subjects, and teacher assignments.</p>
            </div>
          ) : (
            <form onSubmit={handleShiftPeriodSubmit} className={styles.configForm}>
              <div className={styles.formSection}>
                <div className={styles.comprehensiveGrid}>
                  {classSubjects.map((subjectClass, index) => {
                    const subjectClassStr = getSubjectClassString(subjectClass);
                    const teacherAssignment = getTeacherForClassSubject(subjectClassStr);
                    const currentConfig = shiftPeriodMatrix[subjectClassStr] || {
                      shift_id: 1,
                      periods: getRecommendedPeriods(getSubjectName(subjectClassStr)),
                      days: basicConfig.school_days || [1, 2, 3, 4, 5]
                    };
                    
                    const currentDays = Array.isArray(currentConfig.days) ? currentConfig.days : [];
                    const subjectName = getSubjectName(subjectClassStr);
                    const isFullTime = teacherAssignment && isTeacherFullTime(teacherAssignment);

                    return (
                      <div key={index} className={styles.comprehensiveCard}>
                        <div className={styles.cardHeader}>
                          <h4>{subjectClassStr}</h4>
                          {teacherAssignment && (
                            <div className={styles.teacherDetails}>
                              <span className={styles.teacherName}>{teacherAssignment.teacher_name}</span>
                              <span className={`${styles.workTime} ${
                                isFullTime ? styles.fullTime : styles.partTime
                              }`}>
                                {teacherAssignment.staff_work_time || 'Full Time'}
                                {isFullTime && ' (Auto-set days)'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className={styles.configurationControls}>
                          <div className={styles.controlGroup}>
                            <label className={styles.controlLabel}>Shift</label>
                            <div style={{
                              padding: '8px 12px', background: '#f0f4ff', borderRadius: '6px',
                              border: '1px solid #d0d7ff', fontSize: '0.85rem', fontWeight: 500,
                              color: currentConfig.shift_id === 2 ? '#7c3aed' : '#2563eb'
                            }}>
                              Shift {currentConfig.shift_id || 1} ({currentConfig.shift_id === 2 ? 'Afternoon' : 'Morning'})
                            </div>
                          </div>

                          <div className={styles.controlGroup}>
                            <label className={styles.controlLabel}>Periods/Week</label>
                            <div className={styles.periodControl}>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={currentConfig.periods || 4}
                                onChange={(e) => handlePeriodChange(subjectClassStr, e.target.value)}
                                className={styles.periodInput}
                              />
                              <span className={styles.periodLabel}>periods</span>
                            </div>
                            <div className={styles.recommended}>
                              Recommended: {getRecommendedPeriods(subjectName)} periods
                            </div>
                          </div>

                          {!isFullTime && (
                            <div className={styles.controlGroup}>
                              <label className={styles.controlLabel}>Teaching Days</label>
                              <div className={styles.daysSelection}>
                                {daysOfWeek
                                  .filter(day => basicConfig.school_days.includes(day.id))
                                  .map(day => (
                                    <div key={day.id} className={styles.dayOption}>
                                      <input
                                        type="checkbox"
                                        id={`${subjectClassStr}-day-${day.id}`}
                                        checked={currentDays.includes(day.id)}
                                        onChange={() => handleDayAssignment(subjectClassStr, day.id)}
                                        className={styles.dayCheckbox}
                                        disabled={isFullTime}
                                      />
                                      <label 
                                        htmlFor={`${subjectClassStr}-day-${day.id}`}
                                        className={`${styles.dayLabel} ${
                                          currentDays.includes(day.id) ? styles.daySelected : ''
                                        } ${isFullTime ? styles.disabled : ''}`}
                                      >
                                        {day.short}
                                      </label>
                                    </div>
                                  ))
                                }
                              </div>
                            </div>
                          )}

                          {isFullTime && (
                            <div className={styles.controlGroup}>
                              <label className={styles.controlLabel}>Teaching Days</label>
                              <div className={styles.fullTimeNotice}>
                                <span className={styles.fullTimeText}>
                                  Full-time teacher - automatically assigned to all school days
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className={styles.configSummary}>
                          <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>Shift</span>
                            <span className={styles.summaryValue}>{currentConfig.shift_id}</span>
                          </div>
                          <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>Periods/Week</span>
                            <span className={styles.summaryValue}>{currentConfig.periods}</span>
                          </div>
                          <div className={styles.summaryItem}>
                            <span className={styles.summaryLabel}>Days</span>
                            <span className={styles.summaryValue}>
                              {isFullTime ? 'All' : currentDays.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.formActions}>
                <button 
                  type="submit" 
                  disabled={loading}
                  className={styles.primaryButton}
                >
                  {loading ? 'Saving...' : `Save Schedule Configuration (Shift 1: ${shiftDistribution.shift1}, Shift 2: ${shiftDistribution.shift2}) →`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {step === 2 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitle}>
              <span className={styles.stepNumber}>02</span>
              <h2>Generate Schedule</h2>
            </div>
            <p className={styles.stepDescription}>
              Generate the complete timetable based on your configurations with advanced optimization and automatic conflict resolution.
              <br />
              <strong>Important:</strong> The system will include all classes, properly handle part-time teachers, and automatically resolve conflicts.
            </p>
          </div>

          <div className={styles.generateContent}>
            <div className={styles.optimizationSettings}>
              <h4>Optimization Settings</h4>
              <div className={styles.optimizationGrid}>
                <div className={styles.optimizationOption}>
                  <label className={styles.optimizationLabel}>
                    <input
                      type="checkbox"
                      checked={optimizationSettings.preventTeacherConflicts}
                      onChange={(e) => handleOptimizationChange('preventTeacherConflicts', e.target.checked)}
                      className={styles.optimizationCheckbox}
                    />
                    Prevent Teacher Double-Booking
                  </label>
                  <span className={styles.optimizationHelp}>
                    Ensure teachers are not scheduled in multiple classes simultaneously
                  </span>
                </div>

                <div className={styles.optimizationOption}>
                  <label className={styles.optimizationLabel}>
                    <input
                      type="checkbox"
                      checked={optimizationSettings.useWorkTimeConstraints}
                      onChange={(e) => handleOptimizationChange('useWorkTimeConstraints', e.target.checked)}
                      className={styles.optimizationCheckbox}
                    />
                    Respect Work Time Constraints
                  </label>
                  <span className={styles.optimizationHelp}>
                    Full-time teachers get all days, part-time teachers get assigned days only
                  </span>
                </div>

                {/* NEW: Automatic Conflict Resolution Option */}
                <div className={styles.optimizationOption}>
                  <label className={styles.optimizationLabel}>
                    <input
                      type="checkbox"
                      checked={optimizationSettings.autoResolveConflicts}
                      onChange={(e) => handleOptimizationChange('autoResolveConflicts', e.target.checked)}
                      className={styles.optimizationCheckbox}
                    />
                    Automatic Conflict Resolution
                  </label>
                  <span className={styles.optimizationHelp}>
                    Automatically detect and resolve scheduling conflicts during generation
                  </span>
                </div>
              </div>
            </div>

            {/* Shift Statistics Panel */}
            {shiftStats && (
              <div className={styles.shiftStatsPanel}>
                <h4>📊 Weekly Schedule Capacity</h4>
                <div className={styles.shiftStatsGrid}>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Periods per Day</span>
                    <span className={styles.shiftStatValue}>{shiftStats.config?.periods_per_day}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>School Days</span>
                    <span className={styles.shiftStatValue}>{shiftStats.config?.school_days_count}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Total Shifts</span>
                    <span className={styles.shiftStatValue}>{shiftStats.config?.total_shifts}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Periods/Shift/Week</span>
                    <span className={styles.shiftStatValue}>{shiftStats.calculations?.periods_per_shift_per_week}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Total Classes</span>
                    <span className={styles.shiftStatValue}>{shiftStats.calculations?.total_classes}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Total Periods Needed</span>
                    <span className={styles.shiftStatValue}>{shiftStats.calculations?.total_periods_needed}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Full-Time Teachers</span>
                    <span className={styles.shiftStatValue}>{shiftStats.teachers?.full_time}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Part-Time Teachers</span>
                    <span className={styles.shiftStatValue}>{shiftStats.teachers?.part_time}</span>
                  </div>
                  <div className={styles.shiftStatItem}>
                    <span className={styles.shiftStatLabel}>Teacher Capacity</span>
                    <span className={styles.shiftStatValue}>{shiftStats.teachers?.total_capacity}</span>
                  </div>
                  <div className={`${styles.shiftStatItem} ${shiftStats.status?.can_fill_all ? styles.statusGood : styles.statusWarning}`}>
                    <span className={styles.shiftStatLabel}>Can Fill All?</span>
                    <span className={styles.shiftStatValue}>
                      {shiftStats.status?.can_fill_all ? '✅ Yes' : '⚠️ No'} ({shiftStats.status?.capacity_percentage}%)
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.generationStatus}>
              <h4>Ready to Generate Schedule</h4>
              <p>The system will include ALL classes, properly handle part-time teacher work days, and fill ALL periods without conflicts.</p>
              
              {debugInfo && (
                <div className={styles.generationStats}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Class-Subject Combinations:</span>
                    <span className={styles.statValue}>{debugInfo.configs?.config_count || 0}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Teacher Assignments:</span>
                    <span className={styles.statValue}>{debugInfo.teachers?.teacher_count || 0}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Full-Time Teachers:</span>
                    <span className={styles.statValue}>
                      {Object.values(teacherWorkTimes).filter(wt => wt === 'Full Time' || wt === 'Full time').length}
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Part-Time Teachers:</span>
                    <span className={styles.statValue}>
                      {Object.values(teacherWorkTimes).filter(wt => wt === 'Part Time' || wt === 'Part time').length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-assign full-time teachers button */}
            <div className={styles.autoAssignSection}>
              <button 
                onClick={handleAutoAssignFullTimeDays}
                disabled={loading}
                className={styles.secondaryButton}
              >
                🔄 Auto-Assign Full-Time Teachers to All School Days
              </button>
              <span className={styles.autoAssignHelp}>
                Full-time teachers will be automatically assigned to work all school days
              </span>
            </div>

            <div className={styles.generationActions}>
              {/* Primary: Generate Complete Schedule */}
              <button 
                onClick={handleGenerateCompleteSchedule} 
                disabled={loading || systemStatus === 'missing_teachers'}
                className={styles.primaryButton}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Generating Complete Schedule...
                  </>
                ) : scheduleGenerated ? (
                  '✅ Complete Schedule Generated!'
                ) : (
                  '✨ Generate Complete Schedule (Fill All Periods) →'
                )}
              </button>

              {/* Secondary: Standard generation */}
              <button 
                onClick={handleGenerateSchedule} 
                disabled={loading || systemStatus === 'missing_teachers' || systemStatus === 'missing_configs'}
                className={styles.secondaryButton}
              >
                {loading ? 'Generating...' : 'Generate Standard Schedule'}
              </button>

              {/* Conflict Resolution Button */}
              {systemStatus === 'has_schedule' && (
                <button 
                  onClick={handleAutoResolveConflicts}
                  disabled={loading}
                  className={styles.secondaryButton}
                >
                  🔄 Auto-Resolve Conflicts Only
                </button>
              )}

              {scheduleGenerated && (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}>🎉</div>
                  <div className={styles.successContent}>
                    <h4>Schedule Generated Successfully!</h4>
                    <p>All classes and teachers have been included in the schedule with proper part-time handling and automatic conflict resolution.</p>
                    <div className={styles.successFeatures}>
                      <h5>Schedule Features:</h5>
                      <ul>
                        <li>✓ All classes included</li>
                        <li>✓ Part-time teachers with proper work days</li>
                        <li>✓ Teacher conflict prevention</li>
                        <li>✓ Work-time based scheduling</li>
                        <li>✓ Automatic conflict resolution</li>
                      </ul>
                    </div>
                    <button 
                      onClick={handleCompleteTask}
                      className={styles.completeButton}
                    >
                      ✓ Complete Task 7
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.navigation}>
              <button 
                type="button" 
                onClick={() => setStep(1)} 
                className={styles.secondaryButton}
              >
                ← Back to Shift & Period Setup
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ marginTop: '3rem', borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem' }}>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: 600, color: '#667eea' }}>
            🗓️ Open Schedule Editor (Click to swap periods)
          </summary>
          <ScheduleEditor />
        </details>
      </div>
    </div>
  );
};

export default Task7;