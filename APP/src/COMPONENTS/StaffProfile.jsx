import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiClipboard, FiFileText, FiMessageSquare, FiEye, FiBriefcase, FiUserCheck, FiCalendar, FiCheck, FiX, FiClock, FiSave, FiArrowLeft, FiBook, FiBarChart2, FiAlertCircle, FiEdit, FiEdit2, FiList, FiSearch, FiUsers, FiSettings, FiSend, FiStar, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import axios from 'axios';
import TeacherCommunications from '../PAGE/Communication/TeacherCommunications';
import StudentAttendanceSystem from '../PAGE/Academic/StudentAttendanceSystem';
import { useApp } from '../context/AppContext';
import {
  MobileProfileLayout,
  BottomNavigation,
  ProfileHeader,
  CollapsibleCard,
  SkeletonLoader,
  PostCard,
  useToast,
  ClassCommunicationTab,
  SettingsTab
} from './mobile';
import styles from './StaffProfile.module.css';

// API base URL - use environment variable or fallback to localhost
const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:5052/api'));

// Inline component to create mark list when not found
const MarkListCreateInline = ({ subject, className, term, onCreated }) => {
  const [components, setComponents] = useState([
    { name: 'practical_1', percentage: 5 },
    { name: 'test_1', percentage: 10 },
    { name: 'practical_2', percentage: 5 },
    { name: 'test_2', percentage: 10 },
    { name: 'mid', percentage: 25 },
    { name: 'book', percentage: 5 },
    { name: 'final', percentage: 40 }
  ]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const total = components.reduce((s, c) => s + (c.percentage || 0), 0);

  const handleCreate = async () => {
    if (total !== 100) return setMsg('Total must be 100%');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/mark-list/create-mark-forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectName: subject, className, termNumber: term, markComponents: components })
      });
      const data = await res.json();
      if (res.ok) { onCreated(); }
      else setMsg(data.error || 'Failed');
    } catch (e) { setMsg(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{marginTop:'1rem',padding:'1rem',background:'#f8faff',borderRadius:'12px',border:'1.5px solid #e0e7ff'}}>
      <h4 style={{margin:'0 0 0.75rem',color:'#4f46e5',fontSize:'0.9rem'}}>Mark Components Configuration</h4>
      {components.map((c, i) => (
        <div key={i} style={{display:'flex',gap:'0.5rem',marginBottom:'0.5rem',alignItems:'center'}}>
          <input value={c.name} onChange={e => { const n=[...components]; n[i].name=e.target.value; setComponents(n); }}
            style={{flex:1,padding:'0.4rem 0.6rem',borderRadius:'8px',border:'1px solid #cbd5e1',fontSize:'0.82rem'}} placeholder="Name"/>
          <input type="number" value={c.percentage} onChange={e => { const n=[...components]; n[i].percentage=parseInt(e.target.value)||0; setComponents(n); }}
            style={{width:'60px',padding:'0.4rem',borderRadius:'8px',border:'1px solid #cbd5e1',fontSize:'0.82rem',textAlign:'center'}} min="0" max="100"/>
          <span style={{fontSize:'0.8rem',color:'#64748b'}}>%</span>
          {components.length > 1 && <button onClick={() => setComponents(components.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:'1rem'}}>×</button>}
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'0.5rem'}}>
        <button onClick={() => setComponents([...components,{name:'',percentage:0}])} style={{background:'none',border:'1px dashed #6366f1',color:'#6366f1',borderRadius:'8px',padding:'0.3rem 0.75rem',cursor:'pointer',fontSize:'0.8rem'}}>+ Add</button>
        <span style={{fontSize:'0.82rem',color:total===100?'#16a34a':'#ef4444',fontWeight:600}}>Total: {total}%</span>
      </div>
      {msg && <p style={{color:'#ef4444',fontSize:'0.8rem',margin:'0.5rem 0 0'}}>{msg}</p>}
      <button onClick={handleCreate} disabled={loading||total!==100}
        style={{marginTop:'0.75rem',width:'100%',padding:'0.6rem',background:total===100?'#4f46e5':'#cbd5e1',color:'white',border:'none',borderRadius:'10px',fontWeight:600,cursor:total===100?'pointer':'not-allowed',fontSize:'0.85rem'}}>
        {loading ? 'Creating...' : 'Create Mark List'}
      </button>
    </div>
  );
};

