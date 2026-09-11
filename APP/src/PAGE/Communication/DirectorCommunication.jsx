// DirectorCommunication.jsx - Modern Communication Dashboard
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSelector, useDispatch } from 'react-redux';
import { setContacts, selectContactsByRole, selectRequestsByUser, addRequest } from '../store/slices/chatSlice';
import io from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiMessageCircle, FiSearch, FiSend, FiPlus, FiX, 
  FiClock, FiCheck, FiCheckCircle, FiPhone,
  FiChevronRight, FiMessageSquare, FiInbox
} from 'react-icons/fi';
import { FaUserShield } from 'react-icons/fa';
import styles from './DirectorCommunication.module.css';

const DirectorCommunication = () => {
  const [activeChatId, setActiveChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequestData, setNewRequestData] = useState({ questions: [''] });
  const [sending, setSending] = useState(false);
  const [responseText, setResponseText] = useState({});
  const dispatch = useDispatch();
  const socket = useRef(null);
  const messagesEndRef = useRef(null);
  
  const contacts = useSelector(state => selectContactsByRole(state, 'director'));
  const requests = useSelector(state => selectRequestsByUser(state, activeChatId));

  const guardianContacts = contacts.filter(c => c.role === 'guardian');

  // Get director ID from localStorage or use default
  const getDirectorId = () => {
    try {
      const staffUser = localStorage.getItem('staffUser');
      const staffProfile = localStorage.getItem('staffProfile');
      if (staffProfile) {
        const profile = JSON.parse(staffProfile);
        if (profile.global_staff_id) {
          return `staff_${profile.global_staff_id}`;
        }
      }
      if (staffUser) {
        const user = JSON.parse(staffUser);
        if (user.global_staff_id) {
          return `staff_${user.global_staff_id}`;
        }
      }
    } catch (e) {
      console.warn('Could not get director ID from storage:', e);
    }
    return 'staff_admin'; // Fallback to default admin ID
  };

  const directorId = getDirectorId();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all contacts (guardians) for admin
        const contactsRes = await axios.get('/api/chats/contacts/admin');
        dispatch(setContacts({ role: 'director', contacts: contactsRes.data }));

        // Fetch all requests for this director
        const requestsRes = await axios.get(`/api/chats/user/${directorId}`);
        requestsRes.data.forEach(request => {
          const otherUserId = request.sender_id === directorId ? request.recipient_id : request.sender_id;
          dispatch(addRequest({ userId: otherUserId, request }));
        });
      } catch (err) {
        console.error('Error:', err);
        // Fallback to general contacts endpoint
        try {
          const contactsRes = await axios.get('/api/chats/contacts');
          dispatch(setContacts({ role: 'director', contacts: contactsRes.data }));
        } catch (fallbackErr) {
          console.error('Fallback error:', fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    socket.current = io('');
    socket.current.emit('join', directorId);

    socket.current.on('new_request', (request) => {
      if (request.recipient_id === directorId) {
        dispatch(addRequest({ userId: request.sender_id, request }));
      }
    });

    socket.current.on('new_response', (request) => {
      if (request.sender_id === directorId) {
        dispatch(addRequest({ userId: request.recipient_id, request }));
      }
    });

    return () => {
      if (socket.current) socket.current.disconnect();
    };
  }, [dispatch, directorId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [requests]);

  const filteredContacts = guardianContacts.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectContact = (id) => {
    setActiveChatId(id);
    setShowNewRequest(false);
  };

  const handleAddQuestion = () => {
    setNewRequestData(prev => ({
      ...prev,
      questions: [...prev.questions, '']
    }));
  };

  const handleQuestionChange = (index, value) => {
    const updated = [...newRequestData.questions];
    updated[index] = value;
    setNewRequestData(prev => ({ ...prev, questions: updated }));
  };

  const handleRemoveQuestion = (index) => {
    if (newRequestData.questions.length > 1) {
      const updated = newRequestData.questions.filter((_, i) => i !== index);
      setNewRequestData(prev => ({ ...prev, questions: updated }));
    }
  };

  const handleSendRequest = async () => {
    if (!activeChatId || newRequestData.questions.every(q => !q.trim())) return;
    
    setSending(true);
    try {
      const response = await axios.post('/api/chats/requests', {
        senderId: directorId,
        recipientId: activeChatId,
        questions: newRequestData.questions.filter(q => q.trim())
      });
      
      dispatch(addRequest({ userId: activeChatId, request: response.data }));
      setNewRequestData({ questions: [''] });
      setShowNewRequest(false);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSending(false);
    }
  };

  const handleSendResponse = async (requestId, questions) => {
    const answers = questions.map((_, i) => responseText[`${requestId}-${i}`] || '');
    if (answers.every(a => !a.trim())) return;

    try {
      await axios.post(`/api/chats/requests/${requestId}/respond`, {
        responses: answers.map(answer => ({ answer, timestamp: new Date().toISOString() }))
      });
      setResponseText({});
      
      // Refresh requests
      const requestsRes = await axios.get(`/api/chats/user/${directorId}`);
      requestsRes.data.forEach(request => {
        const otherUserId = request.sender_id === directorId ? request.recipient_id : request.sender_id;
        dispatch(addRequest({ userId: otherUserId, request }));
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const formatDate = (date) => {
    const now = new Date();
    const msgDate = new Date(date);
    const diff = now - msgDate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return msgDate.toLocaleDateString();
  };

  const activeContact = guardianContacts.find(c => c.id === activeChatId);
  const totalGuardians = guardianContacts.length;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <motion.div className={styles.header} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            <FiMessageCircle className={styles.headerIcon} />
            <div>
              <h1>Guardian Communications</h1>
              <p>Connect with parents and guardians</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><FaUserShield /></div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{totalGuardians}</span>
            <span className={styles.statLabel}>Guardians</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><FiMessageSquare /></div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{requests?.length || 0}</span>
            <span className={styles.statLabel}>Messages</span>
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        <motion.div className={styles.sidebar} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className={styles.sidebarHeader}>
            <h3><FaUserShield /> Guardians</h3>
          </div>

          <div className={styles.searchBox}>
            <FiSearch />
            <input
              type="text"
              placeholder="Search guardians..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.contactList}>
            {filteredContacts.length === 0 ? (
              <div className={styles.emptyContacts}>
                <FaUserShield />
                <p>No guardians found</p>
              </div>
            ) : (
              filteredContacts.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  className={`${styles.contactItem} ${activeChatId === contact.id ? styles.active : ''}`}
                  onClick={() => handleSelectContact(contact.id)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <div className={styles.contactAvatar}><FaUserShield /></div>
                  <div className={styles.contactInfo}>
                    <span className={styles.contactName}>{contact.name}</span>
                    {contact.students && contact.students.length > 0 && (
                      <span className={styles.contactStudents}>
                        {contact.students.map(s => `${s.name} (${s.class})`).join(', ')}
                      </span>
                    )}
                    {contact.phone && <span className={styles.contactPhone}><FiPhone /> {contact.phone}</span>}
                  </div>
                  <FiChevronRight />
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div className={styles.chatArea} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          {activeChatId && activeContact ? (
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderInfo}>
                  <div className={styles.chatAvatar}><FaUserShield /></div>
                  <div>
                    <h3>{activeContact.name}</h3>
                    <span>Guardian</span>
                  </div>
                </div>
                <button className={styles.newMessageBtn} onClick={() => setShowNewRequest(!showNewRequest)}>
                  <FiPlus /> New Message
                </button>
              </div>

              <AnimatePresence>
                {showNewRequest && (
                  <motion.div
                    className={styles.newRequestForm}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <h4>Send New Message</h4>
                    {newRequestData.questions.map((q, index) => (
                      <div key={index} className={styles.questionInput}>
                        <span>{index + 1}</span>
                        <input
                          type="text"
                          value={q}
                          onChange={(e) => handleQuestionChange(index, e.target.value)}
                          placeholder="Type your message..."
                        />
                        {newRequestData.questions.length > 1 && (
                          <button onClick={() => handleRemoveQuestion(index)}><FiX /></button>
                        )}
                      </div>
                    ))}
                    <div className={styles.formActions}>
                      <button onClick={handleAddQuestion}><FiPlus /> Add</button>
                      <button onClick={() => setShowNewRequest(false)}>Cancel</button>
                      <button 
                        className={styles.sendBtn}
                        onClick={handleSendRequest}
                        disabled={sending}
                      >
                        {sending ? 'Sending...' : <><FiSend /> Send</>}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={styles.messagesContainer}>
                {(!requests || requests.length === 0) ? (
                  <div className={styles.noMessages}>
                    <FiInbox />
                    <h4>No messages yet</h4>
                    <p>Start a conversation</p>
                  </div>
                ) : (
                  <div className={styles.messagesList}>
                    {requests.map((req, index) => (
                      <motion.div
                        key={`${req.id}-${index}`}
                        className={styles.messageCard}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className={styles.messageHeader}>
                          <span className={req.sender_id === directorId ? styles.sent : styles.received}>
                            {req.sender_id === directorId ? 'You sent' : activeContact.name}
                          </span>
                          <span className={styles.messageTime}>{formatDate(req.created_at)}</span>
                        </div>

                        <div className={styles.questions}>
                          {Array.isArray(req.questions) && req.questions.map((q, i) => (
                            <div key={i} className={styles.questionItem}>
                              <span>{i + 1}</span>
                              <p>{q}</p>
                            </div>
                          ))}
                        </div>

                        {req.responses?.length > 0 && (
                          <div className={styles.responses}>
                            <h5><FiCheck /> Responses</h5>
                            {req.responses.map((r, i) => (
                              <div key={i} className={styles.responseItem}>
                                <span>{i + 1}</span>
                                <p>{r.answer}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {req.status === 'pending' && req.recipient_id === directorId && (
                          <div className={styles.responseForm}>
                            <h5>Your Response</h5>
                            {req.questions.map((_, i) => (
                              <textarea
                                key={i}
                                value={responseText[`${req.id}-${i}`] || ''}
                                onChange={(e) => setResponseText(prev => ({
                                  ...prev,
                                  [`${req.id}-${i}`]: e.target.value
                                }))}
                                placeholder={`Answer ${i + 1}...`}
                                rows={2}
                              />
                            ))}
                            <button onClick={() => handleSendResponse(req.id, req.questions)}>
                              <FiSend /> Send
                            </button>
                          </div>
                        )}

                        <div className={styles.messageFooter}>
                          <span className={`${styles.status} ${styles[req.status]}`}>
                            {req.status === 'pending' ? <FiClock /> : <FiCheckCircle />}
                            {req.status}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noChat}>
              <FiMessageCircle />
              <h3>Select a Guardian</h3>
              <p>Choose a guardian to start messaging</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default DirectorCommunication;
