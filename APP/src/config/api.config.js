/**
 * Centralized API Configuration - Frontend
 * 
 * This file provides a single source of truth for all API endpoints and base URLs
 * for the frontend application. It mirrors the backend configuration structure
 * and supports multiple environments through Vite environment variables.
 * 
 * Usage:
 *   import { getBaseURL, getEndpoint, API_ENDPOINTS } from '@/config/api.config';
 *   
 *   // Get base URL for current environment
 *   const baseURL = getBaseURL();
 *   
 *   // Get full endpoint URL
 *   const loginURL = getEndpoint('AUTH.LOGIN');
 *   
 *   // Make API call with Axios
 *   axios.post(loginURL, credentials);
 */

// ===========================================
// ENVIRONMENT CONFIGURATION
// ===========================================

const ENV = import.meta.env.MODE || 'production';

/**
 * Base URLs for different environments
 * Uses Vite environment variables (VITE_* prefix)
 * 
 * Supports both VITE_BACKEND_URL (new) and VITE_API_URL (legacy) for backward compatibility
 */
// Auto-detect domain from browser in production, fallback to env vars in dev/build
function getAutoBaseURL() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  const configured = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL?.replace('/api', '');
  if (configured) return configured;
  const envUrl = import.meta.env.VITE_API_URL || '';
  if (envUrl) return envUrl.replace(/\/api\/?$/, '');
  return '';
}

const BASE_URLS = {
  development: {
    backend: import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5052',
    frontend: import.meta.env.VITE_FRONTEND_URL || 'http://localhost:5173'
  },
  production: {
    backend: getAutoBaseURL(),
    frontend: getAutoBaseURL()
  },
  test: {
    backend: import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5052',
    frontend: import.meta.env.VITE_FRONTEND_URL || 'http://localhost:5173'
  }
};

// ===========================================
// API ENDPOINTS CONFIGURATION
// ===========================================

/**
 * Centralized API endpoints
 * Organized by module for easy navigation
 * Mirrors backend configuration structure
 */
