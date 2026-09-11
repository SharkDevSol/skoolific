// ListGuardian.jsx - Guardian List with Student Associations
import { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUsers, FiSearch, FiEye, FiEyeOff, FiX, FiRefreshCw, FiLock, FiCopy, FiDownload,
  FiPhone, FiMail, FiUser, FiGrid, FiList, FiChevronLeft, FiChevronRight
} from 'react-icons/fi';
import { useApp } from '../../../context/AppContext';
import styles from './ListGuardian.module.css';

const ListGuardian = () => {
  const { t } = useApp();
  const [guardians, setGuardians] = useState([]);
  const [filteredGuardians, setFilteredGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedGuardian, setSelectedGuardian] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const itemsPerPage = 12;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  useEffect(() => { fetchGuardians(); }, []);
  useEffect(() => { filterGuardians(); }, [guardians, searchTerm]);

  const fetchGuardians = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/guardian-list/guardians');
      setGuardians(response.data);
      setFilteredGuardians(response.data);
    } catch (error) {
      console.error('Error fetching guardians:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterGuardians = () => {
    const term = searchTerm.toLowerCase();
    const filtered = guardians.filter(guardian => {
      const name = (guardian.guardian_name || '').toLowerCase();
      const phone = (guardian.guardian_phone || '').toLowerCase();
      const email = (guardian.guardian_email || '').toLowerCase();
      return name.includes(term) || phone.includes(term) || email.includes(term);
    });
    setFilteredGuardians(filtered);
    setCurrentPage(1);
  };

  const handleExportExcel = () => {
    if (filteredGuardians.length === 0) {
      alert('No guardians to export');
      return;
    }
    const rows = filteredGuardians.map(guardian => ({
      'Guardian Name': guardian.guardian_name || '',
      'Phone': guardian.guardian_phone || '',
      'Email': guardian.guardian_email || '',
      'Relation': guardian.guardian_relation || '',
      'Username': guardian.guardian_username || '',
      'Students': (guardian.students || []).map(s => s.student_name).join(', ')
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Guardians');
    XLSX.writeFile(wb, `guardians_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };


  const totalPages = Math.ceil(filteredGuardians.length / itemsPerPage);
  const currentGuardians = filteredGuardians.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading && guardians.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading guardians...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.div className={styles.header} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><FiUsers /></div>
          <div>
            <h1>{t('guardianDirectory') || 'Guardian Directory'}</h1>
            <p>{t('guardianDirectoryDesc') || 'View and manage all guardians'}</p>
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{filteredGuardians.length}</span>
            <span className={styles.statLabel}>{t('guardians') || 'Guardians'}</span>
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div className={styles.controls} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input 
            type="text" 
            placeholder={t('searchGuardians') || 'Search guardians...'} 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
        <div className={styles.viewToggle}>
          <button 
            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`} 
            onClick={() => setViewMode('grid')}
          >
            <FiGrid />
          </button>
          <button 
            className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`} 
            onClick={() => setViewMode('list')}
          >
            <FiList />
          </button>
        </div>
        <button className={styles.refreshBtn} onClick={fetchGuardians}>
          <FiRefreshCw /> {t('refresh') || 'Refresh'}
        </button>
        <button className={styles.refreshBtn} onClick={handleExportExcel}>
          <FiDownload /> Download Excel
        </button>
      </motion.div>

      {/* Guardian Display */}
      {currentGuardians.length === 0 ? (
        <div className={styles.emptyState}>
          <FiUsers size={64} />
          <h3>{t('noGuardiansFound') || 'No guardians found'}</h3>
          <p>{t('tryAdjustingFilters') || 'Try adjusting your search'}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div className={styles.guardianGrid} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AnimatePresence>
            {currentGuardians.map((guardian, index) => (
              <motion.div 
                key={guardian.id} 
                className={styles.guardianCard}
                initial={{ opacity: 0, scale: 0.9 }} 
                animate={{ opacity: 1, scale: 1 }} 
                transition={{ delay: index * 0.03 }}
                whileHover={{ y: -5 }}
                onClick={() => { setSelectedGuardian(guardian); setShowModal(true); }}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.avatarPlaceholder}><FiUser /></div>
                  <div className={styles.cardBadges}>
                    <span className={styles.badge}>
                      {guardian.students?.length || 0} {guardian.students?.length === 1 ? 'Student' : 'Students'}
                    </span>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.guardianName}>{guardian.guardian_name || 'Unknown'}</h3>
                  <div className={styles.cardInfo}>
                    {guardian.guardian_phone && (
                      <div className={styles.infoItem}><FiPhone /> {guardian.guardian_phone}</div>
                    )}
                    {guardian.guardian_email && (
                      <div className={styles.infoItem}><FiMail /> {guardian.guardian_email}</div>
                    )}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <button 
                    className={styles.actionBtn}
                    onClick={(e) => { e.stopPropagation(); setSelectedGuardian(guardian); setShowModal(true); }}
                  >
                    <FiEye /> {t('view') || 'View'}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        /* Table View */
        <motion.div className={styles.tableWrapper} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <table className={styles.guardianTable}>
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('phone')}</th>
                <th>{t('email')}</th>
                <th>{t('students')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {currentGuardians.map((guardian) => (
                <tr key={guardian.id} onClick={() => { setSelectedGuardian(guardian); setShowModal(true); }}>
                  <td><strong>{guardian.guardian_name}</strong></td>
                  <td>{guardian.guardian_phone || '-'}</td>
                  <td>{guardian.guardian_email || '-'}</td>
                  <td>{guardian.students?.length || 0}</td>
                  <td>
                    <div className={styles.tableActions}>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedGuardian(guardian); setShowModal(true); }}>
                        <FiEye />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}


      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <FiChevronLeft /> {t('previous') || 'Previous'}
          </button>
          <span>{t('page') || 'Page'} {currentPage} {t('of') || 'of'} {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            {t('next') || 'Next'} <FiChevronRight />
          </button>
        </div>
      )}

      {/* Guardian Detail Modal */}
      <AnimatePresence>
        {showModal && selectedGuardian && (
          <motion.div 
            className={styles.modalOverlay} 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
          >
            <motion.div 
              className={styles.modal}
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>
                <FiX />
              </button>
              <div className={styles.modalHeader}>
                <div className={styles.modalAvatar}><FiUser /></div>
                <div className={styles.modalHeaderInfo}>
                  <h2>{selectedGuardian.guardian_name}</h2>
                  <p>{selectedGuardian.students?.length || 0} {t('associatedStudents')}</p>
                </div>
              </div>
              <div className={styles.modalBody}>
                {/* Contact Information */}
                <div className={styles.modalSection}>
                  <h3><FiUser /> {t('contactInformation')}</h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>{t('name')}</span>
                      <span className={styles.infoValue}>{selectedGuardian.guardian_name || '-'}</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>{t('phone')}</span>
                      <span className={styles.infoValue}>{selectedGuardian.guardian_phone || '-'}</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>{t('relation')}</span>
                      <span className={styles.infoValue}>{selectedGuardian.guardian_relation || '-'}</span>
                    </div>
                  </div>
                </div>
                
                {/* Credentials Section */}
                {(selectedGuardian.guardian_username || selectedGuardian.guardian_password) && (
                  <div className={styles.modalSection}>
                    <h3><FiLock /> {t('loginCredentials')}</h3>
                    <div className={styles.credentialsGrid}>
                      {selectedGuardian.guardian_username && (
                        <div className={styles.credentialRow}>
                          <span className={styles.credentialLabel}>{t('username')}</span>
                          <div className={styles.credentialValue}>
                            <span>{selectedGuardian.guardian_username}</span>
                            <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedGuardian.guardian_username)} title="Copy">
                              <FiCopy />
                            </button>
                          </div>
                        </div>
                      )}
                      {selectedGuardian.guardian_password && (
                        <div className={styles.credentialRow}>
                          <span className={styles.credentialLabel}>{t('password')}</span>
                          <div className={styles.credentialValue}>
                            <span className={styles.passwordText}>
                              {showPassword ? selectedGuardian.guardian_password : '••••••••'}
                            </span>
                            <button className={styles.toggleBtn} onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Hide' : 'Show'}>
                              {showPassword ? <FiEyeOff /> : <FiEye />}
                            </button>
                            <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedGuardian.guardian_password)} title="Copy">
                              <FiCopy />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Associated Students */}
                {selectedGuardian.students && selectedGuardian.students.length > 0 && (
                  <div className={styles.modalSection}>
                    <h3><FiUsers /> {t('associatedStudents')}</h3>
                    <div className={styles.studentsList}>
                      {selectedGuardian.students.map((student, idx) => (
                        <div key={idx} className={styles.studentItem}>
                          <div className={styles.studentAvatar}><FiUser /></div>
                          <div className={styles.studentInfo}>
                            <span className={styles.studentName}>{student.student_name}</span>
                            <span className={styles.studentClass}>Class: {student.class}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ListGuardian;
