import { useState, useEffect } from 'react';
import { FiAlertCircle, FiUser, FiCalendar, FiFilter, FiDownload, FiSearch, FiBarChart2, FiTrendingUp, FiUsers, FiFileText, FiPlus, FiX, FiSave, FiTrash2 } from 'react-icons/fi';
import axios from 'axios';
import styles from './FaultsPage.module.css';
import { useDebounce } from '../../hooks/useDebounce';

const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api'));

const FaultsPage = () => {
  const [faults, setFaults] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [dateFilter, setDateFilter] = useState('all');
  const [stats, setStats] = useState({
    totalFaults: 0,
    uniqueStudents: 0,
    mostCommonType: '',
    recentFaults: 0
  });

  // Add Fault Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    className: '',
    student_name: '',
    fault_type: '',
    fault_level: 'Minor',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [modalStudents, setModalStudents] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState('');

  const faultTypes = [
    // Attendance Issues
    'Late Arrival', 'Absence Without Notice', 'Truancy', 'Leaving Class Without Permission',
    'Leaving School Without Permission', 'Skipping Class',
    // Academic Infractions
    'Incomplete Homework', 'Late Homework Submission', 'No Homework', 'Cheating',
    'Plagiarism', 'Copying from Others', 'Unprepared for Class', 'Not Bringing Required Materials',
    'Sleeping in Class', 'Not Participating in Class',
    // Behavioral Issues
    'Disruptive Behavior', 'Talking During Class', 'Making Noise', 'Disturbing Others',
    'Disrespect to Teacher', 'Disrespect to Staff', 'Disrespect to Students', 'Insubordination',
    'Defiance', 'Arguing with Teacher', 'Refusing to Follow Instructions',
    // Bullying & Harassment
    'Bullying', 'Verbal Bullying', 'Physical Bullying', 'Cyberbullying',
    'Harassment', 'Intimidation', 'Threatening Others',
    // Physical Altercations
    'Fighting', 'Physical Aggression', 'Pushing/Shoving', 'Hitting', 'Kicking', 'Horseplay',
    // Language & Communication
    'Profanity', 'Inappropriate Language', 'Vulgar Gestures', 'Name Calling',
    'Gossiping', 'Spreading Rumors',
    // Dress Code & Appearance
    'Uniform Violation', 'Improper Uniform', 'Missing Uniform Items',
    'Inappropriate Clothing', 'Dress Code Violation', 'Improper Grooming',
    // Technology Misuse
    'Phone Use in Class', 'Unauthorized Device Use', 'Inappropriate Internet Use',
    'Social Media Misuse', 'Taking Unauthorized Photos/Videos', 'Gaming During Class',
    // Property & Vandalism
    'Vandalism', 'Damaging School Property', 'Graffiti', 'Littering',
    'Theft', 'Stealing', 'Misusing School Property',
    // Safety Violations
    'Running in Hallways', 'Unsafe Behavior', 'Not Following Safety Rules',
    'Reckless Behavior', 'Dangerous Play',
    // Food & Cafeteria
    'Eating in Class', 'Food Fight', 'Cafeteria Misconduct', 'Not Cleaning Up After Eating',
    // Substance Related
    'Smoking', 'Possession of Prohibited Items', 'Substance Abuse',
    // Dishonesty
    'Lying', 'Forgery', 'Falsifying Documents', 'Providing False Information',
    // Other
    'Public Display of Affection', 'Inappropriate Behavior', 'Violation of School Rules', 'Other'
  ];

  const getAuthConfig = () => {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  };

  // Fetch students when modal class changes
  const fetchModalStudents = async (className) => {
    if (!className) return setModalStudents([]);
    try {
      const res = await axios.get(`${API_BASE_URL}/faults/students/${className}`, getAuthConfig());
      setModalStudents(Array.isArray(res.data) ? res.data : []);
    } catch {
      setModalStudents([]);
    }
  };

  const handleAddFormClassChange = (className) => {
    setAddForm(f => ({ ...f, className, student_name: '' }));
    fetchModalStudents(className);
  };

  const handleSubmitFault = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.className || !addForm.student_name || !addForm.description) {
      setAddError('Please fill in all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('className', addForm.className);
      formData.append('student_name', addForm.student_name);
      formData.append('fault_type', addForm.fault_type);
      formData.append('fault_level', addForm.fault_level);
      formData.append('date', addForm.date);
      formData.append('description', addForm.description);
      formData.append('reported_by', 'Admin');
      await axios.post(`${API_BASE_URL}/faults/add-fault`, formData, getAuthConfig());
      setShowAddModal(false);
      setAddForm({ className: '', student_name: '', fault_type: '', fault_level: 'Minor', description: '', date: new Date().toISOString().split('T')[0] });
      setModalStudents([]);
      fetchAllFaults();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add fault');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFault = async (fault, className) => {
    if (!window.confirm(`Delete this fault for ${fault.student_name}?`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/faults/delete-fault/${className}/${fault.id}`, getAuthConfig());
      fetchAllFaults();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete fault');
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchAllFaults();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [faults]);

  const fetchClasses = async () => {
    try {
      // Use the same endpoint as student list to get proper class names
      const response = await axios.get(`${API_BASE_URL}/student-list/classes`);
      setClasses(response.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchAllFaults = async () => {
    try {
      setLoading(true);
      // Use the same endpoint as student list to get proper class names
      const response = await axios.get(`${API_BASE_URL}/student-list/classes`);
      const allClasses = response.data;
      const allFaults = [];

      for (const className of allClasses) {
        try {
          const faultsResponse = await axios.get(
            `${API_BASE_URL}/faults/faults/${className}`,
            getAuthConfig()
          );
          const classFaults = faultsResponse.data.map(fault => ({
            ...fault,
            className
          }));
          allFaults.push(...classFaults);
        } catch (error) {
          console.error(`Error fetching faults for ${className}:`, error);
        }
      }

      setFaults(allFaults);
    } catch (error) {
      console.error('Error fetching all faults:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const uniqueStudents = new Set(faults.map(f => `${f.student_name}-${f.className}`)).size;

    const typeCounts = {};
    faults.forEach(fault => {
      const type = fault.type || fault.fault_type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const mostCommonType = Object.keys(typeCounts).reduce((a, b) => 
      typeCounts[a] > typeCounts[b] ? a : b, ''
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentFaults = faults.filter(f => new Date(f.date) >= sevenDaysAgo).length;

    setStats({
      totalFaults: faults.length,
      uniqueStudents,
      mostCommonType,
      recentFaults
    });
  };

  const filterFaults = () => {
    return faults.filter(fault => {
      const matchesClass = selectedClass === 'all' || fault.className === selectedClass;
      const matchesType = selectedType === 'all' || (fault.type || fault.fault_type) === selectedType;
      const matchesSearch = debouncedSearch === '' || 
        fault.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fault.description.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesDate = true;
      if (dateFilter !== 'all') {
        const faultDate = new Date(fault.date);
        const today = new Date();
        
        if (dateFilter === 'today') {
          matchesDate = faultDate.toDateString() === today.toDateString();
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(today.setDate(today.getDate() - 7));
          matchesDate = faultDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(today.setMonth(today.getMonth() - 1));
          matchesDate = faultDate >= monthAgo;
        }
      }

      return matchesClass && matchesType && matchesSearch && matchesDate;
    });
  };

  const groupFaultsByStudent = (faultsList) => {
    const grouped = {};
    faultsList.forEach(fault => {
      const key = `${fault.student_name}-${fault.className}`;
      if (!grouped[key]) {
        grouped[key] = {
          student_name: fault.student_name,
          className: fault.className,
          faults: []
        };
      }
      grouped[key].faults.push(fault);
    });

    Object.values(grouped).forEach(group => {
      group.faults.sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    return Object.values(grouped);
  };

  const getOrdinalSuffix = (num) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + 'st';
    if (j === 2 && k !== 12) return num + 'nd';
    if (j === 3 && k !== 13) return num + 'rd';
    return num + 'th';
  };

  const exportToCSV = () => {
    const filtered = filterFaults();
    const headers = ['Date', 'Class', 'Student', 'Fault Type', 'Level', 'Description', 'Reported By'];
    const rows = filtered.map(f => [
      new Date(f.date).toLocaleDateString(),
      f.className,
      f.student_name,
      f.type || f.fault_type,
      f.level || 'N/A',
      f.description,
      f.reported_by
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faults-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const uniqueTypes = [...new Set(faults.map(f => f.type || f.fault_type))].filter(Boolean);
  const filteredFaults = filterFaults();
  const groupedFaults = groupFaultsByStudent(filteredFaults);

  return (
    <>
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>
            <FiAlertCircle /> Student Faults Management
          </h1>
          <p className={styles.subtitle}>Monitor and manage student discipline records</p>
        </div>
        <button className={styles.exportButton} onClick={exportToCSV}>
          <FiDownload /> Export Report
        </button>
        <button className={styles.addFaultButton} onClick={() => setShowAddModal(true)}>
          <FiPlus /> Add Fault
        </button>
      </div>

      {/* Statistics Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <FiFileText />
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>Total Faults</p>
            <p className={styles.statValue}>{stats.totalFaults}</p>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <FiUsers />
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>Students with Faults</p>
            <p className={styles.statValue}>{stats.uniqueStudents}</p>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <FiTrendingUp />
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>Last 7 Days</p>
            <p className={styles.statValue}>{stats.recentFaults}</p>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
            <FiBarChart2 />
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>Most Common</p>
            <p className={styles.statValue} style={{ fontSize: '0.875rem' }}>
              {stats.mostCommonType || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersCard}>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label><FiFilter /> Class</label>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label><FiAlertCircle /> Fault Type</label>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
              <option value="all">All Types</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label><FiCalendar /> Date Range</label>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label><FiSearch /> Search</label>
            <input
              type="text"
              placeholder="Student name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Faults List */}
      <div className={styles.faultsCard}>
        <div className={styles.faultsHeader}>
          <h2>Fault Records ({filteredFaults.length} faults from {groupedFaults.length} students)</h2>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>Loading faults...</p>
          </div>
        ) : groupedFaults.length === 0 ? (
          <div className={styles.emptyState}>
            <FiAlertCircle size={48} />
            <p>No faults found matching your filters</p>
          </div>
        ) : (
          <div className={styles.faultsList}>
            {groupedFaults.map((group, groupIndex) => (
              <div key={groupIndex} className={styles.studentFaultGroup}>
                {/* Student Header */}
                <div className={styles.studentGroupHeader}>
                  <div className={styles.studentInfo}>
                    <FiUser size={24} />
                    <div>
                      <h3 className={styles.studentName}>{group.student_name}</h3>
                      <span className={styles.className}>{group.className}</span>
                    </div>
                  </div>
                  <div className={styles.totalOffenses}>
                    <span className={styles.offenseCount}>{group.faults.length}</span>
                    <span className={styles.offenseLabel}>Total Offenses</span>
                  </div>
                </div>

                {/* All Faults for this Student */}
                <div className={styles.studentFaultsList}>
                  {group.faults.map((fault, faultIndex) => {
                    const offenseNumber = faultIndex + 1;
                    const offenseLabel = getOrdinalSuffix(offenseNumber);

                    return (
                      <div key={fault.id || faultIndex} className={styles.faultItem}>
                        <div className={styles.faultItemHeader}>
                          <span className={styles.offenseNumber}>{offenseLabel} Offense</span>
                          <span className={styles.faultDate}>
                            <FiCalendar />
                            {new Date(fault.date).toLocaleDateString()}
                          </span>
                        </div>

                        <div className={styles.faultType}>
                          <FiAlertCircle />
                          <span>{fault.type || fault.fault_type}</span>
                          {fault.level && (
                            <span className={`${styles.levelBadge} ${styles[`level${fault.level}`]}`}>
                              {fault.level}
                            </span>
                          )}
                        </div>

                        <p className={styles.faultDescription}>{fault.description}</p>

                        <div className={styles.faultItemFooter}>
                          {fault.reported_by && (
                            <span className={styles.reportedBy}>Reported by: {fault.reported_by}</span>
                          )}
                          <button
                            onClick={() => handleDeleteFault(fault, group.className)}
                            style={{ marginLeft:'auto', background:'none', border:'1.5px solid #fca5a5', borderRadius:'8px', color:'#dc2626', padding:'0.3rem 0.75rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.8rem', fontWeight:600, transition:'all 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background='#fee2e2'}
                            onMouseOut={e => e.currentTarget.style.background='none'}
                          >
                            <FiTrash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

      {/* Add Fault Modal */}
      {showAddModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
          onClick={() => setShowAddModal(false)}>
          <div style={{ background:'white', borderRadius:'20px', padding:'2rem', width:'100%', maxWidth:'500px', maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ margin:0, fontSize:'1.25rem', fontWeight:700, color:'#1f2937' }}><FiAlertCircle style={{ marginRight:'0.5rem' }}/>Add Fault</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:'1.25rem' }}><FiX /></button>
            </div>

            {addError && <div style={{ background:'#fee2e2', color:'#991b1b', padding:'0.75rem 1rem', borderRadius:'10px', marginBottom:'1rem', fontSize:'0.875rem' }}>{addError}</div>}

            <form onSubmit={handleSubmitFault} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div>
                <label style={{ display:'block', fontSize:'0.875rem', fontWeight:600, color:'#374151', marginBottom:'0.4rem' }}>Class *</label>
                <select value={addForm.className} onChange={e => handleAddFormClassChange(e.target.value)}
                  style={{ width:'100%', padding:'0.75rem', border:'2px solid #e5e7eb', borderRadius:'10px', fontSize:'0.9375rem' }} required>
                  <option value="">Select class...</option>
                  {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display:'block', fontSize:'0.875rem', fontWeight:600, color:'#374151', marginBottom:'0.4rem' }}>Student *</label>
                <select value={addForm.student_name} onChange={e => setAddForm(f => ({ ...f, student_name: e.target.value }))}
                  style={{ width:'100%', padding:'0.75rem', border:'2px solid #e5e7eb', borderRadius:'10px', fontSize:'0.9375rem' }} required disabled={!addForm.className}>
                  <option value="">Select student...</option>
                  {modalStudents.map(s => <option key={s.school_id} value={s.student_name}>{s.student_name}</option>)}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'1rem' }}>
                <div>
                  <label style={{ display:'block', fontSize:'0.875rem', fontWeight:600, color:'#374151', marginBottom:'0.4rem' }}>Fault Type (optional)</label>
                  <select value={addForm.fault_type} onChange={e => setAddForm(f => ({ ...f, fault_type: e.target.value }))}
                    style={{ width:'100%', padding:'0.75rem', border:'2px solid #e5e7eb', borderRadius:'10px', fontSize:'0.9375rem' }}>
                    <option value="">Not specified</option>
                    {faultTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display:'block', fontSize:'0.875rem', fontWeight:600, color:'#374151', marginBottom:'0.4rem' }}>Date *</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                  style={{ width:'100%', padding:'0.75rem', border:'2px solid #e5e7eb', borderRadius:'10px', fontSize:'0.9375rem', boxSizing:'border-box' }} required />
              </div>

              <div>
                <label style={{ display:'block', fontSize:'0.875rem', fontWeight:600, color:'#374151', marginBottom:'0.4rem' }}>Description *</label>
                <textarea value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Describe the fault..."
                  style={{ width:'100%', padding:'0.75rem', border:'2px solid #e5e7eb', borderRadius:'10px', fontSize:'0.9375rem', resize:'vertical', boxSizing:'border-box' }} required />
              </div>

              <div style={{ display:'flex', gap:'0.75rem', marginTop:'0.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)}
                  style={{ flex:1, padding:'0.875rem', border:'2px solid #e5e7eb', borderRadius:'12px', background:'white', color:'#374151', fontWeight:600, cursor:'pointer', fontSize:'0.9375rem' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  style={{ flex:1, padding:'0.875rem', border:'none', borderRadius:'12px', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', fontWeight:600, cursor:'pointer', fontSize:'0.9375rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                  <FiSave /> {submitting ? 'Saving...' : 'Save Fault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default FaultsPage;
