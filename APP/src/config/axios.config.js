/**
 * Axios Instance Configuration
 * 
 * This file provides a pre-configured Axios instance with:
 * - Centralized base URL from api.config.js
 * - Request interceptor for authentication (token + branch code)
 * - Response interceptor for error handling
 * - Automatic token refresh on 401 errors
 * - Request/response logging in development mode
 * - Retry logic for failed requests
 * 
 * Usage:
 *   import api from '@/config/axios.config';
 *   
 *   // Make API calls
 *   const response = await api.get('/api/students');
 *   const data = await api.post('/api/students', studentData);
 */

import axios from 'axios';
import { getBaseURL, handleAPIError, isDevelopment } from './api.config';

// ===========================================
// AXIOS INSTANCE CONFIGURATION
// ===========================================

/**
 * Create Axios instance with centralized configuration
 */
const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json'
  }
});

// ===========================================
// REQUEST INTERCEPTOR
// ===========================================

/**
 * Request interceptor to add authentication and branch code
 * Automatically injects:
 * - Authorization token from localStorage/sessionStorage
 * - Branch code from localStorage/sessionStorage
 * - Logs requests in development mode
 */
api.interceptors.request.use(
  (config) => {
    // Never force JSON content-type for FormData requests (breaks file uploads)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    // Get authentication token
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Get branch code (sessionStorage first for per-tab isolation)
    const branchCode = getBranchCode();
    if (branchCode) {
      config.headers['X-Branch-Code'] = branchCode;
    }
    
    // Log request in development mode (minimal - no sensitive data)
    if (isDevelopment()) {
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
    }
    
    return config;
  },
  (error) => {
    // Log request error in development mode
    if (isDevelopment()) {
      console.error('❌ Request Error:', error);
    }
    return Promise.reject(error);
  }
);

// ===========================================
// RESPONSE INTERCEPTOR
// ===========================================

/**
 * Response interceptor for error handling and token refresh
 * Handles:
 * - 401 errors (token expired) with automatic refresh or redirect to login
 * - Network errors
 * - Logs responses in development mode
 */
api.interceptors.response.use(
  (response) => {
    // Log response in development mode (minimal - no response data)
    if (isDevelopment()) {
      console.log(`✅ ${response.status} ${response.config.url}`);
    }
    
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 Unauthorized (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Attempt to refresh token
        const refreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
        
        if (refreshToken) {
          const response = await axios.post(
            `${getBaseURL()}/api/v2/auth/refresh`,
            { refreshToken },
            {
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );
          
          const { token: newToken } = response.data;
          
          // Update stored token
          if (localStorage.getItem('authToken')) {
            localStorage.setItem('authToken', newToken);
          } else {
            sessionStorage.setItem('authToken', newToken);
          }
          
          // Update authorization header
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          
          // Retry original request
          return api(originalRequest);
        } else {
          // No refresh token available - redirect to login
          handleLogout();
        }
      } catch (refreshError) {
        // Refresh failed - redirect to login
        if (isDevelopment()) {
          console.error('❌ Token refresh failed:', refreshError);
        }
        handleLogout();
      }
    }
    
    // Handle network errors
    if (!error.response) {
      if (isDevelopment()) {
        console.error('❌ Network Error:', error.message);
      }
    }
    
    // Log error in development mode (minimal)
    if (isDevelopment()) {
      console.error(`❌ ${error.response?.status} ${error.config?.url} - ${error.message}`);
    }
    
    // Use centralized error handler
    return Promise.reject(handleAPIError(error));
  }
);

// ===========================================
// RETRY LOGIC
// ===========================================

/**
 * Retry configuration for failed requests
 * Automatically retries failed requests with exponential backoff
 */
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Determine if request should be retried
 * @param {Error} error - Error object
 * @returns {boolean} True if request should be retried
 */
