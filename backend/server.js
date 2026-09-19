const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

/**
 * ⚠️  CRITICAL CONFIGURATION WARNING ⚠️
 * 
 * AI06 BIOMETRIC DEVICE WEBSOCKET SERVICE
 * ========================================
 * 
 * The AI06 WebSocket service (port 7788) is REQUIRED for biometric attendance devices.
 * 
 * DO NOT DISABLE OR COMMENT OUT:
 * - Lines ~348-365: AI06 WebSocket Service initialization
 * - Environment variable: AI06_WEBSOCKET_ENABLED must be 'true'
 * 
 * If disabled, devices cannot connect and attendance will not be recorded!
 * 
 * Configuration: backend/.env
 * Documentation: AI06_DEVICE_SETUP_GUIDE.md
 * Health Check: node backend/check-ai06-service.js
 */

// Database initialization
const { initializeDatabase } = require('./config/initDatabase');

// Security middleware imports
const { securityHeaders, httpsRedirect, preventParamPollution, xssProtection, suspiciousActivityLogger } = require('./middleware/security');
const { apiLimiter, loginLimiter } = require('./middleware/rateLimiter');
const { sanitizeInputs } = require('./middleware/inputValidation');
const { sanitizeRequest, preventInjection } = require('./middleware/sanitizeRequest');

// Route imports
const healthRoutes = require('./routes/healthRoutes');
const studentRoutes = require('./routes/studentRoutes');
const studentListRoutes = require('./routes/studentListRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const viewStudentAttendanceRoutes = require('./routes/viewStudentAttendanceRoutes');
const studentFaultsRoutes = require('./routes/studentFaultsRoutes');
const markListRoutes = require('./routes/markListRoutes');
const evaluationRoutes = require('./routes/evaluations');
const staffRoutes = require('./routes/staffRoutes');
const postRoutes = require('./routes/postRoutes');
const chatRoutes = require('./routes/chatRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const schoolSetupRoutes = require('./routes/schoolSetupRoutes');
const task6Routes = require('./routes/task6Routes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const runAdminNameMigration = require('./migrations/fix_admin_name_in_conversations');
const adminRoutes = require('./routes/adminRoutes');
const registrationReportRoutes = require('./routes/registrationReportRoutes');
const guardianListRoutes = require('./routes/guardianListRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const studentAttendanceRoutes = require('./routes/studentAttendanceRoutes');
const classTeacherRoutes = require('./routes/classTeacherRoutes');
const adminAttendanceRoutes = require('./routes/adminAttendanceRoutes');
const classCommunicationRoutes = require('./routes/classCommunicationRoutes');
const guardianAttendanceRoutes = require('./routes/guardianAttendanceRoutes');
const guardianStudentAttendanceRoutes = require('./routes/guardianStudentAttendance');
const evaluationBookRoutes = require('./routes/evaluationBookRoutes');
const guardianPaymentsRoutes = require('./routes/guardianPayments');
const subAccountRoutes = require('./routes/subAccountRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const branchRoutes = require('./routes/branchRoutes');
const financeReportsRoutes = require('./routes/finance/dashboardReports');
const inventoryReportsRoutes = require('./routes/inventory/dashboardReports');
const hrReportsRoutes = require('./routes/hr/dashboardReports');
const hrRoutes = require('./routes/hr');
const assetReportsRoutes = require('./routes/assets/dashboardReports');
const financeAccountRoutes = require('./routes/financeAccountRoutes');
const financeExpenseRoutes = require('./routes/simpleExpenseRoutes');
const financeBudgetRoutes = require('./routes/simpleBudgetRoutes');
const simpleFeeManagementRoutes = require('./routes/simpleFeeManagement');
const simpleFeePaymentsRoutes = require('./routes/simpleFeePayments');
const financeFeeStructureRoutes = require('./routes/financeFeeStructureRoutes');
const financeDiscountRoutes = require('./routes/financeDiscountRoutes');
const financeScholarshipRoutes = require('./routes/financeScholarshipRoutes');
const financeLateFeeRoutes = require('./routes/financeLateFeeRoutes');
const financeLateFeeApplicationRoutes = require('./routes/financeLateFeeApplicationRoutes');
const financeInvoiceRoutes = require('./routes/financeInvoiceRoutes');
const financePaymentRoutes = require('./routes/financePaymentRoutes');
const financeMonthlyPaymentRoutes = require('./routes/financeMonthlyPaymentRoutes');
const financeMonthlyPaymentViewRoutes = require('./routes/financeMonthlyPaymentViewRoutes');
const financeSimpleInvoiceRoutes = require('./routes/financeSimpleInvoiceRoutes');
const financeProgressiveInvoiceRoutes = require('./routes/financeProgressiveInvoiceRoutes');
const financeClassStudentRoutes = require('./routes/financeClassStudentRoutes');
const staffAttendanceRoutes = require('./routes/staffAttendanceRoutes');
const machineAttendanceRoutes = require('./routes/machineAttendance');
const machineWebhookRoutes = require('./routes/machineWebhook');
const settingsRoutes = require('./routes/settingsRoutes');
const academicStudentAttendanceRoutes = require('./routes/academic/studentAttendance');
const shiftSettingsRoutes = require('./routes/shiftSettings');
const taskStatusRoutes = require('./routes/taskStatusRoutes');
const deviceUserManagementRoutes = require('./routes/deviceUserManagement');
const studentActivitiesRoutes = require('./routes/studentActivitiesRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const aiRoutes = require('./routes/aiRoutes');
const yearRolloverRoutes = require('./routes/yearRolloverRoutes');
const financeAppRoutes = require('./routes/financeAppRoutes');
const superFinanceRoutes = require('./routes/superFinanceRoutes');
const smsRoutes = require('./routes/smsRoutes');
const aiTestGeneratorRoutes = require('./routes/aiTestGenerator');
// const aiContentRoutes = require('./routes/aiContentRoutes'); // Gemini AI removed

// Database pool
const pool = require('./config/db');

// Single-school template: preload this school's branch code from branch_config
const defaultBranchCodePromise = new Promise((resolve) => {
  const q = () => pool.query(
    "SELECT branch_code FROM public.branch_config WHERE is_active = true ORDER BY id LIMIT 1"
  ).then(r => resolve(r.rows[0]?.branch_code || 'MAIN')).catch(() => { setTimeout(q, 3000); });
  q();
});

// Global error handler
const { errorHandler, onUncaughtException, onUnhandledRejection } = require('./middleware/errorHandler');

// Global process-level error handlers (prevents Node crashes → nginx 502s)
process.on('uncaughtException', onUncaughtException);
process.on('unhandledRejection', onUnhandledRejection);

// Service imports for device user persistence
const syncCoordinator = require('./services/SyncCoordinator');
const deviceUserMonitoringService = require('./services/DeviceUserMonitoringService');
const deviceUserBufferService = require('./services/DeviceUserBufferService');
const backupRestoreService = require('./services/BackupRestoreService');

const app = express();

// Create HTTP or HTTPS server based on environment
let server;
if (process.env.NODE_ENV === 'production' && process.env.HTTPS_ENABLED === 'true') {
  // HTTPS configuration for production
  const sslOptions = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH || './ssl/private.key'),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH || './ssl/certificate.crt')
  };
  server = https.createServer(sslOptions, app);
  console.log('HTTPS server created');
} else {
  server = http.createServer(app);
  console.log('HTTP server created (development mode)');
}
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [process.env.FRONTEND_URL || 'https://iqra.skoolific.com']
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:6005'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization'],
    credentials: true
  }
});
app.set('socketio', io);