export const API_ENDPOINTS = {
  // Health & System
  HEALTH: {
    CHECK: '/api/health',
    STATUS: '/api/health/status'
  },

  // Authentication & Authorization (V2 - Multi-branch)
  AUTH: {
    // V2 Endpoints (with branch code)
    LOGIN: '/api/v2/branches/login',
    VALIDATE_BRANCH: '/api/v2/branches/validate',
    REFRESH_TOKEN: '/api/v2/auth/refresh',
    LOGOUT: '/api/v2/auth/logout',
    
    // V1 Endpoints (legacy - for backward compatibility)
    ADMIN_LOGIN: '/api/admin/login',
    STAFF_LOGIN: '/api/staff/login',
    STUDENT_LOGIN: '/api/students/login'
  },

  // Branch Management (V2 Multi-branch)
  BRANCHES: {
    BASE: '/api/v2/branches',
    LIST: '/api/v2/branches',
    CREATE: '/api/v2/branches',
    VALIDATE: '/api/v2/branches/validate',
    SCAN: '/api/v2/branches/scan',
    AUTO_REGISTER: '/api/v2/branches/auto-register',
    STATS: '/api/v2/branches/stats'
  },


  // ===========================================
  // TASKS & TASK COMPLETION
  // ===========================================
  TASKS: {
    STATUS: '/api/tasks/status',
    COMPLETE: (id) => `/api/tasks/complete/${id}`,
    CONFIG: '/api/tasks/config',
    LIST: '/api/tasks',
  },

  // ===========================================
  // SCHEDULE (all endpoints)
  // ===========================================
  SCHEDULE: {
    BASE: '/api/schedule',
    CONFIG: '/api/schedule/config',
    SCHEDULE: '/api/schedule/schedule',
    CONFLICTS: '/api/schedule/conflicts',
    ALL_CLASSES: '/api/schedule/all-classes',
    SUBJECTS: '/api/schedule/subjects',
    CLASS_SUBJECTS: '/api/schedule/class-subjects',
    CLASS_SUBJECT_CONFIGS: '/api/schedule/class-subject-configs',
    TEACHERS_PERIOD: '/api/schedule/task6/teachers-period',
    TEACHER_WORK_TIMES: '/api/schedule/teacher-work-times',
    SYNC_SUBJECTS: '/api/schedule/sync-subjects',
    FORCE_SYNC_DATA: '/api/schedule/force-sync-data',
    GENERATE_COMPLETE_SCHEDULE: '/api/schedule/generate-complete-schedule',
    RESET_SCHEMA: '/api/schedule/reset-schema',
    AUTO_REBALANCE_SHIFTS: '/api/schedule/auto-rebalance-shifts',
    AUTO_ASSIGN_FULLTIME_DAYS: '/api/schedule/auto-assign-fulltime-days',
    MANUAL_SYNC_TEACHERS: '/api/schedule/manual-sync-teachers',
    SET_COMPREHENSIVE_CONFIG: '/api/schedule/set-comprehensive-config',
    FORCE_REGENERATE_SCHEDULE: '/api/schedule/force-regenerate-schedule',
    AUTO_RESOLVE_CONFLICTS: '/api/schedule/auto-resolve-conflicts',
    SCHEDULE_OVERVIEW: '/api/schedule/schedule-overview',
    DEBUG_SCHEDULE_STATUS: '/api/schedule/debug-schedule-status',
    DEBUG_PART_TIME_TEACHERS: '/api/schedule/debug-part-time-teachers',
    DEBUG_PART_TIME_SCHEDULE: '/api/schedule/debug-part-time-schedule',
    VALIDATE_TEACHER_CONFLICTS: '/api/schedule/validate-teacher-conflicts',
    SCHEDULE_BY_TEACHER: '/api/schedule/schedule-by-teacher',
    SWAP_SLOTS: '/api/schedule/swap-slots',
    SCHEDULE_REPORT: '/api/schedule/schedule-report',
    BY_CLASS: (classId) => `/api/schedule/class/${classId}`,
    BY_TEACHER: (teacherId) => `/api/schedule/teacher/${teacherId}`,
    WEEK: (weekId) => `/api/schedule/week/${weekId}`,
  },

  // ===========================================
  // SCHOOL SETUP
  // ===========================================
  SCHOOL_SETUP: {
    BASE: '/api/school-setup',
    CONFIG: '/api/school-setup/config',
    TEACHERS_WITH_WORKTIME: '/api/school-setup/teachers-with-worktime',
    SYNC_TEACHER_ASSIGNMENTS: '/api/school-setup/sync-teacher-assignments',
    CLASS_SUBJECT_CONFIGS: '/api/school-setup/class-subject-configs',
    SET_COMPREHENSIVE_CONFIG: '/api/school-setup/set-comprehensive-config',
    TASKS: '/api/tasks',
    TASK_STATUS: (taskId) => `/api/tasks/${taskId}/status`,
    TASK6: '/api/task6',
  },

  // ===========================================
  // STUDENTS (complete)
  // ===========================================
  STUDENTS: {
    BASE: '/api/students',
    LIST: '/api/student-list',
    BY_ID: (id) => `/api/students/${id}`,
    REGISTER: '/api/students/register',
    UPDATE: (id) => `/api/students/${id}`,
    DELETE: (id) => `/api/students/${id}`,
    SEARCH: '/api/students/search',
    BY_CLASS: (classId) => `/api/students/class/${classId}`,
    ACTIVITIES: '/api/student-activities',
    CREATE_FORM: '/api/students/create-form',
    FORM_STRUCTURE: '/api/students/form-structure',
    CLASSES: '/api/students/classes',
    COLUMNS: (className) => `/api/students/columns/${className}`,
    SEARCH_GUARDIAN: (phone) => `/api/students/search-guardian/${phone}`,
    DELETE_FORM: '/api/students/delete-form',
    BULK_IMPORT: '/api/students/bulk-import',
    ADD_STUDENT: '/api/students/add-student',
  },

  // Student List sub-endpoints
  STUDENT_LIST: {
    BASE: '/api/student-list',
    CLASSES: '/api/student-list/classes',
    STUDENTS: (className) => `/api/student-list/students/${className}`,
    TOGGLE_ACTIVE: (cls, schoolId, classId) => `/api/student-list/toggle-active/${cls}/${schoolId}/${classId}`,
    STUDENT: (cls, schoolId, classId) => `/api/student-list/student/${cls}/${schoolId}/${classId}`,
  },

  // Student Activities
  STUDENT_ACTIVITIES: {
    BASE: '/api/student-activities',
    ACTIVITIES: (cls, student) => `/api/student-activities/activities/${cls}/${student}`,
    ALL: (cls) => `/api/student-activities/activities/${cls}/all`,
  },

  // ===========================================
  // STAFF (complete)
  // ===========================================
  STAFF: {
    BASE: '/api/staff',
    BY_ID: (id) => `/api/staff/${id}`,
    REGISTER: '/api/staff/register',
    UPDATE: (id) => `/api/staff/${id}`,
    DELETE: (id) => `/api/staff/${id}`,
    SEARCH: '/api/staff/search',
    FAULTS: '/api/staff/faults',
    CLASSES: '/api/staff/classes',
    DATA: (type, className) => `/api/staff/data/${type}/${className}`,
    COLUMNS: (type, className) => `/api/staff/columns/${type}/${className}`,
    TOGGLE_ACTIVE: (id) => `/api/staff/toggle-active/${id}`,
    UPDATE_STAFF: (id) => `/api/staff/update/${id}`,
    DELETE_FORM: '/api/staff/delete-form',
    BULK_IMPORT: '/api/staff/bulk-import',
    CREATE_FORM: '/api/staff/create-form',
  },

  // ===========================================
  // MARK LIST (complete)
  // ===========================================
  MARK_LIST: {
    BASE: '/api/mark-list',
    BY_ID: (id) => `/api/mark-list/${id}`,
    CREATE: '/api/mark-list/create',
    UPDATE: (id) => `/api/mark-list/${id}`,
    DELETE: (id) => `/api/mark-list/${id}`,
    BY_CLASS: (classId) => `/api/mark-list/class/${classId}`,
    CLASSES: '/api/mark-list/classes',
    SUBJECTS: '/api/mark-list/subjects',
    SUBJECTS_CLASSES: '/api/mark-list/subjects-classes',
    ADD_SUBJECT: '/api/mark-list/add-subject',
    UPDATE_SUBJECT: (id) => `/api/mark-list/update-subject/${id}`,
    DELETE_SUBJECT: (id) => `/api/mark-list/delete-subject/${id}`,
    MAP_SUBJECTS_CLASSES: '/api/mark-list/map-subjects-classes',
    CONFIG: '/api/mark-list/config',
    MARKS: (subject, cls, term) => `/api/mark-list/mark-list/${subject}/${cls}/${term}`,
    CREATE_FORMS: '/api/mark-list/create-mark-forms',
    UPDATE_MARKS: '/api/mark-list/update-marks',
    TEACHERS: '/api/mark-list/teachers',
    SUBJECT_CLASS_COMBINATIONS: '/api/mark-list/subject-class-combinations',
    TEACHER_ASSIGNMENTS: '/api/mark-list/teacher-assignments',
    ASSIGN_TEACHERS: '/api/mark-list/assign-teachers',
    COMPREHENSIVE_RANKING: (cls, term) => `/api/mark-list/comprehensive-ranking/${cls}/${term}`,
    GUARDIAN_MARKS: (username) => `/api/mark-list/guardian-marks/${username}`,
  },

  // ===========================================
  // ACADEMIC - STUDENT ATTENDANCE
  // ===========================================
  ACADEMIC: {
    STUDENT_ATTENDANCE: {
      SETTINGS: '/api/academic/student-attendance/settings',
      CLASSES: '/api/academic/student-attendance/classes',
      CLASS_SHIFTS: '/api/academic/student-attendance/class-shifts',
      MARK_ABSENT: '/api/academic/student-attendance/mark-absent',
      CURRENT_DATE: '/api/academic/student-attendance/current-date',
      STUDENTS: '/api/academic/student-attendance/students',
      GENERATE_WEEKS: '/api/academic/student-attendance/generate-weeks',
      WEEKLY: '/api/academic/student-attendance/weekly',
      UPDATE: '/api/academic/student-attendance/update',
      DAY_OF_WEEK: '/api/academic/student-attendance/day-of-week',
    },
    MARK_LIST: {
      BASE: '/api/mark-list',
      BY_ID: (id) => `/api/mark-list/${id}`,
      CREATE: '/api/mark-list/create',
      UPDATE: (id) => `/api/mark-list/${id}`,
      DELETE: (id) => `/api/mark-list/${id}`,
      BY_CLASS: (classId) => `/api/mark-list/class/${classId}`,
    },
    EVALUATIONS: {
      BASE: '/api/evaluations',
      BOOK: '/api/evaluation-book',
      BY_ID: (id) => `/api/evaluations/${id}`,
    },
    SCHEDULE: {
      BASE: '/api/schedule',
      BY_CLASS: (classId) => `/api/schedule/class/${classId}`,
      BY_TEACHER: (teacherId) => `/api/schedule/teacher/${teacherId}`,
    },
    CLASS_TEACHER: {
      BASE: '/api/class-teacher',
      TEACHERS: '/api/class-teacher/teachers',
      CLASSES: '/api/class-teacher/classes',
      ASSIGNMENTS: '/api/class-teacher/assignments',
      ASSIGN: '/api/class-teacher/assign',
      UNASSIGN: (className) => `/api/class-teacher/unassign/${className}`,
      TEACHER_ASSIGNMENT: (name) => `/api/class-teacher/teacher-assignment/${name}`,
      SCHOOL_DAYS: '/api/class-teacher/school-days',
      STUDENTS: (className) => `/api/class-teacher/students/${className}`,
      WEEKLY_TABLES: (className) => `/api/class-teacher/weekly-tables/${className}`,
      CREATE_WEEKLY_ATTENDANCE: '/api/class-teacher/create-weekly-attendance',
      WEEKLY_ATTENDANCE: (cls, week) => `/api/class-teacher/weekly-attendance/${cls}/${week}`,
    },
  },

  // ===========================================
  // FINANCE (complete)
  // ===========================================
  FINANCE: {
    ACCOUNTS: {
      BASE: '/api/finance/accounts',
      BY_ID: (id) => `/api/finance/accounts/${id}`,
      BALANCE: (id) => `/api/finance/accounts/${id}/balance`,
      TREE: '/api/finance/accounts/tree',
    },
    FEES: {
      BASE: '/api/simple-fees',
      BY_ID: (id) => `/api/simple-fees/${id}`,
      STRUCTURES: '/api/finance/fee-structures',
      METADATA: '/api/simple-fees/metadata',
      PAYMENTS: '/api/fee-payments',
      BY_ID_PAYMENT: (id) => `/api/fee-payments/${id}`,
      STUDENTS_BY_CLASS: (className) => `/api/fee-payments/students/${className}`,
      STUDENT_BY_ID: (studentId) => `/api/fee-payments/student/${studentId}`,
      DISCOUNTS: '/api/finance/discounts',
      SCHOLARSHIPS: '/api/finance/scholarships',
      LATE_FEES: '/api/finance/late-fee-rules',
      LATE_FEE_APPLICATION: '/api/finance/late-fee-application',
      APPLY_LATE_FEES: '/api/finance/apply-late-fees',
    },
    INVOICES: {
      BASE: '/api/finance/invoices',
      SIMPLE: '/api/finance/simple-invoices',
      PROGRESSIVE: '/api/finance/progressive-invoices',
      PROGRESSIVE_GENERATE: '/api/finance/progressive-invoices/generate-all',
      GENERATE: '/api/finance/invoices/generate',
      BY_ID: (id) => `/api/finance/invoices/${id}`,
      BY_STUDENT: (studentId) => `/api/finance/invoices/student/${studentId}`,
    },
    PAYMENTS: {
      BASE: '/api/finance/payments',
      MONTHLY: '/api/finance/monthly-payments',
      MONTHLY_VIEW: '/api/finance/monthly-payments-view',
      BY_ID: (id) => `/api/finance/payments/${id}`,
      BY_STUDENT: (studentId) => `/api/finance/payments/student/${studentId}`,
      CHECK_REFERENCE: (ref) => `/api/finance/payments/check-reference/${ref}`,
    },
    MONTHLY_VIEW: {
      OVERVIEW: '/api/finance/monthly-payments-view/overview',
      CLASS: (className) => `/api/finance/monthly-payments-view/class/${className}`,
      STUDENT: (studentId) => `/api/finance/monthly-payments-view/student/${studentId}`,
      PAYMENT_HISTORY: (studentId) => `/api/finance/monthly-payments-view/student/${studentId}/payment-history`,
      MULTIPLE_MONTHLY: '/api/finance/monthly-payments-view/reports/multiple-monthly-payments',
    },
    RECEIPTS: {
      LAST_NUMBER: '/api/finance/monthly-payments-view/receipts/last-number',
      SAVE_NUMBER: '/api/finance/monthly-payments-view/receipts/save-number',
      RECEIPT_NUMBER: (id) => `/api/finance/monthly-payments-view/invoice/${id}/receipt-number`,
    },
    UNPAID_STUDENTS: '/api/finance/monthly-payments-view/unpaid-students',
    CLASSES: '/api/finance/classes',
    EXPENSES: {
      BASE: '/api/finance/expenses',
      BY_ID: (id) => `/api/finance/expenses/${id}`,
      APPROVAL: '/api/finance/expenses/approval',
      APPROVE: (id) => `/api/finance/expenses/${id}/approve`,
      REJECT: (id) => `/api/finance/expenses/${id}/reject`,
      MARK_PAID: (id) => `/api/finance/expenses/${id}/mark-paid`,
      LINK_PURCHASE_ORDER: '/api/finance/expenses/link-purchase-order',
    },
    BUDGETS: {
      BASE: '/api/finance/budgets',
      BY_ID: (id) => `/api/finance/budgets/${id}`,
    },
    PAYROLL: '/api/finance/payroll',
    CLASS_STUDENTS: '/api/finance/class-students',
  },

  // ===========================================
  // HR & STAFF MANAGEMENT (complete)
  // ===========================================
  HR: {
    BASE: '/api/hr',
    SHIFT_SETTINGS: '/api/hr/shift-settings',
    SHIFT_SETTINGS_BY_NAME: (name) => `/api/hr/shift-settings/${name}`,
    STAFF_SPECIFIC_TIMING: '/api/hr/shift-settings/staff-specific-timing',
    STAFF_SPECIFIC_TIMING_BY_ID: (staffId, shiftType) => `/api/hr/shift-settings/staff-specific-timing/${staffId}/${shiftType}`,
    STAFF_SHIFT: (dept, className, id) => `/api/hr/shift-settings/staff/${dept}/${className}/${id}/shift`,
    ATTENDANCE_TIME_SETTINGS: '/api/hr/attendance/time-settings',
    STAFF_SPECIFIC_TIMES: '/api/hr/attendance/staff-specific-times',
    STAFF_SPECIFIC_TIMES_BY_ID: (id) => `/api/hr/attendance/staff-specific-times/${id}`,
    ATTENDANCE_ETHIOPIAN: '/api/hr/attendance/ethiopian',
    ATTENDANCE_ETHIOPIAN_BY_ID: (id) => `/api/hr/attendance/ethiopian/${id}`,
    ATTENDANCE_ETHIOPIAN_BULK: '/api/hr/attendance/ethiopian/bulk',
    ATTENDANCE_ETHIOPIAN_MONTH: '/api/hr/attendance/ethiopian-month',
    CALCULATE_DEDUCTIONS: '/api/hr/attendance/calculate-deductions',
    DEDUCTION_SETTINGS: '/api/hr/attendance/deduction-settings',
    DEDUCTION_SETTINGS_BY_ID: (id) => `/api/hr/attendance/deduction-settings/${id}`,
    LEAVE_BASE: '/api/hr/leave',
    LEAVE_REQUEST: '/api/hr/leave/request',
    LEAVE_APPROVE: '/api/hr/leave/approve',
    LEAVE_ATTENDANCE_ISSUES: '/api/hr/leave/attendance-issues',
    LEAVE_RECORDS: '/api/hr/leave/leave-records',
    LEAVE_APPROVAL_STATS: '/api/hr/leave/approval-stats',
    LEAVE_GRANT: '/api/hr/leave/grant-leave',
    LEAVE_BY_ENDPOINT: (endpoint) => `/api/hr/leave/${endpoint}`,
    SALARY: {
      BASE: '/api/hr/salary',
      BY_STAFF: (staffId) => `/api/hr/salary/staff/${staffId}`,
      GENERATE: '/api/hr/salary/generate',
      APPROVE: '/api/hr/salary/approve',
      STAFF_TYPES: '/api/hr/salary/staff-types',
      STAFF: '/api/hr/salary/staff',
      DEDUCTIONS: '/api/hr/salary/deductions',
      ALLOWANCES: '/api/hr/salary/allowances',
      RETENTIONS: '/api/hr/salary/retentions',
      STAFF_SALARY: (id) => `/api/hr/salary/staff/${id}/salary`,
      ALL_SALARIES: '/api/hr/salary/all-salaries',
      RETENTION_BENEFITS: (id) => `/api/hr/salary/staff/${id}/retention-benefits`,
      RETENTION_BENEFIT_TYPES: '/api/hr/salary/retention-benefit-types',
      UPDATE_COMPLETE: (id) => `/api/hr/salary/update-complete/${id}`,
      ADD_COMPLETE: '/api/hr/salary/add-complete',
    },
    PAYROLL: {
      GENERATE: '/api/hr/payroll/generate',
      EXPORT_EXCEL: '/api/hr/payroll/export-excel',
    },
    DEVICES: {
      STATUS: '/api/hr/devices/status',
      TEST_LOG: '/api/hr/devices/test-log',
    },
    TRAINING: '/api/hr/training',
    RECRUITMENT: {
      APPLICATIONS: '/api/hr/recruitment/applications',
      POSITIONS: '/api/hr/recruitment/positions',
      APPLICATION_STATUS: (id) => `/api/hr/recruitment/applications/${id}/status`,
    },
    DEPARTMENTS: '/api/hr/departments',
    ROLES: '/api/hr/roles',
    BY_TYPE_AND_ID: (type, id) => `/api/hr/${type}/${id}`,
    PERFORMANCE: '/api/hr/performance',
    REPORTS: (report) => `/api/hr/reports/${report}`,
    EXPORT_REPORT: (report) => `/api/hr/reports/${report}/export`,
    STATS: '/api/hr/stats',
  },

  // ===========================================
  // INVENTORY
  // ===========================================
  INVENTORY: {
    BASE: '/api/inventory',
    ITEMS: '/api/inventory/items',
    CATEGORIES: '/api/inventory/categories',
    TRANSACTIONS: '/api/inventory/transactions',
    SUPPLIERS: '/api/inventory/suppliers',
    SUPPLIER_BY_ID: (id) => `/api/inventory/suppliers/${id}`,
    MOVEMENTS: '/api/inventory/movements',
    PURCHASE_ORDERS: '/api/inventory/purchase-orders',
    PURCHASE_ORDERS_RECEIVE: (id) => `/api/inventory/purchase-orders/${id}/receive`,
    REPORTS: (report) => `/api/inventory/reports/${report}`,
    EXPORT_REPORT: (report) => `/api/inventory/reports/${report}/export`,
    STATS: '/api/inventory/stats',
  },

  // ===========================================
  // ASSETS
  // ===========================================
  ASSETS: {
    BASE: '/api/assets',
    BY_ID: (id) => `/api/assets/${id}`,
    CATEGORIES: '/api/assets/categories',
    MAINTENANCE: '/api/assets/maintenance',
    REPORTS: (report) => `/api/assets/reports/${report}`,
    EXPORT_REPORT: (report) => `/api/assets/reports/${report}/export`,
    DISPOSALS: '/api/assets/disposals',
    DEPRECIATION: '/api/assets/depreciation',
    DEPRECIATION_CALCULATE: '/api/assets/depreciation/calculate',
    DEPRECIATION_POST: '/api/assets/depreciation/post-to-accounting',
    ASSIGNMENTS: '/api/assets/assignments',
    ASSIGNMENTS_RETURN: (id) => `/api/assets/assignments/${id}/return`,
    STATS: '/api/assets/stats',
    ACTIVE: '/api/assets',
  },

  // ===========================================
  // FAULTS (complete)
  // ===========================================
  FAULTS: {
    STUDENT: '/api/faults',
    STAFF: '/api/staff/faults',
    BY_ID: (id) => `/api/faults/${id}`,
    CLASSES: '/api/faults/classes',
    REPORTS: '/api/faults/reports',
    STUDENTS: (className) => `/api/faults/students/${className}`,
    RECORDS: (className) => `/api/faults/faults/${className}`,
    ADD: '/api/faults/add-fault',
    EDIT: (cls, faultId) => `/api/faults/edit-fault/${cls}/${faultId}`,
    DELETE: (cls, faultId) => `/api/faults/delete-fault/${cls}/${faultId}`,
  },

  // ===========================================
  // COMMUNICATION (complete)
  // ===========================================
  COMMUNICATION: {
    POSTS: {
      BASE: '/api/posts',
      FEED: '/api/posts/feed',
      BY_ID: (id) => `/api/posts/${id}`,
      CREATE: '/api/posts/create',
      UPDATE: (id) => `/api/posts/${id}`,
      DELETE: (id) => `/api/posts/${id}`,
      LIKE: (postId) => `/api/posts/${postId}/like`,
      PROFILE_STAFF: (staffId) => `/api/posts/profile/staff/${staffId}`,
    },
    CHAT: {
      BASE: '/api/chats',
      CONVERSATIONS: '/api/chats/conversations',
      MESSAGES: (conversationId) => `/api/chats/conversations/${conversationId}/messages`,
      SEND: '/api/chats/send',
      READ: '/api/chats/messages/read',
      CONTACTS_TEACHERS: '/api/chats/contacts/teachers',
      CONTACTS_ADMINS: '/api/chats/contacts/admins',
    },
    CLASS_COMMUNICATION: {
      BASE: '/api/class-communication',
      TEACHER_CLASSES: (userName) => `/api/class-communication/teacher-classes/${userName}`,
      MESSAGES: '/api/class-communication/messages',
    },
  },

  // ===========================================
  // EVALUATION BOOK
  // ===========================================
  EVALUATION_BOOK: {
    TEACHER_CLASSES: (teacherId) => `/api/teacher/${teacherId}/classes`,
    ASSIGNMENTS: '/api/assignments',
    ASSIGNMENTS_BY_ID: (id) => `/api/assignments/${id}`,
    TEACHERS: '/api/teachers',
    CLASSES: '/api/classes',
    TEMPLATES: '/api/templates',
    TEMPLATES_BY_ID: (templateId) => `/api/templates/${templateId}`,
    DAILY: '/api/daily',
    DAILY_SEND: '/api/daily/send',
    DAILY_BY_GUARDIAN: (guardianId) => `/api/daily/guardian/${guardianId}`,
    DAILY_BY_EVALUATION: (evaluationId) => `/api/daily/${evaluationId}`,
    FEEDBACK: '/api/feedback',
    REPORTS_TEACHER: (teacherId) => `/api/reports/teacher/${teacherId}`,
    REPORTS_ADMIN: '/api/reports/admin',
    FORM_BUILDER_TEMPLATES: '/api/templates',
    FORM_BUILDER_TEMPLATES_BY_ID: (templateId) => `/api/templates/${templateId}`,
  },

  // ===========================================
  // REPORTS (complete)
  // ===========================================
  REPORTS: {
    BASE: '/api/reports',
    SUMMARY: '/api/reports/summary',
    STUDENTS_SUMMARY: '/api/reports/students/summary',
    STUDENTS_BY_CLASS: '/api/reports/students/by-class',
    STUDENTS_BY_GENDER: '/api/reports/students/by-gender',
    STUDENTS_BY_AGE: '/api/reports/students/by-age',
    STAFF_SUMMARY: '/api/reports/staff/summary',
    STAFF_BY_TYPE: '/api/reports/staff/by-type',
    STAFF_BY_ROLE: '/api/reports/staff/by-role',
    STAFF_BY_GENDER: '/api/reports/staff/by-gender',
    ACADEMIC_CLASS_PERFORMANCE: '/api/reports/academic/class-performance',
    ACADEMIC_TOP_PERFORMERS: '/api/reports/academic/top-performers',
    ACADEMIC_BOTTOM_PERFORMERS: '/api/reports/academic/bottom-performers',
    ACADEMIC_CLASS_RANKINGS: '/api/reports/academic/class-rankings',
    ACADEMIC_SUBJECT_AVERAGES: '/api/reports/academic/subject-averages',
    ATTENDANCE_SUMMARY: '/api/reports/attendance/summary',
    ATTENDANCE_BY_CLASS: '/api/reports/attendance/by-class',
    ATTENDANCE_TRENDS: '/api/reports/attendance/trends',
    ATTENDANCE_ABSENTEES: '/api/reports/attendance/absentees',
    FAULTS_SUMMARY: '/api/reports/faults/summary',
    FAULTS_BY_CLASS: '/api/reports/faults/by-class',
    FAULTS_BY_TYPE: '/api/reports/faults/by-type',
    FAULTS_BY_LEVEL: '/api/reports/faults/by-level',
    FAULTS_RECENT: '/api/reports/faults/recent',
    FAULTS_TOP_OFFENDERS: '/api/reports/faults/top-offenders',
    FINANCE: '/api/reports/finance',
    INVENTORY: '/api/reports/inventory',
    HR: '/api/reports/hr',
    ASSETS: '/api/reports/assets',
    ATTENDANCE: '/api/reports/attendance',
    ACADEMIC: '/api/reports/academic',
    EVALUATIONS_SUMMARY: '/api/reports/evaluations/summary',
    EVALUATIONS_BY_CLASS: '/api/reports/evaluations/by-class',
    EVALUATIONS_RESPONSE_RATES: '/api/reports/evaluations/response-rates',
    POSTS_SUMMARY: '/api/reports/posts/summary',
    GUARDIANS_SUMMARY: '/api/reports/guardians/summary',
    ACTIVITY_RECENT: '/api/reports/activity/recent',
  },

  // ===========================================
  // DASHBOARD (complete)
  // ===========================================
  DASHBOARD: {
    BASE: '/api/dashboard',
    STATS: '/api/dashboard/stats',
    ENHANCED_STATS: '/api/dashboard/enhanced-stats',
    RECENT_FAULTS: '/api/dashboard/recent-faults',
    TOP_OFFENDERS: '/api/dashboard/top-offenders',
    ATTENDANCE_SUMMARY: '/api/dashboard/attendance-summary',
  },

  // ===========================================
  // GUARDIAN
  // ===========================================
  GUARDIANS: {
    BASE: '/api/guardian-list',
    BY_ID: (id) => `/api/guardian-list/${id}`,
    GUARDIANS: '/api/guardian-list/guardians',
    ATTENDANCE: '/api/guardian-attendance',
    STUDENT_ATTENDANCE: '/api/guardian-student-attendance',
    GUARDIAN_ATTENDANCE: (username) => `/api/guardian-attendance/guardian-attendance/${username}`,
    PAYMENTS: '/api/guardian-payments',
  },

  // ===========================================
  // YEAR ROLLOVER
  // ===========================================
  YEAR_ROLLOVER: {
    STATUS: '/api/year-rollover/status',
    ARCHIVES: '/api/year-rollover/archives',
    ARCHIVE: (id) => `/api/year-rollover/archives/${id}`,
    EXPORT: (id) => `/api/year-rollover/archives/${id}/export`,
    EXECUTE: '/api/year-rollover/execute',
  },

  // ===========================================
  // SUBJECTS
  // ===========================================
  SUBJECTS: {
    BASE: '/api/subjects',
    BY_CLASS: (className) => `/api/subjects/${className}`,
  },

  // ===========================================
  // SETTINGS (complete)
  // ===========================================
  SETTINGS: {
    BASE: '/api/settings',
    GENERAL: '/api/settings/general',
    BRANDING: '/api/settings/branding',
    BRANDING_LOGO: '/api/admin/branding/logo',
    BRANDING_ICON: '/api/admin/branding/icon',
    LANGUAGE: '/api/settings/language',
    PASSWORD: '/api/settings/password',
    SHIFT: '/api/settings/shift',
  },

  // ===========================================
  // ADMIN (additional)
  // ===========================================
  ADMIN: {
    BASE: '/api/admin',
    PROFILE: '/api/admin/profile',
    VERIFY_TOKEN: '/api/admin/verify-token',
    CHANGE_PASSWORD: '/api/admin/change-password',
    BRANDING: '/api/admin/branding',
    BRANDING_LOGO: '/api/admin/branding/logo',
    BRANDING_ICON: '/api/admin/branding/icon',
    SUB_ACCOUNTS: '/api/admin/sub-accounts',
    SUB_ACCOUNT_BY_ID: (id) => `/api/admin/sub-accounts/${id}`,
    PERMISSIONS: '/api/admin/permissions',
  },

  // ===========================================
  // CLASS TEACHER (standalone)
  // ===========================================
  CLASS_TEACHER: {
    BASE: '/api/class-teacher',
    TEACHERS: '/api/class-teacher/teachers',
    CLASSES: '/api/class-teacher/classes',
    ASSIGNMENTS: '/api/class-teacher/assignments',
    ASSIGN: '/api/class-teacher/assign',
    UNASSIGN: (className) => `/api/class-teacher/unassign/${className}`,
    TEACHER_ASSIGNMENT: (name) => `/api/class-teacher/teacher-assignment/${name}`,
    SCHOOL_DAYS: '/api/class-teacher/school-days',
    STUDENTS: (className) => `/api/class-teacher/students/${className}`,
    WEEKLY_TABLES: (className) => `/api/class-teacher/weekly-tables/${className}`,
    CREATE_WEEKLY_ATTENDANCE: '/api/class-teacher/create-weekly-attendance',
    WEEKLY_ATTENDANCE: (cls, week) => `/api/class-teacher/weekly-attendance/${cls}/${week}`,
  },

  // ===========================================
  // DEVICE USER MANAGEMENT
  // ===========================================
  DEVICE_USERS: {
    BASE: '/api/device-users',
    BUFFER: '/api/device-users/buffer',
    MAPPING: '/api/device-users/mapping',
    SYNC: '/api/device-users/sync',
  },

  // SKOOLIFIC AI Module
  AI: {
    BASE: '/api/ai',
    HEALTH: '/api/ai/health',
    BOOKS: {
      UPLOAD: '/api/ai/books/upload',
      LIST: '/api/ai/books',
      DETAIL: (id) => `/api/ai/books/${id}`,
      DELETE: (id) => `/api/ai/books/${id}`,
      REINDEX: (id) => `/api/ai/books/${id}/reindex`,
      CHUNKS: (id) => `/api/ai/books/${id}/chunks`,
    },
    GENERATE: {
      LESSON_PLAN: '/api/ai/generate/lesson-plan',
      LESSON_NOTE: '/api/ai/generate/lesson-note',
      HOMEWORK: '/api/ai/generate/homework',
      WORKSHEET: '/api/ai/generate/worksheet',
      QUIZ: '/api/ai/generate/quiz',
      EXAM: '/api/ai/generate/exam',
      SCRAMBLE_EXAM: '/api/ai/generate/scramble-exam',
    },
  },
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Get the base URL for the current environment
 * 
 * @param {string} service - Service name ('backend' or 'frontend')
 * @param {string} environment - Environment name (optional, defaults to MODE)
 * @returns {string} Base URL
 * 
 * @example
 * const baseURL = getBaseURL(); // Returns backend URL for current environment
 * const frontendURL = getBaseURL('frontend'); // Returns frontend URL
 * const prodURL = getBaseURL('backend', 'production'); // Returns production backend URL
 */
export function getBaseURL(service = 'backend', environment = ENV) {
  const env = environment || 'development';
  const urls = BASE_URLS[env] || BASE_URLS.development;
  return urls[service] || urls.backend;
}

/**
 * Get a full endpoint URL by combining base URL with endpoint path
 * 
 * @param {string} endpointPath - Endpoint path (can use dot notation for nested paths)
 * @param {object} params - Optional parameters for dynamic endpoints
 * @param {string} environment - Environment name (optional)
 * @returns {string} Full endpoint URL
 * 
 * @example
 * // Simple endpoint
 * const loginURL = getEndpoint('AUTH.LOGIN');
 * // Returns: http://localhost:5052/api/v2/auth/login
 * 
 * // Dynamic endpoint with parameter
 * const studentURL = getEndpoint('STUDENTS.BY_ID', { id: 123 });
 * // Returns: http://localhost:5052/api/students/123
 * 
 * // Nested endpoint
 * const markListURL = getEndpoint('ACADEMIC.MARK_LIST.CREATE');
 * // Returns: http://localhost:5052/api/mark-list/create
 */
export function getEndpoint(endpointPath, params = {}, environment = ENV) {
  const baseURL = getBaseURL('backend', environment);
  
  // Navigate through nested object using dot notation
  const pathParts = endpointPath.split('.');
  let endpoint = API_ENDPOINTS;
  
  for (const part of pathParts) {
    if (endpoint[part] === undefined) {
      console.warn(`Warning: Endpoint path "${endpointPath}" not found in API_ENDPOINTS`);
      return baseURL;
    }
    endpoint = endpoint[part];
  }
  
  // If endpoint is a function, call it with params
  if (typeof endpoint === 'function') {
    // Extract the first parameter value (for simple cases like BY_ID)
    const paramValue = params.id || params[Object.keys(params)[0]];
    endpoint = endpoint(paramValue);
  }
  
  return `${baseURL}${endpoint}`;
}

/**
 * Get an endpoint path without the base URL
 * Useful for Axios instances with baseURL already configured
 * 
 * @param {string} endpointPath - Endpoint path (can use dot notation)
 * @param {object} params - Optional parameters for dynamic endpoints
 * @returns {string} Endpoint path only
 * 
 * @example
 * const path = getEndpointPath('AUTH.LOGIN');
 * // Returns: /api/v2/auth/login
 * 
 * // Use with Axios instance
 * const api = axios.create({ baseURL: getBaseURL() });
 * api.post(getEndpointPath('AUTH.LOGIN'), credentials);
 */
export function getEndpointPath(endpointPath, params = {}) {
  const pathParts = endpointPath.split('.');
  let endpoint = API_ENDPOINTS;
  
  for (const part of pathParts) {
    if (endpoint[part] === undefined) {
      console.warn(`Warning: Endpoint path "${endpointPath}" not found in API_ENDPOINTS`);
      return '/';
    }
    endpoint = endpoint[part];
  }
  
  if (typeof endpoint === 'function') {
    const paramValue = params.id || params[Object.keys(params)[0]];
    endpoint = endpoint(paramValue);
  }
  
  return endpoint;
}

/**
 * Check if an endpoint exists in the configuration
 * 
 * @param {string} endpointPath - Endpoint path to check
 * @returns {boolean} True if endpoint exists
 * 
 * @example
 * if (hasEndpoint('AUTH.LOGIN')) {
 *   // Endpoint exists
 * }
 */
export function hasEndpoint(endpointPath) {
  const pathParts = endpointPath.split('.');
  let endpoint = API_ENDPOINTS;
  
  for (const part of pathParts) {
    if (endpoint[part] === undefined) {
      return false;
    }
    endpoint = endpoint[part];
  }
  
  return true;
}

/**
 * Get all endpoints for a specific module
 * 
 * @param {string} moduleName - Module name (e.g., 'AUTH', 'STUDENTS')
 * @returns {object} Object containing all endpoints for the module
 * 
 * @example
 * const authEndpoints = getModuleEndpoints('AUTH');
 * // Returns: { LOGIN: '/api/v2/auth/login', VALIDATE_BRANCH: '/api/v2/branches/validate', ... }
 */
export function getModuleEndpoints(moduleName) {
  return API_ENDPOINTS[moduleName] || {};
}

// ===========================================
// FRONTEND-SPECIFIC HELPERS
// ===========================================

/**
 * Build a full URL with query parameters
 * 
 * @param {string} endpointPath - Endpoint path
 * @param {object} pathParams - Parameters for dynamic endpoints (e.g., { id: 123 })
 * @param {object} queryParams - Query string parameters (e.g., { page: 1, limit: 10 })
 * @returns {string} Full URL with query parameters
 * 
 * @example
 * const url = buildURL('STUDENTS.LIST', {}, { page: 1, limit: 10, search: 'John' });
 * // Returns: http://localhost:5052/api/student-list?page=1&limit=10&search=John
 */
export function buildURL(endpointPath, pathParams = {}, queryParams = {}) {
  const baseUrl = getEndpoint(endpointPath, pathParams);
  
  const queryString = Object.keys(queryParams)
    .filter(key => queryParams[key] !== undefined && queryParams[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
    .join('&');
  
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Create request configuration object for Axios
 * Includes common headers and authentication
 * 
 * @param {object} options - Request options
 * @param {string} options.method - HTTP method (GET, POST, PUT, DELETE)
 * @param {object} options.data - Request body data
 * @param {object} options.params - Query parameters
 * @param {object} options.headers - Additional headers
 * @param {boolean} options.auth - Include authentication token (default: true)
 * @returns {object} Axios request configuration
 * 
 * @example
 * const config = createRequestConfig({
 *   method: 'POST',
 *   data: { username, password },
 *   auth: false
 * });
 * axios.post(getEndpoint('AUTH.LOGIN'), config.data, config);
 */
export function createRequestConfig(options = {}) {
  const {
    method = 'GET',
    data = null,
    params = null,
    headers = {},
    auth = true
  } = options;
  
  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  // Add authentication token if required
  if (auth) {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  // Add branch code if available (sessionStorage ONLY for per-tab isolation)
  const branchCode = sessionStorage.getItem('branchCode') || '';
  if (branchCode) {
    config.headers['X-Branch-Code'] = branchCode;
  }
  
  if (data) config.data = data;
  if (params) config.params = params;
  
  return config;
}

/**
 * Handle API errors consistently across the application
 * 
 * @param {Error} error - Error object from Axios
 * @returns {object} Standardized error object
 * 
 * @example
 * try {
 *   const response = await axios.get(getEndpoint('STUDENTS.LIST'));
 * } catch (error) {
 *   const errorInfo = handleAPIError(error);
 *   console.error(errorInfo.message);
 * }
 */
export function handleAPIError(error) {
  if (error.response) {
    // Server responded with error status
    return {
      status: error.response.status,
      message: error.response.data?.message || 'Server error occurred',
      data: error.response.data,
      type: 'server_error'
    };
  } else if (error.request) {
    // Request made but no response received
    return {
      status: 0,
      message: 'No response from server. Please check your connection.',
      data: null,
      type: 'network_error'
    };
  } else {
    // Error in request setup
    return {
      status: 0,
      message: error.message || 'Request failed',
      data: null,
      type: 'request_error'
    };
  }
}

/**
 * Check if the application is running in development mode
 * 
 * @returns {boolean} True if in development mode
 */
export function isDevelopment() {
  return ENV === 'development';
}

/**
 * Check if the application is running in production mode
 * 
 * @returns {boolean} True if in production mode
 */
export function isProduction() {
  return ENV === 'production';
}

/**
 * Get current environment name
 * 
 * @returns {string} Environment name
 */
export function getEnvironment() {
  return ENV;
}

// ===========================================
// DEFAULT EXPORT
// ===========================================

/**
 * Default export with all configuration and helpers
 */
export default {
  ENV,
  BASE_URLS,
  API_ENDPOINTS,
  
  // Core helpers
  getBaseURL,
  getEndpoint,
  getEndpointPath,
  hasEndpoint,
  getModuleEndpoints,
  
  // Frontend-specific helpers
  buildURL,
  createRequestConfig,
  handleAPIError,
  isDevelopment,
  isProduction,
  getEnvironment
};
