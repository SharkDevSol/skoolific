import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import {
  FiHome, FiUsers, FiCheckCircle, FiClipboard, FiAlertTriangle, FiDollarSign, FiSettings,
  FiLogOut, FiChevronDown, FiCheck, FiMoon, FiGlobe, FiKey, FiUser, FiMessageSquare
} from 'react-icons/fi';
import styles from './SuperAdmin.module.css';
import SmsCounter from '../SmsCounter/SmsCounter';

const ETH_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

const I18N = {
  en: {
    appName: 'Super Admin', loginSub: 'All branch reports in one place',
    signIn: 'Sign In', signingIn: 'Signing in...', username: 'Username', password: 'Password',
    logout: 'Logout', allBranches: 'All Branches', loading: 'Loading reports...', loginFailed: 'Login failed',
    home: 'Home', students: 'Students', attendance: 'Attendance', marks: 'Marks', faults: 'Faults', finance: 'Finance', sms: 'SMS', settings: 'Settings',
    totalStudents: 'Total Students', boys: 'boys', girls: 'girls', across: 'across', branchesWord: 'branches',
    newStudents: 'New', oldStudents: 'Old', addedByDate: 'Students Added by Date', addedByDateTitle: 'Pick a date to see who was added',
    from: 'From', to: 'To', studentsAdded: 'Students Added', noStudentsAdded: 'No students added in this period', student: 'Student', typeWord: 'Type', branch: 'Branch',
    addedToday: 'Added Today', collectedToday: 'Collected Today',
    attendanceRate: 'Attendance Rate', collected: 'Collected', pendingFees: 'Unpaid (Due)', faultsCount: 'Faults',
    freeStudents: 'Free Students', freeRegPaid: 'Free Reg. Paid',
    byClass: 'By Class', byBranch: 'By Branch', allBranchesNote: 'all branches',
    class: 'Class', total: 'Total', records: 'records', present: 'Present', late: 'Late', absent: 'Absent', rate: 'Rate',
    exams: 'Exams', average: 'Average', marksCount: 'Marks',
    expected: 'Expected', pending: 'Pending', studentsCount: 'Students',
    filter: 'Filter', year: 'Year', month: 'Month', allMonths: 'All months', term: 'Term', allTerms: 'All terms', academicYear: 'Academic Year',
    filterEthDate: 'Filter by Date (Ethiopian calendar)', filterEthMonth: 'Filter by Month (Ethiopian calendar)',
    unlockedNote: 'Pending = unlocked months only (months already due, not yet fully paid)',
    noBranchData: 'No branch data available', noClasses: 'No classes found', noAttendance: 'No attendance records',
    noExamData: 'No exam data yet', noFaults: 'No faults recorded', noInvoices: 'No invoices found',
    studentsTitle: 'Students by Branch & Class',
    account: 'Account', changeUsername: 'Change Username', changePassword: 'Change Password',
    currentPassword: 'Current password', newUsername: 'New username', newPassword: 'New password',
    confirmPassword: 'Confirm new password', save: 'Save Changes', saving: 'Saving...',
    accountUpdated: 'Account updated successfully!', passwordMismatch: 'Passwords do not match',
    passwordTooShort: 'New password must be at least 4 characters', wrongPassword: 'Current password is incorrect',
    preferences: 'Preferences', language: 'Language', darkMode: 'Dark Mode', darkModeDesc: 'Switch to dark colors',
    languageDesc: 'Choose the app language', english: 'English', somali: 'Somali', amharic: 'Amharic', arabic: 'Arabic',
    perBranchDetail: 'Each branch shows its own classes and totals', ofExpected: 'of expected', collectedWord: 'collected'
  },
  so: {
    appName: 'Super Admin', loginSub: 'Warbixinaha dhammaan laamaha hal meel',
    signIn: 'Soo Gal', signingIn: 'Soo gelaya...', username: 'Magaca Isticmaalaha', password: 'Furaha',
    logout: 'Ka Bax', allBranches: 'Dhammaan Laamaha', loading: 'Warbixino la shubayo...', loginFailed: 'Soo geliddu way fashilantay',
    home: 'Guriga', students: 'Ardayda', attendance: 'Imaanshaha', marks: 'Dhibcaha', faults: 'Khaladaadka', finance: 'Maaliyadda', sms: 'SMS', settings: 'Dejinta',
    totalStudents: 'Wadarta Ardayda', boys: 'wiilal', girls: 'gabdho', across: 'ku kala', branchesWord: 'laamood',
    newStudents: 'Cusub', oldStudents: 'Hore', addedByDate: 'Arday lagu daray Taariikh', addedByDateTitle: 'Dooro taariikh si aad u aragto cidda lagu daray',
    from: 'Laga', to: 'Ilaa', studentsAdded: 'Arday la daray', noStudentsAdded: 'Ma jiraan arday lagu daray muddadan', student: 'Arday', typeWord: 'Nooca', branch: 'Laan',
    addedToday: 'Maanta La Daray', collectedToday: 'Maanta La Ururiyay',
    attendanceRate: 'Heerka Imaanshaha', collected: 'La Ururiyay', pendingFees: 'Lacag La Sugayo', faultsCount: 'Khaladaadka',
    freeStudents: 'Arday bilaash ah', freeRegPaid: 'Reg lacag la bixiyay',
    byClass: 'Fasal ahaan', byBranch: 'Laan ahaan', allBranchesNote: 'dhammaan laamaha',
    class: 'Fasal', total: 'Wadar', records: 'diiwaanno', present: 'Joogay', late: 'Soo Daahay', absent: 'Maqan', rate: 'Heerka',
    exams: 'Imtixaanno', average: 'Celcelis', marksCount: 'Dhibco',
    expected: 'La Filayo', pending: 'La Sugayo', studentsCount: 'Arday',
    filter: 'Shaandheyn', year: 'Sannad', month: 'Bil', allMonths: 'Dhammaan Bilaha', term: 'Xilli', allTerms: 'Dhammaan Xilliyada', academicYear: 'Sannad Dugsiyeed',
    filterEthDate: 'Ku shaandhee Taariikh (Kalandarka Itoobiya)', filterEthMonth: 'Ku shaandhee Bil (Kalandarka Itoobiya)',
    unlockedNote: 'Lacagta la sugayo = bilaha furay oo keliya (bilaha waajibka ah, aan weli si buuxda loo bixin)',
    noBranchData: 'Xog laan ma jirto', noClasses: 'Fasallo lama helin', noAttendance: 'Diiwaanno imaansho ma jiraan',
    noExamData: 'Xog imtixaan ma jirto', noFaults: 'Khaladaad lama diiwaan gelin', noInvoices: 'Qaansheegyada ma jiraan',
    studentsTitle: 'Ardayda — Laan & Fasal',
    account: 'Akoonka', changeUsername: 'Beddel Magaca Isticmaalaha', changePassword: 'Beddel Furaha',
    currentPassword: 'Furaha hadda', newUsername: 'Magac cusub', newPassword: 'Fure cusub',
    confirmPassword: 'Xaqiiji furaha cusub', save: 'Keydi', saving: 'Keydinaya...',
    accountUpdated: 'Akoonka si guul leh ayaa loo beddelay!', passwordMismatch: 'Furaha isma laha',
    passwordTooShort: 'Furaha cusub waa inuu ka yaraan 4 xaraf', wrongPassword: 'Furaha hadda waa khalad',
    preferences: 'Doorshooyinka', language: 'Luqadda', darkMode: 'Habka Madow', darkModeDesc: 'U beddel midabbada madow',
    languageDesc: 'Dooro luqadda app-ka', english: 'Ingiriis', somali: 'Soomaali', amharic: 'Amxaari', arabic: 'Carabi',
    perBranchDetail: 'Laan kastaa waxay muujisaa fasalladeeda iyo wadarta', ofExpected: 'laga filayay', collectedWord: 'la ururiyay'
  },
  am: {
    appName: 'ሱፐር አድሚን', loginSub: 'የሁሉም ቅርንጫፎች ሪፖርቶች በአንድ ቦታ',
    signIn: 'ግባ', signingIn: 'እየገባ...', username: 'የተጠቃሚ ስም', password: 'የይለፍ ቃል',
    logout: 'ውጣ', allBranches: 'ሁሉም ቅርንጫፎች', loading: 'ሪፖርቶች እየጫኑ...', loginFailed: 'መግባት አልተሳካም',
    home: 'መነሻ', students: 'ተማሪዎች', attendance: 'መገኘት', marks: 'ውጤቶች', faults: 'ጥፋቶች', finance: 'ፋይናንስ', sms: 'SMS', settings: 'ቅንብሮች',
    totalStudents: 'ጠቅላላ ተማሪዎች', boys: 'ወንዶች', girls: 'ሴቶች', across: 'በ', branchesWord: 'ቅርንጫፎች',
    newStudents: 'አዲስ', oldStudents: 'ቀድሞ', addedByDate: 'በቀን የተጨመሩ ተማሪዎች', addedByDateTitle: 'ማን እንደተጨመረ ለማየት ቀን ምረጥ',
    from: 'ከ', to: 'እስከ', studentsAdded: 'የተጨመሩ ተማሪዎች', noStudentsAdded: 'በዚህ ጊዜ የተጨመሩ ተማሪዎች የሉም', student: 'ተማሪ', typeWord: 'ዓይነት', branch: 'ቅርንጫፍ',
    addedToday: 'ዛሬ የተጨመሩ', collectedToday: 'ዛሬ የተሰበሰበ',
    attendanceRate: 'የመገኘት መጠን', collected: 'የተሰበሰበ', pendingFees: 'ያልተከፈለ', faultsCount: 'ጥፋቶች',
    freeStudents: 'ነጻ ተማሪዎች', freeRegPaid: 'ነጻ ምዝገባ የተከፈለ',
    byClass: 'በክፍል', byBranch: 'በቅርንጫፍ', allBranchesNote: 'ሁሉም ቅርንጫፎች',
    class: 'ክፍል', total: 'ጠቅላላ', records: 'መዝገቦች', present: 'ተገኝቷል', late: 'ዘግይቷል', absent: 'አልተገኘም', rate: 'መጠን',
    exams: 'ፈተናዎች', average: 'አማካይ', marksCount: 'ውጤቶች',
    expected: 'የሚጠበቅ', pending: 'በመጠባበቅ', studentsCount: 'ተማሪዎች',
    filter: 'ማጣሪያ', year: 'ዓመት', month: 'ወር', allMonths: 'ሁሉም ወራት', term: 'ሙሉ ጊዜ', allTerms: 'ሁሉም ጊዜያት', academicYear: 'የትምህርት ዓመት',
    filterEthDate: 'በቀን ማጣራት (የኢትዮጵያ ቀን መቁጠሪያ)', filterEthMonth: 'በወር ማጣራት (የኢትዮጵያ ቀን መቁጠሪያ)',
    unlockedNote: 'ያልተከፈለ = የተከፈቱ ወራት ብቻ (የደረሱ ወራት፣ እስካሁን ሙሉ በሙሉ ያልተከፈሉ)',
    noBranchData: 'የቅርንጫፍ መረጃ የለም', noClasses: 'ክፍሎች አልተገኙም', noAttendance: 'የመገኘት መዝገቦች የሉም',
    noExamData: 'የፈተና መረጃ የለም', noFaults: 'ጥፋቶች አልተመዘገቡም', noInvoices: 'ክፍያ መጠየቂያዎች የሉም',
    studentsTitle: 'ተማሪዎች በቅርንጫፍ እና በክፍል',
    account: 'መለያ', changeUsername: 'የተጠቃሚ ስም ቀይር', changePassword: 'የይለፍ ቃል ቀይር',
    currentPassword: 'የአሁኑ የይለፍ ቃል', newUsername: 'አዲስ የተጠቃሚ ስም', newPassword: 'አዲስ የይለፍ ቃል',
    confirmPassword: 'አዲሱን የይለፍ ቃል አረጋግጥ', save: 'አስቀምጥ', saving: 'እያስቀመጠ...',
    accountUpdated: 'መለያ በተሳካ ሁኔታ ተለውጧል!', passwordMismatch: 'የይለፍ ቃሎቹ አይመሳሰሉም',
    passwordTooShort: 'አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት', wrongPassword: 'የአሁኑ የይለፍ ቃል ትክክል አይደለም',
    preferences: 'ምርጫዎች', language: 'ቋንቋ', darkMode: 'ጨለማ ሁነታ', darkModeDesc: 'ወደ ጨለማ ቀለሞች ቀይር',
    languageDesc: 'የመተግበሪያውን ቋንቋ ምረጥ', english: 'እንግሊዝኛ', somali: 'ሶማሊኛ', amharic: 'አማርኛ', arabic: 'አረብኛ',
    perBranchDetail: 'እያንዳንዱ ቅርንጫፍ የራሱን ክፍሎችና ጠቅላላ ያሳያል', ofExpected: 'ከሚጠበቀው', collectedWord: 'የተሰበሰበ'
  },
  ar: {
    appName: 'إقرأ سوبر أدمن', loginSub: 'تقارير جميع الفروع في مكان واحد',
    signIn: 'تسجيل الدخول', signingIn: 'جارٍ الدخول...', username: 'اسم المستخدم', password: 'كلمة المرور',
    logout: 'تسجيل الخروج', allBranches: 'جميع الفروع', loading: 'جارٍ تحميل التقارير...', loginFailed: 'فشل تسجيل الدخول',
    home: 'الرئيسية', students: 'الطلاب', attendance: 'الحضور', marks: 'الدرجات', faults: 'الأخطاء', finance: 'المالية', sms: 'SMS', settings: 'الإعدادات',
    totalStudents: 'إجمالي الطلاب', boys: 'أولاد', girls: 'بنات', across: 'عبر', branchesWord: 'فروع',
    newStudents: 'جديد', oldStudents: 'قديم', addedByDate: 'الطلاب المضافون حسب التاريخ', addedByDateTitle: 'اختر تاريخاً لمعرفة من أُضيف',
    from: 'من', to: 'إلى', studentsAdded: 'طلاب أُضيفوا', noStudentsAdded: 'لا يوجد طلاب أُضيفوا في هذه الفترة', student: 'الطالب', typeWord: 'النوع', branch: 'الفرع',
    addedToday: 'أُضيف اليوم', collectedToday: 'المُحصَّل اليوم',
    attendanceRate: 'نسبة الحضور', collected: 'المُحصَّل', pendingFees: 'المستحق غير المدفوع', faultsCount: 'الأخطاء',
    freeStudents: 'الطلاب المجانيون', freeRegPaid: 'رسوم التسجيل المجانية المدفوعة',
    byClass: 'حسب الصف', byBranch: 'حسب الفرع', allBranchesNote: 'جميع الفروع',
    class: 'الصف', total: 'الإجمالي', records: 'سجلات', present: 'حاضر', late: 'متأخر', absent: 'غائب', rate: 'النسبة',
    exams: 'الامتحانات', average: 'المتوسط', marksCount: 'الدرجات',
    expected: 'المتوقع', pending: 'المتبقي', studentsCount: 'الطلاب',
    filter: 'تصفية', year: 'السنة', month: 'الشهر', allMonths: 'كل الشهور', term: 'الفصل', allTerms: 'كل الفصول', academicYear: 'السنة الدراسية',
    filterEthDate: 'تصفية حسب التاريخ (التقويم الإثيوبي)', filterEthMonth: 'تصفية حسب الشهر (التقويم الإثيوبي)',
    unlockedNote: 'المتبقي = الشهور المفتوحة فقط (الشهور المستحقة، التي لم تُدفع بالكامل بعد)',
    noBranchData: 'لا توجد بيانات للفروع', noClasses: 'لا توجد صفوف', noAttendance: 'لا توجد سجلات حضور',
    noExamData: 'لا توجد بيانات امتحانات بعد', noFaults: 'لا توجد أخطاء مسجلة', noInvoices: 'لا توجد فواتير',
    studentsTitle: 'الطلاب حسب الفرع والصف',
    account: 'الحساب', changeUsername: 'تغيير اسم المستخدم', changePassword: 'تغيير كلمة المرور',
    currentPassword: 'كلمة المرور الحالية', newUsername: 'اسم مستخدم جديد', newPassword: 'كلمة مرور جديدة',
    confirmPassword: 'تأكيد كلمة المرور الجديدة', save: 'حفظ التغييرات', saving: 'جارٍ الحفظ...',
    accountUpdated: 'تم تحديث الحساب بنجاح!', passwordMismatch: 'كلمتا المرور غير متطابقتين',
    passwordTooShort: 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل', wrongPassword: 'كلمة المرور الحالية غير صحيحة',
    preferences: 'التفضيلات', language: 'اللغة', darkMode: 'الوضع الداكن', darkModeDesc: 'التبديل إلى الألوان الداكنة',
    languageDesc: 'اختر لغة التطبيق', english: 'الإنجليزية', somali: 'الصومالية', amharic: 'الأمهرية', arabic: 'العربية',
    perBranchDetail: 'كل فرع يعرض صفوفه وإجمالياته', ofExpected: 'من المتوقع', collectedWord: 'تم تحصيله'
  }
};