function shouldRetry(error) {
  // Retry on network errors (request never reached the server - safe to retry)
  if (!error.response) {
    return true;
  }

  const method = (error.config?.method || 'get').toLowerCase();

  // Retry on 5xx server errors ONLY for idempotent GET requests.
  // Retrying POST/PUT/DELETE that reached the server risks duplicate
  // records (e.g. double student registration) and masks real errors.
  if (error.response.status >= 500 && error.response.status < 600) {
    return method === 'get';
  }

  // Retry on 429 (Too Many Requests)
  if (error.response.status === 429) {
    return true;
  }

  return false;
}

/**
 * Add retry logic to Axios instance
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    
    // Initialize retry count
    if (!config._retryCount) {
      config._retryCount = 0;
    }
    
    // Check if we should retry
    if (shouldRetry(error) && config._retryCount < MAX_RETRIES) {
      config._retryCount += 1;
      
      // Calculate delay with exponential backoff
      const delay = RETRY_DELAY * Math.pow(2, config._retryCount - 1);
      
      if (isDevelopment()) {
        console.log(`🔄 Retry ${config._retryCount}/${MAX_RETRIES} after ${delay}ms: ${config.url}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry request
      return api(config);
    }
    
    return Promise.reject(error);
  }
);

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Handle logout and redirect to login page
 * Clears all authentication data and redirects user
 */
function handleLogout() {
  // Clear authentication data
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('branchCode');
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('branchCode');
  
  // Redirect to login page
  // Check which app type based on current path
  const currentPath = window.location.pathname;
  
  if (currentPath.includes('/staff')) {
    window.location.href = '/staff/login';
  } else if (currentPath.includes('/student')) {
    window.location.href = '/student/login';
  } else if (currentPath.includes('/guardian')) {
    window.location.href = '/guardian/login';
  } else {
    // Default to admin login
    window.location.href = '/login';
  }
}

/**
 * Set authentication token
 * @param {string} token - Authentication token
 * @param {boolean} remember - Whether to use localStorage (true) or sessionStorage (false)
 */
export function setAuthToken(token, remember = false) {
  if (remember) {
    localStorage.setItem('authToken', token);
  } else {
    sessionStorage.setItem('authToken', token);
  }
}

/**
 * Set refresh token
 * @param {string} token - Refresh token
 * @param {boolean} remember - Whether to use localStorage (true) or sessionStorage (false)
 */
export function setRefreshToken(token, remember = false) {
  if (remember) {
    localStorage.setItem('refreshToken', token);
  } else {
    sessionStorage.setItem('refreshToken', token);
  }
}

/**
 * Set branch code — sessionStorage only (per-tab isolation).
 * If remember=true, saves to rememberedBranchCode for login form pre-fill only.
 */
export function setBranchCode(branchCode, remember = false) {
  const value = (branchCode || '').toUpperCase();
  sessionStorage.setItem('branchCode', value);
  if (remember) {
    localStorage.setItem('rememberedBranchCode', value);
  }
}

/**
 * Get authentication token
 * @returns {string|null} Authentication token or null
 */
export function getAuthToken() {
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
}

/**
 * Get refresh token
 * @returns {string|null} Refresh token or null
 */
export function getRefreshToken() {
  return localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
}

/**
 * Get branch code — sessionStorage first (per-tab isolation), then fall back to
 * localStorage.rememberedBranchCode so a saved login survives app close/reopen
 * (e.g. the guardian mobile app closes and reopens — sessionStorage is wiped but
 * localStorage persists).
 */
export function getBranchCode() {
  return sessionStorage.getItem('branchCode') || localStorage.getItem('rememberedBranchCode') || '';
}

/**
 * Clear all authentication data
 */
export function clearAuth() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('branchCode');
  localStorage.removeItem('rememberedBranchCode');
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('branchCode');
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if user has valid token
 */
export function isAuthenticated() {
  return !!getAuthToken();
}

// ===========================================
// EXPORT
// ===========================================

/**
 * Also intercept the GLOBAL axios instance so that ALL components
 * using raw `import axios from 'axios'` also get auth + branch headers
 */
axios.defaults.baseURL = getBaseURL();
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    const branchCode = getBranchCode();
    if (branchCode) {
      config.headers['X-Branch-Code'] = branchCode;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Export configured Axios instance as default
 * Also export helper functions for authentication management
 */
export default api;
