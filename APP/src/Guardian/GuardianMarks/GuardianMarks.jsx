import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiBook, FiTrendingUp, FiAward, FiUser } from 'react-icons/fi';
import axios from 'axios';
import styles from './GuardianMarks.module.css';

const GuardianMarks = () => {
  const [selectedWard, setSelectedWard] = useState('all');
  const [selectedTerm, setSelectedTerm] = useState('1');
  const [wards, setWards] = useState([]);
  const [marksData, setMarksData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [termCount, setTermCount] = useState(2);

  useEffect(() => {
    fetchMarks();
  }, []);

  const fetchMarks = async () => {
    try {
      const guardianInfo = JSON.parse(localStorage.getItem('guardianInfo') || '{}');
      const response = await axios.get(
        `${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/mark-list/guardian-marks/${guardianInfo.guardian_username}`
      );
      
      if (response.data.success) {
        setWards(response.data.data.wards);
        setMarksData(response.data.data.marks);
        setTermCount(response.data.data.termCount || 2);
      }
    } catch (error) {
      console.error('Error fetching marks:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAverage = (wardName) => {
    const wardMarks = marksData.filter(m => m.ward === wardName && m.term === parseInt(selectedTerm));
    if (wardMarks.length === 0) return 0;
    const sum = wardMarks.reduce((acc, m) => acc + (m.total || 0), 0);
    return (sum / wardMarks.length).toFixed(1);
  };

  const getGradeColor = (passStatus) => {
    return passStatus === 'Pass' ? '#28a745' : '#ef4444';
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading marks...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <h1>Academic Performance</h1>
          <p>View your wards' marks and grades</p>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <select
            value={selectedWard}
            onChange={(e) => setSelectedWard(e.target.value)}
            className={styles.select}
          >
            <option value="all">All Wards</option>
            {wards.map((ward, index) => (
              <option key={index} value={ward.student_name}>{ward.student_name}</option>
            ))}
          </select>

          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className={styles.select}
          >
            {Array.from({ length: termCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>Term {i + 1}</option>
            ))}
          </select>
        </div>

        {/* Ward Performance Cards */}
        <div className={styles.performanceGrid}>
          {wards.map((ward, index) => (
            <motion.div
              key={index}
              className={styles.performanceCard}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className={styles.cardHeader}>
                <div className={styles.avatar}>
                  <FiUser size={24} />
                </div>
                <div>
                  <h3>{ward.student_name}</h3>
                  <p>{ward.class}</p>
                </div>
              </div>
              <div className={styles.cardStats}>
                <div className={styles.stat}>
                  <FiTrendingUp className={styles.statIcon} />
                  <div>
                    <div className={styles.statValue}>{calculateAverage(ward.student_name)}%</div>
                    <div className={styles.statLabel}>Average</div>
                  </div>
                </div>
                <div className={styles.stat}>
                  <FiAward className={styles.statIcon} />
                  <div>
                    <div className={styles.statValue}>
                      {marksData.filter(m => m.ward === ward.student_name && m.term === parseInt(selectedTerm)).length}
                    </div>
                    <div className={styles.statLabel}>Subjects</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Marks Table */}
        <div className={styles.marksSection}>
          <h2>Subject Marks</h2>
          {marksData.filter(m => 
            (selectedWard === 'all' || m.ward === selectedWard) && 
            m.term === parseInt(selectedTerm)
          ).length === 0 ? (
            <div className={styles.empty}>
              <FiBook size={48} />
              <p>No marks available for this selection</p>
            </div>
          ) : (
            <div className={styles.marksGrid}>
              {marksData
                .filter(m => 
                  (selectedWard === 'all' || m.ward === selectedWard) && 
                  m.term === parseInt(selectedTerm)
                )
                .map((mark, index) => (
                  <motion.div
                    key={index}
                    className={styles.markCard}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className={styles.markSubject}>
                      <FiBook className={styles.subjectIcon} />
                      <div>
                        <h4>{mark.subject}</h4>
                        <p>{mark.ward}</p>
                      </div>
                    </div>
                    <div className={styles.markScore}>
                      <div className={styles.score}>{mark.total}%</div>
                      <div 
                        className={styles.grade}
                        style={{ color: getGradeColor(mark.pass_status) }}
                      >
                        {mark.pass_status}
                      </div>
                    </div>
                  </motion.div>
                ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default GuardianMarks;