const StaffProfile = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [profilePosts, setProfilePosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useApp();

  // Ethiopian calendar state
  const [ethiopianToday, setEthiopianToday] = useState(null);
  const [weekEthiopianDates, setWeekEthiopianDates] = useState({});

  // Attendance state
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [assignedClass, setAssignedClass] = useState(null);
  const [teacherClasses, setTeacherClasses] = useState([]); // All classes teacher teaches
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [creatingAttendance, setCreatingAttendance] = useState(false);
  const [weeklyTables, setWeeklyTables] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [weeklyAttendanceExists, setWeeklyAttendanceExists] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [schoolDays, setSchoolDays] = useState(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  const [newWeekDate, setNewWeekDate] = useState('');
  const [showNewWeekModal, setShowNewWeekModal] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState('mark'); // 'mark' or 'view'

  // Inline Evaluation Form state
  const [evaluationView, setEvaluationView] = useState('list'); // 'list', 'form', or 'report'
  const [selectedEvaluationId, setSelectedEvaluationId] = useState(null);
  const [evaluationFormData, setEvaluationFormData] = useState(null);
  const [formStudents, setFormStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Evaluation Report state
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // Get Monday of a week from any date
  const getMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  // Format date as YYYY-MM-DD
  const formatDate = (date) => date.toISOString().split('T')[0];

  // Get current week's Monday
  const currentWeekMonday = formatDate(getMonday(new Date()));

  // Get next week's Monday
  const getNextWeekMonday = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDate(getMonday(nextWeek));
  };

  // Ethiopian calendar utilities (frontend)
  const ethMonthNames = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];
  const ethMonthShort = [
    'Mes', 'Tik', 'Hid', 'Tah', 'Tir', 'Yek',
    'Meg', 'Mia', 'Gin', 'Sen', 'Ham', 'Neh', 'Pag'
  ];

  const convertToEthiopian = (gregorianDate) => {
    const date = new Date(gregorianDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const isGregLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    let ethYear, ethMonth, ethDay;
    if (month > 9 || (month === 9 && day >= (isGregLeap(year) ? 12 : 11))) {
      ethYear = year - 7;
      const newYearDay = isGregLeap(year) ? 12 : 11;
      const newYear = new Date(year, 8, newYearDay);
      const current = new Date(year, month - 1, day);
      const diff = Math.round((current - newYear) / 86400000);
      ethMonth = Math.floor(diff / 30) + 1;
      ethDay = (diff % 30) + 1;
    } else {
      ethYear = year - 8;
      const prevNewYearDay = isGregLeap(year - 1) ? 12 : 11;
      const newYear = new Date(year - 1, 8, prevNewYearDay);
      const current = new Date(year, month - 1, day);
      const diff = Math.round((current - newYear) / 86400000);
      ethMonth = Math.floor(diff / 30) + 1;
      ethDay = (diff % 30) + 1;
    }
    return { year: ethYear, month: ethMonth, day: ethDay };
  };

  const formatEthiopianShort = (ethDate) => {
    if (!ethDate) return '';
    return `${ethMonthShort[ethDate.month - 1]} ${ethDate.day}`;
  };

  // Build Ethiopian dates for each day of the selected week
  const buildWeekEthiopianDates = (weekStartDate) => {
    if (!weekStartDate) return {};
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const result = {};
    const monday = new Date(weekStartDate + 'T00:00:00');
    dayNames.forEach((dayName, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      result[dayName] = convertToEthiopian(d);
    });
    return result;
  };

  // All days of the week for reference
  const dayLabels = { 
    monday: 'Monday', 
    tuesday: 'Tuesday', 
    wednesday: 'Wednesday', 
    thursday: 'Thursday', 
    friday: 'Friday', 
    saturday: 'Saturday', 
    sunday: 'Sunday' 
  };

  // Schedule state for teachers
  const [teacherSchedule, setTeacherSchedule] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  // Mark List state
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [markListLoading, setMarkListLoading] = useState(false);
  const [selectedMarkListSubject, setSelectedMarkListSubject] = useState('');
  const [selectedMarkListClass, setSelectedMarkListClass] = useState('');
  const [selectedMarkListTerm, setSelectedMarkListTerm] = useState(1);
  const [selectedMarkComponent, setSelectedMarkComponent] = useState(''); // New: selected component filter
  const [markListData, setMarkListData] = useState([]);
  const [markListConfig, setMarkListConfig] = useState(null);
  const [markListMessage, setMarkListMessage] = useState('');
  const [savingMarks, setSavingMarks] = useState(false);
  const [markListSearchQuery, setMarkListSearchQuery] = useState('');
  const [savedMarkStudents, setSavedMarkStudents] = useState(new Set()); // track locked students
  const [markListOneByOne, setMarkListOneByOne] = useState(false); // one-by-one mode
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0); // current student in one-by-one mode

  // Evaluation Book state
  const [evalBookAssignments, setEvalBookAssignments] = useState([]);
  const [evalBookLoading, setEvalBookLoading] = useState(false);
  const [hasEvalBookAccess, setHasEvalBookAccess] = useState(false);
  const [evalBookView, setEvalBookView] = useState('list'); // 'list' or 'form'
  const [selectedEvalClass, setSelectedEvalClass] = useState(null);
  const [evalTemplate, setEvalTemplate] = useState(null);
  const [evalStudents, setEvalStudents] = useState([]);
  const [evalEntries, setEvalEntries] = useState({});
  const [evalDate, setEvalDate] = useState(new Date().toISOString().split('T')[0]);
  const [evalFormLoading, setEvalFormLoading] = useState(false);
  const [evalFormSaving, setEvalFormSaving] = useState(false);
  const [evalFormError, setEvalFormError] = useState('');
  const [evalFormSuccess, setEvalFormSuccess] = useState('');
  
  // Evaluation Book Reports state
  const [evalReports, setEvalReports] = useState([]);
  const [evalReportsLoading, setEvalReportsLoading] = useState(false);
  const [selectedEvalReport, setSelectedEvalReport] = useState(null);

  // Faults system state
  const [faultClasses, setFaultClasses] = useState([]);
  const [selectedFaultClass, setSelectedFaultClass] = useState('');
  const [faultStudents, setFaultStudents] = useState([]);
  const [faultForm, setFaultForm] = useState({
    student_name: '',
    fault_type: 'Late Arrival',
    description: ''
  });
  const [faultView, setFaultView] = useState('form'); // 'form' or 'list'
  const [faultHistory, setFaultHistory] = useState([]);
  const [faultsLoading, setFaultsLoading] = useState(false);
  const [submittingFault, setSubmittingFault] = useState(false);

  // Dynamic nav items based on role (class teacher and teacher)
  const getNavItems = () => {
    const items = [
      { id: 'profile', label: t('profile'), icon: <FiUser /> }
    ];
    
    // Add Schedule tab for teachers
    if (isTeacher) {
      items.push({ id: 'schedule', label: t('schedule'), icon: <FiCalendar /> });
    }
    
    // Add Mark List tab for teachers with assignments
    if (isTeacher) {
      items.push({ id: 'marklist', label: t('marklist'), icon: <FiList /> });
    }
    
    // Add Class Communication tab for teachers
    if (isTeacher) {
      items.push({ id: 'class', label: t('classComm'), icon: <FiUsers /> });
    }
    
    // Posts in center position with centered flag
    items.push({ id: 'posts', label: t('posts'), icon: <FiFileText />, centered: true });
    
    // Add Attendance tab for class teachers
    if (isClassTeacher) {
      items.push({ id: 'attendance', label: t('attendance'), icon: <FiUserCheck /> });
    }
    
    // Add Evaluation Book tab for all teachers
    if (isTeacher || isClassTeacher) {
      items.push({ id: 'evalbook', label: t('evalBook') || 'Eval Book', icon: <FiBook /> });
    }
    
    // Add Faults tab for all teachers
    if (isTeacher || isClassTeacher) {
      items.push({ id: 'faults', label: t('faults') || 'Faults', icon: <FiAlertCircle /> });
    }
    
    items.push(
      { id: 'evaluations', label: t('evaluations'), icon: <FiClipboard /> },
      { id: 'communications', label: t('messages'), icon: <FiMessageSquare /> },
      { id: 'settings', label: t('settings'), icon: <FiSettings /> }
    );
    
    return items;
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('staffUser');
    const storedProfile = localStorage.getItem('staffProfile');
    
    console.log('StaffProfile: Checking stored data...', { 
      hasUser: !!storedUser, 
      hasProfile: !!storedProfile 
    });
    
    if (!storedUser || !storedProfile) {
      console.log('StaffProfile: No stored data, redirecting to login');
      navigate('/app/staff-login');
      return;
    }
    try {
      const userData = JSON.parse(storedUser);
      const profileData = JSON.parse(storedProfile);
      
      console.log('StaffProfile: Loaded user data:', { 
        username: userData.username, 
        staffType: userData.staffType,
        profileName: profileData.name 
      });
      
      setUser(userData);
      setProfile(profileData);
      fetchStaffEvaluations(profileData.global_staff_id);
      fetchProfilePosts(profileData.global_staff_id);
      checkClassTeacherStatus(profileData.global_staff_id, profileData.name);
      
      // Check if user is a teacher and fetch their schedule and mark lists
      // Show schedule for anyone with staffType containing "teacher" or who is a class teacher
      const staffTypeLower = userData.staffType?.toLowerCase() || '';
      if (staffTypeLower.includes('teacher') || staffTypeLower === 'teacher') {
        setIsTeacher(true);
        fetchTeacherSchedule(profileData.name);
        fetchTeacherMarkLists(profileData.name);
      }
      
      // Check evaluation book assignments for this teacher
      fetchEvalBookAssignments(profileData.global_staff_id);
      
      // Fetch classes for faults system - pass profileData since state hasn't updated yet
      fetchFaultClassesForTeacher(profileData.name);
    } catch (error) {
      console.error('StaffProfile: Error parsing stored data:', error);
      navigate('/app/staff-login');
      return;
    }
    setIsLoading(false);
  }, [navigate]);

  // Check if staff is a class teacher - BASED ON CLASS TEACHER ASSIGNMENT
  const checkClassTeacherStatus = async (globalStaffId, profileName) => {
    console.log(`🔍 Checking class teacher status for: "${profileName}" (ID: ${globalStaffId})`);
    
    try {
      // First, check if teacher has a class teacher assignment
      const url = `${API_BASE_URL}/class-teacher/teacher-assignment/${encodeURIComponent(profileName)}`;
      console.log(`📡 Calling API: ${url}`);
      
      const assignmentResponse = await axios.get(url);
      console.log(`📥 API Response:`, assignmentResponse.data);
      
      if (assignmentResponse.data && assignmentResponse.data.assignments && assignmentResponse.data.assignments.length > 0) {
        // Teacher has class teacher assignment(s)
        const assignments = assignmentResponse.data.assignments;
        console.log(`📋 Assignments found:`, assignments);
        
        const assignedClasses = assignments.map(a => a.assigned_class); // Use assigned_class field
        console.log(`📚 Assigned classes:`, assignedClasses);
        
        setIsClassTeacher(true);
        setAssignedClass(assignedClasses[0]); // Use first assigned class
        setTeacherClasses(assignedClasses);
        
        console.log(`✅ Class teacher detected: ${profileName} assigned to ${assignedClasses.join(', ')}`);
        
        // Fetch students for the first assigned class
        if (assignedClasses[0]) {
          fetchStudentsForAttendance(assignedClasses[0], globalStaffId);
          fetchSchoolDays();
        }
        
        // Class teachers are also teachers - show schedule
        if (!isTeacher) {
          setIsTeacher(true);
          fetchTeacherSchedule(profileName);
        }
      } else {
        console.log(`ℹ️ No class teacher assignments found for ${profileName}`);
        
        // No class teacher assignment - check if they have subject assignments
        const response = await axios.get(`${API_BASE_URL}/mark-list/teacher-mark-lists/${encodeURIComponent(profileName)}`);
        
        if (response.data.assignments && response.data.assignments.length > 0) {
          // Has subject assignments but not a class teacher
          setIsClassTeacher(false);
          setAssignedClass(null);
          setTeacherClasses([]);
          
          console.log(`ℹ️ Teacher ${profileName} has subject assignments but is not a class teacher`);
          
          // Still show schedule for teachers with subject assignments
          if (!isTeacher) {
            setIsTeacher(true);
            fetchTeacherSchedule(profileName);
          }
        } else {
          // No assignments at all
          setIsClassTeacher(false);
          setAssignedClass(null);
          setTeacherClasses([]);
          console.log(`ℹ️ Teacher ${profileName} has no assignments`);
        }
      }
    } catch (error) {
      console.error('❌ Error checking class teacher status:', error);
      console.error('Error details:', error.response?.data);
      setIsClassTeacher(false);
      setAssignedClass(null);
      setTeacherClasses([]);
    }
  };

  // Fetch teacher's personal schedule
  const fetchTeacherSchedule = async (teacherName) => {
    if (!teacherName) return;
    setScheduleLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/schedule/schedule-by-teacher`);
      const allSchedules = response.data;
      
      // Find this teacher's schedule
      const mySchedule = allSchedules[teacherName];
      if (mySchedule && mySchedule.schedule) {
        setTeacherSchedule(mySchedule.schedule);
      } else {
        setTeacherSchedule([]);
      }
    } catch (error) {
      console.error('Error fetching teacher schedule:', error);
      setTeacherSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Fetch teacher's assigned mark lists
  const fetchTeacherMarkLists = async (teacherName) => {
    console.log(`\n========== FETCHING TEACHER MARK LISTS ==========`);
    console.log(`Teacher Name: "${teacherName}"`);
    
    if (!teacherName) {
      console.log(`No teacher name provided - skipping fetch`);
      return;
    }
    
    setMarkListLoading(true);
    try {
      const url = `${API_BASE_URL}/mark-list/teacher-mark-lists/${encodeURIComponent(teacherName)}`;
      console.log(`API URL: ${url}`);
      
      const response = await axios.get(url);
      console.log(`API Response:`, response.data);
      console.log(`Assignments count: ${response.data.assignments?.length || 0}`);
      
      setTeacherAssignments(response.data.assignments || []);
      console.log(`State updated with ${response.data.assignments?.length || 0} assignments`);
    } catch (error) {
      console.error('Error fetching teacher mark lists:', error);
      console.error('Error details:', error.response?.data);
      setTeacherAssignments([]);
    } finally {
      setMarkListLoading(false);
      console.log(`================================================\n`);
    }
  };

  // Fetch evaluation book assignments for this teacher
  const fetchEvalBookAssignments = async (globalStaffId) => {
    if (!globalStaffId) return;
    setEvalBookLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/evaluation-book/assignments/teacher/${globalStaffId}`);
      const assignments = response.data || [];
      setEvalBookAssignments(assignments);
      setHasEvalBookAccess(assignments.length > 0);
    } catch (error) {
      console.error('Error fetching evaluation book assignments:', error);
      setEvalBookAssignments([]);
      setHasEvalBookAccess(false);
    } finally {
      setEvalBookLoading(false);
    }
  };

  // Open evaluation form for a class
  const openEvalBookForm = async (className) => {
    if (!profile?.global_staff_id) return;
    setSelectedEvalClass(className);
    setEvalFormLoading(true);
    setEvalFormError('');
    setEvalFormSuccess('');
    setEvalBookView('form');
    
    try {
      // Fetch class data with students and template
      const response = await axios.get(
        `${API_BASE_URL}/evaluation-book/teacher/${profile.global_staff_id}/class/${encodeURIComponent(className)}`
      );
      const data = response.data;
      setEvalStudents(data.students || []);
      
      if (data.template) {
        // Fetch full template with fields
        const templateRes = await axios.get(`${API_BASE_URL}/evaluation-book/templates/${data.template.id}`);
        setEvalTemplate(templateRes.data);
      }
      
      // Initialize entries for each student
      const initialEntries = {};
      (data.students || []).forEach(student => {
        initialEntries[student.student_name] = { field_values: {}, guardian_id: student.guardian_id || '' };
      });
      setEvalEntries(initialEntries);
    } catch (error) {
      console.error('Error loading evaluation form:', error);
      setEvalFormError(error.response?.data?.error || 'Failed to load evaluation form');
    } finally {
      setEvalFormLoading(false);
    }
  };

  // Handle field change in evaluation form
  const handleEvalFieldChange = (studentName, fieldId, value) => {
    setEvalEntries(prev => ({
      ...prev,
      [studentName]: {
        ...prev[studentName],
        field_values: {
          ...prev[studentName]?.field_values,
          [fieldId]: value
        }
      }
    }));
  };

  // Save evaluation entries
  const saveEvalEntries = async (sendToGuardians = false) => {
    if (!evalTemplate || !profile?.global_staff_id) return;
    setEvalFormSaving(true);
    setEvalFormError('');
    setEvalFormSuccess('');
    
    try {
      const entriesPayload = evalStudents.map(student => ({
        student_name: student.student_name,
        guardian_id: student.guardian_id || null,
        field_values: evalEntries[student.student_name]?.field_values || {}
      }));
      
      const response = await axios.post(`${API_BASE_URL}/evaluation-book/daily`, {
        template_id: evalTemplate.id,
        teacher_global_id: profile.global_staff_id,
        class_name: selectedEvalClass,
        evaluation_date: evalDate,
        entries: entriesPayload
      });
      
      if (sendToGuardians && response.data?.length > 0) {
        const evalIds = response.data.map(e => e.id);
        await axios.post(`${API_BASE_URL}/evaluation-book/daily/send`, {
          evaluation_ids: evalIds
        });
        setEvalFormSuccess('Evaluations saved and sent to guardians!');
      } else {
        setEvalFormSuccess('Evaluations saved successfully!');
      }
      
      toast.success(sendToGuardians ? 'Sent to guardians!' : 'Saved!');
    } catch (error) {
      console.error('Error saving evaluations:', error);
      setEvalFormError(error.response?.data?.error || 'Failed to save evaluations');
      toast.error('Failed to save');
    } finally {
      setEvalFormSaving(false);
    }
  };

  // Back to class list
  const backToEvalBookList = () => {
    setEvalBookView('list');
    setSelectedEvalClass(null);
    setEvalTemplate(null);
    setEvalStudents([]);
    setEvalEntries({});
    setEvalFormError('');
    setEvalFormSuccess('');
  };

  // Fetch evaluation reports for teacher
  const fetchEvalReports = async () => {
    if (!profile?.global_staff_id) return;
    setEvalReportsLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/evaluation-book/reports/teacher/${profile.global_staff_id}`
      );
      setEvalReports(response.data?.entries || []);
    } catch (error) {
      console.error('Error fetching eval reports:', error);
      setEvalReports([]);
    } finally {
      setEvalReportsLoading(false);
    }
  };

  // Show reports view
  const showEvalReports = () => {
    setEvalBookView('reports');
    fetchEvalReports();
  };

  // Get unique subjects from assignments
  const getMarkListSubjects = () => {
    const subjects = [...new Set(teacherAssignments.map(a => a.subjectName))];
    return subjects;
  };

  // Get classes for selected subject
  const getMarkListClasses = () => {
    if (!selectedMarkListSubject) return [];
    const classes = [...new Set(
      teacherAssignments
        .filter(a => a.subjectName === selectedMarkListSubject)
        .map(a => a.className)
    )];
    return classes;
  };

  // Get terms for selected subject and class
  const getMarkListTerms = () => {
    if (!selectedMarkListSubject || !selectedMarkListClass) return [];
    const terms = teacherAssignments
      .filter(a => a.subjectName === selectedMarkListSubject && a.className === selectedMarkListClass)
      .map(a => a.termNumber);
    return [...new Set(terms)].sort();
  };

  // Get available mark components from config
  const getAvailableComponents = () => {
    if (!markListConfig) return [];
    return markListConfig.mark_components || [];
  };

  // Fetch mark list config when term is selected (to populate Test dropdown)
  const fetchMarkListConfig = async () => {
    if (!selectedMarkListSubject || !selectedMarkListClass || !selectedMarkListTerm) return;
    try {
      const response = await axios.get(
        `${API_BASE_URL}/mark-list/mark-list/${encodeURIComponent(selectedMarkListSubject)}/${encodeURIComponent(selectedMarkListClass)}/${selectedMarkListTerm}`
      );
      setMarkListConfig(response.data.config || null);
    } catch (error) {
      console.error('Error fetching mark list config:', error);
      setMarkListConfig(null);
    }
  };

  // Fetch config when term changes
  useEffect(() => {
    if (selectedMarkListSubject && selectedMarkListClass && selectedMarkListTerm) {
      fetchMarkListConfig();
    } else {
      setMarkListConfig(null);
    }
  }, [selectedMarkListSubject, selectedMarkListClass, selectedMarkListTerm]);

  // Load mark list data
  const loadMarkListData = async () => {
    if (!selectedMarkListSubject || !selectedMarkListClass || !selectedMarkListTerm) return;
    setMarkListLoading(true);
    setMarkListMessage('');
    // setSavedMarkStudents(new Set()); // REMOVED: Lock state should persist based on database values
    setCurrentStudentIndex(0);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/mark-list/mark-list/${encodeURIComponent(selectedMarkListSubject)}/${encodeURIComponent(selectedMarkListClass)}/${selectedMarkListTerm}`
      );
      const list = response.data.markList || [];
      setMarkListData(list);
      setMarkListConfig(response.data.config || null);
      
      // Lock students who have ANY mark component with value > 0
      const config = response.data.config;
      if (config && config.mark_components) {
        const studentsWithMarks = new Set(
          list
            .filter(student => {
              // Check if ANY mark component has a value > 0
              return config.mark_components.some(component => {
                const componentKey = component.name.toLowerCase().replace(/[\s\-\.]+/g, '_');
                const value = student[componentKey];
                return value && parseFloat(value) > 0;
              });
            })
            .map(s => s.id)
        );
        setSavedMarkStudents(studentsWithMarks);
        console.log('📊 Students with existing marks:', Array.from(studentsWithMarks));
      }
    } catch (error) {
      console.error('Error loading mark list:', error);
      setMarkListMessage('Failed to load mark list');
      setMarkListData([]);
      setMarkListConfig(null);
    } finally {
      setMarkListLoading(false);
    }
  };

  // Handle mark change
  const handleMarkListMarkChange = (studentId, componentKey, value) => {
    setMarkListData(prev => prev.map(student => {
      if (student.id === studentId) {
        return { ...student, [componentKey]: value === '' ? '' : parseFloat(value) };
      }
      return student;
    }));
  };

  // Save marks for all students at once
  const saveAllStudentMarks = async () => {
    if (!markListData.length || !markListConfig) return;

    setSavingMarks(true);
    try {
      const studentsToSave = markListData.filter(student => {
        // Only save students who have at least one mark entered
        return markListConfig.mark_components.some(component => {
          const componentKey = component.name.toLowerCase().replace(/\s+/g, '_');
          return student[componentKey] && parseFloat(student[componentKey]) > 0;
        });
      });

      if (studentsToSave.length === 0) {
        toast.error('No marks to save');
        setSavingMarks(false);
        return;
      }

      // Save all students in parallel
      const savePromises = studentsToSave.map(async (student) => {
        const marks = {};
        markListConfig.mark_components.forEach(component => {
          const componentKey = component.name.toLowerCase().replace(/\s+/g, '_');
          marks[componentKey] = student[componentKey] || 0;
        });

        const response = await axios.put(`${API_BASE_URL}/mark-list/update-marks`, {
          subjectName: selectedMarkListSubject,
          className: selectedMarkListClass,
          termNumber: selectedMarkListTerm,
          studentId: student.id,
          marks: marks
        });

        return { studentId: student.id, total: response.data.total, passStatus: response.data.passStatus };
      });

      const results = await Promise.all(savePromises);

      // Update local state with new totals and lock saved students
      const newLockedStudents = new Set(savedMarkStudents);
      setMarkListData(prev => prev.map(s => {
        const result = results.find(r => r.studentId === s.id);
        if (result) {
          newLockedStudents.add(s.id);
          return { ...s, total: result.total, pass_status: result.passStatus };
        }
        return s;
      }));
      
      setSavedMarkStudents(newLockedStudents);
      toast.success(`✅ Successfully saved marks for ${studentsToSave.length} student(s)!`);
    } catch (error) {
      console.error('Error saving marks:', error);
      toast.error('Failed to save marks');
    } finally {
      setSavingMarks(false);
    }
  };

  // Calculate progress
  const getMarkListProgress = () => {
    if (!markListData.length || !markListConfig) return { completed: 0, total: 0, percentage: 0 };
    const total = markListData.length;
    const completed = markListData.filter(student => {
      return markListConfig.mark_components.every(comp => {
        const key = comp.name.toLowerCase().replace(/\s+/g, '_');
        return student[key] > 0;
      });
    }).length;
    return { completed, total, percentage: total > 0 ? (completed / total) * 100 : 0 };
  };

  // Fetch school days from schedule config
  const fetchSchoolDays = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/class-teacher/school-days`);
      if (response.data.schoolDays && response.data.schoolDays.length > 0) {
        const days = response.data.schoolDays;
        setSchoolDays(days);
        // Auto-select today's day if it's a school day, otherwise first school day
        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const autoDay = days.includes(todayName) ? todayName : days[0];
        setSelectedDay(autoDay);
      }
    } catch (error) {
      console.error('Error fetching school days:', error);
      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      setSelectedDay(todayName);
    }
  };

  // Fetch school days when switching to attendance tab
  useEffect(() => {
    if (activeTab === 'attendance' && isClassTeacher) {
      fetchSchoolDays();
    }
  }, [activeTab, isClassTeacher]);
  const fetchStudentsForAttendance = async (className, staffId) => {
    setAttendanceLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/class-teacher/students/${className}`);
      setStudents(response.data);
      await fetchWeeklyTables(className, staffId);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Fetch weekly attendance tables
  const fetchWeeklyTables = async (className, staffId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/class-teacher/weekly-tables/${className}`);
      setWeeklyTables(response.data);
      
      const currentWeekTable = `week_${currentWeekMonday.replace(/-/g, '_')}`;
      
      if (response.data.includes(currentWeekTable)) {
        // Current week exists — load it
        setSelectedWeek(currentWeekMonday);
        fetchWeeklyAttendance(className, currentWeekMonday);
      } else {
        // Current week doesn't exist — auto-create it silently
        try {
          const staffUser = JSON.parse(localStorage.getItem('staffUser') || '{}');
          const globalStaffId = staffId || profile?.global_staff_id || staffUser?.global_staff_id;
          if (!globalStaffId) throw new Error('Staff ID not found');
          
          await axios.post(`${API_BASE_URL}/class-teacher/create-weekly-attendance`, {
            className,
            weekStart: currentWeekMonday,
            globalStaffId
          });
          // Reload tables after creation
          const refreshed = await axios.get(`${API_BASE_URL}/class-teacher/weekly-tables/${className}`);
          setWeeklyTables(refreshed.data);
          setSelectedWeek(currentWeekMonday);
          setWeeklyAttendanceExists(true);
          fetchWeeklyAttendance(className, currentWeekMonday);
        } catch (createErr) {
          // Creation failed — fall back to latest existing week
          console.error('Auto-create week failed:', createErr?.response?.data || createErr);
          if (response.data.length > 0) {
            const latestWeek = response.data[0].replace('week_', '').replace(/_/g, '-');
            setSelectedWeek(latestWeek);
            setWeeklyAttendanceExists(true);
            fetchWeeklyAttendance(className, latestWeek);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching weekly tables:', error);
    }
  };

  // Fetch weekly attendance data
  const fetchWeeklyAttendance = async (className, weekStart) => {
    if (!className || !weekStart) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/class-teacher/weekly-attendance/${className}/${weekStart}`);
      setWeeklyAttendanceExists(response.data.exists);
      
      if (response.data.exists && response.data.data.length > 0) {
        const records = {};
        response.data.data.forEach(record => {
          const key = `${record.school_id}-${record.class_id}`;
          records[key] = {
            school_id: record.school_id,
            class_id: record.class_id,
            student_name: record.student_name,
            monday: record.monday || '',
            tuesday: record.tuesday || '',
            wednesday: record.wednesday || '',
            thursday: record.thursday || '',
            friday: record.friday || '',
            saturday: record.saturday || '',
            sunday: record.sunday || ''
          };
        });
        setAttendanceRecords(records);
      } else {
        // Initialize empty records from students
        const records = {};
        students.forEach(student => {
          const key = `${student.school_id}-${student.class_id}`;
          records[key] = {
            school_id: student.school_id,
            class_id: student.class_id,
            student_name: student.student_name,
            monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: ''
          };
        });
        setAttendanceRecords(records);
      }
    } catch (error) {
      console.error('Error fetching weekly attendance:', error);
    }
  };

  // Effect to refetch attendance when week changes
  useEffect(() => {
    if (assignedClass && isClassTeacher && selectedWeek) {
      fetchWeeklyAttendance(assignedClass, selectedWeek);
    }
  }, [selectedWeek, assignedClass, isClassTeacher]);

  // Fetch Ethiopian today from API (same as admin) and build week dates
  useEffect(() => {
    const fetchEthiopianToday = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/academic/student-attendance/current-date`);
        if (res.data.success) {
          setEthiopianToday(res.data.data);
        } else {
          setEthiopianToday(convertToEthiopian(new Date()));
        }
      } catch {
        setEthiopianToday(convertToEthiopian(new Date()));
      }
    };
    fetchEthiopianToday();
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      setWeekEthiopianDates(buildWeekEthiopianDates(selectedWeek));
    }
  }, [selectedWeek]);

  // Auto-save debounce ref
  const autoSaveTimer = useRef(null);

  // Handle attendance status change for a specific day - auto saves after 1.5s
  const handleAttendanceStatusChange = (studentKey, day, status) => {
    setAttendanceRecords(prev => {
      const updated = {
        ...prev,
        [studentKey]: {
          ...prev[studentKey],
          [day]: status
        }
      };

      // Auto-save after 1.5 seconds of no changes
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        saveAttendanceWithRecords(updated);
      }, 1500);

      return updated;
    });
  };

  // Mark all students with same status for selected day
  const markAllAs = (status) => {
    const updatedRecords = { ...attendanceRecords };
    students.forEach(student => {
      const key = `${student.school_id}-${student.class_id}`;
      if (updatedRecords[key]) {
        updatedRecords[key] = {
          ...updatedRecords[key],
          [selectedDay]: status
        };
      }
    });
    setAttendanceRecords(updatedRecords);

    // Auto-save after 1.5s
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveAttendanceWithRecords(updatedRecords);
    }, 1500);
  };

  // Create new weekly attendance
  const createWeeklyAttendance = async (weekStart = null) => {
    if (!profile || !assignedClass) return;
    
    const targetWeek = weekStart || newWeekDate || currentWeekMonday;
    // Ensure we use the Monday of the selected week
    const mondayOfWeek = formatDate(getMonday(new Date(targetWeek)));
    
    setCreatingAttendance(true);
    try {
      await axios.post(`${API_BASE_URL}/class-teacher/create-weekly-attendance`, {
        className: assignedClass,
        weekStart: mondayOfWeek,
        globalStaffId: profile.global_staff_id
      });
      toast.success(`Weekly attendance created for week of ${mondayOfWeek}!`);
      setSelectedWeek(mondayOfWeek);
      setShowNewWeekModal(false);
      setNewWeekDate('');
      await fetchWeeklyTables(assignedClass);
      await fetchWeeklyAttendance(assignedClass, mondayOfWeek);
    } catch (error) {
      console.error('Error creating weekly attendance:', error);
      toast.error(error.response?.data?.error || 'Failed to create weekly attendance');
    } finally {
      setCreatingAttendance(false);
    }
  };

  // Quick create for next week
  const createNextWeekAttendance = () => {
    createWeeklyAttendance(getNextWeekMonday());
  };

  // Save weekly attendance
  const saveAttendance = async () => {
    await saveAttendanceWithRecords(attendanceRecords);
  };

  // Save with explicit records (used by auto-save)
  const saveAttendanceWithRecords = async (records) => {
    if (!profile || !assignedClass || !selectedWeek || students.length === 0) return;
    setSavingAttendance(true);
    try {
      const payload = students
        .filter(student => student.school_id && student.class_id)
        .map(student => {
          const key = `${student.school_id}-${student.class_id}`;
          const record = records[key] || {};
          return {
            school_id: String(student.school_id),
            class_id: String(student.class_id),
            monday: record.monday || null,
            tuesday: record.tuesday || null,
            wednesday: record.wednesday || null,
            thursday: record.thursday || null,
            friday: record.friday || null,
            saturday: record.saturday || null,
            sunday: record.sunday || null
          };
        });
      
      await axios.put(`${API_BASE_URL}/class-teacher/weekly-attendance/${assignedClass}/${selectedWeek}`, {
        records: payload,
        globalStaffId: profile.global_staff_id
      });
      
      await fetchWeeklyAttendance(assignedClass, selectedWeek);
      toast.success('Attendance saved!');
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error(error.response?.data?.error || 'Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  const fetchStaffEvaluations = async (staffId) => {
    if (!staffId) return;
    setEvaluationsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/evaluations/staff-evaluations/${staffId}`);
      if (response.ok) {
        const data = await response.json();
        setEvaluations(data);
      }
    } catch (error) {
      console.error('Error fetching evaluations:', error);
    } finally {
      setEvaluationsLoading(false);
    }
  };

  // Fetch evaluation form data for inline editing
  const fetchEvaluationForm = async (evaluationId) => {
    if (!evaluationId) return;
    setFormLoading(true);
    setFormError('');
    try {
      const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/form`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch evaluation form');
      }
      const formData = await response.json();
      
      setEvaluationFormData(formData);
      setFormStudents(formData.students || []);
      
      // Initialize scores state from existing student scores
      const initialScores = {};
      (formData.students || []).forEach(student => {
        initialScores[student.student_name] = {};
        (formData.areas || []).forEach(area => {
          (area.criteria || []).forEach(criterion => {
            const existingScore = student.scores?.[criterion.id];
            initialScores[student.student_name][criterion.id] = {
              score: existingScore?.score || 0,
              notes: existingScore?.notes || ''
            };
          });
        });
      });
      setScores(initialScores);
      setSelectedEvaluationId(evaluationId);
      setEvaluationView('form');
    } catch (error) {
      console.error('Error fetching evaluation form:', error);
      setFormError(error.message || 'Failed to load evaluation form');
    } finally {
      setFormLoading(false);
    }
  };

  // Fetch evaluation report data for viewing
  const fetchEvaluationReport = async (evaluationId) => {
    if (!evaluationId) return;
    setReportLoading(true);
    setReportError('');
    setEvaluationView('report'); // Set view immediately so back button is visible
    try {
      const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/form`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch evaluation report');
      }
      const data = await response.json();
      setReportData(data);
      setSelectedEvaluationId(evaluationId);
    } catch (error) {
      console.error('Error fetching evaluation report:', error);
      setReportError(error.message || 'Failed to load evaluation report');
    } finally {
      setReportLoading(false);
    }
  };

  // Update score for a student/criterion
  const updateScore = (studentName, criterionId, field, value) => {
    setScores(prev => ({
      ...prev,
      [studentName]: {
        ...prev[studentName],
        [criterionId]: {
          ...prev[studentName]?.[criterionId],
          [field]: field === 'score' ? Math.max(0, parseInt(value) || 0) : value
        }
      }
    }));
  };

  // Calculate total score for a student
  const calculateStudentTotal = (studentName) => {
    if (!evaluationFormData?.areas || !scores[studentName]) return { total: 0, max: 0 };
    
    let total = 0;
    let max = 0;
    evaluationFormData.areas.forEach(area => {
      (area.criteria || []).forEach(criterion => {
        total += scores[studentName]?.[criterion.id]?.score || 0;
        max += criterion.max_points || 0;
      });
    });
    return { total, max };
  };

  // Save evaluation scores
  const saveEvaluationScores = async () => {
    if (!selectedEvaluationId || !evaluationFormData) return;
    
    setFormSaving(true);
    setFormError('');
    
    const responsesPayload = formStudents.map(student => {
      const studentScores = {};
      evaluationFormData.areas.forEach(area => {
        (area.criteria || []).forEach(criterion => {
          const scoreData = scores[student.student_name]?.[criterion.id];
          if (scoreData) {
            studentScores[criterion.criteria_name] = {
              score: scoreData.score,
              notes: scoreData.notes
            };
          }
        });
      });
      
      return {
        student_name: student.student_name,
        student_age: student.student_age,
        student_gender: student.student_gender,
        student_class: evaluationFormData.evaluation.class_name,
        scores: studentScores
      };
    });
    
    try {
      const response = await fetch(`${API_BASE_URL}/evaluations/${selectedEvaluationId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: responsesPayload })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save scores');
      }
      
      toast.success('Evaluation scores saved successfully!');
      // Refresh evaluations list to update status
      if (profile) {
        fetchStaffEvaluations(profile.global_staff_id);
      }
    } catch (error) {
      console.error('Error saving evaluation scores:', error);
      toast.error(error.message || 'Failed to save scores');
      setFormError(error.message);
    } finally {
      setFormSaving(false);
    }
  };

  // Navigate back to evaluation list
  const handleBackToEvaluationList = () => {
    setEvaluationView('list');
    setSelectedEvaluationId(null);
    setEvaluationFormData(null);
    setFormStudents([]);
    setScores({});
    setFormError('');
    setReportData(null);
    setReportError('');
    // Refresh list to show updated status
    if (profile) {
      fetchStaffEvaluations(profile.global_staff_id);
    }
  };

  const fetchProfilePosts = async (staffId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/posts/profile/staff/${staffId}`);
      setProfilePosts(response.data.map(post => ({ ...post, localLikes: post.likes || 0 })));
    } catch (error) {
      console.error('Error fetching profile posts:', error);
    } finally {
      setPostsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (profile) {
      setPostsLoading(true);
      setEvaluationsLoading(true);
      await Promise.all([
        fetchStaffEvaluations(profile.global_staff_id),
        fetchProfilePosts(profile.global_staff_id)
      ]);
      toast.success('Profile refreshed');
    }
  };

  const handleLike = async (postId) => {
    try {
      await axios.put(`${API_BASE_URL}/posts/${postId}/like`);
      setProfilePosts(prev =>
        prev.map(post =>
          post.id === postId ? { ...post, localLikes: (post.localLikes || 0) + 1 } : post
        )
      );
      toast.success('Post liked!');
    } catch (error) {
      toast.error('Failed to like post');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('staffUser');
    localStorage.removeItem('staffProfile');
    navigate('/app/staff-login');
  };

  // Faults System Functions
  const getAuthConfig = () => {
    const token = localStorage.getItem('authToken');
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  };

  const fetchFaultClasses = async (teacherName) => {
    try {
      // Get teacher's assigned classes from class-communication endpoint
      if (!teacherName) {
        console.log('No teacher name provided');
        return;
      }
      
      const response = await axios.get(`${API_BASE_URL}/class-communication/teacher-classes/${encodeURIComponent(teacherName)}`);
      const classes = Array.isArray(response.data.classes) ? response.data.classes : [];
      setFaultClasses(classes);
      
      console.log(`✅ Loaded ${classes.length} classes for teacher ${teacherName}:`, classes);
      // Don't auto-select first class - let user choose
    } catch (error) {
      console.error('Error fetching fault classes:', error);
      setFaultClasses([]); // Set empty array on error
      // Don't show error toast on initial load - it's not critical
    }
  };

  // Wrapper function for backward compatibility
  const fetchFaultClassesForTeacher = (teacherName) => {
    fetchFaultClasses(teacherName);
  };

  const fetchFaultStudents = async (className) => {
    if (!className) return;
    try {
      setFaultsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/faults/students/${className}`, getAuthConfig());
      setFaultStudents(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching students:', error);
      setFaultStudents([]); // Set empty array on error
      toast.error('Failed to load students');
    } finally {
      setFaultsLoading(false);
    }
  };

  const handleDeleteFault = async (fault, className) => {
    if (!window.confirm(`Delete this fault for ${fault.student_name}?`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/faults/delete-fault/${className}/${fault.id}`, getAuthConfig());
      toast.success('Fault deleted');
      fetchFaultHistory(className);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete fault');
    }
  };

  const fetchFaultHistory = async (className) => {
    if (!className) return;
    try {
      setFaultsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/faults/faults/${className}`, getAuthConfig());
      setFaultHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching fault history:', error);
      setFaultHistory([]); // Set empty array on error
      toast.error('Failed to load fault history');
    } finally {
      setFaultsLoading(false);
    }
  };

  const handleFaultClassChange = (className) => {
    setSelectedFaultClass(className);
    if (className) {
      fetchFaultStudents(className);
      if (faultView === 'list') {
        fetchFaultHistory(className);
      }
    }
  };

  // Auto-fetch students when fault class changes
  useEffect(() => {
    if (selectedFaultClass && faultView === 'form') {
      fetchFaultStudents(selectedFaultClass);
    }
  }, [selectedFaultClass, faultView]);

  const handleSubmitFault = async (e) => {
    e.preventDefault();
    
    if (!selectedFaultClass) {
      toast.error('Please select a class');
      return;
    }
    
    if (!faultForm.student_name || !faultForm.fault_type || !faultForm.description) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      setSubmittingFault(true);
      const formData = new FormData();
      formData.append('className', selectedFaultClass);
      formData.append('student_name', faultForm.student_name);
      formData.append('fault_type', faultForm.fault_type);
      formData.append('fault_level', 'Minor'); // Default level
      formData.append('date', new Date().toISOString().split('T')[0]); // Auto date
      formData.append('description', faultForm.description);
      formData.append('reported_by', profile?.name || 'Staff');

      const config = getAuthConfig();
      await axios.post(`${API_BASE_URL}/faults/add-fault`, formData, config);
      
      toast.success('Fault reported successfully');
      setFaultForm({
        student_name: '',
        fault_type: 'Late Arrival',
        description: ''
      });
      
      // Refresh fault history if in list view
      if (faultView === 'list') {
        fetchFaultHistory(selectedFaultClass);
      }
    } catch (error) {
      console.error('Error submitting fault:', error);
      toast.error(error.response?.data?.error || 'Failed to report fault');
    } finally {
      setSubmittingFault(false);
    }
  };

  const formatFieldName = (fieldName) => {
    return fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatFieldValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return value.toString();
  };

  const getImageUrl = (filename) => {
    if (!filename) return null;
    return `/api/staff/uploads/${filename}`;
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return styles.statusCompleted;
      case 'pending': return styles.statusPending;
      case 'in_progress': return styles.statusInProgress;
      default: return styles.statusDefault;
    }
  };

  const excludeFields = ['id', 'global_staff_id', 'staff_id', 'image_staff'];
  const profileFields = profile
    ? Object.entries(profile).filter(([key]) => !excludeFields.includes(key))
    : [];

  const renderProfileTab = () => (
    <div className={styles.profileTabContainer}>
      <ProfileHeader
        imageUrl={profile?.image_staff ? getImageUrl(profile.image_staff) : null}
        name={profile?.name || 'Staff Member'}
        subtitle={`${user?.staffType || 'Staff'} • ID: ${profile?.global_staff_id || 'N/A'}`}
        fallbackInitial={profile?.name?.charAt(0) || 'S'}
      />

      <CollapsibleCard 
        title={t('personalInfo') || 'Personal Information'} 
        icon={<FiUser />} 
        defaultExpanded={true}
      >
        <div className="fieldItem">
          <span className="fieldLabel">{t('name') || 'Name'}</span>
          <span className="fieldValue">{profile?.name || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('username') || 'Username'}</span>
          <span className="fieldValue">{user?.username || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('email') || 'Email'}</span>
          <span className="fieldValue">{profile?.email || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('phone') || 'Phone'}</span>
          <span className="fieldValue">{profile?.phone || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('gender') || 'Gender'}</span>
          <span className="fieldValue">{profile?.gender || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('dateOfBirth') || 'Date of Birth'}</span>
          <span className="fieldValue">{profile?.date_of_birth || 'N/A'}</span>
        </div>
      </CollapsibleCard>

      <CollapsibleCard 
        title={t('employmentInfo') || 'Employment Information'} 
        icon={<FiBriefcase />} 
        defaultExpanded={false}
      >
        <div className="fieldItem">
          <span className="fieldLabel">{t('staffType') || 'Staff Type'}</span>
          <span className="fieldValue">{user?.staffType || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('department') || 'Department'}</span>
          <span className="fieldValue">{user?.className || profile?.department || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('position') || 'Position'}</span>
          <span className="fieldValue">{profile?.position || user?.staffType || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('hireDate') || 'Hire Date'}</span>
          <span className="fieldValue">{profile?.hire_date || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('employmentStatus') || 'Employment Status'}</span>
          <span className="fieldValue">{profile?.employment_status || 'Active'}</span>
        </div>
        {isClassTeacher && assignedClass && (
          <div className="fieldItem">
            <span className="fieldLabel">{t('assignedClass') || 'Assigned Class'}</span>
            <span className="fieldValue">{assignedClass}</span>
          </div>
        )}
        <div className="fieldItem">
          <span className="fieldLabel">{t('globalStaffId') || 'Global Staff ID'}</span>
          <span className="fieldValue">{profile?.global_staff_id || 'N/A'}</span>
        </div>
      </CollapsibleCard>

      <CollapsibleCard 
        title={t('salaryInfo') || 'Salary Information'} 
        icon={<FiBarChart2 />} 
        defaultExpanded={false}
      >
        <div className="fieldItem">
          <span className="fieldLabel">{t('baseSalary') || 'Base Salary'}</span>
          <span className="fieldValue">{profile?.base_salary ? `${profile.base_salary} ETB` : 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('allowances') || 'Allowances'}</span>
          <span className="fieldValue">{profile?.allowances ? `${profile.allowances} ETB` : 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('deductions') || 'Deductions'}</span>
          <span className="fieldValue">{profile?.deductions ? `${profile.deductions} ETB` : 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('netSalary') || 'Net Salary'}</span>
          <span className="fieldValue">
            {profile?.base_salary 
              ? `${(parseFloat(profile.base_salary) + parseFloat(profile.allowances || 0) - parseFloat(profile.deductions || 0)).toFixed(2)} ETB`
              : 'N/A'}
          </span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('paymentMethod') || 'Payment Method'}</span>
          <span className="fieldValue">{profile?.payment_method || 'N/A'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('bankAccount') || 'Bank Account'}</span>
          <span className="fieldValue">{profile?.bank_account || 'N/A'}</span>
        </div>
      </CollapsibleCard>

      <CollapsibleCard 
        title={t('attendanceSummary') || 'Attendance Summary'} 
        icon={<FiUserCheck />} 
        defaultExpanded={false}
      >
        <div className="fieldItem">
          <span className="fieldLabel">{t('totalWorkingDays') || 'Total Working Days'}</span>
          <span className="fieldValue">{profile?.total_working_days || '0'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('presentDays') || 'Present Days'}</span>
          <span className="fieldValue">{profile?.present_days || '0'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('absentDays') || 'Absent Days'}</span>
          <span className="fieldValue">{profile?.absent_days || '0'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('lateDays') || 'Late Days'}</span>
          <span className="fieldValue">{profile?.late_days || '0'}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('attendanceRate') || 'Attendance Rate'}</span>
          <span className="fieldValue">
            {profile?.total_working_days && profile?.present_days
              ? `${((profile.present_days / profile.total_working_days) * 100).toFixed(1)}%`
              : 'N/A'}
          </span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('leaveBalance') || 'Leave Balance'}</span>
          <span className="fieldValue">{profile?.leave_balance || '0'} {t('days') || 'days'}</span>
        </div>
      </CollapsibleCard>
    </div>
  );

  // Render evaluation list view
  const renderEvaluationList = () => (
    <div className={styles.evaluationsContainer}>
      <h2 className={styles.tabTitle}>{t('evaluations')}</h2>
      {evaluationsLoading ? (
        <SkeletonLoader type="card" count={3} />
      ) : evaluations.length > 0 ? (
        <div className={styles.evaluationsList}>
          {evaluations.map((evaluation, index) => (
            <div key={`eval-${evaluation.id}-${index}`} className={`${styles.evaluationCard} ${evaluation.status === 'completed' ? styles.evaluationCardCompleted : styles.evaluationCardPending}`}>
              <div className={styles.evaluationHeader}>
                <h3 className={styles.evaluationName}>{evaluation.evaluation_name}</h3>
                <span className={`${styles.statusBadge} ${getStatusColor(evaluation.status)}`}>
                  {evaluation.status}
                </span>
              </div>
              <div className={styles.evaluationDetails}>
                <div className={styles.evaluationDetail}>
                  <span className={styles.detailLabel}>Subject</span>
                  <span className={styles.detailValue}>{evaluation.subject_name}</span>
                </div>
                <div className={styles.evaluationDetail}>
                  <span className={styles.detailLabel}>Class</span>
                  <span className={styles.detailValue}>{evaluation.class_name}</span>
                </div>
                <div className={styles.evaluationDetail}>
                  <span className={styles.detailLabel}>Term</span>
                  <span className={styles.detailValue}>{evaluation.term}</span>
                </div>
              </div>
              <div className={styles.evaluationActions}>
                <button className={`${styles.actionButton} ${styles.fillFormBtn}`} onClick={() => fetchEvaluationForm(evaluation.id)}>
                  <FiEdit /><span>{t('fillForm')}</span>
                </button>
                <button className={`${styles.actionButton} ${styles.viewReportBtn}`} onClick={() => fetchEvaluationReport(evaluation.id)}>
                  <FiEye /><span>{t('viewReport')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <FiClipboard className={styles.emptyIcon} />
          <p>{t('noEvaluations')}</p>
        </div>
      )}
    </div>
  );

  // Render inline evaluation form
  const renderEvaluationForm = () => {
    if (formLoading) {
      return (
        <div className={styles.evaluationsContainer}>
          <SkeletonLoader type="card" count={5} />
        </div>
      );
    }

    if (formError) {
      return (
        <div className={styles.evaluationsContainer}>
          <div className={styles.formErrorState}>
            <FiAlertCircle className={styles.emptyIcon} />
            <p>{formError}</p>
            <button onClick={handleBackToEvaluationList} className={styles.backBtn}>
              <FiArrowLeft /> {t('back')}
            </button>
          </div>
        </div>
      );
    }

    if (!evaluationFormData) return null;

    const evaluation = evaluationFormData.evaluation;

    return (
      <div className={styles.evaluationsContainer}>
        {/* Form Header */}
        <div className={styles.evalFormHeader}>
          <button onClick={handleBackToEvaluationList} className={styles.backBtn}>
            <FiArrowLeft /> {t('back')}
          </button>
          <div className={styles.evalFormTitle}>
            <h2>{evaluation.evaluation_name}</h2>
            <div className={styles.evalFormMeta}>
              <span><FiBook /> {evaluation.subject_name}</span>
              <span><FiUserCheck /> {evaluation.class_name}</span>
              <span><FiCalendar /> {evaluation.term}</span>
            </div>
          </div>
        </div>

        {/* Students List with Scores */}
        <div className={styles.evalFormStudents}>
          {formStudents.length > 0 ? (
            formStudents.map((student, studentIndex) => {
              const totals = calculateStudentTotal(student.student_name);
              const studentKey = `${studentIndex}-${student.student_name}`;
              return (
                <div key={studentKey} className={styles.evalStudentCard}>
                  <div className={styles.evalStudentHeader}>
                    <div className={styles.evalStudentInfo}>
                      <span className={styles.evalStudentNum}>{studentIndex + 1}</span>
                      <div>
                        <h4 className={styles.evalStudentName}>{student.student_name}</h4>
                        <span className={styles.evalStudentDetails}>
                          Age: {student.student_age} | {student.student_gender}
                        </span>
                      </div>
                    </div>
                    <div className={styles.evalStudentTotal}>
                      <FiBarChart2 />
                      <span>{totals.total}/{totals.max}</span>
                    </div>
                  </div>

                  {/* Criteria by Area */}
                  <div className={styles.evalCriteriaList}>
                    {evaluationFormData.areas?.map(area => (
                      <div key={area.id} className={styles.evalAreaSection}>
                        <h5 className={styles.evalAreaName}>{area.area_name}</h5>
                        {area.criteria?.map(criterion => (
                          <div key={criterion.id} className={styles.evalCriterionRow}>
                            <div className={styles.evalCriterionInfo}>
                              <span className={styles.evalCriterionName}>{criterion.criteria_name}</span>
                              <span className={styles.evalCriterionMax}>Max: {criterion.max_points}</span>
                            </div>
                            <div className={styles.evalCriterionInputs}>
                              <select
                                value={scores[student.student_name]?.[criterion.id]?.score || 0}
                                onChange={(e) => updateScore(student.student_name, criterion.id, 'score', e.target.value)}
                                className={styles.evalScoreSelect}
                              >
                                {Array.from({ length: criterion.max_points + 1 }, (_, i) => (
                                  <option key={i} value={i}>{i}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Notes..."
                                value={scores[student.student_name]?.[criterion.id]?.notes || ''}
                                onChange={(e) => updateScore(student.student_name, criterion.id, 'notes', e.target.value)}
                                className={styles.evalNotesInput}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <FiUserCheck className={styles.emptyIcon} />
              <p>No students found for this class</p>
            </div>
          )}
        </div>

        {/* Save Button */}
        {formStudents.length > 0 && (
          <div className={styles.evalFormActions}>
            <button 
              onClick={saveEvaluationScores} 
              className={styles.evalSaveBtn}
              disabled={formSaving}
            > 
              {formSaving ? 'Saving...' : <><FiSave /> Save All Scores</>}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render evaluation report view (read-only)
  const renderEvaluationReport = () => {
    if (reportLoading) {
      return (
        <div className={styles.evaluationsContainer}>
          <div className={styles.reportLoadingHeader}>
            <button onClick={handleBackToEvaluationList} className={styles.backBtnAlt}>
              <FiArrowLeft /> {t('back')}
            </button>
            <span className={styles.loadingText}>Loading report...</span>
          </div>
          <SkeletonLoader type="card" count={5} />
        </div>
      );
    }

    if (reportError) {
      return (
        <div className={styles.evaluationsContainer}>
          <div className={styles.reportLoadingHeader}>
            <button onClick={handleBackToEvaluationList} className={styles.backBtnAlt}>
              <FiArrowLeft /> {t('back')}
            </button>
          </div>
          <div className={styles.formErrorState}>
            <FiAlertCircle className={styles.emptyIcon} />
            <p>{reportError}</p>
          </div>
        </div>
      );
    }

    if (!reportData) return null;

    const evaluation = reportData.evaluation;

    // Calculate totals for each student
    const calculateReportTotal = (student) => {
      let total = 0;
      let max = 0;
      (reportData.areas || []).forEach(area => {
        (area.criteria || []).forEach(criterion => {
          const score = student.scores?.[criterion.id]?.score || 0;
          total += score;
          max += criterion.max_points || 0;
        });
      });
      return { total, max, percentage: max > 0 ? Math.round((total / max) * 100) : 0 };
    };

    return (
      <div className={styles.evaluationsContainer}>
        {/* Fixed Back Button */}
        <div className={styles.fixedBackButtonContainer}>
          <button onClick={handleBackToEvaluationList} className={styles.fixedBackButton}>
            <FiArrowLeft /> Back to Evaluations
          </button>
        </div>
        
        {/* Report Header */}
        <div className={styles.evalReportHeader}>
          <div className={styles.evalReportTitle}>
            <h2>{evaluation.evaluation_name}</h2>
            <span className={styles.evalReportSubtitle}>{t('viewReport')}</span>
            <div className={styles.evalFormMeta}>
              <span><FiBook /> {evaluation.subject_name}</span>
              <span><FiUserCheck /> {evaluation.class_name}</span>
              <span><FiCalendar /> {evaluation.term}</span>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className={styles.evalReportStats}>
          <div className={styles.evalReportStat}>
            <span className={styles.evalReportStatNum}>{reportData.students?.length || 0}</span>
            <small>Students</small>
          </div>
          <div className={styles.evalReportStat}>
            <span className={styles.evalReportStatNum}>
              {reportData.areas?.reduce((sum, area) => sum + (area.criteria?.length || 0), 0) || 0}
            </span>
            <small>Criteria</small>
          </div>
          <div className={styles.evalReportStat}>
            <span className={styles.evalReportStatNum}>
              {reportData.students?.length > 0 
                ? Math.round(reportData.students.reduce((sum, s) => sum + calculateReportTotal(s).percentage, 0) / reportData.students.length)
                : 0}%
            </span>
            <small>Avg Score</small>
          </div>
        </div>

        {/* Students Report */}
        <div className={styles.evalReportStudents}>
          {reportData.students?.length > 0 ? (
            reportData.students.map((student, studentIndex) => {
              const totals = calculateReportTotal(student);
              const studentKey = `report-${studentIndex}-${student.student_name}`;
              return (
                <div key={studentKey} className={styles.evalReportStudentCard}>
                  <div className={styles.evalReportStudentHeader}>
                    <div className={styles.evalStudentInfo}>
                      <span className={styles.evalStudentNum}>{studentIndex + 1}</span>
                      <div>
                        <h4 className={styles.evalStudentName}>{student.student_name}</h4>
                        <span className={styles.evalStudentDetails}>
                          Age: {student.student_age} | {student.student_gender}
                        </span>
                      </div>
                    </div>
                    <div className={`${styles.evalReportScore} ${totals.percentage >= 70 ? styles.scoreGood : totals.percentage >= 50 ? styles.scoreAvg : styles.scoreLow}`}>
                      <span className={styles.evalReportScoreNum}>{totals.total}/{totals.max}</span>
                      <span className={styles.evalReportScorePercent}>{totals.percentage}%</span>
                    </div>
                  </div>

                  {/* Criteria Scores */}
                  <div className={styles.evalReportCriteria}>
                    {reportData.areas?.map(area => (
                      <div key={area.id} className={styles.evalReportArea}>
                        <h5 className={styles.evalReportAreaName}>{area.area_name}</h5>
                        <div className={styles.evalReportCriteriaList}>
                          {area.criteria?.map(criterion => {
                            const scoreData = student.scores?.[criterion.id];
                            const score = scoreData?.score || 0;
                            const scorePercent = criterion.max_points > 0 ? Math.round((score / criterion.max_points) * 100) : 0;
                            return (
                              <div key={criterion.id} className={styles.evalReportCriterionRow}>
                                <div className={styles.evalReportCriterionInfo}>
                                  <span className={styles.evalReportCriterionName}>{criterion.criteria_name}</span>
                                  <div className={styles.evalReportScoreBar}>
                                    <div 
                                      className={`${styles.evalReportScoreBarFill} ${scorePercent >= 70 ? styles.barGood : scorePercent >= 50 ? styles.barAvg : styles.barLow}`}
                                      style={{ width: `${scorePercent}%` }}
                                    />
                                  </div>
                                </div>
                                <span className={styles.evalReportCriterionScore}>
                                  {score}/{criterion.max_points}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Notes if any */}
                        {area.criteria?.some(c => student.scores?.[c.id]?.notes) && (
                          <div className={styles.evalReportNotes}>
                            {area.criteria.map(criterion => {
                              const notes = student.scores?.[criterion.id]?.notes;
                              if (!notes) return null;
                              return (
                                <div key={`note-${criterion.id}`} className={styles.evalReportNote}>
                                  <strong>{criterion.criteria_name}:</strong> {notes}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <FiUserCheck className={styles.emptyIcon} />
              <p>No student data available</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Main evaluations tab renderer
  const renderEvaluationsTab = () => {
    if (evaluationView === 'form') {
      return renderEvaluationForm();
    }
    if (evaluationView === 'report') {
      return renderEvaluationReport();
    }
    return renderEvaluationList();
  };

  const renderPostsTab = () => (
    <div className={styles.feedContainer}>
      {postsLoading ? (
        <SkeletonLoader type="card" count={3} />
      ) : profilePosts.length > 0 ? (
        <div className={styles.postsFeed}>
          {profilePosts.map(post => <PostCard key={post.id} post={post} onLike={handleLike} />)}
        </div>
      ) : (
        <div className={styles.emptyFeed}>
          <div className={styles.emptyFeedIcon}>
            <FiFileText />
          </div>
          <h3>No Posts Yet</h3>
          <p>When there are posts for you, they'll show up here.</p>
        </div>
      )}
    </div>
  );

  const renderCommunicationsTab = () => {
    // Navigate to the dedicated chat page
    const handleOpenChat = () => {
      navigate('/app/teacher-chat');
    };

    return (
      <div className={styles.communicationsContainer}>
        <div className={styles.chatRedirectCard}>
          <div className={styles.chatRedirectIcon}>
            <FiMessageSquare />
          </div>
          <h2 className={styles.chatRedirectTitle}>Messages & Communications</h2>
          <p className={styles.chatRedirectText}>
            Connect with guardians, students, and staff members through our real-time chat system.
          </p>
          <button className={styles.chatRedirectBtn} onClick={handleOpenChat}>
            <FiMessageSquare /> Open Chat
          </button>
        </div>
      </div>
    );
  };

  // Day number to name mapping for schedule display
  const dayNumberToLabel = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
  const dayFullNames = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };

  // Get unique periods and days from schedule
  const getScheduleGrid = () => {
    const periods = [...new Set(teacherSchedule.map(s => s.period))].sort((a, b) => a - b);
    const days = [...new Set(teacherSchedule.map(s => s.day))].sort((a, b) => a - b);
    return { periods, days };
  };

  // Get slot for specific day and period
  const getSlotForDayPeriod = (day, period) => {
    return teacherSchedule.find(s => s.day === day && s.period === period);
  };

  // Get shift label
  const getShiftLabel = (shift) => {
    if (shift === 1) return 'Morning Shift';
    if (shift === 2) return 'Afternoon Shift';
    return `Shift ${shift}`;
  };

  // Get unique shifts from schedule
  const getUniqueShifts = () => {
    return [...new Set(teacherSchedule.map(s => s.shift))].filter(Boolean).sort();
  };

  // Group schedule by shift
  const getScheduleByShift = () => {
    const byShift = {};
    teacherSchedule.forEach(slot => {
      const shiftKey = slot.shift || 1;
      if (!byShift[shiftKey]) {
        byShift[shiftKey] = [];
      }
      byShift[shiftKey].push(slot);
    });
    return byShift;
  };

  const renderScheduleTab = () => {
    const { periods, days } = getScheduleGrid();
    const totalPeriods = teacherSchedule.length;
    const totalDays = days.length;
    const shifts = getUniqueShifts();
    const scheduleByShift = getScheduleByShift();

    return (
      <div className={styles.scheduleContainer}>
        <h2 className={styles.tabTitle}>{t('mySchedule')}</h2>
        
        {scheduleLoading ? (
          <SkeletonLoader type="card" count={5} />
        ) : teacherSchedule.length > 0 ? (
          <>
            {/* Summary Stats */}
            <div className={styles.scheduleStats}>
              <div className={styles.scheduleStat}>
                <span className={styles.scheduleStatNum}>{totalPeriods}</span>
                <small>Total Periods</small>
              </div>
              <div className={styles.scheduleStat}>
                <span className={styles.scheduleStatNum}>{totalDays}</span>
                <small>Days/Week</small>
              </div>
              <div className={styles.scheduleStat}>
                <span className={styles.scheduleStatNum}>{shifts.length}</span>
                <small>Shift(s)</small>
              </div>
            </div>

            {/* Schedule grouped by Shift */}
            {shifts.map(shift => {
              const shiftSlots = scheduleByShift[shift] || [];
              const shiftDays = [...new Set(shiftSlots.map(s => s.day))].sort();
              const shiftPeriods = [...new Set(shiftSlots.map(s => s.period))].sort((a, b) => a - b);
              
              return (
                <div key={shift} className={styles.shiftSection}>
                  {/* Shift Header */}
                  <div className={`${styles.shiftHeader} ${shift === 2 ? styles.shiftHeader2 : styles.shiftHeader1}`}>
                    <FiClock />
                    <span>{getShiftLabel(shift)}</span>
                    <span className={styles.shiftPeriodCount}>{shiftSlots.length} periods</span>
                  </div>

                  {/* Timetable Grid for this shift */}
                  <div className={styles.timetableWrapper}>
                    <div className={styles.timetableGrid}>
                      {/* Header Row - Periods */}
                      <div className={`${styles.timetableHeader} ${shift === 2 ? styles.timetableHeader2 : ''}`}>
                        <div className={styles.timetableCorner}>Day</div>
                        {shiftPeriods.map(period => (
                          <div key={period} className={styles.timetablePeriodHeader}>
                            P{period}
                          </div>
                        ))}
                      </div>

                      {/* Day Rows */}
                      {shiftDays.map(day => (
                        <div key={day} className={styles.timetableRow}>
                          <div className={styles.timetableDayCell}>
                            {dayNumberToLabel[day]}
                          </div>
                          {shiftPeriods.map(period => {
                            const slot = shiftSlots.find(s => s.day === day && s.period === period);
                            return (
                              <div key={period} className={`${styles.timetableCell} ${slot ? (shift === 2 ? styles.timetableCellShift2 : styles.timetableCellFilled) : ''}`}>
                                {slot ? (
                                  <>
                                    <span className={styles.cellClass}>{slot.class}</span>
                                    <span className={styles.cellSubject}>{slot.subject}</span>
                                  </>
                                ) : (
                                  <span className={styles.cellEmpty}>-</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detailed List for this shift */}
                  <div className={styles.scheduleList}>
                    {shiftDays.map(day => {
                      const daySlots = shiftSlots.filter(s => s.day === day).sort((a, b) => a.period - b.period);
                      if (daySlots.length === 0) return null;
                      return (
                        <div key={day} className={styles.scheduleDayCard}>
                          <div className={`${styles.scheduleDayHeader} ${shift === 2 ? styles.scheduleDayHeader2 : ''}`}>
                            <FiCalendar />
                            <span>{dayFullNames[day]}</span>
                            <span className={styles.dayPeriodCount}>{daySlots.length} periods</span>
                          </div>
                          <div className={styles.schedulePeriods}>
                            {daySlots.map((slot, idx) => (
                              <div key={idx} className={styles.schedulePeriodItem}>
                                <div className={`${styles.periodNumber} ${shift === 2 ? styles.periodNumber2 : ''}`}>P{slot.period}</div>
                                <div className={styles.periodDetails}>
                                  <span className={styles.periodClass}>{slot.class}</span>
                                  <span className={styles.periodSubject}>{slot.subject}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className={styles.emptyState}>
            <FiCalendar className={styles.emptyIcon} />
            <p>No schedule assigned yet</p>
            <small>Your teaching schedule will appear here once assigned</small>
          </div>
        )}
      </div>
    );
  };

  // Render Mark List Tab
  const renderMarkListTab = () => {
    const subjects = getMarkListSubjects();
    const classes = getMarkListClasses();
    const terms = getMarkListTerms();
    const availableComponents = getAvailableComponents();
    const progress = getMarkListProgress();
    
    // Filter students by search query
    const filteredMarkListData = markListData.filter(student =>
      student.student_name?.toLowerCase().includes(markListSearchQuery.toLowerCase())
    );

    // Calculate class average
    const classAverage = markListData.length > 0 
      ? (markListData.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0) / markListData.length).toFixed(2)
      : '';

    return (
      <div className={styles.markListContainer}>
        {/* Header */}
        <div className={styles.markListHeader}>
          <div className={styles.markListHeaderLeft}>
            <div className={styles.markListIconWrapper}>
              <FiList />
            </div>
            <div>
              <h2 className={styles.markListTitle}>Mark List</h2>
              <p className={styles.markListSubtitle}>Manage student grades</p>
            </div>
          </div>
        </div>
        
        {markListLoading && !markListData.length ? (
          <SkeletonLoader type="card" count={3} />
        ) : teacherAssignments.length === 0 ? (
          <div className={styles.emptyState}>
            <FiList className={styles.emptyIcon} />
            <p>No mark lists assigned</p>
            <small>You will see your assigned mark lists here once the admin assigns you to subjects</small>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            {markListData.length > 0 && (
              <div className={styles.markListStatsGrid}>
                <div className={styles.markListStatCard}>
                  <div className={styles.markListStatIcon} style={{ background: 'rgba(40, 167, 69, 0.1)' }}>
                    <FiUsers style={{ color: '#28a745' }} />
                  </div>
                  <div className={styles.markListStatInfo}>
                    <div className={styles.markListStatValue}>{markListData.length}</div>
                    <div className={styles.markListStatLabel}>Total</div>
                  </div>
                </div>

                <div className={styles.markListStatCard}>
                  <div className={styles.markListStatIcon} style={{ background: 'rgba(0, 123, 255, 0.1)' }}>
                    <FiCheck style={{ color: '#007bff' }} />
                  </div>
                  <div className={styles.markListStatInfo}>
                    <div className={styles.markListStatValue}>{progress.completed}</div>
                    <div className={styles.markListStatLabel}>Completed</div>
                  </div>
                </div>

                <div className={styles.markListStatCard}>
                  <div className={styles.markListStatIcon} style={{ background: 'rgba(255, 193, 7, 0.1)' }}>
                    <FiEdit2 style={{ color: '#ffc107' }} />
                  </div>
                  <div className={styles.markListStatInfo}>
                    <div className={styles.markListStatValue}>{markListData.length - progress.completed}</div>
                    <div className={styles.markListStatLabel}>Pending</div>
                  </div>
                </div>

                <div className={styles.markListStatCard}>
                  <div className={styles.markListStatIcon} style={{ background: 'rgba(230, 126, 34, 0.1)' }}>
                    <FiUsers style={{ color: '#e67e22' }} />
                  </div>
                  <div className={styles.markListStatInfo}>
                    <div className={styles.markListStatValue}>{classAverage && parseFloat(classAverage) > 0 ? `${classAverage}%` : ''}</div>
                    <div className={styles.markListStatLabel}>Average</div>
                  </div>
                </div>
              </div>
            )}

            {/* Filter Controls */}
            <div className={styles.markListFilters}>
              <div className={styles.filterGroup}>
                <label>Subject</label>
                <select 
                  value={selectedMarkListSubject} 
                  onChange={(e) => {
                    setSelectedMarkListSubject(e.target.value);
                    setSelectedMarkListClass('');
                    setSelectedMarkListTerm(1);
                    setMarkListData([]);
                    setMarkListConfig(null);
                  }}
                >
                  <option value="">Select Subject</option>
                  {subjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              
              <div className={styles.filterGroup}>
                <label>Class</label>
                <select 
                  value={selectedMarkListClass} 
                  onChange={(e) => {
                    setSelectedMarkListClass(e.target.value);
                    setSelectedMarkListTerm(1);
                    setMarkListData([]);
                    setMarkListConfig(null);
                  }}
                  disabled={!selectedMarkListSubject}
                >
                  <option value="">Select Class</option>
                  {classes.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              
              <div className={styles.filterGroup}>
                <label>Term</label>
                <select 
                  value={selectedMarkListTerm} 
                  onChange={(e) => {
                    setSelectedMarkListTerm(parseInt(e.target.value));
                    setMarkListData([]);
                    setSelectedMarkComponent(''); // Reset component selection
                  }}
                  disabled={!selectedMarkListClass}
                >
                  {terms.length > 0 ? terms.map(term => (
                    <option key={term} value={term}>Term {term}</option>
                  )) : (
                    <option value="">No terms available</option>
                  )}
                </select>
              </div>
              
              <div className={styles.filterGroup}>
                <label>Test</label>
                <select 
                  value={selectedMarkComponent} 
                  onChange={(e) => setSelectedMarkComponent(e.target.value)}
                  disabled={!selectedMarkListTerm || availableComponents.length === 0}
                >
                  <option value="">All Components</option>
                  {availableComponents.map(component => (
                    <option key={component.name} value={component.name}>{component.name}</option>
                  ))}
                </select>
              </div>
              
              <button 
                className={styles.loadMarkListBtn}
                onClick={loadMarkListData}
                disabled={!selectedMarkListSubject || !selectedMarkListClass || !terms.length || markListLoading}
              >
                {markListLoading ? 'Loading...' : 'Load'}
              </button>
            </div>

            {/* Mark List Content */}
            {markListData.length > 0 && markListConfig && (
              <>
                {/* Search and Progress */}
                <div className={styles.markListSearchSection}>
                  <div className={styles.markListSearchBox}>
                    <FiSearch className={styles.searchIcon} />
                    <input
                      type="text"
                      placeholder="Search by name..."
                      value={markListSearchQuery}
                      onChange={(e) => setMarkListSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <div className={styles.markListProgressInfo}>
                    <div className={styles.markListProgressBar}>
                      <div 
                        className={styles.markListProgressFill} 
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                    <span className={styles.markListProgressText}>{progress.completed}/{progress.total} completed</span>
                  </div>
                </div>

                {/* Student Cards - Compact Horizontal Layout */}
                <div className={styles.markListStudents}>
                  {filteredMarkListData.map((student, idx) => {
                    const isAdmin = user?.staffType?.toLowerCase() === 'admin';
                    // Lock student if they have any saved marks (non-zero values)
                    const hasAnyMarks = markListConfig.mark_components.some(component => {
                      const componentKey = component.name.toLowerCase().replace(/\s+/g, '_');
                      return student[componentKey] && parseFloat(student[componentKey]) > 0;
                    });
                    const isLocked = hasAnyMarks && !isAdmin;
                    
                    // Filter components based on selection
                    const componentsToShow = selectedMarkComponent 
                      ? markListConfig.mark_components.filter(c => c.name === selectedMarkComponent)
                      : markListConfig.mark_components;
                    
                    return (
                    <div key={student.id} style={{background:'white',borderRadius:'10px',padding:'0.5rem 0.6rem',marginBottom:'0.4rem',boxShadow:'0 1px 4px rgba(99,102,241,0.06)',border:'1px solid #e0e7ff',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                      {/* Number + Name */}
                      <div style={{display:'flex',alignItems:'center',gap:'0.3rem',flex:1,minWidth:0}}>
                        <div style={{width:'24px',height:'24px',borderRadius:'50%',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:'0.7rem',flexShrink:0}}>{idx+1}</div>
                        <span style={{fontWeight:600,fontSize:'0.78rem',color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{student.student_name}</span>
                      </div>
                      
                      {/* Mark inputs - compact horizontal */}
                      {componentsToShow.map(component => {
                        const componentKey = component.name.toLowerCase().replace(/\s+/g, '_');
                        // Only lock if this student has been saved before (is in savedMarkStudents Set)
                        const inputIsLocked = savedMarkStudents.has(student.id) && !isAdmin;
                        
                        return (
                          <div key={component.name} style={{display:'flex',alignItems:'center',gap:'0.2rem',flexShrink:0}}>
                            <span style={{fontSize:'0.6rem',color:'#64748b',fontWeight:600,textTransform:'uppercase'}}>{component.name}</span>
                            <input
                              type="number"
                              min="0"
                              max={component.percentage}
                              value={student[componentKey] === '' ? '' : (parseFloat(student[componentKey]) === 0 ? '' : student[componentKey])}
                              onChange={(e) => handleMarkListMarkChange(student.id, componentKey, e.target.value)}
                              disabled={inputIsLocked}
                              placeholder="0"
                              style={{width:'40px',padding:'0.2rem 0.1rem',borderRadius:'6px',border:'1px solid',borderColor:parseFloat(student[componentKey])>0?'#6366f1':'#cbd5e1',background:inputIsLocked?'#f1f5f9':parseFloat(student[componentKey])>0?'#eef2ff':'white',color:'#1e293b',fontSize:'0.75rem',fontWeight:600,textAlign:'center',outline:'none',cursor:inputIsLocked?'not-allowed':'text'}}
                            />
                            <span style={{fontSize:'0.7rem',color:'#1e293b',fontWeight:700}}>/{component.percentage}</span>
                          </div>
                        );
                      })}
                      
                      {/* Status indicator */}
                      {isLocked && (
                        <div style={{width:'28px',height:'28px',color:'#16a34a',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <FiCheckCircle size={14}/>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                {/* Save All Button */}
                <div style={{marginTop:'1rem',display:'flex',justifyContent:'center'}}>
                  <button 
                    onClick={saveAllStudentMarks} 
                    disabled={savingMarks}
                    style={{
                      padding:'0.75rem 2rem',
                      background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      color:'white',
                      border:'none',
                      borderRadius:'10px',
                      fontWeight:700,
                      fontSize:'0.9rem',
                      cursor:savingMarks?'not-allowed':'pointer',
                      display:'flex',
                      alignItems:'center',
                      gap:'0.5rem',
                      boxShadow:'0 4px 12px rgba(99,102,241,0.3)',
                      transition:'all 0.2s',
                      opacity:savingMarks?0.6:1
                    }}
                  >
                    <FiSave size={18}/>
                    {savingMarks ? 'Saving...' : 'Save All Marks'}
                  </button>
                </div>
              </>
            )}

            {markListMessage && (
              <div className={styles.markListMessage}>{markListMessage}</div>
            )}

            {/* Mark list not found - show create option */}
            {!markListLoading && markListData.length === 0 && markListMessage && selectedMarkListSubject && selectedMarkListClass && (
              <MarkListCreateInline
                subject={selectedMarkListSubject}
                className={selectedMarkListClass}
                term={selectedMarkListTerm}
                onCreated={() => { setMarkListMessage(''); loadMarkListData(); }}
              />
            )}
          </>
        )}
      </div>
    );
  };

  // Calculate attendance stats for selected day
  const attendanceStats = {
    total: students.length,
    present: Object.values(attendanceRecords).filter(r => r[selectedDay] === 'P').length,
    absent: Object.values(attendanceRecords).filter(r => r[selectedDay] === 'A').length,
    late: Object.values(attendanceRecords).filter(r => r[selectedDay] === 'L').length,
    permission: Object.values(attendanceRecords).filter(r => r[selectedDay] === 'E').length
  };

  // Check if current week attendance exists
  const currentWeekExists = weeklyTables.includes(`week_${currentWeekMonday.replace(/-/g, '_')}`);
  
  // Check if next week attendance exists
  const nextWeekMonday = getNextWeekMonday();
  const nextWeekExists = weeklyTables.includes(`week_${nextWeekMonday.replace(/-/g, '_')}`);

  // Calculate weekly report for a student
  const getStudentWeeklyReport = (studentKey) => {
    const record = attendanceRecords[studentKey] || {};
    let present = 0, absent = 0, late = 0, permission = 0;
    schoolDays.forEach(day => {
      if (record[day] === 'P') present++;
      else if (record[day] === 'A') absent++;
      else if (record[day] === 'L') late++;
      else if (record[day] === 'E') permission++;
    });
    const total = schoolDays.length;
    const attendanceRate = total > 0 ? Math.round(((present + late * 0.5 + permission * 0.75) / total) * 100) : 0;
    return { present, absent, late, permission, total, attendanceRate };
  };

  // Get status icon
  const getStatusIcon = (status) => {
    if (status === 'P') return <span className={styles.statusIconP}>✓</span>;
    if (status === 'A') return <span className={styles.statusIconA}>✗</span>;
    if (status === 'L') return <span className={styles.statusIconL}>◐</span>;
    if (status === 'E') return <span className={styles.statusIconE}>F</span>;
    return <span className={styles.statusIconEmpty}>-</span>;
  };

  const renderAttendanceTab = () => {
    const getStudentStatus = (student) => {
      const key = `${student.school_id}-${student.class_id}`;
      const record = attendanceRecords[key];
      return record?.[selectedDay] || '';
    };

    const markStudent = (student, status) => {
      const key = `${student.school_id}-${student.class_id}`;
      handleAttendanceStatusChange(key, selectedDay, status);
    };

    const anyUnsaved = students.some(s => {
      const key = `${s.school_id}-${s.class_id}`;
      return attendanceRecords[key]?.[selectedDay];
    });

    const handleClassChange = (newClass) => {
      if (newClass === assignedClass) return;
      setAssignedClass(newClass);
      setStudents([]);
      setAttendanceRecords({});
      fetchStudentsForAttendance(newClass);
    };

    return (
      <div className={styles.modernAttendanceContainer}>
        {/* Header Card */}
        <div className={styles.attendanceHeader}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <FiUserCheck size={24} />
            </div>
            <div className={styles.headerText}>
              <h2>Student Attendance</h2>
              {teacherClasses.length > 1 ? (
                <select
                  className={styles.classSelector}
                  value={assignedClass || ''}
                  onChange={(e) => handleClassChange(e.target.value)}
                >
                  {teacherClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              ) : (
                <p>{assignedClass || 'No class assigned'}</p>
              )}
            </div>
          </div>
          <div className={styles.headerDate}>
            <FiCalendar size={18} />
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            {ethiopianToday && (
              <span className={styles.ethDateBadge}>
                {ethMonthNames[ethiopianToday.month - 1]} {ethiopianToday.day}, {ethiopianToday.year}
              </span>
            )}
          </div>
        </div>

        {/* Quick Stats Cards - compact row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.4rem', marginBottom:'0.75rem', width:'100%' }}>
          {[
            { label:'Total', value: students.length, bg:'linear-gradient(135deg,#667eea,#764ba2)', icon:<FiUsers size={14}/> },
            { label:'Present', value: Object.values(attendanceRecords).filter(r=>r[selectedDay]==='P').length, bg:'linear-gradient(135deg,#f093fb,#f5576c)', icon:<FiCheckCircle size={14}/> },
            { label:'Late', value: Object.values(attendanceRecords).filter(r=>r[selectedDay]==='L').length, bg:'linear-gradient(135deg,#4facfe,#00f2fe)', icon:<FiClock size={14}/> },
            { label:'Absent', value: Object.values(attendanceRecords).filter(r=>r[selectedDay]==='A').length, bg:'linear-gradient(135deg,#fa709a,#fee140)', icon:<FiXCircle size={14}/> },
          ].map(s => (
            <div key={s.label} style={{ background:'white', borderRadius:'12px', padding:'0.5rem 0.3rem', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.2rem', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', minWidth:0 }}>
              <div style={{ width:'30px', height:'30px', borderRadius:'8px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', color:'white', flexShrink:0 }}>{s.icon}</div>
              <span style={{ fontSize:'0.58rem', color:'#64748b', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px', textAlign:'center' }}>{s.label}</span>
              <span style={{ fontSize:'1.2rem', fontWeight:700, color:'#1e293b', lineHeight:1 }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Day selector + Mark All + Save */}
        <div style={{ background:'white', borderRadius:'14px', padding:'0.6rem 0.75rem', marginBottom:'0.75rem', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display:'flex', gap:'0.25rem', marginBottom:'0.5rem' }}>
            {schoolDays.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                style={{
                  flex:1, padding:'0.35rem 0.2rem', borderRadius:'10px', border: selectedDay===day ? 'none' : '1.5px solid #e0e0e0',
                  background: selectedDay===day ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#f8f9fa',
                  color: selectedDay===day ? 'white' : '#666', fontWeight:600, fontSize:'0.7rem',
                  cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.1rem', transition:'all 0.2s'
                }}
              >
                <span>{day.charAt(0).toUpperCase() + day.slice(1,3)}</span>
                {weekEthiopianDates[day] && (
                  <span style={{ fontSize:'0.55rem', opacity:0.85 }}>{formatEthiopianShort(weekEthiopianDates[day])}</span>
                )}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button className={styles.markAllBtn} style={{ flex:1, fontSize:'0.78rem', padding:'0.4rem' }} onClick={() => markAllAs('P')}>All Present</button>
          </div>
        </div>

        {/* Students List */}
        <div className={styles.studentsSection} style={{padding:'1rem 0.75rem'}}>
          <div className={styles.sectionHeader}>
            <h3><FiUsers size={18} /> Students List</h3>
            <span className={styles.badge}>{students.length} students</span>
          </div>

          {!weeklyAttendanceExists && (
            <div className={styles.noWeekBanner}>
              <FiAlertCircle size={16} />
              <span>No attendance sheet for this week. </span>
              <button onClick={() => createWeeklyAttendance()} disabled={creatingAttendance} className={styles.createWeekBtn}>
                {creatingAttendance ? 'Creating...' : 'Create Now'}
              </button>
            </div>
          )}

          {students.length === 0 ? (
            <div className={styles.emptyState}>
              <FiUsers size={48} />
              <h3>No Students Found</h3>
              <p>There are no students in {assignedClass || 'this class'}</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'0.5rem',padding:'0 0.25rem'}}>
              {students.map((student, index) => {
                const status = getStudentStatus(student);
                const num = index + 1;
                return (
                  <div key={student.student_id || index} style={{display:'flex',flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:'0.6rem 0.8rem',background:'linear-gradient(135deg,#f8faff,#f0f4ff)',borderRadius:'14px',border:'1.5px solid #e0e7ff',gap:'0.75rem',boxShadow:'0 1px 4px rgba(99,102,241,0.08)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flex:1,minWidth:0}}>
                      <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'0.7rem',fontWeight:700,flexShrink:0}}>{num}</div>
                      <span style={{fontSize:'0.84rem',fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textShadow:'none',WebkitTextFillColor:'#1e293b'}}>{student.student_name}</span>
                    </div>
                    <select
                      value={status || ''}
                      onChange={(e) => markStudent(student, e.target.value)}
                      style={{
                        flexShrink:0,
                        padding:'0.3rem 0.5rem',
                        borderRadius:'8px',
                        border:'1.5px solid',
                        borderColor: status==='P'?'#22c55e':status==='L'?'#f59e0b':status==='A'?'#ef4444':status==='E'?'#8b5cf6':'#cbd5e1',
                        background: status==='P'?'#dcfce7':status==='L'?'#fef3c7':status==='A'?'#fee2e2':status==='E'?'#ede9fe':'white',
                        color: status==='P'?'#16a34a':status==='L'?'#d97706':status==='A'?'#dc2626':status==='E'?'#7c3aed':'#64748b',
                        fontSize:'0.78rem',
                        fontWeight:600,
                        cursor:'pointer',
                        outline:'none',
                        minWidth:'90px'
                      }}
                    >
                      <option value=''>— Select —</option>
                      <option value='P'>✓ Present</option>
                      <option value='L'>⏰ Late</option>
                      <option value='A'>✗ Absent</option>
                      <option value='E'>F Excuse</option>
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderEvalBookTab = () => {
    // Show form view
    if (evalBookView === 'form') {
      return (
        <div className={styles.evalBookContainer}>
          {/* Header with back button */}
          <div className={styles.evalFormHeader}>
            <button className={styles.evalBackBtn} onClick={backToEvalBookList}>
              <FiArrowLeft /> {t('back') || 'Back'}
            </button>
            <div className={styles.evalFormTitle}>
              <h3>{selectedEvalClass}</h3>
              <span>{evalDate}</span>
            </div>
          </div>

          {evalFormError && (
            <div className={styles.evalFormError}>
              <FiAlertCircle /> {evalFormError}
            </div>
          )}
          {evalFormSuccess && (
            <div className={styles.evalFormSuccess}>
              <FiCheck /> {evalFormSuccess}
            </div>
          )}

          {evalFormLoading ? (
            <div style={{ padding: '0 16px' }}>
              <SkeletonLoader type="card" count={5} />
            </div>
          ) : !evalTemplate ? (
            <div className={styles.emptyState}>
              <FiAlertCircle className={styles.emptyIcon} />
              <p>{t('noTemplate') || 'No evaluation template found'}</p>
              <small>{t('contactAdmin') || 'Contact administrator to set up a template'}</small>
            </div>
          ) : (
            <>
              {/* Date selector */}
              <div className={styles.evalDatePicker}>
                <label><FiCalendar /> {t('evaluationDate') || 'Date'}:</label>
                <input 
                  type="date" 
                  value={evalDate} 
                  onChange={(e) => setEvalDate(e.target.value)}
                />
              </div>

              {/* Student evaluations */}
              <div className={styles.evalStudentsList}>
                {evalStudents.map((student, idx) => (
                  <CollapsibleCard 
                    key={student.student_name} 
                    title={`${idx + 1}. ${student.student_name}`} 
                    icon={<FiUser />}
                    defaultExpanded={idx === 0}
                  >
                    <div className={styles.evalFieldsList}>
                      {evalTemplate.fields?.filter(f => !f.is_guardian_field).map(field => (
                        <div key={field.id} className={styles.evalFieldItem}>
                          <label className={styles.evalFieldLabel}>
                            {field.field_name}
                            {field.required && <span className={styles.required}>*</span>}
                          </label>
                          
                          {field.field_type === 'rating' ? (
                            <div className={styles.evalRating}>
                              {[...Array(field.max_rating || 5)].map((_, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  className={`${styles.evalStar} ${(evalEntries[student.student_name]?.field_values?.[field.id] || 0) > i ? styles.evalStarActive : ''}`}
                                  onClick={() => handleEvalFieldChange(student.student_name, field.id, i + 1)}
                                >
                                  <FiStar />
                                </button>
                              ))}
                              <span className={styles.evalRatingValue}>
                                {evalEntries[student.student_name]?.field_values?.[field.id] || 0}/{field.max_rating || 5}
                              </span>
                            </div>
                          ) : field.field_type === 'textarea' ? (
                            <textarea
                              className={styles.evalTextarea}
                              value={evalEntries[student.student_name]?.field_values?.[field.id] || ''}
                              onChange={(e) => handleEvalFieldChange(student.student_name, field.id, e.target.value)}
                              placeholder={`Enter ${field.field_name.toLowerCase()}...`}
                              rows={3}
                            />
                          ) : field.field_type === 'number' ? (
                            <input
                              type="number"
                              className={styles.evalInput}
                              value={evalEntries[student.student_name]?.field_values?.[field.id] || ''}
                              onChange={(e) => handleEvalFieldChange(student.student_name, field.id, e.target.value)}
                              placeholder={`Enter ${field.field_name.toLowerCase()}...`}
                            />
                          ) : field.field_type === 'date' ? (
                            <input
                              type="date"
                              className={styles.evalInput}
                              value={evalEntries[student.student_name]?.field_values?.[field.id] || ''}
                              onChange={(e) => handleEvalFieldChange(student.student_name, field.id, e.target.value)}
                            />
                          ) : field.field_type === 'select' ? (
                            <select
                              className={styles.evalSelect}
                              value={evalEntries[student.student_name]?.field_values?.[field.id] || ''}
                              onChange={(e) => handleEvalFieldChange(student.student_name, field.id, e.target.value)}
                            >
                              <option value="">Select {field.field_name.toLowerCase()}...</option>
                              {(field.options || []).map((opt, optIdx) => (
                                <option key={optIdx} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.field_type === 'multi-select' ? (
                            <div className={styles.evalMultiSelect}>
                              {(field.options || []).map((opt, optIdx) => {
                                const currentValues = evalEntries[student.student_name]?.field_values?.[field.id] || [];
                                const isChecked = Array.isArray(currentValues) ? currentValues.includes(opt) : false;
                                return (
                                  <label key={optIdx} className={styles.evalMultiOption}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const current = Array.isArray(currentValues) ? [...currentValues] : [];
                                        if (e.target.checked) {
                                          current.push(opt);
                                        } else {
                                          const idx = current.indexOf(opt);
                                          if (idx > -1) current.splice(idx, 1);
                                        }
                                        handleEvalFieldChange(student.student_name, field.id, current);
                                      }}
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : field.field_type === 'checkbox' ? (
                            <label className={styles.evalCheckbox}>
                              <input
                                type="checkbox"
                                checked={evalEntries[student.student_name]?.field_values?.[field.id] || false}
                                onChange={(e) => handleEvalFieldChange(student.student_name, field.id, e.target.checked)}
                              />
                              <span>{field.field_name}</span>
                            </label>
                          ) : field.field_type === 'upload' ? (
                            <div className={styles.evalUpload}>
                              <input
                                type="file"
                                className={styles.evalFileInput}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleEvalFieldChange(student.student_name, field.id, file.name);
                                  }
                                }}
                              />
                              {evalEntries[student.student_name]?.field_values?.[field.id] && (
                                <span className={styles.evalFileName}>
                                  {evalEntries[student.student_name]?.field_values?.[field.id]}
                                </span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              className={styles.evalInput}
                              value={evalEntries[student.student_name]?.field_values?.[field.id] || ''}
                              onChange={(e) => handleEvalFieldChange(student.student_name, field.id, e.target.value)}
                              placeholder={`Enter ${field.field_name.toLowerCase()}...`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleCard>
                ))}
              </div>

              {/* Action button */}
              <div className={styles.evalBookActions}>
                <button 
                  className={styles.evalBookSubmitBtn}
                  onClick={() => saveEvalEntries(true)}
                  disabled={evalFormSaving}
                >
                  <FiSend /> {evalFormSaving ? t('sending') || 'Sending...' : t('saveAndSend') || 'Save & Send'}
                </button>
              </div>
            </>
          )}
        </div>
      );
    }

    // Show reports view
    if (evalBookView === 'reports') {
      return (
        <div className={styles.evalBookContainer}>
          <div className={styles.evalFormHeader}>
            <button className={styles.evalBackBtn} onClick={backToEvalBookList}>
              <FiArrowLeft /> {t('back') || 'Back'}
            </button>
            <div className={styles.evalFormTitle}>
              <h3>{t('evalReports') || 'Evaluation Reports'}</h3>
            </div>
          </div>

          {evalReportsLoading ? (
            <div style={{ padding: '0 16px' }}>
              <SkeletonLoader type="card" count={5} />
            </div>
          ) : evalReports.length === 0 ? (
            <div className={styles.emptyState}>
              <FiFileText className={styles.emptyIcon} />
              <p>{t('noReports') || 'No evaluation reports yet'}</p>
            </div>
          ) : (
            <div className={styles.evalReportsList}>
              {evalReports.map((report) => (
                <div key={report.id} className={styles.evalReportCard} onClick={() => setSelectedEvalReport(report)}>
                  <div className={styles.evalReportHeader}>
                    <span className={styles.evalReportStudent}>{report.student_name}</span>
                    <span className={`${styles.evalReportStatus} ${report.status === 'responded' ? styles.statusResponded : styles.statusPending}`}>
                      {report.status === 'responded' ? 'Responded' : 'Pending'}
                    </span>
                  </div>
                  <div className={styles.evalReportMeta}>
                    <span><FiUsers /> {report.class_name}</span>
                    <span><FiCalendar /> {new Date(report.evaluation_date).toLocaleDateString()}</span>
                  </div>
                  {report.feedback_text && (
                    <div className={styles.evalReportFeedback}>
                      <FiMessageSquare /> Guardian feedback received
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Report Detail Modal */}
          {selectedEvalReport && (
            <div className={styles.evalReportModal} onClick={() => setSelectedEvalReport(null)}>
              <div className={styles.evalReportModalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.evalReportModalHeader}>
                  <h3>{selectedEvalReport.student_name}</h3>
                  <button onClick={() => setSelectedEvalReport(null)}>×</button>
                </div>
                <div className={styles.evalReportModalBody}>
                  <p><strong>Class:</strong> {selectedEvalReport.class_name}</p>
                  <p><strong>Date:</strong> {new Date(selectedEvalReport.evaluation_date).toLocaleDateString()}</p>
                  <p><strong>Status:</strong> {selectedEvalReport.status}</p>
                  
                  <h4>Evaluation Data</h4>
                  <div className={styles.evalReportFields}>
                    {Object.entries(selectedEvalReport.field_values || {}).map(([key, value]) => (
                      <div key={key} className={styles.evalReportFieldItem}>
                        <span>{key}:</span> <span>{value}</span>
                      </div>
                    ))}
                  </div>
                  
                  {selectedEvalReport.feedback_text && (
                    <>
                      <h4>Guardian Feedback</h4>
                      <div className={styles.evalReportFeedbackBox}>
                        {selectedEvalReport.feedback_text}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Show class list view
    return (
      <div className={styles.evalBookContainer}>
        {/* Header */}
        <div className={styles.evalBookHeader}>
          <h2><FiBook /> {t('evalBook') || 'Evaluation Book'}</h2>
          <p>{t('evalBookDesc') || 'Daily student evaluations for guardians'}</p>
        </div>

        {/* View Reports Button */}
        <button className={styles.evalViewReportsBtn} onClick={showEvalReports}>
          <FiFileText /> {t('viewReports') || 'View Reports'}
        </button>

        {/* Class List */}
        {evalBookLoading ? (
          <div style={{ padding: '0 16px' }}>
            <SkeletonLoader type="card" count={3} />
          </div>
        ) : evalBookAssignments.length === 0 ? (
          <div className={styles.emptyState}>
            <FiBook className={styles.emptyIcon} />
            <p>{t('noEvalBookAssignments') || 'No evaluation book classes assigned'}</p>
            <small>{t('contactAdmin') || 'Contact your administrator to get assigned to classes'}</small>
          </div>
        ) : (
          <div className={styles.evalBookList}>
            {evalBookAssignments.map((assignment, index) => (
              <div 
                key={assignment.id || index} 
                className={styles.evalBookItem}
                onClick={() => openEvalBookForm(assignment.class_name)}
              >
                <div className={styles.evalBookIcon}>
                  <FiUsers />
                </div>
                <div className={styles.evalBookInfo}>
                  <span className={styles.evalBookClass}>{assignment.class_name}</span>
                  <span className={styles.evalBookStudents}>
                    {t('tapToFill') || 'Tap to fill evaluation form'}
                  </span>
                </div>
                <span className={styles.evalBookArrow}>›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFaultsTab = () => {
    const faultTypes = [
      // Attendance Issues
      'Late Arrival', 'Absence Without Notice', 'Truancy', 'Leaving Class Without Permission',
      'Leaving School Without Permission', 'Skipping Class',
      // Academic Infractions
      'Incomplete Homework', 'Late Homework Submission', 'No Homework', 'Cheating',
      'Plagiarism', 'Copying from Others', 'Unprepared for Class', 'Not Bringing Required Materials',
      'Sleeping in Class', 'Not Participating in Class',
      // Behavioral Issues
      'Disruptive Behavior', 'Talking During Class', 'Making Noise', 'Disturbing Others',
      'Disrespect to Teacher', 'Disrespect to Staff', 'Disrespect to Students', 'Insubordination',
      'Defiance', 'Arguing with Teacher', 'Refusing to Follow Instructions',
      // Bullying & Harassment
      'Bullying', 'Verbal Bullying', 'Physical Bullying', 'Cyberbullying',
      'Harassment', 'Intimidation', 'Threatening Others',
      // Physical Altercations
      'Fighting', 'Physical Aggression', 'Pushing/Shoving', 'Hitting', 'Kicking', 'Horseplay',
      // Language & Communication
      'Profanity', 'Inappropriate Language', 'Vulgar Gestures', 'Name Calling',
      'Gossiping', 'Spreading Rumors',
      // Dress Code & Appearance
      'Uniform Violation', 'Improper Uniform', 'Missing Uniform Items',
      'Inappropriate Clothing', 'Dress Code Violation', 'Improper Grooming',
      // Technology Misuse
      'Phone Use in Class', 'Unauthorized Device Use', 'Inappropriate Internet Use',
      'Social Media Misuse', 'Taking Unauthorized Photos/Videos', 'Gaming During Class',
      // Property & Vandalism
      'Vandalism', 'Damaging School Property', 'Graffiti', 'Littering',
      'Theft', 'Stealing', 'Misusing School Property',
      // Safety Violations
      'Running in Hallways', 'Unsafe Behavior', 'Not Following Safety Rules',
      'Reckless Behavior', 'Dangerous Play',
      // Food & Cafeteria
      'Eating in Class', 'Food Fight', 'Cafeteria Misconduct', 'Not Cleaning Up After Eating',
      // Substance Related
      'Smoking', 'Possession of Prohibited Items', 'Substance Abuse',
      // Dishonesty
      'Lying', 'Forgery', 'Falsifying Documents', 'Providing False Information',
      // Other
      'Public Display of Affection', 'Inappropriate Behavior', 'Violation of School Rules', 'Other'
    ];

    return (
      <div className={styles.faultsContainer}>
        {/* Header with Title and View Toggle */}
        <div className={styles.faultsHeader}>
          <h2 className={styles.faultsTitle}>
            <FiAlertCircle /> Student Faults
          </h2>
          <div className={styles.faultViewToggle}>
            <button
              className={`${styles.faultViewBtn} ${faultView === 'form' ? styles.active : ''}`}
              onClick={() => setFaultView('form')}
            >
              <FiEdit2 /> Report Fault
            </button>
            <button
              className={`${styles.faultViewBtn} ${faultView === 'list' ? styles.active : ''}`}
              onClick={() => {
                setFaultView('list');
                if (selectedFaultClass) {
                  fetchFaultHistory(selectedFaultClass);
                }
              }}
            >
              <FiList /> View History
            </button>
          </div>
        </div>

        {/* Class Selector */}
        <div className={styles.faultFormCard}>
          <div className={styles.faultFormGroup}>
            <label className={styles.faultFormLabel}>
              <FiUsers /> Select Class
            </label>
            <select
              className={styles.faultSelect}
              value={selectedFaultClass}
              onChange={(e) => handleFaultClassChange(e.target.value)}
            >
              <option value="">Choose a class...</option>
              {faultClasses.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Form View */}
        {faultView === 'form' && (
          <div className={styles.faultFormCard}>
            <h3 className={styles.faultFormTitle}>
              <FiEdit2 /> Report New Fault
            </h3>
            <form onSubmit={handleSubmitFault} className={styles.faultForm}>
              <div className={styles.faultFormGroup}>
                <label className={styles.faultFormLabel}>
                  <FiUser /> Student Name <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.faultSelect}
                  value={faultForm.student_name}
                  onChange={(e) => setFaultForm({ ...faultForm, student_name: e.target.value })}
                  required
                  disabled={!selectedFaultClass || faultsLoading}
                >
                  <option value="">Select student...</option>
                  {faultStudents.map((student) => (
                    <option key={student.student_name} value={student.student_name}>
                      {student.student_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.faultFormGroup}>
                <label className={styles.faultFormLabel}>
                  <FiAlertCircle /> Fault Type <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.faultSelect}
                  value={faultForm.fault_type}
                  onChange={(e) => setFaultForm({ ...faultForm, fault_type: e.target.value })}
                  required
                >
                  {faultTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.faultFormGroup}>
                <label className={styles.faultFormLabel}>
                  <FiFileText /> Description <span className={styles.required}>*</span>
                </label>
                <textarea
                  className={styles.faultTextarea}
                  value={faultForm.description}
                  onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })}
                  placeholder="Describe the incident..."
                  rows={4}
                  required
                />
              </div>

              <div className={styles.faultFormActions}>
                <button
                  type="submit"
                  className={styles.faultSubmitBtn}
                  disabled={submittingFault || !selectedFaultClass}
                >
                  {submittingFault ? (
                    <>
                      <FiClock className={styles.spinning} /> Submitting...
                    </>
                  ) : (
                    <>
                      <FiSend /> Report Fault
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List View */}
        {faultView === 'list' && (
          <div className={styles.faultHistoryCard}>
            {faultsLoading ? (
              <div className={styles.faultsLoading}>
                <div className={styles.faultsLoadingSpinner}></div>
                <p>Loading fault history...</p>
              </div>
            ) : faultHistory.length === 0 ? (
              <div className={styles.faultsEmptyState}>
                <FiAlertCircle />
                <h3>No Faults Reported</h3>
                <p>No faults have been reported for this class yet</p>
              </div>
            ) : (() => {
              // Group faults by student
              const groupedFaults = {};
              faultHistory.forEach(fault => {
                if (!groupedFaults[fault.student_name]) {
                  groupedFaults[fault.student_name] = [];
                }
                groupedFaults[fault.student_name].push(fault);
              });

              // Sort faults within each group by date
              Object.values(groupedFaults).forEach(faults => {
                faults.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
              });

              const getOrdinalSuffix = (num) => {
                const j = num % 10;
                const k = num % 100;
                if (j === 1 && k !== 11) return num + 'st';
                if (j === 2 && k !== 12) return num + 'nd';
                if (j === 3 && k !== 13) return num + 'rd';
                return num + 'th';
              };

              return (
                <div className={styles.faultsList}>
                  {Object.entries(groupedFaults).map(([studentName, studentFaults]) => (
                    <div key={studentName} className={styles.studentFaultGroup}>
                      {/* Student Header */}
                      <div className={styles.studentGroupHeader}>
                        <div className={styles.studentInfo}>
                          <FiUser size={24} />
                          <h3 className={styles.groupStudentName}>{studentName}</h3>
                        </div>
                        <div className={styles.totalOffenses}>
                          <span className={styles.offenseCount}>{studentFaults.length}</span>
                          <span className={styles.offenseLabel}>Total Offenses</span>
                        </div>
                      </div>

                      {/* All Faults for this Student */}
                      <div className={styles.studentFaultsList}>
                        {studentFaults.map((fault, faultIndex) => {
                          const offenseNumber = faultIndex + 1;
                          const offenseLabel = getOrdinalSuffix(offenseNumber);
                          return (
                            <div key={fault.id || faultIndex} className={styles.faultItem}>
                              <div className={styles.faultItemHeader}>
                                <span className={styles.offenseNumber}>{offenseLabel} Offense</span>
                                <span className={styles.faultDate}>
                                  <FiCalendar />
                                  {new Date(fault.date || fault.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className={styles.faultType}>
                                <FiAlertCircle />
                                <span>{fault.type || fault.fault_type}</span>
                                {fault.level && (
                                  <span className={`${styles.faultLevel} ${styles[`level${fault.level}`]}`}>
                                    {fault.level}
                                  </span>
                                )}
                              </div>
                              <p className={styles.faultDescription}>{fault.description}</p>
                              <div className={styles.faultItemFooter}>
                                {fault.reported_by && (
                                  <span className={styles.reportedBy}>
                                    Reported by: {fault.reported_by}
                                  </span>
                                )}
                                <button
                                  onClick={() => handleDeleteFault(fault, selectedFaultClass)}
                                  style={{ marginLeft:'auto', background:'none', border:'1.5px solid #fca5a5', borderRadius:'8px', color:'#dc2626', padding:'0.3rem 0.75rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.8rem', fontWeight:600 }}
                                >
                                  🗑 Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  const renderSettingsTab = () => (
    <SettingsTab userId={user?.username} userType="staff" appType="staff" appName="Staff App" />
  );

  const renderContent = () => {
    try {
      switch (activeTab) {
        case 'profile': return renderProfileTab();
        case 'schedule': return isTeacher ? renderScheduleTab() : renderProfileTab();
        case 'marklist': return isTeacher ? renderMarkListTab() : renderProfileTab();
        case 'class': return isTeacher ? (
          <ClassCommunicationTab
            userType="teacher"
            userId={profile?.global_staff_id}
            userName={profile?.name}
            teachingClasses={teacherClasses}
          />
        ) : renderProfileTab();
        case 'attendance': return isClassTeacher ? renderAttendanceTab() : renderProfileTab();
        case 'evalbook': return renderEvalBookTab();
        case 'faults': return renderFaultsTab();
        case 'evaluations': return renderEvaluationsTab();
        case 'posts': return renderPostsTab();
        case 'communications': return renderCommunicationsTab();
        case 'settings': return renderSettingsTab();
        default: return renderProfileTab();
      }
    } catch (error) {
      console.error('Error rendering tab:', activeTab, error);
      return (
        <div className={styles.errorContainer}>
          <p>Error loading {activeTab} tab</p>
          <button onClick={() => setActiveTab('profile')} className={styles.retryButton}>
            Go to Profile
          </button>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <MobileProfileLayout title="Staff Profile" onLogout={handleLogout}>
        <SkeletonLoader type="profile" />
        <BottomNavigation items={getNavItems()} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  if (!user || !profile) {
    return (
      <MobileProfileLayout title="Staff Profile" onLogout={handleLogout}>
        <div className={styles.errorContainer}>
          <p>Unable to load profile data</p>
          <button onClick={() => navigate('/app/staff-login')} className={styles.retryButton}>Go to Login</button>
        </div>
        <BottomNavigation items={getNavItems()} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  return (
    <MobileProfileLayout title="Staff Profile" onLogout={handleLogout} onRefresh={handleRefresh}>
      {renderContent()}
      <BottomNavigation items={getNavItems()} activeItem={activeTab} onItemClick={setActiveTab} />
      <toast.ToastContainer />
    </MobileProfileLayout>
  );
};

export default StaffProfile;
