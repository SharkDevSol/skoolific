import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { FiMessageCircle, FiUser, FiPlus, FiX, FiSearch, FiArrowLeft } from 'react-icons/fi';
import ChatWindow from '../../COMPONENTS/Chat/ChatWindow';
import ConversationList from '../../COMPONENTS/Chat/ConversationList';
import styles from './GuardianMessages.module.css';

const GuardianMessages = () => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const socketRef = useRef(null);

  // API base URLs
  const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
  const API_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || '/api'));

  // Get guardian info from localStorage
  const guardianInfo = JSON.parse(localStorage.getItem('guardianInfo') || '{}');
  const guardianId = guardianInfo.guardian_phone || guardianInfo.guardian_name || 'unknown';
  const currentUserId = `guardian_${guardianId}`;
  const currentUserName = guardianInfo.guardian_name || 'Guardian';
  const currentUserType = 'guardian';

  useEffect(() => {
    // Initialize Socket.IO
    socketRef.current = io(API_BASE);
    socketRef.current.emit('join', currentUserId);

    // Listen for new messages
    socketRef.current.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
      fetchConversations();
    });

    fetchConversations();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/chats/conversations?userId=${currentUserId}`);
      setConversations(res.data.map(c => ({ ...c, currentUserId })));
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    setContactsLoading(true);
    try {
      // Fetch both teachers and admins
      const [teachersRes, adminsRes] = await Promise.all([
        axios.get(`${API_URL}/chats/contacts/teachers`),
        axios.get(`${API_URL}/chats/contacts/admins`).catch(() => ({ data: [] }))
      ]);
      
      const allContacts = [
        ...adminsRes.data.map(a => ({ ...a, type: 'admin' })),
        ...teachersRes.data.map(t => ({ ...t, type: 'teacher' }))
      ];
      
      setContacts(allContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchMessages = async (conversationId) => {
    setMessagesLoading(true);
    try {
      const res = await axios.get(`${API_URL}/chats/conversations/${conversationId}/messages`);
      setMessages(res.data);
      
      // Mark as read
      await axios.put(`${API_URL}/chats/messages/read`, {
        conversationId,
        userId: currentUserId
      });
      
      fetchConversations();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSelectConversation = async (conversation) => {
    setActiveConversation(conversation);
    await fetchMessages(conversation.id);
  };

  const handleBackToList = () => {
    setActiveConversation(null);
    setMessages([]);
  };

  const handleSendMessage = async (formData) => {
    try {
      const res = await axios.post(
        `${API_URL}/chats/conversations/${activeConversation.id}/messages`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const newMessage = res.data;
      setMessages(prev => [...prev, newMessage]);

      // Broadcast via Socket.IO
      if (socketRef.current) {
        socketRef.current.emit('send_message', {
          conversationId: activeConversation.id,
          message: newMessage
        });
      }

      fetchConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const handleNewChat = () => {
    setShowNewChatModal(true);
    fetchContacts();
  };

  const handleStartConversation = async (contact) => {
    try {
      const res = await axios.post(`${API_URL}/chats/conversations`, {
        type: 'direct',
        participants: [
          { user_id: currentUserId, user_name: currentUserName, user_type: currentUserType },
          { user_id: contact.id, user_name: contact.name, user_type: contact.type }
        ]
      });

      setShowNewChatModal(false);
      setSearchQuery('');
      await fetchConversations();
      
      // Select the new conversation
      const newConv = res.data;
      const convDetails = await axios.get(`${API_URL}/chats/conversations/${newConv.id}`);
      setActiveConversation(convDetails.data);
      await fetchMessages(newConv.id);
    } catch (error) {
      console.error('Error starting conversation:', error);
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mobile view - show either list or chat
  const isMobile = window.innerWidth < 768;

  if (isMobile && activeConversation) {
    return (
      <div className={styles.container}>
        <div className={styles.chatHeader}>
          <button onClick={handleBackToList} className={styles.backButton}>
            <FiArrowLeft />
          </button>
          <div className={styles.headerInfo}>
            <h3>
              {activeConversation.participants?.find(p => p.user_id !== currentUserId)?.user_name}
            </h3>
            <span>
              {activeConversation.participants?.find(p => p.user_id !== currentUserId)?.user_type === 'teacher' ? 'Teacher' : 'Admin'}
            </span>
          </div>
        </div>
        <ChatWindow
          conversation={activeConversation}
          messages={messages}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserType={currentUserType}
          onSendMessage={handleSendMessage}
          isLoading={messagesLoading}
          socket={socketRef.current}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FiMessageCircle />
          <h1>Messages</h1>
        </div>
        <button className={styles.newChatBtn} onClick={handleNewChat}>
          <FiPlus /> New
        </button>
      </div>

      <div className={styles.content}>
        {/* Conversations List */}
        <div className={styles.conversationsList}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : conversations.length === 0 ? (
            <div className={styles.empty}>
              <FiMessageCircle />
              <p>No messages yet</p>
              <small>Start a conversation with a teacher or admin</small>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              activeId={activeConversation?.id}
              onSelect={handleSelectConversation}
              loading={false}
            />
          )}
        </div>

        {/* Chat Window - Desktop only */}
        {!isMobile && (
          <div className={styles.chatArea}>
            {activeConversation ? (
              <>
                <div className={styles.chatHeader}>
                  <div className={styles.avatar}><FiUser /></div>
                  <div className={styles.headerInfo}>
                    <h3>
                      {activeConversation.participants?.find(p => p.user_id !== currentUserId)?.user_name}
                    </h3>
                    <span>
                      {activeConversation.participants?.find(p => p.user_id !== currentUserId)?.user_type === 'teacher' ? 'Teacher' : 'Admin'}
                    </span>
                  </div>
                </div>
                <ChatWindow
                  conversation={activeConversation}
                  messages={messages}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  currentUserType={currentUserType}
                  onSendMessage={handleSendMessage}
                  isLoading={messagesLoading}
                  socket={socketRef.current}
                />
              </>
            ) : (
              <div className={styles.noChat}>
                <FiMessageCircle />
                <h3>Select a conversation to start chatting</h3>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNewChatModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>New Conversation</h2>
              <button className={styles.closeBtn} onClick={() => setShowNewChatModal(false)}>
                <FiX />
              </button>
            </div>

            <div className={styles.modalSearch}>
              <FiSearch />
              <input
                type="text"
                placeholder="Search teachers or admins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.modalContent}>
              {contactsLoading ? (
                <div className={styles.modalLoading}>Loading contacts...</div>
              ) : filteredContacts.length > 0 ? (
                <div className={styles.contactsList}>
                  {filteredContacts.map(contact => (
                    <div
                      key={contact.id}
                      className={styles.contactItem}
                      onClick={() => handleStartConversation(contact)}
                    >
                      <div className={styles.contactAvatar}>
                        <FiUser />
                      </div>
                      <div className={styles.contactInfo}>
                        <h4>{contact.name}</h4>
                        <p className={styles.contactType}>
                          {contact.type === 'teacher' ? 'Teacher' : 'Administrator'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.modalEmpty}>
                  <FiUser />
                  <p>No contacts found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardianMessages;
