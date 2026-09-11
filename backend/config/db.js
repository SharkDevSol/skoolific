const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

// Request-scoped branch context - stores the current branch code for each request
const branchContext = new AsyncLocalStorage();

// Master pool (used when no branch code is present or for system-level queries)
const masterPool = new Pool({
  user: process.env.DB_USER || 'iqra',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'iqrab1',
  password: String(process.env.DB_PASSWORD || 'iqra1768'),
  port: process.env.DB_PORT || 5432,
});

// Lazy-loaded reference to dbManager (avoid circular dependency)
let dbManager = null;
function getDbManager() {
  if (!dbManager) {
    try {
      dbManager = require('../services/DatabaseConnectionManager');
    } catch (e) {
      console.warn('DatabaseConnectionManager not available, using master pool only');
    }
  }
  return dbManager;
}

// Resolve the correct pool for the current request context
async function resolvePool() {
  const branchCode = branchContext.getStore();
  if (!branchCode) {
    // No branch code set — this is a system-level operation (startup init, health check, etc.)
    // Use master pool for these operations.
    return masterPool;
  }
  
  try {
    const manager = getDbManager();
    if (manager) {
      return await manager.getPool(branchCode);
    }
  } catch (error) {
    console.error(`CRITICAL: Branch pool not available for "${branchCode}":`, error.message);
    // Don't fall back to master — throw instead, so the caller knows routing failed
    throw new Error(`Cannot route to branch "${branchCode}": ${error.message}`);
  }
  throw new Error(`No database manager available for branch "${branchCode}"`);
}

// Branch-aware pool wrapper - auto-routes queries to the correct branch database
const pool = new Proxy(masterPool, {
  get(target, prop, receiver) {
    // Methods that need branch routing
    if (prop === 'query') {
      return async function(text, params, ...rest) {
        const resolvedPool = await resolvePool();
        if (resolvedPool === target) {
          return target.query(text, params, ...rest);
        }
        return resolvedPool.query(text, params, ...rest);
      };
    }

    if (prop === 'connect') {
      return async function() {
        const resolvedPool = await resolvePool();
        return resolvedPool.connect();
      };
    }

    // Properties that expose pool state should use master
    if (prop === 'totalCount' || prop === 'idleCount' || prop === 'waitingCount') {
      const branchCode = branchContext.getStore();
      if (branchCode) {
        return 0; // Branch pool stats would be inaccurate here
      }
      return target[prop];
    }

    // Default: forward to master pool
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  }
});

module.exports = pool;
module.exports.branchContext = branchContext;
module.exports.masterPool = masterPool;
module.exports.setBranchCode = (code) => branchContext.enterWith(code);
module.exports.getBranchCode = () => branchContext.getStore();
