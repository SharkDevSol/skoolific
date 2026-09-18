/**
 * Test Data Fixtures for E2E Tests
 * 
 * This file contains reusable test data for various E2E test scenarios.
 * Update these values based on your test environment.
 */

export const testBranches = {
  valid: {
    code: 'ib3',
    name: 'Iqrab Branch 3',
    database: 'iqrab3'
  },
  invalid: {
    code: 'xxx',
    name: 'Invalid Branch'
  }
};

export const testUsers = {
  admin: {
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    branchCode: 'ib3'
  },
  teacher: {
    username: 'teacher1',
    password: 'teacher123',
    role: 'teacher',
    staffType: 'Teacher',
    branchCode: 'ib3'
  },
  student: {
    username: 'student1',
    password: 'student123',
    role: 'student',
    branchCode: 'ib3'
  },
  guardian: {
    username: 'guardian1',
    password: 'guardian123',
    role: 'guardian',
    branchCode: 'ib3'
  },
  superAdmin: {
    username: 'superadmin',
    password: 'superadmin123',
    role: 'super_admin'
    // Note: Super admin doesn't need branch code as they have access to all branches
  }
};

export const testStudent = {
  firstName: 'Test',
  lastName: 'Student',
  middleName: 'E2E',
  gender: 'Male',
  dateOfBirth: '2010-01-15',
  class: 'Grade 5',
  section: 'A',
  phoneNumber: '+251911234567',
  address: 'Addis Ababa, Ethiopia'
};

// Enhanced student registration test data
export const studentRegistrationData = {
  regular: {
    student_name: 'Regular Test Student',
    smachine_id: '1001',
    age: '10',
    gender: 'Male',
    guardian_phone: '+251911111111',
    guardian_name: 'Regular Test Guardian',
    guardian_relation: 'Father'
  },
  kg: {
    student_name: 'KG Test Student',
    smachine_id: '1002',
    age: '5',
    gender: 'Female',
    is_kg: true,
    guardian_phone: '+251922222222',
    guardian_name: 'KG Test Guardian',
    guardian_relation: 'Mother'
  },
  evening: {
    student_name: 'Evening Test Student',
    smachine_id: '1003',
    age: '15',
    gender: 'Male',
    is_evening_class: true,
    guardian_phone: '+251933333333',
    guardian_name: 'Evening Test Guardian',
    guardian_relation: 'Father'
  },
  kgEvening: {
    student_name: 'KG Evening Test Student',
    smachine_id: '1004',
    age: '6',
    gender: 'Female',
    is_kg: true,
    is_evening_class: true,
    guardian_phone: '+251944444444',
    guardian_name: 'KG Evening Test Guardian',
    guardian_relation: 'Guardian'
  },
  invalidName: {
    student_name: 'Test123!@#',
    error: 'Name can only contain letters and spaces'
  },
  invalidPhone: {
    guardian_phone: '123',
    error: 'Please enter a valid phone number'
  },
  invalidMachineId: {
    smachine_id: 'ABC123',
    error: 'Machine ID must contain only numbers'
  },
  invalidAge: {
    ageTooLow: '2',
    ageTooHigh: '101',
    errorLow: 'Age must be at least 3',
    errorHigh: 'Age must be less than 100'
  }
};

// Guardian test data
export const guardianData = {
  existing: {
    phone: '+251911234567',
    name: 'Existing Guardian',
    username: 'guardian1',
    password: 'guardian123'
  },
  new: {
    phone: '+251955555555',
    name: 'New Test Guardian',
    relation: 'Mother'
  }
};

export const testExam = {
  subject: 'Mathematics',
  class: 'Grade 5',
  term: 'Term 1',
  component: 'Test 1',
  totalMarks: 20,
  difficulty: 'Medium',
  language: 'English',
  description: 'Basic arithmetic and algebra',
  questionTypes: [
    { type: 'Multiple Choice', count: 5, marksEach: 2 },
    { type: 'True/False', count: 5, marksEach: 1 },
    { type: 'Short Answer', count: 2, marksEach: 2.5 }
  ]
};

export const testPayment = {
  studentId: 1,
  feeType: 'Tuition Fee',
  amount: 5000,
  month: 'January',
  academicYear: '2018/2019',
  paymentMethod: 'Cash'
};

// Enhanced payment test data
export const paymentTestData = {
  newFeeType: {
    name: 'Library Fee',
    amount: 500,
    frequency: 'Monthly',
    description: 'Monthly library access fee'
  },
  regularPayment: {
    studentType: 'regular',
    amount: 5000,
    month: 'Meskerem', // Ethiopian calendar month
    paymentMethod: 'Cash',
    academicYear: '2018/2019'
  },
  kgPayment: {
    studentType: 'kg',
    amount: 3000,
    month: 'Tikimt',
    paymentMethod: 'Bank Transfer',
    academicYear: '2018/2019'
  },
  eveningPayment: {
    studentType: 'evening',
    amount: 4000,
    month: 'Hidar',
    paymentMethod: 'Mobile Money',
    academicYear: '2018/2019'
  },
  bulkPayment: {
    students: [1, 2, 3, 4, 5],
    amount: 5000,
    month: 'Tahsas',
    paymentMethod: 'Cash'
  },
  partialPayment: {
    amount: 2500,
    totalAmount: 5000,
    month: 'Tir',
    paymentMethod: 'Cash',
    isPartial: true
  },
  invalidPayment: {
    amount: -100,
    error: 'Amount must be greater than zero'
  },
  paymentMethods: ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Online'],
  ethiopianMonths: [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ],
  feeTypes: [
    { name: 'Tuition Fee', amount: 5000, frequency: 'Monthly' },
    { name: 'Transport Fee', amount: 1000, frequency: 'Monthly' },
    { name: 'Exam Fee', amount: 500, frequency: 'Per Term' },
    { name: 'Registration Fee', amount: 2000, frequency: 'Annual' }
  ],
  paymentStatuses: ['Paid', 'Pending', 'Partial', 'Overdue'],
  reportTypes: ['monthly', 'term', 'annual', 'custom']
};

export const testAttendance = {
  date: '2024-01-15',
  class: 'Grade 5',
  section: 'A',
  students: [
    { id: 1, name: 'Student 1', status: 'Present' },
    { id: 2, name: 'Student 2', status: 'Absent' },
    { id: 3, name: 'Student 3', status: 'Present' }
  ]
};

export const testMarkList = {
  subject: 'Mathematics',
  class: 'Grade 5',
  section: 'A',
  term: 'Term 1',
  component: 'Test 1',
  totalMarks: 20,
  students: [
    { id: 1, name: 'Student 1', marks: 18 },
    { id: 2, name: 'Student 2', marks: 15 },
    { id: 3, name: 'Student 3', marks: 20 }
  ]
};


// Super Admin test data for cross-branch reporting
export const superAdminTestData = {
  branches: [
    {
      code: 'ib3',
      name: 'Iqrab Branch 3',
      database: 'iqrab3'
    },
    {
      code: 'ama',
      name: 'Al Markaz',
      database: 'almarkaz'
    },
    {
      code: 'alk',
      name: 'Al Khwarizmi',
      database: 'school_branch'
    }
  ],
  aggregatedMetrics: {
    totalStudents: 1500,
    totalStaff: 120,
    totalRevenue: 5000000,
    totalExpenses: 3500000,
    averageAttendanceRate: 92.5,
    averageAcademicPerformance: 78.3
  },
  dateRanges: {
    thisMonth: {
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    },
    lastMonth: {
      start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0],
      end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
    },
    thisYear: {
      start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    }
  }
};
