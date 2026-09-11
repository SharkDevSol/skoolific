import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import axios from 'axios';
import styles from './AttendanceDeductionSettings.module.css';
import Card from '../../COMPONENTS/Card/Card';
import Button from '../../COMPONENTS/Button/Button';
import Badge from '../../COMPONENTS/Badge/Badge';

const API_URL = import.meta.env.VITE_API_URL || '';

const AttendanceDeductionSettings = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const staffTypes = ['Teachers', 'Supportive Staff', 'Administrative Staff', 'Finance'];
  const deductionTypes = ['ABSENT', 'LATE', 'HALF_DAY', 'LATE_HALF_DAY', 'NO_CHECKOUT'];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/hr/attendance/deduction-settings`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this deduction rule?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.delete(
        `${API_URL}/api/hr/attendance/deduction-settings/${id}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('✅ Deduction rule deleted successfully!');
        fetchSettings();
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('❌ Failed to delete rule');
    }
  };

  const getDeductionTypeLabel = (type) => {
    const labels = {
      'ABSENT': 'Absent (Full Day)',
      'LATE': 'Late Arrival',
      'HALF_DAY': 'Half Day',
      'LATE_HALF_DAY': 'Late + Half Day',
      'NO_CHECKOUT': 'No Check-Out'
    };
    return labels[type] || type;
  };

  const getDeductionTypeColor = (type) => {
    const colors = {
      'ABSENT': '#F44336',
      'LATE': '#FF9800',
      'HALF_DAY': '#2196F3',
      'LATE_HALF_DAY': '#9C27B0',
      'NO_CHECKOUT': '#FF5722'
    };
    return colors[type] || '#9E9E9E';
  };

  return (
    <main className={styles.container} aria-label={t('hr.deduction.title', 'Attendance Deduction Settings')}>
      <header className={styles.header}>
        <div>
          <h1>{t('hr.deduction.title', 'Attendance Deduction Settings')}</h1>
          <p>{t('hr.deduction.subtitle', 'Configure salary deductions based on attendance for different staff types')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setEditingRule(null); setShowModal(true); }}>
          {t('hr.deduction.addRule', 'Add Deduction Rule')}
        </Button>
      </header>

      <div className={styles.rulesGrid}>
        {staffTypes.map((staffType) => {
          const typeSettings = settings.filter((s) => s.staff_type === staffType);
          const totalRules = typeSettings.length;
          const avgAbsentDeduction =
            typeSettings
              .filter((s) => s.deduction_type === 'ABSENT')
              .reduce((sum, s) => sum + parseFloat(s.deduction_amount || 0), 0) /
            (typeSettings.filter((s) => s.deduction_type === 'ABSENT').length || 1);

          return (
            <Card key={staffType} className={styles.ruleCard} title={staffType}>
              <p className={styles.ruleMeta}>
                <strong>{totalRules}</strong> {t('hr.deduction.activeRules', 'active rules')}
              </p>
              {totalRules > 0 && (
                <p className={styles.ruleMeta}>
                  {t('hr.deduction.avgAbsent', 'Avg. absent deduction')}: {avgAbsentDeduction.toFixed(2)} Birr
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {loading ? (
        <div className={styles.loading} role="status">{t('common.loading', 'Loading...')}</div>
      ) : settings.length === 0 ? (
        <p className={styles.empty}>{t('hr.deduction.empty', 'No deduction rules configured.')}</p>
      ) : (
        <div className={styles.rulesGrid}>
          {settings.map((rule) => (
            <Card key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <div>
                  <strong>{rule.staff_type}</strong>
                  <span
                    className={styles.typeBadge}
                    style={{ background: getDeductionTypeColor(rule.deduction_type) }}
                  >
                    {getDeductionTypeLabel(rule.deduction_type)}
                  </span>
                </div>
                <Badge variant={rule.is_active ? 'success' : 'default'}>
                  {rule.is_active ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                </Badge>
              </div>
              <p className={styles.ruleMeta}>
                {parseFloat(rule.deduction_amount).toFixed(2)} Birr — {rule.description || '—'}
              </p>
              <div className={styles.ruleActions}>
                <Button size="sm" variant="secondary" onClick={() => handleEdit(rule)}>
                  {t('common.edit', 'Edit')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(rule.id)}>
                  {t('common.delete', 'Delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <DeductionRuleModal
          rule={editingRule}
          staffTypes={staffTypes}
          deductionTypes={deductionTypes}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
          onSuccess={() => { setShowModal(false); setEditingRule(null); fetchSettings(); }}
        />
      )}
    </main>
  );
};

const DeductionRuleModal = ({ rule, staffTypes, deductionTypes, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    staffType: rule?.staff_type || '',
    deductionType: rule?.deduction_type || '',
    deductionAmount: rule?.deduction_amount || '',
    description: rule?.description || '',
    isActive: rule?.is_active !== undefined ? rule.is_active : true
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.staffType || !formData.deductionType || !formData.deductionAmount) {
      alert('Please fill in all required fields');
      return;
    }

    if (parseFloat(formData.deductionAmount) < 0) {
      alert('Deduction amount must be positive');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const url = rule 
        ? `${API_URL}/api/hr/attendance/deduction-settings/${rule.id}`
        : `${API_URL}/api/hr/attendance/deduction-settings`;
      
      const method = rule ? 'put' : 'post';

      const response = await axios[method](
        url,
        {
          staffType: formData.staffType,
          deductionType: formData.deductionType,
          deductionAmount: parseFloat(formData.deductionAmount),
          description: formData.description,
          isActive: formData.isActive
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert(`✅ Deduction rule ${rule ? 'updated' : 'created'} successfully!`);
        onSuccess();
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      alert(`❌ Failed to save rule: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>{rule ? 'Edit Deduction Rule' : 'Add Deduction Rule'}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Staff Type *
            </label>
            <select
              name="staffType"
              value={formData.staffType}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            >
              <option value="">Select staff type...</option>
              {staffTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Deduction Type *
            </label>
            <select
              name="deductionType"
              value={formData.deductionType}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            >
              <option value="">Select deduction type...</option>
              <option value="ABSENT">Absent (Full Day)</option>
              <option value="LATE">Late Arrival</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="LATE_HALF_DAY">Late + Half Day</option>
              <option value="NO_CHECKOUT">No Check-Out</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Deduction Amount (Birr) *
            </label>
            <input
              type="number"
              name="deductionAmount"
              value={formData.deductionAmount}
              onChange={handleChange}
              required
              min="0"
              step="0.01"
              placeholder="Enter amount in Birr"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              This amount will be deducted from staff salary for each occurrence
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Optional description or notes..."
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                style={{ marginRight: '8px', width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: 600 }}>Active Rule</span>
            </label>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', marginLeft: '26px' }}>
              Only active rules will be applied to salary calculations
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? 'Saving...' : (rule ? 'Update Rule' : 'Create Rule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendanceDeductionSettings;
