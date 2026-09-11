/**
 * Centralized API Configuration
 * 
 * This file provides a single source of truth for all API endpoints and base URLs.
 * It supports multiple environments (development, production, testing) and makes
 * it easy to update API endpoints across the entire application.
 * 
 * Usage:
 *   const { getBaseURL, getEndpoint, API_ENDPOINTS } = require('./config/api.config');
 *   
 *   // Get base URL for current environment
 *   const baseURL = getBaseURL();
 *   
 *   // Get full endpoint URL
 *   const loginURL = getEndpoint('AUTH.LOGIN');
 *   
 *   // Make API call
 *   axios.post(loginURL, credentials);
 */

require('dotenv').config();

// ===========================================
// ENVIRONMENT CONFIGURATION
// ===========================================

const ENV = process.env.NODE_ENV || 'development';

/**
 * Base URLs for different environments
 */
const BASE_URLS = {
  development: {
    backend: process.env.BACKEND_URL || 'http://localhost:5052',
    frontend: process.env.FRONTEND_URL || 'http://localhost:5173'
  },
  production: {
    backend: process.env.BACKEND_URL || 'https://iqra.skoolific.com',
    frontend: process.env.FRONTEND_URL || 'https://iqra.skoolific.com'
  },
  test: {
    backend: process.env.BACKEND_URL || 'http://localhost:5052',
    frontend: process.env.FRONTEND_URL || 'http://localhost:5173'
  }
};

// ===========================================
// API ENDPOINTS CONFIGURATION
// ===========================================

/**
 * Centralized API endpoints
 * Organized by module for easy navigation
 */