const LANGS = [
  { code: 'en', labelKey: 'english' },
  { code: 'so', labelKey: 'somali' },
  { code: 'am', labelKey: 'amharic' },
  { code: 'ar', labelKey: 'arabic' }
];

const TABS = [
  { key: 'home', labelKey: 'home', icon: FiHome },
  { key: 'students', labelKey: 'students', icon: FiUsers },
  { key: 'attendance', labelKey: 'attendance', icon: FiCheckCircle },
  { key: 'marks', labelKey: 'marks', icon: FiClipboard },
  { key: 'faults', labelKey: 'faults', icon: FiAlertTriangle },
  { key: 'finance', labelKey: 'finance', icon: FiDollarSign },
  { key: 'sms', labelKey: 'sms', icon: FiMessageSquare },
  { key: 'settings', labelKey: 'settings', icon: FiSettings }
];

const fmt = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const birr = (n) => fmt(n) + ' Birr';

const SuperAdmin = () => {
  const [lang, setLang] = useState(localStorage.getItem('superAdminLang') || 'en');
  const [dark, setDark] = useState(localStorage.getItem('superAdminTheme') === 'dark');
  const t = (key) => I18N[lang]?.[key] || I18N.en[key] || key;

  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('superAdminToken'));
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('ALL');
  const [branchOpen, setBranchOpen] = useState(false);
  const [tab, setTab] = useState('home');

  const [students, setStudents] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [marks, setMarks] = useState(null);
  const [faults, setFaults] = useState(null);
  const [finance, setFinance] = useState(null);
  const [registrations, setRegistrations] = useState(null);

  const [regFrom, setRegFrom] = useState(() => new Date().toISOString().substring(0, 10));
  const [regTo, setRegTo] = useState(() => new Date().toISOString().substring(0, 10));

  const [attYear, setAttYear] = useState('');
  const [attMonth, setAttMonth] = useState('');
  const [finMonth, setFinMonth] = useState('');
  const [faultYear, setFaultYear] = useState('');
  const [faultMonth, setFaultMonth] = useState('');
  const [mkYear, setMkYear] = useState('');
  const [mkTerm, setMkTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accForm, setAccForm] = useState({ currentPassword: '', newUsername: '', newPassword: '', confirmPassword: '' });
  const [accMsg, setAccMsg] = useState('');
  const [accError, setAccError] = useState('');
  const [accLoading, setAccLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('superAdminLang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('superAdminTheme', dark ? 'dark' : 'light');
  }, [dark]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await api.post('/super-admin/login', loginForm);
      localStorage.setItem('superAdminToken', res.data.token);
      setIsLoggedIn(true);
    } catch (err) {
      setLoginError(err.response?.data?.error || t('loginFailed') || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('superAdminToken');
    setIsLoggedIn(false);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const b = branch === 'ALL' ? 'ALL' : branch;
      const [branchesRes, stuRes, attRes, mkRes, fltRes, finRes, regRes] = await Promise.all([
        api.get('/super-admin/branches', { timeout: 60000 }),
        api.get('/super-admin/report/students', { timeout: 90000, params: { branchCode: b } }),
        api.get('/super-admin/report/attendance', { timeout: 90000, params: {
          branchCode: b, year: attYear || undefined, month: attMonth || undefined
        }}),
        api.get('/super-admin/report/marks', { timeout: 90000, params: {
          branchCode: b, academic_year: mkYear || undefined, term: mkTerm || undefined
        }}),
        api.get('/super-admin/report/faults', { timeout: 90000, params: {
          branchCode: b, year: faultYear || undefined, month: faultMonth || undefined
        }}),
        api.get('/super-admin/report/finance', { timeout: 90000, params: {
          branchCode: b, month: finMonth || undefined
        }}),
        api.get('/super-admin/report/registrations', { timeout: 120000, params: {
          branchCode: b, from: regFrom || undefined, to: regTo || undefined
        }})
      ]);

      if (branchesRes.data.branches) {
        setBranches(branchesRes.data.branches.map(x => ({ code: x.branch_code, name: x.branch_name })));
      }
      setStudents(stuRes.data.data);
      setAttendance(attRes.data.data);
      setMarks(mkRes.data.data);
      setFaults(fltRes.data.data);
      setFinance(finRes.data.data);
      setRegistrations(regRes.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reports');
      if (err.response?.status === 401) handleLogout();
    } finally {
      setLoading(false);
    }
  }, [branch, attYear, attMonth, mkYear, mkTerm, faultYear, faultMonth, finMonth, regFrom, regTo]);

  useEffect(() => {
    if (isLoggedIn) loadAll();
  }, [isLoggedIn, loadAll]);

  const handleAccountSave = async (e) => {
    e.preventDefault();
    setAccMsg('');
    setAccError('');
    if (accForm.newPassword && accForm.newPassword.length < 4) {
      setAccError(t('passwordTooShort'));
      return;
    }
    if (accForm.newPassword && accForm.newPassword !== accForm.confirmPassword) {
      setAccError(t('passwordMismatch'));
      return;
    }
    setAccLoading(true);
    try {
      await api.put('/super-admin/account', {
        currentPassword: accForm.currentPassword,
        newUsername: accForm.newUsername || undefined,
        newPassword: accForm.newPassword || undefined
      });
      setAccMsg(t('accountUpdated'));
      setAccForm({ currentPassword: '', newUsername: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setAccError(err.response?.data?.error || 'Update failed');
    } finally {
      setAccLoading(false);
    }
  };

  // ---------------- LOGIN SCREEN ----------------
  if (!isLoggedIn) {
    return (
      <div className={styles.loginWrap}>
        <div className={`${styles.loginCard} ${dark ? styles.loginCardDark : ''}`}>
          <div className={styles.loginLogo}>I</div>
          <h1 className={styles.loginTitle}>{t('appName')}</h1>
          <p className={styles.loginSub}>{t('loginSub')}</p>
          {loginError && <div className={styles.loginError}>{loginError}</div>}
          <form onSubmit={handleLogin}>
            <input
              className={styles.loginInput}
              type="text"
              placeholder={t('username')}
              value={loginForm.username}
              onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              required
            />
            <input
              className={styles.loginInput}
              type="password"
              placeholder={t('password')}
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
            <button type="submit" className={styles.loginBtn} disabled={loginLoading}>
              {loginLoading ? t('signingIn') : t('signIn')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------------- REPORT COMPONENTS ----------------
  const BranchSelector = () => {
    const currentName = branch === 'ALL'
      ? t('allBranches')
      : branches.find((b) => b.code === branch)?.name || branch;
    return (
      <div className={styles.branchSelectWrap}>
        <button className={styles.branchSelectBtn} onClick={() => setBranchOpen((o) => !o)}>
          <span>{currentName}</span>
          <FiChevronDown />
        </button>
        {branchOpen && (
          <>
            <div className={styles.branchBackdrop} onClick={() => setBranchOpen(false)} />
            <div className={styles.branchDropdown}>
              <button
                className={`${styles.branchOption} ${branch === 'ALL' ? styles.branchOptionActive : ''}`}
                onClick={() => { setBranch('ALL'); setBranchOpen(false); }}
              >
                <span>{t('allBranches')}</span>
                {branch === 'ALL' && <FiCheck className={styles.branchCheck} />}
              </button>
              {branches.map((b) => (
                <button
                  key={b.code}
                  className={`${styles.branchOption} ${branch === b.code ? styles.branchOptionActive : ''}`}
                  onClick={() => { setBranch(b.code); setBranchOpen(false); }}
                >
                  <span>{b.name} <small>({b.code})</small></span>
                  {branch === b.code && <FiCheck className={styles.branchCheck} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const activeBranches = (data) => {
    if (!data?.byBranch) return [];
    return data.byBranch.filter((b) => !b.error);
  };

  const HomeTab = () => {
    const stuBranches = activeBranches(students);
    const finBranches = activeBranches(finance);
    const attBranches = activeBranches(attendance);
    return (
      <>
        <div className={styles.hero}>
          <div className={styles.heroLabel}>{t('totalStudents')}</div>
          <div className={styles.heroValue}>{fmt(students?.grandTotal)}</div>
          <div className={styles.heroSub}>
            {fmt(students?.grandMale)} {t('boys')} · {fmt(students?.grandFemale)} {t('girls')} · {t('across')} {stuBranches.length} {t('branchesWord')}
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('attendanceRate')}</div>
            <div className={styles.statValue}>{attendance?.grandRate ?? 0}%</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('collected')}</div>
            <div className={styles.statValueGold}>{fmt(finance?.grandCollected)}</div>
            <div className={styles.statLabel}>Birr</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('pendingFees')}</div>
            <div className={styles.statValueRed}>{fmt(finance?.grandPending)}</div>
            <div className={styles.statLabel}>Birr</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('faultsCount')}</div>
            <div className={styles.statValue}>{fmt(faults?.grandTotal)}</div>
          </div>
        </div>

        <h3 className={styles.sectionTitle}>{t('byBranch')} <small>({stuBranches.length})</small></h3>
        <div className={styles.card}>
          {stuBranches.map((b) => {
            const fin = finBranches.find((x) => x.branchCode === b.branchCode);
            const att = attBranches.find((x) => x.branchCode === b.branchCode);
            return (
              <div key={b.branchCode} className={styles.branchItem}>
                <div className={styles.branchHead}>
                  <div className={styles.branchDot}>{String(b.branchName || b.branchCode).charAt(0)}</div>
                  <div className={styles.branchName}>{b.branchName}</div>
                  <div className={styles.branchBadge}>{fmt(b.total)}</div>
                </div>
                <div className={styles.branchStats}>
                  <div className={styles.miniStat}>{t('attendanceRate')}<b>{att ? `${att.rate}%` : '—'}</b></div>
                  <div className={styles.miniStat}>{t('collected')}<b>{fin ? birr(fin.collected) : '—'}</b></div>
                  <div className={styles.miniStat}>{t('pending')}<b>{fin ? birr(fin.pending) : '—'}</b></div>
                </div>
              </div>
            );
          })}
          {stuBranches.length === 0 && <div className={styles.empty}>{t('noBranchData')}</div>}
        </div>
      </>
    );
  };

  const StudentsTab = () => {
    const stuBranches = activeBranches(students);
    const regBranches = activeBranches(registrations);
    const regForBranch = (code) => regBranches.find((x) => x.branchCode === code);
    const regForClass = (branchCode, className) => {
      const rb = regForBranch(branchCode);
      return rb?.classes?.find((c) => c.className === className);
    };

    const allAdded = (registrations?.byBranch || [])
      .filter((b) => !b.error)
      .flatMap((b) => b.added || []);

    return (
      <>
        <div className={styles.hero}>
          <div className={styles.heroLabel}>{t('totalStudents')}</div>
          <div className={styles.heroValue}>{fmt(students?.grandTotal)}</div>
          <div className={styles.heroSub}>
            {fmt(students?.grandMale)} {t('boys')} · {fmt(students?.grandFemale)} {t('girls')}
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('newStudents')}</div>
            <div className={styles.statValue}>{fmt(registrations?.grandNew)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('oldStudents')}</div>
            <div className={styles.statValueGold}>{fmt(registrations?.grandOld)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('addedToday')}</div>
            <div className={styles.statValueGold}>{fmt(registrations?.grandAddedToday)}</div>
          </div>
        </div>

        <h3 className={styles.sectionTitle}>{t('addedByDate')}</h3>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('addedByDateTitle')}</div>
          <div className={styles.filterRow}>
            <label>{t('from')}
              <input type="date" value={regFrom} onChange={(e) => setRegFrom(e.target.value)} />
            </label>
            <label>{t('to')}
              <input type="date" value={regTo} onChange={(e) => setRegTo(e.target.value)} />
            </label>
          </div>
          <div className={styles.hero} style={{ marginTop: 12 }}>
            <div className={styles.heroLabel}>{t('studentsAdded')}</div>
            <div className={styles.heroValue}>{fmt(registrations?.grandAdded ?? 0)}</div>
            <div className={styles.heroSub}>
              {fmt(allAdded.filter((s) => s.type === 'new').length)} {t('newStudents')} · {fmt(allAdded.filter((s) => s.type === 'old').length)} {t('oldStudents')}
            </div>
          </div>
          {allAdded.length > 0 && (
            <table className={styles.table} style={{ marginTop: 12 }}>
              <thead>
                <tr><th>{t('student')}</th><th>{t('class')}</th><th>{t('branch')}</th><th>{t('typeWord')}</th></tr>
              </thead>
              <tbody>
                {allAdded.map((s, i) => (
                  <tr key={i}>
                    <td>{s.studentName}</td>
                    <td>{s.className}</td>
                    <td>{s.branchCode}</td>
                    <td><b>{s.type === 'new' ? t('newStudents') : s.type === 'old' ? t('oldStudents') : '—'}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {allAdded.length === 0 && <div className={styles.empty}>{t('noStudentsAdded')}</div>}
        </div>

        <h3 className={styles.sectionTitle}>{t('studentsTitle')}</h3>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('perBranchDetail')}</div>
        </div>

        {stuBranches.map((b) => {
          const filled = (b.classes || []).filter((c) => c.students > 0);
          const rb = regForBranch(b.branchCode);
          return (
          <div key={b.branchCode} className={styles.card}>
            <div className={styles.cardTitle}>
              {b.branchName} ({b.branchCode}) — {fmt(b.total)} {t('students')} · {t('newStudents')} {fmt(rb?.newCount ?? 0)} / {t('oldStudents')} {fmt(rb?.oldCount ?? 0)}
            </div>
            {filled.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr><th>{t('class')}</th><th>{t('newStudents')}</th><th>{t('oldStudents')}</th><th>{t('total')}</th></tr>
              </thead>
              <tbody>
                {filled.map((c) => {
                  const rc = regForClass(b.branchCode, c.className);
                  return (
                  <tr key={c.className}>
                    <td>{c.className}</td>
                    <td>{fmt(rc?.newCount ?? 0)}</td>
                    <td>{fmt(rc?.oldCount ?? 0)}</td>
                    <td><b>{fmt(c.students)}</b></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            ) : (
              <div className={styles.empty}>{t('noClasses')}</div>
            )}
          </div>
          );
        })}
        {stuBranches.length === 0 && <div className={styles.empty}>{t('noBranchData')}</div>}
      </>
    );
  };

  const AttendanceTab = () => {
    const a = attendance;
    const ringStyle = {
      background: `conic-gradient(#8b1a1a ${a?.grandRate || 0}%, ${dark ? '#3a2924' : '#f2e9e3'} ${a?.grandRate || 0}% 100%)`
    };
    const maxTotal = Math.max(1, ...(a?.byBranch || []).filter((b) => !b.error).map((b) => b.total));
    return (
      <>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('filterEthDate')}</div>
          <div className={styles.filterRow}>
            <label>{t('year')}
              <input type="number" placeholder="2018" value={attYear} onChange={(e) => setAttYear(e.target.value)} />
            </label>
            <label>{t('month')}
              <select value={attMonth} onChange={(e) => setAttMonth(e.target.value)}>
                <option value="">{t('allMonths')}</option>
                {ETH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.ringWrap}>
            <div className={styles.ring} style={ringStyle}>
              <div className={styles.ringInner}>{a?.grandRate ?? 0}%</div>
            </div>
            <div className={styles.legend}>
              <div className={styles.legendRow}><span className={`${styles.dot} ${styles.dotGreen}`} /> {t('present')} <b>{fmt(a?.grandPresent)}</b></div>
              <div className={styles.legendRow}><span className={`${styles.dot} ${styles.dotGold}`} /> {t('late')} <b>{fmt(a?.grandLate)}</b></div>
              <div className={styles.legendRow}><span className={`${styles.dot} ${styles.dotRed}`} /> {t('absent')} <b>{fmt(a?.grandAbsent)}</b></div>
              <div className={styles.legendRow}>{t('total')} {t('records')} <b>{fmt(a?.grandTotal)}</b></div>
            </div>
          </div>
        </div>

        <h3 className={styles.sectionTitle}>{t('byBranch')}</h3>
        {activeBranches(a).map((b) => {
          const filled = (b.classes || []).filter((c) => c.total > 0);
          return (
          <div key={b.branchCode} className={styles.card}>
            <div className={styles.cardTitle}>
              {b.branchName} — {b.rate}% {t('present')}
            </div>
            <div className={styles.barRow}>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(b.total / maxTotal) * 100}%` }} />
              </div>
              <div className={styles.barTop} style={{ marginTop: 5 }}>
                <span>{fmt(b.total)} {t('records')}</span>
                <span>P {fmt(b.present)} · L {fmt(b.late)} · A {fmt(b.absent)}</span>
              </div>
            </div>
            {filled.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr><th>{t('class')}</th><th>{t('present')}</th><th>{t('late')}</th><th>{t('absent')}</th><th>{t('rate')}</th></tr>
              </thead>
              <tbody>
                {filled.map((c) => (
                  <tr key={c.className}>
                    <td>{c.className}</td>
                    <td>{fmt(c.present)}</td>
                    <td>{fmt(c.late)}</td>
                    <td>{fmt(c.absent)}</td>
                    <td><b>{c.rate}%</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <div className={styles.empty}>{t('noAttendance')}</div>
            )}
          </div>
          );
        })}
      </>
    );
  };

  const MarksTab = () => {
    const m = marks;
    const maxExams = Math.max(1, ...(m?.byBranch || []).filter((b) => !b.error).map((b) => b.exams));
    return (
      <>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('filter')}</div>
          <div className={styles.filterRow}>
            <label>{t('academicYear')}
              <input placeholder="2018/2019" value={mkYear} onChange={(e) => setMkYear(e.target.value)} />
            </label>
            <label>{t('term')}
              <select value={mkTerm} onChange={(e) => setMkTerm(e.target.value)}>
                <option value="">{t('allTerms')}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('exams')}</div>
            <div className={styles.statValue}>{fmt(m?.grandExams)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('average')}</div>
            <div className={styles.statValueGold}>{m?.grandAvgPct ?? 0}%</div>
          </div>
        </div>

        <h3 className={styles.sectionTitle}>{t('byBranch')}</h3>
        {activeBranches(m).map((b) => (
          <div key={b.branchCode} className={styles.card}>
            <div className={styles.cardTitle}>
              {b.branchName} — {fmt(b.exams)} {t('exams')} · {t('average')} {b.avgPct}%
            </div>
            <div className={styles.barRow}>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(b.exams / maxExams) * 100}%` }} />
              </div>
            </div>
            <table className={styles.table}>
              <thead>
                <tr><th>{t('class')}</th><th>{t('exams')}</th><th>{t('marksCount')}</th><th>{t('average')} %</th></tr>
              </thead>
              <tbody>
                {b.classes.map((c) => (
                  <tr key={c.classId}>
                    <td>{t('class')} {c.classId}</td>
                    <td>{fmt(c.exams)}</td>
                    <td>{fmt(c.marks)}</td>
                    <td><b>{c.avgPct}%</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {b.classes.length === 0 && <div className={styles.empty}>{t('noExamData')}</div>}
          </div>
        ))}
      </>
    );
  };

  const FaultsTab = () => {
    const f = faults;
    const maxTotal = Math.max(1, ...(f?.byBranch || []).filter((b) => !b.error).map((b) => b.total));
    return (
      <>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('filterEthDate')}</div>
          <div className={styles.filterRow}>
            <label>{t('year')}
              <input type="number" placeholder="2018" value={faultYear} onChange={(e) => setFaultYear(e.target.value)} />
            </label>
            <label>{t('month')}
              <select value={faultMonth} onChange={(e) => setFaultMonth(e.target.value)}>
                <option value="">{t('allMonths')}</option>
                {ETH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroLabel}>{t('faultsCount')}</div>
          <div className={styles.heroValue}>{fmt(f?.grandTotal)}</div>
        </div>

        <h3 className={styles.sectionTitle}>{t('byBranch')}</h3>
        {activeBranches(f).map((b) => (
          <div key={b.branchCode} className={styles.card}>
            <div className={styles.cardTitle}>{b.branchName} — {fmt(b.total)} {t('faults')}</div>
            <div className={styles.barRow}>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(b.total / maxTotal) * 100}%` }} />
              </div>
            </div>
            {b.classes.length > 0 && (
              <table className={styles.table}>
                <thead><tr><th>{t('class')}</th><th>{t('faults')}</th></tr></thead>
                <tbody>
                  {b.classes.map((c) => (
                    <tr key={c.className}><td>{c.className}</td><td><b>{fmt(c.faults)}</b></td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {b.classes.length === 0 && <div className={styles.empty}>{t('noFaults')}</div>}
          </div>
        ))}
      </>
    );
  };

  const FinanceTab = () => {
    const f = finance;
    const byClass = f?.byClass || [];
    const maxExpected = Math.max(1, ...byClass.map((c) => c.expected));
    const rate = f?.grandExpected > 0 ? Math.round((f.grandCollected / f.grandExpected) * 100) : 0;
    return (
      <>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('filterEthMonth')}</div>
          <div className={styles.filterRow}>
            <label>{t('month')}
              <select value={finMonth} onChange={(e) => setFinMonth(e.target.value)}>
                <option value="">{t('allMonths')}</option>
                {ETH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroLabel}>{t('collectedToday')}</div>
          <div className={styles.heroValue}>{fmt(f?.grandCollectedToday)} <span style={{ fontSize: 18 }}>Birr</span></div>
          <div className={styles.heroSub}>
            {t('collected')} {birr(f?.grandCollected)} · {rate}% {t('ofExpected')} {birr(f?.grandExpected)} · {birr(f?.grandPending)} {t('pending')}
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('expected')}</div>
            <div className={styles.statValue}>{fmt(f?.grandExpected)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('pending')}</div>
            <div className={styles.statValueRed}>{fmt(f?.grandPending)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('freeStudents')}</div>
            <div className={styles.statValue}>{fmt(f?.grandFreeStudents)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('freeRegPaid')}</div>
            <div className={styles.statValueGold}>{fmt(f?.grandFreeRegPaid)} <span style={{ fontSize: 12 }}>Birr</span></div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>{t('unlockedNote')}</div>
        </div>

        <h3 className={styles.sectionTitle}>{t('byBranch')}</h3>
        {activeBranches(f).map((b) => {
          const filled = (b.classes || []).filter((c) => c.students > 0);
          return (
          <div key={b.branchCode} className={styles.card}>
            <div className={styles.cardTitle}>
              {b.branchName} — {t('collected')} {birr(b.collected)}
            </div>
            {filled.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr><th>{t('class')}</th><th>{t('studentsCount')}</th><th>{t('collected')}</th><th>{t('pending')}</th></tr>
              </thead>
              <tbody>
                {filled.map((c) => (
                  <tr key={c.className}>
                    <td>{c.className}</td>
                    <td>{fmt(c.students)}</td>
                    <td>{fmt(c.collected)}</td>
                    <td><b>{fmt(c.pending)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <div className={styles.empty}>{t('noInvoices')}</div>
            )}
          </div>
          );
        })}

        <h3 className={styles.sectionTitle}>{t('byClass')} <small>({t('allBranchesNote')})</small></h3>
        <div className={styles.card}>
          {byClass.length > 0 ? (
            byClass.map((c) => (
              <div key={c.className} className={styles.barRow}>
                <div className={styles.barTop}>
                  <span>{c.className} · {fmt(c.students)} {t('studentsCount')}</span>
                  <span>{fmt(c.collected)} / {fmt(c.expected)}</span>
                </div>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(c.collected / maxExpected) * 100}%`, background: 'linear-gradient(90deg,#f7941e,#ffb04d)' }}
                  />
                </div>
                <div className={styles.barTop} style={{ marginTop: 3 }}>
                  <span style={{ color: 'var(--muted)' }}>{t('pending')} {birr(c.pending)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.empty}>{t('noInvoices')}</div>
          )}
        </div>
      </>
    );
  };

  const SettingsTab = () => {
    return (
      <>
        <div className={styles.card}>
          <div className={styles.settingGroup}>
            <h3 className={styles.settingGroupTitle}><FiUser /> {t('account')}</h3>
            {accMsg && <div className={styles.successBox}>{accMsg}</div>}
            {accError && <div className={styles.errorBox}>{accError}</div>}
            <form onSubmit={handleAccountSave}>
              <input
                className={styles.settingsInput}
                type="password"
                placeholder={t('currentPassword')}
                value={accForm.currentPassword}
                onChange={(e) => setAccForm((f) => ({ ...f, currentPassword: e.target.value }))}
                required
              />
              <input
                className={styles.settingsInput}
                type="text"
                placeholder={t('newUsername')}
                value={accForm.newUsername}
                onChange={(e) => setAccForm((f) => ({ ...f, newUsername: e.target.value }))}
              />
              <input
                className={styles.settingsInput}
                type="password"
                placeholder={t('newPassword')}
                value={accForm.newPassword}
                onChange={(e) => setAccForm((f) => ({ ...f, newPassword: e.target.value }))}
              />
              <input
                className={styles.settingsInput}
                type="password"
                placeholder={t('confirmPassword')}
                value={accForm.confirmPassword}
                onChange={(e) => setAccForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              />
              <button type="submit" className={styles.saveBtn} disabled={accLoading}>
                {accLoading ? t('saving') : t('save')}
              </button>
            </form>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.settingGroup}>
            <h3 className={styles.settingGroupTitle}><FiGlobe /> {t('preferences')}</h3>
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleLabel}>{t('language')}</span>
                <div className={styles.toggleDesc}>{t('languageDesc')}</div>
              </div>
            </div>
            <div className={styles.langGrid}>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  className={`${styles.langBtn} ${lang === l.code ? styles.langBtnActive : ''}`}
                  onClick={() => setLang(l.code)}
                >
                  {t(l.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.settingGroup}>
            <h3 className={styles.settingGroupTitle}><FiMoon /> {t('darkMode')}</h3>
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleLabel}>{t('darkMode')}</span>
                <div className={styles.toggleDesc}>{t('darkModeDesc')}</div>
              </div>
              <div
                className={`${styles.switch} ${dark ? styles.switchOn : ''}`}
                onClick={() => setDark((d) => !d)}
              >
                <div className={styles.switchKnob} />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const tabContent = {
    home: <HomeTab />,
    students: <StudentsTab />,
    attendance: <AttendanceTab />,
    marks: <MarksTab />,
    faults: <FaultsTab />,
    finance: <FinanceTab />,
    sms: <SmsCounter />,
    settings: <SettingsTab />
  };

  const currentBranchName = branch === 'ALL'
    ? t('allBranches')
    : branches.find((b) => b.code === branch)?.name || branch;

  return (
    <div className={styles.wrap}>
      <div className={`${styles.app} ${dark ? styles.appDark : ''}`}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.logo}>I</div>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>{t('appName')}</h1>
              <p className={styles.subtitle}>{currentBranchName}</p>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout} title={t('logout')}>
              <FiLogOut />
            </button>
          </div>
          <BranchSelector />
        </div>

        <div className={styles.content}>
          {error && <div className={styles.errorBox}>{error}</div>}
          {loading && !students ? (
            <div className={styles.loading}>{t('loading')}</div>
          ) : (
            tabContent[tab]
          )}
        </div>

        <div className={styles.nav}>
          {TABS.map((tb) => {
            const Icon = tb.icon;
            return (
              <button
                key={tb.key}
                className={`${styles.navItem} ${tab === tb.key ? styles.navItemActive : ''}`}
                onClick={() => setTab(tb.key)}
              >
                <Icon />
                {t(tb.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SuperAdmin;