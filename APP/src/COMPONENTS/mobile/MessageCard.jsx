import React from 'react';
import { FiFile, FiImage, FiDownload, FiClock } from 'react-icons/fi';
import styles from './MessageCard.module.css';

const MessageCard = ({ message, showTeacherInfo = true }) => {
  const { teacher_name, message: content, created_at, attachments = [] } = message;

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + 
             date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isImageFile = (fileType) => {
    return fileType && fileType.startsWith('image/');
  };

  const handleDownload = (attachment) => {
    window.open(`/api/class-communication/attachments/${attachment.id}`, '_blank');
  };

  return (
    <div className={styles.messageCard}>
      {showTeacherInfo && (
        <div className={styles.teacherInfo}>
          <div className={styles.avatar}>
            {teacher_name?.charAt(0)?.toUpperCase() || 'T'}
          </div>
          <span className={styles.teacherName}>{teacher_name}</span>
        </div>
      )}
      
      {content && <p className={styles.messageContent}>{content}</p>}
      
      {attachments.length > 0 && (
        <div className={styles.attachments}>
          {attachments.map((att) => (
            <div 
              key={att.id} 
              className={styles.attachment}
              onClick={() => handleDownload(att)}
            >
              {isImageFile(att.file_type) ? (
                <div className={styles.imagePreview}>
                  <img 
                    src={`/api/class-communication/attachments/${att.id}`}
                    alt={att.original_name}
                    className={styles.thumbnailImage}
                  />
                </div>
              ) : (
                <div className={styles.filePreview}>
                  <FiFile className={styles.fileIcon} />
                  <span className={styles.fileName}>{att.original_name}</span>
                  <FiDownload className={styles.downloadIcon} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <div className={styles.timestamp}>
        <FiClock className={styles.clockIcon} />
        <span>{formatTime(created_at)}</span>
      </div>
    </div>
  );
};

export default MessageCard;
