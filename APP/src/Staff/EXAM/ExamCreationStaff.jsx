import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, BookOpen, Users, FileText } from 'lucide-react';
import axios from 'axios';
import Card from '../../COMPONENTS/Card/Card';
import Button from '../../COMPONENTS/Button/Button';
import Input from '../../COMPONENTS/Input/Input';
import Select from '../../COMPONENTS/Select/Select';
import DatePicker from '../../COMPONENTS/DatePicker/DatePicker';
import styles from './ExamCreationStaff.module.css';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

const EXAM_TYPES = [
  { value: 'midterm', labelKey: 'academic.examCreation.types.midterm' },
  { value: 'final', labelKey: 'academic.examCreation.types.final' },
  { value: 'quiz', labelKey: 'academic.examCreation.types.quiz' },
  { value: 'practice', labelKey: 'academic.examCreation.types.practice' }
];

const ExamCreationStaff = () => {
  const { t } = useTranslation();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [examConfig, setExamConfig] = useState({
    title: '',
    subject: '',
    className: '',
    examDate: null,
    examType: 'midterm',
    durationMinutes: '',
    totalMarks: '',
    instructions: ''
  });

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/student-list/classes`);
        setClasses((res.data || []).map((c) => ({ value: c, label: c })));
      } catch {
        setClasses([]);
      }
    };
    fetchClasses();
  }, []);

  useEffect(() => {
    if (!examConfig.className) {
      setSubjects([]);
      return;
    }
    const fetchSubjects = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/subjects/${examConfig.className}`);
        const list = res.data?.subjects || res.data || [];
        setSubjects(
          (Array.isArray(list) ? list : []).map((s) => ({
            value: typeof s === 'string' ? s : s.name || s.subject,
            label: typeof s === 'string' ? s : s.name || s.subject
          }))
        );
      } catch {
        setSubjects([]);
      }
    };
    fetchSubjects();
  }, [examConfig.className]);

  const handleChange = (field, value) => {
    setExamConfig((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'className' ? { subject: '' } : {})
    }));
  };

  const examTypeOptions = EXAM_TYPES.map((type) => ({
    value: type.value,
    label: t(type.labelKey, type.value)
  }));

  return (
    <div className={styles.examCreationContainer}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('academic.examCreation.title', 'Exam Creation')}</h1>
        <p className={styles.subtitle}>
          {t('academic.examCreation.subtitle', 'Configure exam details, then generate questions with AI if needed.')}
        </p>
      </header>

      <div className={styles.sections}>
        <Card className={styles.configCard} title={t('academic.examCreation.detailsTitle', 'Exam details')}>
          <div className={styles.formGrid}>
            <Input
              label={t('academic.examCreation.examTitle', 'Exam title')}
              value={examConfig.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder={t('academic.examCreation.examTitlePlaceholder', 'e.g. Grade 8 Mathematics Midterm')}
            />
            <Select
              label={t('academic.examCreation.class', 'Class')}
              value={examConfig.className}
              onChange={(value) => handleChange('className', value)}
              options={[{ value: '', label: t('academic.examCreation.selectClass', 'Select class') }, ...classes]}
              placeholder={t('academic.examCreation.selectClass', 'Select class')}
            />
            <Select
              label={t('academic.examCreation.subject', 'Subject')}
              value={examConfig.subject}
              onChange={(value) => handleChange('subject', value)}
              options={[{ value: '', label: t('academic.examCreation.selectSubject', 'Select subject') }, ...subjects]}
              placeholder={t('academic.examCreation.selectSubject', 'Select subject')}
              disabled={!examConfig.className}
            />
            <DatePicker
              label={t('academic.examCreation.examDate', 'Exam date')}
              value={examConfig.examDate}
              onChange={(date) => handleChange('examDate', date)}
            />
            <Select
              label={t('academic.examCreation.examType', 'Exam type')}
              value={examConfig.examType}
              onChange={(value) => handleChange('examType', value)}
              options={examTypeOptions}
            />
            <Input
              label={t('academic.examCreation.duration', 'Duration (minutes)')}
              type="number"
              value={examConfig.durationMinutes}
              onChange={(e) => handleChange('durationMinutes', e.target.value)}
              placeholder="60"
            />
            <Input
              label={t('academic.examCreation.totalMarks', 'Total marks')}
              type="number"
              value={examConfig.totalMarks}
              onChange={(e) => handleChange('totalMarks', e.target.value)}
              placeholder="100"
            />
          </div>
          <div className={styles.instructionsField}>
            <label htmlFor="exam-instructions">{t('academic.examCreation.instructions', 'Instructions')}</label>
            <textarea
              id="exam-instructions"
              className={styles.textarea}
              value={examConfig.instructions}
              onChange={(e) => handleChange('instructions', e.target.value)}
              placeholder={t('academic.examCreation.instructionsPlaceholder', 'Special instructions for students...')}
              rows={3}
            />
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryItem}>
              <BookOpen size={16} aria-hidden />
              {examConfig.subject || t('academic.examCreation.noSubject', 'No subject')}
            </span>
            <span className={styles.summaryItem}>
              <Users size={16} aria-hidden />
              {examConfig.className || t('academic.examCreation.noClass', 'No class')}
            </span>
            <span className={styles.summaryItem}>
              <Calendar size={16} aria-hidden />
              {examConfig.examDate
                ? examConfig.examDate.toLocaleDateString()
                : t('academic.examCreation.noDate', 'No date')}
            </span>
            <span className={styles.summaryItem}>
              <FileText size={16} aria-hidden />
              {examTypeOptions.find((o) => o.value === examConfig.examType)?.label}
            </span>
          </div>
        </Card>

      </div>
    </div>
  );
};

export default ExamCreationStaff;
