import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import styles from './InvoiceManagement.module.css';

import Button from '../../COMPONENTS/Button/Button';
import Input from '../../COMPONENTS/Input/Input';
import Select from '../../COMPONENTS/Select/Select';
import Card from '../../COMPONENTS/Card/Card';
import Table from '../../COMPONENTS/Table/Table';
import Badge from '../../COMPONENTS/Badge/Badge';

const InvoiceManagement = () => {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, [filter]);

  const fetchInvoices = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'ALL') params.append('status', filter);
      
      const response = await fetch(`/api/finance/invoices?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvoices(Array.isArray(data.data) ? data.data.filter(Boolean) : []);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'DRAFT': '#9E9E9E',
      'ISSUED': '#2196F3',
      'PARTIALLY_PAID': '#FF9800',
      'PAID': '#4CAF50',
      'OVERDUE': '#F44336',
      'CANCELLED': '#757575'
    };
    return colors[status] || '#9E9E9E';
  };

  const filteredInvoices = (invoices || []).filter(invoice =>
    invoice &&
    (String(invoice.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
     String(invoice.studentId || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const statusFilterOptions = useMemo(
    () =>
      ['ALL', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].map((status) => ({
        value: status,
        label: status === 'ALL' ? t('common.all', 'All') : status.replace(/_/g, ' ')
      })),
    [t]
  );

  const tableColumns = useMemo(
    () => [
      { key: 'invoiceNumber', header: t('finance.invoices.number', 'Invoice #'), accessor: 'invoiceNumber' },
      { key: 'studentId', header: t('finance.invoices.student', 'Student ID'), accessor: 'studentId' },
      {
        key: 'issueDate',
        header: t('finance.invoices.issueDate', 'Issue date'),
        render: (val, row) => new Date(row?.issueDate).toLocaleDateString()
      },
      {
        key: 'dueDate',
        header: t('finance.invoices.dueDate', 'Due date'),
        render: (val, row) => new Date(row?.dueDate).toLocaleDateString()
      },
      {
        key: 'totalAmount',
        header: t('finance.invoices.total', 'Total'),
        render: (val, row) => `$${parseFloat(row?.totalAmount || 0).toFixed(2)}`
      },
      {
        key: 'paidAmount',
        header: t('finance.invoices.paid', 'Paid'),
        render: (val, row) => `$${parseFloat(row?.paidAmount || 0).toFixed(2)}`
      },
      {
        key: 'balance',
        header: t('finance.invoices.balance', 'Balance'),
        render: (val, row) => `$${parseFloat(row?.balance || 0).toFixed(2)}`
      },
      {
        key: 'status',
        header: t('finance.invoices.status', 'Status'),
        render: (val, row) => (
          <Badge variant={row?.status === 'PAID' ? 'success' : row?.status === 'OVERDUE' ? 'error' : 'default'}>
            {(row?.status || '').replace(/_/g, ' ')}
          </Badge>
        )
      }
    ],
    [t]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{t('finance.invoices.title', 'Invoices')}</h1>
          <p>{t('finance.invoices.subtitle', 'Generate and manage student invoices')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowGenerateModal(true)}>
          {t('finance.invoices.generate', 'Generate invoice')}
        </Button>
      </div>

      <Card className={styles.filtersCard}>
        <div className={styles.filters}>
          <Select
            label={t('finance.invoices.status', 'Status')}
            value={filter}
            onChange={setFilter}
            options={statusFilterOptions}
          />
          <Input
            label={t('common.search', 'Search')}
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={t('finance.invoices.searchPlaceholder', 'Invoice or student...')}
            prefixIcon={<Search size={16} />}
          />
        </div>
      </Card>

      {loading ? (
        <div className={styles.loading}>{t('common.loading', 'Loading...')}</div>
      ) : (
        <Table
          columns={tableColumns}
          data={filteredInvoices}
          paginated
          pageSize={15}
          emptyMessage={t('finance.invoices.empty', 'No invoices found')}
        />
      )}

      {/* Generate Invoice Modal */}
      {showGenerateModal && (
        <GenerateInvoiceModal 
          onClose={() => setShowGenerateModal(false)}
          onSuccess={() => {
            setShowGenerateModal(false);
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
};

const GenerateInvoiceModal = ({ onClose, onSuccess }) => {
  const [students, setStudents] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [formData, setFormData] = useState({
    studentId: '',
    academicYearId: '',
    feeStructureId: '',
    dueDate: '',
    campusId: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
    fetchFeeStructures();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await fetch('/api/students', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStudents(data.data || data);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchFeeStructures = async () => {
    try {
      const response = await fetch('/api/finance/fee-structures', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFeeStructures(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching fee structures:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/finance/invoices/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert('Invoice generated successfully!');
        onSuccess();
      } else {
        const error = await response.json();
        alert(error.error?.message || 'Failed to generate invoice');
      }
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Generate Invoice</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label>Student *</label>
            <select
              required
              value={formData.studentId}
              onChange={(e) => setFormData({...formData, studentId: e.target.value})}
            >
              <option value="">-- Select Student --</option>
              {students.map(student => (
                <option key={student.id} value={student.id}>
                  {student.name || `${student.firstName} ${student.lastName}`} - {student.className || student.class}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Fee Structure *</label>
            <select
              required
              value={formData.feeStructureId}
              onChange={(e) => setFormData({...formData, feeStructureId: e.target.value})}
            >
              <option value="">-- Select Fee Structure --</option>
              {feeStructures.map(fee => (
                <option key={fee.id} value={fee.id}>
                  {fee.name} - ${parseFloat(fee.amount).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Due Date *</label>
            <input
              type="date"
              required
              value={formData.dueDate}
              onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Academic Year *</label>
            <input
              type="text"
              required
              value={formData.academicYearId}
              onChange={(e) => setFormData({...formData, academicYearId: e.target.value})}
              placeholder="e.g., 2024-2025"
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvoiceManagement;
