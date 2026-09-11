import React from 'react';
import styles from './InvoiceReceipt.module.css';

const InvoiceReceipt = React.forwardRef(({ receiptData, schoolInfo }, ref) => {
  const {
    receiptNumber,
    date,
    studentName,
    studentId,
    className,
    monthsPaid,
    amountInWords,
    amountInFigures,
    paymentMethod,
    cashierName,
    invoiceNumber,
    invoiceRefCode
  } = receiptData;

  const purpose = monthsPaid && monthsPaid.length > 0
    ? `Monthly Tuition Fee - ${monthsPaid.join(', ')}`
    : 'Monthly Tuition Fee';

  const displayInvoiceId = invoiceRefCode || '—';

  return (
    <div ref={ref} className={`${styles.voucher} receipt`}>
      <div className={styles.perforation} aria-hidden="true"></div>
      <div className={styles.voucherInner}>

        <header className={styles.head}>
          <div className={styles.brand}>
            <div className={styles.badgeWrap}>
              <div className={styles.badge}>
                {schoolInfo?.logo ? (
                  <img src={schoolInfo.logo} alt="Iqra Academy" className={styles.badgeImg} />
                ) : (
                  <span className={styles.badgeText}>IQRA</span>
                )}
              </div>
            </div>
            <div className={styles.wordmark}>
              <span className={styles.iqra}>IQRA</span>
              <span className={styles.academy}>Academy</span>
            </div>
          </div>

          <div className={styles.identity}>
            <p className={styles.so}>Dugsiga Barbaarinta Caruurta, Hoose, Dhexe &amp; Sare Ee Iqra</p>
            <p className={styles.am}>ኢቅራ አፀደሕፃናት አንደኛና ሁለተኛ ደረጃ ት/ቤት</p>
            <p className={styles.enName}>Iqra Kindergarten, Primary, Intermediate and Secondary School</p>
            <p className={styles.ar} dir="rtl">اقرأ روضة الأطفال ومدرسة الإبتدائية والمتوسطة والثانويه</p>
            <p className={styles.contact}>Jigjiga, Ethiopia &nbsp;·&nbsp; Invoice ID: <strong>{displayInvoiceId}</strong></p>
          </div>

          <div className={styles.titleBlock}>
            <span className={styles.titleAm}>የገንዘብ መቀበያ ደረሰኝ</span>
            <span className={styles.titleEn}>Cash Receipt Voucher</span>
            <div className={styles.meta}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Date</span>
                <span className={styles.metaFill}>{date}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>No.</span>
                <span className={styles.stampNo}>{receiptNumber}</span>
              </div>
            </div>
          </div>
        </header>

        <div className={styles.rule}></div>

        <div className={styles.bodyGrid}>
          <div className={styles.col}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><span className={styles.labelAm}>ከ</span><span className={styles.labelEn}>From</span></label>
              <div className={styles.fill}>
                <span className={styles.fillStrong}>{studentName}</span>
                <span className={styles.fillSub}>Student ID: {studentId} | Class: {className}</span>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}><span className={styles.labelAm}>የተከፈለበት ምክንያት</span><span className={styles.labelEn}>Purpose of Payment</span></label>
              <div className={styles.fill}>{purpose}</div>
              <div className={`${styles.fill} ${styles.secondary}`}>Invoice: {invoiceNumber}</div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}><span className={styles.labelAm}>ቀሪ ክፍያ</span><span className={styles.labelEn}>Payment Method</span></label>
              <div className={styles.fill}>{paymentMethod}</div>
            </div>
          </div>

          <div className={styles.col}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><span className={styles.labelAm}>በአጻዘ</span><span className={styles.labelEn}>Amount in Words</span></label>
              <div className={styles.fill}>{amountInWords}</div>
            </div>

            <div className={`${styles.field} ${styles.figure}`}>
              <label className={styles.fieldLabel}><span className={styles.labelAm}>በፊደል</span><span className={styles.labelEn}>Payment in Figures</span></label>
              <div className={styles.figureBox}>{amountInFigures} Birr</div>
            </div>

            <div className={`${styles.field} ${styles.signBlock}`}>
              <div className={styles.fill}>{cashierName}</div>
              <label className={styles.fieldLabel}><span className={styles.labelAm}>የገንዘብ ተቀባይ ስምና ፊርማ</span><span className={styles.labelEn}>Cashier's Name &amp; Sign</span></label>
            </div>
          </div>
        </div>

        <div className={styles.finePrint}>Iqra Academy &nbsp;•&nbsp; Jigjiga, Ethiopia &nbsp;•&nbsp; Invoice ID: {displayInvoiceId}</div>

      </div>
    </div>
  );
});

InvoiceReceipt.displayName = 'InvoiceReceipt';

export default InvoiceReceipt;
