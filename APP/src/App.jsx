// Updated App.jsx with Code Splitting and Lazy Loading
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import LoadingScreen from "./COMPONENTS/LoadingScreen";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./i18n/config"; // Initialize i18n
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/animations.css";
import { Provider } from 'react-redux';
import OfflineBanner from './COMPONENTS/OfflineBanner/OfflineBanner';
import { store } from '../src/PAGE/store';


// Critical components - loaded immediately (needed for initial render)
import InitialRedirect from "./COMPONENTS/InitialRedirect";  
import ProtectedRoute from "./COMPONENTS/ProtectedRoute";
import RoleProtectedRoute from "./COMPONENTS/RoleProtectedRoute";
import ErrorBoundary from "./COMPONENTS/ErrorBoundary";
import Login from "./PAGE/Login/Login";
import Home from "./PAGE/Home";

// Lazy-loaded components - loaded on demand
// Core Pages
const ComponentShowcase = lazy(() => import("./pages/ComponentShowcase"));
const DashboardPage = lazy(() => import("./PAGE/Dashboard/DashboardPage"));
const Dashboard = lazy(() => import("./PAGE/Dashboard/Dashboard"));
const ModernDashboard = lazy(() => import("./PAGE/Dashboard/ModernDashboard"));
const AboutUs = lazy(() => import("./PAGE/AboutUs/AboutUs"));
const Setting = lazy(() => import("./PAGE/Setting/Setting"));
const Diagnostics = lazy(() => import("./PAGE/Diagnostics/Diagnostics"));
const DataBackup = lazy(() => import("./PAGE/Backup/DataBackup"));

// Student Management
const CreateRegisterStudent = lazy(() => import("./PAGE/CreateRegister/CreateRegisterStudent/CreateRegisterStudent"));
const StudentFormBuilder = lazy(() => import("./PAGE/CreateRegister/CreateRegisterStudent/StudentFormBuilder"));
const ListStudent = lazy(() => import("./PAGE/List/ListStudent/ListStudent"));

// Staff Management
const CreateRegisterStaff = lazy(() => import("./PAGE/CreateRegister/CreateRegisterStaff/CreateRegisterStaff"));
const StaffFormBuilder = lazy(() => import("./PAGE/CreateRegister/CreateRegisterStaff/StaffFormBuilder"));
const StaffForm = lazy(() => import("./PAGE/CreateRegister/CreateRegisterStaff/StaffForm"));
const ListStaff = lazy(() => import("./PAGE/List/ListStaff/ListStaff"));
const EditStaff = lazy(() => import("./PAGE/List/ListStaff/EditStaff"));

// Guardian Management
const ListGuardian = lazy(() => import("./PAGE/List/ListGuardian/ListGuardian"));

// Academic Module
const EvaluationManager = lazy(() => import("./PAGE/Evaluation/Evaluation").then(module => ({ default: module.EvaluationManager })));
const EvaluationFormPage = lazy(() => import("./PAGE/Evaluation/EvaluationFormPage"));
const EvaluationFormDisplay = lazy(() => import("./PAGE/Evaluation/EvaluationFormDisplay"));
const EvaluationDetailsView = lazy(() => import("./PAGE/Evaluation/EvaluationDetailsView"));
const MarkListView = lazy(() => import("./PAGE/MarkListView/MarkListView"));
const StudentAttendanceSystem = lazy(() => import("./PAGE/Academic/StudentAttendanceSystem"));
const StudentAttendanceTimeSettings = lazy(() => import("./PAGE/Academic/StudentAttendanceTimeSettings"));
// AI Module
const AIDashboard = lazy(() => import("./PAGE/AI/AIDashboard"));
const AIBookUpload = lazy(() => import("./PAGE/AI/BookUpload"));
const AIBookList = lazy(() => import("./PAGE/AI/BookList"));
const AILessonPlan = lazy(() => import("./PAGE/AI/Generators/LessonPlan"));
const AILessonNote = lazy(() => import("./PAGE/AI/Generators/LessonNote"));
const AIHomework = lazy(() => import("./PAGE/AI/Generators/Homework"));
const AIWorksheet = lazy(() => import("./PAGE/AI/Generators/Worksheet"));
const AIQuiz = lazy(() => import("./PAGE/AI/Generators/Quiz"));
const AIExam = lazy(() => import("./PAGE/AI/Generators/Exam"));
const AIScrambleExam = lazy(() => import("./PAGE/AI/Generators/ScrambleExam"));
const AITestGenerator = lazy(() => import("./PAGE/AI/Generators/TestGenerator"));
const AITests = lazy(() => import("./PAGE/AI/Generators/AITests"));
const AITestPlayer = lazy(() => import("./PAGE/AI/Generators/TestPlayer"));
const MarkListSystem = lazy(() => import("./PAGE/CreateMarklist/CreateMarklist/CreateMarklist"));
const MarkListManagement = lazy(() => import("./PAGE/CreateMarklist/MarkListManagement"));
const SubjectMappingSetup = lazy(() => import("./PAGE/CreateMarklist/SubjectMappingSetup"));
const ReportCard = lazy(() => import("./PAGE/CreateMarklist/ReportCard/ReportCard"));

// Communication
const Post = lazy(() => import("./PAGE/Post/Post"));
const AdminChat = lazy(() => import("./PAGE/Communication/AdminChat"));
const GuardianChat = lazy(() => import("./PAGE/Communication/GuardianChat"));
const TeacherChat = lazy(() => import("./PAGE/Communication/TeacherChat"));

// Schedule
const ScheduleDashboard = lazy(() => import("./PAGE/Schedule/ScheduleDashboard"));
const ScheduleTimetable = lazy(() => import("./PAGE/Schedule/ScheduleTimetable"));
const ClassRequirementsForm = lazy(() => import('./PAGE/Schedule/ClassRequirementsForm'));
const ClassShiftForm = lazy(() => import('./PAGE/Schedule/ClassShiftForm'));

// Accounts & Tasks
const CreateAccounts = lazy(() => import("./PAGE/CreateMarklist/CreateAccounts/CreateAccounts"));
const AdminSubAccounts = lazy(() => import("./PAGE/AdminSubAccounts/AdminSubAccounts"));
const TaskPage = lazy(() => import("./PAGE/TaskPage"));
const TaskDetail = lazy(() => import("./PAGE/TaskDetail"));
const TaskDetailWrapper = () => {
  const { taskId } = useParams();
  return <Suspense fallback={<PageLoader />}><TaskDetail key={taskId} /></Suspense>;
};

// Mobile App Installation
const InstallStudentApp = lazy(() => import("./PAGE/InstallApp/InstallStudentApp"));
const InstallStaffApp = lazy(() => import("./PAGE/InstallApp/InstallStaffApp"));
const InstallGuardianApp = lazy(() => import("./PAGE/InstallApp/InstallGuardianApp"));

// Student App
const Students = lazy(() => import("./Students/Students"));
const PostStudents = lazy(() => import("./Students/PostStudents/PostStudents"));
const ClassStudents = lazy(() => import("./Students/ClassStudents/ClassStudents"));
const CommunicationStudents = lazy(() => import("./Students/CommunicationStudents/CommunicationStudents"));
const ProfileStudents = lazy(() => import("./Students/ProfileStudents/ProfileStudents"));

// Staff App
const Staff = lazy(() => import("./Staff/Staff"));
const POSTS = lazy(() => import("./Staff/POSTS/POSTS"));
const MRLIST = lazy(() => import("./Staff/MRLIST/MRLIST"));
const EVA = lazy(() => import("./Staff/EVA/EVA"));
const COMSTA = lazy(() => import("./Staff/COMSTA/COMSTA"));
const TeacherClassAttendance = lazy(() => import("./Staff/ATTENDANCE/TeacherClassAttendance"));
const ExamCreationStaff = lazy(() => import("./Staff/EXAM/ExamCreationStaff"));
const ClassTeacherAssignment = lazy(() => import("./PAGE/AttendanceView/ClassTeacherAssignment"));
const LiveAttendanceMonitor = lazy(() => import("./PAGE/LiveAttendanceMonitor"));

// Mobile Profiles
const StaffLogin = lazy(() => import("./COMPONENTS/StaffLogin"));
const StaffProfile = lazy(() => import("./COMPONENTS/StaffProfile"));
const StudentProfile = lazy(() => import("./COMPONENTS/StudentProfile"));
const GuardianProfile = lazy(() => import("./COMPONENTS/GuardianProfile"));
const StudentLogin = lazy(() => import("./COMPONENTS/StudentLogin"));
const GuardianLogin = lazy(() => import("./COMPONENTS/GuardianLogin"));

// Evaluation Book
const EvaluationBookFormBuilder = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.EvaluationBookFormBuilder })));
const TeacherAssignmentManager = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.TeacherAssignmentManager })));
const TeacherClassList = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.TeacherClassList })));
const DailyEvaluationForm = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.DailyEvaluationForm })));
const GuardianEvaluationInbox = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.GuardianEvaluationInbox })));
const GuardianFeedbackForm = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.GuardianFeedbackForm })));
const EvaluationBookReports = lazy(() => import("./PAGE/EvaluationBook").then(module => ({ default: module.EvaluationBookReports })));

// KG Module
const KGEvaluation = lazy(() => import("./PAGE/KG/KGEvaluation"));

// KG coming-soon pages redirect to KG Evaluation
const KGEvaluationBookPlaceholder = () => (
  <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
    <h2>KG Evaluation Book</h2>
    <p>Coming soon. Use the KG Evaluation page to manage evaluations.</p>
    <a href="/kg/evaluation" style={{ color: '#6366f1' }}>Go to KG Evaluation</a>
  </div>
);
const KGAssignmentsPlaceholder = () => (
  <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
    <h2>KG Assignments</h2>
    <p>Coming soon. Use the KG Evaluation page to manage evaluations.</p>
    <a href="/kg/evaluation" style={{ color: '#6366f1' }}>Go to KG Evaluation</a>
  </div>
);

// Guardian App
const Guardian = lazy(() => import("./Guardian/Guardian"));
const GuardianHome = lazy(() => import("./Guardian/GuardianHome/GuardianHome"));
const GuardianProfilePage = lazy(() => import("./Guardian/GuardianProfilePage/GuardianProfilePage"));
const GuardianWards = lazy(() => import("./Guardian/GuardianWards/GuardianWards"));
const GuardianAttendance = lazy(() => import("./Guardian/GuardianAttendance/GuardianAttendance"));
const GuardianMarks = lazy(() => import("./Guardian/GuardianMarks/GuardianMarks"));
const GuardianMessages = lazy(() => import("./Guardian/GuardianMessages/GuardianMessages"));

// Finance Module
const FinanceDashboard = lazy(() => import("./PAGE/Finance/FinanceDashboard"));
const ChartOfAccounts = lazy(() => import("./PAGE/Finance/ChartOfAccounts/ChartOfAccounts"));
const FeeManagement = lazy(() => import("./PAGE/Finance/FeeManagement/FeeManagement"));
const InvoiceManagement = lazy(() => import("./PAGE/Finance/InvoiceManagement"));
const FeePaymentManagement = lazy(() => import("./PAGE/Finance/FeePaymentManagement"));
const ExpenseManagement = lazy(() => import("./PAGE/Finance/ExpenseManagement"));
const ExpenseApproval = lazy(() => import("./PAGE/Finance/ExpenseApproval"));
const BudgetManagement = lazy(() => import("./PAGE/Finance/BudgetManagement"));
const PayrollManagement = lazy(() => import("./PAGE/Finance/PayrollManagement"));
const FinanceReports = lazy(() => import("./PAGE/Finance/FinanceReports"));
const ComingSoon = lazy(() => import("./PAGE/Finance/ComingSoon"));
const MonthlyPayments = lazy(() => import("./PAGE/Finance/MonthlyPaymentsNew"));
const MonthlyPaymentSettings = lazy(() => import("./PAGE/Finance/MonthlyPaymentSettings"));
const StudentExemption = lazy(() => import("./PAGE/Finance/StudentExemption"));

