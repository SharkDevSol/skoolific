// ListStudent.jsx - Modern Student List with File Display
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUsers, FiSearch, FiFilter, FiEye, FiEyeOff, FiEdit2, FiUserX, FiUserCheck, 
  FiDownload, FiFile, FiX, FiRefreshCw, FiLock, FiCopy,
  FiPhone, FiUser, FiCalendar, FiBook, FiGrid, FiList, FiCamera, FiUpload,
  FiChevronLeft, FiChevronRight
} from 'react-icons/fi';
import Webcam from 'react-webcam';
import { getFileType, getFileIcon, isFileField, getFileUrl, formatLabel, getFileName, looksLikeFile } from '../utils/fileUtils';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../context/AppContext';
import { getBranchCode } from '../../../utils/branchCode';
import styles from './ListStudent.module.css';

import Table from '../../../COMPONENTS/Table/Table';
import Input from '../../../COMPONENTS/Input/Input';
import Select from '../../../COMPONENTS/Select/Select';
import Button from '../../../COMPONENTS/Button/Button';

// API base URL - use environment variable or fallback to localhost
const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const ListStudent = () => {
  const { t: tApp } = useApp();
  const { t: ti18n } = useTranslation();
  const t = (key, fallback) => {
    const i18nVal = ti18n(key, { defaultValue: '' });
    if (i18nVal && i18nVal !== key) return i18nVal;
    return tApp(key) || fallback || key;
  };
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState('all');
  const [filterStudentType, setFilterStudentType] = useState('all'); // Filter by student type (KG, evening, regular)
  const [showInactive, setShowInactive] = useState(false); // Toggle to show inactive students
  const [viewMode, setViewMode] = useState('grid');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [editFile, setEditFile] = useState(null);
  const [editFileField, setEditFileField] = useState({});
  const [showCamera, setShowCamera] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [allColumns, setAllColumns] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const webcamRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showGuardianPassword, setShowGuardianPassword] = useState(false);
  const itemsPerPage = 12;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => { if (selectedClass) fetchStudents(selectedClass); }, [selectedClass, showInactive, filterStudentType]);
  useEffect(() => { filterStudentData(); }, [students, searchTerm, filterGender]);

  const fetchClasses = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/student-list/classes`);
      setClasses(response.data);
      if (response.data.length > 0) setSelectedClass(response.data[0]);
      const formRes = await axios.get(`${API_BASE_URL}/students/form-structure`, { headers: { 'x-branch-code': (getBranchCode() || '').toUpperCase() } });
      setCustomFields(formRes.data?.customFields || []);
    } catch (error) { console.error('Error:', error); }
  };

  const fetchStudents = async (className) => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (showInactive) params.append('includeInactive', 'only');
      if (filterStudentType !== 'all') params.append('studentType', filterStudentType);
      
      const queryString = params.toString();
      const url = `${API_BASE_URL}/student-list/students/${className}${queryString ? `?${queryString}` : ''}`;
      
      const response = await axios.get(url);
      const studentsWithIds = response.data.map((student, index) => ({
        ...student, uniqueId: `${student.student_name}-${index}-${Date.now()}`, displayId: index + 1
      }));
      setStudents(studentsWithIds);
      if (studentsWithIds.length > 0) {
        const cols = Object.keys(studentsWithIds[0]).filter(k => !['uniqueId', 'displayId', 'id'].includes(k))
          .map(key => ({ key, label: formatLabel(key), type: getColumnType(key), isCustomField: customFields.some(f => f.name === key) }));
        setAllColumns(cols);
      }
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  };

  const filterStudentData = () => {
    let filtered = students.filter(student => {
      const matchesSearch = student.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.guardian_name?.toLowerCase().includes(searchTerm.toLowerCase()) || student.guardian_phone?.includes(searchTerm);
      const matchesGender = filterGender === 'all' || student.gender === filterGender;
      return matchesSearch && matchesGender;
    });
    setFilteredStudents(filtered);
    setCurrentPage(1);
  };

  const handleExportExcel = () => {
    if (filteredStudents.length === 0) {
      alert('No students to export');
      return;
    }
    const rows = filteredStudents.map(student => {
      const row = {};
      Object.entries(student).forEach(([key, value]) => {
        if (['uniqueId', 'displayId', 'id'].includes(key)) return;
        if (typeof value === 'object' && value !== null) {
          row[formatLabel(key)] = '';
          return;
        }
        row[formatLabel(key)] = value ?? '';
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const filename = `students_${selectedClass || 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const getColumnType = (key) => {
    if (key === 'image_student') return 'image';
    if (key.includes('password')) return 'password';
    const cf = customFields.find(f => f.name === key);
    if (cf?.type) return cf.type;
    const lower = key.toLowerCase();
    if (lower.includes('date') || lower.includes('dob') || lower.includes('birth')) return 'date';
    if (lower.includes('number') || lower.includes('age') || lower.includes('count')) return 'number';
    if (lower.includes('checkbox') || lower.includes('bool') || lower.includes('flag') || lower.startsWith('is_')) return 'checkbox';
    if (lower.includes('textarea') || lower.includes('description') || lower.includes('bio') || lower.includes('reason')) return 'textarea';
    if (lower.includes('multi') || lower.includes('options')) return 'multi-select';
    if (lower.includes('select') || lower.includes('dropdown') || lower.includes('choice') || lower.includes('gender') || lower.includes('relation') || lower.includes('type')) return 'select';
    if (lower.includes('upload') || lower.includes('file') || lower.includes('photo')) return 'upload';
    return 'text';
  };

  const getFieldOptions = (col) => {
    const cf = customFields.find(f => f.name === col.key);
    if (cf && Array.isArray(cf.options) && cf.options.length > 0) return cf.options;
    const lower = col.key.toLowerCase();
    if (lower.includes('gender')) return ['Male', 'Female'];
    if (lower.includes('relation')) return ['Father', 'Mother', 'Guardian', 'Other'];
    if (lower.includes('blood')) return ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    return null;
  };

  const isCheckboxChecked = (val) => {
    return val === true || val === 'true' || val === 'TRUE' || val === '1' || val === 'YES' || val === 'yes' || val === 'on';
  };

  const handleFieldFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      setEditFileField(prev => ({ ...(prev || {}), [field]: file }));
      setEditFormData(prev => ({ ...prev, [field]: file.name }));
    }
  };

  const getStudentFiles = (student) => {
    return Object.entries(student).filter(([key, value]) => 
      value && key !== 'image_student' && (isFileField(key) || looksLikeFile(value))
    );
  };

  const renderFileIcon = (type) => {
    const iconInfo = getFileIcon(type);
    const IconComponent = iconInfo.icon;
    return <IconComponent style={{ color: iconInfo.color }} />;
  };

  const openFilePreview = (filename, fieldName) => {
    const fileType = getFileType(filename);
    const url = getFileUrl(filename, 'student');
    setShowFilePreview({ filename: getFileName(filename), fieldName, fileType, url });
  };

  const handleToggleActive = async (student) => {
    const isCurrentlyActive = student.is_active !== false && student.is_active !== 'false';
    
    // If viewing inactive students, allow reactivation
    if (!isCurrentlyActive) {
      const confirmMsg = `Activate ${student.student_name}? They will appear in all system lists again.`;
      if (!window.confirm(confirmMsg)) return;
      
      try {
        await axios.put(
          `${API_BASE_URL}/student-list/toggle-active/${selectedClass}/${student.school_id}/${student.class_id}`,
          { is_active: true }
        );
        alert('Student activated successfully! They are now visible in all system lists.');
        fetchStudents(selectedClass);
      } catch (error) {
        alert(`Failed to activate student: ${error.response?.data?.error || error.message}`);
      }
    } else {
      // Deactivate student
      const confirmMsg = `Deactivate ${student.student_name}? They will be completely hidden from all system lists (attendance, marks, etc.) but data will be preserved in the database.`;
      if (!window.confirm(confirmMsg)) return;
      
      try {
        await axios.put(
          `${API_BASE_URL}/student-list/toggle-active/${selectedClass}/${student.school_id}/${student.class_id}`,
          { is_active: false }
        );
        alert('Student deactivated successfully! They are now hidden from all system lists.');
        fetchStudents(selectedClass);
      } catch (error) {
        alert(`Failed to deactivate student: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  const handleDelete = async (student) => {
    if (!window.confirm(`Delete ${student.student_name}?`)) return;
    try {
      if (student.school_id && student.class_id) {
        await axios.delete(`${API_BASE_URL}/student-list/student/${selectedClass}/${student.school_id}/${student.class_id}`);
      }
      setStudents(prev => prev.filter(s => s.uniqueId !== student.uniqueId));
    } catch (error) { alert('Failed to delete'); }
  };

  const openEditModal = (student) => { 
    setSelectedStudent(student); 
    setEditFormData(student); 
    setEditFile(null); 
    setEditFileField({});
    setShowEditModal(true); 
  };

  const handleEditChange = (e) => { 
    setEditFormData(prev => ({ ...prev, [e.target.name]: e.target.value })); 
  };

  const handleFileChange = (e) => { 
    const file = e.target.files[0]; 
    if (file) { 
      setEditFile(file); 
      setEditFormData(prev => ({ ...prev, image_student: file.name })); 
    } 
  };

  const capturePhoto = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      fetch(imageSrc).then(res => res.blob()).then(blob => {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setEditFile(file); 
        setEditFormData(prev => ({ ...prev, image_student: file.name })); 
        setShowCamera(false);
      });
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault(); 
    setLoading(true);
    try {
      if (selectedStudent.school_id && selectedStudent.class_id) {
        const formData = new FormData();
        Object.entries(editFormData).forEach(([key, value]) => {
          // Skip image_student text field - it's sent as a file below
          if (['uniqueId', 'displayId', 'id', 'image_student'].includes(key)) return;
          if (value != null) formData.append(key, value.toString());
        });
        if (editFile) formData.append('image_student', editFile);
        if (editFileField && Object.keys(editFileField).length > 0) {
          Object.entries(editFileField).forEach(([key, file]) => formData.append(key, file));
        }
        await axios.put(`${API_BASE_URL}/student-list/student/${selectedClass}/${selectedStudent.school_id}/${selectedStudent.class_id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        // Refetch the students list to get the correct server-side image path
        if (editFormData.class && editFormData.class !== selectedClass) {
          // Student was transferred to a new class — switch to that class view
          setSelectedClass(editFormData.class);
        } else {
          await fetchStudents(selectedClass);
        }
      }
      setShowEditModal(false);
    } catch (error) { alert('Failed to update'); }
    finally { setLoading(false); }
  };

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const currentStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const tableColumns = [
    {
      key: 'photo', header: 'Photo', width: '80px', sortable: false,
      render: (_, student) => {
        const isInactive = student.is_active === false || student.is_active === 'false';
        const photoUrl = getFileUrl(student.image_student, 'student');
        return (
          <div className={styles.tableImageWrapper}>
            {photoUrl ? (
              <img src={photoUrl} alt="" className={styles.tableImage} />
            ) : (
              <div className={styles.tableAvatar}><FiUser /></div>
            )}
            {isInactive && <div className={styles.inactiveOverlay}><FiUserX /></div>}
          </div>
        );
      }
    },
    {
      key: 'student_name', header: 'Name', sortable: true,
      render: (name, student) => {
        const isInactive = student.is_active === false || student.is_active === 'false';
        return (
          <div>
            <strong>{name}</strong>
            {isInactive && <span className={styles.inactiveLabel}> (Deactivated)</span>}
          </div>
        );
      }
    },
    {
      key: 'class', header: 'Class', sortable: true,
      render: (_, student) => student.class || selectedClass
    },
    {
      key: 'gender', header: 'Gender', sortable: true,
      render: (gender) => (
        <span className={`${styles.tableBadge} ${gender === 'Male' ? styles.badgeMale : styles.badgeFemale}`}>
          {gender || '-'}
        </span>
      )
    },
    { key: 'age', header: 'Age', sortable: true, render: (age) => age || '-' },
    { key: 'guardian_name', header: 'Guardian', sortable: true, render: (name) => name || '-' },
    {
      key: 'documents', header: 'Documents', sortable: false,
      render: (_, student) => {
        const fileFields = getStudentFiles(student);
        return fileFields.length > 0 ? (
          <div className={styles.tableFiles}>
            {fileFields.slice(0, 2).map(([key, value]) => (
              <span 
                key={key} 
                className={styles.tableFileChip}
                onClick={(e) => { e.stopPropagation(); openFilePreview(value, formatLabel(key)); }}
              >
                {renderFileIcon(getFileType(value))}
              </span>
            ))}
            {fileFields.length > 2 && (
              <span className={styles.moreCount}>+{fileFields.length - 2}</span>
            )}
          </div>
        ) : '-';
      }
    },
    // Dynamic columns for custom form fields (e.g. Warning, Old Or New, etc.)
    ...customFields
      .filter(field => field && field.name && !['image_student', 'student_name', 'smachine_id', 'age', 'gender', 'class', 'guardian_name', 'guardian_phone', 'guardian_relation', 'username', 'password', 'guardian_username', 'guardian_password', 'is_active', 'is_free', 'exemption_type', 'exemption_reason'].includes(field.name.toLowerCase()))
      .map(field => ({
        key: field.name.toLowerCase(),
        header: field.label || formatLabel(field.name),
        sortable: false,
        render: (value) => {
          if (value === null || value === undefined || value === '') return '-';
          if (typeof value === 'boolean') {
            return value
              ? <span className={`${styles.tableBadge} ${styles.badgeSuccess}`}>Yes</span>
              : <span className={styles.tableBadge}>No</span>;
          }
          if (value === true || value === 'true' || value === 'on' || value === 'YES') {
            return <span className={`${styles.tableBadge} ${styles.badgeSuccess}`}>Yes</span>;
          }
          if (value === false || value === 'false' || value === 'off' || value === 'NO' || value === 'no') {
            return <span className={styles.tableBadge}>No</span>;
          }
          return String(value);
        }
      })),
    {
      key: 'actions', header: 'Actions', sortable: false, align: 'right',
      render: (_, student) => {
        const isInactive = student.is_active === false || student.is_active === 'false';
        return (
          <div className={styles.tableActions}>
            <button onClick={(e) => { e.stopPropagation(); setSelectedStudent(student); setShowModal(true); }}>
              <FiEye />
            </button>
            <button onClick={(e) => { e.stopPropagation(); openEditModal(student); }}>
              <FiEdit2 />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleToggleActive(student); }}
              title={isInactive ? 'Activate student' : 'Deactivate student'}
              className={isInactive ? styles.activateBtn : styles.deactivateBtn}
            >
              {isInactive ? <FiUserCheck /> : <FiUserX />}
            </button>
          </div>
        );
      }
    }
  ];

  if (loading && students.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading students...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.div className={styles.header} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><FiUsers /></div>
          <div>
            <h1>{showInactive ? t('students.list.deactivatedTitle', 'Deactivated Students') : t('students.list.title', 'Student Directory')}</h1>
            <p>{showInactive ? t('students.list.deactivatedDesc', 'View and manage deactivated students') : t('students.list.subtitle', 'Browse and manage enrolled students')}</p>
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{filteredStudents.length}</span>
            <span className={styles.statLabel}>{showInactive ? 'Deactivated' : t('students')}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{classes.length}</span>
            <span className={styles.statLabel}>{t('classes')}</span>
          </div>
        </div>
      </motion.div>

      {/* Class Tabs */}
      <motion.div className={styles.classTabs} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {classes.map(cls => (
          <button 
            key={cls} 
            className={`${styles.classTab} ${selectedClass === cls ? styles.active : ''}`} 
            onClick={() => { setSelectedClass(cls); setCurrentPage(1); }}
          >
            <FiBook /> {cls}
          </button>
        ))}
      </motion.div>

      {/* Controls */}
      <motion.div className={styles.controls} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={styles.searchBox}>
          <Input 
            prefixIcon={<FiSearch />}
            placeholder={t('students.list.search', 'Search students...')} 
            value={searchTerm} 
            onChange={setSearchTerm} 
          />
        </div>
        <div className={styles.filters}>
          <Select 
            value={filterGender} 
            onChange={setFilterGender}
            options={[
              { value: 'all', label: t('allGenders') || 'All Genders' },
              { value: 'Male', label: t('male') || 'Male' },
              { value: 'Female', label: t('female') || 'Female' }
            ]}
          />
          <Select 
            value={filterStudentType} 
            onChange={setFilterStudentType}
            options={[
              { value: 'all', label: t('students.list.allTypes', 'All Student Types') },
              { value: 'regular', label: t('students.list.regular', 'Regular Students') },
              { value: 'kg', label: t('students.list.kg', 'KG Students') },
              { value: 'evening', label: t('students.list.evening', 'Evening Class Students') },
              { value: 'kg_evening', label: 'KG + Evening Students' }
            ]}
          />
        </div>
        <div className={styles.viewToggle}>
          <Button 
            variant={viewMode === 'grid' ? 'primary' : 'ghost'} 
            onClick={() => setViewMode('grid')}
            icon={<FiGrid />}
          />
          <Button 
            variant={viewMode === 'list' ? 'primary' : 'ghost'} 
            onClick={() => setViewMode('list')}
            icon={<FiList />}
          />
        </div>
        <Button 
          variant="secondary" 
          onClick={() => fetchStudents(selectedClass)}
          icon={<FiRefreshCw />}
        >
          {t('refresh') || 'Refresh'}
        </Button>
        <Button 
          variant="secondary" 
          onClick={handleExportExcel}
          icon={<FiDownload />}
        >
          Download Excel
        </Button>
        <Button 
          variant={showInactive ? "primary" : "secondary"}
          onClick={() => setShowInactive(!showInactive)}
          icon={showInactive ? <FiUserCheck /> : <FiUserX />}
        >
          {showInactive ? 'Show Active Students' : 'Show Deactivated Students'}
        </Button>
      </motion.div>

      {/* Student Grid */}
      {currentStudents.length === 0 ? (
        <div className={styles.emptyState}>
          <FiUsers size={64} />
          <h3>{t('noStudentsFound')}</h3>
          <p>{t('tryAdjustingFilters')}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div className={styles.studentGrid} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AnimatePresence>
            {currentStudents.map((student, index) => {
              const fileFields = getStudentFiles(student);
              const isInactive = student.is_active === false || student.is_active === 'false';
              return (
                <motion.div 
                  key={student.uniqueId} 
                  className={`${styles.studentCard} ${isInactive ? styles.inactiveCard : ''}`}
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  transition={{ delay: index * 0.03 }}
                  whileHover={{ y: -5 }}
                  onClick={() => { setSelectedStudent(student); setShowModal(true); }}
                >
                  <div className={styles.cardHeader}>
                    {getFileUrl(student.image_student, 'student') ? (
                      <img 
                        src={getFileUrl(student.image_student, 'student')} 
                        alt={student.student_name} 
                        className={styles.studentImage}
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <div className={styles.avatarPlaceholder}><FiUser /></div>
                    )}
                    {isInactive && (
                      <div className={styles.inactiveBadge}>
                        <FiUserX /> Deactivated
                      </div>
                    )}
                    <div className={styles.cardBadges}>
                      {student.gender && (
                        <span className={`${styles.badge} ${student.gender === 'Male' ? styles.badgeMale : styles.badgeFemale}`}>
                          {student.gender}
                        </span>
                      )}
                      {student.is_free && (
                        <span className={`${styles.badge} ${styles.badgeFree}`} title={`${student.exemption_type || 'Exempted'}: ${student.exemption_reason || 'No reason provided'}`}>
                          🎓 {student.exemption_type || 'FREE'}
                        </span>
                      )}
                      {(student.student_type === 'kg' || student.is_kg) && (
                        <span className={`${styles.badge} ${styles.badgeKG}`} title="Kindergarten Student">
                          🎨 KG
                        </span>
                      )}
                      {(student.student_type === 'evening' || student.is_evening_class) && (
                        <span className={`${styles.badge} ${styles.badgeEvening}`} title="Evening Class Student">
                          🌙 Evening
                        </span>
                      )}
                      {student.student_type === 'kg_evening' && (
                        <>
                          <span className={`${styles.badge} ${styles.badgeKG}`} title="Kindergarten Student">
                            🎨 KG
                          </span>
                          <span className={`${styles.badge} ${styles.badgeEvening}`} title="Evening Class Student">
                            🌙 Evening
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.studentName}>{student.student_name || 'Unknown'}</h3>
                    <p className={styles.studentClass}>{student.class || selectedClass}</p>
                    <div className={styles.cardInfo}>
                      {student.age && (
                        <div className={styles.infoItem}><FiCalendar /> Age: {student.age}</div>
                      )}
                      {student.guardian_name && (
                        <div className={styles.infoItem}><FiUser /> {student.guardian_name}</div>
                      )}
                      {student.guardian_phone && (
                        <div className={styles.infoItem}><FiPhone /> {student.guardian_phone}</div>
                      )}
                    </div>
                    {fileFields.length > 0 && (
                      <div className={styles.cardFiles}>
                        <span className={styles.filesLabel}>
                          <FiFile /> {fileFields.length} {fileFields.length > 1 ? t('documents') : t('document')}
                        </span>
                        <div className={styles.filesList}>
                          {fileFields.slice(0, 3).map(([key, value]) => (
                            <div 
                              key={key} 
                              className={styles.fileChip}
                              onClick={(e) => { e.stopPropagation(); openFilePreview(value, formatLabel(key)); }}
                            >
                              {renderFileIcon(getFileType(value))}
                              <span>{formatLabel(key)}</span>
                            </div>
                          ))}
                          {fileFields.length > 3 && (
                            <span className={styles.moreFiles}>+{fileFields.length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); setSelectedStudent(student); setShowModal(true); }}
                    >
                      <FiEye /> {t('view')}
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); openEditModal(student); }}
                    >
                      <FiEdit2 />
                    </button>
                    <button 
                      className={`${styles.actionBtn} ${isInactive ? styles.activateBtn : styles.deactivateBtn}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(student); }}
                      title={isInactive ? 'Activate student' : 'Deactivate student'}
                    >
                      {isInactive ? <FiUserCheck /> : <FiUserX />}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        /* List View */
        <motion.div className={styles.tableWrapper} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Table 
            columns={tableColumns}
            data={filteredStudents}
            paginated={true}
            pageSize={itemsPerPage}
            onRowClick={(student) => { setSelectedStudent(student); setShowModal(true); }}
            emptyMessage={t('noStudentsFound') || 'No students found matching your criteria.'}
          />
        </motion.div>
      )}


      {/* Student Detail Modal */}
      <AnimatePresence>
        {showModal && selectedStudent && (
          <motion.div 
            className={styles.modalOverlay} 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
          >
            <motion.div 
              className={styles.modal}
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>
                <FiX />
              </button>
              <div className={styles.modalHeader}>
                {getFileUrl(selectedStudent.image_student, 'student') ? (
                  <img 
                    src={getFileUrl(selectedStudent.image_student, 'student')} 
                    alt="" 
                    className={styles.modalImage}
                    onClick={() => openFilePreview(selectedStudent.image_student, 'Profile Photo')}
                  />
                ) : (
                  <div className={styles.modalAvatar}><FiUser /></div>
                )}
                <div className={styles.modalHeaderInfo}>
                  <h2>{selectedStudent.student_name}</h2>
                  <p>{selectedStudent.class || selectedClass}</p>
                  <div className={styles.modalBadges}>
                    {selectedStudent.gender && (
                      <span className={`${styles.badge} ${selectedStudent.gender === 'Male' ? styles.badgeMale : styles.badgeFemale}`}>
                        {selectedStudent.gender}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.modalSection}>
                  <h3><FiUser /> {t('basicInformation')}</h3>
                  <div className={styles.infoGrid}>
                    {Object.entries(selectedStudent)
                      .filter(([key, value]) => !isFileField(key) && !looksLikeFile(value) && !['uniqueId', 'displayId', 'id', 'password', 'guardian_password', 'username', 'guardian_username'].includes(key))
                      .map(([key, value]) => (
                        <div key={key} className={styles.infoRow}>
                          <span className={styles.infoLabel}>{formatLabel(key)}</span>
                          <span className={styles.infoValue}>
                            {typeof value === 'boolean'
                              ? (value ? 'Yes' : 'No')
                              : (value || '-')}
                          </span>
                        </div>
                      ))
                    }
                  </div>
                </div>
                
                {/* Credentials Section */}
                {(selectedStudent.password || selectedStudent.guardian_password || selectedStudent.username || selectedStudent.guardian_username) && (
                  <div className={styles.modalSection}>
                    <h3><FiLock /> {t('loginCredentials')}</h3>
                    <div className={styles.credentialsGrid}>
                      {/* Student Credentials */}
                      {(selectedStudent.username || selectedStudent.password) && (
                        <div className={styles.credentialCard}>
                          <h4>{t('studentAccount')}</h4>
                          {selectedStudent.username && (
                            <div className={styles.credentialRow}>
                              <span className={styles.credentialLabel}>{t('username')}</span>
                              <div className={styles.credentialValue}>
                                <span>{selectedStudent.username}</span>
                                <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedStudent.username)} title="Copy"><FiCopy /></button>
                              </div>
                            </div>
                          )}
                          {selectedStudent.password && (
                            <div className={styles.credentialRow}>
                              <span className={styles.credentialLabel}>{t('password')}</span>
                              <div className={styles.credentialValue}>
                                <span className={styles.passwordText}>{showStudentPassword ? selectedStudent.password : '••••••••'}</span>
                                <button className={styles.toggleBtn} onClick={() => setShowStudentPassword(!showStudentPassword)} title={showStudentPassword ? 'Hide' : 'Show'}>
                                  {showStudentPassword ? <FiEyeOff /> : <FiEye />}
                                </button>
                                <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedStudent.password)} title="Copy"><FiCopy /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Guardian Credentials */}
                      {(selectedStudent.guardian_username || selectedStudent.guardian_password) && (
                        <div className={styles.credentialCard}>
                          <h4>{t('guardianAccount')}</h4>
                          {selectedStudent.guardian_username && (
                            <div className={styles.credentialRow}>
                              <span className={styles.credentialLabel}>{t('username')}</span>
                              <div className={styles.credentialValue}>
                                <span>{selectedStudent.guardian_username}</span>
                                <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedStudent.guardian_username)} title="Copy"><FiCopy /></button>
                              </div>
                            </div>
                          )}
                          {selectedStudent.guardian_password && (
                            <div className={styles.credentialRow}>
                              <span className={styles.credentialLabel}>{t('password')}</span>
                              <div className={styles.credentialValue}>
                                <span className={styles.passwordText}>{showGuardianPassword ? selectedStudent.guardian_password : '••••••••'}</span>
                                <button className={styles.toggleBtn} onClick={() => setShowGuardianPassword(!showGuardianPassword)} title={showGuardianPassword ? 'Hide' : 'Show'}>
                                  {showGuardianPassword ? <FiEyeOff /> : <FiEye />}
                                </button>
                                <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedStudent.guardian_password)} title="Copy"><FiCopy /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Documents Section */}
                {(() => {
                  const PLACEHOLDERS = new Set(['{}', '[]', '[object Object]', 'null', 'undefined', '']);
                  const fileFields = Object.entries(selectedStudent).filter(([key, value]) => 
                    value && 
                    !PLACEHOLDERS.has(String(value).trim()) && 
                    (isFileField(key) || looksLikeFile(value))
                  );
                  if (fileFields.length === 0) return null;
                  return (
                    <div className={styles.modalSection}>
                      <h3><FiFile /> {t('documentsAndFiles')}</h3>
                      <div className={styles.documentsGrid}>
                        {fileFields.map(([key, value]) => {
                          const fileType = getFileType(value);
                          const url = getFileUrl(value, 'student');
                          return (
                            <div 
                              key={key} 
                              className={styles.documentCard}
                              onClick={() => openFilePreview(value, formatLabel(key))}
                            >
                              <div className={styles.documentPreviewArea}>
                                {fileType === 'image' ? (
                                  <img src={url} alt="" className={styles.documentImage} />
                                ) : (
                                  <div className={styles.documentIconLarge}>
                                    {renderFileIcon(fileType)}
                                  </div>
                                )}
                                <div className={styles.documentOverlay}>
                                  <FiEye /> Preview
                                </div>
                              </div>
                              <div className={styles.documentInfo}>
                                <span className={styles.documentName}>{formatLabel(key)}</span>
                                <span className={styles.documentFile}>{getFileName(value)}</span>
                              </div>
                              <div className={styles.documentActions}>
                                <a 
                                  href={url} 
                                  download 
                                  onClick={(e) => e.stopPropagation()} 
                                  className={styles.downloadBtn}
                                >
                                  <FiDownload /> {t('download')}
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && selectedStudent && (
          <motion.div 
            className={styles.modalOverlay} 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setShowEditModal(false)}
          >
            <motion.div 
              className={styles.editModal}
              initial={{ scale: 0.9 }} 
              animate={{ scale: 1 }} 
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.editHeader}>
                <h2>Edit Student</h2>
                <button onClick={() => setShowEditModal(false)}><FiX /></button>
              </div>
              <form onSubmit={handleEditSubmit} className={styles.editForm}>
                <div className={styles.editPhotoSection}>
                  {editFormData.image_student ? (
                    <img 
                      src={editFile ? URL.createObjectURL(editFile) : getFileUrl(editFormData.image_student, 'student')} 
                      alt="" 
                      className={styles.editPhoto} 
                    />
                  ) : (
                    <div className={styles.editPhotoPlaceholder}><FiUser /></div>
                  )}
                  <div className={styles.photoButtons}>
                    <label className={styles.uploadBtn}>
                      <FiUpload /> Upload
                      <input type="file" accept="image/*" onChange={handleFileChange} hidden />
                    </label>
                    <button type="button" className={styles.cameraBtn} onClick={() => setShowCamera(true)}>
                      <FiCamera /> Camera
                    </button>
                  </div>
                </div>
                <div className={styles.editFields}>
                  {allColumns
                    .filter(col => 
                      col.type !== 'password' && 
                      !['uniqueId', 'displayId', 'id', 'image_student'].includes(col.key)
                    )
                    .map(col => {
                      const fieldOptions = getFieldOptions(col);
                      return (
                      <div key={col.key} className={styles.editField}>
                        <label>{col.label}</label>
                        {col.type === 'checkbox' ? (
                          <div className={styles.checkboxWrapper}>
                            <input 
                              type="checkbox"
                              name={col.key} 
                              checked={isCheckboxChecked(editFormData[col.key])}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, [col.key]: e.target.checked ? 'YES' : 'NO' }))}
                            />
                            <span>{isCheckboxChecked(editFormData[col.key]) ? 'YES' : 'NO'}</span>
                          </div>
                        ) : col.type === 'multi-select' ? (
                          <div className={styles.checkboxWrapper}>
                            {(fieldOptions || []).map(opt => (
                              <label key={opt} className={styles.multiOption}>
                                <input
                                  type="checkbox"
                                  checked={(editFormData[col.key] || '').toString().split(',').map(s => s.trim()).includes(opt)}
                                  onChange={(e) => {
                                    const current = (editFormData[col.key] || '').toString().split(',').map(s => s.trim()).filter(Boolean);
                                    const next = e.target.checked ? [...current, opt] : current.filter(v => v !== opt);
                                    setEditFormData(prev => ({ ...prev, [col.key]: next.join(', ') }));
                                  }}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : col.key === 'class' ? (
                          <select
                            name="class"
                            value={editFormData.class || ''}
                            onChange={handleEditChange}
                          >
                            {classes.map(cls => (
                              <option key={cls} value={cls}>{cls}</option>
                            ))}
                          </select>
                        ) : col.type === 'select' || col.type === 'dropdown' ? (
                          fieldOptions ? (
                            <select
                              name={col.key}
                              value={editFormData[col.key] || ''}
                              onChange={handleEditChange}
                            >
                              <option value="">Select...</option>
                              {fieldOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              name={col.key}
                              value={editFormData[col.key] || ''}
                              onChange={handleEditChange}
                            />
                          )
                        ) : col.type === 'upload' ? (
                          <div className={styles.fileUploadField}>
                            <label className={styles.fileUploadBtn}>
                              <FiUpload /> Choose File
                              <input type="file" onChange={(e) => handleFieldFileChange(e, col.key)} hidden />
                            </label>
                            <span className={styles.fileUploadName}>
                              {editFileField[col.key] ? editFileField[col.key].name : (editFormData[col.key] || 'No file selected')}
                            </span>
                          </div>
                        ) : col.type === 'textarea' ? (
                          <textarea
                            name={col.key}
                            value={editFormData[col.key] || ''}
                            onChange={handleEditChange}
                            rows={3}
                          />
                        ) : (
                          <input 
                            type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : col.type === 'email' ? 'email' : 'text'}
                            name={col.key} 
                            value={editFormData[col.key] || ''} 
                            onChange={handleEditChange} 
                          />
                        )}
                      </div>
                    );
                    })
                  }
                </div>
                <div className={styles.editActions}>
                  <button type="button" onClick={() => setShowEditModal(false)} className={styles.cancelBtn}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.saveBtn} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Modal */}
      {showCamera && (
        <div className={styles.cameraModal}>
          <div className={styles.cameraContent}>
            <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className={styles.webcam} />
            <div className={styles.cameraActions}>
              <button onClick={() => setShowCamera(false)}>Cancel</button>
              <button onClick={capturePhoto} className={styles.captureBtn}>
                <FiCamera /> Capture
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      <AnimatePresence>
        {showFilePreview && (
          <motion.div 
            className={styles.filePreviewOverlay}
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setShowFilePreview(null)}
          >
            <motion.div 
              className={styles.filePreviewModal}
              initial={{ scale: 0.9 }} 
              animate={{ scale: 1 }} 
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.filePreviewHeader}>
                <h3>
                  {renderFileIcon(showFilePreview.fileType)} {showFilePreview.fieldName}
                </h3>
                <button onClick={() => setShowFilePreview(null)}><FiX /></button>
              </div>
              <div className={styles.filePreviewContent}>
                {showFilePreview.fileType === 'image' ? (
                  <img src={showFilePreview.url} alt={showFilePreview.fieldName} />
                ) : showFilePreview.fileType === 'pdf' ? (
                  <iframe src={showFilePreview.url} title="PDF Preview" />
                ) : (
                  <div className={styles.filePreviewFallback}>
                    <div className={styles.fallbackIcon}>
                      {renderFileIcon(showFilePreview.fileType)}
                    </div>
                    <h4>{showFilePreview.filename}</h4>
                    <p>This file type cannot be previewed in the browser</p>
                  </div>
                )}
              </div>
              <div className={styles.filePreviewFooter}>
                <span>{showFilePreview.filename}</span>
                <a href={showFilePreview.url} download className={styles.downloadButton}>
                  <FiDownload /> Download
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ListStudent;
