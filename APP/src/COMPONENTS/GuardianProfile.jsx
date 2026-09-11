import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { useParams, useNavigate } from 'react-router-dom';
import { FiUser, FiUsers, FiFileText, FiMessageSquare, FiPhone, FiList, FiCalendar, FiSettings, FiBook, FiSend, FiCheck, FiAlertCircle, FiPlus, FiX, FiSearch, FiDollarSign, FiBell, FiAward, FiMoreHorizontal } from 'react-icons/fi';
import { getBranchCode } from '../utils/branchCode';
import { initGuardianPush, ensurePushPermission } from '../utils/pushNotifications';
import GuardianCommunications from '../PAGE/Communication/GuardianCommunications';
import ChatWindow from '../COMPONENTS/Chat/ChatWindow';
import ConversationList from '../COMPONENTS/Chat/ConversationList';
import ReportCardFront from '../PAGE/CreateMarklist/ReportCard/ReportCardFront';
import reportCardStyles from '../PAGE/CreateMarklist/ReportCard/ReportCard.module.css';
import InvoiceReceipt from './InvoiceReceipt';
import { numberToWords } from '../utils/numberToWords';
import { AttendanceViewSelector, MonthlySummaryView, TrendsView } from './GuardianAttendanceEnhanced';
import { useApp } from '../context/AppContext';
import {
  MobileProfileLayout,
  BottomNavigation,
  ProfileHeader,
  CollapsibleCard,
  SkeletonLoader,
  PostCard,
  WardCarousel,
  useToast,
  SettingsTab
} from './mobile';
import styles from './GuardianProfile.module.css';

const GuardianProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [wards, setWards] = useState([]);
  const [guardianInfo, setGuardianInfo] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [selectedWard, setSelectedWard] = useState(null);
  const [wardMarks, setWardMarks] = useState({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [selectedMarkWard, setSelectedMarkWard] = useState(null);
  // Attendance state
  const [attendanceTables, setAttendanceTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [wardAttendance, setWardAttendance] = useState({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);
  const [selectedAttendanceWard, setSelectedAttendanceWard] = useState(null);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [attendanceTrends, setAttendanceTrends] = useState([]);
  const [dailyAttendance, setDailyAttendance] = useState([]); // New state for daily details
  // Ethiopian calendar defaults (Yekatit 2018 = current)
  const [selectedMonth, setSelectedMonth] = useState(6); // Yekatit
  const [selectedYear, setSelectedYear] = useState(2018);
  const [attendanceView, setAttendanceView] = useState('monthly'); // Start with monthly view
  
  // Evaluation Book state
  const [evalBookEvaluations, setEvalBookEvaluations] = useState([]);
  const [evalBookLoading, setEvalBookLoading] = useState(false);
  const [selectedEvalWard, setSelectedEvalWard] = useState(null);
  const [evalBookView, setEvalBookView] = useState('list'); // 'list', 'feedback', or 'reports'
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [selectedReportWard, setSelectedReportWard] = useState(null);
  
  // Chat state
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const socketRef = useRef(null);
  
  // Payment state
  const [paymentData, setPaymentData] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPaymentWard, setSelectedPaymentWard] = useState(null);
  const [unpaidCount, setUnpaidCount] = useState(0);
  
  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // Report card state
  const [reportCard, setReportCard] = useState(null);
  const [reportCardLoading, setReportCardLoading] = useState(false);
  const [reportCardWard, setReportCardWard] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [schoolInfo, setSchoolInfo] = useState({
    name: 'IQRA ACADEMY',
    address: '',
    phone: '',
    email: '',
    academicYear: '',
    logo: null,
    website_icon: null
  });
  const [activeStudent, setActiveStudent] = useState(null); // currently selected student across tabs
  const [activePaymentWard, setActivePaymentWard] = useState(null); // selected student in payments tab
  const [receiptVoucher, setReceiptVoucher] = useState(null); // Cash Receipt Voucher modal data
  const [hasNewMarks, setHasNewMarks] = useState(false);
  const [hasNewPayments, setHasNewPayments] = useState(false);
  
  const toast = useToast();

  const navItems = [
    { id: 'profile', label: 'Profile', icon: <FiUser /> },
    { id: 'marklist', label: 'Marks', icon: <FiList /> },
    { id: 'reportcard', label: 'Report Card', icon: <FiAward /> },
    { id: 'payments', label: 'Payments', icon: <FiDollarSign /> },
    { id: 'more', label: 'More', icon: <FiMoreHorizontal /> }
  ];

  const fetchProfile = useCallback(async () => {
    try {
      // First verify guardian role
      const response = await axios.get(`/api/students/guardian-profile/${username}`, { headers: { 'x-branch-code': (getBranchCode() || '').toUpperCase() } });
      if (response.data.role !== 'guardian') {
        setError('This page is for guardians only.');
        return;
      }

      // Fetch all guardians with associated students (same as ListGuardian).
      // This endpoint requires auth — if it fails (e.g. token missing/expired),
      // fall back to the guardian-profile data instead of breaking the page.
      let currentGuardian = null;
      try {
        const guardiansResponse = await axios.get('/api/guardian-list/guardians');
        currentGuardian = guardiansResponse.data.find(
          guardian => guardian.guardian_username === username
        );
      } catch (listErr) {
        console.warn('guardian-list fetch failed, using guardian-profile fallback:', listErr.message);
      }

      if (currentGuardian) {
        // Set all associated students from all class tables
        setWards(currentGuardian.students || []);
        setGuardianInfo({
          guardian_name: currentGuardian.guardian_name,
          guardian_phone: currentGuardian.guardian_phone,
          guardian_username: currentGuardian.guardian_username
        });
      } else {
        // Fallback to original method if guardian not found in list
        setWards(response.data.student || []);
        if (response.data.student && response.data.student.length > 0) {
          setGuardianInfo({
            guardian_name: response.data.student[0].guardian_name,
            guardian_phone: response.data.student[0].guardian_phone,
            guardian_username: response.data.student[0].guardian_username
          });
        }
      }
      setError('');
    } catch (err) {
      setError('Failed to fetch profile data. You may not be authorized to view this page.');
      toast.error('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  const fetchProfilePosts = useCallback(async (schoolId) => {
    try {
      const response = await axios.get(`/api/posts/profile/guardian/${schoolId}`);
      setProfilePosts(response.data.map(post => ({ ...post, localLikes: post.likes || 0 })));
    } catch (err) {
      console.error('Error fetching profile posts:', err);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username, fetchProfile]);

  // On profile open (e.g. auto-redirect after login), ensure notification
  // permission is granted and register the device token for this guardian.
  useEffect(() => {
    (async () => {
      const res = await ensurePushPermission();
      if (res.status === 'granted' && username) {
        initGuardianPush(username).catch(() => {});
      }
    })();
  }, [username]);

  useEffect(() => {
    if (wards.length > 0) {
      fetchProfilePosts(wards[0].school_id);
      setSelectedMarkWard(wards[0]); // Default to first ward
    }
  }, [wards, fetchProfilePosts]);

  // Fetch marks for ALL wards at once
  const fetchAllWardsMarks = useCallback(async (guardianUsername) => {
    if (!guardianUsername) return;
    setMarksLoading(true);
    try {
      const response = await axios.get(
        `/api/mark-list/guardian-marks/${encodeURIComponent(guardianUsername)}`
      );
      if (response.data.success) {
        // Organize marks by student school_id for easy access
        const marksByStudent = {};
        response.data.data.marks.forEach(mark => {
          const student = response.data.data.wards.find(w => w.student_name === mark.ward);
          if (student) {
            if (!marksByStudent[student.school_id]) {
              marksByStudent[student.school_id] = [];
            }
            marksByStudent[student.school_id].push(mark);
          }
        });
        setWardMarks(marksByStudent);
      }
    } catch (err) {
      console.error('Error fetching all wards marks:', err);
      toast.error('Failed to load marks');
    } finally {
      setMarksLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'marklist' && guardianInfo?.guardian_username) {
      // Fetch marks for ALL wards when marks tab is opened
      if (Object.keys(wardMarks).length === 0) {
        fetchAllWardsMarks(guardianInfo.guardian_username);
      }
    }
  }, [activeTab, guardianInfo?.guardian_username, wardMarks, fetchAllWardsMarks]);

  // Fetch school branding once for the report card + receipt voucher
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await axios.get('/api/admin/branding');
        const b = res.data;
        const baseUrl = window.location.origin || '';
        setSchoolInfo(prev => ({
          ...prev,
          name: b.website_name || 'IQRA ACADEMY',
          address: b.school_address || '',
          phone: b.school_phone || '',
          email: b.school_email || '',
          academicYear: b.academic_year || '',
          // Prefer school_logo; fall back to website_icon (IQRA favicon) when
          // school_logo is null/empty — this is the case on iqra.skoolific.com.
          logo: b.school_logo
            ? `${baseUrl}/uploads/branding/${b.school_logo}`
            : b.website_icon
              ? `${baseUrl}/uploads/branding/${b.website_icon}`
              : null,
          website_icon: b.website_icon ? `${baseUrl}/uploads/branding/${b.website_icon}` : null
        }));
      } catch (e) {
        console.warn('Branding fetch failed (using defaults):', e.message);
      }
    };
    fetchBranding();
  }, []);

  // Build the full report card preview data (same shape ReportCardFront expects)
  // from the full-ranking payload for the selected ward.
  const buildReportData = useCallback((full, ward) => {
    if (!full || !Array.isArray(full.terms)) return null;
    const termsData = full.terms || [];
    const allSubjects = full.allSubjects || [];
    const termCount = full.termCount || termsData.length || 2;
    const studentName = ward?.student_name || '';

    const termData = {};
    const studentRanks = {};
    termsData.forEach(term => {
      const tn = term.termNumber;
      const student = term.rankings?.find(r => (r.studentName || '').trim() === studentName.trim());
      if (student) {
        termData[tn] = student;
        studentRanks[tn] = student.rank || '-';
      }
    });

    // combined subject data + term totals/averages
    const combinedSubjects = {};
    let totals = {};
    let counts = {};
    allSubjects.forEach(subject => {
      const marks = {};
      let sum = 0, count = 0;
      termsData.forEach(term => {
        const tn = term.termNumber;
        const student = termData[tn];
        const mark = student?.subjects?.[subject]?.total;
        marks[tn] = mark ?? '';
        if (mark) { sum += parseFloat(mark); count++; totals[tn] = (totals[tn] || 0) + parseFloat(mark); counts[tn] = (counts[tn] || 0) + 1; }
      });
      combinedSubjects[subject] = { marks, average: count > 0 ? (sum / count).toFixed(1) : '' };
    });

    const termTotals = {};
    const termAverages = {};
    let combinedTotal = 0, combinedCount = 0;
    termsData.forEach(term => {
      const tn = term.termNumber;
      const t = totals[tn] || 0;
      const c = counts[tn] || 0;
      termTotals[tn] = t > 0 ? t.toFixed(0) : '';
      termAverages[tn] = c > 0 ? (t / c).toFixed(1) : '';
      combinedTotal += t; combinedCount += c;
    });

    return {
      studentName,
      className: ward?.class || '',
      termCount,
      terms: termsData.map(t => t.termNumber),
      termData,
      studentRanks,
      subjects: allSubjects,
      subjectsData: combinedSubjects,
      totals: termTotals,
      averages: termAverages,
      combinedAverage: combinedCount > 0 ? (combinedTotal / combinedCount).toFixed(1) : '',
      gender: ward?.gender || '',
      age: ward?.age || '',
      photo: ''
    };
  }, []);

  // Fetch the full report card (all terms + ranks) for a single ward's class
  const fetchReportCard = useCallback(async (ward) => {
    if (!ward?.class) return;
    setReportCardLoading(true);
    setReportCardWard(ward);
    try {
      const className = encodeURIComponent(ward.class);
      const response = await axios.get(`/api/mark-list/full-ranking/${className}`);
      if (response.data && Array.isArray(response.data.terms)) {
        setReportCard(response.data);
        setReportData(buildReportData(response.data, ward));
      } else {
        setReportCard(null);
        setReportData(null);
      }
    } catch (err) {
      console.error('Error fetching report card:', err);
      setReportCard(null);
      setReportData(null);
    } finally {
      setReportCardLoading(false);
    }
  }, [buildReportData]);

  // Auto-load report card for the first ward when the tab opens
  useEffect(() => {
    if (activeTab === 'reportcard' && wards.length > 0) {
      const target = reportCardWard || wards[0];
      if (reportCardWard?.student_name !== target.student_name || !reportCard) {
        fetchReportCard(target);
      }
    }
  }, [activeTab, wards, reportCardWard, reportCard, fetchReportCard]);

  // Helper function: Map attendance value to display indicator
  const getAttendanceIndicator = (value) => {
    if (value === 'P') return 'P';
    if (value === 'A') return 'A';
    if (value === 'L') return 'L';
    return '-';
  };

  // Helper function: Calculate attendance summary
  const calculateAttendanceSummary = (record) => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let present = 0, absent = 0, late = 0;
    days.forEach(day => {
      const val = record[day];
      if (val === 'P') present++;
      else if (val === 'A') absent++;
      else if (val === 'L') late++;
    });
    return { present, absent, late, total: 7 };
  };

  // Fetch attendance tables for a ward's class (Ethiopian calendar - monthly view)
  const fetchAttendanceTables = useCallback(async (ward) => {
    if (!ward?.class) {
      setAttendanceError('No class assigned');
      return;
    }
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      // Fetch current month's attendance using Ethiopian calendar
      const response = await axios.get(
        `/api/guardian-student-attendance/student-attendance/${encodeURIComponent(ward.class)}/${ward.school_id}?year=${selectedYear}&month=${selectedMonth}`
      );
      
      // Store the attendance data
      setWardAttendance({
        [`${ward.school_id}_current`]: response.data.attendance || []
      });
      
      // Set a dummy table name for compatibility
      setSelectedTable('current_month');
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setAttendanceError('Failed to load attendance data');
    } finally {
      setAttendanceLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  // Fetch attendance for a specific ward and table
  const fetchWardAttendance = useCallback(async (ward, tableName) => {
    if (!ward?.class || !ward?.school_id || !tableName) return;
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const className = ward.class.replace(/\s+/g, '_');
      const response = await axios.get(
        `/api/guardian-attendance/student/${encodeURIComponent(className)}/${encodeURIComponent(tableName)}/${ward.school_id}`
      );
      setWardAttendance(prev => ({
        ...prev,
        [`${ward.school_id}_${tableName}`]: response.data || []
      }));
    } catch (err) {
      console.error('Error fetching ward attendance:', err);
      setAttendanceError('Failed to load attendance data');
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  // Fetch monthly attendance summary (Ethiopian calendar)
  const fetchMonthlySummary = useCallback(async (ward, year, month) => {
    if (!ward?.class || !ward?.school_id) return;
    setAttendanceLoading(true);
    try {
      // Fetch summary
      const summaryResponse = await axios.get(
        `/api/guardian-student-attendance/monthly-summary/${encodeURIComponent(ward.class)}/${ward.school_id}?year=${year}&month=${month}`
      );
      setMonthlySummary(summaryResponse.data);

      // Fetch daily details
      const dailyResponse = await axios.get(
        `/api/guardian-student-attendance/student-attendance/${encodeURIComponent(ward.class)}/${ward.school_id}?year=${year}&month=${month}`
      );
      setDailyAttendance(dailyResponse.data.attendance || []);
    } catch (err) {
      console.error('Error fetching monthly summary:', err);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  // Fetch attendance trends (Ethiopian calendar)
  const fetchAttendanceTrends = useCallback(async (ward) => {
    if (!ward?.class || !ward?.school_id) return;
    setAttendanceLoading(true);
    try {
      const response = await axios.get(
        `/api/guardian-student-attendance/trends/${encodeURIComponent(ward.class)}/${ward.school_id}`
      );
      setAttendanceTrends(response.data.trends || []);
    } catch (err) {
      console.error('Error fetching attendance trends:', err);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  // Download attendance report
  const downloadAttendanceReport = async (ward, year, month) => {
    if (!ward?.class || !ward?.school_id) return;
    try {
      const className = ward.class.replace(/\s+/g, '_');
      const response = await axios.get(
        `/api/guardian-attendance/report/${encodeURIComponent(className)}/${ward.school_id}/${year}/${month}`,
        { responseType: 'blob' }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_report_${ward.student_name}_${year}_${month}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Report downloaded successfully!');
    } catch (err) {
      console.error('Error downloading report:', err);
      toast.error('Failed to download report');
    }
  };

  // Effect: Set default attendance ward
  useEffect(() => {
    if (wards.length > 0 && !selectedAttendanceWard) {
      setSelectedAttendanceWard(wards[0]);
    }
  }, [wards, selectedAttendanceWard]);

  // Effect: Fetch attendance tables when tab is active
  useEffect(() => {
    if (activeTab === 'attendance' && selectedAttendanceWard) {
      if (attendanceView === 'weekly') {
        fetchAttendanceTables(selectedAttendanceWard);
      } else if (attendanceView === 'monthly') {
        fetchMonthlySummary(selectedAttendanceWard, selectedYear, selectedMonth);
      } else if (attendanceView === 'trends') {
        fetchAttendanceTrends(selectedAttendanceWard);
      }
    }
  }, [activeTab, selectedAttendanceWard, attendanceView, selectedYear, selectedMonth, fetchAttendanceTables, fetchMonthlySummary, fetchAttendanceTrends]);

  // Effect: Fetch attendance when table is selected
  useEffect(() => {
    if (activeTab === 'attendance' && selectedAttendanceWard && selectedTable) {
      const key = `${selectedAttendanceWard.school_id}_${selectedTable}`;
      if (!wardAttendance[key]) {
        fetchWardAttendance(selectedAttendanceWard, selectedTable);
      }
    }
  }, [activeTab, selectedAttendanceWard, selectedTable, wardAttendance, fetchWardAttendance]);

  // Fetch evaluation book entries for guardian - searches by guardian_id and ward names
  const fetchEvalBookEvaluations = useCallback(async (guardianId, wardsList) => {
    if (!guardianId) return;
    setEvalBookLoading(true);
    try {
      // First try fetching by guardian_id
      const response = await axios.get(
        `/api/evaluation-book/daily/guardian/${encodeURIComponent(guardianId)}`
      );
      let evaluations = response.data || [];
      
      // If no evaluations found and we have wards, try fetching by student names
      if (evaluations.length === 0 && wardsList && wardsList.length > 0) {
        const wardNames = wardsList.map(w => w.student_name);
        // Fetch evaluations for each ward by their class
        for (const ward of wardsList) {
          if (ward.class && ward.student_name) {
            try {
              const classResponse = await axios.get(
                `/api/evaluation-book/daily/class/${encodeURIComponent(ward.class)}`
              );
              const wardEvals = (classResponse.data || []).filter(
                e => e.student_name === ward.student_name
              );
              evaluations = [...evaluations, ...wardEvals];
            } catch (classErr) {
              console.warn(`Could not fetch evaluations for class ${ward.class}:`, classErr);
            }
          }
        }
        // Remove duplicates by id
        evaluations = evaluations.filter((e, index, self) => 
          index === self.findIndex(t => t.id === e.id)
        );
      }
      
      setEvalBookEvaluations(evaluations);
    } catch (err) {
      console.error('Error fetching evaluation book:', err);
      setEvalBookEvaluations([]);
    } finally {
      setEvalBookLoading(false);
    }
  }, []);

  // Effect: Fetch evaluations when tab is active
  useEffect(() => {
    if (activeTab === 'evalbook' && guardianInfo?.guardian_username) {
      fetchEvalBookEvaluations(guardianInfo.guardian_username, wards);
    }
  }, [activeTab, guardianInfo, wards, fetchEvalBookEvaluations]);

  // Fetch payment data for guardian
  const fetchPaymentData = useCallback(async (guardianUsername) => {
    if (!guardianUsername) return;
    setPaymentLoading(true);
    try {
      console.log('Fetching payments for guardian:', guardianUsername);
      const response = await axios.get(
        `/api/guardian-payments/${encodeURIComponent(guardianUsername)}`
      );
      console.log('Payments API Response:', response.data);
      if (response.data.success) {
        console.log('Number of wards with payments:', response.data.data.payments?.length);
        console.log('Payment data:', response.data.data.payments);
        setPaymentData(response.data.data.payments || []);
        setUnpaidCount(response.data.data.unpaidCount || 0);
        if (response.data.data.payments.length > 0) {
          setSelectedPaymentWard(response.data.data.payments[0].ward);
        }
      }
    } catch (err) {
      console.error('Error fetching payment data:', err);
      console.error('Error details:', err.response?.data);
      setPaymentData([]);
      toast.error('Failed to load payment information');
    } finally {
      setPaymentLoading(false);
    }
  }, [toast]);

  // Effect: Fetch payments when tab is active
  useEffect(() => {
    if (activeTab === 'payments' && guardianInfo?.guardian_username) {
      fetchPaymentData(guardianInfo.guardian_username);
    }
  }, [activeTab, guardianInfo?.guardian_username]); // Removed fetchPaymentData from dependencies

  // Fetch notifications for guardian
  const fetchNotifications = useCallback(async () => {
    if (!guardianInfo?.guardian_username || !wards.length) return;
    
    setNotificationsLoading(true);
    try {
      const notificationsList = [];
      
      // Fetch today's attendance for all wards
      for (const ward of wards) {
        try {
          const today = new Date();
          const ethDate = gregorianToEthiopian(today);
          const response = await axios.get(
            `/api/guardian-student-attendance/student-attendance/${encodeURIComponent(ward.class)}/${ward.school_id}?year=${ethDate.year}&month=${ethDate.month}`
          );
          
          const todayAttendance = response.data.attendance?.find(a => {
            const attDate = a.attendance_date?.split('/');
            return attDate && attDate[1] == ethDate.day && attDate[0] == ethDate.month;
          });
          
          if (todayAttendance) {
            notificationsList.push({
              id: `att_${ward.school_id}_${Date.now()}`,
              type: 'attendance',
              title: 'Daily Attendance Report',
              message: `${ward.student_name} was ${todayAttendance.status || 'marked'} today${todayAttendance.check_in_time ? ` at ${todayAttendance.check_in_time}` : ''}`,
              date: new Date().toISOString(),
              read: false,
              ward: ward.student_name
            });
          }
        } catch (err) {
          console.error(`Error fetching attendance for ${ward.student_name}:`, err);
        }
      }
      
      // Fetch payment notifications
      try {
        const paymentResponse = await axios.get(
          `/api/guardian-payments/${encodeURIComponent(guardianInfo.guardian_username)}`
        );
        
        if (paymentResponse.data.success) {
          paymentResponse.data.data.payments?.forEach(wardPayment => {
            // Unlocked but unpaid months
            const unpaidInvoices = (wardPayment.monthlyPayments || []).filter(inv =>
              !inv.isPaid && (inv.status === 'ISSUED' || inv.status === 'OVERDUE')
            );
            
            if (unpaidInvoices.length > 0) {
              const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + inv.balance, 0);
              const monthNames = unpaidInvoices.map(inv => inv.month).join(', ');
              notificationsList.push({
                id: `pay_unpaid_${wardPayment.ward.schoolId}_${monthNames}`,
                type: 'payment',
                title: 'Unlocked Month Not Paid',
                message: `${wardPayment.ward.studentName}: ${unpaidInvoices.length} month(s) unlocked & unpaid (${monthNames}). Balance ETB ${totalUnpaid.toFixed(2)}`,
                date: new Date().toISOString(),
                read: false,
                ward: wardPayment.ward.studentName
              });
            }
            
            // Recently paid invoices
            const recentPayments = (wardPayment.monthlyPayments || []).filter(inv => {
              if (inv.status !== 'PAID') return false;
              const last = inv.payments?.[inv.payments.length - 1];
              const paidDate = last?.paymentDate || inv.dueDate;
              const daysDiff = (new Date() - new Date(paidDate)) / (1000 * 60 * 60 * 24);
              return daysDiff <= 7;
            });
            
            recentPayments.forEach(payment => {
              notificationsList.push({
                id: `pay_received_${payment.invoiceId || payment.invoiceNumber}`,
                type: 'payment',
                title: 'Payment Received',
                message: `Payment of ETB ${parseFloat(payment.paidAmount).toFixed(2)} received for ${wardPayment.ward.studentName} (${payment.month}). Thank you!`,
                date: new Date().toISOString(),
                read: false,
                ward: wardPayment.ward.studentName
              });
            });
          });
        }
      } catch (err) {
        console.error('Error fetching payment notifications:', err);
      }

      // Fetch marks and flag newly-added marks (updated within the last 7 days)
      try {
        const marksResponse = await axios.get(
          `/api/mark-list/guardian-marks/${encodeURIComponent(guardianInfo.guardian_username)}`
        );
        if (marksResponse.data.success) {
          const marks = marksResponse.data.data.marks || [];
          // Group recent marks (updated_at within 7 days) by ward
          const recentByWard = {};
          marks.forEach(mark => {
            const updated = mark.details?.updated_at ? new Date(mark.details.updated_at) : null;
            if (!updated) return;
            const daysDiff = (new Date() - updated) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 7) {
              if (!recentByWard[mark.ward]) recentByWard[mark.ward] = [];
              recentByWard[mark.ward].push(mark);
            }
          });
          Object.entries(recentByWard).forEach(([wardName, wardMarksList]) => {
            const subjects = wardMarksList
              .map(m => `${m.subject} (${parseFloat(m.total).toFixed(0)})`)
              .slice(0, 5)
              .join(', ');
            const more = wardMarksList.length > 5 ? ` +${wardMarksList.length - 5} more` : '';
            notificationsList.push({
              id: `marks_${wardName}_${Date.now()}`,
              type: 'marks',
              title: `New Marks Added — ${wardName}`,
              message: `${wardMarksList.length} mark(s) updated: ${subjects}${more}`,
              date: new Date().toISOString(),
              read: false,
              ward: wardName
            });
            setHasNewMarks(true);
          });
        }
      } catch (err) {
        console.error('Error fetching marks notifications:', err);
      }
      
      // Sort by date (newest first)
      notificationsList.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      setNotifications(notificationsList);
      setUnreadNotificationCount(notificationsList.filter(n => !n.read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [guardianInfo, wards]);

  // Helper function to convert Gregorian to Ethiopian date
  const gregorianToEthiopian = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let ethYear = year - 7;
    let ethMonth = month + 4;
    let ethDay = day + 10;

    if (ethMonth > 12) {
      ethMonth -= 12;
      ethYear += 1;
    }

    if (ethDay > 30) {
      ethDay -= 30;
      ethMonth += 1;
      if (ethMonth > 12) {
        ethMonth = 1;
        ethYear += 1;
      }
    }

    return { year: ethYear, month: ethMonth, day: ethDay };
  };

  // Fetch notifications when guardian info and wards are loaded
  useEffect(() => {
    if (guardianInfo && wards.length > 0) {
      fetchNotifications();
    }
  }, [guardianInfo, wards, fetchNotifications]);

  // Refresh notifications every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (guardianInfo && wards.length > 0) {
        fetchNotifications();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [guardianInfo, wards, fetchNotifications]);

  // Open feedback form for an evaluation
  const openFeedbackForm = (evaluation) => {
    setSelectedEvaluation(evaluation);
    setFeedbackText(evaluation.feedback_text || '');
    setEvalBookView('feedback');
  };

  // Submit feedback
  const submitFeedback = async () => {
    if (!selectedEvaluation || !feedbackText.trim()) {
      toast.error('Please enter feedback');
      return;
    }
    setFeedbackSaving(true);
    try {
      await axios.post('/api/evaluation-book/feedback', {
        daily_evaluation_id: selectedEvaluation.id,
        guardian_id: guardianInfo?.guardian_username,
        feedback_text: feedbackText.trim()
      });
      toast.success('Feedback submitted!');
      setEvalBookView('list');
      setSelectedEvaluation(null);
      setFeedbackText('');
      // Refresh evaluations
      if (guardianInfo?.guardian_username) {
        fetchEvalBookEvaluations(guardianInfo.guardian_username);
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      toast.error(err.response?.data?.error || 'Failed to submit feedback');
    } finally {
      setFeedbackSaving(false);
    }
  };

  // Back to evaluation list
  const backToEvalList = () => {
    setEvalBookView('list');
    setSelectedEvaluation(null);
    setFeedbackText('');
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setPostsLoading(true);
    await fetchProfile();
    if (wards.length > 0) {
      await fetchProfilePosts(wards[0].school_id);
    }
    toast.success('Profile refreshed');
  };

  const handleLike = async (postId) => {
    try {
      await axios.put(`/api/posts/${postId}/like`);
      setProfilePosts(prev =>
        prev.map(post =>
          post.id === postId
            ? { ...post, localLikes: (post.localLikes || 0) + 1 }
            : post
        )
      );
      toast.success('Post liked!');
    } catch (error) {
      console.error('Error liking post:', error);
      toast.error('Failed to like post');
    }
  };

  const handleLogout = () => {
    // Clear the saved session so the app doesn't auto-login again
    localStorage.removeItem('authToken');
    localStorage.removeItem('guardianUser');
    localStorage.removeItem('rememberedBranchCode');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('guardianUser');
    sessionStorage.removeItem('branchCode');
    navigate('/app/guardian-login');
  };

  const handleNotificationClick = () => {
    setActiveTab('notifications');
  };

  const renderProfileTab = () => (
    <>
      <ProfileHeader
        name={guardianInfo?.guardian_name}
        subtitle={`Guardian | ${wards.length} Ward${wards.length !== 1 ? 's' : ''}`}
        fallbackInitial={guardianInfo?.guardian_name?.charAt(0)}
      />

      <CollapsibleCard title="Contact Information" icon={<FiPhone />} defaultExpanded={true}>
        <div className={styles.fieldsStack}>
          <div className={styles.fieldItem}>
            <span className={styles.fieldLabel}>Phone</span>
            <span className={styles.fieldValue}>{guardianInfo?.guardian_phone}</span>
          </div>
          <div className={styles.fieldItem}>
            <span className={styles.fieldLabel}>Username</span>
            <span className={styles.fieldValue}>{guardianInfo?.guardian_username}</span>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title={`My Wards (${wards.length})`} icon={<FiUsers />} defaultExpanded={true}>
        <div className={styles.wardsSummary}>
          {wards.length === 0 ? (
            <div className={styles.emptyState}>
              <FiUsers className={styles.emptyIcon} />
              <p>No wards found</p>
            </div>
          ) : null}
          {wards.map((ward, index) => {
            // Helper to get proper image URL
            const getImageUrl = (imagePath) => {
              if (!imagePath) return null;
              const cleanPath = imagePath.replace(/^\/?(uploads|Uploads)\//i, '');
              return `/uploads/${cleanPath}`;
            };
            
            return (
              <div key={ward.id || index} className={styles.wardDetailCard}>
                <div className={styles.wardDetailHeader}>
                  <div className={styles.wardDetailAvatar}>
                    {ward.image_student ? (
                      <img
                        src={getImageUrl(ward.image_student)}
                        alt={ward.student_name}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : null}
                    <span className={styles.wardAvatarFallback} style={{ display: ward.image_student ? 'none' : 'flex' }}>
                      {ward.student_name?.charAt(0)}
                    </span>
                  </div>
                  <div className={styles.wardDetailInfo}>
                    <span className={styles.wardDetailName}>{ward.student_name}</span>
                    <span className={styles.wardDetailClass}>Class: {ward.class}</span>
                  </div>
                </div>
                <div className={styles.wardDetailStats}>
                  <div className={styles.wardStatItem}>
                    <span className={styles.wardStatLabel}>School ID</span>
                    <span className={styles.wardStatValue}>{ward.school_id}</span>
                  </div>
                  <div className={styles.wardStatItem}>
                    <span className={styles.wardStatLabel}>Class ID</span>
                    <span className={styles.wardStatValue}>{ward.class_id}</span>
                  </div>
                  <div className={styles.wardStatItem}>
                    <span className={styles.wardStatLabel}>Age</span>
                    <span className={styles.wardStatValue}>{ward.age}</span>
                  </div>
                  <div className={styles.wardStatItem}>
                    <span className={styles.wardStatLabel}>Gender</span>
                    <span className={styles.wardStatValue}>{ward.gender}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleCard>
    </>
  );

  const renderMarkListTab = () => {
    const currentMarks = selectedMarkWard ? wardMarks[selectedMarkWard.school_id] || [] : [];
    
    // Standard component order + max marks (matches create-mark-list config)
    const componentDefs = [
      { key: 'practical_1', name: 'Practical 1', max: 5 },
      { key: 'test_1', name: 'Test 1', max: 10 },
      { key: 'practical_2', name: 'Practical 2', max: 5 },
      { key: 'test_2', name: 'Test 2', max: 10 },
      { key: 'mid', name: 'Mid Exam', max: 30 },
      { key: 'book', name: 'Book', max: 5 },
      { key: 'final', name: 'Final Exam', max: 35 },
    ];

    // Group marks by term
    const marksByTerm = currentMarks.reduce((acc, m) => {
      const t = m.term || 1;
      if (!acc[t]) acc[t] = [];
      acc[t].push(m);
      return acc;
    }, {});
    const terms = Object.keys(marksByTerm).map(Number).sort((a, b) => a - b);

    return (
      <div className={styles.markListContainer}>
        <h2 className={styles.tabTitle}>Ward Marks</h2>
        
        {/* Ward Selector */}
        {wards.length > 1 && (
          <div className={styles.wardSelector}>
            {wards.map((ward) => (
              <button
                key={ward.school_id}
                className={`${styles.wardSelectorBtn} ${selectedMarkWard?.school_id === ward.school_id ? styles.wardSelectorActive : ''}`}
                onClick={() => setSelectedMarkWard(ward)}
              >
                <span className={styles.wardSelectorAvatar}>
                  {ward.student_name?.charAt(0)}
                </span>
                <span className={styles.wardSelectorName}>{ward.student_name}</span>
              </button>
            ))}
          </div>
        )}
        
        {/* Selected Ward Info */}
        {selectedMarkWard && (
          <div className={styles.selectedWardInfo}>
            <span className={styles.selectedWardName}>{selectedMarkWard.student_name}</span>
            <span className={styles.selectedWardClass}>Class {selectedMarkWard.class}</span>
          </div>
        )}
        
        {marksLoading ? (
          <SkeletonLoader type="card" count={3} />
        ) : currentMarks.length > 0 ? (
          terms.map((term) => (
            <div key={term} className={styles.termSection}>
              <h3 className={styles.termHeading}>Term {term}</h3>
              <div className={styles.markListCards}>
                {marksByTerm[term].map((subject, index) => {
                  const total = parseFloat(subject.total || 0);
                  const detail = subject.details || {};
                  return (
                    <div key={index} className={styles.subjectCard}>
                      <div className={styles.subjectHeader}>
                        <span className={styles.subjectName}>{subject.subject}</span>
                        <span className={`${styles.statusBadge} ${subject.pass_status === 'Pass' ? styles.statusPass : styles.statusFail}`}>
                          {subject.pass_status}
                        </span>
                      </div>
                      <div className={styles.marksGrid}>
                        {componentDefs.map((comp, idx) => (
                          <div key={idx} className={styles.markItem}>
                            <span className={styles.markLabel}>{comp.name}</span>
                            <span className={styles.markValue}>
                              {detail[comp.key] != null ? `${parseFloat(detail[comp.key])}/${comp.max}` : `—/${comp.max}`}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className={styles.totalRow}>
                        <span className={styles.totalLabel}>Total</span>
                        <span className={styles.totalValue}>{total}/100</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <FiList className={styles.emptyIcon} />
            <p>No marks available yet</p>
          </div>
        )}
      </div>
    );
  };

  const renderReportCardTab = () => {
    const selectedWard = reportCardWard || wards[0];

    return (
      <div className={styles.markListContainer}>
        <h2 className={styles.tabTitle}>Report Card</h2>

        {/* Ward Selector */}
        {wards.length > 1 && (
          <div className={styles.wardSelector}>
            {wards.map((ward) => (
              <button
                key={ward.school_id}
                className={`${styles.wardSelectorBtn} ${selectedWard?.school_id === ward.school_id ? styles.wardSelectorActive : ''}`}
                onClick={() => { setReportCardWard(ward); setReportCard(null); setReportData(null); fetchReportCard(ward); }}
              >
                <span className={styles.wardSelectorAvatar}>
                  {ward.student_name?.charAt(0)}
                </span>
                <span className={styles.wardSelectorName}>{ward.student_name}</span>
              </button>
            ))}
          </div>
        )}

        {reportCardLoading ? (
          <SkeletonLoader type="card" count={3} />
        ) : !reportData ? (
          <div className={styles.emptyState}>
            <FiAward className={styles.emptyIcon} />
            <p>No report card available yet</p>
          </div>
        ) : (
          <div className={styles.reportCardPreviewSection}>
            <h3 className={styles.previewTitle}>Preview - IQRA Academy Report Card</h3>
            <div className={styles.reportCardPreview}>
              <ReportCardFront data={reportData} schoolInfo={schoolInfo} />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAttendanceTab = () => {
    const currentKey = selectedAttendanceWard ? `${selectedAttendanceWard.school_id}_${selectedTable}` : null;
    const currentAttendance = currentKey ? wardAttendance[currentKey] || [] : [];

    return (
      <div className={styles.attendanceContainer}>
        <h2 className={styles.tabTitle}>Ward Attendance</h2>

        {/* Ward Selector - only show if multiple wards */}
        {wards.length > 1 && (
          <div className={styles.wardSelector}>
            {wards.map((ward) => (
              <button
                key={ward.school_id}
                className={`${styles.wardSelectorBtn} ${selectedAttendanceWard?.school_id === ward.school_id ? styles.wardSelectorActive : ''}`}
                onClick={() => {
                  setSelectedAttendanceWard(ward);
                  setSelectedTable(null);
                  setAttendanceTables([]);
                  setMonthlySummary(null);
                  setAttendanceTrends([]);
                }}
              >
                <span className={styles.wardSelectorAvatar}>
                  {ward.student_name?.charAt(0)}
                </span>
                <span className={styles.wardSelectorName}>{ward.student_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected Ward Info */}
        {selectedAttendanceWard && (
          <div className={styles.selectedWardInfo}>
            <span className={styles.selectedWardName}>{selectedAttendanceWard.student_name}</span>
            <span className={styles.selectedWardClass}>Class {selectedAttendanceWard.class}</span>
          </div>
        )}

        {/* View Selector */}
        {selectedAttendanceWard && (
          <AttendanceViewSelector 
            view={attendanceView} 
            onViewChange={setAttendanceView} 
          />
        )}

        {/* Error State */}
        {attendanceError && (
          <div className={styles.errorState}>
            <p>{attendanceError}</p>
            <button 
              className={styles.retryButton}
              onClick={() => fetchAttendanceTables(selectedAttendanceWard)}
            >
              Retry
            </button>
          </div>
        )}

        {/* No class assigned */}
        {selectedAttendanceWard && !selectedAttendanceWard.class && (
          <div className={styles.emptyState}>
            <FiCalendar className={styles.emptyIcon} />
            <p>Attendance unavailable - no class assigned</p>
          </div>
        )}

        {/* Monthly Summary View */}
        {attendanceView === 'monthly' && selectedAttendanceWard?.class && (
          <MonthlySummaryView
            summary={monthlySummary}
            loading={attendanceLoading}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={setSelectedMonth}
            onYearChange={setSelectedYear}
            onDownload={() => downloadAttendanceReport(selectedAttendanceWard, selectedYear, selectedMonth)}
            dailyAttendance={dailyAttendance}
          />
        )}

        {/* Trends View */}
        {attendanceView === 'trends' && selectedAttendanceWard?.class && (
          <TrendsView
            trends={attendanceTrends}
            loading={attendanceLoading}
          />
        )}

        {/* Weekly View (Original) */}
        {attendanceView === 'weekly' && selectedAttendanceWard?.class && (
          <>
            {/* Period Selector */}
            {!attendanceError && attendanceTables.length > 0 && (
              <div className={styles.periodSelector}>
                <label className={styles.periodLabel}>Select Week:</label>
                <select
                  className={styles.periodDropdown}
                  value={selectedTable || ''}
                  onChange={(e) => setSelectedTable(e.target.value)}
                >
                  {attendanceTables.map((table) => {
                    // Format week_YYYY_MM_DD to readable date
                    const weekDate = table.replace('week_', '').replace(/_/g, '-');
                    return (
                      <option key={table} value={table}>
                        Week of {new Date(weekDate).toLocaleDateString()}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Loading State */}
            {attendanceLoading && <SkeletonLoader type="card" count={2} />}

            {/* Empty Tables State */}
            {!attendanceLoading && !attendanceError && attendanceTables.length === 0 && (
              <div className={styles.emptyState}>
                <FiCalendar className={styles.emptyIcon} />
                <p>No attendance periods found</p>
              </div>
            )}

            {/* Attendance Cards */}
            {!attendanceLoading && !attendanceError && currentAttendance.length > 0 && (
              <div className={styles.attendanceCards}>
                {currentAttendance.map((record, index) => {
                  const summary = calculateAttendanceSummary(record);
                  const weekDate = record.week_start || selectedTable?.replace('week_', '').replace(/_/g, '-');
                  return (
                    <div key={index} className={styles.attendanceCard}>
                      <div className={styles.attendanceHeader}>
                        <span className={styles.attendancePeriod}>{record.student_name}</span>
                        <span className={styles.weekStart}>
                          Week of {weekDate ? new Date(weekDate).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      
                      <div className={styles.daysGrid}>
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                          <div key={day} className={styles.dayItem}>
                            <span className={styles.dayLabel}>{day.slice(0, 3).toUpperCase()}</span>
                            <span className={`${styles.dayStatus} ${styles[`status${getAttendanceIndicator(record[day])}`]}`}>
                              {getAttendanceIndicator(record[day])}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className={styles.summaryRow}>
                        <span className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Present:</span>
                          <span className={styles.summaryValueP}>{summary.present}</span>
                        </span>
                        <span className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Absent:</span>
                          <span className={styles.summaryValueA}>{summary.absent}</span>
                        </span>
                        <span className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Late:</span>
                          <span className={styles.summaryValueL}>{summary.late}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* No attendance data for selected period */}
            {!attendanceLoading && !attendanceError && selectedTable && currentAttendance.length === 0 && attendanceTables.length > 0 && (
              <div className={styles.emptyState}>
                <FiCalendar className={styles.emptyIcon} />
                <p>No attendance records for this period</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderPostsTab = () => (
    <div className={styles.postsContainer}>
      <h2 className={styles.tabTitle}>Posts for Guardians</h2>
      {postsLoading ? (
        <SkeletonLoader type="card" count={3} />
      ) : profilePosts.length > 0 ? (
        profilePosts.map(post => (
          <PostCard key={post.id} post={post} onLike={handleLike} />
        ))
      ) : (
        <div className={styles.emptyState}>
          <FiFileText className={styles.emptyIcon} />
          <p>No posts available yet</p>
        </div>
      )}
    </div>
  );

  // Initialize chat when communications tab is active
  useEffect(() => {
    if (activeTab === 'communications' && guardianInfo) {
      const guardianId = guardianInfo?.guardian_phone || guardianInfo?.guardian_name || 'unknown';
      const currentUserId = `guardian_${guardianId}`;
      
      // Initialize Socket.IO
      if (!socketRef.current) {
        console.log('Initializing socket for:', currentUserId);
        socketRef.current = io('');
        socketRef.current.emit('join', currentUserId);

        socketRef.current.on('new_message', (data) => {
          console.log('New message received via socket:', data);
          
          // Add message to current conversation if it matches
          if (data.message && activeConversation && data.conversationId === activeConversation.id) {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === data.message.id)) {
                return prev;
              }
              return [...prev, data.message];
            });
          }
          
          // Refresh conversations list
          fetchChatConversations(currentUserId);
        });

        socketRef.current.on('connect', () => {
          console.log('Socket connected');
        });

        socketRef.current.on('disconnect', () => {
          console.log('Socket disconnected');
        });
      }

      fetchChatConversations(currentUserId);
    }

    return () => {
      // Don't disconnect when switching tabs, keep connection alive
    };
  }, [activeTab, guardianInfo, activeConversation]);

  const fetchChatConversations = async (userId) => {
    try {
      const res = await axios.get(`/api/chats/conversations?userId=${userId}`);
      setConversations(res.data.map(c => ({ ...c, currentUserId: userId })));
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setChatLoading(false);
    }
  };

  const fetchChatContacts = async () => {
    setContactsLoading(true);
    try {
      const teachersRes = await axios.get('/api/chats/contacts/teachers');
      
      // Add the main admin (from /communication page)
      const mainAdmin = {
        id: 'admin_1',
        name: 'Admin',
        type: 'admin',
        role: 'Admin'
      };
      
      // Combine: admin first, then teachers
      const allContacts = [
        mainAdmin,
        ...teachersRes.data.map(t => ({ ...t, type: 'teacher' }))
      ];
      
      setContacts(allContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchChatMessages = async (conversationId, userId) => {
    setMessagesLoading(true);
    try {
      const res = await axios.get(`/api/chats/conversations/${conversationId}/messages`);
      setMessages(res.data);
      
      await axios.put('/api/chats/messages/read', {
        conversationId,
        userId
      });
      
      fetchChatConversations(userId);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSelectConversation = async (conversation) => {
    const guardianId = guardianInfo?.guardian_phone || guardianInfo?.guardian_name || 'unknown';
    const currentUserId = `guardian_${guardianId}`;
    setActiveConversation(conversation);
    await fetchChatMessages(conversation.id, currentUserId);
  };

  const handleSendMessage = async (formData) => {
    const guardianId = guardianInfo?.guardian_phone || guardianInfo?.guardian_name || 'unknown';
    const currentUserId = `guardian_${guardianId}`;
    
    try {
      const res = await axios.post(
        `/api/chats/conversations/${activeConversation.id}/messages`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const newMessage = res.data;
      setMessages(prev => [...prev, newMessage]);

      if (socketRef.current) {
        socketRef.current.emit('send_message', {
          conversationId: activeConversation.id,
          message: newMessage
        });
      }

      fetchChatConversations(currentUserId);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const handleNewChat = () => {
    setShowNewChatModal(true);
    fetchChatContacts();
  };

  const handleStartConversation = async (contact) => {
    const guardianId = guardianInfo?.guardian_phone || guardianInfo?.guardian_name || 'unknown';
    const currentUserId = `guardian_${guardianId}`;
    const currentUserName = guardianInfo?.guardian_name || 'Guardian';
    const currentUserType = 'guardian';
    
    console.log('Starting conversation with:', contact);
    console.log('Guardian user ID:', currentUserId);
    
    try {
      const res = await axios.post('/api/chats/conversations', {
        type: 'direct',
        participants: [
          { user_id: currentUserId, user_name: currentUserName, user_type: currentUserType },
          { user_id: contact.id, user_name: contact.name, user_type: contact.type }
        ]
      });

      console.log('Conversation created:', res.data);

      setShowNewChatModal(false);
      setSearchQuery('');
      await fetchChatConversations(currentUserId);
      
      const newConv = res.data;
      const convDetails = await axios.get(`/api/chats/conversations/${newConv.id}`);
      console.log('Conversation details:', convDetails.data);
      
      setActiveConversation(convDetails.data);
      await fetchChatMessages(newConv.id, currentUserId);
    } catch (error) {
      console.error('Error starting conversation:', error);
      console.error('Error response:', error.response?.data);
      alert('Failed to start conversation: ' + (error.response?.data?.error || error.message));
    }
  };

  const renderCommunicationsTab = () => {
    const guardianId = guardianInfo?.guardian_phone || guardianInfo?.guardian_name || 'unknown';
    const currentUserId = `guardian_${guardianId}`;
    const currentUserName = guardianInfo?.guardian_name || 'Guardian';
    const currentUserType = 'guardian';

    const filteredContacts = contacts.filter(c =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className={styles.communicationsContainer}>
        <div className={styles.chatInterface}>
          <div className={styles.chatHeader}>
            <h2><FiMessageSquare /> Messages</h2>
          </div>

          <div className={styles.chatContent}>
            <div className={styles.conversationsList}>
              {chatLoading ? (
                <div className={styles.chatLoading}>Loading...</div>
              ) : conversations.length === 0 ? (
                <div className={styles.chatEmpty}>
                  <FiMessageSquare />
                  <p>No messages yet</p>
                  <small>Start a conversation with a teacher</small>
                </div>
              ) : (
                <ConversationList
                  conversations={conversations}
                  activeId={activeConversation?.id}
                  onSelect={handleSelectConversation}
                  loading={false}
                />
              )}
            </div>

            <div className={styles.chatArea}>
              {activeConversation ? (
                <ChatWindow
                  conversation={activeConversation}
                  messages={messages}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  currentUserType={currentUserType}
                  onSendMessage={handleSendMessage}
                  isLoading={messagesLoading}
                  socket={socketRef.current}
                />
              ) : (
                <div className={styles.chatNoSelection}>
                  <FiMessageSquare />
                  <h3>Select a conversation</h3>
                </div>
              )}
            </div>
          </div>
        </div>

        {showNewChatModal && (
          <div className={styles.modalOverlay} onClick={() => setShowNewChatModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>New Conversation</h2>
                <button className={styles.closeBtn} onClick={() => setShowNewChatModal(false)}>
                  <FiX />
                </button>
              </div>

              <div className={styles.modalSearch}>
                <FiSearch />
                <input
                  type="text"
                  placeholder="Search teachers and admins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className={styles.modalContent}>
                {contactsLoading ? (
                  <div className={styles.modalLoading}>Loading...</div>
                ) : filteredContacts.length > 0 ? (
                  <div className={styles.contactsList}>
                    {filteredContacts.map(contact => (
                      <div
                        key={contact.id}
                        className={styles.contactItem}
                        onClick={() => handleStartConversation(contact)}
                      >
                        <div className={styles.contactAvatar}>
                          <FiUser />
                        </div>
                        <div className={styles.contactInfo}>
                          <h4>{contact.name}</h4>
                          <p>{contact.type === 'admin' ? 'Administrator' : 'Teacher'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.modalEmpty}>
                    <FiUser />
                    <p>No teachers found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSettingsTab = () => (
    <SettingsTab userId={username} userType="guardian" appType="guardian" appName="Guardian App" onLogout={handleLogout} />
  );

  const renderEvalBookTab = () => {
    // Feedback form view
    if (evalBookView === 'feedback' && selectedEvaluation) {
      const fieldValues = selectedEvaluation.field_values || {};
      return (
        <div className={styles.evalBookContainer}>
          <div className={styles.evalBookHeader}>
            <button className={styles.evalBackBtn} onClick={backToEvalList}>
              ← Back
            </button>
            <div className={styles.evalHeaderInfo}>
              <h3>{selectedEvaluation.student_name}</h3>
              <span>{new Date(selectedEvaluation.evaluation_date).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Teacher's Evaluation */}
          <CollapsibleCard title="Teacher's Evaluation" icon={<FiFileText />} defaultExpanded={true}>
            <div className={styles.evalFieldsList}>
              {Object.entries(fieldValues).map(([fieldName, value]) => (
                <div key={fieldName} className={styles.evalFieldItem}>
                  <span className={styles.evalFieldLabel}>{fieldName}</span>
                  <span className={styles.evalFieldValue}>{value}</span>
                </div>
              ))}
              {Object.keys(fieldValues).length === 0 && (
                <p className={styles.noData}>No evaluation data available</p>
              )}
            </div>
          </CollapsibleCard>

          {/* Guardian Feedback */}
          <CollapsibleCard title="Your Feedback" icon={<FiMessageSquare />} defaultExpanded={true}>
            <div className={styles.feedbackForm}>
              <textarea
                className={styles.feedbackTextarea}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Enter your feedback about your ward's progress..."
                rows={5}
              />
              <button 
                className={styles.feedbackSubmitBtn}
                onClick={submitFeedback}
                disabled={feedbackSaving || !feedbackText.trim()}
              >
                <FiSend /> {feedbackSaving ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </CollapsibleCard>
        </div>
      );
    }

    // Reports view
    if (evalBookView === 'reports') {
      const wardEvaluations = selectedReportWard 
        ? evalBookEvaluations.filter(e => e.student_name === selectedReportWard)
        : evalBookEvaluations;
      
      const totalEvals = wardEvaluations.length;
      const respondedEvals = wardEvaluations.filter(e => e.status === 'responded' || e.feedback_text).length;
      const pendingEvals = totalEvals - respondedEvals;
      
      // Group by month
      const groupedByMonth = wardEvaluations.reduce((acc, e) => {
        const month = new Date(e.evaluation_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        if (!acc[month]) acc[month] = [];
        acc[month].push(e);
        return acc;
      }, {});

      return (
        <div className={styles.evalBookContainer}>
          <div className={styles.evalReportHeader}>
            <button className={styles.evalBackBtn} onClick={() => setEvalBookView('list')}>
              ← Back
            </button>
            <h3>Evaluation Reports</h3>
          </div>

          {/* Ward Selector */}
          {wards.length > 1 && (
            <div className={styles.evalWardSelector}>
              <label>Select Ward:</label>
              <select 
                value={selectedReportWard || ''} 
                onChange={(e) => setSelectedReportWard(e.target.value || null)}
              >
                <option value="">All Wards</option>
                {wards.map(w => (
                  <option key={w.student_name} value={w.student_name}>{w.student_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Summary Cards */}
          <div className={styles.evalReportSummary}>
            <div className={styles.evalSummaryCard}>
              <span className={styles.evalSummaryValue}>{totalEvals}</span>
              <span className={styles.evalSummaryLabel}>Total</span>
            </div>
            <div className={styles.evalSummaryCard}>
              <span className={styles.evalSummaryValue} style={{ color: '#16a34a' }}>{respondedEvals}</span>
              <span className={styles.evalSummaryLabel}>Responded</span>
            </div>
            <div className={styles.evalSummaryCard}>
              <span className={styles.evalSummaryValue} style={{ color: '#d97706' }}>{pendingEvals}</span>
              <span className={styles.evalSummaryLabel}>Pending</span>
            </div>
          </div>

          {/* Reports by Month */}
          {Object.keys(groupedByMonth).length === 0 ? (
            <div className={styles.emptyState}>
              <FiFileText className={styles.emptyIcon} />
              <p>No evaluation reports yet</p>
            </div>
          ) : (
            <div className={styles.evalReportMonths}>
              {Object.entries(groupedByMonth).map(([month, evals]) => (
                <div key={month} className={styles.evalMonthGroup}>
                  <h4 className={styles.evalMonthTitle}>{month}</h4>
                  <div className={styles.evalMonthList}>
                    {evals.map(evaluation => (
                      <div key={evaluation.id} className={styles.evalReportItem} onClick={() => openFeedbackForm(evaluation)}>
                        <div className={styles.evalReportItemInfo}>
                          <span className={styles.evalReportItemName}>{evaluation.student_name}</span>
                          <span className={styles.evalReportItemDate}>
                            {new Date(evaluation.evaluation_date).toLocaleDateString()}
                          </span>
                        </div>
                        <span className={`${styles.evalReportItemStatus} ${evaluation.feedback_text ? styles.statusDone : styles.statusPend}`}>
                          {evaluation.feedback_text ? '✓' : '○'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // List view
    return (
      <div className={styles.evalBookContainer}>
        <h2 className={styles.tabTitle}>Evaluation Book</h2>
        
        {/* View Reports Button */}
        {evalBookEvaluations.length > 0 && (
          <button className={styles.evalViewReportsBtn} onClick={() => setEvalBookView('reports')}>
            <FiFileText /> View Reports
          </button>
        )}
        
        {evalBookLoading ? (
          <SkeletonLoader type="card" count={3} />
        ) : evalBookEvaluations.length === 0 ? (
          <div className={styles.emptyState}>
            <FiBook className={styles.emptyIcon} />
            <p>No evaluations received yet</p>
            <small>Evaluations from teachers will appear here</small>
          </div>
        ) : (
          <div className={styles.evalBookList}>
            {evalBookEvaluations.map((evaluation) => (
              <div key={evaluation.id} className={styles.evalBookCard}>
                <div className={styles.evalCardHeader}>
                  <div className={styles.evalCardInfo}>
                    <span className={styles.evalStudentName}>{evaluation.student_name}</span>
                    <span className={styles.evalDate}>
                      {new Date(evaluation.evaluation_date).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`${styles.evalStatus} ${styles[`status${evaluation.status}`]}`}>
                    {evaluation.status === 'responded' ? 'Responded' : 
                     evaluation.status === 'sent' ? 'Pending' : evaluation.status}
                  </span>
                </div>
                <div className={styles.evalCardClass}>
                  <FiUsers /> {evaluation.class_name}
                </div>
                {evaluation.feedback_text && (
                  <div className={styles.evalFeedbackPreview}>
                    <FiCheck /> Feedback submitted
                  </div>
                )}
                <button 
                  className={styles.evalViewBtn}
                  onClick={() => openFeedbackForm(evaluation)}
                >
                  {evaluation.feedback_text ? 'View / Edit Feedback' : 'Add Feedback'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Open the Cash Receipt Voucher as an in-app modal (not a new window).
  const openCashReceiptVoucher = (wardPayment, payment) => {
    const firstPmt = payment.payments?.[0] || {};
    const amount = payment.paidAmount || payment.totalAmount || 0;
    const receiptDate = firstPmt.paymentDate
      ? new Date(firstPmt.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(payment.issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    setReceiptVoucher({
      receiptNumber: payment.receiptNumber || payment.invoiceNumber || '',
      date: receiptDate,
      studentName: wardPayment.ward.studentName,
      studentId: wardPayment.ward.schoolId || '',
      className: wardPayment.ward.class || '',
      monthsPaid: payment.month ? [payment.month] : [],
      amountInWords: numberToWords(amount),
      amountInFigures: amount.toFixed(2),
      paymentMethod: firstPmt.paymentMethod || '',
      cashierName: firstPmt.cashierName || '',
      invoiceNumber: payment.invoiceNumber || '',
      invoiceRefCode: payment.invoiceNumber || '',
      schoolInfo
    });
  };

  const closeReceiptVoucher = () => setReceiptVoucher(null);

  const renderPaymentsTab = () => {
    const payWard = activePaymentWard || paymentData[0];
    const wardPayment = payWard
      ? paymentData.find(p => p.ward.studentName === payWard.ward.studentName) || null
      : null;

    return (
      <div className={styles.paymentsContainer}>
        <h2 className={styles.tabTitle}>Monthly Payments</h2>

        {/* Unpaid notification */}
        {unpaidCount > 0 && (
          <div className={styles.unpaidNotification}>
            <FiAlertCircle className={styles.notificationIcon} />
            <div className={styles.notificationContent}>
              <span className={styles.notificationTitle}>Unpaid Invoices</span>
              <span className={styles.notificationText}>
                You have {unpaidCount} unpaid invoice{unpaidCount !== 1 ? 's' : ''} across all wards
              </span>
            </div>
          </div>
        )}

        {/* Student tabs — one student at a time */}
        {paymentData.length > 1 && (
          <div className={styles.studentTabs}>
            {paymentData.map(p => (
              <button
                key={p.ward.studentName}
                className={`${styles.studentTab} ${wardPayment?.ward.studentName === p.ward.studentName ? styles.studentTabActive : ''}`}
                onClick={() => setActivePaymentWard(p)}
              >
                {p.ward.studentName}
              </button>
            ))}
          </div>
        )}

        {/* Loading State */}
        {paymentLoading && <SkeletonLoader type="card" count={3} />}

        {/* No data state */}
        {!paymentLoading && paymentData.length === 0 && (
          <div className={styles.emptyState}>
            <FiDollarSign className={styles.emptyIcon} />
            <p>No payment information available</p>
          </div>
        )}

        {/* Active student's payment data */}
        {!paymentLoading && wardPayment && (
          <>
            {/* Ward Header */}
            <div className={styles.wardHeader}>
              <div className={styles.wardAvatar}>
                {wardPayment.ward.studentName?.charAt(0)}
              </div>
              <div className={styles.wardInfo}>
                <h3 className={styles.wardName}>{wardPayment.ward.studentName}</h3>
                <span className={styles.wardClass}>Class {wardPayment.ward.class}</span>
              </div>
            </div>

            {/* Payment Summary Card */}
            <div className={styles.paymentSummaryCard}>
              <h3 className={styles.summaryTitle}>Payment Summary</h3>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Total Invoices</span>
                  <span className={styles.summaryValue}>{wardPayment.summary.totalInvoices}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Paid</span>
                  <span className={`${styles.summaryValue} ${styles.summaryPaid}`}>
                    {wardPayment.summary.paidInvoices}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Unpaid</span>
                  <span className={`${styles.summaryValue} ${styles.summaryUnpaid}`}>
                    {wardPayment.summary.unpaidInvoices}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Total Paid</span>
                  <span className={styles.summaryValue}>
                    {wardPayment.summary.totalPaid.toFixed(2)} ETB
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Balance Due</span>
                  <span className={`${styles.summaryValue} ${styles.summaryBalance}`}>
                    {wardPayment.summary.totalBalance.toFixed(2)} ETB
                  </span>
                </div>
                {wardPayment.summary.overdueInvoices > 0 && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Overdue</span>
                    <span className={`${styles.summaryValue} ${styles.summaryOverdue}`}>
                      {wardPayment.summary.overdueInvoices}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Monthly Payments List */}
            {wardPayment.monthlyPayments && wardPayment.monthlyPayments.length > 0 ? (
              <div className={styles.monthlyPaymentsList}>
                <h3 className={styles.sectionTitle}>Monthly Invoices</h3>
                {wardPayment.monthlyPayments.map((payment, idx) => (
                  <div
                    key={payment.invoiceId || idx}
                    className={`${styles.paymentCard} ${payment.isOverdue ? styles.paymentOverdue : ''} ${payment.isPaid ? styles.paymentPaid : ''}`}
                  >
                    <div className={styles.paymentHeader}>
                      <div className={styles.paymentMonth}>
                        <span className={styles.monthName}>{payment.month}</span>
                        <span className={styles.invoiceNumber}>#{payment.invoiceNumber}</span>
                      </div>
                      <div className={styles.paymentStatusGroup}>
                        {!payment.isPaid && (
                          <span className={styles.unlockedBadge}>UNLOCKED · NOT PAID</span>
                        )}
                        <span className={`${styles.paymentStatus} ${styles[`status${payment.status}`]}`}>
                          {payment.isPaid ? 'PAID' : payment.isOverdue ? 'OVERDUE' : payment.status}
                        </span>
                      </div>
                    </div>

                    <div className={styles.paymentDetails}>
                      <div className={styles.paymentRow}>
                        <span className={styles.paymentLabel}>Issue Date:</span>
                        <span className={styles.paymentValue}>
                          {new Date(payment.issueDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div className={styles.paymentRow}>
                        <span className={styles.paymentLabel}>Due Date:</span>
                        <span className={styles.paymentValue}>
                          {new Date(payment.dueDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div className={styles.paymentRow}>
                        <span className={styles.paymentLabel}>Total Amount:</span>
                        <span className={styles.paymentValue}>{payment.totalAmount.toFixed(2)} ETB</span>
                      </div>
                      <div className={styles.paymentRow}>
                        <span className={styles.paymentLabel}>Paid Amount:</span>
                        <span className={`${styles.paymentValue} ${styles.paidAmount}`}>
                          {payment.paidAmount.toFixed(2)} ETB
                        </span>
                      </div>
                      {payment.balance > 0 && (
                        <div className={styles.paymentRow}>
                          <span className={styles.paymentLabel}>Balance:</span>
                          <span className={`${styles.paymentValue} ${styles.balanceAmount}`}>
                            {payment.balance.toFixed(2)} ETB
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Cash Receipt Voucher button (paid invoices only) */}
                    {payment.isPaid && (
                      <button
                        className={styles.voucherButton}
                        onClick={() => openCashReceiptVoucher(wardPayment, payment)}
                      >
                        <FiCheck /> Cash Receipt Voucher
                      </button>
                    )}

                    {/* Payment History */}
                    {payment.payments && payment.payments.length > 0 && (
                      <div className={styles.paymentHistory}>
                        <span className={styles.historyTitle}>Payment History:</span>
                        {payment.payments.map((pmt, pmtIdx) => (
                          <div key={pmtIdx} className={styles.historyItem}>
                            <FiCheck className={styles.historyIcon} />
                            <span className={styles.historyDate}>
                              {new Date(pmt.paymentDate).toLocaleDateString()}
                            </span>
                            <span className={styles.historyAmount}>{pmt.amount.toFixed(2)} ETB</span>
                            <span className={styles.historyMethod}>{pmt.paymentMethod}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <FiDollarSign className={styles.emptyIcon} />
                <p>No invoices have been generated for {wardPayment.ward.studentName} yet</p>
                <p className={styles.emptyHint}>Contact the school to generate monthly invoices</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderNotificationsTab = () => {
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 60) return `${diffMins} minutes ago`;
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      return date.toLocaleDateString();
    };

    return (
      <div className={styles.notificationsContainer}>
        <h2 className={styles.tabTitle}>Notifications</h2>
        
        {notificationsLoading ? (
          <SkeletonLoader type="card" count={3} />
        ) : notifications.length > 0 ? (
          <div className={styles.notificationsList}>
            {notifications.map((notif) => (
              <div key={notif.id} className={`${styles.notificationCard} ${!notif.read ? styles.unread : ''}`}>
                <div className={`${styles.notifIcon} ${styles[notif.type]}`}>
                  {notif.type === 'attendance' ? <FiCalendar /> : <FiDollarSign />}
                </div>
                <div className={styles.notifContent}>
                  <h3>{notif.title}</h3>
                  <p>{notif.message}</p>
                  {notif.ward && (
                    <span className={styles.notifWard}>Ward: {notif.ward}</span>
                  )}
                  <span className={styles.notifTime}>
                    {formatDate(notif.date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <FiBell className={styles.emptyIcon} />
            <p>No notifications yet</p>
          </div>
        )}
        
        <div className={styles.notifInfo}>
          <FiBell />
          <p>You'll receive daily attendance reports at 4:00 PM and monthly payment summaries on the 1st of each month.</p>
        </div>
      </div>
    );
  };

  const renderMoreTab = () => (
    <div className={styles.moreContainer}>
      <h2 className={styles.tabTitle}>More</h2>
      <div className={styles.moreGrid}>
        <button className={styles.moreItem} onClick={() => setActiveTab('posts')}>
          <span className={styles.moreIcon}><FiFileText /></span>
          <span className={styles.moreLabel}>Posts</span>
        </button>
        <button className={styles.moreItem} onClick={() => setActiveTab('evalbook')}>
          <span className={styles.moreIcon}><FiBook /></span>
          <span className={styles.moreLabel}>Eval Book</span>
        </button>
        <button className={styles.moreItem} onClick={() => setActiveTab('attendance')}>
          <span className={styles.moreIcon}><FiCalendar /></span>
          <span className={styles.moreLabel}>Attendance</span>
        </button>
        <button className={styles.moreItem} onClick={() => setActiveTab('communications')}>
          <span className={styles.moreIcon}><FiMessageSquare /></span>
          <span className={styles.moreLabel}>Messages</span>
        </button>
        <button className={styles.moreItem} onClick={() => setActiveTab('settings')}>
          <span className={styles.moreIcon}><FiSettings /></span>
          <span className={styles.moreLabel}>Settings</span>
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'marklist':
        return renderMarkListTab();
      case 'reportcard':
        return renderReportCardTab();
      case 'evalbook':
        return renderEvalBookTab();
      case 'notifications':
        return renderNotificationsTab();
      case 'payments':
        return renderPaymentsTab();
      case 'attendance':
        return renderAttendanceTab();
      case 'posts':
        return renderPostsTab();
      case 'communications':
        return renderCommunicationsTab();
      case 'settings':
        return renderSettingsTab();
      case 'more':
        return renderMoreTab();
      default:
        return renderProfileTab();
    }
  };

  if (isLoading) {
    return (
      <MobileProfileLayout 
        title="IQRA Parent" 
        onLogout={handleLogout}
        onNotificationClick={handleNotificationClick}
        notificationCount={unreadNotificationCount}
      >
        <SkeletonLoader type="profile" />
        <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  if (error) {
    return (
      <MobileProfileLayout 
        title="IQRA Parent" 
        onLogout={handleLogout}
        onNotificationClick={handleNotificationClick}
        notificationCount={unreadNotificationCount}
      >
        <div className={styles.errorContainer}>
          <p>{error}</p>
          <button onClick={fetchProfile} className={styles.retryButton}>
            Try Again
          </button>
        </div>
        <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  if (!guardianInfo || wards.length === 0) {
    return (
      <MobileProfileLayout 
        title="IQRA Parent" 
        onLogout={handleLogout}
        onNotificationClick={handleNotificationClick}
        notificationCount={unreadNotificationCount}
      >
        <div className={styles.errorContainer}>
          <p>Guardian not found.</p>
        </div>
        <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  return (
    <MobileProfileLayout
      title={guardianInfo?.guardian_name || 'IQRA Parent'}
      onLogout={handleLogout}
      onRefresh={handleRefresh}
      onNotificationClick={handleNotificationClick}
      notificationCount={unreadNotificationCount}
    >
      {renderContent()}
      <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      <toast.ToastContainer />

      {/* Cash Receipt Voucher modal — in-app overlay */}
      {receiptVoucher && (
        <div className={styles.receiptModalOverlay} onClick={closeReceiptVoucher}>
          <div className={styles.receiptModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.receiptModalHeader}>
              <span className={styles.receiptModalTitle}>Cash Receipt Voucher</span>
              <div className={styles.receiptModalActions}>
                <button className={styles.receiptPrintBtn} onClick={() => window.print()}>
                  <FiFileText /> Print
                </button>
                <button className={styles.receiptCloseBtn} onClick={closeReceiptVoucher}>
                  <FiX />
                </button>
              </div>
            </div>
            <div className={styles.receiptModalBody}>
              <InvoiceReceipt receiptData={receiptVoucher} schoolInfo={schoolInfo} />
            </div>
          </div>
        </div>
      )}
    </MobileProfileLayout>
  );
};

export default GuardianProfile;