// Report Pages
const StudentsReport = lazy(() => import("./PAGE/Reports/StudentsReport"));
const RegistrationReport = lazy(() => import("./PAGE/Reports/RegistrationReport"));
const StaffReport = lazy(() => import("./PAGE/Reports/StaffReport"));
const AcademicReport = lazy(() => import("./PAGE/Reports/AcademicReport"));
const AttendanceReport = lazy(() => import("./PAGE/Reports/AttendanceReport"));
const BehaviorReport = lazy(() => import("./PAGE/Reports/BehaviorReport"));
const EvaluationsReport = lazy(() => import("./PAGE/Reports/EvaluationsReport"));

// Faults Page
const FaultsPage = lazy(() => import("./PAGE/Faults/FaultsPage"));
const SmsTemplates = lazy(() => import("./PAGE/SmsTemplates/SmsTemplates"));
const SmsCounter = lazy(() => import("./PAGE/SmsCounter/SmsCounter"));
// Super Admin
const SuperAdmin = lazy(() => import("./PAGE/SuperAdmin/SuperAdmin"));

// Finance App
const FinanceApp = lazy(() => import("./PAGE/FinanceApp/FinanceApp"));
const SuperFinanceApp = lazy(() => import("./PAGE/SuperFinanceApp/SuperFinanceApp"));
const SuperFinance = lazy(() => import("./PAGE/SuperFinance/SuperFinance"));

// Inventory & Asset Pages
const InventoryDashboard = lazy(() => import("./PAGE/Inventory/InventoryDashboard"));
const ItemMaster = lazy(() => import("./PAGE/Inventory/ItemMaster"));
const PurchaseOrders = lazy(() => import("./PAGE/Inventory/PurchaseOrders"));
const StockMovements = lazy(() => import("./PAGE/Inventory/StockMovements"));
const SupplierManagement = lazy(() => import("./PAGE/Inventory/SupplierManagement"));
const InventoryReports = lazy(() => import("./PAGE/Inventory/InventoryReports"));

const AssetDashboard = lazy(() => import("./PAGE/Assets/AssetDashboard"));
const AssetRegistry = lazy(() => import("./PAGE/Assets/AssetRegistry"));
const AssetAssignment = lazy(() => import("./PAGE/Assets/AssetAssignment"));
const AssetMaintenance = lazy(() => import("./PAGE/Assets/AssetMaintenance"));
const AssetDepreciation = lazy(() => import("./PAGE/Assets/AssetDepreciation"));
const AssetDisposal = lazy(() => import("./PAGE/Assets/AssetDisposal"));
const AssetReports = lazy(() => import("./PAGE/Assets/AssetReports"));

// HR & Staff Management Module
const HRDashboard = lazy(() => import("./PAGE/HR/HRDashboard"));
const SalaryManagement = lazy(() => import("./PAGE/HR/SalaryManagement"));
const AttendanceSystem = lazy(() => import("./PAGE/HR/AttendanceSystem"));
const AttendanceDeductionSettings = lazy(() => import("./PAGE/HR/AttendanceDeductionSettings"));
const AttendanceTimeSettings = lazy(() => import("./PAGE/HR/AttendanceTimeSettingsCombined"));
const DeviceStatus = lazy(() => import("./PAGE/HR/DeviceStatus"));
const LeaveManagement = lazy(() => import("./PAGE/HR/LeaveManagement"));
const PayrollSystem = lazy(() => import("./PAGE/HR/PayrollSystem"));
const HRReports = lazy(() => import("./PAGE/HR/HRReports"));

