const { PrismaClient } = require('@prisma/client');
const { branchContext } = require('../config/db');

// Cache Prisma clients per branch database
const prismaClients = new Map();

// Master database name (from DATABASE_URL)
const MASTER_DB = process.env.DB_NAME || 'iqrab1';

/**
 * Get a Prisma client connected to the correct branch database.
 * Uses the X-Branch-Code from the request context to route to the correct DB.
 * Falls back to master DB if no branch code is present.
 */
function getBranchPrisma() {
  const branchCode = branchContext.getStore();
  
  if (!branchCode) {
    // No branch context — use master (global operations)
    return getPrismaForDb(MASTER_DB);
  }

  const dbName = resolveBranchDbName(branchCode);
  return getPrismaForDb(dbName);
}

/**
 * Resolve database name from branch code
 */
function resolveBranchDbName(branchCode) {
  if (!branchCode) return MASTER_DB;
  
  const code = branchCode.toUpperCase();
  
  // Direct mapping: IQRA1 → iqrab1, IQRA2 → iqrab2, etc.
  // Fallback: lowercase the code
  const knownMap = {
    'IQRA1': 'iqrab1',
    'IQRA2': 'iqrab2',
    'IQRA3': 'iqrab3',
    'IQRA4': 'iqrab4',
    'IQRA5': 'iqrab5',
  };
  
  return knownMap[code] || MASTER_DB;
}

/**
 * Create or return a cached Prisma client for a specific database
 */
function getPrismaForDb(dbName) {
  if (prismaClients.has(dbName)) {
    return prismaClients.get(dbName);
  }

  const dbUser = process.env.DB_USER || 'iqra';
  const dbPassword = process.env.DB_PASSWORD || 'iqra1768';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || 5432;

  const url = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=school_comms`;
  
  const client = new PrismaClient({
    datasources: { db: { url } }
  });

  prismaClients.set(dbName, client);
  console.log(`🔌 Prisma client created for database: ${dbName}`);
  
  return client;
}

/**
 * Disconnect all Prisma clients (call on shutdown)
 */
async function disconnectAll() {
  for (const [dbName, client] of prismaClients) {
    await client.$disconnect();
    console.log(`🔌 Prisma disconnected: ${dbName}`);
  }
  prismaClients.clear();
}

/**
 * Branch-aware Prisma proxy.
 * Import this instead of `new PrismaClient()` in route files.
 * Every method call auto-routes to the correct branch database.
 */
const branchPrisma = new Proxy({}, {
  get(target, prop) {
    const client = getBranchPrisma();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

module.exports = { branchPrisma, getBranchPrisma, getPrismaForDb, disconnectAll };
