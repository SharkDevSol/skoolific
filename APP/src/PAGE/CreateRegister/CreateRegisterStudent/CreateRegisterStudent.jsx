import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import axios from 'axios';
import api from '../../../utils/api';
import * as XLSX from 'xlsx';
import Webcam from 'react-webcam';
import { useTranslation } from 'react-i18next';
import { getBranchCode } from '../../../utils/branchCode';
import styles from './CreateRegisterStudent.module.css';

import Card from '../../../COMPONENTS/Card/Card';
import Button from '../../../COMPONENTS/Button/Button';
import Input from '../../../COMPONENTS/Input/Input';
import Select from '../../../COMPONENTS/Select/Select';
import DatePicker from '../../../COMPONENTS/DatePicker/DatePicker';
import FileUpload from '../../../COMPONENTS/FileUpload/FileUpload';
import Checkbox from '../../../COMPONENTS/Checkbox/Checkbox';
import RadioGroup from '../../../COMPONENTS/Radio/RadioGroup';
import Textarea from '../../../COMPONENTS/Textarea/Textarea';
import { useToast } from '../../../COMPONENTS/Toast/useToast';
import ToastContainer from '../../../COMPONENTS/Toast/ToastContainer';

import {
  Camera,
  Copy,
  Download,
  FileSpreadsheet,
  Plus,
  Search,
  User,
  Users,
  X
} from 'lucide-react';

