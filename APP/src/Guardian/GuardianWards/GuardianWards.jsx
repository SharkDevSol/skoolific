import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiUser, FiPhone, FiMail, FiCalendar, FiBook, FiTrendingUp } from 'react-icons/fi';
import axios from 'axios';
import styles from './GuardianWards.module.css';

const GuardianWards = () => {
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWard, setSelectedWard] = useState(null);
  const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

  useEffect(() => {
    fetchWards();
  }, []);

  const fetchWards = async () => {
    try {
      const guardianInfo = JSON.parse(localStorage.getItem('guardianInfo') || '{}');
      const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
      const guardiansResponse = await axios.get(`${(typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'))}/guardian-list/guardians`);
      const currentGuardian = guardiansResponse.data.find(
        guardian => guardian.guardian_username === guardianInfo.guardian_username ||
                   guardian.guardian_phone === guardianInfo.guardian_phone
      );
      
      if (currentGuardian && currentGuardian.students) {
        setWards(currentGuardian.students);
      }
    } catch (error) {
      console.error('Error fetching wards:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading wards...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className={styles.header}>
          <h1>My Wards</h1>
          <p>View and manage your children's information</p>
        </div>

        {wards.length === 0 ? (
          <div className={styles.empty}>
            <FiUser size={48} />
            <p>No wards found</p>
          </div>
        ) : (
          <div className={styles.wardsGrid}>
            {wards.map((ward, index) => (
              <motion.div
                key={index}
                className={styles.wardCard}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedWard(ward)}
              >
                <div className={styles.wardHeader}>
                  <div className={styles.avatar}>
                    {ward.image_student ? (
                      <img src={`${API_BASE}/uploads/${ward.image_student}`} alt={ward.student_name} />
                    ) : (
                      <FiUser size={32} />
                    )}
                  </div>
                  <div className={styles.wardInfo}>
                    <h3>{ward.student_name}</h3>
                    <p className={styles.class}>{ward.class}</p>
                  </div>
                </div>

                <div className={styles.wardDetails}>
                  <div className={styles.detailItem}>
                    <FiBook className={styles.icon} />
                    <span>School ID: {ward.school_id}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <FiCalendar className={styles.icon} />
                    <span>Age: {ward.age || 'N/A'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <FiUser className={styles.icon} />
                    <span>Gender: {ward.gender || 'N/A'}</span>
                  </div>
                </div>

                <div className={styles.quickActions}>
                  <button className={styles.actionBtn}>
                    <FiTrendingUp /> View Progress
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Ward Detail Modal */}
      {selectedWard && (
        <motion.div
          className={styles.modal}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setSelectedWard(null)}
        >
          <motion.div
            className={styles.modalContent}
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2>{selectedWard.student_name}</h2>
              <button onClick={() => setSelectedWard(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalAvatar}>
                {selectedWard.image_student ? (
                  <img src={`${API_BASE}/uploads/${selectedWard.image_student}`} alt={selectedWard.student_name} />
                ) : (
                  <FiUser size={64} />
                )}
              </div>
              <div className={styles.modalInfo}>
                <p><strong>Class:</strong> {selectedWard.class}</p>
                <p><strong>School ID:</strong> {selectedWard.school_id}</p>
                <p><strong>Class ID:</strong> {selectedWard.class_id}</p>
                <p><strong>Age:</strong> {selectedWard.age || 'N/A'}</p>
                <p><strong>Gender:</strong> {selectedWard.gender || 'N/A'}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default GuardianWards;
