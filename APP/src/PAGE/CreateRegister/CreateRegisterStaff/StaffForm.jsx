// StaffForm.jsx - V2 Staff Registration Form
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Camera, Download, Upload } from 'lucide-react';
import styles from './CreateRegisterStaff.module.css';

import Input from '../../../COMPONENTS/Input/Input';
import Select from '../../../COMPONENTS/Select/Select';
import DatePicker from '../../../COMPONENTS/DatePicker/DatePicker';
import FileUpload from '../../../COMPONENTS/FileUpload/FileUpload';
import Textarea from '../../../COMPONENTS/Textarea/Textarea';
import Checkbox from '../../../COMPONENTS/Checkbox/Checkbox';
import Button from '../../../COMPONENTS/Button/Button';
import { getBranchCode } from '../../../utils/branchCode';

const StaffForm = ({ staffTypeProp, classNameProp, onSuccess }) => {
  const { t } = useTranslation();
  const { staffType: paramStaffType, className: paramClassName } = useParams();
  const staffType = staffTypeProp || paramStaffType;
  const className = classNameProp || paramClassName;
  const navigate = useNavigate();
  const [columns, setColumns] = useState([]);
  const [formData, setFormData] = useState({});
  const [files, setFiles] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success', 'error', 'warning'
  const [generatedCredentials, setGeneratedCredentials] = useState(null);
  const [partTimeOptions, setPartTimeOptions] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partTimeOptionsError, setPartTimeOptionsError] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [teacherStatus, setTeacherStatus] = useState(null); // Track teacher table status
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Teacher-specific validation function
  const validateTeacherFields = () => {
    const errors = {};
    const isTeacherRole = formData.role === 'Teacher';
    
    // Validate all required fields
    if (!formData.name || formData.name.trim() === '') {
      errors.name = 'Name is required';
    }
    if (!formData.gender) {
      errors.gender = 'Gender is required';
    }
    if (!formData.role) {
      errors.role = 'Role is required';
    }
    if (!formData.staff_enrollment_type) {
      errors.staff_enrollment_type = 'Enrollment type is required';
    }
    if (!formData.staff_work_time) {
      errors.staff_work_time = 'Work time is required';
    }
    
    // Phone format validation (at least 10 digits)
    if (formData.phone) {
      const digits = formData.phone.replace(/\D/g, '');
      if (digits.length < 10) {
        errors.phone = 'Phone must have at least 10 digits';
      }
    }
    
    // Validate schedule for part-time teachers
    if (isTeacherRole && formData.staff_work_time === 'Part Time') {
      if (!formData.work_days || formData.work_days.length === 0) {
        errors.schedule = 'Schedule information is required for part-time teachers';
      }
      if (!formData.shifts || formData.shifts.length === 0) {
        errors.schedule = 'Please select at least one shift for part-time teachers';
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Standard dropdown options
  const standardOptions = {
    gender: ['Male', 'Female'],
    role: [
      'Teacher', 'Director', 'Coordinator', 'Supervisor', 
      'Deputy director', 'Purchaser', 'Cashier', 'Accountant', 
      'Guard', 'Cleaner', 'Department Head', 'Counselor', 
      'Instructor', 'Librarian', 'Nurse', 'Technician', 
      'Assistant', 'Manager', 'Trainer', 'Advisor', 'Inspector'
    ],
    staff_enrollment_type: ['Permanent', 'Contract'],
    staff_work_time: ['Full Time', 'Part Time']
  };

  // File type configurations
  const fileTypeConfig = {
    image_staff: {
      accept: "image/*",
      description: "Staff photo (JPEG, PNG, JPG)",
      isImage: true
    },
    default: {
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png",
      description: "Documents (PDF, Word, Excel, PowerPoint), Images (JPG, PNG)",
      isImage: false
    }
  };

  useEffect(() => {
    fetchColumns();
    fetchPartTimeOptions();
  }, [staffType, className]);

  const fetchPartTimeOptions = async () => {
    try {
      const response = await axios.get('/api/staff/part-time-options');
      setPartTimeOptions(response.data);
      setPartTimeOptionsError(false);
    } catch (error) {
      console.error('Error fetching part-time options:', error);
      setPartTimeOptionsError(true);
      setPartTimeOptions({
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        shifts: ['morning', 'afternoon'],
        default_times: {
          morning: { start_time: '07:00', end_time: '12:30' },
          afternoon: { start_time: '12:30', end_time: '17:30' }
        }
      });
    }
  };

  const fetchColumns = async () => {
    try {
      const response = await axios.get(`/api/staff/columns/${encodeURIComponent(staffType)}/${encodeURIComponent(className)}`);
      
      // Use the columns exactly as returned from the backend (with preserved types)
      setColumns(response.data);
      
      const initialFormData = {};
      response.data.forEach(col => {
        if (!['id', 'global_staff_id', 'staff_id', 'image_staff'].includes(col.column_name)) {
          if (col.data_type === 'checkbox' || col.data_type === 'boolean') {
            initialFormData[col.column_name] = false;
          } else if (col.data_type === 'multiple-checkbox') {
            initialFormData[col.column_name] = [];
          } else {
            initialFormData[col.column_name] = '';
          }
        }
      });
      setFormData(initialFormData);
      setGeneratedCredentials(null);
    } catch (error) {
      setMessage(`Error fetching form columns: ${error.response?.data?.error || error.message}`);
    }
  };

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: 1280, height: 720 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setCameraStream(stream);
      setCameraActive(true);
    } catch (err) {
      setMessage('❌ Camera access denied. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      
      canvasRef.current.toBlob((blob) => {
        const file = new File([blob], `staff-photo-${Date.now()}.jpg`, { 
          type: 'image/jpeg' 
        });
        
        setFiles(prev => ({ ...prev, image_staff: file }));
        setMessage('✅ Photo captured successfully!');
        stopCamera();
      }, 'image/jpeg', 0.95);
    }
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (file) {
      // Increased file size limit to 30MB
      if (file.size > 30 * 1024 * 1024) {
        setMessage(`❌ File size too large. Please select a file smaller than 30MB.`);
        e.target.value = '';
        return;
      }

      const config = fileTypeConfig[fieldName] || fileTypeConfig.default;
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const allowedExtensions = config.accept.includes('*') 
        ? true 
        : config.accept.split(',').some(ext => file.name.toLowerCase().endsWith(ext.replace('.', '')));
      
      if (!allowedExtensions) {
        setMessage(`❌ Invalid file type for ${formatFieldLabel(fieldName)}. Allowed: ${config.description}`);
        e.target.value = '';
        return;
      }

      setFiles({ ...files, [fieldName]: file });
      setMessage(`✅ File "${file.name}" selected for ${formatFieldLabel(fieldName)}`);
    }
  };

  const handleWorkTimeChange = (e) => {
    const workTime = e.target.value;
    setFormData({ ...formData, staff_work_time: workTime });
    
    if (workTime === 'Part Time') {
      if (!partTimeOptions) {
        setMessage('Schedule options not available. Please try again.');
        return;
      }
      setShowScheduleModal(true);
    }
  };

  const handleScheduleSave = (scheduleData) => {
    setFormData({
      ...formData,
      work_days: scheduleData.work_days,
      shifts: scheduleData.shifts,
      availability: scheduleData.availability,
      max_hours_per_day: scheduleData.max_hours_per_day,
      max_hours_per_week: scheduleData.max_hours_per_week
    });
    setShowScheduleModal(false);
  };

  const handleDownload = async () => {
    try {
      // Fetch columns for the staff table
      const response = await axios.get(`/api/staff/columns/${encodeURIComponent(staffType)}/${encodeURIComponent(className)}`);
      const allColumns = response.data;
      
      // Exclude system-generated fields
      const excludedFields = ['id', 'global_staff_id', 'staff_id', 'username', 'password', 'image_staff'];
      const columns = allColumns
        .filter(col => !excludedFields.includes(col.column_name))
        .map(col => col.column_name);
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([columns]);
      XLSX.utils.book_append_sheet(wb, ws, className);
      XLSX.writeFile(wb, `${className}_staff_template.xlsx`);
      setMessage('✅ Excel template downloaded successfully');
    } catch (error) {
      setMessage(`❌ Error downloading template: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleUploadExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setMessage('');
    setMessageType('');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const wb = XLSX.read(event.target.result, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length === 0) {
          setMessage('❌ Excel file is empty');
          setMessageType('error');
          return;
        }
        
        // Send to backend for bulk import
        const response = await axios.post('/api/staff/bulk-import', { 
          staffType, 
          className, 
          staff: data 
        }, { timeout: 30000 });
        
        setMessage(`✅ Successfully imported ${response.data.successCount} staff members`);
        setMessageType('success');
        
        // Show detailed results
        let detailMessage = `Successfully imported ${response.data.successCount} staff members`;
        
        if (response.data.failedCount > 0) {
          detailMessage += `\n\nFailed to import ${response.data.failedCount} staff members.`;
          if (response.data.errors && response.data.errors.length > 0) {
            detailMessage += '\n\nErrors:\n';
            response.data.errors.slice(0, 5).forEach(err => {
              detailMessage += `Row ${err.row}: ${err.error}\n`;
            });
            if (response.data.errors.length > 5) {
              detailMessage += `... and ${response.data.errors.length - 5} more errors`;
            }
          }
        }
        
        alert(detailMessage);
        
        // Reset file input
        e.target.value = '';
        
        // Refresh form if needed
        if (onSuccess) {
          onSuccess(response.data);
        }
      } catch (error) {
        console.error('Error uploading Excel:', error);
        setMessage(`❌ Error uploading Excel: ${error.response?.data?.error || error.message}`);
        setMessageType('error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleInputChange = (fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSelectChange = (fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleCheckboxChange = (fieldName, checked) => {
    setFormData(prev => ({ ...prev, [fieldName]: checked }));
  };

  const handleMultipleCheckboxChange = (fieldName, option, checked) => {
    setFormData(prev => {
      const currentValues = Array.isArray(prev[fieldName]) ? prev[fieldName] : [];
      if (checked) {
        return { ...prev, [fieldName]: [...currentValues, option] };
      } else {
        return { ...prev, [fieldName]: currentValues.filter(item => item !== option) };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    // Validate teacher-specific fields before submission
    if (!validateTeacherFields()) {
      setMessage('❌ Please fix the validation errors before submitting');
      setMessageType('error');
      return;
    }
    
    setIsSubmitting(true);
    setMessage('');
    setMessageType('');
    setTeacherStatus(null);
    
    const formDataToSend = new FormData();
    formDataToSend.append('staffType', staffType);
    formDataToSend.append('class', className);
    
    // Add all form data
    Object.keys(formData).forEach(key => {
      if (key === 'availability' && Array.isArray(formData[key])) {
        formDataToSend.append(key, JSON.stringify(formData[key]));
      } else if (key === 'work_days' && Array.isArray(formData[key])) {
        formDataToSend.append(key, JSON.stringify(formData[key]));
      } else if (key === 'shifts' && Array.isArray(formData[key])) {
        formDataToSend.append(key, JSON.stringify(formData[key]));
      } else {
        formDataToSend.append(key, formData[key]);
      }
    });
    
    // Add all files with their original field names
    Object.keys(files).forEach(key => {
      if (files[key]) {
        formDataToSend.append(key, files[key]);
      }
    });
    
    const uploadFields = columns.filter(col => col.data_type === 'upload').map(col => col.column_name);
    formDataToSend.append('uploadFields', JSON.stringify(uploadFields));

    // Ensure we have a branch code before submitting
    const branchCode = getBranchCode();
    if (!branchCode) {
      setMessage('❌ No branch code found. Please log in again or select a branch.');
      setMessageType('error');
      setIsSubmitting(false);
      return;
    }

    try {
      const headers = { 'X-Branch-Code': branchCode };
      
      const response = await axios.post('/api/staff/add-staff', formDataToSend, { headers });
      
      // Handle teacher-specific response data
      if (response.data.teacherData) {
        setTeacherStatus({
          success: true,
          name: response.data.teacherData.name,
          workTime: response.data.teacherData.workTime,
          globalStaffId: response.data.teacherData.globalStaffId
        });
      }
      
      // Handle schoolSchemaError (teacher table insertion error)
      if (response.data.schoolSchemaError) {
        setTeacherStatus({
          success: false,
          error: response.data.schoolSchemaError
        });
        setMessage('⚠️ Staff added but teacher table update failed');
        setMessageType('warning');
      } else {
        setMessage('✅ Staff member added successfully');
        setMessageType('success');
      }
      
      if (response.data.userCredentials) {
        if (response.data.userCredentials.error) {
          setMessage(`⚠️ Staff saved but account creation failed: ${response.data.userCredentials.error}`);
          setMessageType('warning');
          setGeneratedCredentials(null);
        } else {
          setGeneratedCredentials(response.data.userCredentials);
        }
      } else {
        setGeneratedCredentials(null);
      }

      if (response.data.scheduleError) {
        setMessage(prev => prev + ` (Schedule: ${response.data.scheduleError})`);
      }

      // Reset form
      const initialFormData = {};
      columns.forEach(col => {
        if (!['id', 'global_staff_id', 'staff_id', 'image_staff'].includes(col.column_name)) {
          if (col.data_type === 'checkbox' || col.data_type === 'boolean') {
            initialFormData[col.column_name] = false;
          } else if (col.data_type === 'multiple-checkbox') {
            initialFormData[col.column_name] = [];
          } else {
            initialFormData[col.column_name] = '';
          }
        }
      });
      setFormData(initialFormData);
      setFiles({});
      setValidationErrors({});
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(response.data);
      }

    } catch (error) {
      console.error('Error adding staff:', error);
      setMessage(`❌ Error adding staff: ${error.response?.data?.error || error.message}`);
      setMessageType('error');
      setGeneratedCredentials(null);
      setTeacherStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFieldLabel = (fieldName) => {
    return fieldName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getFileAcceptTypes = (fieldName) => {
    return fileTypeConfig[fieldName]?.accept || fileTypeConfig.default.accept;
  };

  const getFileTypeDescription = (fieldName) => {
    return fileTypeConfig[fieldName]?.description || fileTypeConfig.default.description;
  };

  const isImageField = (fieldName) => {
    return fileTypeConfig[fieldName]?.isImage || false;
  };

  const fieldLabel = useCallback(
    (fieldName) => formatFieldLabel(fieldName),
    []
  );

  const parseDateValue = (val) => {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const renderField = (col) => {
    const fieldName = col.column_name;
    const value = formData[fieldName] || '';
    const isObject = typeof formData[fieldName] === 'object' && formData[fieldName] !== null;
    const isRequired = true;
    const label = fieldLabel(fieldName);
    const isStandardDropdown = standardOptions[fieldName]?.length > 0;
    const selectOptions = (col.options || standardOptions[fieldName] || []).map((opt) => {
      const val = typeof opt === 'object' ? (opt.value || opt.label || '') : opt;
      return { value: val, label: typeof opt === 'object' ? (opt.label || val) : opt };
    });

    const handleFileUploadChange = (uploaded) => {
      const file = uploaded?.[0];
      if (!file) {
        setFiles(prev => { const n = { ...prev }; delete n[fieldName]; return n; });
        return;
      }
      setFiles(prev => ({ ...prev, [fieldName]: file }));
    };

    if (fieldName === 'image_staff' || col.data_type === 'upload') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          {fieldName === 'image_staff' && (
            <div className={styles.cameraRow}>
              <Button type="button" variant="secondary" size="sm" icon={<Camera size={16} />} onClick={startCamera}>
                {t('staff.registration.takePhoto', 'Take Photo')}
              </Button>
            </div>
          )}
          <FileUpload
            label={label}
            accept={getFileAcceptTypes(fieldName)}
            value={files[fieldName] ? [files[fieldName]] : []}
            onChange={handleFileUploadChange}
            required={isRequired}
            maxSize={30 * 1024 * 1024}
            helperText={`${getFileTypeDescription(fieldName)} (Max 30MB)`}
          />
        </div>
      );
    }

    if (fieldName === 'machine_id') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Input
            label={label}
            value={value || ''}
            placeholder="Auto-generated on submit"
            readOnly
            required={isRequired}
            helperText="6-digit unique ID, auto-assigned"
          />
        </div>
      );
    }

    if (fieldName === 'staff_work_time') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Select
            label={label}
            value={value}
            onChange={(v) => handleWorkTimeChange({ target: { value: v } })}
            options={[
              { value: 'Full Time', label: t('staff.registration.fullTime', 'Full Time') },
              { value: 'Part Time', label: t('staff.registration.partTime', 'Part Time') }
            ]}
            placeholder={t('staff.registration.selectWorkTime', 'Select work time')}
            required={isRequired}
            error={validationErrors.staff_work_time}
          />
          {value === 'Part Time' && formData.availability && (
            <div className={styles.scheduleSummary}>
              <p>{t('staff.registration.scheduleSummary', 'Schedule Summary')}</p>
              <p>{t('staff.registration.days', 'Days')}: {formData.work_days?.join(', ') || '—'}</p>
              <p>{t('staff.registration.shifts', 'Shifts')}: {formData.shifts?.join(', ') || '—'}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowScheduleModal(true)}>
                {t('staff.registration.editSchedule', 'Edit Schedule')}
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (col.data_type === 'checkbox') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Checkbox
            label={label}
            checked={Boolean(value)}
            onChange={(checked) => handleCheckboxChange(fieldName, checked)}
            required={isRequired}
          />
        </div>
      );
    }

    if (col.data_type === 'multiple-checkbox' && col.options) {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <span className={styles.multiCheckboxLabel}>{label}</span>
          <div className={styles.checkboxGroup}>
            {col.options.map((option) => (
              <Checkbox
                key={option}
                label={option}
                checked={Array.isArray(value) && value.includes(option)}
                onChange={(checked) => handleMultipleCheckboxChange(fieldName, option, checked)}
              />
            ))}
          </div>
        </div>
      );
    }

    if ((col.data_type === 'select' || isStandardDropdown) && selectOptions.length > 0) {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Select
            label={label}
            value={value}
            onChange={(v) => handleSelectChange(fieldName, v)}
            options={selectOptions}
            placeholder={t('common.select', 'Select {{field}}', { field: label })}
            required={isRequired}
            error={validationErrors[fieldName]}
          />
        </div>
      );
    }

    if (col.data_type === 'textarea') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Textarea
            label={label}
            value={value}
            onChange={(v) => handleInputChange(fieldName, v)}
            required={isRequired}
            rows={4}
          />
        </div>
      );
    }

    if (col.data_type === 'date') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <DatePicker
            label={label}
            value={parseDateValue(value)}
            onChange={(date) =>
              handleInputChange(fieldName, date ? date.toISOString().split('T')[0] : '')
            }
            required={isRequired}
          />
        </div>
      );
    }

    if (fieldName === 'phone') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Input
            type="tel"
            label={label}
            value={value}
            onChange={(v) => handleInputChange(fieldName, v)}
            required={isRequired}
            error={validationErrors[fieldName]}
            placeholder="e.g. +251911234567 or 0911234567"
            helperText="Unique phone number, at least 10 digits"
          />
        </div>
      );
    }

    if (col.data_type === 'integer' || col.data_type === 'numeric') {
      return (
        <div key={fieldName} className={styles.fieldGroup}>
          <Input
            type="number"
            label={label}
            value={isObject ? '' : value}
            onChange={(v) => handleInputChange(fieldName, v)}
            required={isRequired}
            error={validationErrors[fieldName]}
          />
        </div>
      );
    }

    return (
      <div key={fieldName} className={styles.fieldGroup}>
        <Input
          label={label}
          value={isObject ? '' : value}
          onChange={(v) => handleInputChange(fieldName, v)}
          required={isRequired}
          error={validationErrors[fieldName]}
        />
      </div>
    );
  };

  return (
    <div className={styles.formContainer}>
      {!staffTypeProp && (
        <div className={styles.formHeader}>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            {t('common.back', 'Back')}
          </Button>
        </div>
      )}

      <div className={styles.formActions}>
        <Button variant="secondary" size="sm" icon={<Download size={16} />} onClick={handleDownload}>
          {t('staff.registration.downloadExcel', 'Download Excel')}
        </Button>
        <label className={styles.excelUploadLabel}>
          <span className={styles.excelUploadBtn}>
            <Upload size={16} />
            {t('staff.registration.uploadExcel', 'Upload Excel')}
          </span>
          <input type="file" accept=".xlsx,.xls" onChange={handleUploadExcel} className={styles.hiddenInput} />
        </label>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`${styles.messageBox} ${styles[messageType]}`}>
          {message}
        </div>
      )}

      {/* Teacher Status Display */}
      {teacherStatus && (
        <div className={`${styles.statusBox} ${teacherStatus.success ? styles.statusSuccess : styles.statusError}`}>
          <h4>{teacherStatus.success ? '✅ Teacher Added Successfully' : '⚠️ Teacher Table Error'}</h4>
          {teacherStatus.success ? (
            <div className={styles.teacherInfo}>
              <p><strong>Name:</strong> {teacherStatus.name}</p>
              <p><strong>Work Time:</strong> {teacherStatus.workTime}</p>
              <p><strong>Staff ID:</strong> {teacherStatus.globalStaffId}</p>
            </div>
          ) : (
            <p className={styles.errorText}>{teacherStatus.error}</p>
          )}
        </div>
      )}

      {/* Credentials Display */}
      {generatedCredentials && (
        <div className={styles.credentialsBox}>
          <h4>🔐 New Staff Credentials</h4>
          <div className={styles.credentialItem}>
            <span className={styles.credentialLabel}>Username:</span>
            <span className={styles.credentialValue}>{generatedCredentials.username}</span>
          </div>
          <div className={styles.credentialItem}>
            <span className={styles.credentialLabel}>Password:</span>
            <span className={styles.credentialValue}>{generatedCredentials.password}</span>
          </div>
          <p className={styles.credentialNote}>{generatedCredentials.message}</p>
        </div>
      )}

      {/* Camera Modal */}
      {cameraActive && (
        <div className={styles.cameraModal}>
          <div className={styles.cameraContent}>
            <h3>📷 Take Staff Photo</h3>
            <video ref={videoRef} autoPlay playsInline className={styles.cameraVideo} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className={styles.cameraControls}>
              <button type="button" onClick={capturePhoto} className={styles.captureButton}>
                📸 Capture Photo
              </button>
              <button type="button" onClick={stopCamera} className={styles.cancelButton}>
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.staffForm}>
        <div className={styles.formGrid}>
          {columns
            .filter(col => !['id', 'global_staff_id', 'staff_id', 'shift_assignment'].includes(col.column_name))
            .map(col => {
              const fieldName = col.column_name;
              const hasError = validationErrors[fieldName];
              return (
                <div key={fieldName} className={hasError ? styles.fieldError : ''}>
                  {renderField(col)}
                  {hasError && <span className={styles.errorMessage}>{validationErrors[fieldName]}</span>}
                </div>
              );
            })
          }
        </div>
        
        {/* Schedule validation error */}
        {validationErrors.schedule && (
          <div className={styles.scheduleError}>
            ⚠️ {validationErrors.schedule}
          </div>
        )}
        
        <div className={styles.submitSection}>
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
            {t('staff.addStaff', 'Add Staff')}
          </Button>
        </div>
      </form>

      {showScheduleModal && partTimeOptions && (
        <PartTimeScheduleModal
          options={partTimeOptions}
          existingData={formData}
          onSave={handleScheduleSave}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  );
};

// Part Time Schedule Modal Component (keep the same as before)
const PartTimeScheduleModal = ({ options, existingData, onSave, onClose }) => {
  const [selectedDays, setSelectedDays] = useState(existingData.work_days || []);
  const [selectedShifts, setSelectedShifts] = useState(existingData.shifts || []);
  const [availability, setAvailability] = useState([]);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(existingData.max_hours_per_day || 8);
  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(existingData.max_hours_per_week || 40);

  useEffect(() => {
    const initialAvailability = [];
    options.days.forEach(day => {
      options.shifts.forEach(shift => {
        const existingSlot = existingData.availability?.find(
          slot => slot.day === day && slot.shift === shift
        );
        initialAvailability.push({
          day: day,
          shift: shift,
          start_time: existingSlot?.start_time || options.default_times[shift]?.start_time || '07:00',
          end_time: existingSlot?.end_time || options.default_times[shift]?.end_time || '17:30',
          active: existingSlot?.active || (existingData.work_days?.includes(day) && existingData.shifts?.includes(shift))
        });
      });
    });
    setAvailability(initialAvailability);
  }, [options, existingData]);

  const handleDayToggle = (day) => {
    const newSelectedDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day];
    setSelectedDays(newSelectedDays);

    const updatedAvailability = availability.map(slot => ({
      ...slot,
      active: newSelectedDays.includes(slot.day) && selectedShifts.includes(slot.shift)
    }));
    setAvailability(updatedAvailability);
  };

  const handleShiftToggle = (shift) => {
    const newSelectedShifts = selectedShifts.includes(shift)
      ? selectedShifts.filter(s => s !== shift)
      : [...selectedShifts, shift];
    setSelectedShifts(newSelectedShifts);

    const updatedAvailability = availability.map(slot => ({
      ...slot,
      active: selectedDays.includes(slot.day) && newSelectedShifts.includes(slot.shift)
    }));
    setAvailability(updatedAvailability);
  };

  const handleTimeChange = (day, shift, field, value) => {
    const updatedAvailability = availability.map(slot => 
      slot.day === day && slot.shift === shift
        ? { ...slot, [field]: value }
        : slot
    );
    setAvailability(updatedAvailability);
  };

  const handleSlotToggle = (day, shift) => {
    const updatedAvailability = availability.map(slot => 
      slot.day === day && slot.shift === shift
        ? { ...slot, active: !slot.active }
        : slot
    );
    setAvailability(updatedAvailability);
  };

  const handleSelectAll = (type) => {
    if (type === 'days') {
      const allDays = [...options.days];
      setSelectedDays(allDays);
      const updatedAvailability = availability.map(slot => ({
        ...slot,
        active: allDays.includes(slot.day) && selectedShifts.includes(slot.shift)
      }));
      setAvailability(updatedAvailability);
    } else if (type === 'shifts') {
      const allShifts = [...options.shifts];
      setSelectedShifts(allShifts);
      const updatedAvailability = availability.map(slot => ({
        ...slot,
        active: selectedDays.includes(slot.day) && allShifts.includes(slot.shift)
      }));
      setAvailability(updatedAvailability);
    }
  };

  const handleDeselectAll = (type) => {
    if (type === 'days') {
      setSelectedDays([]);
      const updatedAvailability = availability.map(slot => ({
        ...slot,
        active: false
      }));
      setAvailability(updatedAvailability);
    } else if (type === 'shifts') {
      setSelectedShifts([]);
      const updatedAvailability = availability.map(slot => ({
        ...slot,
        active: false
      }));
      setAvailability(updatedAvailability);
    }
  };

  const handleSave = () => {
    const activeSlots = availability.filter(slot => slot.active);
    onSave({
      work_days: selectedDays,
      shifts: selectedShifts,
      availability: activeSlots,
      max_hours_per_day: maxHoursPerDay,
      max_hours_per_week: maxHoursPerWeek
    });
  };

  const calculateTotalHours = () => {
    let totalMinutes = 0;
    availability.forEach(slot => {
      if (slot.active && slot.start_time && slot.end_time) {
        const start = new Date(`1970-01-01T${slot.start_time}`);
        const end = new Date(`1970-01-01T${slot.end_time}`);
        const diff = (end - start) / (1000 * 60);
        totalMinutes += diff;
      }
    });
    return (totalMinutes / 60).toFixed(2);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>Part-Time Schedule Setup</h3>
        
        <div className={styles.scheduleSection}>
          <div className={styles.sectionHeader}>
            <h4>Select Available Days</h4>
            <div className={styles.bulkActions}>
              <button type="button" onClick={() => handleSelectAll('days')} className={styles.bulkButton}>
                Select All
              </button>
              <button type="button" onClick={() => handleDeselectAll('days')} className={styles.bulkButton}>
                Deselect All
              </button>
            </div>
          </div>
          <div className={styles.daySelection}>
            {options.days.map(day => (
              <button
                key={day}
                type="button"
                className={`${styles.dayButton} ${selectedDays.includes(day) ? styles.selected : ''}`}
                onClick={() => handleDayToggle(day)}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.scheduleSection}>
          <div className={styles.sectionHeader}>
            <h4>Select Preferred Shifts</h4>
            <div className={styles.bulkActions}>
              <button type="button" onClick={() => handleSelectAll('shifts')} className={styles.bulkButton}>
                Select All
              </button>
              <button type="button" onClick={() => handleDeselectAll('shifts')} className={styles.bulkButton}>
                Deselect All
              </button>
            </div>
          </div>
          <div className={styles.shiftSelection}>
            {options.shifts.map(shift => (
              <button
                key={shift}
                type="button"
                className={`${styles.shiftButton} ${selectedShifts.includes(shift) ? styles.selected : ''}`}
                onClick={() => handleShiftToggle(shift)}
              >
                {shift.charAt(0).toUpperCase() + shift.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.scheduleSection}>
          <h4>Set Maximum Hours</h4>
          <div className={styles.hoursInput}>
            <div className={styles.hourInputGroup}>
              <label>Max Hours Per Day:</label>
              <input
                type="number"
                value={maxHoursPerDay}
                onChange={(e) => setMaxHoursPerDay(parseInt(e.target.value) || 0)}
                min="1"
                max="24"
                className={styles.numberInput}
              />
            </div>
            <div className={styles.hourInputGroup}>
              <label>Max Hours Per Week:</label>
              <input
                type="number"
                value={maxHoursPerWeek}
                onChange={(e) => setMaxHoursPerWeek(parseInt(e.target.value) || 0)}
                min="1"
                max="168"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.scheduleSection}>
          <div className={styles.sectionHeader}>
            <h4>Set Specific Times (Total: {calculateTotalHours()} hours)</h4>
            <p className={styles.helpText}>Check the boxes and set times for each day-shift combination</p>
          </div>
          <div className={styles.availabilityGrid}>
            {availability.map((slot, index) => (
              <div key={`${slot.day}-${slot.shift}`} className={`${styles.availabilitySlot} ${slot.active ? styles.active : ''}`}>
                <label className={styles.slotLabel}>
                  <input
                    type="checkbox"
                    checked={slot.active}
                    onChange={() => handleSlotToggle(slot.day, slot.shift)}
                    className={styles.slotCheckbox}
                  />
                  <span className={styles.slotText}>
                    {slot.day} - {slot.shift}
                  </span>
                </label>
                {slot.active && (
                  <div className={styles.timeInputs}>
                    <input
                      type="time"
                      value={slot.start_time}
                      onChange={(e) => handleTimeChange(slot.day, slot.shift, 'start_time', e.target.value)}
                      className={styles.timeInput}
                    />
                    <span className={styles.timeSeparator}>to</span>
                    <input
                      type="time"
                      value={slot.end_time}
                      onChange={(e) => handleTimeChange(slot.day, slot.shift, 'end_time', e.target.value)}
                      className={styles.timeInput}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalActions}>
          <button type="button" onClick={handleSave} className={styles.primaryButton}>
            Save Schedule
          </button>
          <button type="button" onClick={onClose} className={styles.secondaryButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffForm;