import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, FileSpreadsheet, CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import styles from './FinanceReports.module.css';
import api from '../../utils/api';
import { getCurrentEthiopianMonth } from '../../utils/ethiopianCalendar';

import Button from '../../COMPONENTS/Button/Button';

const ETHIOPIAN_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

const MONTH_SHORT = [
  'Mes', 'Tik', 'Hid', 'Tah', 'Tir', 'Yek',
  'Meg', 'Mia', 'Gin', 'Sen', 'Ham', 'Neh', 'Pag'
];

const SCHOOL_YEAR_MONTHS = 10; // Meskerem .. Sene

const num = (n) => (Number(n) || 0);
const fmt = (n) => num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (paid, expected) => (expected > 0 ? (num(paid) / num(expected)) * 100 : 0);

const FinanceReports = () => {
  const { t } = useTranslation();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentEthiopianMonth, setCurrentEthiopianMonth] = useState(() => getCurrentEthiopianMonth().month);
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);
  const [unpaidStudents, setUnpaidStudents] = useState([]);
  const [unpaidCreditTotal, setUnpaidCreditTotal] = useState(0);
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    const currentMonth = getCurrentEthiopianMonth();
    setCurrentEthiopianMonth(currentMonth.month);
    fetchOverview();
  }, []);

  // Auto-update Ethiopian month every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const currentMonth = getCurrentEthiopianMonth();
      if (currentMonth.month !== currentEthiopianMonth) {
        setCurrentEthiopianMonth(currentMonth.month);
        fetchOverview();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [currentEthiopianMonth]);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const params = `?currentMonth=${currentEthiopianMonth}${filterDate ? `&paidOn=${filterDate}` : ''}`;
      const response = await api.get(`/finance/monthly-payments-view/overview${params}`);
      console.log('Financial Reports Data:', response.data);
      setOverview(response.data);
    } catch (error) {
      console.error('Error fetching overview:', error);
      alert(t('finance.reports.failedFetch'));
    } finally {
      setLoading(false);
    }
  };

  // Refetch when the date filter changes
  useEffect(() => {
    fetchOverview();
  }, [filterDate]);

  const fetchUnpaidStudents = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/finance/monthly-payments-view/unpaid-students?currentMonth=${currentEthiopianMonth}`);
      setUnpaidStudents(response.data.students || []);
      setUnpaidCreditTotal(response.data.creditTotal || 0);
      setShowUnpaidModal(true);
    } catch (error) {
      console.error('Error fetching unpaid students:', error);
      alert(t('finance.reports.failedFetchUnpaid'));
    } finally {
      setLoading(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>{t('finance.reports.loading')}</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className={styles.container}>
        <h2>{t('finance.reports.noData')}</h2>
      </div>
    );
  }

  const summary = overview.summary;
  const reportMonths = Math.min(overview.reportMonth || SCHOOL_YEAR_MONTHS, SCHOOL_YEAR_MONTHS);
  const monthNames = ETHIOPIAN_MONTHS.slice(0, reportMonths);
  const collectionRate = pct(summary.unlockedTotalPaid, summary.unlockedTotalAmount);
  const monthly = (summary.monthlyBreakdown || []).slice(0, reportMonths);
  const classes = overview.classes || [];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>{t('finance.reports.title', 'Financial Reports')}</h1>
          <p>{t('finance.reports.subtitle', 'Monthly payment statement and collection overview')}</p>
        </div>
        <div className={styles.filterGroup}>
          <CalendarDays size={16} />
          <input
            type="date"
            className={styles.dateInput}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
          {filterDate && (
            <button className={styles.clearFilter} onClick={() => setFilterDate('')} title={t('finance.reports.clearFilter', 'Clear filter')}>
              ×
            </button>
          )}
        </div>
        <div className={styles.exportActions}>
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
            {t('finance.reports.exportPdf', 'Print / PDF')}
          </Button>
          <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={fetchUnpaidStudents}>
            {t('finance.reports.exportExcel', 'Export unpaid list')}
          </Button>
        </div>
      </div>

      {/* Period Banner */}
      <div className={styles.periodBanner}>
        <div className={styles.periodInfo}>
          <CalendarDays size={24} />
          <div>
            <div className={styles.periodLabel}>{t('finance.reports.schoolYear', 'School year')}</div>
            <div className={styles.periodMonth}>Meskerem – Sene</div>
          </div>
        </div>
        <div className={styles.periodMeta}>
          <div className={styles.periodMetaItem}>
            <span>{t('finance.reports.periodCovered', 'Billed months')}</span>
            <strong>{monthNames.join(' \u2022 ')}</strong>
          </div>
          <div className={styles.periodMetaItem}>
            <span>{t('finance.reports.todayCollected', "Today's collections")}</span>
            <strong className={styles.gold}>{fmt(summary.todayCollected)} {t('finance.reports.birr')}</strong>
          </div>
        </div>
      </div>

      {/* Grand Total Collected Breakdown */}
      <div className={styles.totalBreakdown}>
        <div className={styles.totalRow}>
          <div className={styles.totalCell}>
            <div className={styles.totalCellLabel}>{t('finance.reports.studentsPaid', 'Students paid (tuition)')}</div>
            <div className={styles.totalCellValue}>{fmt(summary.unlockedTotalPaid)}</div>
            <div className={styles.totalCellUnit}>{t('finance.reports.birr')}</div>
          </div>
          <div className={styles.totalOp}>+</div>
          <div className={styles.totalCell}>
            <div className={styles.totalCellLabel}>{t('finance.reports.freeRegFee', 'Free students (reg. fee)')}</div>
            <div className={styles.totalCellValue}>{fmt(summary.freeRegPaid)}</div>
            <div className={styles.totalCellUnit}>{t('finance.reports.birr')}</div>
          </div>
          <div className={styles.totalOp}>=</div>
          <div className={`${styles.totalCell} ${styles.totalCellGrand}`}>
            <div className={styles.totalCellLabel}>{t('finance.reports.grandTotal', 'Grand Total Collected')}</div>
            <div className={styles.totalCellValue}>{fmt((summary.unlockedTotalPaid || 0) + (summary.freeRegPaid || 0))}</div>
            <div className={styles.totalCellUnit}>{t('finance.reports.birr')}</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.cardStudents}`}>
          <div className={styles.statIcon}><Users size={26} /></div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.totalStudents')}</div>
            <div className={styles.statValue}>{summary.totalStudents}</div>
            <div className={styles.statSubtext}>
              {t('finance.reports.paying')}: <strong>{summary.payingStudents}</strong> &nbsp;|&nbsp;
              {t('finance.reports.exempt')}: <strong>{summary.freeStudents}</strong>
            </div>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.cardFree}`}>
          <div className={styles.statIcon}>🎓</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.freeStudents', 'Free Students')}</div>
            <div className={styles.statValue}>{summary.freeStudents}</div>
            <div className={styles.statSubtext}>
              {t('finance.reports.freeRegCollected', 'Reg. fee collected')}: <strong>{fmt(summary.freeRegPaid)} {t('finance.reports.birr')}</strong>
            </div>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.cardExpected}`}>
          <div className={styles.statIcon}>💰</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.totalExpected')}</div>
            <div className={styles.statValue}>{fmt((summary.unlockedTotalAmount || 0) + (summary.freeRegTotal || 0))}</div>
            <div className={styles.statSubtext}>{t('finance.reports.schoolYearExpected', 'Full school year (Meskerem – Sene)')}</div>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.cardPaid}`}>
          <div className={styles.statIcon}>✓</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.totalPaid')}</div>
            <div className={styles.statValue}>{fmt((summary.unlockedTotalPaid || 0) + (summary.freeRegPaid || 0))}</div>
            <div className={styles.statSubtext}>
              {t('finance.reports.birr')} &nbsp;·&nbsp;
              {t('finance.reports.inclFree', 'incl. free reg fee')}: <strong>{fmt(summary.freeRegPaid)}</strong>
            </div>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.cardPending}`}>
          <div className={styles.statIcon}>⏳</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.totalPending')}</div>
            <div className={styles.statValue}>{fmt((summary.unlockedTotalPending || 0) + (summary.freeRegPending || 0))}</div>
            <div className={styles.statSubtext}>{t('finance.reports.birr')}</div>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.cardRate}`}>
          <div className={styles.statIcon}>📈</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.collectionRate')}</div>
            <div className={styles.statValue}>{collectionRate.toFixed(1)}%</div>
            <div className={styles.rateBarOuter}>
              <div className={styles.rateBarInner} style={{ width: `${Math.min(collectionRate, 100)}%` }}></div>
            </div>
          </div>
        </div>

        <div
          className={`${styles.statCard} ${styles.cardUnpaid}`}
          onClick={fetchUnpaidStudents}
          role="button"
        >
          <div className={styles.statIcon}><AlertTriangle size={26} /></div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>{t('finance.reports.unpaidStudents')}</div>
            <div className={styles.statValue}>{summary.unpaidUnlockedStudents}</div>
            <div className={styles.statSubtext}>{t('finance.reports.clickToView', 'Click to view the list')}</div>
          </div>
        </div>
      </div>

      {/* Payments on selected date */}
      {summary.paidOn && summary.paidOn.students.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('finance.reports.paidOnTitle', 'Payments collected on')} {summary.paidOn.date}</h2>
            <span className={styles.sectionTag}>{fmt(summary.paidOn.total)} {t('finance.reports.birr')} · {summary.paidOn.count}</span>
          </div>
          <div className={styles.studentChips}>
            {summary.paidOn.students.map((s, i) => (
              <span key={i} className={`${styles.studentChip} ${styles.chipPaid}`}>
                <span className={styles.chipName}>{s.name}</span>
                {s.class && <span className={styles.chipClass}>{s.class}</span>}
                <span className={styles.chipAmount}>{fmt(s.amount)}</span>
                <span className={styles.chipTime}>{s.time}{s.receiptNumber ? ` · ${s.receiptNumber}` : ''}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {summary.paidOn && summary.paidOn.students.length === 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('finance.reports.paidOnTitle', 'Payments collected on')} {summary.paidOn.date}</h2>
            <span className={styles.sectionTag}>0 {t('finance.reports.birr')}</span>
          </div>
          <p className={styles.detailEmpty}>{t('finance.reports.noPaymentsDate', 'No payments were collected on this date')}</p>
        </div>
      )}

      {/* Monthly Payment Breakdown with student details */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('finance.reports.monthlyBreakdown', 'Monthly Payment Breakdown')}</h2>
          <span className={styles.sectionTag}>{reportMonths} {t('finance.reports.months', 'months')}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('finance.reports.month', 'Month')}</th>
                <th className={styles.amountRight}>{t('finance.reports.totalExpected')}</th>
                <th className={styles.amountRight}>{t('finance.reports.totalPaid')}</th>
                <th className={styles.amountRight}>{t('finance.reports.totalPendingTh')}</th>
                <th className={styles.center}>{t('finance.reports.rateTh', 'Rate')}</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => {
                const r = pct(m.paid, m.expected);
                const isCurrent = m.monthNumber === (overview.reportMonth || currentEthiopianMonth);
                const paidStudents = m.paidStudents || [];
                const unpaidStudents = m.unpaidStudents || [];
                return (
                  <>
                    <tr className={isCurrent ? styles.rowCurrent : ''}>
                      <td>
                        <span className={styles.monthName}>
                          {m.monthNumber}. {ETHIOPIAN_MONTHS[m.monthNumber - 1]}
                        </span>
                        {isCurrent && <span className={styles.currentBadge}>{t('finance.reports.current', 'CURRENT')}</span>}
                        <span className={styles.monthMeta}>
                          {m.paidInvoices}/{m.invoices} {t('finance.reports.invoicesPaid', 'paid')}
                        </span>
                      </td>
                      <td className={styles.amountRight}>{fmt(m.expected)}</td>
                      <td className={styles.amountPaid}>{fmt(m.paid)}</td>
                      <td className={styles.amountPending}>{fmt(m.pending)}</td>
                      <td className={styles.center}>
                        <span className={`${styles.rateBadge} ${r >= 70 ? styles.rateGood : r >= 40 ? styles.rateMid : styles.rateLow}`}>
                          {r.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                    <tr className={styles.detailRow}>
                      <td colSpan={5}>
                        <div className={styles.detailGrid}>
                          <div className={styles.detailCol}>
                            <div className={styles.detailHead}>
                              <CheckCircle2 size={15} />
                              {t('finance.reports.paidStudents', 'Students who paid')}
                              <span className={styles.detailCount}>{paidStudents.length}</span>
                            </div>
                            {paidStudents.length === 0 ? (
                              <div className={styles.detailEmpty}>{t('finance.reports.noPaidStudents', 'No payments recorded')}</div>
                            ) : (
                              <div className={styles.studentChips}>
                                {paidStudents.map((s, i) => (
                                  <span key={i} className={`${styles.studentChip} ${styles.chipPaid}`}>
                                    <span className={styles.chipName}>{s.name}</span>
                                    {s.class && <span className={styles.chipClass}>{s.class}</span>}
                                    <span className={styles.chipAmount}>{fmt(s.amount)}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className={styles.detailCol}>
                            <div className={styles.detailHead}>
                              <XCircle size={15} />
                              {t('finance.reports.unpaidStudentsDetail', 'Students who did not pay')}
                              <span className={styles.detailCount}>{unpaidStudents.length}</span>
                            </div>
                            {unpaidStudents.length === 0 ? (
                              <div className={styles.detailEmpty}>{t('finance.reports.allPaidMonth', 'All students paid this month')}</div>
                            ) : (
                              <div className={styles.studentChips}>
                                {unpaidStudents.map((s, i) => (
                                  <span key={i} className={`${styles.studentChip} ${styles.chipUnpaid}`}>
                                    <span className={styles.chipName}>{s.name}</span>
                                    {s.class && <span className={styles.chipClass}>{s.class}</span>}
                                    <span className={styles.chipAmount}>{fmt(s.pending)}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('finance.reports.total')}</td>
                <td className={styles.amountRight}>{fmt(monthly.reduce((s, m) => s + num(m.expected), 0))}</td>
                <td className={styles.amountPaid}>{fmt(monthly.reduce((s, m) => s + num(m.paid), 0))}</td>
                <td className={styles.amountPending}>{fmt(monthly.reduce((s, m) => s + num(m.pending), 0))}</td>
                <td className={styles.center}>
                  <span className={`${styles.rateBadge} ${collectionRate >= 70 ? styles.rateGood : collectionRate >= 40 ? styles.rateMid : styles.rateLow}`}>
                    {collectionRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Class Breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('finance.reports.classBreakdown')}</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('finance.reports.class')}</th>
                <th className={styles.center}>{t('finance.reports.monthlyFee', 'Monthly fee')}</th>
                <th className={styles.center}>{t('finance.reports.totalStudentsTh')}</th>
                <th className={styles.center}>{t('finance.reports.payingTh')}</th>
                <th className={styles.center}>{t('finance.reports.exemptTh')}</th>
                <th className={styles.amountRight}>{t('finance.reports.freeRegTh', 'Free Reg Paid')}</th>
                <th className={styles.amountRight}>{t('finance.reports.totalAmountTh')}</th>
                <th className={styles.amountRight}>{t('finance.reports.totalPaidTh')}</th>
                <th className={styles.amountRight}>{t('finance.reports.totalPendingTh')}</th>
                <th className={styles.center}>{t('finance.reports.rateTh')}</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((classData, index) => {
                const r = pct(classData.unlockedTotalPaid, classData.unlockedTotalAmount);
                return (
                  <tr key={index}>
                    <td className={styles.className}>{classData.className}</td>
                    <td className={styles.center}>{fmt(classData.monthlyFee)}</td>
                    <td className={styles.center}>{classData.totalStudents}</td>
                    <td className={styles.center}>{classData.payingStudents || 0}</td>
                    <td className={styles.center}>{classData.freeStudents || 0}</td>
                    <td className={styles.amountPaid}>{fmt(classData.freeRegPaid)}</td>
                    <td className={styles.amountRight}>{fmt(classData.unlockedTotalAmount)}</td>
                    <td className={styles.amountPaid}>{fmt(classData.unlockedTotalPaid)}</td>
                    <td className={styles.amountPending}>{fmt(classData.unlockedTotalPending)}</td>
                    <td className={styles.center}>
                      <span className={`${styles.rateBadge} ${r >= 70 ? styles.rateGood : r >= 40 ? styles.rateMid : styles.rateLow}`}>
                        {r.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('finance.reports.total')}</td>
                <td className={styles.center}>—</td>
                <td className={styles.center}>{summary.totalStudents}</td>
                <td className={styles.center}>{summary.payingStudents || 0}</td>
                <td className={styles.center}>{summary.freeStudents || 0}</td>
                <td className={styles.amountPaid}>{fmt(summary.freeRegPaid)}</td>
                <td className={styles.amountRight}>{fmt(summary.unlockedTotalAmount)}</td>
                <td className={styles.amountPaid}>{fmt(summary.unlockedTotalPaid)}</td>
                <td className={styles.amountPending}>{fmt(summary.unlockedTotalPending)}</td>
                <td className={styles.center}>
                  <span className={`${styles.rateBadge} ${collectionRate >= 70 ? styles.rateGood : collectionRate >= 40 ? styles.rateMid : styles.rateLow}`}>
                    {collectionRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Monthly Collection Matrix */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('finance.reports.monthlyMatrix', 'Monthly Collection Matrix')}</h2>
          <span className={styles.sectionHint}>{t('finance.reports.matrixHint', 'Amount paid / amount still pending, per class and month')}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.matrixTable}`}>
            <thead>
              <tr>
                <th>{t('finance.reports.class')}</th>
                {monthly.map((m) => (
                  <th key={m.monthNumber} className={styles.center}>
                    {MONTH_SHORT[m.monthNumber - 1]}
                    {m.monthNumber === (overview.reportMonth || currentEthiopianMonth) && <span className={styles.matrixCurrent}>●</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classes.map((classData, index) => (
                <tr key={index}>
                  <td className={styles.className}>{classData.className}</td>
                  {(classData.monthlyBreakdown || monthly).map((m, mi) => {
                    const row = classData.monthlyBreakdown?.[mi] || m;
                    const paid = num(row.paid);
                    const pending = num(row.pending);
                    const done = pending <= 0 && paid > 0;
                    return (
                      <td key={mi} className={styles.center}>
                        <div className={`${styles.matrixCell} ${done ? styles.matrixDone : pending > 0 ? styles.matrixOpen : ''}`}>
                          <span className={styles.matrixPaid}>{fmt(paid)}</span>
                          {pending > 0 && <span className={styles.matrixPending}>-{fmt(pending)}</span>}
                          {paid === 0 && pending === 0 && <span className={styles.matrixEmpty}>—</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unpaid Students Modal */}
      {showUnpaidModal && (
        <div className={styles.modalOverlay} onClick={() => setShowUnpaidModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>{t('finance.reports.unpaidDetails')}</h2>
              <button className={styles.modalClose} onClick={() => setShowUnpaidModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {loading ? (
                <div className={styles.loadingContainer}>
                  <div className={styles.loader}></div>
                  <p>{t('finance.reports.loadingUnpaid')}</p>
                </div>
              ) : unpaidStudents.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>✓</div>
                  <h3>{t('finance.reports.noUnpaid')}</h3>
                  <p>{t('finance.reports.allPaid')}</p>
                </div>
              ) : (
                <>
                  <div className={styles.unpaidSummary}>
                    <strong>{t('finance.reports.totalUnpaidLabel')}:</strong> {unpaidStudents.length}
                    {num(unpaidCreditTotal) > 0 && (
                      <span className={styles.creditNote}>
                        {t('finance.reports.creditNote', 'Less over-payment credits')}: −{fmt(unpaidCreditTotal)}
                      </span>
                    )}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('finance.reports.studentName')}</th>
                          <th className={styles.center}>{t('finance.reports.class')}</th>
                          <th className={styles.center}>{t('finance.reports.unpaidMonths')}</th>
                          <th className={styles.amountRight}>{t('finance.reports.totalPendingTh')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaidStudents.map((student, index) => (
                          <tr key={index}>
                            <td>{student.student_name}</td>
                            <td className={styles.center}><span className={styles.classBadge}>{student.class}</span></td>
                            <td className={styles.center}><span className={styles.monthBadge}>{student.unpaid_months_count}</span></td>
                            <td className={styles.amountPending}>{fmt(student.total_pending)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="3" className={styles.amountRight}>{t('finance.reports.totalPendingLabel')}</td>
                          <td className={styles.amountPending}>
                            {fmt(unpaidStudents.reduce((sum, s) => sum + num(s.total_pending), 0) - num(unpaidCreditTotal))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceReports;