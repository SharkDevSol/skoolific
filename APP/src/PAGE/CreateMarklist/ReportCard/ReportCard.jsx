// ReportCard.jsx - School Report Card Design
import React, { useState, useEffect, useRef } from 'react';
import api from '../../../utils/api';
import styles from './ReportCard.module.css';
import { 
  FaPrint, FaUserGraduate, FaSchool, 
  FaSpinner, FaAward,
  FaDownload, FaUsers, FaImage
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useApp } from '../../../context/AppContext';
import { getFileUrl } from '../../List/utils/fileUtils';
import ReportCardFront from './ReportCardFront';

const ReportCard = () => {
  const { theme } = useApp();
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
  const [termCount, setTermCount] = useState(2);

  const [schoolInfo, setSchoolInfo] = useState({
    name: 'SCHOOL ACADEMY',
    address: '',
    phone: '+251775669 : 0911775841 : 0915710209',
    email: 'adilh5254@gmail.com',
    academicYear: '',
    logo: null,
    website_icon: null
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
        const baseUrl = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : '';
        setSchoolInfo(prev => ({
          ...prev,
          name: branding.website_name || 'SCHOOL ACADEMY',
          address: branding.school_address || '',
          phone: branding.school_phone || '+251775669 : 0911775841 : 0915710209',
          email: branding.school_email || 'adilh5254@gmail.com',
          academicYear: branding.academic_year || '',
          logo: branding.school_logo ? `${baseUrl}/uploads/branding/${branding.school_logo}` : null,
          website_icon: branding.website_icon ? `${baseUrl}/uploads/branding/${branding.website_icon}` : null
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
        const response = await api.get(`/mark-list/full-ranking/${selectedClass}`);
        const data = response.data;
        setTermCount(data.termCount || 2);
        const allRankings = data.terms?.[0]?.rankings || [];
        setStudents(allRankings);
        if (allRankings.length > 0) setSelectedStudent(allRankings[0].studentName);
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
      const fullRes = await api.get(`/mark-list/full-ranking/${selectedClass}`);
      const fullData = fullRes.data;
      const termsData = fullData.terms || [];
      const termCount = fullData.termCount || termsData.length || 2;
      const allSubjects = fullData.allSubjects || [];

      const studentData = {};
      let studentGender = '';
      let studentAge = '';
      let studentPhoto = '';

      // Get student info from student list API
      try {
        const studentListRes = await api.get(`/student-list/students/${selectedClass}`);
        const studentInfo = studentListRes.data.find(s => s.student_name === selectedStudent);
        studentGender = studentInfo?.gender || studentInfo?.sex || '';
        studentAge = studentInfo?.age || '';
        if (studentInfo?.image_student) {
          studentPhoto = getFileUrl(studentInfo.image_student, 'student');
        }
      } catch (error) {
        console.log('Could not fetch student info:', error.message);
      }

      // Find the student in each term and build subject data
      const termData = {};
      const studentRanks = {};

      termsData.forEach(term => {
        const tn = term.termNumber;
        const student = term.rankings.find(s => s.studentName === selectedStudent);
        if (student) {
          termData[tn] = student;
          studentRanks[tn] = student.rank || '-';
        }
      });

      // Build combined subject data with all terms
      const combinedSubjects = {};
      let totals = {};
      let counts = {};

      allSubjects.forEach(subject => {
        combinedSubjects[subject] = {};
        allSubjects.forEach(s => combinedSubjects[subject][s] = undefined);
        
        const marks = {};
        let sum = 0;
        let count = 0;

        termsData.forEach(term => {
          const tn = term.termNumber;
          const student = termData[tn];
          const mark = student?.subjects?.[subject]?.total || '';
          marks[tn] = mark;
          if (mark) {
            sum += parseFloat(mark);
            count++;
            totals[tn] = (totals[tn] || 0) + parseFloat(mark);
            counts[tn] = (counts[tn] || 0) + 1;
          }
        });

        combinedSubjects[subject] = {
          marks,
          average: count > 0 ? (sum / count).toFixed(1) : ''
        };
      });

      // Calculate term totals and averages
      const termTotals = {};
      const termAverages = {};
      let combinedTotal = 0;
      let combinedCount = 0;

      termsData.forEach(term => {
        const tn = term.termNumber;
        const t = totals[tn] || 0;
        const c = counts[tn] || 0;
        termTotals[tn] = t > 0 ? t.toFixed(0) : '';
        termAverages[tn] = c > 0 ? (t / c).toFixed(1) : '';
        combinedTotal += t;
        combinedCount += c;
      });

      const report = {
        studentName: selectedStudent,
        className: selectedClass,
        termCount,
        terms: termsData.map(t => t.termNumber),
        termData,
        studentRanks,
        subjects: allSubjects,
        subjectsData: combinedSubjects,
        totals: termTotals,
        averages: termAverages,
        combinedAverage: combinedCount > 0 ? (combinedTotal / combinedCount).toFixed(1) : '',
        gender: studentGender,
        age: studentAge,
        photo: studentPhoto,
      };

      setReportData(report);

      // Build all students data for print all
      const allWithData = termsData[0]?.rankings.map(student => {
        const sGender = '';
        const sAge = '';
        const sPhoto = '';
        const sTermData = {};
        const sRanks = {};

        termsData.forEach(term => {
          const tn = term.termNumber;
          const s = term.rankings.find(r => r.studentName === student.studentName);
          if (s) {
            sTermData[tn] = s;
            sRanks[tn] = s.rank || '-';
          }
        });

        const sCombined = {};
        allSubjects.forEach(subject => {
          const marks = {};
          let sum = 0;
          let count = 0;
          termsData.forEach(term => {
            const tn = term.termNumber;
            const s = sTermData[tn];
            const mark = s?.subjects?.[subject]?.total || '';
            marks[tn] = mark;
            if (mark) { sum += parseFloat(mark); count++; }
          });
          sCombined[subject] = { marks, average: count > 0 ? (sum / count).toFixed(1) : '' };
        });

        return {
          studentName: student.studentName,
          className: selectedClass,
          termCount,
          terms: termsData.map(t => t.termNumber),
          termData: sTermData,
          studentRanks: sRanks,
          subjects: allSubjects,
          subjectsData: sCombined,
          gender: sGender,
          age: sAge,
          photo: sPhoto,
        };
      }) || [];

      setAllStudentsData(allWithData);
    } catch (error) {
      console.error('Error fetching report:', error);
      setReportData(null);
    } finally {
      setLoadingReport(false);
    }
  };

  const handlePrint = (printAll = false) => {
    if (printAll) {
      setPrintAllStudents(true);
      setIsPrinting(true);
      setTimeout(() => {
        window.print();
        setTimeout(() => setIsPrinting(false), 1000);
      }, 300);
    } else {
      window.print();
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportData) return;
    try {
      const card = document.querySelector(`.${styles.reportCard}`);
      if (!card) { alert('Report card not found'); return; }
      const canvas = await html2canvas(card, {
        scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const ratio = canvas.height / canvas.width;
      const pdfHeight = 148 * ratio;
      const pdf = new jsPDF('p', 'mm', [148, Math.max(210, pdfHeight)]);
      pdf.addImage(imgData, 'JPEG', 0, 0, 148, pdfHeight);
      pdf.save(`ReportCard_${selectedClass}_${selectedStudent}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF.');
    }
  };

  const handleDownloadImage = async () => {
    if (!reportData) return;
    try {
      const card = document.querySelector(`.${styles.reportCard}`);
      if (!card) return;
      const canvas = await html2canvas(card, {
        scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `ReportCard_${selectedClass}_${selectedStudent}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image.');
    }
  };

  const SingleCard = ({ data }) => {
    if (!data) return null;
    return <ReportCardFront data={data} schoolInfo={schoolInfo} />;
  };

  const getCardForPrint = (data) => {
    return <ReportCardFront data={data} schoolInfo={schoolInfo} />;
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <FaSpinner className={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <FaAward className={styles.headerIcon} />
          <div>
            <h1>Report Card</h1>
            <p>A5 Report Card Design</p>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label><FaSchool /> Class</label>
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            {classes.length === 0 ? (
              <option value="">No classes</option>
            ) : (
              classes.map(cls => <option key={cls} value={cls}>{cls}</option>)
            )}
          </select>
        </div>

        <div className={styles.controlGroup}>
          <label><FaUserGraduate /> Student</label>
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} disabled={students.length === 0}>
            {students.length === 0 ? (
              <option value="">No students</option>
            ) : (
              students.map(s => (
                <option key={s.studentName} value={s.studentName}>{s.studentName}</option>
              ))
            )}
          </select>
        </div>

        <div className={styles.actionButtons}>
          <motion.button className={styles.printBtn} onClick={() => handlePrint(false)} whileHover={{ scale: 1.05 }} disabled={!reportData}>
            <FaPrint /> Print
          </motion.button>
          <motion.button className={styles.printAllBtn} onClick={() => handlePrint(true)} whileHover={{ scale: 1.05 }} disabled={allStudentsData.length === 0}>
            <FaUsers /> Print All ({allStudentsData.length})
          </motion.button>
          <motion.button className={styles.pdfBtn} onClick={handleDownloadPDF} whileHover={{ scale: 1.05 }} disabled={!reportData}>
            <FaDownload /> PDF
          </motion.button>
          <motion.button className={styles.imgBtn} onClick={handleDownloadImage} whileHover={{ scale: 1.05 }} disabled={!reportData}>
            <FaImage /> Image
          </motion.button>
        </div>
      </div>

      {loadingReport ? (
        <div className={styles.loadingReport}>
          <FaSpinner className={styles.spinner} />
          <p>Loading report...</p>
        </div>
      ) : !reportData ? (
        <div className={styles.noData}>
          <FaUserGraduate className={styles.noDataIcon} />
          <h3>No data available</h3>
          <p>Select a class and student with marks entered.</p>
        </div>
      ) : (
        <div className={styles.previewSection}>
          <h3>Preview - School Report Card (A5)</h3>
          <div className={styles.previewCard}>
                <ReportCardFront data={reportData} schoolInfo={schoolInfo} />
          </div>
        </div>
      )}

      {isPrinting && (
        <div className={styles.printContainer} ref={printContainerRef}>
          {allStudentsData.map((studentData, index) => (
            <div key={index} className={styles.printCard}>
              {getCardForPrint(studentData)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportCard;
