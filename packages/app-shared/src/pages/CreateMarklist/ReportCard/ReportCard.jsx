// ReportCard.jsx - V2 Report Cards
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../utils/api';
import styles from './ReportCard.module.css';
import { Award, Download, Loader2, Printer, School, User, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getFileUrl } from '../../List/utils/fileUtils';

import Button from '../../../COMPONENTS/Button/Button';
import Select from '../../../COMPONENTS/Select/Select';
import Card from '../../../COMPONENTS/Card/Card';

const ReportCard = () => {
  const { t } = useTranslation();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printAllStudents, setPrintAllStudents] = useState(false);
  const [allStudentsData, setAllStudentsData] = useState([]);

  const [schoolInfo, setSchoolInfo] = useState({
    name: 'SCHOOL ACADEMY',
    address: '',
    phone: '+251775669 : 0911775841 : 0915710209',
    email: 'adilh5254@gmail.com',
    academicYear: '',
    logo: null
  });

  const printContainerRef = useRef(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [classesRes, brandingRes] = await Promise.all([
          api.get('/mark-list/classes'),
          api.get('/admin/branding')
        ]);
        
        setClasses(classesRes.data || []);
        if (classesRes.data?.length > 0) setSelectedClass(classesRes.data[0]);
        
        const branding = brandingRes.data;
        setSchoolInfo(prev => ({
          ...prev,
          name: branding.website_name || 'SCHOOL ACADEMY',
          address: branding.school_address || '',
          phone: branding.school_phone || '+251775669 : 0911775841 : 0915710209',
          email: branding.school_email || 'adilh5254@gmail.com',
          academicYear: branding.academic_year || '',
          logo: branding.school_logo ? `${import.meta.env.VITE_API_URL.replace('/api', '')}/uploads/branding/${branding.school_logo}` : null
        }));
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    const fetchStudents = async () => {
      try {
        const response = await api.get(`/mark-list/comprehensive-ranking/${selectedClass}/1`);
        const studentList = response.data.rankings || [];
        setStudents(studentList);
        if (studentList.length > 0) setSelectedStudent(studentList[0].studentName);
        else setSelectedStudent('');
      } catch (error) {
        console.error('Error fetching students:', error);
        setStudents([]);
      }
    };
    fetchStudents();
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClass || !selectedStudent) return;
    fetchReportData();
  }, [selectedClass, selectedStudent]);

  const fetchReportData = async () => {
    setLoadingReport(true);
    try {
      const [term1Res, term2Res] = await Promise.all([
        api.get(`/mark-list/comprehensive-ranking/${selectedClass}/1`),
        api.get(`/mark-list/comprehensive-ranking/${selectedClass}/2`)
      ]);

      const term1Rankings = term1Res.data.rankings || [];
      const term2Rankings = term2Res.data.rankings || [];

      const student1 = term1Rankings.find(s => s.studentName === selectedStudent);
      const student2 = term2Rankings.find(s => s.studentName === selectedStudent);

      if (student1 || student2) {
        // Try to get gender, age, and photo from student list API
        let studentGender = '';
        let studentAge = '';
        let studentPhoto = '';
        try {
          const studentListRes = await api.get(`/student-list/students/${selectedClass}`);
          const studentInfo = studentListRes.data.find(s => s.student_name === selectedStudent);
          
          console.log('Student Info:', studentInfo); // Debug log
          
          studentGender = studentInfo?.gender || studentInfo?.sex || '';
          studentAge = studentInfo?.age || '';
          
          // Get photo URL using the same utility function as ListStudent
          if (studentInfo?.image_student) {
            studentPhoto = getFileUrl(studentInfo.image_student, 'student');
            console.log('Photo URL:', studentPhoto); // Debug log
          } else {
            console.log('No image_student found'); // Debug log
          }
          
          console.log('Gender:', studentGender, 'Age:', studentAge); // Debug log
        } catch (error) {
          console.log('Could not fetch student info:', error.message);
        }

        // Fetch activity data for both terms
        let activities = { term1: null, term2: null };
        try {
          const activitiesRes = await api.get(`/student-activities/activities/${selectedClass}/${selectedStudent}`);
          const activityData = activitiesRes.data.activities || [];
          activities.term1 = activityData.find(a => a.term_number === 1) || null;
          activities.term2 = activityData.find(a => a.term_number === 2) || null;
        } catch (error) {
          console.log('Could not fetch activity data:', error.message);
        }

        const combinedData = {
          studentName: selectedStudent,
          className: selectedClass,
          totalStudents: term1Rankings.length,
          term1: student1 || null,
          term2: student2 || null,
          subjectsData: combineSubjects(student1, student2),
          rank: {
            term1: student1?.rank || '-',
            term2: student2?.rank || '-',
            combined: student1?.rank || student2?.rank || '-'
          },
          gender: studentGender,
          age: studentAge,
          photo: studentPhoto,
          activities: activities
        };
        
        console.log('Combined Data:', combinedData); // Debug log
        setReportData(combinedData);
      } else {
        setReportData(null);
      }

      // Fetch all students for print all - fetch gender once for all students
      let studentListData = [];
      try {
        const studentListRes = await api.get(`/student-list/students/${selectedClass}`);
        studentListData = studentListRes.data || [];
      } catch (error) {
        console.log('Could not fetch student list:', error.message);
      }

      // Fetch all activities for the class
      let allActivities = [];
      try {
        const allActivitiesRes = await api.get(`/student-activities/activities/${selectedClass}/all`);
        allActivities = allActivitiesRes.data.activities || [];
      } catch (error) {
        console.log('Could not fetch all activities:', error.message);
      }

      const allStudentsWithData = term1Rankings.map(student => {
        const student2Data = term2Rankings.find(s => s.studentName === student.studentName);
        
        // Get gender, age, and photo from the fetched student list
        const studentInfo = studentListData.find(s => s.student_name === student.studentName);
        const studentGender = studentInfo?.gender || studentInfo?.sex || '';
        const studentAge = studentInfo?.age || '';
        
        // Get photo URL using the same utility function as ListStudent
        const studentPhoto = studentInfo?.image_student ? getFileUrl(studentInfo.image_student, 'student') : '';

        // Get activities for this student
        const studentActivities = allActivities.filter(a => a.student_name === student.studentName);
        const activities = {
          term1: studentActivities.find(a => a.term_number === 1) || null,
          term2: studentActivities.find(a => a.term_number === 2) || null
        };

        return {
          studentName: student.studentName,
          className: selectedClass,
          totalStudents: term1Rankings.length,
          term1: student,
          term2: student2Data || null,
          subjectsData: combineSubjects(student, student2Data),
          rank: {
            term1: student?.rank || '-',
            term2: student2Data?.rank || '-',
            combined: student?.rank || '-'
          },
          gender: studentGender,
          age: studentAge,
          photo: studentPhoto,
          activities: activities
        };
      });
      setAllStudentsData(allStudentsWithData);
    } catch (error) {
      console.error('Error fetching report:', error);
      setReportData(null);
    } finally {
      setLoadingReport(false);
    }
  };

  const combineSubjects = (term1Data, term2Data) => {
    const combined = {};
    
    // Get all unique subjects from both terms
    const allSubjects = new Set();
    
    if (term1Data?.subjects) {
      Object.keys(term1Data.subjects).forEach(subject => allSubjects.add(subject));
    }
    
    if (term2Data?.subjects) {
      Object.keys(term2Data.subjects).forEach(subject => allSubjects.add(subject));
    }
    
    // Calculate totals for each term
    let term1Total = 0;
    let term2Total = 0;
    let term1Count = 0;
    let term2Count = 0;
    
    // Combine data for each subject
    allSubjects.forEach(subject => {
      const term1Mark = term1Data?.subjects?.[subject]?.total || '';
      const term2Mark = term2Data?.subjects?.[subject]?.total || '';
      
      // Add to totals if marks exist
      if (term1Mark) {
        term1Total += parseFloat(term1Mark);
        term1Count++;
      }
      if (term2Mark) {
        term2Total += parseFloat(term2Mark);
        term2Count++;
      }
      
      const average = (term1Mark && term2Mark) 
        ? ((parseFloat(term1Mark) + parseFloat(term2Mark)) / 2).toFixed(1)
        : term1Mark || term2Mark || '';
      
      combined[subject] = {
        term1: term1Mark,
        term2: term2Mark,
        average: average
      };
    });

    // Calculate averages
    const term1Average = term1Count > 0 ? (term1Total / term1Count).toFixed(1) : '';
    const term2Average = term2Count > 0 ? (term2Total / term2Count).toFixed(1) : '';
    const combinedTotal = term1Total + term2Total;
    const combinedCount = Math.max(term1Count, term2Count);
    const combinedAverage = combinedCount > 0 ? (combinedTotal / (term1Count + term2Count)).toFixed(1) : '';

    return {
      subjects: combined,
      totals: {
        term1: term1Total > 0 ? term1Total.toFixed(0) : '',
        term2: term2Total > 0 ? term2Total.toFixed(0) : '',
        combined: combinedTotal > 0 ? combinedTotal.toFixed(0) : ''
      },
      averages: {
        term1: term1Average,
        term2: term2Average,
        combined: combinedAverage
      }
    };
  };

  const handlePrint = (printAll = false) => {
    setPrintAllStudents(printAll);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 500);
    }, 100);
  };

  const handleDownloadPDF = async () => {
    if (!reportData) return;
    
    try {
      setIsPrinting(true);
      
      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const cardsToProcess = printAllStudents && allStudentsData.length > 0 
        ? allStudentsData 
        : [reportData];
      
      // A5 dimensions in mm (portrait)
      const pdfWidth = 148; // A5 width in mm
      const pdfHeight = 210; // A5 height in mm
      
      let pdf = null;
      
      for (let i = 0; i < cardsToProcess.length; i++) {
        const studentData = cardsToProcess[i];
        
        // Find the report card element for this student
        const reportCards = printContainerRef.current?.querySelectorAll(`.${styles.reportCard}`) || 
                           document.querySelectorAll(`.${styles.reportCard}`);
        const reportCard = reportCards[i];
        
        if (!reportCard) continue;
        
        // Get front and back pages
        const frontPage = reportCard.querySelector(`.${styles.frontPage}`);
        const backPage = reportCard.querySelector(`.${styles.backPage}`);
        
        if (frontPage) {
          // Capture front page
          const frontCanvas = await html2canvas(frontPage, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: frontPage.scrollWidth,
            windowHeight: frontPage.scrollHeight
          });
          
          const frontImgData = frontCanvas.toDataURL('image/jpeg', 0.95);
          
          // Calculate dimensions to fit A5 page
          const canvasRatio = frontCanvas.height / frontCanvas.width;
          const imgWidth = pdfWidth;
          const imgHeight = pdfWidth * canvasRatio;
          
          // Create PDF with custom height if needed
          if (!pdf) {
            pdf = new jsPDF('p', 'mm', [pdfWidth, Math.max(pdfHeight, imgHeight)]);
          } else {
            pdf.addPage([pdfWidth, Math.max(pdfHeight, imgHeight)]);
          }
          
          // Add front page - fit to page width
          pdf.addImage(frontImgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        }
        
        if (backPage) {
          // Capture back page
          const backCanvas = await html2canvas(backPage, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: backPage.scrollWidth,
            windowHeight: backPage.scrollHeight
          });
          
          const backImgData = backCanvas.toDataURL('image/jpeg', 0.95);
          
          // Calculate dimensions to fit A5 page
          const canvasRatio = backCanvas.height / backCanvas.width;
          const imgWidth = pdfWidth;
          const imgHeight = pdfWidth * canvasRatio;
          
          // Add back page with custom height if needed
          pdf.addPage([pdfWidth, Math.max(pdfHeight, imgHeight)]);
          pdf.addImage(backImgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        }
      }
      
      if (!pdf) {
        alert('No pages to generate');
        return;
      }
      
      // Save PDF
      const fileName = printAllStudents 
        ? `BilalReportCards_${selectedClass}_All.pdf`
        : `BilalReportCard_${selectedClass}_${selectedStudent}.pdf`;
      
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Single Report Card Component - Bilal School Design
  const SingleIqraCard = ({ data }) => {
    if (!data) return null;

    const subjects = Object.keys(data.subjectsData?.subjects || {}).sort();

    return (
      <div className={styles.reportCard}>
        {/* BACK PAGE LEFT - Grading System (Oromo & English) */}
        <div className={styles.backPageLeft}>
          <div className={styles.gradingSystemSection}>
            <h3 className={styles.gradingTitle}>SEERA KENNAA QABXII</h3>
            <p className={styles.gradingIntro}>
              Haalli sadarkaa qabxii barataa itti galmeeffamu akka armaan gaditti ramadama:
            </p>
            
            <div className={styles.gradingList}>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>90% - 100%</span>
                <span className={styles.gradeDesc}>kan argate haalaan gaariidha</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>80% - 89%</span>
                <span className={styles.gradeDesc}>kan argate gaariidha</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>60% - 79%</span>
                <span className={styles.gradeDesc}>kan argate quubsaadha</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>50% - 59%</span>
                <span className={styles.gradeDesc}>kan argate gahaadha</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>%50 gad</span>
                <span className={styles.gradeDesc}>kan argate haalaan xiqqaadha</span>
              </div>
            </div>

            <p className={styles.gradingNote}>
              Yeroo hunda barataa/ttuu barachaa ture tokkoof dhiibba irraa duwwaan (%0) hin kennamuuf. 
              Duwwaa kennuu jechuun barataan kun hin baranne jechuu wan taheef yoo hin baranne hafaa/tte 
              "H" jechamee barreefama.
            </p>

            <h3 className={styles.gradingTitle}>METHOD OF RANKING</h3>
            <p className={styles.gradingIntro}>
              Students achievement in class will be assigned the following values:
            </p>
            
            <div className={styles.gradingList}>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>90-100%</span>
                <span className={styles.gradeDesc}>Excellent</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>80-89%</span>
                <span className={styles.gradeDesc}>Very good</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>60-79%</span>
                <span className={styles.gradeDesc}>Satisfactory</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>50-59%</span>
                <span className={styles.gradeDesc}>Fair</span>
              </div>
              <div className={styles.gradeRow}>
                <span className={styles.gradeRange}>Below 50%</span>
                <span className={styles.gradeDesc}>Poor</span>
              </div>
            </div>

            <p className={styles.gradingNote}>
              A mark Zero (0) should never be given since it would mean no work has been done absolutely. 
              If a student has been absent from class for whole period covered and has not made up any of 
              the work he/she should be marked "AB" for "Absent".
            </p>
          </div>
        </div>

        {/* BACK PAGE RIGHT - Student Information */}
        <div className={styles.backPageRight}>
          <div className={styles.schoolHeader}>
            {schoolInfo.logo && (
              <img src={schoolInfo.logo} alt="School Logo" className={styles.headerLogo} />
            )}
            <div className={styles.schoolInfo}>
              <h2 className={styles.schoolNameArabic}>مدرسة بلال الإسلامية دريدوا</h2>
              <h2 className={styles.schoolNameOromo}>MANA BARNOOTA BILAAL SADARKAA 1<sup>HAA</sup> FI 2<sup>FFAA</sup></h2>
              <h2 className={styles.schoolNameOromo}>DIRREE DAWAA</h2>
              <h2 className={styles.schoolNameAmharic}>ቢላል እስላማዊ አንደኛ እና ሁለተኛ ደረጃ የህዝብ ት/ቤት - ድሬ ዳዋ</h2>
              <p className={styles.contactInfo}>
                ☎ 0254119494 | E-mail: bilalschool19@gmail.com | Dire Dawa
              </p>
            </div>
          </div>

          <h3 className={styles.reportCardTitle}>STUDENT'S REPORT CARD</h3>

          <div className={styles.studentInfoSection}>
            <div className={styles.infoField}>
              <span className={styles.fieldLabel}>Maqaa Barataa/ttuu / Name of Student:</span>
              <span className={styles.fieldValue}>{data.studentName}</span>
              <span className={styles.fieldLabelArabic}>(إسم الطالب)</span>
            </div>

            <div className={styles.infoFieldRow}>
              <div className={styles.infoFieldHalf}>
                <span className={styles.fieldLabel}>Saala (Sex):</span>
                <span className={styles.fieldValue}>{data.gender || '_____'}</span>
                <span className={styles.fieldLabelArabic}>(الجنس)</span>
              </div>
              <div className={styles.infoFieldHalf}>
                <span className={styles.fieldLabel}>Umrii (Age):</span>
                <span className={styles.fieldValue}>{data.age || '_____'}</span>
                <span className={styles.fieldLabelArabic}>(العمر)</span>
              </div>
            </div>

            <div className={styles.infoField}>
              <span className={styles.fieldLabel}>Araddaa (Kebele):</span>
              <span className={styles.fieldValue}>__________</span>
              <span className={styles.fieldLabel}>L.Manaa (H.No.):</span>
              <span className={styles.fieldValue}>__________</span>
              <span className={styles.fieldLabel}>L.Mob. (Mob.No.):</span>
              <span className={styles.fieldValue}>__________</span>
            </div>

            <div className={styles.infoField}>
              <span className={styles.fieldLabel}>Bulchiinsa naannoo (Administrative region):</span>
              <span className={styles.fieldValue}>Dire Dawa</span>
              <span className={styles.fieldLabelArabic}>(المحافظة)</span>
            </div>

            <div className={styles.infoField}>
              <span className={styles.fieldLabel}>Bara barnootaa (Academic year):</span>
              <span className={styles.fieldValue}>{schoolInfo.academicYear || '2016'}</span>
              <span className={styles.fieldLabelArabic}>(العام الدراسي)</span>
            </div>

            <div className={styles.infoFieldRow}>
              <div className={styles.infoFieldHalf}>
                <span className={styles.fieldLabel}>Kutaa (Grade):</span>
                <span className={styles.fieldValue}>{data.className}</span>
                <span className={styles.fieldLabelArabic}>(الصف)</span>
              </div>
              <div className={styles.infoFieldHalf}>
                <span className={styles.fieldLabel}>Gara kutaa itti dabare/tte (Promoted to grade):</span>
                <span className={styles.fieldValue}>_____</span>
                <span className={styles.fieldLabelArabic}>(منقول)</span>
              </div>
            </div>

            <div className={styles.infoField}>
              <span className={styles.fieldLabel}>Promoted/Dabarte/tte:</span>
              <span className={styles.fieldValue}>Promoted</span>
            </div>

            <div className={styles.signatureSection}>
              <div className={styles.signatureField}>
                <span className={styles.fieldLabel}>Maqaa fi mallattoo dura bu'aa M/B (Director's name and signature):</span>
                <div className={styles.signatureLine}>
                  <span className={styles.fieldValue}>Yuusuf Ahmad</span>
                </div>
              </div>
            </div>

            <div className={styles.schoolFooter}>
              <p className={styles.schoolFooterText}>የቢላል እስላማዊ 2ኛ ደረጃ ም/ር/መምህር</p>
            </div>
          </div>
        </div>

        {/* FRONT PAGE - Top and Bottom Layout */}
        <div className={styles.frontPage}>
          {/* TOP SECTION - Student Information */}
          <div className={styles.frontTop}>
            <div className={styles.frontTopHeader}>
              <div className={styles.photoBoxFront}>
                {data.photo ? (
                  <img src={data.photo} alt="Student" className={styles.studentPhoto} />
                ) : (
                  <div className={styles.photoPlaceholder}>Photo</div>
                )}
              </div>
              
              <div className={styles.schoolInfoBox}>
                <div className={styles.schoolNameArabic}>مدرسة بلال الإسلامية دريدوا</div>
                <div className={styles.schoolNameOromo}>MANA BARNOOTA BILAAL SADARKAA 1<sup>HAA</sup> FI 2<sup>FFAA</sup></div>
                <div className={styles.schoolNameOromo}>DIRREE DAWAA</div>
                <div className={styles.schoolNameAmharic}>ቢላል እስላማዊ አንደኛ እና ሁለተኛ ደረጃ የህዝብ ት/ቤት - ድሬ ዳዋ</div>
                <div className={styles.contactInfo}>☎ 0254119494 | E-mail: bilalschool19@gmail.com | Dire Dawa</div>
              </div>
            </div>

            <h3 className={styles.reportCardTitle}>STUDENT'S REPORT CARD</h3>

            <div className={styles.studentInfoGrid}>
              <div className={styles.infoFieldFrontTop}>
                <span className={styles.fieldLabelFrontTop}>Maqaa Barataa/ttuu / Name of Student:</span>
                <span className={styles.fieldValueFrontTop}>{data.studentName}</span>
                <span className={styles.fieldLabelArabic}>(إسم الطالب)</span>
              </div>

              <div className={styles.infoRowFrontTop}>
                <div className={styles.infoFieldHalfFrontTop}>
                  <span className={styles.fieldLabelFrontTop}>Saala (Sex):</span>
                  <span className={styles.fieldValueFrontTop}>{data.gender || '_____'}</span>
                  <span className={styles.fieldLabelArabic}>(الجنس)</span>
                </div>
                <div className={styles.infoFieldHalfFrontTop}>
                  <span className={styles.fieldLabelFrontTop}>Umrii (Age):</span>
                  <span className={styles.fieldValueFrontTop}>{data.age || '_____'}</span>
                  <span className={styles.fieldLabelArabic}>(العمر)</span>
                </div>
              </div>

              <div className={styles.infoFieldFrontTop}>
                <span className={styles.fieldLabelFrontTop}>Bulchiinsa naannoo (Administrative region):</span>
                <span className={styles.fieldValueFrontTop}>Dire Dawa</span>
                <span className={styles.fieldLabelArabic}>(المحافظة)</span>
              </div>

              <div className={styles.infoRowFrontTop}>
                <div className={styles.infoFieldHalfFrontTop}>
                  <span className={styles.fieldLabelFrontTop}>Bara barnootaa (Academic year):</span>
                  <span className={styles.fieldValueFrontTop}>{schoolInfo.academicYear || '2016'}</span>
                  <span className={styles.fieldLabelArabic}>(العام الدراسي)</span>
                </div>
                <div className={styles.infoFieldHalfFrontTop}>
                  <span className={styles.fieldLabelFrontTop}>Kutaa (Grade):</span>
                  <span className={styles.fieldValueFrontTop}>{data.className}</span>
                  <span className={styles.fieldLabelArabic}>(الصف)</span>
                </div>
              </div>

              <div className={styles.infoRowFrontTop}>
                <div className={styles.infoFieldHalfFrontTop}>
                  <span className={styles.fieldLabelFrontTop}>Gara kutaa itti dabare/tte (Promoted to grade):</span>
                  <span className={styles.fieldValueFrontTop}>_____</span>
                  <span className={styles.fieldLabelArabic}>(منقول)</span>
                </div>
                <div className={styles.infoFieldHalfFrontTop}>
                  <span className={styles.fieldLabelFrontTop}>Promoted/Dabarte/tte:</span>
                  <span className={styles.promotedBadge}>Promoted</span>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION - Subjects Table */}
          <div className={styles.frontBottom}>
            <h3 className={styles.sectionTitleBottom}>Academic Performance / Raawwii Barnootaa</h3>
            
            <table className={styles.frontMarksTable}>
              <thead>
                <tr>
                  <th rowSpan="2" className={styles.subjectColFront}>
                    <div>Gosa barnootaa</div>
                    <div>Subjects</div>
                    <div className={styles.arabicTextSmall}>المواد الدراسية</div>
                  </th>
                  <th>
                    <div>Sem.1ffaa</div>
                    <div>(1st Sem)</div>
                  </th>
                  <th>
                    <div>Sem.2ffaa</div>
                    <div>(2nd Sem)</div>
                  </th>
                  <th>
                    <div>Cunfaa</div>
                    <div>(Average)</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subject, idx) => {
                  const subjectData = data.subjectsData.subjects[subject] || {};
                  // Map subject names to Arabic
                  const subjectArabicMap = {
                    'Tafseer': 'التفسير',
                    'Tafsiira': 'التفسير',
                    'Islamic Education': 'التربية الاسلامية',
                    'Tarbiyaa': 'التربية الاسلامية',
                    'Arabic Language': 'اللغة العربية',
                    'Arabiffaa': 'اللغة العربية',
                    'English': 'الانجليزية',
                    'Ingiliffaa': 'الانجليزية',
                    'Mathematics': 'الرياضيات',
                    'Herrega': 'الرياضيات',
                    'Biology': 'العلوم',
                    'Saayinsii': 'العلوم',
                    'Chemistry': 'الكيمياء',
                    'Keemistirrii': 'الكيمياء',
                    'Physics': 'الفيزياء',
                    'Fiiziksii': 'الفيزياء',
                    'Agriculture': 'زراعة',
                    'Qonnaa': 'زراعة',
                    'ICT': 'الكومبيوتر',
                    'Aaytii': 'الكومبيوتر',
                    'Computer': 'الكومبيوتر',
                    'History': 'التاريخ',
                    'Geography': 'الجغرافيا',
                    'Civics': 'التربية المدنية',
                    'Amharic': 'الأمهرية',
                    'Oromo': 'الأورومية'
                  };
                  
                  const arabicName = subjectArabicMap[subject] || 'المادة';
                  
                  return (
                    <tr key={idx}>
                      <td className={styles.subjectNameFront}>
                        <div className={styles.subjectOromo}>{subject}</div>
                        <div className={styles.subjectArabic}>{arabicName}</div>
                      </td>
                      <td className={styles.markCell}>{subjectData.term1 || ''}</td>
                      <td className={styles.markCell}>{subjectData.term2 || ''}</td>
                      <td className={styles.avgCell}>{subjectData.average || ''}</td>
                    </tr>
                  );
                })}
                <tr className={styles.conductRow}>
                  <td className={styles.subjectNameFront}>
                    <div className={styles.subjectOromo}>Amala / Conduct</div>
                    <div className={styles.subjectArabic}>السلوك</div>
                  </td>
                  <td className={styles.conductCell} colSpan="3"></td>
                </tr>
                <tr className={styles.conductRow}>
                  <td className={styles.subjectNameFront}>
                    <div className={styles.subjectOromo}>G.Hafe / Absent</div>
                    <div className={styles.subjectArabic}>المواظبه</div>
                  </td>
                  <td className={styles.conductCell} colSpan="3"></td>
                </tr>
                <tr className={styles.totalRowFront}>
                  <td className={styles.subjectNameFront}>
                    <div className={styles.subjectOromo}>Ida'ama / Total</div>
                    <div className={styles.subjectArabic}>المجموع</div>
                  </td>
                  <td className={styles.totalCell}>{data.subjectsData.totals?.term1 || ''}</td>
                  <td className={styles.totalCell}>{data.subjectsData.totals?.term2 || ''}</td>
                  <td className={styles.totalAvgCell}>{data.subjectsData.totals?.combined || ''}</td>
                </tr>
                <tr className={styles.totalRowFront}>
                  <td className={styles.subjectNameFront}>
                    <div className={styles.subjectOromo}>Cuunfaa / Average</div>
                    <div className={styles.subjectArabic}>المعدل</div>
                  </td>
                  <td className={styles.totalCell}>{data.subjectsData.averages?.term1 || ''}</td>
                  <td className={styles.totalCell}>{data.subjectsData.averages?.term2 || ''}</td>
                  <td className={styles.totalAvgCell}>{data.subjectsData.averages?.combined || ''}</td>
                </tr>
                <tr className={styles.rankRow}>
                  <td className={styles.subjectNameFront}>
                    <div className={styles.subjectOromo}>Sadarkaa / Rank</div>
                    <div className={styles.subjectArabic}>الدرجة</div>
                  </td>
                  <td className={styles.rankCell}>{data.rank?.term1 || ''}</td>
                  <td className={styles.rankCell}>{data.rank?.term2 || ''}</td>
                  <td className={styles.rankAvgCell}>{data.rank?.combined || ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const classOptions = useMemo(
    () => classes.map((cls) => ({ value: cls, label: cls })),
    [classes]
  );
  const studentOptions = useMemo(
    () =>
      students.map((s) => ({
        value: s.studentName,
        label: `${s.studentName} (#${s.rank})`
      })),
    [students]
  );

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spinner} size={32} />
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${isPrinting ? styles.printMode : ''}`}>
      {!isPrinting && (
        <div className={styles.screenOnly}>
          <div className={styles.pageHeader}>
            <Award className={styles.headerIcon} size={28} />
            <div>
              <h1 className={styles.pageTitle}>{t('academic.reportCards.title', 'Report Cards')}</h1>
              <p className={styles.pageSubtitle}>
                {t('academic.reportCards.subtitle', 'View, print, and download student report cards')}
              </p>
            </div>
          </div>

          <Card className={styles.controlsCard}>
            <div className={styles.controls}>
              <Select
                label={t('academic.markLists.class', 'Class')}
                value={selectedClass}
                onChange={setSelectedClass}
                options={classOptions}
                placeholder={t('academic.reportCards.noClasses', 'No classes')}
              />
              <Select
                label={t('academic.reportCards.student', 'Student')}
                value={selectedStudent}
                onChange={setSelectedStudent}
                options={studentOptions}
                disabled={students.length === 0}
                placeholder={t('academic.reportCards.noStudents', 'No students')}
              />
              <div className={styles.actionButtons}>
                <Button variant="primary" icon={<Printer size={16} />} onClick={() => handlePrint(false)} disabled={!reportData}>
                  {t('academic.reportCards.printSingle', 'Print single')}
                </Button>
                <Button variant="secondary" icon={<Users size={16} />} onClick={() => handlePrint(true)} disabled={allStudentsData.length === 0}>
                  {t('academic.reportCards.printAll', 'Print all')} ({allStudentsData.length})
                </Button>
                <Button variant="secondary" icon={<Download size={16} />} onClick={handleDownloadPDF} disabled={!reportData}>
                  {t('academic.reportCards.downloadPdf', 'Download PDF')}
                </Button>
              </div>
            </div>
          </Card>

          {loadingReport ? (
            <div className={styles.loadingReport}>
              <Loader2 className={styles.spinner} size={24} />
              <p>{t('academic.reportCards.loading', 'Loading report...')}</p>
            </div>
          ) : !reportData ? (
            <div className={styles.noData}>
              <User className={styles.noDataIcon} size={40} />
              <h3>{t('academic.reportCards.noData', 'No data available')}</h3>
              <p>{t('academic.reportCards.noDataHint', 'Select a class and student with marks.')}</p>
            </div>
          ) : (
            <div className={styles.previewSection}>
              <h3>Preview - Bilal School Report Card (A5 Portrait)</h3>
              <div className={styles.previewCard}>
                <SingleIqraCard data={reportData} />
              </div>
            </div>
          )}
        </div>
      )}

      {isPrinting && (
        <div className={styles.printContainer} ref={printContainerRef}>
          {printAllStudents && allStudentsData.length > 0 ? (
            allStudentsData.map((studentData, index) => (
              <div key={index} className={styles.printCard}>
                <SingleIqraCard data={studentData} />
              </div>
            ))
          ) : reportData ? (
            <div className={styles.printCard}>
              <SingleIqraCard data={reportData} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ReportCard;
