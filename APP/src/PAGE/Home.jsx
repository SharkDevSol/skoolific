// Updated PAGE/Home.jsx - With new Sidebar and Header components
import { useState, useEffect, useMemo } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import styles from "./Home.module.css";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "../context/AppContext";
import { filterNavByPermissions } from "../utils/permissionUtils";
import Sidebar from "../COMPONENTS/Sidebar/Sidebar";
import Header from "../COMPONENTS/Header/Header";
import { 
  FiHome, FiUser, FiUsers, FiBook, FiCalendar, 
  FiMessageSquare, FiFileText, FiSettings, 
  FiFilePlus, 
  FiChevronDown, FiChevronRight, FiMenu, 
  FiLogOut, FiUser as FiProfile, 
  FiSearch, FiAward,
  FiPieChart, FiDatabase,
  FiCheckCircle, FiDollarSign, FiTrendingUp,
  FiShoppingCart, FiPackage, FiTool, FiClock, FiBell, FiRefreshCw, FiAlertCircle, FiMoon, FiSun, FiSmile,
  FiClipboard, FiEdit3,
  FiCpu, FiUpload, FiBookOpen, FiGrid, FiShuffle, FiHelpCircle, FiPlay, FiArchive, FiBarChart2
} from "react-icons/fi";
import { FaGraduationCap, FaChalkboardTeacher, FaRegCalendarAlt } from "react-icons/fa";
import { Home as HomeIcon, Users, BookOpen, DollarSign, Package, Briefcase, Settings } from 'lucide-react';

const Home = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, profile, t, updateTheme } = useApp();
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    registration: true,
    lists: true,
    finance: false,
    academic: false,
    staff_management: false,
    schedule: false,
    kg: false,
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifications] = useState([
    {
      id: '1',
      type: 'info',
      title: 'New Student Registered',
      message: 'John Doe has been registered',
      timestamp: new Date(),
      read: false
    },
    {
      id: '2',
      type: 'warning',
      title: 'Payment Due',
      message: '5 students have pending payments',
      timestamp: new Date(),
      read: false
    },
    {
      id: '3',
      type: 'success',
      title: 'Report Generated',
      message: 'Monthly report is ready',
      timestamp: new Date(),
      read: true
    }
  ]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  const toggleDarkMode = () => {
    const newMode = theme.mode === 'light' ? 'dark' : 'light';
    updateTheme({ ...theme, mode: newMode });
    // Also update the data-theme attribute on the document
    document.documentElement.setAttribute('data-theme', newMode);
  };

  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('userType');
    localStorage.removeItem('userPermissions');
    localStorage.removeItem('authToken');
    localStorage.removeItem('branchCode');
    localStorage.removeItem('staffUser');
    localStorage.removeItem('staffProfile');
    sessionStorage.clear();
    window.location.href = '/login';
  };

  const navItems = [
    {
      path: "/",
      icon: <FiHome />,
      label: t('dashboard'),
      section: null,
    },
    {
      section: t('registration'),
      sectionKey: 'registration',
      icon: <FiUser />,
      items: [
        {
          path: "/create-register-student",
          icon: <FaGraduationCap />,
          label: t('registerStudent'),
        },
        {
          path: "/create-register-staff",
          icon: <FaChalkboardTeacher />,
          label: t('registerStaff'),
        },
      ],
    },
    {
      section: t('lists'),
      sectionKey: 'lists',
      icon: <FiDatabase />,
      items: [
        {
          path: "/list-student",
          icon: <FiUsers />,
          label: t('students'),
        },
        {
          path: "/list-staff",
          icon: <FiUsers />,
          label: t('staff'),
        },
        {
          path: "/list-guardian",
          icon: <FiUsers />,
          label: t('guardians'),
        },
      ],
    },
    {
      section: 'Finance Management',
      sectionKey: 'finance',
      icon: <FiDollarSign />,
      items: [
        {
          path: "/finance",
          icon: <FiPieChart />,
          label: 'Finance Dashboard',
        },
        {
          path: "/finance/fee-management",
          icon: <FiDollarSign />,
          label: 'Fee Management',
        },
        {
          path: "/finance/fee-types",
          icon: <FiDollarSign />,
          label: 'Fee Types',
        },
        {
          path: "/finance/monthly-payments",
          icon: <FiCalendar />,
          label: 'Monthly Payments',
        },
        {
          path: "/finance/student-exemption",
          icon: <FiAward />,
          label: 'Student Exemption',
        },
        {
          path: "/finance/monthly-payment-settings",
          icon: <FiSettings />,
          label: 'Payment Settings',
        },
        {
          path: "/finance/reports",
          icon: <FiFileText />,
          label: 'Financial Reports',
        },
        {
          path: "/finance/inventory-integration",
          icon: <FiPackage />,
          label: '🔗 Inventory Integration',
        },
      ],
    },
    {
      section: 'Inventory & Stock',
      sectionKey: 'inventory',
      icon: <FiPackage />,
      items: [
        {
          path: "/inventory",
          icon: <FiShoppingCart />,
          label: 'Inventory Dashboard',
        },
        {
          path: "/inventory/items",
          icon: <FiPackage />,
          label: 'Items',
        },
        {
          path: "/inventory/purchase-orders",
          icon: <FiFileText />,
          label: 'Purchase Orders',
        },
        {
          path: "/inventory/movements",
          icon: <FiTool />,
          label: 'Stock Movements',
        },
        {
          path: "/inventory/suppliers",
          icon: <FiUsers />,
          label: 'Suppliers',
        },
        {
          path: "/inventory/reports",
          icon: <FiPieChart />,
          label: 'Inventory Reports',
        },
      ],
    },
    {
      section: 'Asset Management',
      sectionKey: 'assets',
      icon: <FiTool />,
      items: [
        {
          path: "/assets",
          icon: <FiPieChart />,
          label: 'Asset Dashboard',
        },
        {
          path: "/assets/registry",
          icon: <FiFileText />,
          label: 'Asset Registry',
        },
        {
          path: "/assets/assignments",
          icon: <FiUsers />,
          label: 'Assignments',
        },
        {
          path: "/assets/maintenance",
          icon: <FiTool />,
          label: 'Maintenance',
        },
        {
          path: "/assets/depreciation",
          icon: <FiTrendingUp />,
          label: 'Depreciation',
        },
        {
          path: "/assets/disposal",
          icon: <FiFileText />,
          label: 'Disposal',
        },
        {
          path: "/assets/reports",
          icon: <FiPieChart />,
          label: 'Asset Reports',
        },
      ],
    },
    {
      section: 'HR & Staff Management',
      sectionKey: 'hr',
      icon: <FiUsers />,
      items: [
        {
          path: "/hr",
          icon: <FiPieChart />,
          label: 'HR Dashboard',
        },
        {
          path: "/hr/salary",
          icon: <FiDollarSign />,
          label: '💰 Salary Management',
        },
        {
          path: "/hr/attendance",
          icon: <FiCalendar />,
          label: 'Teacher Attendance',
        },
        {
          path: "/hr/attendance-time-settings",
          icon: <FiClock />,
          label: '⏰ Time & Shift Settings',
        },
        {
          path: "/hr/attendance-deduction-settings",
          icon: <FiSettings />,
          label: '⚙️ Attendance Deductions',
        },
        {
          path: "/hr/leave",
          icon: <FiCalendar />,
          label: 'Leave Management',
        },
        {
          path: "/hr/payroll",
          icon: <FiDollarSign />,
          label: 'Payroll System',
        },
        {
          path: "/hr/reports",
          icon: <FiPieChart />,
          label: 'HR Reports',
        },
        {
          path: "/hr/expenses",
          icon: <FiTrendingUp />,
          label: 'Expenses',
        },
        {
          path: "/hr/expense-approval",
          icon: <FiCheckCircle />,
          label: 'Expense Approval',
        },
        {
          path: "/hr/budgets",
          icon: <FiPieChart />,
          label: 'Budgets',
        },
      ],
    },
    {
      section: t('academic'),
      sectionKey: 'academic',
      icon: <FiBook />,
      items: [
        {
          path: "/evaluation",
          icon: <FiPieChart />,
          label: t('evaluation'),
        },
        {
          path: "/evaluation-book",
          icon: <FiBook />,
          label: t('evaluationBook'),
        },
        // ===========================================
        // ACADEMIC
        // ===========================================
        {
          path: "/mark-list-view",
          icon: <FiFileText />,
          label: t('markLists'),
        },
        {
          path: "/student-attendance-system",
          icon: <FiCheckCircle />,
          label: '📋 Student Attendance (Weekly)',
        },
        {
          path: "/student-attendance-time-settings",
          icon: <FiClock />,
          label: '⚙️ Student Attendance Settings',
        },
        {
          path: "/reports/registrations",
          icon: <FiUsers />,
          label: '📊 Registration Report (New/Old + Today)',
        },
        {
          path: "/create-mark-list",
          icon: <FiFilePlus />,
          label: t('createMarklist'),
        },
        {
          path: "/report-card",
          icon: <FiAward />,
          label: t('reportCard'),
        },
        {
          path: "/schedule",
          icon: <FiCalendar />,
          label: t('schedule'),
        },
        {
          path: "/faults",
          icon: <FiAlertCircle />,
          label: 'Student Faults',
        },
        {
          path: "/class-teacher-assignment",
          icon: <FaChalkboardTeacher />,
          label: t('classTeachers'),
        },
        {
          path: "/evaluation-book/assignments",
          icon: <FiUsers />,
          label: t('evalBookAssignments'),
        },
      ],
    },
    {
      section: '🤖 SKOOLIFIC AI',
      sectionKey: 'ai',
      icon: <FiCpu />,
      items: [
        { path: "/ai/dashboard", icon: <FiCpu />, label: 'AI Dashboard' },
        { path: "/ai/books/upload", icon: <FiUpload />, label: 'Upload Books' },
        { path: "/ai/books", icon: <FiBook />, label: 'My Books' },
        { path: "/ai/generate/lesson-plan", icon: <FiFileText />, label: 'Lesson Plan' },
        { path: "/ai/generate/lesson-note", icon: <FiBookOpen />, label: 'Lesson Note' },
        { path: "/ai/generate/homework", icon: <FiClipboard />, label: 'Homework' },
        { path: "/ai/generate/worksheet", icon: <FiGrid />, label: 'Worksheet' },
        { path: "/ai/generate/quiz", icon: <FiHelpCircle />, label: 'Quiz' },
        { path: "/ai/generate/exam", icon: <FiEdit3 />, label: 'Exam' },
        { path: "/ai/generate/scramble-exam", icon: <FiShuffle />, label: 'Scramble' },
        { path: "/ai-test-generator", icon: <FiEdit3 />, label: 'Test Generator' },
        { path: "/ai-tests", icon: <FiClipboard />, label: 'Saved Tests' },
        { path: "/ai-test-player", icon: <FiPlay />, label: 'Test Player' },
      ],
    },
    {
      section: t('administration'),
      sectionKey: 'administration',
      icon: <FiSettings />,
      items: [
        {
          path: "/tasks",
          icon: <FiCheckCircle />,
          label: t('tasks'),
        },
        {
          path: "/post",
          icon: <FiMessageSquare />,
          label: t('post'),
        },
        {
          path: "/communication",
          icon: <FiMessageSquare />,
          label: t('communication'),
        },
        {
          path: "/settings",
          icon: <FiSettings />,
          label: t('settings'),
        },
        {
          path: "/sms",
          icon: <FiMessageSquare />,
          label: 'SMS Templates',
        },
        {
          path: "/sms-counter",
          icon: <FiBarChart2 />,
          label: 'SMS Counter',
        },
        {
          path: "/device-status",
          icon: <FiClock />,
          label: '🔌 Device Status',
        },
        {
          path: "/backup",
          icon: <FiArchive />,
          label: 'Data Backup',
        },
        {
          path: "/admin-sub-accounts",
          icon: <FiUsers />,
          label: t('subAccounts'),
        },
      ],
    },
    {
      section: 'KG Management',
      sectionKey: 'kg',
      icon: <FiSmile />,
      items: [
        {
          path: "/kg/evaluation",
          icon: <FiClipboard />,
          label: 'KG Evaluation',
        },
        {
          path: "/kg/evaluation-book",
          icon: <FiBook />,
          label: 'KG Evaluation Book',
        },
        {
          path: "/kg/assignments",
          icon: <FiEdit3 />,
          label: 'KG Assignments',
        },
      ],
    },
  ];

  // Get user type and permissions for filtering navigation
  // Use useState to make these reactive
  const [userType, setUserType] = useState(() => {
    const stored = localStorage.getItem('userType');
    console.log('🔐 Initial userType from localStorage:', stored);
    // If no userType is stored, default to 'admin' for backward compatibility
    return stored || 'admin';
  });
  const [userPermissions, setUserPermissions] = useState(() => {
    try {
      const storedPermissions = localStorage.getItem('userPermissions');
      const parsed = storedPermissions ? JSON.parse(storedPermissions) : [];
      console.log('🔑 Initial permissions from localStorage:', parsed.length, 'permissions', parsed);
      return parsed;
    } catch (e) {
      console.error('❌ Error parsing permissions:', e);
      return [];
    }
  });

  // Update user type and permissions when localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const newUserType = localStorage.getItem('userType') || 'admin';
      console.log('🔄 Storage changed - userType:', newUserType);
      setUserType(newUserType);
      
      try {
        const storedPermissions = localStorage.getItem('userPermissions');
        const parsed = storedPermissions ? JSON.parse(storedPermissions) : [];
        console.log('🔄 Storage changed - permissions:', parsed.length, 'permissions');
        setUserPermissions(parsed);
      } catch (e) {
        console.error('❌ Error parsing permissions on storage change:', e);
        setUserPermissions([]);
      }
    };

    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange);
    
    // Also check on mount
    handleStorageChange();

    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Filter navigation items based on user permissions
  const filteredNavItems = useMemo(() => {
    console.log('🔍 Filtering navigation:', { 
      userType, 
      permissionCount: userPermissions.length,
      permissions: userPermissions 
    });
    
    let filtered = filterNavByPermissions(navItems, userPermissions, userType);
    
    // Sub-accounts should never see the Sub-Accounts management page
    if (userType === 'sub-account') {
      filtered = filtered.map(item => {
        if (item.items) {
          return {
            ...item,
            items: item.items.filter(subItem => subItem.path !== '/admin-sub-accounts')
          };
        }
        return item;
      }).filter(item => !item.items || item.items.length > 0);
    }
    
    console.log('✅ Filtered navigation items:', filtered.length, 'sections');
    return filtered;
  }, [userPermissions, userType]);

  // Convert navItems to Sidebar component format - Keep sections with children
  const menuItems = useMemo(() => {
    const items = [];
    
    filteredNavItems.forEach((item, index) => {
      if (item.path) {
        // Single item (like Dashboard)
        items.push({
          id: `item-${index}`,
          label: item.label,
          icon: item.icon,
          path: item.path,
          roles: []
        });
      } else if (item.items) {
        // Section with sub-items - create parent with children
        items.push({
          id: `section-${index}`,
          label: item.section,
          icon: item.icon,
          path: '#', // No direct path for sections
          roles: [],
          children: item.items.map((subItem, subIndex) => ({
            id: `item-${index}-${subIndex}`,
            label: subItem.label,
            icon: subItem.icon,
            path: subItem.path
          }))
        });
      }
    });
    
    return items;
  }, [filteredNavItems]);

  // Get active menu item based on current path
  const activeMenuItem = useMemo(() => {
    const item = menuItems.find(item => item.path === location.pathname);
    return item?.id || '';
  }, [location.pathname, menuItems]);

  // Get page title based on current route
  const pageTitle = useMemo(() => {
    const item = menuItems.find(item => item.path === location.pathname);
    return item?.label || 'Dashboard';
  }, [location.pathname, menuItems]);

  const handleNavigate = (path) => {
    navigate(path);
  };

  const handleSearch = (query) => {
    console.log('Search:', query);
    // Implement search functionality
  };

  const handleNotificationClick = () => {
    console.log('Notifications clicked');
    // Implement notification panel
  };

  const handleProfileClick = () => {
    navigate('/settings');
  };

  return (
    <div className={styles.container}>
      {/* New Sidebar Component */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
        menuItems={menuItems}
        activeItem={activeMenuItem}
        onNavigate={handleNavigate}
        userRole={userType}
        branding={{
          name: 'Skoolific',
          tagline: 'SCHOOL MANAGEMENT SYSTEM',
          logo: null
        }}
      />

      {/* Main Content Area */}
      <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        {/* New Header Component */}
        <Header
          pageTitle={pageTitle}
          pageSubtitle={`Welcome back, ${profile?.name || 'User'}! Here's what's happening today.`}
          onSearch={handleSearch}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
          user={{
            name: profile?.name || 'User',
            role: userType === 'admin' ? 'Administrator' : 'Sub Account',
            avatar: profile?.profileImage || null
          }}
          onLogout={handleLogout}
          onProfileClick={handleProfileClick}
          isDarkMode={theme.mode === 'dark'}
          onToggleDarkMode={toggleDarkMode}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Page Content */}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className={styles.contentWrapper}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
};

export default Home;
