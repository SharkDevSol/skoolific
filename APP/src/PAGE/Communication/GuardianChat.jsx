import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import io from 'socket.io-client';
import { FiMessageCircle, FiArrowLeft, FiAlertCircle } from 'react-icons/fi';
import ChatWindow from '../../COMPONENTS/Chat/ChatWindow';
import ConversationList from '../../COMPONENTS/Chat/ConversationList';
import styles from './GuardianChat.module.css';

const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

const GuardianChat = () => {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef(null);

  // Get guardian info from localStorage
  const guardianInfo = JSON.parse(localStorage.getItem('guardianInfo') || '{}');
  const guardianId = guardianInfo.guardian_phone || guardianInfo.guardian_name || 'unknown';
  const currentUserId = `guardian_${guardianId}`;
  const currentUserName = guardianInfo.guardian_name || 'Guardian';
  const currentUserType = 'guardian';

  console.log('Guardian Info:', guardianInfo);
  console.log('Guardian User ID:', currentUserId);

  useEffect(() => {
    // Initialize Socket.IO
    socketRef.current = io(API_URL);
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
      console.log('Fetching conversations for user:', currentUserId);
      const res = await axios.get(`${API_URL}/api/chats/conversations?userId=${currentUserId}`);
      console.log('Conversations fetched:', res.data);
      setConversations(res.data.map(c => ({ ...c, currentUserId })));
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setError('Failed to load conversations. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId) => {
    setMessagesLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/chats/conversations/${conversationId}/messages`);
      setMessages(res.data);
      
      // Mark as read
      await axios.put(`${API_URL}/api/chats/messages/read`, {
        conversationId,
        userId: currentUserId
      });
      
      fetchConversations();
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError('Failed to load messages.');
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
        `${API_URL}/api/chats/conversations/${activeConversation.id}/messages`,
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

  return (
    <main className={styles.container} aria-label={t('communication.messages.title', 'Messages')}>
      {error && (
        <div className={styles.errorBanner} role="alert" style={{ background:'#fee2e2', color:'#991b1b', padding:'10px 16px', margin:'8px 12px', borderRadius:'8px', display:'flex', alignItems:'center', gap:'8px', fontSize:'14px' }}>
          <FiAlertCircle /> {error}
          <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#991b1b', fontWeight:600 }}>Dismiss</button>
        </div>
      )}
      {!activeConversation ? (
        <>
          <header className={styles.header}>
            <FiMessageCircle aria-hidden="true" />
            <h1>{t('communication.messages.title', 'Messages')}</h1>
          </header>
          <div className={styles.conversationsList}>
            {loading ? (
              <div className={styles.loading}>{t('common.loading', 'Loading...')}</div>
            ) : conversations.length === 0 ? (
              <div className={styles.empty}>
                <FiMessageCircle aria-hidden="true" />
                <p>{t('communication.messages.noMessagesYet', 'No messages yet')}</p>
              </div>
            ) : (
              <ConversationList
                conversations={conversations}
                activeId={null}
                onSelect={handleSelectConversation}
                loading={false}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.chatHeader}>
            <button type="button" onClick={handleBackToList} className={styles.backButton} aria-label={t('common.back', 'Back')}>
              <FiArrowLeft />
            </button>
            <div className={styles.headerInfo}>
              <h3>
                {activeConversation.participants?.find(p => p.user_id !== currentUserId)?.user_name}
              </h3>
              <span>{t('communication.messages.adminLabel', 'Admin')}</span>
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
      )}
    </main>
  );
};

export default GuardianChat;
