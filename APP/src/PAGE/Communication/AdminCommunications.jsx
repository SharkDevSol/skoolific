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
import { FaUserShield, FaChalkboardTeacher } from 'react-icons/fa';
import styles from './GuardianCommunications.module.css';

const AdminCommunications = ({ adminInfo }) => {
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
  
  const contacts = useSelector((state) => selectContactsByRole(state, 'admin'));
  const requests = useSelector((state) => selectRequestsByUser(state, activeChatId));

  // Get admin ID from props or localStorage
  const getAdminId = () => {
    if (adminInfo?.global_staff_id) {
      return `staff_${adminInfo.global_staff_id}`;
    }
    try {
      const staffProfile = localStorage.getItem('staffProfile');
      if (staffProfile) {
        const profile = JSON.parse(staffProfile);
        if (profile.global_staff_id) {
          return `staff_${profile.global_staff_id}`;
        }
      }
    } catch (e) {
      console.warn('Could not get admin ID from storage:', e);
    }
    return 'staff_admin';
  };

  const adminId = getAdminId();

  // Filter to show guardians
  const guardianContacts = contacts.filter(c => c.role === 'guardian');

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Admin ID:', adminId);
        
        // Fetch all guardians for admin
        const contactsRes = await axios.get('/api/chats/contacts/admin');
        console.log('Admin contacts:', contactsRes.data?.map(c => ({ id: c.id, name: c.name, role: c.role })));
        dispatch(setContacts({ role: 'admin', contacts: contactsRes.data || [] }));

        // Fetch existing messages
        const requestsRes = await axios.get(`/api/chats/user/${adminId}`);
        console.log('Admin messages:', requestsRes.data?.length);
        requestsRes.data.forEach((request) => {
          const otherUserId = request.sender_id === adminId ? request.recipient_id : request.sender_id;
          dispatch(addRequest({ userId: otherUserId, request }));
        });
      } catch (err) {
        console.error('Error fetching data:', err);
        // Fallback to general contacts
        try {
          const fallbackRes = await axios.get('/api/chats/contacts');
          const guardians = fallbackRes.data?.filter(c => c.role === 'guardian') || [];
          dispatch(setContacts({ role: 'admin', contacts: guardians }));
        } catch (fallbackErr) {
          console.error('Fallback error:', fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Setup socket connection
    console.log('Admin joining socket room:', adminId);
    socket.current = io('');
    socket.current.emit('join', adminId);

    socket.current.on('new_request', (request) => {
      console.log('Admin received new_request:', request);
      if (request.recipient_id === adminId) {
        dispatch(addRequest({ userId: request.sender_id, request }));
      }
    });

    socket.current.on('new_response', (request) => {
      if (request.sender_id === adminId) {
        dispatch(addRequest({ userId: request.recipient_id, request }));
      }
    });

    return () => {
      if (socket.current) socket.current.disconnect();
    };
  }, [dispatch, adminId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [requests]);

  const filteredContacts = guardianContacts.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectContact = (contact) => {
    console.log('Admin selected contact:', contact);
    setActiveChatId(contact.id);
    setShowNewRequest(false);
    setMessageInput('');
  };

  const handleBackToList = () => {
    setActiveChatId(null);
    setShowNewRequest(false);
  };

  const handleQuickSend = async () => {
    if (!activeChatId || !messageInput.trim()) return;
    
    console.log('Admin sending message to:', activeChatId, 'from:', adminId);
    
    setSending(true);
    try {
      const response = await axios.post('/api/chats/requests', {
        senderId: adminId,
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
    
    console.log('Admin sending multiple messages to:', activeChatId);
    
    setSending(true);
    try {
      const response = await axios.post('/api/chats/requests', {
        senderId: adminId,
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
      isYou: lastReq.sender_id === adminId
    };
  };

  const activeContact = guardianContacts.find(c => c.id === activeChatId);

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
              placeholder="Search guardians..."
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
                    onClick={() => handleSelectContact(contact)}
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
                      {contact.students && contact.students.length > 0 && (
                        <p className={styles.subjectTag}>
                          <FiBook /> {contact.students.map(s => s.name).join(', ')}
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
                    className={`${styles.messageWrapper} ${req.sender_id === adminId ? styles.sent : styles.received}`}
                  >
                    {req.sender_id !== adminId && (
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
                      className={`${styles.messageWrapper} ${req.sender_id === adminId ? styles.received : styles.sent}`}
                    >
                      {req.sender_id === adminId && (
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

export default AdminCommunications;