// API base URL - use environment variable or fallback to localhost
const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const AddStudentS = () => {
  const { t } = useTranslation();
  const toast = useToast();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    reset,
    clearErrors,
    trigger,
    getValues
  } = useForm({
    mode: 'onChange',
    defaultValues: {
      class: '',
      isGuardianExisting: 'no',
      student_name: '',
      smachine_id: '',
      age: '',
      gender: '',
      guardian_name: '',
      guardian_phone: '',
      guardian_relation: '',
      image_student: [],
      excel_file: []
    }
  });
  
  const isGuardianExisting = useWatch({ name: 'isGuardianExisting', control });
  const [showSuccess, setShowSuccess] = useState(false);
  const [pageError, setPageError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableClasses, setAvailableClasses] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [newCredentials, setNewCredentials] = useState(null);
  const [fetchedGuardian, setFetchedGuardian] = useState(null);
  const [guardianSearchError, setGuardianSearchError] = useState('');
  const [formStructure, setFormStructure] = useState({ customFields: [] });
  
  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState(null);
  const webcamRef = useRef(null);
  const excelInputRef = useRef(null);
  
  // Multi-select states
  const [multiSelectValues, setMultiSelectValues] = useState({});
  
  // V2 Enhancement: Task1 configuration state
  const [task1Config, setTask1Config] = useState(null);
  
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const genderOptions = useMemo(
    () => [
      { value: 'Male', label: t('students.registration.genderMale', 'Male') },
      { value: 'Female', label: t('students.registration.genderFemale', 'Female') }
    ],
    [t]
  );

  const classOptions = useMemo(
    () => availableClasses.map((cls) => ({ value: cls, label: cls })),
    [availableClasses]
  );

  const requiredMsg = useCallback(
    (fallback) => t('common.required', 'Required') || fallback,
    [t]
  );

  const formatDateForApi = (date) => {
    if (!date) return '';
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Fixed field type detection with proper array checking
  const getFieldType = (column) => {
    // Safely check if customFields exists and is an array
    const customFields = formStructure.customFields;
    if (customFields && Array.isArray(customFields)) {
      const customField = customFields.find(field => field && String(field.name).toLowerCase() === String(column.column_name).toLowerCase());
      if (customField && customField.type) {
        return customField.type;
      }
    }
    
    // Simple pattern matching based on column name
    const name = column.column_name.toLowerCase();
    
    if (name.includes('date') || name.includes('dob') || name.includes('birth')) return 'date';
    if (name.includes('number') || name.includes('age') || name.includes('count')) return 'number';
    if (name.includes('checkbox') || name.includes('bool') || name.includes('flag')) return 'checkbox';
    if (name.includes('textarea') || name.includes('description') || name.includes('bio')) return 'textarea';
    if (name.includes('multi') || name.includes('select') || name.includes('options')) return 'multi-select';
    if (name.includes('select') || name.includes('dropdown') || name.includes('choice')) return 'select';
    if (name.includes('upload') || name.includes('file') || name.includes('image') || name.includes('photo')) return 'upload';
    
    // Fallback to database type
    if (column.data_type === 'integer') return 'number';
    if (column.data_type === 'date') return 'date';
    if (column.data_type === 'boolean') return 'checkbox';
    if (column.data_type === 'text') return 'textarea';
    
    return 'text';
  };

  // Fixed field options with proper array checking
  const getFieldOptions = (column) => {
    const customFields = formStructure.customFields;
    if (customFields && Array.isArray(customFields)) {
      const customField = customFields.find(field => field && String(field.name).toLowerCase() === String(column.column_name).toLowerCase());
      if (customField && Array.isArray(customField.options)) {
        return customField.options;
      }
    }
    return ['Option 1', 'Option 2', 'Option 3'];
  };

  // Camera capture function
  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      if (cameraMode === 'image_student') {
        fetch(imageSrc)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setValue('image_student', [file], { shouldDirty: true, shouldValidate: true });
          });
      } else {
        fetch(imageSrc)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setValue(cameraMode, [file], { shouldDirty: true, shouldValidate: true });
          });
      }
      setShowCamera(false);
      setCameraMode(null);
    }
  }, [cameraMode, webcamRef, setValue]);

  // Camera component
  const CameraModal = () => (
    <div className={styles.cameraModal} role="dialog" aria-modal="true" aria-label={t('students.registration.cameraModalTitle', 'Take a photo')}>
      <div className={styles.cameraContent}>
        <div className={styles.cameraHeader}>
          <h3 className={styles.cameraTitle}>{t('students.registration.cameraModalTitle', 'Take a photo')}</h3>
          <button
            type="button"
            onClick={() => {
              setShowCamera(false);
              setCameraMode(null);
            }}
            className={styles.closeCamera}
            aria-label={t('common.close', 'Close')}
          >
            <X size={18} />
          </button>
        </div>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className={styles.webcam}
          videoConstraints={{
            width: 1280,
            height: 720,
            facingMode: 'user'
          }}
        />
        <div className={styles.cameraControls}>
          <Button type="button" onClick={capture} icon={<Camera size={18} />} disabled={isLoading}>
            {t('students.registration.capturePhoto', 'Capture photo')}
          </Button>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    setIsLoading(true);
    api.get(`/students/classes`, { timeout: 10000 })
      .then(response => {
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          setAvailableClasses(response.data);
          if (response.data[0]) {
            setSelectedClass(response.data[0]);
            setValue('class', response.data[0]);
            fetchColumns(response.data[0]);
          }
        } else {
          setPageError(t('students.registration.noFormStructure', 'No form structure exists. Please create it first in the Form Builder.'));
        }
      })
      .catch(error => {
        console.error('Error fetching classes:', error);
        setPageError(t('students.registration.failedToFetchClasses', 'Failed to fetch classes') + `: ${error.message}`);
      })
      .finally(() => setIsLoading(false));

    // Fetch form structure with custom field metadata
    api.get(`/students/form-structure`, { timeout: 10000 })
      .then(response => {
        // Ensure we have a valid structure with arrays
        const data = response.data || {};
        setFormStructure({
          classes: Array.isArray(data.classes) ? data.classes : [],
          customFields: Array.isArray(data.customFields) ? data.customFields : []
        });
      })
      .catch(error => {
        console.error('Error fetching form structure:', error);
        // Set empty structure on error
        setFormStructure({ classes: [], customFields: [] });
      });
      
    // V2 Enhancement: Fetch Task1 configuration
    api.get(`/schedule/config`)
      .then(response => {
        if (response.data) {
          setTask1Config(response.data);
          console.log('Task1 Config loaded:', response.data);
        }
      })
      .catch(error => {
        console.error('Error fetching Task1 config:', error);
        // Set default config if fetch fails
        setTask1Config({
          has_kg: false
        });
      });
  }, [setValue]);

  // Initialize multi-select values when columns change
  useEffect(() => {
    const multiSelectColumns = tableColumns.filter(col => getFieldType(col) === 'multi-select');
    const initialValues = {};
    multiSelectColumns.forEach(col => {
      initialValues[col.column_name] = [];
    });
    setMultiSelectValues(initialValues);
  }, [tableColumns, formStructure]);

  useEffect(() => {
    if (isGuardianExisting === 'yes') {
      setFetchedGuardian(null);
      setGuardianSearchError('');
      setValue('guardian_name', '');
      setValue('guardian_phone', '');
      setValue('guardian_relation', '');
      clearErrors(['guardian_name', 'guardian_phone', 'guardian_relation']);
    } else {
      setFetchedGuardian(null);
      setGuardianSearchError('');
      setValue('guardian_phone', '');
      setValue('guardian_relation', '');
      clearErrors(['guardian_phone', 'guardian_relation']);
    }
  }, [isGuardianExisting, setValue, clearErrors]);

  const fetchColumns = async (className) => {
    if (!className) return;
    setIsLoading(true);
    try {
      const response = await api.get(`/students/columns/${className}`, { timeout: 10000 });
      if (response.data && Array.isArray(response.data)) {
        setTableColumns(response.data.filter(col => !['username', 'password', 'guardian_username', 'guardian_password'].includes(col.column_name)));
      } else {
        setTableColumns([]);
      }
    } catch (error) {
      console.error('Error fetching columns:', error);
      setPageError(t('students.registration.failedToFetchColumns', 'Failed to fetch columns') + `: ${error.message}`);
      setTableColumns([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardianSearch = async (phone) => {
    if (!phone.trim()) {
      setFetchedGuardian(null);
      setGuardianSearchError('');
      setValue('guardian_name', '');
      setValue('guardian_relation', '');
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await api.get(`/students/search-guardian/${encodeURIComponent(phone)}`, { timeout: 10000 });
      setFetchedGuardian({
        name: response.data.guardian_name,
        phone,
        username: response.data.guardian_username,
        password: response.data.guardian_password
      });
      setValue('guardian_name', response.data.guardian_name);
      setValue('guardian_phone', phone);
      setGuardianSearchError('');
      clearErrors(['guardian_phone', 'guardian_name']);
      
      // If guardian exists but user selected "New Guardian", show warning
      if (isGuardianExisting === 'no') {
        setGuardianSearchError(t('students.registration.guardianAlreadyRegistered', 'This phone number is already registered. Please select "Existing Guardian" or use a different phone number.'));
      }
    } catch (error) {
      console.error('Guardian search error:', error);
      setFetchedGuardian(null);
      setValue('guardian_phone', phone);
      
      if (error.response?.status === 404) {
        // Guardian not found - this is normal for new guardians
        if (isGuardianExisting === 'yes') {
          setGuardianSearchError(t('students.registration.guardianNotFound', 'No guardian found with this phone number. Please verify the number or register as a new guardian.'));
        } else {
          // For new guardians, no error - this is expected
          setGuardianSearchError('');
          setValue('guardian_name', '');
        }
      } else {
        // Other errors
        setGuardianSearchError(t('students.registration.guardianSearchFailed', 'Failed to search guardian') + `: ${error.response?.data?.error || error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMultiSelectChange = (fieldName, value, checked) => {
    setMultiSelectValues(prev => {
      const currentValues = prev[fieldName] || [];
      let newValues;
      if (checked) {
        newValues = [...currentValues, value];
      } else {
        newValues = currentValues.filter(item => item !== value);
      }
      
      setValue(fieldName, newValues.join(','));
      
      return {
        ...prev,
        [fieldName]: newValues
      };
    });
  };

  const handleClassChange = (className) => {
    setSelectedClass(className);
    setValue('class', className);
    fetchColumns(className);
  };

  const handleDownload = async () => {
    if (!selectedClass) return;
    try {
      // Exclude: id, school_id, class_id, image_student, username, password, guardian_username, guardian_password
      const excludedFields = ['id', 'school_id', 'class_id', 'image_student', 'username', 'password', 'guardian_username', 'guardian_password'];
      const columns = tableColumns
        .filter(col => !excludedFields.includes(col.column_name))
        .map(col => col.column_name);
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([columns]);
      XLSX.utils.book_append_sheet(wb, ws, selectedClass);
      XLSX.writeFile(wb, `${selectedClass}_template.xlsx`);
    } catch (error) {
      setPageError(t('students.registration.failedToDownloadTemplate', 'Failed to download template') + `: ${error.message}`);
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!selectedClass) {
      setPageError(t('students.registration.selectClassFirst', 'Please select a class first'));
      return;
    }
    
    setIsLoading(true);
    setPageError('');
    
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);
          
          if (data.length === 0) {
            setPageError(t('students.registration.excelEmpty', 'Excel file is empty'));
            setIsLoading(false);
            return;
          }
          
          // Send data to backend for bulk import
          const response = await api.post(`/students/bulk-import`, {
            className: selectedClass,
            students: data
          }, { timeout: 30000 });
          
          setShowSuccess(true);
          setPageError('');
          
          // Build detailed message
          let message = `Successfully imported ${response.data.successCount} students`;
          
          // Show class summary
          if (response.data.classSummary) {
            message += '\n\nStudents added by class:';
            Object.entries(response.data.classSummary).forEach(([cls, count]) => {
              message += `\n- ${cls}: ${count} students`;
            });
          }
          
          if (response.data.failedCount > 0) {
            message += `\n\nFailed to import ${response.data.failedCount} students.`;
            if (response.data.errors && response.data.errors.length > 0) {
              message += '\n\nErrors:\n';
              response.data.errors.slice(0, 5).forEach(err => {
                message += `Row ${err.row}${err.class ? ` (Class: ${err.class})` : ''}: ${err.error}\n`;
              });
              if (response.data.errors.length > 5) {
                message += `... and ${response.data.errors.length - 5} more errors`;
              }
            }
          }
          
          toast.success(message);
          
          // Reset file input
          e.target.value = '';
        } catch (error) {
          console.error('Error processing Excel file:', error);
          setPageError(t('students.registration.failedToProcessExcel', 'Failed to process Excel file') + `: ${error.response?.data?.error || error.message}`);
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      setPageError(t('students.registration.failedToReadExcel', 'Failed to read Excel file') + `: ${error.message}`);
      setIsLoading(false);
    }
  };

  const onSubmit = async (data) => {
    const isValid = await trigger();
    if (!isValid) {
      toast.error(t('students.registration.fixValidationErrors', 'Please fix the validation errors before submitting.'));
      return;
    }

    // Explicit guard: never submit without a class
    if (!data.class) {
      toast.error(t('students.registration.classRequired', 'Class is required'));
      setCurrentStep(1);
      return;
    }

    setIsLoading(true);
    setPageError('');
    setShowSuccess(false);
    try {
      const formData = new FormData();
      
      Object.entries(data).forEach(([key, value]) => {
        if (value === null || value === undefined) return;

        // FileUpload values come as File[]
        if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
          formData.append(key, value[0]);
          return;
        }

        if (value instanceof Date) {
          const formatted = formatDateForApi(value);
          if (formatted) formData.append(key, formatted);
          return;
        }

        formData.append(key, value.toString());
      });

      const branchCode = getBranchCode();
      const response = await api.post(`/students/add-student`, formData, {
        headers: { 'X-Branch-Code': branchCode, 'Content-Type': 'multipart/form-data' },
        timeout: 10000
      });
      
      // Check if the response indicates an error
      if (response.data.error) {
        throw new Error(response.data.message || response.data.error);
      }
      
      setNewCredentials({
        student_username: response.data.student_username,
        student_password: response.data.student_password,
        guardian_username: response.data.guardian_username,
        guardian_password: response.data.guardian_password
      });
      setShowSuccess(true);
      toast.success(t('students.registration.studentAdded', 'Student added successfully!'));
      reset();
      setFetchedGuardian(null);
      setMultiSelectValues({});
      // Return to step 1 and re-select the first class for a fresh registration
      setCurrentStep(1);
      if (availableClasses.length > 0) {
        setSelectedClass(availableClasses[0]);
        setValue('class', availableClasses[0]);
        fetchColumns(availableClasses[0]);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      console.error('Registration error:', err);
      setPageError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success(t('students.registration.copied', 'Copied'));
  };

  // Multi-step navigation functions
  const handleNextStep = async () => {
    let fieldsToValidate = [];
    
    // Define fields for each step
    switch (currentStep) {
      case 1: // Student Information
        fieldsToValidate = ['class', 'student_name', 'smachine_id', 'age', 'gender'];
        break;
      case 2: // Guardian Information
        fieldsToValidate = ['isGuardianExisting', 'guardian_phone', 'guardian_name', 'guardian_relation'];
        break;
      case 3: // Custom Fields
        // Validate all custom fields (non-nullable) PLUS old_or_new / student_type (always required)
        fieldsToValidate = tableColumns
          .filter(col => !['id', 'school_id', 'class_id', 'image_student', 'student_name', 'smachine_id', 'age', 'gender', 'class', 'guardian_name', 'guardian_phone', 'guardian_relation', 'username', 'password', 'guardian_username', 'guardian_password', 'is_active', 'is_free', 'exemption_type', 'exemption_reason', 'phone'].includes(col.column_name))
          .filter(col => col.is_nullable === 'NO' || ['old_or_new', 'student_type'].includes(String(col.column_name).toLowerCase()))
          .map(col => col.column_name);
        break;
      default:
        break;
    }
    
    // Validate current step fields
    const isValid = await trigger(fieldsToValidate);
    
    if (!isValid) {
      toast.error(t('students.registration.fixValidationErrors', 'Please fix the validation errors before continuing.'));
      return;
    }

    // On step 1, check that the student machine ID is not already used by another student
    if (currentStep === 1) {
      const mid = String(getValues('smachine_id') || '').trim();
      if (mid) {
        try {
          const resp = await api.get(`/student-list/check-machine-id/${encodeURIComponent(mid)}`, { timeout: 10000 });
          if (resp.data && resp.data.exists) {
            toast.error(
              t('students.registration.machineIdExists', 'This Machine ID is already used') +
              (resp.data.student_name ? ` — "${resp.data.student_name}"${resp.data.class_name ? ` in ${resp.data.class_name}` : ''}` : '')
            );
            return;
          }
        } catch (e) {
          console.warn('Machine ID check failed (continuing):', e?.message);
        }
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handlePreviousStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const getStepTitle = (step) => {
    switch (step) {
      case 1:
        return t('students.registration.step1Title', 'Student Information');
      case 2:
        return t('students.registration.step2Title', 'Guardian Information');
      case 3:
        return t('students.registration.step3Title', 'Additional Information');
      case 4:
        return t('students.registration.step4Title', 'Review & Submit');
      default:
        return '';
    }
  };

  // Render multi-select field
  const renderMultiSelectField = (column) => {
    const options = getFieldOptions(column);
    const currentValues = multiSelectValues[column.column_name] || [];

    return (
      <div className={styles.multiSelectContainer}>
        <div className={styles.multiSelectLabel}>{t('students.registration.selectOptions', 'Select options')}</div>
        <div className={styles.multiSelectOptions}>
          {options.map((option, index) => (
            <Checkbox
              key={`${column.column_name}-option-${index}`}
              label={option}
              checked={currentValues.includes(option)}
              onChange={(checked) => handleMultiSelectChange(column.column_name, option, checked)}
              disabled={isLoading}
              className={styles.multiSelectCheckbox}
            />
          ))}
        </div>
        {errors[column.column_name] && (
          <span className={styles.errorMessage}>{errors[column.column_name].message}</span>
        )}
      </div>
    );
  };

  // Render select dropdown field (custom fields)
  const renderSelectField = (column, validationRules) => {
    const options = getFieldOptions(column);

    return (
      <Controller
        name={column.column_name}
        control={control}
        rules={validationRules}
        render={({ field }) => (
          <Select
            label={null}
            options={[
              { value: '', label: t('common.select', 'Select') + ` ${column.column_name.replace(/_/g, ' ')}` },
              ...options.map((o) => ({ value: o, label: o }))
            ]}
            value={field.value || ''}
            onChange={(v) => field.onChange(v)}
            disabled={isLoading}
            error={errors[column.column_name]?.message}
          />
        )}
      />
    );
  };

  // Render upload field
  const renderUploadField = (column, isRequired) => {
    return (
      <Controller
        name={column.column_name}
        control={control}
        rules={isRequired ? { required: `${column.column_name.replace(/_/g, ' ')} ${t('common.required', 'Required')}` } : {}}
        render={({ field }) => (
          <div className={styles.formField}>
            <FileUpload
              label={column.column_name.replace(/_/g, ' ')}
              accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx,.txt"
              multiple={false}
              value={field.value || []}
              onChange={(files) => field.onChange(files)}
              disabled={isLoading}
              error={errors[column.column_name]?.message}
              onError={(msg) => toast.error(msg)}
            />
            {column.column_name === 'image_student' && (
              <div className={styles.inlineActions}>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  icon={<Camera size={16} />}
                  onClick={() => {
                    setCameraMode(column.column_name);
                    setShowCamera(true);
                  }}
                  disabled={isLoading}
                >
                  {t('students.registration.takePhoto', 'Take photo')}
                </Button>
              </div>
            )}
          </div>
        )}
      />
    );
  };

  // Render custom field based on type
  const renderCustomField = (column) => {
    // "old_or_new" (student type: Old/New) is always required regardless of DB nullability
    const isAlwaysRequired = ['old_or_new', 'student_type'].includes(String(column.column_name).toLowerCase());
    const isRequired = isAlwaysRequired || column.is_nullable === 'NO';
    const validationRules = isRequired ? { required: `${column.column_name.replace(/_/g, ' ')} ${t('common.required', 'Required')}` } : {};
    const fieldType = getFieldType(column);

    // Handle upload field separately
    if (fieldType === 'upload') {
      return renderUploadField(column, isRequired);
    }

    return (
      <div key={column.column_name} className={styles.formGroup}>
        <div className={styles.fieldLabel}>
          {column.column_name.replace(/_/g, ' ')}
          {isRequired ? <span className={styles.required}>*</span> : null}
        </div>
        
        {fieldType === 'multi-select' ? (
          renderMultiSelectField(column)
        ) : fieldType === 'select' || fieldType === 'option' || fieldType === 'radio' ? (
          renderSelectField(column, validationRules)
        ) : fieldType === 'checkbox' ? (
          <Controller
            name={column.column_name}
            control={control}
            render={({ field }) => (
              <Checkbox
                label={column.column_name.replace(/_/g, ' ')}
                checked={!!field.value}
                onChange={(checked) => field.onChange(checked)}
                disabled={isLoading}
                error={errors[column.column_name]?.message}
              />
            )}
          />
        ) : fieldType === 'textarea' ? (
          <Controller
            name={column.column_name}
            control={control}
            rules={{
              ...validationRules,
              minLength: { value: 2, message: t('students.registration.minLength2', 'Must be at least 2 characters') }
            }}
            render={({ field }) => (
              <Textarea
                ref={field.ref}
                value={field.value || ''}
                onChange={(val) => field.onChange(val)}
                disabled={isLoading}
                placeholder={column.column_name.replace(/_/g, ' ')}
                rows={4}
                error={errors[column.column_name]?.message}
              />
            )}
          />
        ) : fieldType === 'date' ? (
          <Controller
            name={column.column_name}
            control={control}
            rules={validationRules}
            render={({ field }) => (
              <DatePicker
                label={null}
                value={field.value || null}
                onChange={(d) => field.onChange(d)}
                disabled={isLoading}
                error={errors[column.column_name]?.message}
                placeholder={t('common.date', 'Date')}
              />
            )}
          />
        ) : fieldType === 'number' ? (
          <Controller
            name={column.column_name}
            control={control}
            rules={{
              ...validationRules,
              validate: {
                validNumber: (value) => !value || !Number.isNaN(Number(value)) || t('students.registration.mustBeNumber', 'Must be a valid number')
              }
            }}
            render={({ field }) => (
              <Input
                type="number"
                label={null}
                value={field.value ?? ''}
                onChange={(v) => field.onChange(v)}
                disabled={isLoading}
                error={errors[column.column_name]?.message}
                placeholder={column.column_name.replace(/_/g, ' ')}
              />
            )}
          />
        ) : (
          <Controller
            name={column.column_name}
            control={control}
            rules={{
              ...validationRules,
              minLength: { value: 2, message: t('students.registration.minLength2', 'Must be at least 2 characters') }
            }}
            render={({ field }) => (
              <Input
                type="text"
                label={null}
                value={field.value ?? ''}
                onChange={(v) => field.onChange(v)}
                disabled={isLoading}
                error={errors[column.column_name]?.message}
                placeholder={column.column_name.replace(/_/g, ' ')}
              />
            )}
          />
        )}
        {errors[column.column_name] && (
          <span className={styles.errorMessage}>{errors[column.column_name].message}</span>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} position={toast.position} />
      {showCamera && <CameraModal />}

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>{t('students.registration.title', 'Student Registration')}</h1>
            <p className={styles.pageSubtitle}>{t('students.registration.subtitle', 'Register a new student and link to a guardian account')}</p>
          </div>
          <div className={styles.headerActions}>
            {availableClasses.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Download size={18} />}
                  onClick={handleDownload}
                  disabled={isLoading}
                >
                  {t('common.download', 'Download')}
                </Button>
                <label className={styles.excelUploadLabel}>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    ref={excelInputRef}
                    onChange={handleExcelUpload}
                    className={styles.hiddenFileInput}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<FileSpreadsheet size={18} />}
                    disabled={isLoading}
                    onClick={() => excelInputRef.current?.click()}
                  >
                    {t('common.upload', 'Upload')} Excel
                  </Button>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Multi-step Progress Indicator */}
        <div className={styles.stepIndicator}>
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`${styles.stepItem} ${currentStep === step ? styles.stepActive : ''} ${currentStep > step ? styles.stepCompleted : ''}`}
            >
              <div className={styles.stepNumber}>{step}</div>
              <div className={styles.stepLabel}>{getStepTitle(step)}</div>
            </div>
          ))}
        </div>

        {showSuccess && newCredentials && (
          <Card title={t('students.registration.credentialsTitle', 'New credentials')} className={styles.credentialsCard}>
            <div className={styles.credentialsGrid}>
              <div className={styles.credentialItem}>
                <div className={styles.credentialLabel}>{t('students.registration.studentUsername', 'Student username')}</div>
                <div className={styles.credentialValue}>
                  <span>{newCredentials.student_username}</span>
                  <button type="button" className={styles.copyBtn} onClick={() => handleCopy(newCredentials.student_username)} aria-label={t('students.registration.copy', 'Copy')}>
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className={styles.credentialItem}>
                <div className={styles.credentialLabel}>{t('students.registration.studentPassword', 'Student password')}</div>
                <div className={styles.credentialValue}>
                  <span>{newCredentials.student_password}</span>
                  <button type="button" className={styles.copyBtn} onClick={() => handleCopy(newCredentials.student_password)} aria-label={t('students.registration.copy', 'Copy')}>
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className={styles.credentialItem}>
                <div className={styles.credentialLabel}>{t('students.registration.guardianUsername', 'Guardian username')}</div>
                <div className={styles.credentialValue}>
                  <span>{newCredentials.guardian_username}</span>
                  <button type="button" className={styles.copyBtn} onClick={() => handleCopy(newCredentials.guardian_username)} aria-label={t('students.registration.copy', 'Copy')}>
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className={styles.credentialItem}>
                <div className={styles.credentialLabel}>{t('students.registration.guardianPassword', 'Guardian password')}</div>
                <div className={styles.credentialValue}>
                  <span>{newCredentials.guardian_password}</span>
                  <button type="button" className={styles.copyBtn} onClick={() => handleCopy(newCredentials.guardian_password)} aria-label={t('students.registration.copy', 'Copy')}>
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {pageError && (
          <div className={styles.pageError} role="alert">
            {pageError}
          </div>
        )}

        {/* Step 1: Student Information */}
        {currentStep === 1 && (
          <Card
            title={t('students.registration.studentInfo', 'Student information')}
            subtitle={t('students.registration.studentInfoSubtitle', 'Basic student details')}
            className={styles.card}
          >
            <div className={styles.cardBody}>
              <Controller
                name="class"
                control={control}
                rules={{ required: t('students.registration.classRequired', 'Class is required') }}
                render={({ field }) => (
                  <Select
                    label={t('students.class', 'Class')}
                    options={classOptions}
                    value={field.value || ''}
                    onChange={(v) => {
                      field.onChange(v);
                      handleClassChange(v);
                    }}
                    placeholder={t('students.registration.selectClass', 'Select class')}
                    required
                    disabled={isLoading || availableClasses.length === 0}
                    error={errors.class?.message}
                  />
                )}
              />

              <Controller
                name="student_name"
                control={control}
                rules={{
                  required: t('students.registration.studentNameRequired', 'Student name is required'),
                  minLength: { value: 2, message: t('students.registration.minLength2', 'Must be at least 2 characters') }
                }}
                render={({ field }) => (
                  <Input
                    label={t('students.registration.studentName', 'Student name')}
                    placeholder={t('students.registration.studentNamePlaceholder', "Enter student's full name")}
                    value={field.value || ''}
                    onChange={(v) => field.onChange(v)}
                    required
                    disabled={isLoading}
                    error={errors.student_name?.message}
                  />
                )}
              />

              <Controller
                name="smachine_id"
                control={control}
                rules={{
                  required: t('students.registration.machineIdRequired', 'Student Machine ID is required'),
                  pattern: { value: /^[0-9]+$/, message: t('students.registration.machineIdNumbersOnly', 'Machine ID must contain only numbers') },
                  minLength: { value: 3, message: t('students.registration.machineIdMin', 'Machine ID must be at least 3 digits') },
                  maxLength: { value: 10, message: t('students.registration.machineIdMax', 'Machine ID must be at most 10 digits') }
                }}
                render={({ field }) => (
                  <Input
                    label={t('students.registration.machineId', 'Student Machine ID')}
                    placeholder={t('students.registration.machineIdPlaceholder', 'Enter machine ID (e.g., 1001)')}
                    value={field.value || ''}
                    onChange={(v) => field.onChange(v)}
                    required
                    disabled={isLoading}
                    error={errors.smachine_id?.message}
                    helperText={t('students.registration.machineIdHelper', 'Recommended: 1000–9999 for students (4 digits)')}
                  />
                )}
              />

              <div className={styles.row2}>
                <Controller
                  name="age"
                  control={control}
                  rules={{
                    required: t('students.registration.ageRequired', 'Age is required'),
                    min: { value: 3, message: t('students.registration.ageMin', 'Age must be at least 3') },
                    max: { value: 100, message: t('students.registration.ageMax', 'Age must be less than 100') }
                  }}
                  render={({ field }) => (
                    <Input
                      type="number"
                      label={t('students.registration.age', 'Age')}
                      placeholder={t('students.registration.agePlaceholder', 'Enter age')}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v)}
                      required
                      disabled={isLoading}
                      error={errors.age?.message}
                    />
                  )}
                />

                <Controller
                  name="gender"
                  control={control}
                  rules={{ required: t('students.registration.genderRequired', 'Gender is required') }}
                  render={({ field }) => (
                    <Select
                      label={t('students.gender', 'Gender')}
                      options={genderOptions}
                      value={field.value || ''}
                      onChange={(v) => field.onChange(v)}
                      placeholder={t('students.registration.selectGender', 'Select gender')}
                      required
                      disabled={isLoading}
                      error={errors.gender?.message}
                    />
                  )}
                />
              </div>

              {task1Config?.has_kg && (
                <div className={styles.studentType}>
                  <div className={styles.studentTypeTitle}>{t('students.registration.studentType', 'Student type')}</div>
                  <div className={styles.studentTypeOptions}>
                    <Controller
                      name="is_kg"
                      control={control}
                      render={({ field }) => (
                        <Checkbox
                          label={t('students.registration.isKg', 'Kindergarten (KG) student')}
                          checked={!!field.value}
                          onChange={(checked) => field.onChange(checked)}
                          disabled={isLoading}
                        />
                      )}
                    />
                  </div>
                </div>
              )}

              <div className={styles.formField}>
                {renderUploadField({ column_name: 'image_student' }, false)}
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Guardian Information */}
        {currentStep === 2 && (
          <Card
            title={t('students.registration.guardianInfo', 'Guardian information')}
            subtitle={t('students.registration.guardianInfoSubtitle', 'Create or link an existing guardian')}
            className={styles.card}
          >
            <div className={styles.cardBody}>
              <Controller
                name="isGuardianExisting"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    name="isGuardianExisting"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    options={[
                      { value: 'no', label: t('students.registration.newGuardian', 'New guardian') },
                      { value: 'yes', label: t('students.registration.existingGuardian', 'Existing guardian') }
                    ]}
                    disabled={isLoading}
                  />
                )}
              />

              <Controller
                name="guardian_phone"
                control={control}
                rules={{
                  required: t('students.registration.guardianPhoneRequired', 'Guardian phone is required'),
                  pattern: { value: /^[0-9+\-\s()]{10,}$/, message: t('students.registration.guardianPhoneInvalid', 'Please enter a valid phone number') }
                }}
                render={({ field }) => (
                  <Input
                    label={t('students.registration.guardianPhone', 'Guardian phone')}
                    placeholder={t('students.registration.guardianPhonePlaceholder', "Enter guardian's phone number")}
                    value={field.value || ''}
                    onChange={(v) => field.onChange(v)}
                    required
                    disabled={isLoading || (isGuardianExisting === 'yes' && !!fetchedGuardian)}
                    error={errors.guardian_phone?.message || guardianSearchError}
                    suffixIcon={<Search size={18} />}
                    onBlur={() => handleGuardianSearch(getValues('guardian_phone') || '')}
                  />
                )}
              />

              {fetchedGuardian && isGuardianExisting === 'yes' && (
                <div className={styles.helperSuccess}>
                  {t('students.registration.guardianFound', 'Guardian found')}: {fetchedGuardian.name}
                </div>
              )}

              <Controller
                name="guardian_name"
                control={control}
                rules={{
                  required: t('students.registration.guardianNameRequired', 'Guardian name is required'),
                  minLength: { value: 2, message: t('students.registration.minLength2', 'Must be at least 2 characters') }
                }}
                render={({ field }) => (
                  <Input
                    label={t('students.registration.guardianName', 'Guardian name')}
                    placeholder={t('students.registration.guardianNamePlaceholder', "Enter guardian's full name")}
                    value={field.value || ''}
                    onChange={(v) => field.onChange(v)}
                    required
                    disabled={isLoading || (isGuardianExisting === 'yes' && !!fetchedGuardian)}
                    error={errors.guardian_name?.message}
                  />
                )}
              />

              <Controller
                name="guardian_relation"
                control={control}
                rules={{
                  required: t('students.registration.guardianRelationRequired', 'Guardian relation is required'),
                  minLength: { value: 2, message: t('students.registration.minLength2', 'Must be at least 2 characters') }
                }}
                render={({ field }) => (
                  <Input
                    label={t('students.registration.guardianRelation', 'Guardian relation')}
                    placeholder={t('students.registration.guardianRelationPlaceholder', 'e.g., Father, Mother, Guardian')}
                    value={field.value || ''}
                    onChange={(v) => field.onChange(v)}
                    required
                    disabled={isLoading}
                    error={errors.guardian_relation?.message}
                  />
                )}
              />
            </div>
          </Card>
        )}

        {/* Step 3: Custom Fields */}
        {currentStep === 3 && (
          <Card
            title={t('students.registration.customFields', 'Custom fields')}
            subtitle={t('students.registration.customFieldsSubtitle', 'Additional fields from your form builder')}
            className={styles.customFieldsCard}
          >
            <div className={styles.customFieldsGrid}>
              {tableColumns
                .filter(col => !['id', 'school_id', 'class_id', 'image_student', 'student_name', 'smachine_id', 'age', 'gender', 'class', 'guardian_name', 'guardian_phone', 'guardian_relation', 'username', 'password', 'guardian_username', 'guardian_password', 'is_active', 'is_free', 'exemption_type', 'exemption_reason'].includes(col.column_name))
                .map(column => renderCustomField(column))}
            </div>
          </Card>
        )}

        {/* Step 4: Review & Submit */}
        {currentStep === 4 && (
          <div className={styles.reviewSection}>
            <Card
              title={t('students.registration.reviewTitle', 'Review your information')}
              subtitle={t('students.registration.reviewSubtitle', 'Please review all information before submitting')}
            >
              <div className={styles.reviewGrid}>
                <div className={styles.reviewSection}>
                  <h3 className={styles.reviewSectionTitle}>{t('students.registration.studentInfo', 'Student information')}</h3>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.class', 'Class')}:</span>
                    <span className={styles.reviewValue}>{getValues('class')}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.registration.studentName', 'Student name')}:</span>
                    <span className={styles.reviewValue}>{getValues('student_name')}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.registration.machineId', 'Machine ID')}:</span>
                    <span className={styles.reviewValue}>{getValues('smachine_id')}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.registration.age', 'Age')}:</span>
                    <span className={styles.reviewValue}>{getValues('age')}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.gender', 'Gender')}:</span>
                    <span className={styles.reviewValue}>{getValues('gender')}</span>
                  </div>
                </div>

                <div className={styles.reviewSection}>
                  <h3 className={styles.reviewSectionTitle}>{t('students.registration.guardianInfo', 'Guardian information')}</h3>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.registration.guardianPhone', 'Guardian phone')}:</span>
                    <span className={styles.reviewValue}>{getValues('guardian_phone')}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.registration.guardianName', 'Guardian name')}:</span>
                    <span className={styles.reviewValue}>{getValues('guardian_name')}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>{t('students.registration.guardianRelation', 'Guardian relation')}:</span>
                    <span className={styles.reviewValue}>{getValues('guardian_relation')}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        <div className={styles.footerBar}>
          <div className={styles.footerLeft}>
            {currentStep > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={handlePreviousStep}
                disabled={isLoading}
              >
                {t('common.previous', 'Previous')}
              </Button>
            )}
          </div>
          <div className={styles.footerRight}>
            {currentStep < totalSteps ? (
              <Button
                type="button"
                variant="primary"
                onClick={handleNextStep}
                disabled={isLoading}
              >
                {t('common.next', 'Next')}
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                icon={<Plus size={18} />}
                loading={isSubmitting || isLoading}
                disabled={isLoading || (isGuardianExisting === 'yes' && !fetchedGuardian)}
              >
                {t('students.addStudent', 'Add Student')}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default AddStudentS;