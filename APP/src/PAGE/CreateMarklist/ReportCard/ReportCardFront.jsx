import React from 'react';
import styles from './ReportCard.module.css';

const subjectArabicMap = {
  'English': 'الانجليزية', 'Arabic': 'اللغة العربية', 'Arabic Language': 'اللغة العربية',
  'Mathematics': 'الرياضيات', 'Science': 'العلوم', 'General Science': 'العلوم',
  'Biology': 'الأحياء', 'Physics': 'الفيزياء', 'Chemistry': 'الكيمياء',
  'Somali': 'الصومالية', 'Amharic': 'الأمهرية', 'Tarbiyo': 'تربية',
  'Tarbiya': 'تربية', 'Sport': 'الرياضة', 'SocialStudies': 'الدراسات الاجتماعية',
  'Social': 'الدراسات الاجتماعية', 'History': 'التاريخ', 'Geography': 'الجغرافيا',
  'Citizenship': 'التربية المدنية', 'Career': 'المهنية', 'ICT': 'الكومبيوتر',
  'Economics': 'الاقتصاد', 'G/S': 'صحة عامة',
};

const getSubjectArabic = (name) => subjectArabicMap[name] || '';

const ReportCardFront = ({ data, schoolInfo }) => {
  if (!data) return null;
  const terms = data.terms || [1, 2];
  const subjects = data.subjects || [];

  const getTermLabel = (tn) => {
    const suffix = tn === 1 ? 'st' : tn === 2 ? 'nd' : tn === 3 ? 'rd' : 'th';
    return `${tn}${suffix} Term`;
  };

  return (
    <div className={styles.reportCard}>
      <div className={styles.outerBorder}>
        <div className={styles.innerBorder}>
          <div className={styles.decorCornerTR}></div>
          <div className={styles.decorCornerBL}></div>
          <div className={styles.frontContent}>
            <div className={styles.headerSection}>
              <div className={styles.logoContainer}>
                <img src={schoolInfo.logo || schoolInfo.website_icon} alt="Logo" className={styles.mainLogo} />
              </div>
              <div className={styles.schoolInfo}>
                <div className={styles.schoolNameMain}>IQRA ACADEMY</div>
                <div className={styles.schoolNameAmharic}>ኢቅራ የስላም መዋለ ናት ት/ቤት</div>
                <div className={styles.schoolNameArabic}>اقرأ روضة الأطفال ومدرسة الإبتدائية والمتوسطة والثانويه</div>
                <div className={styles.schoolNameEnglish}>IQRA Kindergarten, Primary, Intermediate and Secondary School</div>
                <div className={styles.schoolLocation}>Jigjiga-Ethiopia</div>
              </div>
            </div>

            <div className={styles.titleContainer}>
              <div className={styles.titleLine}></div>
              <div className={styles.cardTitle}>STUDENT'S REPORT CARD</div>
              <div className={styles.titleLine}></div>
            </div>

            <div className={styles.studentInfoGrid}>
              <div className={styles.infoGridRow}>
                <span className={styles.infoLabel}>Full Name:</span>
                <span className={styles.infoValue}>{data.studentName}</span>
                <span className={styles.infoLabelAr}>الاسم الكامل</span>
              </div>
              <div className={styles.infoGridRow}>
                <span className={styles.infoLabel}>Sex:</span>
                <span className={styles.infoValue}>{data.gender || ''}</span>
                <span className={styles.infoLabelAr}>الجنس</span>
                <span className={styles.infoLabel}>Age:</span>
                <span className={styles.infoValue}>{data.age || ''}</span>
                <span className={styles.infoLabelAr}>العمر</span>
                <span className={styles.infoLabel}>Grade:</span>
                <span className={styles.infoValue}>{data.className}</span>
                <span className={styles.infoLabelAr}>الصف</span>
              </div>
              <div className={styles.infoGridRow}>
                <span className={styles.infoLabel}>Branch:</span>
                <span className={styles.infoValue}>Branch1</span>
                <span className={styles.infoLabel}>Academic Year:</span>
                <span className={styles.infoValue}>{schoolInfo.academicYear || ''}</span>
              </div>
            </div>

            <div className={styles.parentSection}>
              <div className={styles.parentSignature}>
                <span className={styles.sigLabel}>Parent's/Guardian's Signature:</span>
                <div className={styles.sigLine}></div>
                <span className={styles.sigDate}>Date: ________</span>
              </div>
            </div>

            <div className={styles.tableArea}>
              <div className={styles.tableWrap}>
                <table className={styles.marksTable}>
                <thead>
                  <tr>
                    <th className={styles.subjCol}>Subject</th>
                    {terms.map(tn => (
                      <th key={tn} className={styles.termCol}>{getTermLabel(tn)}</th>
                    ))}
                    <th className={styles.avgCol}>Average</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.length === 0 ? (
                    <tr>
                      <td colSpan={terms.length + 2} className={styles.noGradesCell}>
                        No grades entered yet
                      </td>
                    </tr>
                  ) : (
                    subjects.map((subject, idx) => {
                      const sd = data.subjectsData?.[subject] || {};
                      return (
                        <tr key={idx}>
                          <td className={styles.subjCell}>
                            <span className={styles.subjNameEng}>{subject}</span>
                            <span className={styles.subjNameAr}>{getSubjectArabic(subject)}</span>
                          </td>
                          {terms.map(tn => (
                            <td key={tn} className={styles.markCell}>{sd.marks?.[tn] || ''}</td>
                          ))}
                          <td className={styles.avgCell}>{sd.average || ''}</td>
                        </tr>
                      );
                    })
                  )}
                  <tr className={styles.totalRow}>
                    <td className={styles.summaryLabel}>Total</td>
                    {terms.map(tn => (
                      <td key={tn} className={styles.summaryCell}>{data.totals?.[tn] || ''}</td>
                    ))}
                    <td className={styles.summaryCell}>{data.combinedAverage || ''}</td>
                  </tr>
                  <tr className={styles.avgRow}>
                    <td className={styles.summaryLabel}>Average</td>
                    {terms.map(tn => (
                      <td key={tn} className={styles.summaryCell}>{data.averages?.[tn] || ''}</td>
                    ))}
                    <td className={styles.summaryCell}>{data.combinedAverage || ''}</td>
                  </tr>
                  <tr className={styles.rankRow}>
                    <td className={styles.summaryLabel}>Rank</td>
                    {terms.map(tn => (
                      <td key={tn} className={styles.summaryCell}>{data.studentRanks?.[tn] || '-'}</td>
                    ))}
                    <td className={styles.summaryCell}>{data.studentRanks?.[terms[0]] || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.gradingSection}>
              <div className={styles.gradingRow}>
                <span className={styles.gradingTitle}>Grading Scale:</span>
                <span>A+ (90-100)</span>
                <span>A (80-89)</span>
                <span>B+ (70-79)</span>
                <span>B (60-69)</span>
                <span>C (50-59)</span>
                <span>D (40-49)</span>
                <span>F (&lt; 40)</span>
              </div>
              <div className={styles.signatureRow}>
                <div className={styles.signatureBlock}>
                  <span className={styles.signatureLabel}>Class Teacher's Signature</span>
                  <div className={styles.sigLine2}></div>
                </div>
                <div className={styles.signatureBlock}>
                  <span className={styles.signatureLabel}>School Director's Signature</span>
                  <div className={styles.sigLine2}></div>
                </div>
              </div>
            </div>
            </div>

            <div className={styles.footerSection}>
              <div className={styles.footerDeco}>
                <div className={styles.footerLine}></div>
                <div>
                  <div className={styles.footerBrand}>SKOOLIFIC</div>
                  <div className={styles.footerTagline}>School management system</div>
                </div>
                <div className={styles.footerLine}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCardFront;