// MarkListView.jsx - V2 Mark Lists
import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Search,
  Trophy,
  Users,
  XCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './MarkListView.module.css';

import Button from '../../COMPONENTS/Button/Button';
import Input from '../../COMPONENTS/Input/Input';
import Select from '../../COMPONENTS/Select/Select';
import Card from '../../COMPONENTS/Card/Card';
import StatCard from '../../COMPONENTS/StatCard/StatCard';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const MarkListView = () => {
  const { t } = useTranslation();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [markConfig, setMarkConfig] = useState(null);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('1');
  const [termCount, setTermCount] = useState(2);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [viewMode, setViewMode] = useState('ranking'); // 'subject' or 'ranking'
  const [rankingData, setRankingData] = useState(null);
  const markListRef = useRef(null);

  // Fetch available classes and config
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [classesRes, configRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/mark-list/classes`),
          axios.get(`${API_BASE_URL}/mark-list/config`),
        ]);
        setClasses(classesRes.data || []);
        setTermCount(configRes.data?.term_count || 2);
        if (classesRes.data?.length > 0) {
          setSelectedClass(classesRes.data[0]);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch subjects when class changes
  useEffect(() => {
    if (!selectedClass) return;
    const fetchSubjects = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/mark-list/subjects-classes`);
        const classSubjects = response.data?.filter((m) => m.class_name === selectedClass) || [];
        setSubjects(classSubjects);
        if (classSubjects.length > 0) {
          setSelectedSubject(classSubjects[0].subject_name);
        } else {
          setSelectedSubject('');
          setStudents([]);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
        setSubjects([]);
      }
    };
    fetchSubjects();
  }, [selectedClass]);

  // Fetch marks for single subject view
  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedTerm || viewMode !== 'subject') return;
    const fetchMarks = async () => {
      setLoadingMarks(true);
      try {
        const response = await axios.get(
          `${API_BASE_URL}/mark-list/mark-list/${selectedSubject}/${selectedClass}/${selectedTerm}`
        );
        setStudents(response.data.markList || []);
        setMarkConfig(response.data.config || null);
      } catch (error) {
        console.error('Error fetching marks:', error);
        setStudents([]);
        setMarkConfig(null);
      } finally {
        setLoadingMarks(false);
      }
    };
    fetchMarks();
  }, [selectedClass, selectedSubject, selectedTerm, viewMode]);

  // Build ranking client-side by fetching each subject's marks
  useEffect(() => {
    if (!selectedClass || !selectedTerm || viewMode !== 'ranking' || subjects.length === 0) return;
    const fetchRanking = async () => {
      setLoadingMarks(true);
      try {
        // Fetch marks for all subjects in parallel
        const results = await Promise.all(
          subjects.map((sub) =>
            axios
              .get(`${API_BASE_URL}/mark-list/mark-list/${encodeURIComponent(sub.subject_name)}/${encodeURIComponent(selectedClass)}/${selectedTerm}`)
              .then((r) => ({ subject: sub.subject_name, data: r.data }))
              .catch(() => ({ subject: sub.subject_name, data: null }))
          )
        );

        const studentMap = {};
        const subjectNames = [];

        for (const { subject, data } of results) {
          if (!data?.markList?.length) continue;
          subjectNames.push(subject);
          for (const row of data.markList) {
            const name = row.student_name;
            if (!studentMap[name]) {
              studentMap[name] = { studentName: name, subjects: {}, totalMarks: 0, subjectCount: 0, passedSubjects: 0, failedSubjects: 0 };
            }
            const total = Math.min(row.total || 0, 100);
            studentMap[name].subjects[subject] = { total, status: row.pass_status || 'Fail' };
            studentMap[name].totalMarks += total;
            studentMap[name].subjectCount++;
            row.pass_status === 'Pass' ? studentMap[name].passedSubjects++ : studentMap[name].failedSubjects++;
          }
        }

        const rankings = Object.values(studentMap)
          .map((s) => ({
            ...s,
            average: s.subjectCount > 0 ? s.totalMarks / s.subjectCount : 0,
            overallStatus: s.failedSubjects === 0 && s.subjectCount > 0 ? 'Pass' : 'Fail',
          }))
          .sort((a, b) => b.average - a.average)
          .map((s, i) => ({ ...s, rank: i + 1 }));

        setRankingData({
          rankings,
          subjects: subjectNames,
          summary: {
            totalStudents: rankings.length,
            averageClassScore: rankings.length > 0 ? rankings.reduce((sum, s) => sum + s.average, 0) / rankings.length : 0,
            passRate: rankings.length > 0 ? (rankings.filter((s) => s.overallStatus === 'Pass').length / rankings.length) * 100 : 0,
          },
        });
      } catch (error) {
        console.error('Error building ranking:', error);
        setRankingData(null);
      } finally {
        setLoadingMarks(false);
      }
    };
    fetchRanking();
  }, [selectedClass, selectedTerm, viewMode, subjects]);

  const calculateGrade = (marks) => {
    if (marks >= 90) return 'A+';
    if (marks >= 80) return 'A';
    if (marks >= 70) return 'B+';
    if (marks >= 60) return 'B';
    if (marks >= 50) return 'C';
    if (marks >= 40) return 'D';
    return 'F';
  };

  const getGradeColor = (grade) => {
    if (grade === 'A+' || grade === 'A') return '#27ae60';
    if (grade === 'B+' || grade === 'B') return '#f39c12';
    if (grade === 'C') return '#e67e22';
    return '#e74c3c';
  };

  const filteredStudents = students.filter((student) => {
    if (!searchQuery) return true;
    return student.student_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => (b.total || 0) - (a.total || 0));

  // Statistics for subject view
  const totalStudents = filteredStudents.length;
  const marks = filteredStudents.map((s) => s.total || 0);
  const averageMark = marks.length > 0 ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) : 0;
  const passCount = filteredStudents.filter((s) => s.pass_status === 'Pass').length;
  const failCount = totalStudents - passCount;

  // Get mark components from config
  const markComponents = markConfig?.mark_components || [];

  // Get all subjects from ranking data
  const allSubjects = rankingData?.subjects || [];

  const classOptions = useMemo(
    () => classes.map((cls) => ({ value: cls, label: cls })),
    [classes]
  );

  const subjectOptions = useMemo(
    () =>
      subjects.map((sub) => ({
        value: sub.subject_name,
        label: sub.subject_name
      })),
    [subjects]
  );

  const termOptions = useMemo(
    () =>
      Array.from({ length: termCount }, (_, i) => ({
        value: String(i + 1),
        label: t('academic.markLists.term', 'Term {{n}}', { n: i + 1 })
      })),
    [termCount, t]
  );

  const exportToExcel = () => {
    if (viewMode === 'subject') {
      const worksheet = XLSX.utils.json_to_sheet(
        sortedStudents.map((student, index) => {
          const row = { Rank: index + 1, 'Student Name': student.student_name };
          markComponents.forEach((comp) => {
            const key = comp.name.toLowerCase().replace(/\s+/g, '_');
            row[comp.name] = student[key] || 0;
          });
          row['Total'] = student.total || 0;
          row['Grade'] = calculateGrade(student.total || 0);
          row['Status'] = student.pass_status || 'N/A';
          return row;
        })
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mark List');
      XLSX.writeFile(workbook, `${selectedClass}_${selectedSubject}_Term${selectedTerm}_Marks.xlsx`);
    } else {
      // Export ranking with all subjects
      const worksheet = XLSX.utils.json_to_sheet(
        (rankingData?.rankings || []).map((student) => {
          const row = { Rank: student.rank, 'Student Name': student.studentName };
          allSubjects.forEach((subject) => {
            row[subject] = student.subjects?.[subject]?.total || '-';
          });
          row['Total'] = student.totalMarks?.toFixed(1) || 0;
          row['Average'] = student.average?.toFixed(1) || 0;
          row['Grade'] = calculateGrade(student.average || 0);
          row['Status'] = student.overallStatus || 'N/A';
          return row;
        })
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Class Ranking');
      XLSX.writeFile(workbook, `${selectedClass}_Term${selectedTerm}_AllSubjects_Rankings.xlsx`);
    }
  };

  const exportToPDF = () => {
    const input = markListRef.current;
    html2canvas(input, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
      const imgWidth = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      const filename =
        viewMode === 'subject'
          ? `${selectedClass}_${selectedSubject}_Term${selectedTerm}_Marks.pdf`
          : `${selectedClass}_Term${selectedTerm}_AllSubjects_Rankings.pdf`;
      pdf.save(filename);
    });
  };

  const printMarkList = () => window.print();

  const studentCount =
    viewMode === 'subject' ? totalStudents : rankingData?.rankings?.length || 0;
  const subjectCount = viewMode === 'subject' ? subjects.length : allSubjects.length;
  const avgDisplay =
    viewMode === 'subject'
      ? averageMark
      : rankingData?.summary?.averageClassScore?.toFixed(1) || 0;
  const passedCount =
    viewMode === 'subject'
      ? passCount
      : rankingData?.rankings?.filter((r) => r.overallStatus === 'Pass').length || 0;
  const exportDisabled =
    (viewMode === 'subject' && sortedStudents.length === 0) ||
    (viewMode === 'ranking' && !rankingData?.rankings?.length);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spinner} size={32} />
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('academic.markLists.title', 'Mark Lists')}</h1>
          <p className={styles.pageSubtitle}>
            {t('academic.markLists.subtitle', 'View and analyze student performance')}
          </p>
        </div>
        <BarChart3 size={28} className={styles.headerIcon} aria-hidden />
      </div>

      <div className={styles.viewToggle}>
        <Button
          variant={viewMode === 'ranking' ? 'primary' : 'ghost'}
          icon={<Trophy size={16} />}
          onClick={() => setViewMode('ranking')}
        >
          {t('academic.markLists.allSubjects', 'All Subjects & Ranking')}
        </Button>
        <Button
          variant={viewMode === 'subject' ? 'primary' : 'ghost'}
          icon={<BookOpen size={16} />}
          onClick={() => setViewMode('subject')}
        >
          {t('academic.markLists.singleSubject', 'Single Subject')}
        </Button>
      </div>

      <div className={styles.statsGrid}>
        <StatCard
          title={t('academic.markLists.students', 'Students')}
          value={String(studentCount)}
          icon={<Users size={20} />}
          size="small"
        />
        <StatCard
          title={t('academic.subjects', 'Subjects')}
          value={String(subjectCount)}
          icon={<BookOpen size={20} />}
          size="small"
          variant="primary"
        />
        <StatCard
          title={t('academic.markLists.classAverage', 'Class Average')}
          value={`${avgDisplay}%`}
          icon={<BarChart3 size={20} />}
          size="small"
          variant="secondary"
        />
        <StatCard
          title={t('academic.markLists.passed', 'Passed')}
          value={String(passedCount)}
          icon={<CheckCircle size={20} />}
          size="small"
          variant="success"
        />
      </div>

      <Card className={styles.filtersCard}>
        <div className={styles.filters}>
          <Select
            label={t('academic.markLists.class', 'Class')}
            value={selectedClass}
            onChange={setSelectedClass}
            options={classOptions}
          />
          {viewMode === 'subject' && (
            <Select
              label={t('academic.subjects', 'Subject')}
              value={selectedSubject}
              onChange={setSelectedSubject}
              options={subjectOptions}
              disabled={subjects.length === 0}
              placeholder={t('academic.markLists.noSubjects', 'No subjects')}
            />
          )}
          <Select
            label={t('academic.markLists.termLabel', 'Term')}
            value={selectedTerm}
            onChange={setSelectedTerm}
            options={termOptions}
          />
          <Input
            label={t('common.search', 'Search')}
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('academic.markLists.searchStudents', 'Search students...')}
            prefixIcon={<Search size={16} />}
          />
        </div>
      </Card>


      {/* Mark List Table */}
      <div ref={markListRef} className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <h2>
            {viewMode === 'subject'
              ? `${selectedClass} - ${selectedSubject} - Term ${selectedTerm}`
              : `${selectedClass} - All Subjects - Term ${selectedTerm}`}
          </h2>
          {viewMode === 'ranking' && allSubjects.length > 0 && (
            <span className={styles.subjectCount}>{allSubjects.length} Subjects</span>
          )}
          {viewMode === 'subject' && markConfig && (
            <span className={styles.passThreshold}>Pass Mark: {markConfig.pass_threshold || 50}%</span>
          )}
        </div>

        {loadingMarks ? (
          <div className={styles.loadingMarks}>
            <Loader2 className={styles.spinner} size={24} />
            <p>{t('academic.markLists.loadingMarks', 'Loading marks...')}</p>
          </div>
        ) : viewMode === 'ranking' ? (
          !rankingData?.rankings?.length ? (
            <div className={styles.noData}>
              <Trophy className={styles.noDataIcon} size={40} />
              <h3>{t('academic.markLists.noRanking', 'No ranking data')}</h3>
              <p>{t('academic.markLists.noRankingHint', 'Enter marks for this class first.')}</p>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.markTable}>
                <thead>
                  <tr>
                    <th className={styles.stickyCol}>{t('academic.markLists.rank', 'Rank')}</th>
                    <th className={styles.stickyCol2}>{t('academic.markLists.student', 'Student')}</th>
                    {allSubjects.map((subject) => (
                      <th key={subject} className={styles.subjectHeader}>
                        {subject}
                      </th>
                    ))}
                    <th className={styles.totalCol}>{t('academic.markLists.total', 'Total')}</th>
                    <th className={styles.avgCol}>{t('academic.markLists.average', 'Average')}</th>
                    <th>{t('academic.markLists.grade', 'Grade')}</th>
                    <th>{t('academic.markLists.status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                    {rankingData.rankings
                      .filter((student) => {
                        if (!searchQuery) return true;
                        return student.studentName?.toLowerCase().includes(searchQuery.toLowerCase());
                      })
                      .map((student) => {
                        const grade = calculateGrade(student.average || 0);
                        return (
                          <tr
                            key={student.studentName}
                            className={student.overallStatus === 'Pass' ? styles.passed : styles.failed}
                          >
                            <td className={`${styles.rank} ${styles.stickyCol}`}>
                              {student.rank <= 3 ? (
                                <span className={`${styles.medal} ${styles[`medal${student.rank}`]}`}>
                                  {student.rank}
                                </span>
                              ) : (
                                student.rank
                              )}
                            </td>
                            <td className={`${styles.studentName} ${styles.stickyCol2}`}>
                              {student.studentName}
                            </td>
                            {allSubjects.map((subject) => {
                              const subjectData = student.subjects?.[subject];
                              const subjectMark = subjectData?.total || 0;
                              const subjectStatus = subjectData?.status;
                              const hasData = subjectData !== undefined;
                              return (
                                <td
                                  key={subject}
                                  className={`${styles.subjectMark} ${
                                    hasData
                                      ? subjectStatus === 'Pass'
                                        ? styles.subjectPass
                                        : styles.subjectFail
                                      : styles.noMark
                                  }`}
                                >
                                  {hasData ? subjectMark : '-'}
                                </td>
                              );
                            })}
                            <td className={styles.totalMark}>{student.totalMarks?.toFixed(0) || 0}</td>
                            <td className={styles.avgMark}>
                              <span
                                className={styles.avgBadge}
                                style={{
                                  background: `${getGradeColor(grade)}20`,
                                  color: getGradeColor(grade),
                                }}
                              >
                                {student.average?.toFixed(1) || 0}%
                              </span>
                            </td>
                            <td>
                              <span
                                className={styles.grade}
                                style={{
                                  background: `${getGradeColor(grade)}20`,
                                  color: getGradeColor(grade),
                                }}
                              >
                                {grade}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`${styles.status} ${
                                  styles[student.overallStatus?.toLowerCase() || 'fail']
                                }`}
                              >
                                {student.overallStatus || 'N/A'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )
        ) :
        sortedStudents.length === 0 ? (
          <div className={styles.noData}>
            <Users className={styles.noDataIcon} size={40} />
            <h3>{t('academic.markLists.noMarks', 'No marks found')}</h3>
            <p>{t('academic.markLists.noMarksHint', 'No marks for the selected subject.')}</p>
          </div>
        ) : (
          <table className={styles.markTable}>
            <thead>
              <tr>
                <th>{t('academic.markLists.rank', 'Rank')}</th>
                <th>{t('academic.markLists.student', 'Student')}</th>
                {markComponents.map((comp) => (
                  <th key={comp.name}>
                    {comp.name} ({comp.percentage}%)
                  </th>
                ))}
                <th>{t('academic.markLists.total', 'Total')}</th>
                <th>{t('academic.markLists.grade', 'Grade')}</th>
                <th>{t('academic.markLists.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
                {sortedStudents.map((student, index) => {
                  const grade = calculateGrade(student.total || 0);
                  return (
                    <tr
                      key={student.id || student.student_name}
                      className={student.pass_status === 'Pass' ? styles.passed : styles.failed}
                    >
                      <td className={styles.rank}>
                        {index < 3 ? (
                          <span className={`${styles.medal} ${styles[`medal${index + 1}`]}`}>{index + 1}</span>
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className={styles.studentName}>{student.student_name}</td>
                      {markComponents.map((comp) => {
                        const key = comp.name.toLowerCase().replace(/\s+/g, '_');
                        return (
                          <td key={comp.name} className={styles.componentMark}>
                            {student[key] || 0}
                          </td>
                        );
                      })}
                      <td className={styles.marks}>{student.total || 0}</td>
                      <td>
                        <span
                          className={styles.grade}
                          style={{ background: `${getGradeColor(grade)}20`, color: getGradeColor(grade) }}
                        >
                          {grade}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${styles[student.pass_status?.toLowerCase() || 'fail']}`}
                        >
                          {student.pass_status || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon={<FileSpreadsheet size={16} />}
          onClick={exportToExcel}
          disabled={exportDisabled}
        >
          {t('academic.markLists.exportExcel', 'Export Excel')}
        </Button>
        <Button
          variant="secondary"
          icon={<FileText size={16} />}
          onClick={exportToPDF}
          disabled={exportDisabled}
        >
          {t('academic.markLists.exportPdf', 'Export PDF')}
        </Button>
        <Button
          variant="primary"
          icon={<Printer size={16} />}
          onClick={printMarkList}
          disabled={exportDisabled}
        >
          {t('academic.markLists.print', 'Print')}
        </Button>
      </div>
    </div>
  );
};

export default MarkListView;