io.on('connection', (socket) => {
  console.log('✅ Socket.IO client connected:', socket.id);
  console.log('   Total connected clients:', io.engine.clientsCount);
  
  // Handle ping to keep connection alive
  socket.on('ping', (data) => {
    console.log('📡 Ping received from:', socket.id);
    socket.emit('pong', { timestamp: Date.now() });
  });
  
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room (socket: ${socket.id})`);
    // Log all rooms this socket is in
    console.log(`Socket ${socket.id} is now in rooms:`, Array.from(socket.rooms));
  });
  
  // ==================== CHAT EVENTS ====================
  
  // Join a conversation room
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
  });
  
  // Leave a conversation room
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`Socket ${socket.id} left conversation ${conversationId}`);
  });
  
  // Send message (broadcast to conversation room)
  socket.on('send_message', (data) => {
    const { conversationId, message } = data;
    console.log(`Message sent to conversation ${conversationId}`);
    // Broadcast to all users in this conversation except sender
    socket.to(`conversation_${conversationId}`).emit('new_message', message);
  });
  
  // Typing indicator
  socket.on('typing_start', (data) => {
    const { conversationId, userId, userName } = data;
    socket.to(`conversation_${conversationId}`).emit('user_typing', { userId, userName });
  });
  
  socket.on('typing_stop', (data) => {
    const { conversationId, userId } = data;
    socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', { userId });
  });
  
  // Mark messages as read
  socket.on('mark_read', (data) => {
    const { conversationId, userId } = data;
    socket.to(`conversation_${conversationId}`).emit('messages_read', { userId, conversationId });
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Socket.IO client disconnected:', socket.id);
    console.log('   Remaining clients:', io.engine.clientsCount);
  });
});

// ===========================================
// SECURITY MIDDLEWARE (Order matters!)
// ===========================================

// 1. HTTPS redirect (production only)
app.use(httpsRedirect);

// 2. Security headers (helmet)
app.use(securityHeaders);

// 3. CORS configuration - allows all *.skoolific.com subdomains + configured origins
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [process.env.FRONTEND_URL || 'https://iqra.skoolific.com']
   : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5052'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    // In development, allow all local network IPs
    if (process.env.NODE_ENV !== 'production') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1') || 
          origin.match(/^http:\/\/192\.168\.\d+\.\d+/) || 
          origin.match(/^http:\/\/172\.\d+\.\d+\.\d+/) ||
          origin.match(/^http:\/\/10\.\d+\.\d+\.\d+/)) {
        return callback(null, true);
      }
    }
    
    // Allow any *.skoolific.com subdomain (multi-school deployment)
    if (origin.match(/^https?:\/\/[a-z0-9-]+\.skoolific\.com$/)) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: 'GET,POST,PUT,DELETE,PATCH',
  credentials: true,
  maxAge: 86400
}));

// 4. Rate limiting - apply to all API routes
app.use('/api/', apiLimiter);

// 5. Apply stricter rate limiting to login routes
app.use('/api/admin/login', loginLimiter);
app.use('/api/staff/login', loginLimiter);

// 6. Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Branch database context middleware - auto-routes all DB queries to the correct branch
const { branchContext } = require('./config/db');
app.use((req, res, next) => {
  let branchCode = req.headers['x-branch-code'];
  if (Array.isArray(branchCode)) branchCode = branchCode[0];
  branchCode = branchCode || req.body?.branchCode || req.query?.branchCode;
  if (Array.isArray(branchCode)) branchCode = branchCode[0];
  // Sanitize: strip anything after a comma (prevents stored duplicate like "IQRA1, IQRA1")
  if (branchCode && typeof branchCode === 'string') branchCode = branchCode.split(',')[0].trim();
  if (branchCode) {
    branchContext.run(branchCode, () => next());
  } else {
    next();
  }
});

// 7. Global branch code gate — ALL data routes MUST have a branch code
// System routes (health, login, auth, public, super-admin, branch-management) are exempted.
// Everything else (students, staff, finance, marks, schedule, attendance, etc.) requires a branch code.
app.use((req, res, next) => {
  // Only check /api/* routes
  if (!req.path.startsWith('/api/')) return next();

  // System routes that DON'T need a branch code
  const systemPrefixes = [
    '/api/health',
    '/api/public',
    '/api/v2/auth',
    '/api/v2/branches',
    '/api/super-admin',
    '/api/finance-app',
    '/api/super-finance',
    '/api/settings/branding',
  ];
  for (const prefix of systemPrefixes) {
    if (req.path.startsWith(prefix)) return next();
  }

  // Admin login endpoint (inside /api/admin) — no branch code needed
  if (req.path === '/api/admin/login' || req.path.startsWith('/api/admin/login/')) return next();

  // Check for branch code
  let branchCode = req.headers['x-branch-code'];
  if (Array.isArray(branchCode)) branchCode = branchCode[0];
  branchCode = branchCode || req.body?.branchCode || req.query?.branchCode;
  if (Array.isArray(branchCode)) branchCode = branchCode[0];
  if (branchCode && typeof branchCode === 'string') branchCode = branchCode.split(',')[0].trim();
  if (!branchCode) {
    // Single-school template: the school's own branch code IS the default.
    // Preloaded at boot (see defaultBranchCodePromise below); 400 only if
    // the lookup hasn't finished yet.
    if (app.locals.defaultBranchCode) {
      req.headers['x-branch-code'] = app.locals.defaultBranchCode;
      return next();
    }
    defaultBranchCodePromise
      .then((code) => {
        req.headers['x-branch-code'] = code;
        next();
      })
      .catch(() => {
        res.status(400).json({
          error: 'Branch code is required',
          message: `All data operations require a branch code. Send X-Branch-Code header, ?branchCode=XXX query, or include in body. Path: ${req.path}`
        });
      });
    return;
  }
  next();
});

// 7b. Input sanitization (comprehensive)
app.use(sanitizeRequest);
app.use(preventInjection);
app.use(sanitizeInputs); // Keep existing for backward compatibility

// 8. Prevent parameter pollution
app.use(preventParamPollution);

// 9. XSS protection for JSON responses
app.use(xssProtection);

// 10. Log suspicious activity
app.use(suspiciousActivityLogger);

// ===========================================
// STATIC FILES
// ===========================================
// Serve static files - support both uppercase and lowercase paths
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/Uploads/posts', express.static(path.join(__dirname, 'Uploads/posts')));
app.use('/uploads/posts', express.static(path.join(__dirname, 'Uploads/posts')));
app.use('/uploads/branding', express.static(path.join(__dirname, 'uploads/branding')));

// Test route to check if server is running (delegates to healthRoutes for full checks)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Public About Us route (no authentication required)
app.use('/api/public/about-us', require('./routes/aboutUsRoutes'));

// Test route to broadcast attendance event (for debugging)
app.get('/api/test-attendance', (req, res) => {
  console.log('🧪 Test attendance endpoint called');
  
  const testAttendance = {
    userId: 999,
    name: 'Test User',
    time: new Date().toISOString(),
    mode: 3, // Face ID
    inout: 0 // Check In
  };
  
  console.log('📤 Broadcasting test attendance:', testAttendance);
  io.emit('new-attendance', testAttendance);
  console.log(`✅ Broadcasted to ${io.engine.clientsCount} connected clients`);
  
  res.json({ 
    success: true, 
    message: 'Test attendance broadcasted',
    data: testAttendance,
    connectedClients: io.engine.clientsCount
  });
});

// Routes - IMPORTANT: Remove duplicate '/dashboard' from the path
app.use('/api/health', healthRoutes); // Health check endpoint
app.use('/api/students', studentRoutes);
app.use('/api/student-list', studentListRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/view-attendance', viewStudentAttendanceRoutes);
app.use('/api/faults', studentFaultsRoutes);
app.use('/api/mark-list', markListRoutes);
app.use('/api/student-activities', studentActivitiesRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/kg-evaluations', require('./routes/kgEvaluationRoutes')); // KG-specific evaluation module
app.use('/api/staff', staffRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chats', chatRoutes); 
app.use('/api/schedule', scheduleRoutes);
app.use('/api/school-setup', schoolSetupRoutes);
app.use('/api/task6', task6Routes);
app.use('/api/dashboard', dashboardRoutes); // This is CORRECT - dashboardRoutes will have routes like '/stats'
app.use('/api/admin', adminRoutes);
app.use('/api/admin/registration-report', registrationReportRoutes);
app.use('/api/user-profile', require('./routes/userProfileRoutes')); // Username and password change for all user types
app.use('/api/guardian-list', guardianListRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/student-attendance', studentAttendanceRoutes);
app.use('/api/class-teacher', classTeacherRoutes);
app.use('/api/admin-attendance', adminAttendanceRoutes);
app.use('/api/backup', require('./routes/backupRoutes'));
app.use('/api/class-communication', classCommunicationRoutes);
app.use('/api/guardian-attendance', guardianAttendanceRoutes);
app.use('/api/guardian-student-attendance', guardianStudentAttendanceRoutes);
app.use('/api/evaluation-book', evaluationBookRoutes);
app.use('/api/guardian-payments', guardianPaymentsRoutes);
app.use('/api/admin/sub-accounts', subAccountRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/reports/finance', financeReportsRoutes);
app.use('/api/reports/inventory', inventoryReportsRoutes);
app.use('/api/reports/hr', hrReportsRoutes);
app.use('/api/hr/shift-settings', shiftSettingsRoutes); // Must be before /api/hr
app.use('/api/hr', hrRoutes);
app.use('/api/reports/assets', assetReportsRoutes);
app.use('/api/finance/accounts', financeAccountRoutes);
app.use('/api/finance/expenses', financeExpenseRoutes);
app.use('/api/finance/budgets', financeBudgetRoutes);
app.use('/api/simple-fees', simpleFeeManagementRoutes); // Simple fee management without Prisma
app.use('/api/fee-payments', simpleFeePaymentsRoutes); // Simple fee payment tracking
app.use('/api/finance/fee-structures', financeFeeStructureRoutes);
app.use('/api/finance/discounts', financeDiscountRoutes);
app.use('/api/finance/scholarships', financeScholarshipRoutes);
app.use('/api/finance/late-fee-rules', financeLateFeeRoutes);
app.use('/api/finance', financeLateFeeApplicationRoutes);
app.use('/api/finance/invoices', financeInvoiceRoutes);
app.use('/api/finance/payments', financePaymentRoutes);
app.use('/api/finance/monthly-payments', financeMonthlyPaymentRoutes);
app.use('/api/finance/monthly-payments-view', financeMonthlyPaymentViewRoutes);
// Year rollover is mounted at line 396 with yearRolloverRoutes
app.use('/api/finance/simple-invoices', financeSimpleInvoiceRoutes);
app.use('/api/finance/progressive-invoices', financeProgressiveInvoiceRoutes);
app.use('/api/finance', financeClassStudentRoutes);
app.use('/api/staff-attendance', staffAttendanceRoutes);
app.use('/api/machine-attendance', machineAttendanceRoutes);
app.use('/api/machine-webhook', machineWebhookRoutes);
app.use('/api/usb-attendance', require('./routes/usbAttendanceImport'));
app.use('/api/settings', settingsRoutes);
app.use('/api/academic/student-attendance', academicStudentAttendanceRoutes);
app.use('/api/tasks', taskStatusRoutes);
app.use('/api/device-users', deviceUserManagementRoutes); // Device user persistence management
app.use('/api/v2/branches', branchRoutes); // Multi-branch architecture routes
app.use('/api/finance-app', financeAppRoutes); // Finance App login
app.use('/api/super-finance', superFinanceRoutes); // Super Finance App login (all branches)
app.use('/api/super-admin', superAdminRoutes); // Super Admin aggregation routes
app.use('/api/v2/auth', require('./routes/authRoutes')); // Auth refresh + logout
app.use('/api/ai', aiRoutes); // SKOOLIFIC AI Module
app.use('/api/year-rollover', yearRolloverRoutes); // Year Rollover
app.use('/api/sms', smsRoutes); // SMS Templates
app.use('/api/ai', aiTestGeneratorRoutes); // AI Test Generator

// Global error handler (must be after all routes)
app.use(errorHandler);

// ===========================================
// FRONTEND SPA - Serve built React app
// ===========================================
const frontendDistPath = path.join(__dirname, '..', 'APP', 'dist');

// Serve manifest files with correct Content-Type for PWA
const serveManifest = (res, filePath) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Manifest not found' });
    }
  });
};
app.get('/manifest.json', (req, res) => {
  serveManifest(res, path.join(frontendDistPath, 'manifest.json'));
});
app.get('/manifest-staff.json', (req, res) => {
  serveManifest(res, path.join(frontendDistPath, 'manifest-staff.json'));
});
app.get('/manifest-student.json', (req, res) => {
  serveManifest(res, path.join(frontendDistPath, 'manifest-student.json'));
});
app.get('/manifest-guardian.json', (req, res) => {
  serveManifest(res, path.join(frontendDistPath, 'manifest-guardian.json'));
});

// Serve static files — no cache for index.html, long cache for assets
app.use(express.static(frontendDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// SPA catch-all: serve index.html for page routes only
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/Uploads') || req.path.startsWith('/uploads')) {
    return next();
  }
  // Skip if it looks like a file request (has extension) — let it 404
  if (req.path.includes('.') && req.path.split('/').pop().includes('.')) {
    return next();
  }
  if (req.method === 'GET') {
    res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
      if (err) next();
    });
  } else {
    next();
  }
});

// ===========================================
// AI06 WEBSOCKET SERVICE
// ===========================================
const AI06_ENABLED = process.env.AI06_WEBSOCKET_ENABLED !== 'false';
const AI06_PORT = process.env.AI06_WEBSOCKET_PORT || 7788;

if (AI06_ENABLED) {
  const AI06WebSocketService = require('./services/ai06WebSocketService');
  const ai06Service = new AI06WebSocketService(AI06_PORT);

  // Start AI06 service with Socket.IO for real-time updates
  ai06Service.start(io);

  // Make AI06 service accessible to routes
  app.set('ai06Service', ai06Service);

  console.log(`✅ AI06 WebSocket Service enabled on port ${AI06_PORT}`);
} else {
  console.log('⚠️  AI06 WebSocket Service is DISABLED in .env');
  console.log('   Set AI06_WEBSOCKET_ENABLED=true to enable device connections');
}



// ===========================================
// ATTENDANCE AUTO-MARKER SERVICES
// ===========================================
// HR Attendance Auto-Marker
const attendanceAutoMarker = require('./services/attendanceAutoMarker');
attendanceAutoMarker.start();

// Student Attendance Auto-Marker
const { autoMarker: studentAttendanceAutoMarker } = require('./services/studentAttendanceAutoMarker');
studentAttendanceAutoMarker.start();

// Guardian Notification Service
const guardianNotificationService = require('./services/guardianNotificationService');
guardianNotificationService.start();
console.log('✅ Guardian Notification Service started');

// Firebase Push Notification Service (FCM)
const pushNotificationService = require('./services/PushNotificationService');
pushNotificationService.initialize()
  .then(() => console.log('✅ Firebase Push Notification Service initialized'))
  .catch(err => console.warn('⚠️ Firebase Push unavailable (not configured):', err.message));

// DATABASE MIGRATIONS
// ===========================================
const { Pool } = require('pg');
const DatabaseMigrationRunner = require('./database/MigrationRunner');

// Initialize database pool for migrations
const migrationPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Import auto-setup utility
const { autoSetup } = require('./utils/autoSetup');

// Import attendance system initializer
const attendanceSystemInitializer = require('./services/attendanceSystemInitializer');

// Run migrations and auto-setup on startup, then start server
(async () => {
  try {
    const migrationRunner = new DatabaseMigrationRunner({ connectionString: process.env.DATABASE_URL });
    await migrationRunner.runPendingMigrations();
  } catch (error) {
    console.error('❌ Failed to run migrations:', error.message);
    console.error('⚠️ Server will continue, but some features may not work correctly');
  }

  // Run auto-setup (creates default accounts, checks migrations, etc.)
  await autoSetup();
  
  // Initialize attendance systems (runs on every server start)
  await attendanceSystemInitializer.initialize();

  // ===========================================
  // DEVICE USER PERSISTENCE SERVICES
  // ===========================================
  console.log('\n🔧 Initializing Device User Persistence Services...');
  
  // Run finance columns migration on startup
  try {
    console.log('💰 Running finance columns migration for class tables...');
    const { migrateAllClassTables } = require('./migrations/add-finance-columns-to-all-classes');
    await migrateAllClassTables();
    console.log('✅ Finance columns migration completed');
  } catch (error) {
    console.error('⚠️  Finance columns migration error:', error.message);
    console.log('   Server will continue, but monthly payments may not work correctly');
  }
  
  // Run automatic device user migration on startup
  try {
    console.log('📡 Running automatic device user migration...');
    const axios = require('axios');
    const deviceIP = process.env.AI06_DEVICE_IP || '192.168.1.2';
    const devicePort = process.env.AI06_DEVICE_PORT || 80;
    
    try {
      // Try to connect to device and migrate users
      const deviceResponse = await axios.post(
        `http://${deviceIP}:${devicePort}/cgi-bin/js/app/module/userManager.js`,
        { command: 'getUserList', token: '' },
        { timeout: 5000 }
      );

      if (deviceResponse.data && deviceResponse.data.result === 'success') {
        const deviceUsers = deviceResponse.data.users || [];
        console.log(`   Found ${deviceUsers.length} users on device`);
        
        let bufferedCount = 0;
        for (const user of deviceUsers) {
          // Check if user has a mapping
          const mappingResult = await pool.query(
            'SELECT person_id FROM user_machine_mapping WHERE machine_user_id = $1',
            [user.id]
          );

          if (mappingResult.rows.length === 0) {
            // User is unmapped - add to buffer
            await deviceUserBufferService.upsertDeviceUser(user);
            bufferedCount++;
          }
        }
        
        if (bufferedCount > 0) {
          console.log(`   ✅ Buffered ${bufferedCount} unmapped users`);
        } else {
          console.log('   ✅ All users are mapped');
        }
      }
    } catch (deviceError) {
      console.log(`   ⚠️  Device not reachable at ${deviceIP}:${devicePort}`);
      console.log('   Migration will run automatically when device comes online');
    }
  } catch (error) {
    console.error('   ⚠️  Migration error:', error.message);
  }
  
  // Start sync coordinator cleanup task (runs every 5 minutes)
  setInterval(async () => {
    try {
      await syncCoordinator.cleanupExpiredLocks();
    } catch (error) {
      console.error('Failed to cleanup expired locks:', error);
    }
  }, 5 * 60 * 1000);
  console.log('✅ Sync Coordinator cleanup task started');

  // Start device user monitoring service (polls every 5 minutes)
  // This will also run migration automatically when device comes online
  deviceUserMonitoringService.startMonitoring(5);
  console.log('✅ Device User Monitoring Service started');

  // Start automatic backup service (runs every 6 hours)
  backupRestoreService.startAutoBackup(6);
  console.log('✅ Automatic Backup Service started (every 6 hours)');

  console.log('✅ All Device User Persistence Services initialized\n');

  // Initialize database tables
  console.log('🗄️  Checking database tables...');
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('⚠️  Database initialization warning:', error.message);
    console.log('Continuing server startup...\n');
  }

  // Run database migrations
  console.log('🔄 Running database migrations...');
  try {
    await runAdminNameMigration();
    console.log('✅ Database migrations completed\n');
  } catch (error) {
    console.error('⚠️  Migration warning:', error.message);
    console.log('Continuing server startup...\n');
  }

  // Start server after setup complete
  const PORT = process.env.PORT || 6005;
  const HOST = '0.0.0.0'; // Listen on all network interfaces for mobile access
  server.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Network access: http://172.21.8.159:${PORT}`);
    console.log(`Dashboard endpoints available at:`);
    console.log(`  http://localhost:${PORT}/api/dashboard/stats`);
  console.log(`  http://localhost:${PORT}/api/dashboard/recent-faults`);
  console.log(`  http://localhost:${PORT}/api/dashboard/top-offenders`);
  
  console.log('\n🤖 Machine Webhook Ready:');
  console.log(`   Listening for AI06 machine at: http://10.22.134.159:${PORT}/api/machine-webhook`);
  console.log('   Machine should push data directly to this endpoint');
  
  console.log('\n🔌 AI06 WebSocket Server Ready:');
  console.log(`   Listening on port ${AI06_PORT} for AI06 device`);
  console.log(`   Configure AI06 device with:`);
  console.log(`   - Server IP: YOUR_LOCAL_IP (e.g., 192.168.1.100)`);
  console.log(`   - Server Port: ${AI06_PORT}`);
  console.log(`   - Server Reg: YES`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is in use. Kill it first: taskkill /F /PID <pid> or npx kill-port ${PORT}`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
    }
  });
})(); // Close the async function

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => {
  console.log('SIGUSR2 received (nodemon restart), closing server...');
  server.close(() => {
    console.log('Server closed for restart');
    process.exit(0);
  });
});

