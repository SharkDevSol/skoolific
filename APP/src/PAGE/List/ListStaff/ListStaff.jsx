// ListStaff.jsx - Modern Staff List with File Display
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUsers, FiSearch, FiFilter, FiEye, FiEyeOff, FiUserX, FiUserCheck,
  FiDownload, FiFile, FiX, FiRefreshCw, FiLock, FiCopy,
  FiPhone, FiMail, FiUser, FiBriefcase, FiGrid, FiList,
  FiChevronLeft, FiChevronRight, FiEdit, FiTrash2
} from 'react-icons/fi';
import { getFileType, getFileIcon, isFileField, getFileUrl, formatLabel, getFileName, looksLikeFile } from '../utils/fileUtils';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../context/AppContext';
import styles from './ListStaff.module.css';

import Table from '../../../COMPONENTS/Table/Table';
import Input from '../../../COMPONENTS/Input/Input';
import { getBranchCode } from '../../../utils/branchCode';
import Select from '../../../COMPONENTS/Select/Select';
import Button from '../../../COMPONENTS/Button/Button';

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') return window.location.origin + '/api';
  return 'http://localhost:5052/api';
};
const API_BASE_URL = getApiBaseUrl();
const ListStaff = () => {
  const { t: tApp } = useApp();
  const { t: ti18n } = useTranslation();
  const t = (key, fallback) => {
    const i18nVal = ti18n(key, { defaultValue: '' });
    if (i18nVal && i18nVal !== key) return i18nVal;
    return tApp(key) || fallback || key;
  };
  const navigate = useNavigate();
  const [staffData, setStaffData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showInactive, setShowInactive] = useState(false); // Toggle to show inactive staff
  const [viewMode, setViewMode] = useState('grid');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [editFiles, setEditFiles] = useState({});
  const [columnMetadata, setColumnMetadata] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(null);
  const [staffTypes, setStaffTypes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const canViewPassword = localStorage.getItem('userType') === 'admin';
  const branchHeaders = (() => {
    const code = getBranchCode();
    return code ? { 'X-Branch-Code': code } : {};
  })();
  const itemsPerPage = 12;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  useEffect(() => { fetchAllStaff(); }, [showInactive]);
  useEffect(() => { filterStaffData(); }, [staffData, searchTerm, filterRole, filterType]);

  const fetchAllStaff = async () => {
    setLoading(true);
    try {
      const types = ['Supportive Staff', 'Administrative Staff', 'Teachers', 'Finance'];
      let allStaff = [];
      const foundTypes = [];
      
      const params = new URLSearchParams();
      if (showInactive) params.set('includeInactive', 'only');
      if (canViewPassword) params.set('includePassword', 'true');
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(`${API_BASE_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`, { headers: branchHeaders });
          if (classesResponse.data.length > 0) foundTypes.push(staffType);
          
          for (const className of classesResponse.data) {
            const dataResponse = await axios.get(`${API_BASE_URL}/staff/data/${staffType}/${className}${queryString}`, { headers: branchHeaders });
            const staffWithMeta = dataResponse.data.data.map((staff, idx) => ({ 
              ...staff, 
              staffType, 
              className,
              uniqueId: `${staffType}-${className}-${idx}-${Date.now()}-${Math.random()}`
            }));
            allStaff = [...allStaff, ...staffWithMeta];
          }
        } catch (err) { console.warn(`No data for: ${staffType}`); }
      }
      
      setStaffTypes(foundTypes);
      setStaffData(allStaff);
      setFilteredData(allStaff);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  };

  const filterStaffData = () => {
    let filtered = staffData.filter(staff => {
      const name = staff.full_name || staff.name || '';
      const email = staff.email || '';
      const phone = staff.phone || '';
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.toLowerCase().includes(searchTerm.toLowerCase()) || phone.includes(searchTerm);
      const matchesRole = filterRole === 'all' || staff.role === filterRole;
      const matchesType = filterType === 'all' || staff.staffType === filterType;
      
      return matchesSearch && matchesRole && matchesType;
    });
    setFilteredData(filtered);
    setCurrentPage(1);
  };

  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      alert('No staff to export');
      return;
    }
    const rows = filteredData.map(staff => {
      const row = {};
      Object.entries(staff).forEach(([key, value]) => {
        if (['uniqueId', 'id', 'password_hash', 'created_at'].includes(key)) return;
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
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, `staff_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getStaffFiles = (staff) => {
    return Object.entries(staff).filter(([key, value]) => 
      value && key !== 'image_staff' && (isFileField(key) || looksLikeFile(value))
    );
  };

  const openFilePreview = (filename, fieldName) => {
    const fileType = getFileType(filename);
    const url = getFileUrl(filename, 'staff');
    setShowFilePreview({ filename: getFileName(filename), fieldName, fileType, url });
  };

  const handleToggleActive = async (staff) => {
    const isCurrentlyActive = staff.is_active !== false && staff.is_active !== 'false';
    
    // If viewing inactive staff, allow reactivation
    if (!isCurrentlyActive) {
      const confirmMsg = `Activate ${staff.full_name || staff.name}? They will appear in all system lists again.`;
      if (!window.confirm(confirmMsg)) return;
      
      try {
        await axios.put(
          `${API_BASE_URL}/staff/toggle-active/${staff.global_staff_id || staff.id}`,
          { is_active: true },
          { headers: branchHeaders }
        );
        alert('Staff activated successfully! They are now visible in all system lists.');
        fetchAllStaff();
      } catch (error) {
        alert(`Failed to activate staff: ${error.response?.data?.error || error.message}`);
      }
    } else {
      // Deactivate staff
      const confirmMsg = `Deactivate ${staff.full_name || staff.name}? They will be completely hidden from all system lists (attendance, salary, etc.) but data will be preserved in the database.`;
      if (!window.confirm(confirmMsg)) return;
      
      try {
        await axios.put(
          `${API_BASE_URL}/staff/toggle-active/${staff.global_staff_id || staff.id}`,
          { is_active: false },
          { headers: branchHeaders }
        );
        alert('Staff deactivated successfully! They are now hidden from all system lists.');
        fetchAllStaff();
      } catch (error) {
        alert(`Failed to deactivate staff: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  const handleDelete = async (staff) => {
    const name = staff.full_name || staff.name || 'this staff member';
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/staff/delete-staff`, {
        data: { globalStaffId: staff.global_staff_id || staff.id, staffType: staff.staffType, className: staff.className },
        headers: branchHeaders
      });
      alert(`"${name}" deleted successfully`);
      fetchAllStaff();
    } catch (error) {
      alert(`Delete failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleEdit = async (staff) => {
    setSelectedStaff(staff);
    setEditFormData({ ...staff });
    setEditFiles({});
    setShowEditModal(true);
    
    // Fetch column metadata for proper field rendering
    try {
      const response = await axios.get(
        `${API_BASE_URL}/staff/columns/${encodeURIComponent(staff.staffType)}/${encodeURIComponent(staff.className)}`,
        { headers: branchHeaders }
      );
      setColumnMetadata(response.data || []);
    } catch (error) {
      console.error('Error fetching column metadata:', error);
      setColumnMetadata([]);
    }
  };

  const handleEditInputChange = (fieldName, value) => {
    setEditFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  // Render field based on column metadata
  const renderEditField = (key, value) => {
    const columnInfo = columnMetadata.find(col => col.column_name === key);
    
    // Skip file upload fields - they're rendered in Documents section
    if (columnInfo && (columnInfo.data_type === 'upload' || columnInfo.data_type === 'file')) {
      return null;
    }
    
    // If no metadata, render as text input
    if (!columnInfo) {
      return (
        <div key={key} className={styles.editField}>
          <label className={styles.editLabel}>{formatLabel(key)}</label>
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleEditInputChange(key, e.target.value)}
            className={styles.editInput}
            disabled={saving}
          />
        </div>
      );
    }

    // Select dropdown
    if (columnInfo.data_type === 'select' && columnInfo.options) {
      return (
        <div key={key} className={styles.editField}>
          <label className={styles.editLabel}>{formatLabel(key)}</label>
          <select
            value={value || ''}
            onChange={(e) => handleEditInputChange(key, e.target.value)}
            className={styles.editInput}
            disabled={saving}
          >
            <option value="">Select {formatLabel(key)}</option>
            {columnInfo.options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    // Checkbox
    if (columnInfo.data_type === 'checkbox' || columnInfo.data_type === 'boolean') {
      return (
        <div key={key} className={styles.editField}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handleEditInputChange(key, e.target.checked)}
              disabled={saving}
            />
            {formatLabel(key)}
          </label>
        </div>
      );
    }

    // Textarea
    if (columnInfo.data_type === 'textarea') {
      return (
        <div key={key} className={styles.editField}>
          <label className={styles.editLabel}>{formatLabel(key)}</label>
          <textarea
            value={value || ''}
            onChange={(e) => handleEditInputChange(key, e.target.value)}
            className={styles.editInput}
            rows={4}
            disabled={saving}
          />
        </div>
      );
    }

    // Number
    if (columnInfo.data_type === 'integer' || columnInfo.data_type === 'numeric') {
      return (
        <div key={key} className={styles.editField}>
          <label className={styles.editLabel}>{formatLabel(key)}</label>
          <input
            type="number"
            value={value || ''}
            onChange={(e) => handleEditInputChange(key, e.target.value)}
            className={styles.editInput}
            disabled={saving}
          />
        </div>
      );
    }

    // Date
    if (columnInfo.data_type === 'date') {
      return (
        <div key={key} className={styles.editField}>
          <label className={styles.editLabel}>{formatLabel(key)}</label>
          <input
            type="date"
            value={value || ''}
            onChange={(e) => handleEditInputChange(key, e.target.value)}
            className={styles.editInput}
            disabled={saving}
          />
        </div>
      );
    }

    // Default text input
    return (
      <div key={key} className={styles.editField}>
        <label className={styles.editLabel}>{formatLabel(key)}</label>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleEditInputChange(key, e.target.value)}
          className={styles.editInput}
          disabled={saving}
        />
      </div>
    );
  };

  const handleEditFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) {
        alert('File size too large. Max 30MB.');
        return;
      }
      setEditFiles(prev => ({ ...prev, [fieldName]: file }));
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const formDataToSend = new FormData();
      
      // Ensure staffType and className are strings (not arrays)
      const staffType = String(selectedStaff.staffType || '');
      const className = String(selectedStaff.className || '');
      
      console.log('Sending update with staffType:', staffType, 'className:', className);
      
      formDataToSend.append('staffType', staffType);
      formDataToSend.append('class', className);

      // Add all form data - SKIP staffType and className to avoid duplicates
      Object.keys(editFormData).forEach(key => {
        // Skip these fields to avoid duplicates or system fields
        if (!['staffType', 'className', 'uniqueId', 'id', 'global_staff_id', 'staff_id'].includes(key)) {
          if (editFormData[key] !== null && editFormData[key] !== undefined) {
            if (Array.isArray(editFormData[key])) {
              formDataToSend.append(key, JSON.stringify(editFormData[key]));
            } else {
              formDataToSend.append(key, editFormData[key]);
            }
          }
        }
      });

      // Add new files
      Object.keys(editFiles).forEach(key => {
        if (editFiles[key]) {
          formDataToSend.append(key, editFiles[key]);
        }
      });

      await axios.put(
        `${API_BASE_URL}/staff/update/${selectedStaff.global_staff_id || selectedStaff.id}`,
        formDataToSend,
        { headers: branchHeaders }
      );

      alert('✅ Staff updated successfully!');
      setShowEditModal(false);
      fetchAllStaff(); // Refresh the list
    } catch (error) {
      console.error('Error updating staff:', error);
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const renderFileIcon = (type) => {
    const iconInfo = getFileIcon(type);
    const IconComponent = iconInfo.icon;
    return <IconComponent style={{ color: iconInfo.color }} />;
  };

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentStaff = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Table columns definition for modern Table component
  const tableColumns = [
    {
      key: 'photo', header: 'Photo', width: '80px', sortable: false,
      render: (_, staff) => {
        const isInactive = staff.is_active === false || staff.is_active === 'false';
        const photoUrl = getFileUrl(staff.image_staff, 'staff');
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
      key: 'full_name', header: 'Name', sortable: true,
      render: (_, staff) => {
        const isInactive = staff.is_active === false || staff.is_active === 'false';
        const name = staff.full_name || staff.name;
        return (
          <div>
            <strong>{name}</strong>
            {isInactive && <span className={styles.inactiveLabel}> (Deactivated)</span>}
          </div>
        );
      }
    },
    {
      key: 'staffType', header: 'Type', sortable: true,
      render: (staffType) => staffType || '-'
    },
    {
      key: 'role', header: 'Role', sortable: true,
      render: (_, staff) => staff.role || staff.position || '-'
    },
    {
      key: 'email', header: 'Email', sortable: true,
      render: (email) => email || '-'
    },
    {
      key: 'phone', header: 'Phone', sortable: true,
      render: (phone) => phone || '-'
    },
    {
      key: 'documents', header: 'Documents', sortable: false,
      render: (_, staff) => {
        const fileFields = getStaffFiles(staff);
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
    {
      key: 'actions', header: 'Actions', sortable: false, align: 'right',
      render: (_, staff) => {
        const isInactive = staff.is_active === false || staff.is_active === 'false';
        return (
          <div className={styles.tableActions}>
            <button onClick={(e) => { e.stopPropagation(); setSelectedStaff(staff); setShowModal(true); }}>
              <FiEye />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleEdit(staff); }}>
              <FiEdit />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleToggleActive(staff); }}
              title={isInactive ? 'Activate staff' : 'Deactivate staff'}
              className={isInactive ? styles.activateBtn : styles.deactivateBtn}
            >
              {isInactive ? <FiUserCheck /> : <FiUserX />}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleDelete(staff); }}
              title="Delete staff"
              className={styles.deleteBtn}
            >
              <FiTrash2 />
            </button>
          </div>
        );
      }
    }
  ];

  if (loading && staffData.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading staff...</p>
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
            <h1>{showInactive ? t('staff.list.deactivatedTitle', 'Deactivated Staff') : t('staff.list.title', 'Staff Directory')}</h1>
            <p>{showInactive ? t('staff.list.deactivatedDesc', 'View and manage deactivated staff members') : t('staff.list.subtitle', 'Browse and manage staff records')}</p>
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{filteredData.length}</span>
            <span className={styles.statLabel}>{showInactive ? 'Deactivated' : t('totalStaff')}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{staffTypes.length}</span>
            <span className={styles.statLabel}>{t('categories')}</span>
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div className={styles.controls} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={styles.searchBox}>
          <Input 
            prefixIcon={<FiSearch />}
            placeholder={t('searchStaff') || 'Search staff...'} 
            value={searchTerm} 
            onChange={setSearchTerm} 
          />
        </div>
        <div className={styles.filters}>
          <Select 
            value={filterType} 
            onChange={setFilterType}
            options={[
              { value: 'all', label: t('allTypes') || 'All Types' },
              ...staffTypes.map(type => ({ value: type, label: type }))
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
          onClick={fetchAllStaff}
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
          {showInactive ? 'Show Active Staff' : 'Show Deactivated Staff'}
        </Button>
      </motion.div>

      {/* Staff Display */}
      {currentStaff.length === 0 ? (
        <div className={styles.emptyState}>
          <FiUsers size={64} />
          <h3>{t('noStaffFound')}</h3>
          <p>{t('tryAdjustingFilters')}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div className={styles.staffGrid} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AnimatePresence>
            {currentStaff.map((staff, index) => {
              const fileFields = getStaffFiles(staff);
              const isInactive = staff.is_active === false || staff.is_active === 'false';
              return (
                <motion.div 
                  key={staff.uniqueId} 
                  className={`${styles.staffCard} ${isInactive ? styles.inactiveCard : ''}`}
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  transition={{ delay: index * 0.03 }}
                  whileHover={{ y: -5 }}
                  onClick={() => { setSelectedStaff(staff); setShowModal(true); }}
                >
                  <div className={styles.cardHeader}>
                    {getFileUrl(staff.image_staff, 'staff') ? (
                      <img 
                        src={getFileUrl(staff.image_staff, 'staff')} 
                        alt={staff.full_name || staff.name} 
                        className={styles.staffImage}
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
                      {staff.employment_type && (
                        <span className={`${styles.badge} ${staff.employment_type === 'Full-time' ? styles.badgeFull : styles.badgePart}`}>
                          {staff.employment_type}
                        </span>
                      )}
                      {staff.staffType && (
                        <span className={`${styles.badge} ${styles.badgeType}`}>
                          {staff.staffType.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.staffName}>{staff.full_name || staff.name || 'Unknown'}</h3>
                    <p className={styles.staffRole}>{staff.role || staff.position || staff.staffType}</p>
                    <div className={styles.cardInfo}>
                      {staff.email && (
                        <div className={styles.infoItem}><FiMail /> {staff.email}</div>
                      )}
                      {staff.phone && (
                        <div className={styles.infoItem}><FiPhone /> {staff.phone}</div>
                      )}
                      {staff.department && (
                        <div className={styles.infoItem}><FiBriefcase /> {staff.department}</div>
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
                      onClick={(e) => { e.stopPropagation(); setSelectedStaff(staff); setShowModal(true); }}
                    >
                      <FiEye /> {t('view')}
                    </button>
                    <button 
                      className={`${styles.actionBtn} ${styles.editBtn}`}
                      onClick={(e) => { e.stopPropagation(); handleEdit(staff); }}
                      title="Edit staff"
                    >
                      <FiEdit />
                    </button>
                    <button 
                      className={`${styles.actionBtn} ${isInactive ? styles.activateBtn : styles.deactivateBtn}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(staff); }}
                      title={isInactive ? 'Activate staff' : 'Deactivate staff'}
                    >
                      {isInactive ? <FiUserCheck /> : <FiUserX />}
                    </button>
                    <button 
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={(e) => { e.stopPropagation(); handleDelete(staff); }}
                      title="Delete staff"
                    >
                      <FiTrash2 />
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
            data={filteredData}
            paginated={true}
            pageSize={itemsPerPage}
            onRowClick={(staff) => { setSelectedStaff(staff); setShowModal(true); }}
            emptyMessage={t('noStaffFound') || 'No staff found matching your criteria.'}
          />
        </motion.div>
      )}


      {/* Staff Detail Modal */}
      <AnimatePresence>
        {showModal && selectedStaff && (
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
                {getFileUrl(selectedStaff.image_staff, 'staff') ? (
                  <img 
                    src={getFileUrl(selectedStaff.image_staff, 'staff')} 
                    alt="" 
                    className={styles.modalImage}
                    onClick={() => openFilePreview(selectedStaff.image_staff, 'Profile Photo')}
                  />
                ) : (
                  <div className={styles.modalAvatar}><FiUser /></div>
                )}
                <div className={styles.modalHeaderInfo}>
                  <h2>{selectedStaff.full_name || selectedStaff.name}</h2>
                  <p>{selectedStaff.role || selectedStaff.position || selectedStaff.staffType}</p>
                  <div className={styles.modalBadges}>
                    {selectedStaff.employment_type && (
                      <span className={`${styles.badge} ${selectedStaff.employment_type === 'Full-time' ? styles.badgeFull : styles.badgePart}`}>
                        {selectedStaff.employment_type}
                      </span>
                    )}
                    {selectedStaff.staffType && (
                      <span className={`${styles.badge} ${styles.badgeType}`}>
                        {selectedStaff.staffType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.modalSection}>
                  <h3><FiUser /> {t('basicInformation')}</h3>
                  <div className={styles.infoGrid}>
                    {Object.entries(selectedStaff)
                      .filter(([key, value]) => !isFileField(key) && !looksLikeFile(value) && !['uniqueId', 'id', 'global_staff_id', 'staff_id', 'password', 'password_hash', 'staffType', 'className'].includes(key))
                      .map(([key, value]) => (
                        <div key={key} className={styles.infoRow}>
                          <span className={styles.infoLabel}>{formatLabel(key)}</span>
                          <span className={styles.infoValue}>{value || '-'}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
                
                {/* Credentials Section */}
                {(selectedStaff.username || (canViewPassword && (selectedStaff.password || selectedStaff.password_hash))) && (
                  <div className={styles.modalSection}>
                    <h3><FiLock /> {t('loginCredentials')}</h3>
                    <div className={styles.credentialsGrid}>
                      {selectedStaff.username && (
                        <div className={styles.credentialRow}>
                          <span className={styles.credentialLabel}>{t('username')}</span>
                          <div className={styles.credentialValue}>
                            <span>{selectedStaff.username}</span>
                            <button 
                              className={styles.copyBtn}
                              onClick={() => copyToClipboard(selectedStaff.username)}
                              title="Copy username"
                            >
                              <FiCopy />
                            </button>
                          </div>
                        </div>
                      )}
                      {canViewPassword && (selectedStaff.password || selectedStaff.password_hash) && (
                        <div className={styles.credentialRow}>
                          <span className={styles.credentialLabel}>{t('password')}</span>
                          <div className={styles.credentialValue}>
                            <span className={styles.passwordText}>
                              {showPassword ? (selectedStaff.password || selectedStaff.password_hash || '-') : '••••••••'}
                            </span>
                            <button 
                              className={styles.toggleBtn}
                              onClick={() => setShowPassword(!showPassword)}
                              title={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <FiEyeOff /> : <FiEye />}
                            </button>
                            <button 
                              className={styles.copyBtn}
                              onClick={() => copyToClipboard(selectedStaff.password || selectedStaff.password_hash || '')}
                              title="Copy password"
                            >
                              <FiCopy />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Documents Section */}
                {(() => {
                  const fileFields = Object.entries(selectedStaff).filter(([key, value]) => value && (isFileField(key) || looksLikeFile(value)));
                  if (fileFields.length === 0) return null;
                  return (
                    <div className={styles.modalSection}>
                      <h3><FiFile /> {t('documentsAndFiles')}</h3>
                      <div className={styles.documentsGrid}>
                        {fileFields.map(([key, value]) => {
                          const fileType = getFileType(value);
                          const url = getFileUrl(value, 'staff');
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
                  <FiDownload /> {t('download')}
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Staff Modal */}
      <AnimatePresence>
        {showEditModal && selectedStaff && (
          <motion.div 
            className={styles.modalOverlay} 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => !saving && setShowEditModal(false)}
          >
            <motion.div 
              className={styles.editModal}
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className={styles.modalClose} onClick={() => !saving && setShowEditModal(false)} disabled={saving}>
                <FiX />
              </button>
              
              <div className={styles.modalHeader}>
                {getFileUrl(selectedStaff.image_staff, 'staff') ? (
                  <img 
                    src={getFileUrl(selectedStaff.image_staff, 'staff')} 
                    alt="" 
                    className={styles.modalImage}
                  />
                ) : (
                  <div className={styles.modalAvatar}><FiUser /></div>
                )}
                <div className={styles.modalHeaderInfo}>
                  <h2>{selectedStaff.full_name || selectedStaff.name}</h2>
                  <p>{selectedStaff.role || selectedStaff.position || selectedStaff.staffType}</p>
                  <div className={styles.modalBadges}>
                    {selectedStaff.staffType && (
                      <span className={`${styles.badge} ${styles.badgeType}`}>
                        {selectedStaff.staffType}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.modalBody}>
                {/* Profile Image Upload Section */}
                <div className={styles.modalSection}>
                  <h3><FiUser /> Profile Image</h3>
                  <div className={styles.imageUploadContainer}>
                    <div className={styles.currentImagePreview}>
                      {getFileUrl(selectedStaff.image_staff, 'staff') ? (
                        <img 
                          src={getFileUrl(selectedStaff.image_staff, 'staff')} 
                          alt="Current" 
                          className={styles.previewImage}
                        />
                      ) : (
                        <div className={styles.previewPlaceholder}>
                          <FiUser />
                          <span>No image</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.imageUploadControls}>
                      <label className={styles.imageUploadLabel}>
                        <input
                          type="file"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              if (file.size > 30 * 1024 * 1024) {
                                alert('Image size too large. Max 30MB.');
                                return;
                              }
                              if (!file.type.startsWith('image/')) {
                                alert('Please select an image file.');
                                return;
                              }
                              handleEditInputChange('image_staff', file);
                            }
                          }}
                          accept="image/*"
                          className={styles.hiddenFileInput}
                          disabled={saving}
                        />
                        <span className={styles.uploadButton}>
                          📷 Change Photo
                        </span>
                      </label>
                      <small className={styles.imageHint}>
                        JPEG, PNG, GIF (Max 30MB)
                      </small>
                    </div>
                  </div>
                </div>

                <div className={styles.modalSection}>
                  <h3><FiUser /> {t('basicInformation')}</h3>
                  <div className={styles.editGrid}>
                    {Object.entries(editFormData)
                      .filter(([key]) => !['uniqueId', 'id', 'global_staff_id', 'staff_id', 'password', 'password_hash', 'staffType', 'className', 'image_staff'].includes(key))
                      .filter(([key, value]) => !isFileField(key) && !looksLikeFile(value))
                      .map(([key, value]) => renderEditField(key, value))
                    }
                  </div>
                </div>

                {/* File Upload Section */}
                {(() => {
                  const fileFields = Object.entries(editFormData).filter(([key, value]) => {
                    // Check if it's a file field by name pattern
                    if (isFileField(key) && key !== 'image_staff') return true;
                    
                    // Check if it's a file field by column metadata
                    const columnInfo = columnMetadata.find(col => col.column_name === key);
                    if (columnInfo && (columnInfo.data_type === 'upload' || columnInfo.data_type === 'file')) {
                      return key !== 'image_staff';
                    }
                    
                    return false;
                  });
                  
                  if (fileFields.length === 0) return null;
                  return (
                    <div className={styles.modalSection}>
                      <h3><FiFile /> Documents & Files</h3>
                      <div className={styles.editGrid}>
                        {fileFields.map(([key, value]) => (
                          <div key={key} className={styles.editField}>
                            <label className={styles.editLabel}>{formatLabel(key)}</label>
                            <div className={styles.fileUploadSection}>
                              {value && typeof value === 'string' && (
                                <div className={styles.currentFileInfo}>
                                  <span className={styles.currentFileLabel}>Current:</span>
                                  <a 
                                    href={getFileUrl(value, 'staff')} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className={styles.fileLink}
                                  >
                                    {getFileName(value)}
                                  </a>
                                </div>
                              )}
                              <input
                                type="file"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    if (file.size > 30 * 1024 * 1024) {
                                      alert('File size too large. Max 30MB.');
                                      return;
                                    }
                                    // Store file for upload
                                    handleEditInputChange(key, file);
                                  }
                                }}
                                className={styles.fileInput}
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                                disabled={saving}
                              />
                              <small className={styles.fileHint}>
                                PDF, Word, Excel, Images (Max 30MB)
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Login Credentials Section - Read Only */}
                {(selectedStaff.username || (canViewPassword && (selectedStaff.password || selectedStaff.password_hash))) && (
                  <div className={styles.modalSection}>
                    <h3><FiLock /> {t('loginCredentials')}</h3>
                    <div className={styles.credentialsGrid}>
                      {selectedStaff.username && (
                        <div className={styles.credentialRow}>
                          <span className={styles.credentialLabel}>{t('username')}</span>
                          <div className={styles.credentialValue}>
                            <span>{selectedStaff.username}</span>
                            <button 
                              className={styles.copyBtn}
                              onClick={() => copyToClipboard(selectedStaff.username)}
                              title="Copy username"
                            >
                              <FiCopy />
                            </button>
                          </div>
                        </div>
                      )}
                      {canViewPassword && (selectedStaff.password || selectedStaff.password_hash) && (
                        <div className={styles.credentialRow}>
                          <span className={styles.credentialLabel}>{t('password')}</span>
                          <div className={styles.credentialValue}>
                            <span className={styles.passwordText}>
                              {showPassword ? (selectedStaff.password || selectedStaff.password_hash || '-') : '••••••••'}
                            </span>
                            <button 
                              className={styles.toggleBtn}
                              onClick={() => setShowPassword(!showPassword)}
                              title={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <FiEyeOff /> : <FiEye />}
                            </button>
                            <button 
                              className={styles.copyBtn}
                              onClick={() => copyToClipboard(selectedStaff.password || selectedStaff.password_hash || '')}
                              title="Copy password"
                            >
                              <FiCopy />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.editModalFooter}>
                <button 
                  className={styles.cancelEditBtn} 
                  onClick={() => setShowEditModal(false)}
                  disabled={saving}
                >
                  <FiX /> {t('cancel')}
                </button>
                <button 
                  className={styles.saveEditBtn} 
                  onClick={handleSaveEdit}
                  disabled={saving}
                >
                  <FiEdit /> {saving ? t('saving') : t('saveChanges')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ListStaff;