const API_ENDPOINTS = {
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

  // Admin Management
  ADMIN: {
    BASE: '/api/admin',
    PROFILE: '/api/admin/profile',
    SUB_ACCOUNTS: '/api/admin/sub-accounts',
    SUB_ACCOUNT_BY_ID: (id) => `/api/admin/sub-accounts/${id}`,
    PERMISSIONS: '/api/admin/permissions'
  },

  // Student Management
  STUDENTS: {
    BASE: '/api/students',
    LIST: '/api/student-list',
    BY_ID: (id) => `/api/students/${id}`,
    REGISTER: '/api/students/register',
    UPDATE: (id) => `/api/students/${id}`,
    DELETE: (id) => `/api/students/${id}`,
    SEARCH: '/api/students/search',
    BY_CLASS: (classId) => `/api/students/class/${classId}`,
    ACTIVITIES: '/api/student-activities'
  },

  // Staff Management
  STAFF: {
    BASE: '/api/staff',
    BY_ID: (id) => `/api/staff/${id}`,
    REGISTER: '/api/staff/register',
    UPDATE: (id) => `/api/staff/${id}`,
    DELETE: (id) => `/api/staff/${id}`,
    SEARCH: '/api/staff/search',
    FAULTS: '/api/staff/faults'
  },

  // Guardian Management
  GUARDIANS: {
    BASE: '/api/guardian-list',
    BY_ID: (id) => `/api/guardian-list/${id}`,
    ATTENDANCE: '/api/guardian-attendance',
    STUDENT_ATTENDANCE: '/api/guardian-student-attendance',
    PAYMENTS: '/api/guardian-payments'
  },

  // Attendance Management
  ATTENDANCE: {
    // Student Attendance
    STUDENT: {
      BASE: '/api/attendance',
      VIEW: '/api/view-attendance',
      MARK: '/api/attendance/mark',
      BY_CLASS: (classId) => `/api/attendance/class/${classId}`,
      BY_DATE: '/api/attendance/date',
      SETTINGS: '/api/student-attendance',
      ACADEMIC: '/api/academic/student-attendance'
    },
    
    // Staff Attendance
    STAFF: {
      BASE: '/api/staff-attendance',
      MARK: '/api/staff-attendance/mark',
      VIEW: '/api/staff-attendance/view',
      LOG: '/api/staff-attendance/log',
      ADMIN: '/api/admin-attendance'
    },
    
    // Machine Attendance
    MACHINE: {
      BASE: '/api/machine-attendance',
      WEBHOOK: '/api/machine-webhook',
      USB_IMPORT: '/api/usb-attendance',
      MAPPING: '/api/staff/machine-mapping'
    }
  },

  // Academic Management
  ACADEMIC: {
    // Mark Lists
    MARK_LIST: {
      BASE: '/api/mark-list',
      BY_ID: (id) => `/api/mark-list/${id}`,
      CREATE: '/api/mark-list/create',
      UPDATE: (id) => `/api/mark-list/${id}`,
      DELETE: (id) => `/api/mark-list/${id}`,
      BY_CLASS: (classId) => `/api/mark-list/class/${classId}`
    },
    
    // Evaluations
    EVALUATIONS: {
      BASE: '/api/evaluations',
      BOOK: '/api/evaluation-book',
      BY_ID: (id) => `/api/evaluations/${id}`
    },
    
    // Schedule
    SCHEDULE: {
      BASE: '/api/schedule',
      BY_CLASS: (classId) => `/api/schedule/class/${classId}`,
      BY_TEACHER: (teacherId) => `/api/schedule/teacher/${teacherId}`
    },
    
    // Class Teacher
    CLASS_TEACHER: {
      BASE: '/api/class-teacher',
      BY_CLASS: (classId) => `/api/class-teacher/class/${classId}`
    }
  },

  // Finance Management
  FINANCE: {
    // Accounts
    ACCOUNTS: {
      BASE: '/api/finance/accounts',
      BY_ID: (id) => `/api/finance/accounts/${id}`,
      BALANCE: (id) => `/api/finance/accounts/${id}/balance`
    },
    
    // Fee Management
    FEES: {
      BASE: '/api/simple-fees',
      STRUCTURES: '/api/finance/fee-structures',
      PAYMENTS: '/api/fee-payments',
      DISCOUNTS: '/api/finance/discounts',
      SCHOLARSHIPS: '/api/finance/scholarships',
      LATE_FEES: '/api/finance/late-fee-rules',
      LATE_FEE_APPLICATION: '/api/finance/late-fee-application'
    },
    
    // Invoices
    INVOICES: {
      BASE: '/api/finance/invoices',
      SIMPLE: '/api/finance/simple-invoices',
      PROGRESSIVE: '/api/finance/progressive-invoices',
      BY_ID: (id) => `/api/finance/invoices/${id}`,
      BY_STUDENT: (studentId) => `/api/finance/invoices/student/${studentId}`
    },
    
    // Payments
    PAYMENTS: {
      BASE: '/api/finance/payments',
      MONTHLY: '/api/finance/monthly-payments',
      MONTHLY_VIEW: '/api/finance/monthly-payments-view',
      BY_ID: (id) => `/api/finance/payments/${id}`,
      BY_STUDENT: (studentId) => `/api/finance/payments/student/${studentId}`
    },
    
    // Expenses & Budgets
    EXPENSES: {
      BASE: '/api/finance/expenses',
      BY_ID: (id) => `/api/finance/expenses/${id}`,
      APPROVAL: '/api/finance/expenses/approval'
    },
    
    BUDGETS: {
      BASE: '/api/finance/budgets',
      BY_ID: (id) => `/api/finance/budgets/${id}`
    },
    
    // Class Students
    CLASS_STUDENTS: '/api/finance/class-students'
  },

  // HR Management
  HR: {
    BASE: '/api/hr',
    SHIFT_SETTINGS: '/api/hr/shift-settings',
    ATTENDANCE_TIME_SETTINGS: '/api/hr/attendance-time-settings',
    SALARY: {
      BASE: '/api/hr/salary',
      BY_STAFF: (staffId) => `/api/hr/salary/staff/${staffId}`,
      GENERATE: '/api/hr/salary/generate',
      APPROVE: '/api/hr/salary/approve'
    },
    LEAVE: {
      BASE: '/api/hr/leave',
      REQUEST: '/api/hr/leave/request',
      APPROVE: '/api/hr/leave/approve'
    }
  },

  // Inventory Management
  INVENTORY: {
    BASE: '/api/inventory',
    ITEMS: '/api/inventory/items',
    CATEGORIES: '/api/inventory/categories',
    TRANSACTIONS: '/api/inventory/transactions'
  },

  // Asset Management
  ASSETS: {
    BASE: '/api/assets',
    BY_ID: (id) => `/api/assets/${id}`,
    CATEGORIES: '/api/assets/categories',
    MAINTENANCE: '/api/assets/maintenance'
  },

  // Communication
  COMMUNICATION: {
    // Posts
    POSTS: {
      BASE: '/api/posts',
      BY_ID: (id) => `/api/posts/${id}`,
      CREATE: '/api/posts/create',
      UPDATE: (id) => `/api/posts/${id}`,
      DELETE: (id) => `/api/posts/${id}`
    },
    
    // Chat
    CHAT: {
      BASE: '/api/chats',
      CONVERSATIONS: '/api/chats/conversations',
      MESSAGES: (conversationId) => `/api/chats/conversations/${conversationId}/messages`,
      SEND: '/api/chats/send'
    },
    
    // Class Communication
    CLASS_COMMUNICATION: {
      BASE: '/api/class-communication',
      BY_CLASS: (classId) => `/api/class-communication/class/${classId}`
    }
  },

  // Faults Management
  FAULTS: {
    STUDENT: '/api/faults',
    STAFF: '/api/staff/faults',
    BY_ID: (id) => `/api/faults/${id}`
  },

  // Reports
  REPORTS: {
    BASE: '/api/reports',
    FINANCE: '/api/reports/finance',
    INVENTORY: '/api/reports/inventory',
    HR: '/api/reports/hr',
    ASSETS: '/api/reports/assets',
    ATTENDANCE: '/api/reports/attendance',
    ACADEMIC: '/api/reports/academic'
  },

  // Dashboard
  DASHBOARD: {
    BASE: '/api/dashboard',
    STATS: '/api/dashboard/stats',
    RECENT_FAULTS: '/api/dashboard/recent-faults',
    TOP_OFFENDERS: '/api/dashboard/top-offenders',
    ATTENDANCE_SUMMARY: '/api/dashboard/attendance-summary'
  },

  // School Setup
  SCHOOL_SETUP: {
    BASE: '/api/school-setup',
    TASKS: '/api/tasks',
    TASK_STATUS: (taskId) => `/api/tasks/${taskId}/status`,
    TASK6: '/api/task6'
  },

  // Settings
  SETTINGS: {
    BASE: '/api/settings',
    GENERAL: '/api/settings/general',
    BRANDING: '/api/settings/branding',
    LANGUAGE: '/api/settings/language',
    PASSWORD: '/api/settings/password',
    SHIFT: '/api/settings/shift'
  },

  // Device User Management
  DEVICE_USERS: {
    BASE: '/api/device-users',
    BUFFER: '/api/device-users/buffer',
    MAPPING: '/api/device-users/mapping',
    SYNC: '/api/device-users/sync'
  }
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Get the base URL for the current environment
 * 
 * @param {string} service - Service name ('backend' or 'frontend')
 * @param {string} environment - Environment name (optional, defaults to NODE_ENV)
 * @returns {string} Base URL
 * 
 * @example
 * const baseURL = getBaseURL(); // Returns backend URL for current environment
 * const frontendURL = getBaseURL('frontend'); // Returns frontend URL
 * const prodURL = getBaseURL('backend', 'production'); // Returns production backend URL
 */
function getBaseURL(service = 'backend', environment = ENV) {
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
function getEndpoint(endpointPath, params = {}, environment = ENV) {
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
 * Useful for server-side routing
 * 
 * @param {string} endpointPath - Endpoint path (can use dot notation)
 * @param {object} params - Optional parameters for dynamic endpoints
 * @returns {string} Endpoint path only
 * 
 * @example
 * const path = getEndpointPath('AUTH.LOGIN');
 * // Returns: /api/v2/auth/login
 */
function getEndpointPath(endpointPath, params = {}) {
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
function hasEndpoint(endpointPath) {
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
function getModuleEndpoints(moduleName) {
  return API_ENDPOINTS[moduleName] || {};
}

// ===========================================
// EXPORTS
// ===========================================

module.exports = {
  // Configuration
  ENV,
  BASE_URLS,
  API_ENDPOINTS,
  
  // Helper functions
  getBaseURL,
  getEndpoint,
  getEndpointPath,
  hasEndpoint,
  getModuleEndpoints
};
