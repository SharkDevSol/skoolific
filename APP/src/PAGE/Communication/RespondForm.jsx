import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';
import axios from 'axios';
import styles from './RespondForm.module.css';

const RespondForm = ({ isOpen, onClose, requestId, questions, onSubmit }) => {
  const [responses, setResponses] = useState({});

  if (!isOpen) return null;

  const handleSubmit = async () => {
    // Format responses properly for the backend
    const respArray = questions.map((_, i) => ({
      questionIndex: i,
      answer: responses[i] || '',
    })).filter(r => r.answer.trim());
    
    try {
      // Send response without token
      const res = await axios.post(`/api/chats/requests/${requestId}/respond`, { 
        responses: respArray 
      });
      onSubmit(res.data);
      setResponses({}); // Clear form
    } catch (err) {
      console.error('Response error:', err);
      alert('Failed to respond: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}><FiX /></button>
        <h3>Respond to Questions</h3>
        {questions.map((q, i) => (
          <div key={`question-${requestId}-${i}`} className={styles.questionGroup}>
            <label><strong>{i+1}.</strong> {q}</label>
            <textarea
              value={responses[i] || ''}
              onChange={e => setResponses({ ...responses, [i]: e.target.value })}
              className={styles.textarea}
              rows={3}
              placeholder="Type your response here..."
            />
          </div>
        ))}
        <button onClick={handleSubmit} className={styles.submit}>Submit Responses</button>
      </div>
    </div>
  );
};

export default RespondForm;