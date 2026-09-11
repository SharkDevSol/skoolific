import axios from 'axios';
import { getBranchCode } from './branchCode';

// API base URL - includes /api prefix for all routes
const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

// Create axios instance with default config
// NOTE: No default Content-Type header! Axios auto-detects FormData (multipart/form-data)
// vs JSON. Setting 'application/json' by default causes FormData with files to be
// JSON-stringified (File objects become '{}'), silently breaking file uploads.
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000 // 30 second timeout
});

// Request interceptor - add auth token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const superAdminToken = localStorage.getItem('superAdminToken');
    if (superAdminToken && config.url?.startsWith('/super-admin')) {
      config.headers.Authorization = `Bearer ${superAdminToken}`;
    }
    const superFinanceToken = localStorage.getItem('superFinanceToken');
    if (superFinanceToken && config.url?.startsWith('/super-finance')) {
      config.headers.Authorization = `Bearer ${superFinanceToken}`;
    }
    // Add branch code header if available
    const branchCode = getBranchCode();
    if (branchCode) {
      config.headers['x-branch-code'] = branchCode;
    }
    // Never force JSON content-type for FormData requests (breaks file uploads)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track if we're already redirecting to prevent multiple redirects
let isRedirecting = false;

// Detect whether we are inside the Finance App or Super Finance App (cashier screens).
// Auth errors must keep the user inside the finance app — never push to admin login.
const isFinanceAppRoute = () => {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return p.startsWith('/app/finance') || p === '/finance-app' || p.startsWith('/app/super-finance');
};

// The finance login page for the current finance app route
const getFinanceLoginPath = () => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app/super-finance')) {
    return '/app/super-finance/login';
  }
  return '/app/finance/login';
};

const clearAuthData = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('staffUser');
  localStorage.removeItem('userType');
  localStorage.removeItem('staffProfile');
  localStorage.removeItem('userPermissions');
};

const clearFinanceAuthData = () => {
  localStorage.removeItem('financeToken');
  localStorage.removeItem('financeUser');
  localStorage.removeItem('superFinanceToken');
  localStorage.removeItem('superFinanceUser');
};

// Response interceptor - handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Prevent multiple simultaneous redirects
    if (isRedirecting) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      const errorCode = error.response?.data?.code;
      const errorMessage = error.response?.data?.error;
      const action = error.response?.data?.action;
      
      console.error('🔒 Authentication Error:', errorMessage || 'Unauthorized');
      
      // Handle signature mismatch specifically
      if (errorCode === 'SIGNATURE_MISMATCH' || action === 'LOGOUT_REQUIRED') {
        console.error('⚠️  JWT Signature Mismatch - Token was generated with different secret');

        if (isFinanceAppRoute()) {
          // Stay inside the finance app — show message, go to finance login
          clearAuthData();
          clearFinanceAuthData();
          isRedirecting = true;
          alert('Your session is invalid. This can happen after a server update. Please log in again.');
          window.location.href = getFinanceLoginPath();
          return Promise.reject(error);
        }

        // Clear auth data
        clearAuthData();

        isRedirecting = true;
        alert('Your session is invalid. This can happen after a server update. Please log in again.');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isFinanceAppRoute()) {
        // Stay inside the finance app — never push the cashier to the admin login.
        clearAuthData();
        clearFinanceAuthData();
        isRedirecting = true;
        if (errorCode === 'TOKEN_EXPIRED') {
          alert('Your session has expired. Please log in again.');
        } else if (errorMessage === 'Access token required') {
          alert('Authentication required. Please log in.');
        } else {
          alert('Authentication failed. Please log in again.');
        }
        window.location.href = getFinanceLoginPath();
        return Promise.reject(error);
      }

      // Clear auth data for other 401 errors
      clearAuthData();
      
      // Show user-friendly message
      isRedirecting = true;
      if (errorCode === 'TOKEN_EXPIRED') {
        alert('Your session has expired. Please log in again.');
      } else if (errorMessage === 'Access token required') {
        alert('Authentication required. Please log in.');
      } else {
        alert('Authentication failed. Please log in again.');
      }
      
      // Redirect to login
      window.location.href = '/login';
    }
    
    // Handle 403 Forbidden - insufficient permissions or invalid token
    if (error.response?.status === 403) {
      const errorMessage = error.response?.data?.error;
      const errorCode = error.response?.data?.code;
      
      console.error('🚫 Access Denied:', errorMessage || 'Forbidden');
      
      // Check if it's a token-related 403 (some servers return 403 instead of 401 for invalid tokens)
      if (errorMessage?.toLowerCase().includes('token') || 
          errorMessage?.toLowerCase().includes('expired') ||
          errorMessage?.toLowerCase().includes('invalid') ||
          errorCode === 'INVALID_TOKEN' ||
          errorCode === 'TOKEN_SETTINGS_MISMATCH') {
        
        // Prevent multiple redirects
        if (isRedirecting) {
          return Promise.reject(error);
        }
        
        // Clear auth data
        clearAuthData();

        isRedirecting = true;

        // Redirect to clear-auth page for better user experience
        // (finance app users stay inside the finance app)
        window.location.href = isFinanceAppRoute() ? getFinanceLoginPath() : '/clear-auth.html?auto=true';
        return Promise.reject(error);
      }
      
      // Otherwise it's a permissions issue
      console.error('⚠️  Insufficient permissions for this resource');
    }
    
    // Handle 429 Too Many Requests - rate limited
    if (error.response?.status === 429) {
      console.error('⚠️  Rate limited:', error.response?.data?.error);
    }
    
    // Handle network errors
    if (!error.response) {
      console.error('🌐 Network Error: Unable to reach the server');
      console.error('API Base URL:', API_BASE_URL);
      console.error('Please check if the backend server is running');
    }
    
    return Promise.reject(error);
  }
);

// Helper function to check if user is authenticated
export const isAuthenticated = () => {
  const token = localStorage.getItem('authToken');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  return token && isLoggedIn;
};

// Helper function to get current user
export const getCurrentUser = () => {
  const adminUser = localStorage.getItem('adminUser');
  const staffUser = localStorage.getItem('staffUser');
  
  if (adminUser) {
    try {
      return JSON.parse(adminUser);
    } catch (e) {
      return null;
    }
  }
  
  if (staffUser) {
    try {
      return JSON.parse(staffUser);
    } catch (e) {
      return null;
    }
  }
  
  return null;
};

// Helper function to get user type
export const getUserType = () => {
  return localStorage.getItem('userType') || 'guest';
};

// Helper function to logout
export const logout = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('staffUser');
  localStorage.removeItem('staffProfile');
  localStorage.removeItem('userType');
  localStorage.removeItem('userPermissions');
  window.location.href = isFinanceAppRoute() ? getFinanceLoginPath() : '/login';
};

// Verify token is still valid
export const verifyToken = async () => {
  try {
    const response = await api.get('/admin/verify-token');
    return response.data.valid === true;
  } catch (error) {
    return false;
  }
};

export default api;
