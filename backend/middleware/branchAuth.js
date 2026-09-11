// branchAuth.js - Branch Code Authentication Middleware
// Validates branch code and attaches branch context to requests

const jwt = require('jsonwebtoken');
const dbManager = require('../services/DatabaseConnectionManager');

/**
 * Middleware to validate branch code from request
 * Branch code can come from:
 * 1. JWT token (req.user.branchCode)
 * 2. Request header (x-branch-code)
 * 3. Query parameter (?branchCode=XXX)
 */
const validateBranchCode = async (req, res, next) => {
  try {
    let branchCode = null;

    // Priority 1: Get from JWT token (if user is authenticated)
    if (req.user && req.user.branchCode) {
      branchCode = req.user.branchCode;
    }
    
    // Priority 2: Get from header
    if (!branchCode && req.headers['x-branch-code']) {
      branchCode = req.headers['x-branch-code'];
    }
    
    // Priority 3: Get from query parameter
    if (!branchCode && req.query.branchCode) {
      branchCode = req.query.branchCode;
    }

    // Priority 4: Get from request body (login form sends branchCode in body)
    if (!branchCode && req.body && req.body.branchCode) {
      branchCode = req.body.branchCode;
    }

    // If no branch code provided, return error
    if (!branchCode) {
      return res.status(400).json({ 
        error: 'Branch code is required',
        message: 'Branch code not found. Send it via X-Branch-Code header, ?branchCode=XXX query, or in the request body.'
      });
    }

    // Validate branch code format (2-5 alphanumeric uppercase chars)
    if (!/^[A-Z0-9]{2,5}$/.test(branchCode)) {
      return res.status(400).json({ 
        error: 'Invalid branch code format',
        message: 'Branch code must be 2-5 uppercase letters/numbers (e.g., MAI, DB1, SKL)'
      });
    }

    // Super Finance accounts may only use branches listed in their token
    if (req.user && req.user.role === 'super_finance' &&
        Array.isArray(req.user.allowedBranches) && req.user.allowedBranches.length > 0) {
      if (!req.user.allowedBranches.includes(branchCode)) {
        return res.status(403).json({
          error: 'Branch not allowed',
          message: `This super finance account cannot access branch ${branchCode}`
        });
      }
    }

    // Get database pool for this branch
    try {
      const pool = await dbManager.getPool(branchCode);
      
      // Attach branch context to request
      req.branchCode = branchCode;
      req.branchPool = pool;
      
      next();
    } catch (error) {
      return res.status(404).json({ 
        error: 'Branch not found',
        message: `No active branch found with code: ${branchCode}`,
        details: error.message
      });
    }

  } catch (error) {
    console.error('Branch validation error:', error);
    return res.status(500).json({ 
      error: 'Branch validation failed',
      message: error.message
    });
  }
};

/**
 * Enhanced JWT authentication middleware with branch support
 * Validates JWT token and extracts branch code
 */
const authenticateWithBranch = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Read-only GET requests (e.g. guardian/student viewing mark lists, report cards)
  // may proceed with branch-code validation alone. This lets guardians and students
  // view their own data without a short-lived JWT. Write operations (POST/PUT/DELETE)
  // still require a valid token below.
  const isReadOnly = req.method === 'GET';
  if (!token && isReadOnly) {
    return validateBranchCode(req, res, next);
  }

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'NO_TOKEN'
    });
  }

  // Verify token with proper options to match generation settings
  const verifyOptions = {
    issuer: 'school-management-system',
    audience: 'school-app'
  };

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', verifyOptions, (err, user) => {
    if (err) {
      console.error('JWT Verification Error:', err.name, err.message);
      
      let errorResponse = { 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      };

      if (err.name === 'TokenExpiredError') {
        errorResponse = {
          error: 'Your session has expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        };
      } else if (err.name === 'JsonWebTokenError') {
        if (err.message.includes('invalid signature')) {
          errorResponse = {
            error: 'Token signature mismatch. Please logout and login again.',
            code: 'SIGNATURE_MISMATCH',
            action: 'LOGOUT_REQUIRED'
          };
        } else if (err.message.includes('jwt malformed')) {
          errorResponse = {
            error: 'Malformed token. Please login again.',
            code: 'MALFORMED_TOKEN'
          };
        } else if (err.message.includes('jwt audience invalid') || err.message.includes('jwt issuer invalid')) {
          errorResponse = {
            error: 'Token was generated with different settings. Please logout and login again.',
            code: 'TOKEN_SETTINGS_MISMATCH',
            action: 'LOGOUT_REQUIRED'
          };
        }
      }

      return res.status(403).json(errorResponse);
    }

    // Attach user info to request (includes branchCode)
    req.user = user;
    
    // Continue to branch validation
    validateBranchCode(req, res, next);
  });
};

/**
 * Generate JWT token with branch context
 */
const generateBranchToken = (userData, branchCode, expiresIn = '24h') => {
  const payload = {
    ...userData,
    branchCode: branchCode
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: expiresIn,
    issuer: 'school-management-system',
    audience: 'school-app'
  });
};

module.exports = {
  validateBranchCode,
  authenticateWithBranch,
  generateBranchToken
};
