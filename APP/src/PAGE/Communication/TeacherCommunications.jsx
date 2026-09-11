import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { useDispatch, useSelector } from 'react-redux';
import { setContacts, selectContactsByRole, selectRequestsByUser, addRequest } from '../store/slices/chatSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiMessageCircle, FiSearch, FiSend, FiPlus, FiX, 
  FiClock, FiCheck, FiCheckCircle, FiPhone,
  FiChevronRight, FiInbox, FiArrowLeft, FiMoreVertical
} from 'react-icons/fi';
import { FaUserShield, FaChild } from 'react-icons/fa';
import styles from './TeacherCommunications.module.css';

const TeacherCommunications = ({ user }) => {
  const [activeChatId, setActiveChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequestData, setNewRequestData] = useState({ questions: [''] });
  const [sending, setSending] = useState(false);
  const [responseText, setResponseText] = useState({});
  const [messageInput, setMessageInput] = useState('');
  const dispatch = useDispatch();
  const socket = useRef(null);
  const messagesEndRef = useRef(null);
  
  const contacts = useSelector((state) => selectContactsByRole(state, 'teacher'));
  const requests = useSelector((state) => selectRequestsByUser(state, activeChatId));

  // Use global_staff_id for consistent ID format across the app
  const staffId = user?.global_staff_id;
  const teacherId = staffId ? `staff_${staffId}` : null;

  // Log the teacher ID for debugging
  console.log('TeacherCommunications - User:', user);
  console.log('TeacherCommunications - Staff ID:', staffId, 'Teacher ID:', teacherId);

  const guardianContacts = contacts.filter(c => c.role === 'guardian');

  useEffect(() => {
    if (!teacherId) {
      console.error('TeacherCommunications - No valid teacher ID found. User object:', user);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        console.log('Fetching contacts for teacher:', staffId);
        const contactsRes = await axios.get(`/api/chats/contacts/teacher/${staffId}`);
        dispatch(setContacts({ role: 'teacher', contacts: contactsRes.data }));

        console.log('Fetching messages for teacher:', teacherId);
        const requestsRes = await axios.get(`/api/chats/user/${teacherId}`);
        console.log('Received messages:', requestsRes.data.length);
        requestsRes.data.forEach((request) => {
          const otherUserId = request.sender_id === teacherId ? request.recipient_id : request.sender_id;
          dispatch(addRequest({ userId: otherUserId, request }));
        });
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    console.log('Joining socket room:', teacherId);
    socket.current = io('');
    socket.current.emit('join', teacherId);

    socket.current.on('new_request', (request) => {
      console.log('Received new_request:', request);
      console.log('Checking if recipient_id matches:', request.recipient_id, '===', teacherId);
      if (request.recipient_id === teacherId) {
        console.log('Message is for this teacher, adding to requests');
        dispatch(addRequest({ userId: request.sender_id, request }));
      }
    });

    socket.current.on('new_response', (request) => {
      if (request.sender_id === teacherId) {
        dispatch(addRequest({ userId: request.recipient_id, request }));
      }
    });

    return () => {
      if (socket.current) socket.current.disconnect();
    };
  }, [dispatch, teacherId, staffId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [requests]);

  const filteredContacts = guardianContacts.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectContact = (id) => {
    setActiveChatId(id);
    setShowNewRequest(false);
    setMessageInput('');
  };

  const handleBackToList = () => {
    setActiveChatId(null);
    setShowNewRequest(false);
  };

  const handleQuickSend = async () => {
    if (!activeChatId || !messageInput.trim()) return;
    
    setSending(true);
    try {
      const response = await axios.post('/api/chats/requests', {
        senderId: teacherId,
        recipientId: activeChatId,
        questions: [messageInput.trim()]
      });
      
      dispatch(addRequest({ userId: activeChatId, request: response.data }));
      setMessageInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuickSend();
    }
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
        senderId: teacherId,
        recipientId: activeChatId,
        questions: newRequestData.questions.filter(q => q.trim())
      });
      
      dispatch(addRequest({ userId: activeChatId, request: response.data }));
      setNewRequestData({ questions: [''] });
      setShowNewRequest(false);
    } catch (error) {
      console.error('Error sending message:', error);
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
      
      const requestsRes = await axios.get(`/api/chats/user/${teacherId}`);
      requestsRes.data.forEach(request => {
        const otherUserId = request.sender_id === teacherId ? request.recipient_id : request.sender_id;
        dispatch(addRequest({ userId: otherUserId, request }));
      });
    } catch (error) {
      console.error('Error sending response:', error);
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
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return msgDate.toLocaleDateString();
  };

  const getLastMessage = (contactId) => {
    const contactRequests = requests || [];
    if (contactRequests.length === 0) return null;
    const lastReq = contactRequests[contactRequests.length - 1];
    if (!lastReq) return null;
    const text = lastReq.questions?.[0] || '';
    return {
      text: text.length > 30 ? text.substring(0, 30) + '...' : text,
      time: formatDate(lastReq.created_at),
      isYou: lastReq.sender_id === teacherId
    };
  };

  const activeContact = guardianContacts.find(c => c.id === activeChatId);

  if (!teacherId) {
    return (
      <div className={styles.loadingContainer}>
        <p>Unable to load messages. Staff ID not found.</p>
        <p style={{ fontSize: '12px', color: '#666' }}>Please ensure your profile has a valid global_staff_id.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading messages...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Contacts List View - Hidden when chat is open */}
      {!activeChatId && (
        <div className={styles.contactsView}>
          <div className={styles.header}>
            <h2>Chats</h2>
            <button className={styles.headerBtn}>
              <FiMoreVertical />
            </button>
          </div>

          <div className={styles.searchBox}>
            <FiSearch />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.contactsScroll}>
            {filteredContacts.length === 0 ? (
              <div className={styles.emptyContacts}>
                <FaUserShield />
                <p>No guardians found</p>
              </div>
            ) : (
              filteredContacts.map((contact, index) => {
                const lastMsg = getLastMessage(contact.id);
                return (
                  <motion.div
                    key={contact.id}
                    className={styles.contactCard}
                    onClick={() => handleSelectContact(contact.id)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <div className={styles.contactAvatar}>
                      <FaUserShield />
                    </div>
                    <div className={styles.contactInfo}>
                      <div className={styles.contactTop}>
                        <h4>{contact.name}</h4>
                        {lastMsg && <span className={styles.msgTime}>{lastMsg.time}</span>}
                      </div>
                      <p className={styles.lastMessage}>
                        {lastMsg ? (
                          <>{lastMsg.isYou && <span className={styles.youLabel}>You: </span>}{lastMsg.text}</>
                        ) : (
                          <span className={styles.noMsg}>Tap to start chatting</span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Chat View - Full screen when open */}
      {activeChatId && activeContact && (
        <div className={styles.chatView}>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <button className={styles.backBtn} onClick={handleBackToList}>
                <FiArrowLeft />
              </button>
              <div className={styles.chatAvatar}>
                <FaUserShield />
              </div>
              <div className={styles.chatHeaderInfo}>
                <h3>{activeContact.name}</h3>
                <span>
                  {activeContact.students?.length > 0 
                    ? `Guardian of ${activeContact.students.map(s => s.name).join(', ')}`
                    : 'Guardian'}
                </span>
              </div>
              <button className={styles.headerBtn}>
                <FiMoreVertical />
              </button>
            </div>

            {/* Messages */}
            <div className={styles.messagesContainer}>
              {(!requests || requests.length === 0) ? (
                <div className={styles.noMessages}>
                  <div className={styles.noMsgAvatar}>
                    <FaUserShield />
                  </div>
                  <h4>{activeContact.name}</h4>
                  <p>Send a message to start the conversation</p>
                </div>
              ) : (
                <div className={styles.messagesList}>
                  {requests.map((req, index) => (
                    <div
                      key={`${req.id}-${index}`}
                      className={`${styles.messageWrapper} ${req.sender_id === teacherId ? styles.sent : styles.received}`}
                    >
                      {req.sender_id !== teacherId && (
                        <div className={styles.msgAvatar}>
                          <FaUserShield />
                        </div>
                      )}
                      <div className={styles.messageBubble}>
                        {Array.isArray(req.questions) && req.questions.map((q, i) => (
                          <p key={i} className={styles.messageText}>{q}</p>
                        ))}
                        <span className={styles.messageTime}>{formatDate(req.created_at)}</span>
                      </div>
                    </div>
                  ))}

                  {requests.map((req, index) => (
                    req.responses?.length > 0 && (
                      <div
                        key={`resp-${req.id}-${index}`}
                        className={`${styles.messageWrapper} ${req.sender_id === teacherId ? styles.received : styles.sent}`}
                      >
                        {req.sender_id === teacherId && (
                          <div className={styles.msgAvatar}>
                            <FaUserShield />
                          </div>
                        )}
                        <div className={styles.messageBubble}>
                          {req.responses.map((r, i) => (
                            <p key={i} className={styles.messageText}>{r.answer}</p>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className={styles.inputContainer}>
              <button className={styles.inputBtn} onClick={() => setShowNewRequest(!showNewRequest)}>
                <FiPlus />
              </button>
              <div className={styles.inputWrapper}>
                <input
                  type="text"
                  placeholder="Aa"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>
              <button 
                className={`${styles.sendBtn} ${messageInput.trim() ? styles.active : ''}`}
                onClick={handleQuickSend}
                disabled={!messageInput.trim() || sending}
              >
                <FiSend />
              </button>
            </div>

            {/* Multi-message form */}
            {showNewRequest && (
              <div className={styles.multiMsgForm}>
                <div className={styles.formHeader}>
                  <h4>Send Multiple Messages</h4>
                  <button onClick={() => setShowNewRequest(false)}><FiX /></button>
                </div>
                <div className={styles.formBody}>
                  {newRequestData.questions.map((q, index) => (
                    <div key={index} className={styles.questionInput}>
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => handleQuestionChange(index, e.target.value)}
                        placeholder={`Message ${index + 1}...`}
                      />
                      {newRequestData.questions.length > 1 && (
                        <button onClick={() => handleRemoveQuestion(index)} className={styles.removeBtn}>
                          <FiX />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={handleAddQuestion} className={styles.addMoreBtn}>
                    <FiPlus /> Add another message
                  </button>
                </div>
                <div className={styles.formFooter}>
                  <button onClick={() => setShowNewRequest(false)} className={styles.cancelBtn}>Cancel</button>
                  <button onClick={handleSendRequest} className={styles.sendAllBtn} disabled={sending}>
                    {sending ? 'Sending...' : 'Send All'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
};

export default TeacherCommunications;
