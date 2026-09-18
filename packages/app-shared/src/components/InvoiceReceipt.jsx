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
    invoiceNumber
  } = receiptData;

  return (
    <div ref={ref} className={styles.receipt}>
      {/* Header with Logo and School Info */}
      <div className={styles.header}>
        <div className={styles.logoSection}>
          {schoolInfo?.logo && (
            <img src={schoolInfo.logo} alt="School Logo" className={styles.logo} />
          )}
        </div>
        <div className={styles.schoolInfo}>
          <h2 className={styles.schoolNameEn}>{schoolInfo?.nameEn || 'School Name (Somali)'}</h2>
          <h3 className={styles.schoolNameAm}>{schoolInfo?.nameAm || 'ኢቅራ ሮጸ አሕፃናት አንደኛና ሁለተኛ ደረጃ ት/ቤት'}</h3>
          <p className={styles.schoolNameEn2}>Iqra Kindergarten, Primary, Intermediate and Secondary School</p>
          <p className={styles.schoolNameAr}>اقرأ روضة الأطفال ومدرسة الإبتدائية والمتوسطة والثانويه</p>
          <p className={styles.contact}>0911775841 | Jigiga-Ethiopia</p>
        </div>
      </div>

      {/* Receipt Title and Number */}
      <div className={styles.titleSection}>
        <div className={styles.titleRow}>
          <div className={styles.titleLeft}>
            <p className={styles.receiptLabel}>የገንዘብ መቀበያ ደረሰኝ</p>
            <h1 className={styles.receiptTitle}>Cash Receipt Voucher</h1>
          </div>
          <div className={styles.receiptNumberBox}>
            <p className={styles.dateLabel}>Date</p>
            <p className={styles.receiptNumber}>{receiptNumber}</p>
            <p className={styles.date}>{date}</p>
          </div>
        </div>
      </div>

      {/* Receipt Body */}
      <div className={styles.body}>
        {/* From */}
        <div className={styles.field}>
          <label className={styles.labelAm}>ከ</label>
          <label className={styles.labelEn}>From</label>
          <div className={styles.value}>
            <p className={styles.studentInfo}>{studentName}</p>
            <p className={styles.studentDetails}>Student ID: {studentId} | Class: {className}</p>
          </div>
        </div>

        {/* Purpose of Payment */}
        <div className={styles.field}>
          <label className={styles.labelAm}>የተከፈለበት ምክንያት</label>
          <label className={styles.labelEn}>Purpose of Payment</label>
          <div className={styles.value}>
            <p className={styles.purpose}>Monthly Tuition Fee - {monthsPaid.join(', ')}</p>
            <p className={styles.invoiceRef}>Invoice: {invoiceNumber}</p>
          </div>
        </div>

        {/* Amount in Word */}
        <div className={styles.field}>
          <label className={styles.labelAm}>በአንዘበ</label>
          <label className={styles.labelEn}>Amount in Word</label>
          <div className={styles.value}>
            <p className={styles.amountWord}>{amountInWords}</p>
          </div>
        </div>

        {/* Payment in Figures */}
        <div className={styles.field}>
          <label className={styles.labelAm}>በፊደል</label>
          <label className={styles.labelEn}>Payment in Figures</label>
          <div className={styles.valueBox}>
            <p className={styles.amountFigure}>{amountInFigures} Birr</p>
          </div>
        </div>

        {/* Payment Method */}
        <div className={styles.field}>
          <label className={styles.labelAm}>የክፍያ ዘዴ</label>
          <label className={styles.labelEn}>Payment Method</label>
          <div className={styles.value}>
            <p className={styles.paymentMethod}>{paymentMethod}</p>
          </div>
        </div>
      </div>

      {/* Footer - Cashier Signature */}
      <div className={styles.footer}>
        <div className={styles.signatureSection}>
          <p className={styles.signatureLabel}>የገንዘብ ተቀባይ ስም፣ ፊርማ</p>
          <p className={styles.signatureLabelEn}>Cashier's Name & Sign</p>
          <div className={styles.signatureLine}>
            <p className={styles.cashierName}>{cashierName}</p>
          </div>
        </div>
      </div>

      {/* Print Info */}
      <div className={styles.printInfo}>
        <p>Printed on: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
});

InvoiceReceipt.displayName = 'InvoiceReceipt';

export default InvoiceReceipt;
