// Reusable Chat Window Component
import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiPaperclip, FiX, FiDownload, FiFile } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ChatWindow.module.css';

const ChatWindow = ({ 
  conversation, 
  messages, 
  currentUserId, 
  currentUserName,
  currentUserType,
  onSendMessage, 
  onLoadMore,
  isLoading,
  socket 
}) => {
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket.IO listeners
  useEffect(() => {
    if (!socket || !conversation) return;

    // Join conversation room
    socket.emit('join_conversation', conversation.id);

    // Listen for new messages
    const handleNewMessage = (message) => {
      // Message will be added by parent component
    };

    // Listen for typing indicators
    const handleUserTyping = ({ userId, userName }) => {
      if (userId !== currentUserId) {
        setTypingUsers(prev => new Set(prev).add(userName));
      }
    };

    const handleUserStoppedTyping = ({ userId }) => {
      if (userId !== currentUserId) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          // Remove by userId - we need to track userId to userName mapping
          return newSet;
        });
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stopped_typing', handleUserStoppedTyping);

    return () => {
      socket.emit('leave_conversation', conversation.id);
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stopped_typing', handleUserStoppedTyping);
    };
  }, [socket, conversation, currentUserId]);

  const handleTyping = () => {
    if (!isTyping && socket && conversation) {
      setIsTyping(true);
      socket.emit('typing_start', {
        conversationId: conversation.id,
        userId: currentUserId,
        userName: currentUserName
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (socket && conversation) {
        socket.emit('typing_stop', {
          conversationId: conversation.id,
          userId: currentUserId
        });
      }
    }, 2000);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(prev => [...prev, ...files].slice(0, 5)); // Max 5 files
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!messageText.trim() && attachments.length === 0) || sending) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('senderId', currentUserId);
      formData.append('senderType', currentUserType);
      formData.append('senderName', currentUserName);
      formData.append('messageText', messageText);

      attachments.forEach(file => {
        formData.append('attachments', file);
      });

      await onSendMessage(formData);

      // Clear input
      setMessageText('');
      setAttachments([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Stop typing indicator
      if (socket && conversation) {
        socket.emit('typing_stop', {
          conversationId: conversation.id,
          userId: currentUserId
        });
      }
      setIsTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getFileIcon = (fileType) => {
    if (fileType?.startsWith('image/')) return '🖼️';
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('word')) return '📝';
    if (fileType?.includes('excel') || fileType?.includes('spreadsheet')) return '📊';
    return '📎';
  };

  if (!conversation) {
    return (
      <div className={styles.noConversation}>
        <p>Select a conversation to start chatting</p>
      </div>
    );
  }

  return (
    <div className={styles.chatWindow}>
      {/* Messages Area */}
      <div className={styles.messagesArea}>
        {isLoading ? (
          <div className={styles.loading}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className={styles.noMessages}>
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const isOwn = message.sender_id === currentUserId;
              const showDate = index === 0 || 
                formatDate(messages[index - 1].created_at) !== formatDate(message.created_at);

              return (
                <React.Fragment key={message.id}>
                  {showDate && (
                    <div className={styles.dateLabel}>
                      {formatDate(message.created_at)}
                    </div>
                  )}
                  <motion.div
                    className={`${styles.message} ${isOwn ? styles.own : styles.other}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {!isOwn && (
                      <div className={styles.senderName}>{message.sender_name}</div>
                    )}
                    {message.message_text && (
                      <div className={styles.messageText}>{message.message_text}</div>
                    )}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className={styles.attachments}>
                        {message.attachments.map(att => (
                          <a
                            key={att.id}
                            href={`/api/chats/attachments/${att.id}`}
                            download={att.original_name}
                            className={styles.attachment}
                          >
                            <span>{getFileIcon(att.file_type)}</span>
                            <span>{att.original_name}</span>
                            <FiDownload />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className={styles.messageTime}>{formatTime(message.created_at)}</div>
                  </motion.div>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* Typing Indicator */}
        <AnimatePresence>
          {typingUsers.size > 0 && (
            <motion.div
              className={styles.typingIndicator}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <span className={styles.typingDots}>
                <span></span>
                <span></span>
                <span></span>
              </span>
              <span>{Array.from(typingUsers)[0]} is typing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className={styles.inputArea}>
        {/* Attachment Preview */}
        {attachments.length > 0 && (
          <div className={styles.attachmentPreview}>
            {attachments.map((file, index) => (
              <div key={index} className={styles.attachmentItem}>
                <FiFile />
                <span>{file.name}</span>
                <button onClick={() => removeAttachment(index)}>
                  <FiX />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.inputRow}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            style={{ display: 'none' }}
          />
          <button
            className={styles.attachBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= 5}
          >
            <FiPaperclip />
          </button>
          <textarea
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              handleTyping();
            }}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            rows={1}
            disabled={sending}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || (!messageText.trim() && attachments.length === 0)}
          >
            {sending ? '...' : <FiSend />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
