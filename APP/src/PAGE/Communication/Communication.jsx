// Communication.jsx - Modern Redesigned Communication Page
import React, { useState, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { addRequest } from '../store/slices/chatSlice';
import io from 'socket.io-client';
import { 
  FiSend, FiPlus, FiX, FiMessageCircle, FiUsers, 
  FiSearch, FiFilter, FiMoreVertical, FiCheck, 
  FiClock, FiUser, FiMail, FiChevronRight
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import NewRequestModal from './NewRequestModal';
import RespondForm from './RespondForm';
import styles from './Communication.module.css';

const Communication = ({ activeChatId, userId, requests = [] }) => {
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showRespond, setShowRespond] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const dispatch = useDispatch();
  const socket = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const actualUserId = userId && userId !== 'currentUserId' ? userId : '1';
    
    if (!actualUserId) {
      console.error('No valid user ID found');
      return;
    }

    socket.current = io('');
    socket.current.emit('join', actualUserId.toString());

    socket.current.on('new_request', (request) => {
      if (request.recipientId === actualUserId || request.recipient_id === actualUserId) {
        dispatch(addRequest({ userId: request.senderId || request.sender_id, request }));
      }
    });

    socket.current.on('new_response', (request) => {
      if (request.senderId === actualUserId || request.sender_id === actualUserId) {
        dispatch(addRequest({ userId: request.recipientId || request.recipient_id, request }));
      }
    });

    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, [userId, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [requests]);

  const handleNewRequest = (newReq) => {
    setShowNewRequest(false);
  };

  const handleRespond = (resp) => {
    setShowRespond(false);
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.sender_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.questions?.some(q => q.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterStatus === 'all' || req.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const pendingRequest = requests.find(r => r.status === 'pending' && 
    (r.recipientId === userId || r.recipient_id === userId));

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending': return '#f39c12';
      case 'responded': return '#27ae60';
      case 'closed': return '#95a5a6';
      default: return '#3498db';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pending': return <FiClock />;
      case 'responded': return <FiCheck />;
      default: return <FiMail />;
    }
  };

  return (
    <div className={styles.communicationPage}>
      {/* Header */}
      <motion.div 
        className={styles.pageHeader}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            <FiMessageCircle className={styles.headerIcon} />
            <div>
              <h1>Communication Center</h1>
              <p>Manage all your messages and requests</p>
            </div>
          </div>
          <motion.button 
            className={styles.newRequestBtn}
            onClick={() => setShowNewRequest(true)}
            disabled={!!pendingRequest}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <FiPlus /> New Request
          </motion.button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <motion.div 
          className={styles.statCard}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className={styles.statIcon} style={{ background: '#e3f2fd' }}>
            <FiMail style={{ color: '#2196f3' }} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{requests.length}</span>
            <span className={styles.statLabel}>Total Messages</span>
          </div>
        </motion.div>

        <motion.div 
          className={styles.statCard}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className={styles.statIcon} style={{ background: '#fff3e0' }}>
            <FiClock style={{ color: '#ff9800' }} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>
              {requests.filter(r => r.status === 'pending').length}
            </span>
            <span className={styles.statLabel}>Pending</span>
          </div>
        </motion.div>

        <motion.div 
          className={styles.statCard}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className={styles.statIcon} style={{ background: '#e8f5e9' }}>
            <FiCheck style={{ color: '#4caf50' }} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>
              {requests.filter(r => r.status === 'responded').length}
            </span>
            <span className={styles.statLabel}>Responded</span>
          </div>
        </motion.div>

        <motion.div 
          className={styles.statCard}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className={styles.statIcon} style={{ background: '#fce4ec' }}>
            <FiUsers style={{ color: '#e91e63' }} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>
              {[...new Set(requests.map(r => r.sender_name))].length}
            </span>
            <span className={styles.statLabel}>Contacts</span>
          </div>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Sidebar - Request List */}
        <motion.div 
          className={styles.sidebar}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          {/* Search and Filter */}
          <div className={styles.searchSection}>
            <div className={styles.searchBox}>
              <FiSearch className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className={styles.filterTabs}>
              {['all', 'pending', 'responded'].map(status => (
                <button
                  key={status}
                  className={`${styles.filterTab} ${filterStatus === status ? styles.active : ''}`}
                  onClick={() => setFilterStatus(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Request List */}
          <div className={styles.requestList}>
            <AnimatePresence>
              {filteredRequests.length === 0 ? (
                <motion.div 
                  className={styles.emptyState}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <FiMessageCircle className={styles.emptyIcon} />
                  <p>No messages found</p>
                </motion.div>
              ) : (
                filteredRequests.map((req, index) => (
                  <motion.div
                    key={`request-${req.id}-${index}`}
                    className={`${styles.requestItem} ${selectedRequest?.id === req.id ? styles.selected : ''}`}
                    onClick={() => setSelectedRequest(req)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ x: 5 }}
                  >
                    <div className={styles.requestAvatar}>
                      <FiUser />
                    </div>
                    <div className={styles.requestInfo}>
                      <div className={styles.requestHeader}>
                        <span className={styles.senderName}>{req.sender_name}</span>
                        <span className={styles.requestTime}>
                          {new Date(req.createdAt || req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className={styles.requestPreview}>
                        {Array.isArray(req.questions) && req.questions[0]?.substring(0, 50)}...
                      </p>
                      <div className={styles.requestMeta}>
                        <span 
                          className={styles.statusBadge}
                          style={{ background: getStatusColor(req.status) }}
                        >
                          {getStatusIcon(req.status)} {req.status}
                        </span>
                        <span className={styles.roleTag}>{req.sender_role}</span>
                      </div>
                    </div>
                    <FiChevronRight className={styles.chevron} />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Detail View */}
        <motion.div 
          className={styles.detailView}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          {selectedRequest ? (
            <div className={styles.requestDetail}>
              <div className={styles.detailHeader}>
                <div className={styles.detailTitle}>
                  <div className={styles.detailAvatar}>
                    <FiUser />
                  </div>
                  <div>
                    <h3>{selectedRequest.sender_name}</h3>
                    <span className={styles.detailRole}>{selectedRequest.sender_role}</span>
                  </div>
                </div>
                <div className={styles.detailActions}>
                  <span 
                    className={styles.statusBadgeLarge}
                    style={{ background: getStatusColor(selectedRequest.status) }}
                  >
                    {getStatusIcon(selectedRequest.status)} {selectedRequest.status}
                  </span>
                  {selectedRequest.status === 'pending' && 
                   (selectedRequest.recipientId === userId || selectedRequest.recipient_id === userId) && (
                    <motion.button
                      className={styles.respondBtn}
                      onClick={() => { 
                        setSelectedRequestId(selectedRequest.id); 
                        setShowRespond(true); 
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <FiSend /> Respond
                    </motion.button>
                  )}
                </div>
              </div>

              <div className={styles.detailContent}>
                <div className={styles.questionsSection}>
                  <h4>Questions</h4>
                  {Array.isArray(selectedRequest.questions) ? (
                    selectedRequest.questions.map((q, i) => (
                      <div key={`q-${i}`} className={styles.questionItem}>
                        <span className={styles.questionNumber}>{i + 1}</span>
                        <p>{q}</p>
                      </div>
                    ))
                  ) : (
                    <p className={styles.noContent}>No questions available</p>
                  )}
                </div>

                {selectedRequest.responses && selectedRequest.responses.length > 0 && (
                  <div className={styles.responsesSection}>
                    <h4>Responses</h4>
                    {selectedRequest.responses.map((r, i) => (
                      <div key={`r-${i}`} className={styles.responseItem}>
                        <span className={styles.responseNumber}>{i + 1}</span>
                        <div className={styles.responseContent}>
                          <p>{r.answer}</p>
                          <span className={styles.responseTime}>
                            {new Date(r.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.detailFooter}>
                <span className={styles.timestamp}>
                  Created: {new Date(selectedRequest.createdAt || selectedRequest.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.noSelection}>
              <FiMessageCircle className={styles.noSelectionIcon} />
              <h3>Select a message</h3>
              <p>Choose a message from the list to view details</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Modals */}
      <NewRequestModal 
        isOpen={showNewRequest} 
        onClose={() => setShowNewRequest(false)} 
        onSubmit={handleNewRequest}
        recipientId={activeChatId}
        senderId={userId}
      />
      <RespondForm 
        isOpen={showRespond} 
        onClose={() => setShowRespond(false)} 
        requestId={selectedRequestId}
        questions={pendingRequest?.questions || selectedRequest?.questions || []}
        onSubmit={handleRespond}
      />
    </div>
  );
};

export default Communication;
