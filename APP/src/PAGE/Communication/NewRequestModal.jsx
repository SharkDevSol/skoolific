import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';
import axios from 'axios';
import styles from './NewRequestModal.module.css';

const NewRequestModal = ({ isOpen, onClose, onSubmit, recipientId, senderId }) => {
  const [questions, setQuestions] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const qArray = questions.split('\n').filter(q => q.trim()).map(q => q.trim());
    
    try {
      // Send request with sender ID
      const res = await axios.post('/api/chats/requests', { 
        recipientId, 
        questions: qArray,
        senderId: senderId || 1 // Default to director if not provided
      });
      onSubmit(res.data);
      setQuestions(''); // Clear form
    } catch (err) {
      alert('Failed to send request: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}><FiX /></button>
        <h3>New Request</h3>
        <textarea
          value={questions}
          onChange={e => setQuestions(e.target.value)}
          placeholder="Enter questions, one per line..."
          className={styles.textarea}
          rows={10}
        />
        <button onClick={handleSubmit} className={styles.submit}>Send Request</button>
      </div>
    </div>
  );
};

export default NewRequestModal;