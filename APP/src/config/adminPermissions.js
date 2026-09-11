// Admin Permissions Configuration
// Defines all available admin permissions grouped by category

export const ADMIN_PERMISSIONS = {
  registration: {
    label: 'Registration',
    permissions: [
      { key: 'register_student', label: 'Register Student', path: '/create-register-student' },
      { key: 'register_staff', label: 'Register Staff', path: '/create-register-staff' },
      { key: 'student_form_builder', label: 'Student Form Builder', path: '/Student-Form-Builder' },
      { key: 'staff_form_builder', label: 'Staff Form Builder', path: '/Staff-Form-Builder' },
    ],
  },
  lists: {
    label: 'Lists',
    permissions: [
      { key: 'list_students', label: 'View Students', path: '/list-student' },
      { key: 'list_staff', label: 'View Staff', path: '/list-staff' },
      { key: 'list_guardians', label: 'View Guardians', path: '/list-guardian' },
    ],
  },
  finance: {
    label: 'Finance Management',
    permissions: [
      { key: 'finance_dashboard', label: 'Finance Dashboard', path: '/finance' },
      { key: 'fee_management', label: 'Fee Management', path: '/finance/fee-management' },
      { key: 'monthly_payments', label: 'Monthly Payments', path: '/finance/monthly-payments' },
      { key: 'student_exemption', label: 'Student Exemption', path: '/finance/student-exemption' },
      { key: 'payment_settings', label: 'Payment Settings', path: '/finance/monthly-payment-settings' },
      { key: 'financial_reports', label: 'Financial Reports', path: '/finance/reports' },
      { key: 'invoice_management', label: 'Invoice Management', path: '/finance/invoices' },
      { key: 'payment_management', label: 'Payment Management', path: '/finance/payments' },
      { key: 'payroll_management', label: 'Payroll Management', path: '/finance/payroll' },
    ],
  },
  hr: {
    label: 'HR & Staff Management',
    permissions: [
      { key: 'hr_dashboard', label: 'HR Dashboard', path: '/hr' },
      { key: 'salary_management', label: 'Salary Management', path: '/hr/salary' },
      { key: 'teachers_attendance', label: 'Teachers Attendance', path: '/hr/attendance' },
      { key: 'shift_time_settings', label: 'Time & Shift Settings', path: '/hr/shift-time-settings' },
      { key: 'attendance_deduction_settings', label: 'Attendance Deductions', path: '/hr/attendance-deduction-settings' },
      { key: 'leave_management', label: 'Leave Management', path: '/hr/leave' },
      { key: 'payroll_system', label: 'Payroll System', path: '/hr/payroll' },
      { key: 'hr_reports', label: 'HR Reports', path: '/hr/reports' },
      { key: 'expenses', label: 'Expenses', path: '/hr/expenses' },
      { key: 'expense_approval', label: 'Expense Approval', path: '/hr/expense-approval' },
      { key: 'budgets', label: 'Budgets', path: '/hr/budgets' },
      { key: 'organization_structure', label: 'Organization Structure', path: '/hr/organization' },
      { key: 'training', label: 'Training Management', path: '/hr/training' },
    ],
  },
  kg: {
    label: 'KG Management',
    permissions: [
      { key: 'kg_evaluation', label: 'KG Evaluation', path: '/kg/evaluation' },
      { key: 'kg_book', label: 'KG Evaluation Book', path: '/kg/evaluation-book' },
      { key: 'kg_assignments', label: 'KG Assignments', path: '/kg/assignments' },
    ],
  },
  academic: {
    label: 'Academic',
    permissions: [
      { key: 'student_attendance', label: 'Student Attendance', path: '/student-attendance-system' },
      { key: 'student_attendance_settings', label: 'Student Attendance Settings', path: '/student-attendance-time-settings' },
      { key: 'create_mark_list', label: 'Create Mark List', path: '/create-mark-list' },
      { key: 'mark_list_management', label: 'Mark List Management', path: '/Mark-List-Management' },
      { key: 'report_card', label: 'Report Card', path: '/report-card' },
      { key: 'schedule', label: 'Schedule', path: '/schedule' },
      { key: 'class_teacher_assignment', label: 'Class Teachers', path: '/class-teacher-assignment' },
    ],
  },
  skoolific_ai: {
    label: 'Skoolific AI',
    permissions: [
      { key: 'ai_dashboard', label: 'AI Dashboard', path: '/ai/dashboard' },
      { key: 'ai_books', label: 'My Books', path: '/ai/books' },
      { key: 'ai_upload_books', label: 'Upload Books', path: '/ai/books/upload' },
      { key: 'ai_generate', label: 'Generate Content', path: '/ai/generate/lesson-plan' },
      { key: 'ai_test_generator', label: 'Test Generator', path: '/ai/test-generator' },
    ],
  },
  evaluation: {
    label: 'Evaluation',
    permissions: [
      { key: 'evaluation', label: 'Evaluation', path: '/evaluation' },
      { key: 'evaluation_book', label: 'Evaluation Book', path: '/evaluation-book' },
      { key: 'evaluation_book_assignments', label: 'Eval Book Assignments', path: '/evaluation-book/assignments' },
    ],
  },
  communication: {
    label: 'Communication',
    permissions: [
      { key: 'communication', label: 'Communication', path: '/communication' },
      { key: 'faults', label: 'Faults', path: '/faults' },
    ],
  },
  administration: {
    label: 'Administration',
    permissions: [
      { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
      { key: 'tasks', label: 'Tasks', path: '/tasks' },
      { key: 'post', label: 'Posts', path: '/post' },
      { key: 'device_status', label: 'Device Status', path: '/device-status' },
      { key: 'settings', label: 'Settings', path: '/settings' },
      { key: 'admin_sub_accounts', label: 'Sub-Accounts', path: '/admin-sub-accounts' },
    ],
  },
};

// Get all permission keys as a flat array
export const getAllPermissionKeys = () => {
  const keys = [];
  Object.values(ADMIN_PERMISSIONS).forEach(category => {
    category.permissions.forEach(perm => {
      keys.push(perm.key);
    });
  });
  return keys;
};

// Get all permissions as a flat array
export const getAllPermissions = () => {
  const permissions = [];
  Object.values(ADMIN_PERMISSIONS).forEach(category => {
    permissions.push(...category.permissions);
  });
  return permissions;
};

// Get permission by key
export const getPermissionByKey = (key) => {
  for (const category of Object.values(ADMIN_PERMISSIONS)) {
    const found = category.permissions.find(p => p.key === key);
    if (found) return found;
  }
  return null;
};

// Get path for a permission key
export const getPermissionPath = (key) => {
  const permission = getPermissionByKey(key);
  return permission ? permission.path : null;
};

// Get all paths for given permission keys
export const getPermittedPaths = (permissionKeys) => {
  return permissionKeys
    .map(key => getPermissionPath(key))
    .filter(path => path !== null);
};

// Check if a path is permitted for given permission keys
export const isPathPermitted = (path, permissionKeys, userType = 'sub-account') => {
  // Primary admin has full access
  if (userType === 'admin') {
    return true;
  }

  // Sub-accounts with empty permissions have no access
  if (!permissionKeys || permissionKeys.length === 0) {
    return false;
  }
  
  const permittedPaths = getPermittedPaths(permissionKeys);
  
  // Check exact match or if path starts with a permitted path
  return permittedPaths.some(permittedPath => 
    path === permittedPath || path.startsWith(permittedPath + '/')
  );
};

export default ADMIN_PERMISSIONS;