// Loading fallback component - renders LoadingScreen directly without wrapper
const PageLoader = () => <LoadingScreen />;

// Wrapper component for lazy-loaded routes
const LazyRoute = ({ component: Component, ...props }) => (
  <Suspense fallback={<PageLoader />}>
    <Component {...props} />
  </Suspense>
);

// Redirect components for legacy routes with params
const StudentProfileRedirect = () => {
  const { username } = useParams();
  return <Navigate to={`/app/student/${username}`} replace />;
};

const GuardianProfileRedirect = () => {
  const { username } = useParams();
  return <Navigate to={`/app/guardian/${username}`} replace />;
};

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <div>
          <Provider store={store}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/finance-app" element={<Navigate to="/app/finance/" replace />} />
          <Route path="/app/finance-login" element={<Navigate to="/app/finance/login" replace />} />
          <Route path="/super-finance" element={<LazyRoute component={SuperFinance} />} />
          <Route path="/about-us" element={<Suspense fallback={<PageLoader />}><AboutUs /></Suspense>} />
          <Route path="/diagnostics" element={<Suspense fallback={<PageLoader />}><Diagnostics /></Suspense>} />
          
          {/* UI Component Showcase - Public for testing */}
          <Route path="/showcase" element={<Suspense fallback={<PageLoader />}><ComponentShowcase /></Suspense>} />
          
          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <InitialRedirect>
                <Home />
              </InitialRedirect>
            </ProtectedRoute>
          }>
              <Route index element={<Suspense fallback={<PageLoader />}><ModernDashboard /></Suspense>} />
              <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><ModernDashboard /></Suspense>} />
              <Route path="dashboard-detailed" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
              <Route path="dashboard-old" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
              
              {/* Tasks routes - separate from dashboard */}
              <Route path="tasks" element={<LazyRoute component={TaskPage} />} />
              <Route path="tasks/:taskId" element={<TaskDetailWrapper />} />
              
              {/* Report Pages */}
              <Route path="reports/students" element={<LazyRoute component={StudentsReport} />} />
              <Route path="reports/registrations" element={<LazyRoute component={RegistrationReport} />} />
              <Route path="reports/staff" element={<LazyRoute component={StaffReport} />} />
              <Route path="reports/academic" element={<LazyRoute component={AcademicReport} />} />
              <Route path="reports/attendance" element={<LazyRoute component={AttendanceReport} />} />
              <Route path="reports/behavior" element={<LazyRoute component={BehaviorReport} />} />
              <Route path="reports/evaluations" element={<LazyRoute component={EvaluationsReport} />} />
              
              <Route path="create-register-student" element={<LazyRoute component={CreateRegisterStudent} />} />
              <Route path="Student-Form-Builder" element={<LazyRoute component={StudentFormBuilder} />} />
              <Route path="Staff-Form-Builder" element={<LazyRoute component={StaffFormBuilder} />} />
              <Route path="create-register-staff" element={<LazyRoute component={CreateRegisterStaff} />} />
              <Route path="list-student" element={<LazyRoute component={ListStudent} />} />
              <Route path="list-staff" element={<LazyRoute component={ListStaff} />} />
              <Route path="edit-staff/:staffType/:className/:uniqueId" element={<LazyRoute component={EditStaff} />} />
              <Route path="list-guardian" element={<LazyRoute component={ListGuardian} />} />
              <Route
                path="evaluation"
                element={
                  <ErrorBoundary>
                    <EvaluationManager />
                  </ErrorBoundary>
                }
              />
              <Route
                path="evaluation-form/:evaluationId"
                element={
                  <ErrorBoundary>
                    <EvaluationFormPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/evaluation-form/:id" element={<EvaluationFormDisplay />} />
              <Route path="/evaluation/:id" element={<EvaluationDetailsView />} />
              <Route path="evaluation-book" element={<EvaluationBookFormBuilder />} />
              <Route path="evaluation-book/assignments" element={<TeacherAssignmentManager />} />
              <Route path="evaluation-book/teacher" element={<TeacherClassList />} />
              <Route path="evaluation-book/daily/:className" element={<DailyEvaluationForm />} />
              <Route path="evaluation-book/guardian" element={<GuardianEvaluationInbox />} />
              <Route path="evaluation-book/guardian/feedback/:evaluationId" element={<GuardianFeedbackForm />} />
              <Route path="kg/evaluation" element={<KGEvaluation />} />
              <Route path="kg/evaluation-book" element={<KGEvaluationBookPlaceholder />} />
              <Route path="kg/assignments" element={<KGAssignmentsPlaceholder />} />
              <Route path="mark-list-view" element={<MarkListView />} />
              <Route path="student-attendance-system" element={<StudentAttendanceSystem />} />
              <Route path="student-attendance-time-settings" element={<StudentAttendanceTimeSettings />} />
              <Route path="ai/dashboard" element={<AIDashboard />} />
              <Route path="ai/books/upload" element={<AIBookUpload />} />
              <Route path="ai/books" element={<AIBookList />} />
              <Route path="ai/generate/lesson-plan" element={<AILessonPlan />} />
              <Route path="ai/generate/lesson-note" element={<AILessonNote />} />
              <Route path="ai/generate/homework" element={<AIHomework />} />
              <Route path="ai/generate/worksheet" element={<AIWorksheet />} />
              <Route path="ai/generate/quiz" element={<AIQuiz />} />
              <Route path="ai/generate/exam" element={<AIExam />} />
              <Route path="ai/generate/scramble-exam" element={<AIScrambleExam />} />
              <Route path="ai/test-generator" element={<AITestGenerator />} />
              <Route path="ai-test-generator" element={<AITestGenerator />} />
              <Route path="ai-tests" element={<AITests />} />
              <Route path="ai-test-player" element={<AITestPlayer />} />
              <Route path="class-teacher-assignment" element={<ClassTeacherAssignment />} />
              <Route path="live-attendance" element={<LiveAttendanceMonitor />} />
              <Route path="communication" element={<AdminChat />} />
              {/* Counsellor route removed */}
              <Route path="create-mark-list" element={<MarkListSystem />} />
              <Route path="Mark-List-Management" element={<MarkListManagement />} />
              <Route path="Subject-Mapping-Setup" element={<SubjectMappingSetup />} />
              <Route path="post" element={<Post />} />
              {/* Roaster route removed */}
              <Route path="report-card" element={<ReportCard />} />
              <Route path="create-accounts" element={<CreateAccounts />} />
              <Route path="admin-sub-accounts" element={<AdminSubAccounts />} />
              {/* Payment route removed */}
              <Route path="settings" element={<Setting />} />
              <Route path="sms-templates" element={<SmsTemplates />} />
              <Route path="sms" element={<SmsTemplates />} />
              <Route path="sms-counter" element={<SmsCounter />} />
              <Route path="backup" element={<DataBackup />} />
              {/* Branch-create route removed */}
              <Route path="schedule" element={<ScheduleDashboard />} />
              <Route path="schedule/Timetable" element={<ScheduleTimetable />} />
              <Route path="schedule/ClassShiftForm" element={<ClassShiftForm />} />
              <Route path="schedule/requirements" element={<ClassRequirementsForm />} />

              {/* New route for StaffForm */}
              <Route path="staff-form/:staffType/:className" element={<StaffForm />} />
              
              {/* Finance Module Routes */}
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="finance/accounts" element={<ChartOfAccounts />} />
              <Route path="finance/fee-management" element={<FeeManagement />} />
              <Route path="finance/invoices" element={<InvoiceManagement />} />
              <Route path="finance/payments" element={<FeePaymentManagement />} />
              <Route path="finance/monthly-payments" element={<MonthlyPayments />} />
              <Route path="finance/student-exemption" element={<StudentExemption />} />
              <Route path="finance/monthly-payment-settings" element={<MonthlyPaymentSettings />} />
              <Route path="hr/expenses" element={<ExpenseManagement />} />
              <Route path="hr/expense-approval" element={<ExpenseApproval />} />
              <Route path="hr/budgets" element={<BudgetManagement />} />
              <Route path="finance/payroll" element={<PayrollManagement />} />
              <Route path="finance/reports" element={<FinanceReports />} />
              <Route path="finance/inventory-integration" element={<ComingSoon title="Inventory Integration" description="Connect finance with inventory for automated expense tracking." />} />
              {/* Redirects - moved from Finance to HR */}
              <Route path="finance/expenses" element={<Navigate to="/hr/expenses" replace />} />
              <Route path="finance/expense-approval" element={<Navigate to="/hr/expense-approval" replace />} />
              <Route path="finance/budgets" element={<Navigate to="/hr/budgets" replace />} />
              
              {/* Inventory Module Routes */}
              <Route path="inventory" element={<LazyRoute component={InventoryDashboard} />} />
              <Route path="inventory/items" element={<LazyRoute component={ItemMaster} />} />
              <Route path="inventory/purchase-orders" element={<LazyRoute component={PurchaseOrders} />} />
              <Route path="inventory/movements" element={<LazyRoute component={StockMovements} />} />
              <Route path="inventory/suppliers" element={<LazyRoute component={SupplierManagement} />} />
              <Route path="inventory/reports" element={<LazyRoute component={InventoryReports} />} />
              
              {/* Asset Management Module Routes */}
              <Route path="assets" element={<LazyRoute component={AssetDashboard} />} />
              <Route path="assets/registry" element={<LazyRoute component={AssetRegistry} />} />
              <Route path="assets/assignments" element={<LazyRoute component={AssetAssignment} />} />
              <Route path="assets/maintenance" element={<LazyRoute component={AssetMaintenance} />} />
              <Route path="assets/depreciation" element={<LazyRoute component={AssetDepreciation} />} />
              <Route path="assets/disposal" element={<LazyRoute component={AssetDisposal} />} />
              <Route path="assets/reports" element={<LazyRoute component={AssetReports} />} />
              
              {/* HR & Staff Management Module Routes */}
              <Route path="hr" element={<HRDashboard />} />
              <Route path="hr/salary" element={<SalaryManagement />} />
              <Route path="hr/attendance" element={<AttendanceSystem />} />
              <Route path="device-status" element={<DeviceStatus />} />
              <Route path="hr/attendance-deduction-settings" element={<AttendanceDeductionSettings />} />
              <Route path="hr/attendance-time-settings" element={<AttendanceTimeSettings />} />
              {/* Staff-specific timing redirected to combined time settings */}
              <Route path="hr/staff-specific-timing" element={<Navigate to="/hr/attendance-time-settings" replace />} />
              {/* Redirect old shift routes to combined time settings */}
              <Route path="hr/shift-time-settings" element={<Navigate to="/hr/attendance-time-settings" replace />} />
              <Route path="hr/staff-shift-assignment" element={<Navigate to="/hr/attendance-time-settings" replace />} />
              <Route path="hr/leave" element={<LeaveManagement />} />
              <Route path="hr/payroll" element={<PayrollSystem />} />
              <Route path="hr/reports" element={<HRReports />} />
              
              {/* Student Faults — merged into Faults page */}
              <Route path="faults" element={<FaultsPage />} />
            </Route>
            <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>}>
              <Route index element={<PostStudents />} />
              <Route path="class-students" element={<ClassStudents />} />
              <Route path="communication-students" element={<CommunicationStudents />} />
              <Route path="profile-students" element={<ProfileStudents />} />
            </Route>
            <Route path="/staff" element={<ProtectedRoute><Staff /></ProtectedRoute>}>
              <Route index element={<StaffProfile />} />
              <Route path="post-staff-new" element={<POSTS />} />
              {/* OLD ATTENDANCE REMOVED - Use /app/staff profile instead */}
              {/* <Route path="attendance-staff" element={<TeacherClassAttendance />} /> */}
              <Route path="attendance-staff" element={
                <RoleProtectedRoute requiredFeature="attendance">
                  <TeacherClassAttendance />
                </RoleProtectedRoute>
              } />
              <Route path="mark-list-staff" element={
                <RoleProtectedRoute requiredFeature="mark-lists">
                  <MRLIST />
                </RoleProtectedRoute>
              } />
              <Route path="exam-creation-staff" element={
                <RoleProtectedRoute requiredFeature="exam-creation">
                  <ExamCreationStaff />
                </RoleProtectedRoute>
              } />
              <Route path="evaluation-staff-control" element={<EVA />} />
              {/* OLD PROFILE ROUTE REMOVED - Use /app/staff (index) instead */}
              <Route path="communication-staff" element={<COMSTA />} />
            </Route>
            <Route path="/guardian" element={<ProtectedRoute><Guardian /></ProtectedRoute>}>
              <Route index element={<GuardianHome />} />
              <Route path="wards" element={<GuardianWards />} />
              <Route path="attendance" element={<GuardianAttendance />} />
              <Route path="marks" element={<GuardianMarks />} />
              <Route path="messages" element={<GuardianMessages />} />
              <Route path="profile" element={<GuardianProfilePage />} />
            </Route>
            
            {/* ============================================== */}
            {/* MOBILE APP ROUTES - Completely Standalone      */}
            {/* These routes are independent from the main app */}
            {/* Access via: /app/student-login, /app/staff-profile, etc. */}
            {/* ============================================== */}
            
            {/* PWA Installation Pages - Standalone (No Header/Sidebar) */}
            <Route path="/install/student-app" element={<InstallStudentApp />} />
            <Route path="/install/staff-app" element={<InstallStaffApp />} />
            <Route path="/install/guardian-app" element={<InstallGuardianApp />} />
            
            {/* Mobile App Login Pages */}
            <Route path="/app/student-login" element={<StudentLogin />} />
            <Route path="/app/guardian-login" element={<GuardianLogin />} />
            <Route path="/app/staff-login" element={<StaffLogin />} />
            <Route path="/app/student/:username" element={<StudentProfile />} />
            <Route path="/app/guardian/:username" element={<GuardianProfile />} />
            <Route path="/app/guardian-chat" element={<GuardianChat />} />
            <Route path="/app/staff" element={<StaffProfile />} />
            <Route path="/app/teacher-chat" element={<TeacherChat />} />
            
            {/* Finance App - standalone app for finance staff */}
            <Route path="/app/finance/*" element={<FinanceApp />} />

            {/* Super Finance App - standalone app for super finance staff (all branches) */}
            <Route path="/app/super-finance/*" element={<SuperFinanceApp />} />
            
            {/* Legacy route redirects - for backward compatibility */}
            <Route path="/student-login" element={<Navigate to="/app/student-login" replace />} />
            <Route path="/guardian-login" element={<Navigate to="/app/guardian-login" replace />} />
            <Route path="/staff-login" element={<Navigate to="/app/staff-login" replace />} />
            <Route path="/student-profile/:username" element={<StudentProfileRedirect />} />
            <Route path="/guardian-profile/:username" element={<GuardianProfileRedirect />} />
            <Route path="/staff-profile" element={<Navigate to="/app/staff" replace />} />
          </Routes>
            </Suspense>
          </Provider>
        </div>
        <OfflineBanner />
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;