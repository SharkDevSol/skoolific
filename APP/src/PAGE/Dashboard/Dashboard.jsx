import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import styles from './Dashboard.module.css';
import api from '../../utils/api';
import StatCard from '../../COMPONENTS/StatCard/StatCard';
import {
  Users,
  UserCheck,
  GraduationCap,
  AlertTriangle,
  TrendingUp,
  Calendar,
  DollarSign,
  BookOpen,
  Clock,
  RefreshCw,
  Bell,
  Activity,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

const Dashboard = () => {
  const { theme, t, language } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  
  // Main statistics
  const [stats, setStats] = useState({
    students: { total: 0, male: 0, female: 0, newThisMonth: 0 },
    staff: { total: 0, teachers: 0, admin: 0, support: 0 },
    classes: { total: 0, list: [] },
    attendance: { present: 0, absent: 0, rate: 0, totalRecords: 0 },
    faults: { total: 0, thisWeek: 0, critical: 0, uniqueStudents: 0 },
    marks: { avgScore: 0, passRate: 0, topClass: '', failRate: 0 },
    payments: { collected: 0, pending: 0, total: 0 }
  });

  // Chart data
  const [attendanceData, setAttendanceData] = useState([]);
  const [enrollmentData, setEnrollmentData] = useState([]);
  
  // Recent activity and events
  const [recentActivity, setRecentActivity] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch dashboard stats
      const [dashboardRes] = await Promise.all([
        api.get('/dashboard/enhanced-stats').catch((err) => {
          console.log('Dashboard stats error:', err.message);
          return { data: {} };
        })
      ]);

      const data = dashboardRes.data;
      const basicStats = data.basic || {};

      setStats({
        students: {
          total: basicStats.totalStudents || 485,
          male: basicStats.gender?.male || 256,
          female: basicStats.gender?.female || 229,
          newThisMonth: Math.floor(Math.random() * 20) + 5
        },
        staff: {
          total: basicStats.staffCount || 42,
          teachers: Math.floor((basicStats.staffCount || 42) * 0.7),
          admin: Math.floor((basicStats.staffCount || 42) * 0.2),
          support: Math.floor((basicStats.staffCount || 42) * 0.1)
        },
        classes: {
          total: basicStats.classes?.length || 12,
          list: basicStats.classes || []
        },
        attendance: {
          present: 92,
          absent: 8,
          rate: 92,
          totalRecords: basicStats.totalStudents || 485
        },
        faults: {
          total: basicStats.totalFaults || 47,
          thisWeek: 8,
          critical: 3,
          uniqueStudents: basicStats.uniqueStudentsWithFaults || 32
        },
        marks: {
          avgScore: 76.5,
          passRate: 82,
          topClass: 'Grade 2A',
          failRate: 18
        },
        payments: {
          collected: 125000,
          pending: 45000,
          total: 170000
        }
      });

      // Set chart data
      setAttendanceData([
        { day: 'Mon', present: 450, absent: 35 },
        { day: 'Tue', present: 460, absent: 25 },
        { day: 'Wed', present: 455, absent: 30 },
        { day: 'Thu', present: 470, absent: 15 },
        { day: 'Fri', present: 465, absent: 20 }
      ]);

      setEnrollmentData([
        { month: 'Jan', students: 450 },
        { month: 'Feb', students: 460 },
        { month: 'Mar', students: 470 },
        { month: 'Apr', students: 475 },
        { month: 'May', students: 485 }
      ]);

      // Set recent activity
      setRecentActivity([
        { 
          id: 1, 
          type: 'student', 
          title: 'New Student Registered', 
          description: 'John Doe enrolled in Grade 10A', 
          time: '2 hours ago',
          icon: <Users size={20} />
        },
        { 
          id: 2, 
          type: 'attendance', 
          title: 'Attendance Marked', 
          description: 'Grade 9B attendance completed', 
          time: '3 hours ago',
          icon: <CheckCircle size={20} />
        },
        { 
          id: 3, 
          type: 'payment', 
          title: 'Payment Received', 
          description: '$500 fee payment from Jane Smith', 
          time: '5 hours ago',
          icon: <DollarSign size={20} />
        },
        { 
          id: 4, 
          type: 'exam', 
          title: 'Exam Scheduled', 
          description: 'Mathematics exam for Grade 11', 
          time: '1 day ago',
          icon: <BookOpen size={20} />
        }
      ]);

      // Set upcoming events
      setUpcomingEvents([
        { 
          id: 1, 
          title: 'Parent-Teacher Meeting', 
          date: '2024-02-15', 
          time: '10:00 AM',
          type: 'meeting',
          icon: <Users size={20} />
        },
        { 
          id: 2, 
          title: 'Mathematics Exam', 
          date: '2024-02-18', 
          time: '9:00 AM',
          type: 'exam',
          icon: <BookOpen size={20} />
        },
        { 
          id: 3, 
          title: 'Sports Day', 
          date: '2024-02-20', 
          time: '8:00 AM',
          type: 'event',
          icon: <Activity size={20} />
        },
        { 
          id: 4, 
          title: 'Science Fair', 
          date: '2024-02-25', 
          time: '11:00 AM',
          type: 'event',
          icon: <GraduationCap size={20} />
        }
      ]);

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Chart colors
  const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe'];

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{t('loading') || 'Loading Dashboard...'}</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>{t('dashboard') || 'Dashboard'}</h1>
          <p className={styles.headerSubtitle}>
            {t('dashboardWelcome') || 'Welcome back! Here\'s what\'s happening today.'}
          </p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.lastUpdate}>
            <Clock size={16} /> {t('lastUpdated') || 'Last updated'}: {lastUpdated.toLocaleTimeString()}
          </span>
          <button className={styles.refreshBtn} onClick={fetchAllData}>
            <RefreshCw size={16} /> {t('refresh') || 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className={styles.statsGrid}>
        <StatCard
          icon={<GraduationCap size={24} />}
          title={t('totalStudents') || 'Total Students'}
          value={stats.students.total}
          subtitle={`${stats.students.male} ${t('male') || 'Male'} • ${stats.students.female} ${t('female') || 'Female'}`}
          variant="primary"
          trend={{ value: 5, label: t('vsLastMonth') || 'vs last month' }}
        />
        <StatCard
          icon={<UserCheck size={24} />}
          title={t('staffMembers') || 'Staff Members'}
          value={stats.staff.total}
          subtitle={`${stats.staff.teachers} ${t('teachers') || 'Teachers'}`}
          variant="secondary"
        />
        <StatCard
          icon={<BookOpen size={24} />}
          title={t('classes') || 'Classes'}
          value={stats.classes.total}
          subtitle={t('activeClasses') || 'Active classes'}
          variant="warning"
        />
        <StatCard
          icon={<Calendar size={24} />}
          title={t('attendanceRate') || 'Attendance Rate'}
          value={`${stats.attendance.rate}%`}
          subtitle={t('todayAttendance') || 'Today\'s attendance'}
          variant="success"
          trend={{ value: 2, label: t('vsYesterday') || 'vs yesterday' }}
        />
      </div>

      {/* Charts Section */}
      <div className={styles.chartsGrid}>
        {/* Attendance Chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><Calendar size={20} /> {t('weeklyAttendance') || 'Weekly Attendance'}</h3>
          </div>
          <div className={styles.chartContent}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="day" stroke={theme === 'dark' ? '#fff' : '#666'} />
                <YAxis stroke={theme === 'dark' ? '#fff' : '#666'} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#fff',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="present" fill="#10b981" name={t('present') || 'Present'} radius={[8, 8, 0, 0]} />
                <Bar dataKey="absent" fill="#ef4444" name={t('absent') || 'Absent'} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Enrollment Trend Chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3><TrendingUp size={20} /> {t('enrollmentTrend') || 'Enrollment Trend'}</h3>
          </div>
          <div className={styles.chartContent}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={enrollmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="month" stroke={theme === 'dark' ? '#fff' : '#666'} />
                <YAxis stroke={theme === 'dark' ? '#fff' : '#666'} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#fff',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="students" 
                  stroke="#667eea" 
                  strokeWidth={3}
                  name={t('students.title') || 'Students'}
                  dot={{ fill: '#667eea', r: 6 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity and Events Section */}
      <div className={styles.activityEventsGrid}>
        {/* Recent Activity */}
        <div className={styles.activityCard}>
          <div className={styles.activityHeader}>
            <h3><Activity size={20} /> {t('recentActivity') || 'Recent Activity'}</h3>
          </div>
          <div className={styles.activityList}>
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div key={activity.id} className={styles.activityItem}>
                  <div className={`${styles.activityIcon} ${styles[`activityType_${activity.type}`]}`}>
                    {activity.icon}
                  </div>
                  <div className={styles.activityContent}>
                    <h4 className={styles.activityTitle}>{activity.title}</h4>
                    <p className={styles.activityDesc}>{activity.description}</p>
                    <span className={styles.activityTime}>{activity.time}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.noData}>{t('noRecentActivity') || 'No recent activity'}</p>
            )}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className={styles.eventsCard}>
          <div className={styles.eventsHeader}>
            <h3><Bell size={20} /> {t('upcomingEvents') || 'Upcoming Events'}</h3>
          </div>
          <div className={styles.eventsList}>
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((event) => (
                <div key={event.id} className={styles.eventItem}>
                  <div className={`${styles.eventIcon} ${styles[`eventType_${event.type}`]}`}>
                    {event.icon}
                  </div>
                  <div className={styles.eventContent}>
                    <h4 className={styles.eventTitle}>{event.title}</h4>
                    <div className={styles.eventMeta}>
                      <span className={styles.eventDate}>
                        <Calendar size={14} /> {new Date(event.date).toLocaleDateString()}
                      </span>
                      <span className={styles.eventTime}>
                        <Clock size={14} /> {event.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.noData}>{t('noUpcomingEvents') || 'No upcoming events'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
