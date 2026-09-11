import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { useDispatch, useSelector } from 'react-redux';
import { setContacts, selectContactsByRole, selectRequestsByUser, addRequest } from '../store/slices/chatSlice';
import { motion } from 'framer-motion';
import { 
  FiSearch, FiSend, FiPlus, FiX, 
  FiArrowLeft, FiMoreVertical, FiBook
} from 'react-icons/fi';
import { FaChalkboardTeacher, FaUserShield } from 'react-icons/fa';
import styles from './GuardianCommunications.module.css';

const GuardianCommunications = ({ wards, guardianInfo }) => {
  const [activeChatId, setActiveChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequestData, setNewRequestData] = useState({ questions: [''] });
  const [sending, setSending] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const dispatch = useDispatch();
  const socket = useRef(null);
  const messagesEndRef = useRef(null);
  
  const contacts = useSelector((state) => selectContactsByRole(state, 'guardian'));
  const requests = useSelector((state) => selectRequestsByUser(state, activeChatId));

  const guardianUsername = guardianInfo?.guardian_username || wards?.[0]?.guardian_username;
  const guardianId = guardianUsername 
    ? `guardian_${guardianUsername}` 
    : wards?.[0]?.guardian_name 
      ? `guardian_${wards[0].guardian_name.replace(/[^a-zA-Z0-9]/g, '_')}`
      : 'guardian_1';

  // Filter to only show teachers and directors
  const staffContacts = contacts.filter(c => c.role === 'teacher' || c.role === 'director');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const wardClasses = wards?.map(w => w.class).filter(Boolean) || [];
        console.log('Guardian wards:', wards);
        console.log('Ward classes:', wardClasses);
        const teacherMap = new Map();
        
        // Fetch class teachers for ward classes - this is the most reliable method
        if (wardClasses.length > 0) {
          try {
            const assignmentsRes = await axios.get('/api/class-teacher/assignments');
            const assignments = assignmentsRes.data || [];
            
            assignments.forEach(assignment => {
              if (wardClasses.includes(assignment.assigned_class) && assignment.is_active !== false) {
                // Use staff_ prefix to match what teachers listen on
                const teacherId = `staff_${assignment.global_staff_id}`;
                if (!teacherMap.has(teacherId)) {
                  teacherMap.set(teacherId, {
                    id: teacherId,
                    name: assignment.teacher_name,
                    role: 'teacher',
                    subjects: ['Class Teacher'],
                    classes: [assignment.assigned_class],
                    unreadCount: 0
                  });
                }
              }
            });
          } catch (err) {
            console.warn('Could not fetch class teacher assignments:', err);
          }
        }
        
        // Use the guardian-specific endpoint to get relevant teachers
        if (guardianUsername) {
          try {
            const contactsRes = await axios.get(`/api/chats/contacts/guardian/${guardianUsername}`);
            if (contactsRes.data?.length > 0) {
              contactsRes.data.forEach(contact => {
                // Only add if not already in map and has valid staff_ ID
                if (!teacherMap.has(contact.id) && contact.id?.startsWith('staff_')) {
                  teacherMap.set(contact.id, contact);
                }
              });
            }
          } catch (err) {
            console.warn('Guardian contacts endpoint failed:', err);
          }
        }
        
        // Only fetch all contacts if we have no teachers yet (fallback)
        if (teacherMap.size === 0) {
          try {
            const allContactsRes = await axios.get('/api/chats/contacts');
            (allContactsRes.data || []).forEach(contact => {
              // Only add contacts with valid staff_ ID prefix
              if (contact.id?.startsWith('staff_')) {
                if (!teacherMap.has(contact.id)) {
                  teacherMap.set(contact.id, contact);
                }
              }
            });
            console.log('Fallback contacts from /api/chats/contacts:', allContactsRes.data?.map(c => ({ id: c.id, name: c.name, role: c.role })));
          } catch (err) {
            console.warn('Could not fetch contacts:', err);
          }
        }
        
        const finalContacts = Array.from(teacherMap.values());
        // Sort teachers first, then directors (so teachers appear at top)
        finalContacts.sort((a, b) => {
          if (a.role === 'teacher' && b.role !== 'teacher') return -1;
          if (a.role !== 'teacher' && b.role === 'teacher') return 1;
          return a.name.localeCompare(b.name);
        });
        console.log('Final contacts for guardian:', finalContacts.map(c => ({ id: c.id, name: c.name, role: c.role })));
        dispatch(setContacts({ role: 'guardian', contacts: finalContacts }));

        // Fetch existing messages
        const requestsRes = await axios.get(`/api/chats/user/${guardianId}`);
        requestsRes.data.forEach((request) => {
          const otherUserId = request.sender_id === guardianId ? request.recipient_id : request.sender_id;
          dispatch(addRequest({ userId: otherUserId, request }));
        });
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Setup socket connection
    socket.current = io('');
    socket.current.emit('join', guardianId);

    socket.current.on('new_request', (request) => {
      if (request.recipient_id === guardianId) {
        dispatch(addRequest({ userId: request.sender_id, request }));
      }
    });

    socket.current.on('new_response', (request) => {
      if (request.sender_id === guardianId) {
        dispatch(addRequest({ userId: request.recipient_id, request }));
      }
    });

    return () => {
      if (socket.current) socket.current.disconnect();
    };
  }, [dispatch, guardianId, guardianUsername, wards]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [requests]);

  const filteredContacts = staffContacts.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectContact = (contact) => {
    // Log the selected contact for debugging
    console.log('Selected contact:', contact);
    console.log('Contact ID:', contact.id, 'Name:', contact.name, 'Role:', contact.role);
    
    // Ensure we're using the correct ID format
    const contactId = contact.id;
    setActiveChatId(contactId);
    setShowNewRequest(false);
    setMessageInput('');
  };

  const handleBackToList = () => {
    setActiveChatId(null);
    setShowNewRequest(false);
  };

  const handleQuickSend = async () => {
    if (!activeChatId || !messageInput.trim()) return;
    
    // Log the recipient to help debug
    console.log('Sending message to:', activeChatId, 'from:', guardianId);
    console.log('Active contact:', activeContact);
    
    setSending(true);
    try {
      const response = await axios.post('/api/chats/requests', {
        senderId: guardianId,
        recipientId: activeChatId,
        questions: [messageInput.trim()]
      });
      
      console.log('Message sent successfully:', response.data);
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
    
    // Log the recipient to help debug
    console.log('Sending multiple messages to:', activeChatId, 'from:', guardianId);
    console.log('Active contact:', activeContact);
    
    setSending(true);
    try {
      const response = await axios.post('/api/chats/requests', {
        senderId: guardianId,
        recipientId: activeChatId,
        questions: newRequestData.questions.filter(q => q.trim())
      });
      
      console.log('Multiple messages sent successfully:', response.data);
      dispatch(addRequest({ userId: activeChatId, request: response.data }));
      setNewRequestData({ questions: [''] });
      setShowNewRequest(false);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
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
      isYou: lastReq.sender_id === guardianId
    };
  };

  const activeContact = staffContacts.find(c => c.id === activeChatId);

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
      {/* Contacts List View */}
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
                <FaChalkboardTeacher />
                <p>No staff found</p>
              </div>
            ) : (
              filteredContacts.map((contact, index) => {
                const lastMsg = getLastMessage(contact.id);
                return (
                  <motion.div
                    key={contact.id}
                    className={styles.contactCard}
                    onClick={() => handleSelectContact(contact)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <div className={styles.contactAvatar}>
                      {contact.role === 'director' ? <FaUserShield /> : <FaChalkboardTeacher />}
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
                      {contact.subjects && contact.subjects.length > 0 && (
                        <p className={styles.subjectTag}>
                          <FiBook /> {contact.subjects.join(', ')}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Chat View */}
      {activeChatId && activeContact && (
        <div className={styles.chatView}>
          <div className={styles.chatHeader}>
            <button className={styles.backBtn} onClick={handleBackToList}>
              <FiArrowLeft />
            </button>
            <div className={styles.chatAvatar}>
              {activeContact.role === 'director' ? <FaUserShield /> : <FaChalkboardTeacher />}
            </div>
            <div className={styles.chatHeaderInfo}>
              <h3>{activeContact.name}</h3>
              <span>
                {activeContact.role === 'director' 
                  ? 'Admin' 
                  : activeContact.subjects?.length > 0
                    ? `Teacher - ${activeContact.subjects.join(', ')}`
                    : 'Teacher'}
              </span>
            </div>
            <button className={styles.headerBtn}>
              <FiMoreVertical />
            </button>
          </div>

          <div className={styles.messagesContainer}>
            {(!requests || requests.length === 0) ? (
              <div className={styles.noMessages}>
                <div className={styles.noMsgAvatar}>
                  {activeContact.role === 'director' ? <FaUserShield /> : <FaChalkboardTeacher />}
                </div>
                <h4>{activeContact.name}</h4>
                <p>Send a message to start the conversation</p>
              </div>
            ) : (
              <div className={styles.messagesList}>
                {requests.map((req, index) => (
                  <div
                    key={`${req.id}-${index}`}
                    className={`${styles.messageWrapper} ${req.sender_id === guardianId ? styles.sent : styles.received}`}
                  >
                    {req.sender_id !== guardianId && (
                      <div className={styles.msgAvatar}>
                        {activeContact.role === 'director' ? <FaUserShield /> : <FaChalkboardTeacher />}
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
                      className={`${styles.messageWrapper} ${req.sender_id === guardianId ? styles.received : styles.sent}`}
                    >
                      {req.sender_id === guardianId && (
                        <div className={styles.msgAvatar}>
                          {activeContact.role === 'director' ? <FaUserShield /> : <FaChalkboardTeacher />}
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

export default GuardianCommunications;
