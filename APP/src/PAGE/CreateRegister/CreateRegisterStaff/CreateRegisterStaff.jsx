// CreateRegisterStaff.jsx - V2 Staff Registration
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  UserPlus,
  Users,
  FolderOpen,
  ClipboardList,
  Briefcase,
  Shield,
  BookOpen,
  Plus,
  Trash2,
  X,
  DollarSign
} from 'lucide-react';
import styles from './CreateRegisterStaff.module.css';

import Card from '../../../COMPONENTS/Card/Card';
import Button from '../../../COMPONENTS/Button/Button';
import Modal from '../../../COMPONENTS/Modal/Modal';
import StatCard from '../../../COMPONENTS/StatCard/StatCard';
import { useToast } from '../../../COMPONENTS/Toast/useToast';
import ToastContainer from '../../../COMPONENTS/Toast/ToastContainer';
import StaffForm from './StaffForm';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const STAFF_TYPES = [
  { id: 'Supportive Staff', labelKey: 'supportive', icon: Briefcase },
  { id: 'Administrative Staff', labelKey: 'administrative', icon: Shield },
  { id: 'Teachers', labelKey: 'teacher', icon: BookOpen },
  { id: 'Finance', labelKey: 'finance', icon: DollarSign }
];

const CreateRegisterStaff = () => {
  const { t } = useTranslation();
  const toast = useToast();

  const [staffType, setStaffType] = useState('');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedForm, setSelectedForm] = useState(null);
  const [staffData, setStaffData] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const staffTypes = useMemo(
    () =>
      STAFF_TYPES.map((type) => ({
        ...type,
        label: t(`staff.registration.types.${type.labelKey}`, type.id),
        description: t(`staff.registration.types.${type.labelKey}Desc`, '')
      })),
    [t]
  );

  useEffect(() => {
    if (staffType) {
      fetchClasses();
    }
  }, [staffType]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`
      );
      setClasses(response.data || []);
    } catch (error) {
      toast.error(
        t('staff.registration.fetchFormsError', 'Failed to load registration forms') +
          `: ${error.response?.data?.error || error.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async (type, className) => {
    setStaffLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/staff/data/${encodeURIComponent(type)}/${encodeURIComponent(className)}`);
      setStaffData(res.data?.data || []);
    } catch (error) {
      setStaffData([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const handleStaffTypeChange = (type) => {
    setStaffType(type);
    setSelectedClass(null);
    setSelectedForm(null);
    setClasses([]);
    setStaffData([]);
  };

  const handleDelete = async (cls, e) => {
    e.stopPropagation();
    if (!window.confirm(t('staff.registration.confirmDeleteForm', 'Delete this registration form?'))) {
      return;
    }

    setLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/staff/delete-form`, {
        data: { staffType, className: cls }
      });
      toast.success(t('staff.registration.formDeleted', 'Form deleted successfully'));
      fetchClasses();
    } catch (error) {
      toast.error(
        t('staff.registration.deleteFormError', 'Failed to delete form') +
          `: ${error.response?.data?.error || error.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFormSuccess = useCallback(
    (responseData) => {
      if (responseData?.teacherData) {
        toast.success(
          t('staff.registration.teacherAdded', '{{name}} added as {{workTime}} teacher', {
            name: responseData.teacherData.name,
            workTime: responseData.teacherData.workTime
          })
        );
      } else if (responseData?.schoolSchemaError) {
        toast.warning(
          t('staff.registration.partialSuccess', 'Staff added but teacher table update failed')
        );
      } else {
        toast.success(t('staff.registration.staffAdded', 'Staff member added successfully'));
      }
      setSelectedClass(null);
      if (selectedForm) fetchStaff(staffType, selectedForm);
    },
    [t, toast, staffType, selectedForm]
  );

  const handleDeleteStaff = async (staffId, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/staff/delete-staff`, {
        data: { globalStaffId: staffId, staffType, className: selectedForm }
      });
      toast.success(`"${name}" deleted successfully`);
      fetchStaff(staffType, selectedForm);
    } catch (error) {
      toast.error(`Delete failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleToggleActive = async (staffId, name, currentStatus) => {
    try {
      const res = await axios.put(`${API_BASE_URL}/staff/toggle-active/${staffId}`);
      const activated = res.data.isActive;
      toast.success(`"${name}" ${activated ? 'activated' : 'deactivated'}`);
      fetchStaff(staffType, selectedForm);
    } catch (error) {
      toast.error(`Toggle failed: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <ToastContainer />

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            {t('staff.registration.title', 'Staff Registration')}
          </h1>
          <p className={styles.pageSubtitle}>
            {t('staff.registration.subtitle', 'Register new staff members by type and form')}
          </p>
        </div>
        <StatCard
          title={t('staff.registration.formsCount', 'Forms')}
          value={String(classes.length)}
          icon={<ClipboardList size={20} />}
          size="small"
        />
      </div>

      <Card title={t('staff.registration.selectType', 'Select Staff Type')} className={styles.typeCard}>
        <div className={styles.typeGrid}>
          {staffTypes.map((type) => {
            const Icon = type.icon;
            const isActive = staffType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                className={`${styles.typeOption} ${isActive ? styles.typeOptionActive : ''}`}
                onClick={() => handleStaffTypeChange(type.id)}
                aria-pressed={isActive}
              >
                <span className={styles.typeIconWrap}>
                  <Icon size={22} />
                </span>
                <span className={styles.typeLabel}>{type.label}</span>
                {type.description ? (
                  <span className={styles.typeDesc}>{type.description}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      {staffType && (
        <Card
          title={
            <>
              <FolderOpen size={18} className={styles.sectionIcon} />
              {t('staff.registration.availableForms', 'Available Forms')} — {staffType}
            </>
          }
          className={styles.formsCard}
        >
          {selectedForm ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <button onClick={() => { setSelectedForm(null); setStaffData([]); }}
                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 4 }}>
                    ← {t('staff.registration.backToForms', 'Back to Forms')}
                  </button>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                    {selectedForm.replace(/_/g, ' ')}
                    <span style={{ fontSize: 14, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>({staffData.length} staff)</span>
                  </h3>
                </div>
                <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setSelectedClass(selectedForm)}>
                  {t('staff.addStaff', 'Add Staff')}
                </Button>
              </div>

              {staffLoading ? (
                <p style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>{t('common.loading', 'Loading...')}</p>
              ) : staffData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                  <Users size={40} style={{ marginBottom: 12 }} />
                  <p>{t('staff.registration.noStaff', 'No staff members yet. Click "Add Staff" to begin.')}</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>#</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{t('staff.name', 'Name')}</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{t('staff.gender', 'Gender')}</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{t('staff.role', 'Role')}</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{t('staff.workTime', 'Work Time')}</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{t('staff.phone', 'Phone')}</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Active</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffData.map((s, i) => (
                        <tr key={s.id || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 12px', color: '#6b7280' }}>{i + 1}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 500 }}>{s.name || s.staff_name || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{s.gender || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{s.role || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{s.staff_work_time || '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.phone || '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span onClick={() => handleToggleActive(s.global_staff_id, s.name || s.staff_name, s.is_active)}
                              style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                                background: s.is_active ? '#d1fae5' : '#fef3c7', color: s.is_active ? '#065f46' : '#92400e' }}>
                              {s.is_active ? '🟢 Active' : '🔴 Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <button onClick={() => handleDeleteStaff(s.global_staff_id, s.name || s.staff_name)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15, padding: '2px 6px' }}
                              title="Delete staff">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : loading ? (
            <p className={styles.emptyMessage}>{t('common.loading', 'Loading...')}</p>
          ) : classes.length === 0 ? (
            <div className={styles.emptyState}>
              <ClipboardList size={40} className={styles.emptyIcon} />
              <h3>{t('staff.registration.noForms', 'No forms found')}</h3>
              <p>{t('staff.registration.createFormFirst', 'Create a registration form first')}</p>
            </div>
          ) : (
            <div className={styles.formsGrid}>
              {classes.map((cls) => (
                <div
                  key={cls}
                  className={styles.formCard}
                  onClick={() => { setSelectedForm(cls); fetchStaff(staffType, cls); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && (setSelectedForm(cls), fetchStaff(staffType, cls))}
                >
                  <div className={styles.formCardTop}>
                    <span className={styles.formIconWrap}>
                      <ClipboardList size={20} />
                    </span>
                    <span className={styles.formBadge}>
                      {t('staff.registration.active', 'Active')}
                    </span>
                  </div>
                  <h3 className={styles.formName}>{cls.replace(/_/g, ' ')}</h3>
                  <p className={styles.formHint}>
                    {t('staff.registration.clickToAdd', 'Click to add staff')}
                  </p>
                  <div className={styles.formActions}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus size={16} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClass(cls);
                      }}
                    >
                      {t('staff.addStaff', 'Add Staff')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={16} />}
                      onClick={(e) => handleDelete(cls, e)}
                      aria-label={t('common.delete', 'Delete')}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        isOpen={Boolean(selectedClass)}
        onClose={() => setSelectedClass(null)}
        title={
          <>
            <UserPlus size={20} />
            {t('staff.registration.addToForm', 'Add staff to {{form}}', {
              form: selectedClass?.replace(/_/g, ' ')
            })}
          </>
        }
        size="large"
      >
        {selectedClass && (
          <StaffForm
            staffTypeProp={staffType}
            classNameProp={selectedClass}
            onSuccess={handleFormSuccess}
          />
        )}
      </Modal>
    </div>
  );
};

export default CreateRegisterStaff;
