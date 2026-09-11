import React, { useState } from 'react';
import { FiChevronRight, FiUser, FiCalendar, FiAward } from 'react-icons/fi';
import styles from './WardCarousel.module.css';

const WardCarousel = ({ wards, onWardSelect, selectedWardId }) => {
  const [expandedWardId, setExpandedWardId] = useState(null);

  const handleWardClick = (ward) => {
    if (expandedWardId === ward.id) {
      setExpandedWardId(null);
      onWardSelect?.(null);
    } else {
      setExpandedWardId(ward.id);
      onWardSelect?.(ward);
    }
  };

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carousel}>
        {wards.map((ward) => (
          <div 
            key={ward.id}
            className={`${styles.wardCard} ${expandedWardId === ward.id ? styles.expanded : ''}`}
            onClick={() => handleWardClick(ward)}
          >
            <div className={styles.wardHeader}>
              {ward.image_student ? (
                <img
                  src={`/Uploads/${ward.image_student}`}
                  alt={`${ward.student_name}'s profile`}
                  className={styles.wardAvatar}
                />
              ) : (
                <div className={styles.wardAvatarPlaceholder}>
                  {ward.student_name?.charAt(0) || '?'}
                </div>
              )}
              <div className={styles.wardInfo}>
                <h4 className={styles.wardName}>{ward.student_name}</h4>
                <p className={styles.wardClass}>Class: {ward.class} | Roll: {ward.class_id}</p>
              </div>
              <FiChevronRight className={`${styles.chevron} ${expandedWardId === ward.id ? styles.rotated : ''}`} />
            </div>

            {expandedWardId === ward.id && (
              <div className={styles.wardDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Age</span>
                  <span className={styles.detailValue}>{ward.age}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Gender</span>
                  <span className={styles.detailValue}>{ward.gender}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>School ID</span>
                  <span className={styles.detailValue}>{ward.school_id}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Relation</span>
                  <span className={styles.detailValue}>{ward.guardian_relation}</span>
                </div>

                <div className={styles.quickActions}>
                  <button className={styles.actionButton}>
                    <FiCalendar />
                    <span>Attendance</span>
                  </button>
                  <button className={styles.actionButton}>
                    <FiAward />
                    <span>Grades</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {wards.length > 1 && (
        <div className={styles.indicators}>
          {wards.map((ward, index) => (
            <span 
              key={ward.id}
              className={`${styles.indicator} ${expandedWardId === ward.id ? styles.active : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default WardCarousel;
