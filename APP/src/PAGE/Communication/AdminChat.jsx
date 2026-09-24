import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import io from 'socket.io-client';
import { FiMessageCircle, FiSearch, FiUser, FiSend } from 'react-icons/fi';
import ChatWindow from '../../COMPONENTS/Chat/ChatWindow';
import ConversationList from '../../COMPONENTS/Chat/ConversationList';
import Input from '../../COMPONENTS/Input/Input';
import Button from '../../COMPONENTS/Button/Button';
import Badge from '../../COMPONENTS/Badge/Badge';
import { useApp } from '../../context/AppContext';
import { formatAPIError } from '../../utils/errorMessages';

import styles from './AdminChat.module.css';

const AdminChat = () => {
  const { t } = useTranslation();
  const { profile } = useApp();
  const [guardians, setGuardians] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [attachment, setAttachment] = useState(null); // media: image/video/file
  const fileInputRef = useRef(null);
  const [sending, setSending] = useState(false);
  const socketRef = useRef(null);

  const currentUserId = 'admin_1'; // Get from localStorage in production
  // FIX (1C): use the PROFILE name from Settings (not the hardcoded 'Admin')
  // so notifications say "[Profile Name] sent you message"
  const currentUserName = (profile && profile.name && profile.name.trim()) || 'Admin';
  const currentUserType = 'admin';

  useEffect(() => {
    // Initialize Socket.IO
    socketRef.current = io(window.location.origin);
    socketRef.current.emit('join', currentUserId);

    // Listen for new messages
    socketRef.current.on('new_message', (message) => {
      console.log('New message received via socket:', message);
      setMessages(prev => [...prev, message]);
      // Update conversation list
      fetchConversations();
    });

    // Listen for send_message events (when someone sends in a conversation)
    socketRef.current.on('send_message', (data) => {
      console.log('Send message event received:', data);
      if (data.message && activeConversation && data.conversationId === activeConversation.id) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.find(m => m.id === data.message.id)) {
            return prev;
          }
          return [...prev, data.message];
        });
      }
    });

    fetchGuardians();
    fetchConversations();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Join conversation room when active conversation changes
  useEffect(() => {
    if (socketRef.current && activeConversation) {
      console.log('Joining conversation room:', activeConversation.id);
      socketRef.current.emit('join_conversation', activeConversation.id);
      
      // Poll for new messages every 3 seconds as fallback
      const pollInterval = setInterval(() => {
        if (activeConversation && activeConversation.id) {
          fetchMessages(activeConversation.id, false); // Don't show loading spinner
        }
      }, 3000);
      
      return () => {
        clearInterval(pollInterval);
        if (socketRef.current && activeConversation) {
          socketRef.current.emit('leave_conversation', activeConversation.id);
        }
      };
    }
  }, [activeConversation]);

  const fetchGuardians = async () => {
    try {
      const res = await axios.get(`/api/chats/contacts/guardians`);
      setGuardians(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching guardians:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`/api/chats/conversations?userId=${currentUserId}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setConversations(data.map(c => ({ ...c, currentUserId })));
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const fetchMessages = async (conversationId, showLoading = true) => {
    if (showLoading) {
      setMessagesLoading(true);
    }
    try {
      const res = await axios.get(`/api/chats/conversations/${conversationId}/messages`);
      setMessages(res.data);
      
      // Mark as read
      await axios.put('/api/chats/messages/read', {
        conversationId,
        userId: currentUserId
      });
      
      fetchConversations(); // Refresh to update unread count
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      if (showLoading) {
        setMessagesLoading(false);
      }
    }
  };

  const handleSelectGuardian = async (guardian) => {
    console.log('Guardian clicked:', guardian);
    
    // Format guardian ID with prefix to match guardian's format
    const guardianUserId = `guardian_${guardian.id}`;
    
    // Immediately set a basic conversation so UI shows
    const tempConversation = {
      id: guardian.id,
      type: 'admin_guardian',
      participants: [
        { user_id: currentUserId, user_type: 'admin', user_name: currentUserName },
        { user_id: guardianUserId, user_type: 'guardian', user_name: guardian.name }
      ]
    };
    
    setActiveConversation(tempConversation);
    setMessages([]);
    setMessagesLoading(true);
    
    try {
      // Create or get conversation
      const res = await axios.post(`/api/chats/conversations`, {
        type: 'admin_guardian',
        participants: [
          { user_id: currentUserId, user_type: 'admin', user_name: currentUserName },
          { user_id: guardianUserId, user_type: 'guardian', user_name: guardian.name }
        ]
      });

      console.log('Conversation response:', res.data);
      const convId = res.data.id;
      
      // Fetch full conversation details
      const convRes = await axios.get(`/api/chats/conversations/${convId}`);
      console.log('Full conversation:', convRes.data);
      setActiveConversation(convRes.data);
      
      // Fetch messages
      await fetchMessages(convId);
      
      // Refresh conversations list
      fetchConversations();
    } catch (error) {
      console.error('Error selecting guardian:', error);
      console.error('Error details:', error.response?.data);
      
      // Keep the temp conversation so chat window still shows
      setMessagesLoading(false);
    }
  };

  const handleSelectConversation = async (conversation) => {
    setActiveConversation(conversation);
    await fetchMessages(conversation.id);
  };

  const handleSendMessage = async (formData) => {
    try {
      const res = await axios.post(
        `/api/chats/conversations/${activeConversation.id}/messages`,
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

      fetchConversations(); // Refresh list
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const handleSendMessageDirect = async () => {
    console.log('=== SEND MESSAGE DEBUG ===');
    console.log('messageText:', messageText);
    console.log('sending:', sending);
    console.log('activeConversation:', activeConversation);
    
    if (!messageText.trim() || sending || !activeConversation) {
      console.log('Send blocked - conditions not met');
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('senderId', currentUserId);
      formData.append('senderType', currentUserType);
      formData.append('senderName', currentUserName);
      formData.append('messageText', messageText.trim());
      if (attachment) {
        formData.append('attachment', attachment); // media file (image/video/doc)
      }

      console.log('Sending message to conversation:', activeConversation.id);
      console.log('FormData:', {
        senderId: currentUserId,
        senderType: currentUserType,
        senderName: currentUserName,
        messageText: messageText.trim()
      });

      await handleSendMessage(formData);
      console.log('Message sent successfully!');
      setMessageText('');
      setAttachment(null);
    } catch (error) {
      console.error('Error sending message:', error);
      console.error('Error response:', error.response?.data);
      alert(t('communication.messages.sendFailed', 'Failed to send message: {{error}}', {
        error: error.response?.data?.error || error.message
      }));
    } finally {
      setSending(false);
    }
  };

  const filteredGuardians = guardians.filter(g =>
    g.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <main className={styles.container} aria-label={t('communication.messages.title', 'Messages')}>
      <header className={styles.header}>
        <FiMessageCircle aria-hidden="true" />
        <h1>{t('communication.messages.title', 'Messages')}</h1>
        {totalUnread > 0 && (
          <Badge variant="error" aria-label={t('communication.messages.unread', 'Unread')}>
            {totalUnread}
          </Badge>
        )}
      </header>

      <div className={styles.content}>
        {/* Guardians List */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>{t('communication.messages.guardians', 'Guardians')}</h3>
          </div>
          <div className={styles.search}>
            <Input
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('communication.messages.search', 'Search guardians...')}
              prefixIcon={<FiSearch size={16} />}
              ariaLabel={t('communication.messages.search', 'Search guardians')}
            />
          </div>
          <div className={styles.guardianList}>
            {loading ? (
              <div className={styles.loading}>{t('common.loading', 'Loading...')}</div>
            ) : filteredGuardians.length === 0 ? (
              <div className={styles.empty}>{t('communication.messages.noGuardians', 'No guardians found')}</div>
            ) : (
              filteredGuardians.map(guardian => (
                <div
                  key={guardian.id}
                  className={`${styles.guardianItem} ${activeConversation?.participants?.find(p => p.user_id === guardian.id) ? styles.active : ''}`}
                  onClick={() => handleSelectGuardian(guardian)}
                >
                  <div className={styles.avatar}><FiUser /></div>
                  <div className={styles.info}>
                    <div className={styles.name}>{guardian.name}</div>
                    {guardian.phone && <div className={styles.phone}>{guardian.phone}</div>}
                    {guardian.students && guardian.students.length > 0 && (
                      <div className={styles.students}>
                        {t('communication.messages.guardianOf', 'Guardian of')}:{' '}
                        {guardian.students.map((s) => `${s.name} (${s.class})`).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Window */}
        <div className={styles.chat}>
          {activeConversation ? (
            <div className={styles.chatContainer}>
              <div className={styles.chatHeader}>
                <div className={styles.avatar}><FiUser /></div>
                <div>
                  <h3>
                    {activeConversation.participants?.find(p => p.user_id !== currentUserId)?.user_name ||
                      t('communication.messages.guardianLabel', 'Guardian')}
                  </h3>
                  <span>{t('communication.messages.guardianLabel', 'Guardian')}</span>
                </div>
              </div>
              
              {/* Input at TOP */}
              <div className={styles.topInputArea}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className={styles.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Attach image, video or file"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 20, padding: '0 6px', opacity: attachment ? 1 : 0.6
                  }}
                >
                  📎{attachment ? ' ✅' : ''}
                </button>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessageDirect();
                    }
                  }}
                  placeholder={attachment ? `Sending "${attachment.name}" — type a message...` : t('communication.messages.typePlaceholder', 'Type your message here...')}
                  rows={2}
                  disabled={sending}
                  className={styles.topInput}
                />
                <Button
                  className={styles.topSendBtn}
                  onClick={handleSendMessageDirect}
                  disabled={sending || !messageText.trim()}
                  loading={sending}
                  icon={<FiSend />}
                >
                  {t('communication.messages.send', 'Send')}
                </Button>
              </div>

              {/* Messages below */}
              <div className={styles.messagesArea}>
                {messagesLoading ? (
                  <div className={styles.loading}>{t('communication.messages.loadingMessages', 'Loading messages...')}</div>
                ) : messages.length === 0 ? (
                  <div className={styles.noMessages}>
                    <p>{t('communication.messages.emptyThread', 'No messages yet. Start the conversation above!')}</p>
                  </div>
                ) : (
                  <div className={styles.messagesList}>
                    {messages.map((message, index) => {
                      const isOwn = message.sender_id === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={`${styles.message} ${isOwn ? styles.own : styles.other}`}
                        >
                          {!isOwn && (
                            <div className={styles.senderName}>{message.sender_name}</div>
                          )}
                          {message.message_text && (
                            <div className={styles.messageText}>{message.message_text}</div>
                          )}
                          {message.attachments && message.attachments.length > 0 && (
                            <div className={styles.messageAttachments}>
                              {message.attachments.map((att, ai) => {
                                const url = att.url || att.path || '';
                                const isImg = /\.(png|jpe?g|gif|webp|gif)$/i.test(url);
                                const isVid = /\.(mp4|webm|mov|avi)$/i.test(url);
                                if (isImg) return <img key={ai} src={url} alt="attachment" className={styles.attachmentImg} style={{ maxWidth: 220, borderRadius: 8, marginTop: 6 }} />;
                                if (isVid) return <video key={ai} src={url} controls className={styles.attachmentVid} style={{ maxWidth: 220, borderRadius: 8, marginTop: 6 }} />;
                                return <a key={ai} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6 }}>📎 {att.name || 'File'}</a>;
                              })}
                            </div>
                          )}
                          <div className={styles.messageTime}>
                            {new Date(message.created_at).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.noChat}>
              <FiMessageCircle />
              <h3>{t('communication.messages.selectGuardian', 'Select a guardian to start chatting')}</h3>
              <p>{t('communication.messages.selectGuardianHint', 'Click on a guardian from the list to begin a conversation')}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default AdminChat;
