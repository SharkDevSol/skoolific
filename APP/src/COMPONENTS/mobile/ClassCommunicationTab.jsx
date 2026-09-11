import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FiChevronLeft, FiUsers } from 'react-icons/fi';
import MessageList from './MessageList';
import MessageForm from './MessageForm';
import { useToast } from './Toast';
import styles from './ClassCommunicationTab.module.css';

// API base URL - use environment variable or fallback to localhost
const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api'));

const ClassCommunicationTab = ({
  userType = 'teacher', // 'teacher' or 'student'
  userId,
  userName,
  userClass,        // For students: their class name
  teachingClasses   // For teachers: array of class names they teach
}) => {
  const [selectedClass, setSelectedClass] = useState(null);
  const [classes, setClasses] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const toast = useToast();

  // Fetch teacher's classes
  const fetchTeacherClasses = useCallback(async () => {
    if (userType !== 'teacher' || !userName) return;
    
    try {
      const response = await axios.get(
        `${API_BASE_URL}/class-communication/teacher-classes/${encodeURIComponent(userName)}`
      );
      setClasses(response.data.classes || []);
    } catch (error) {
      console.error('Error fetching teacher classes:', error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, [userName, userType]);

  // Fetch messages for a class
  const fetchMessages = useCallback(async (className) => {
    if (!className) return;
    
    setMessagesLoading(true);
    try {
      const endpoint = userType === 'teacher' 
        ? `/class-communication/messages/${encodeURIComponent(className)}`
        : `/class-communication/student-messages/${encodeURIComponent(className)}`;
      
      const response = await axios.get(`${API_BASE_URL}${endpoint}`);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, [userType]);

  // Initialize based on user type
  useEffect(() => {
    if (userType === 'teacher') {
      fetchTeacherClasses();
    } else if (userType === 'student' && userClass) {
      setSelectedClass(userClass);
      setLoading(false);
    }
  }, [userType, userClass, fetchTeacherClasses]);

  // Fetch messages when class is selected
  useEffect(() => {
    if (selectedClass) {
      fetchMessages(selectedClass);
    }
  }, [selectedClass, fetchMessages]);

  // Handle sending a message (teacher only)
  const handleSendMessage = async (message, attachments) => {
    const formData = new FormData();
    formData.append('teacherId', userId);
    formData.append('teacherName', userName);
    formData.append('className', selectedClass);
    formData.append('message', message);
    
    attachments.forEach(file => {
      formData.append('attachments', file);
    });

    const response = await axios.post(
      `${API_BASE_URL}/class-communication/messages`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    if (response.data.success) {
      setMessages(prev => [...prev, response.data.message]);
      toast.success('Message sent!');
    }
  };

  // Teacher: Show class list if no class selected
  if (userType === 'teacher' && !selectedClass) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <FiUsers className={styles.headerIcon} />
          <h2>My Classes</h2>
        </div>
        
        {loading ? (
          <div className={styles.loadingState}>Loading classes...</div>
        ) : classes.length === 0 ? (
          <div className={styles.emptyState}>
            <FiUsers className={styles.emptyIcon} />
            <p>No teaching assignments found</p>
          </div>
        ) : (
          <div className={styles.classList}>
            {classes.map((className) => (
              <button
                key={className}
                className={styles.classItem}
                onClick={() => setSelectedClass(className)}
              >
                <span className={styles.classAvatar}>
                  {className.charAt(0).toUpperCase()}
                </span>
                <span className={styles.className}>{className}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Show message thread
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {userType === 'teacher' && (
          <button 
            className={styles.backBtn}
            onClick={() => setSelectedClass(null)}
          >
            <FiChevronLeft />
          </button>
        )}
        <h2>{selectedClass || userClass}</h2>
      </div>
      
      <MessageList
        messages={messages}
        loading={messagesLoading}
        emptyMessage="No messages yet. Start the conversation!"
        showTeacherInfo={userType === 'student'}
      />
      
      {userType === 'teacher' && (
        <MessageForm onSubmit={handleSendMessage} />
      )}
    </div>
  );
};

export default ClassCommunicationTab;
