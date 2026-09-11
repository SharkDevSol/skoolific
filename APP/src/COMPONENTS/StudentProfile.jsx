import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { FiUser, FiUsers, FiFileText, FiList, FiInfo, FiSettings } from 'react-icons/fi';
import { getBranchCode } from '../utils/branchCode';
import { useApp } from '../context/AppContext';
import {
  MobileProfileLayout,
  BottomNavigation,
  ProfileHeader,
  CollapsibleCard,
  SkeletonLoader,
  PostCard,
  useToast,
  ClassCommunicationTab,
  SettingsTab
} from './mobile';
import styles from './StudentProfile.module.css';

const StudentProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [markListData, setMarkListData] = useState([]);
  const [markListLoading, setMarkListLoading] = useState(false);
  const toast = useToast();
  const { t } = useApp();

  const navItems = [
    { id: 'profile', label: t('profile'), icon: <FiUser /> },
    { id: 'class', label: t('classComm'), icon: <FiUsers /> },
    { id: 'posts', label: t('posts'), icon: <FiFileText />, centered: true },
    { id: 'marklist', label: t('marklist'), icon: <FiList /> },
    { id: 'settings', label: t('settings'), icon: <FiSettings /> }
  ];

  const fetchProfile = useCallback(async () => {
    try {
      const response = await axios.get(`/api/students/profile/${username}`, { headers: { 'x-branch-code': (getBranchCode() || '').toUpperCase() } });
      setStudent(response.data.student);
      setError('');
    } catch (err) {
      setError('Failed to fetch profile data. You may not be authorized to view this page.');
      toast.error('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  const fetchProfilePosts = useCallback(async (schoolId) => {
    try {
      const response = await axios.get(`/api/posts/profile/student/${schoolId}`);
      setProfilePosts(response.data.map(post => ({ ...post, localLikes: post.likes || 0 })));
    } catch (err) {
      console.error('Error fetching profile posts:', err);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username, fetchProfile]);

  useEffect(() => {
    if (student) {
      fetchProfilePosts(student.school_id);
    }
  }, [student, fetchProfilePosts]);

  // Fetch student's mark list
  const fetchMarkList = useCallback(async () => {
    if (!student?.school_id || !student?.class) return;
    setMarkListLoading(true);
    try {
      const response = await axios.get(
        `/api/mark-list/student-marks/${student.school_id}/${encodeURIComponent(student.class)}`
      );
      setMarkListData(response.data.marks || []);
    } catch (err) {
      console.error('Error fetching mark list:', err);
    } finally {
      setMarkListLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (activeTab === 'marklist' && student) {
      fetchMarkList();
    }
  }, [activeTab, student, fetchMarkList]);

  const handleRefresh = async () => {
    setIsLoading(true);
    setPostsLoading(true);
    await fetchProfile();
    if (student) {
      await fetchProfilePosts(student.school_id);
    }
    toast.success('Profile refreshed');
  };

  const handleLike = async (postId) => {
    try {
      await axios.put(`/api/posts/${postId}/like`);
      setProfilePosts(prev => 
        prev.map(post => 
          post.id === postId 
            ? { ...post, localLikes: (post.localLikes || 0) + 1 }
            : post
        )
      );
      toast.success('Post liked!');
    } catch (error) {
      console.error('Error liking post:', error);
      toast.error('Failed to like post');
    }
  };

  const handleLogout = () => {
    navigate('/app/student-login');
  };

  const getAdditionalFields = () => {
    if (!student) return [];
    const standardFields = new Set([
      'student_name', 'class', 'age', 'gender', 'school_id', 'class_id',
      'guardian_name', 'guardian_phone', 'guardian_relation', 'id', 'password',
      'image_student', 'username', 'guardian_username', 'guardian_password'
    ]);
    
    return Object.entries(student)
      .filter(([key, value]) => value && !standardFields.has(key))
      .map(([key, value]) => ({
        label: key.replace(/_/g, ' '),
        value: String(value)
      }));
  };

  // Helper function to get proper image URL
  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    // Remove leading slash and any 'uploads/' or 'Uploads/' prefix
    const cleanPath = imagePath.replace(/^\/?(uploads|Uploads)\//i, '');
    return `/uploads/${cleanPath}`;
  };

  const renderProfileTab = () => (
    <div className={styles.profileTabContainer}>
      <ProfileHeader
        name={student.student_name}
        subtitle={`${student.class} • Roll No: ${student.class_id}`}
        imageUrl={getImageUrl(student.image_student)}
      />

      <CollapsibleCard
        title={t('studentInfo')}
        icon={<FiUser />}
        defaultExpanded={true}
      >
        <div className="fieldItem">
          <span className="fieldLabel">{t('username')}</span>
          <span className="fieldValue">{student.username}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('class')}</span>
          <span className="fieldValue">{student.class}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('age')}</span>
          <span className="fieldValue">{student.age}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('gender')}</span>
          <span className="fieldValue">{student.gender}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('schoolId')}</span>
          <span className="fieldValue">{student.school_id}</span>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t('guardianInfo')}
        icon={<FiUsers />}
        defaultExpanded={false}
      >
        <div className="fieldItem">
          <span className="fieldLabel">{t('guardianName')}</span>
          <span className="fieldValue">{student.guardian_name}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('guardianPhone')}</span>
          <span className="fieldValue">{student.guardian_phone}</span>
        </div>
        <div className="fieldItem">
          <span className="fieldLabel">{t('guardianRelation')}</span>
          <span className="fieldValue">{student.guardian_relation}</span>
        </div>
      </CollapsibleCard>

      {getAdditionalFields().length > 0 && (
        <CollapsibleCard
          title={t('additionalInfo')}
          icon={<FiInfo />}
          defaultExpanded={false}
        >
          {getAdditionalFields().map((field, index) => (
            <div key={index} className="fieldItem">
              <span className="fieldLabel">{field.label}</span>
              <span className="fieldValue">{field.value}</span>
            </div>
          ))}
        </CollapsibleCard>
      )}
    </div>
  );

  const renderPostsTab = () => (
    <div className={styles.postsTabContainer}>
      {postsLoading ? (
        <SkeletonLoader type="card" count={3} />
      ) : profilePosts.length > 0 ? (
        <div className={styles.postsGrid}>
          {profilePosts.map(post => (
            <PostCard key={post.id} post={post} onLike={handleLike} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <FiFileText />
          </div>
          <h3 className={styles.emptyStateTitle}>No Posts Yet</h3>
          <p className={styles.emptyStateText}>When you share posts, they'll appear here.</p>
        </div>
      )}
    </div>
  );

  const renderMarkListTab = () => (
    <div className={styles.markListTabContainer}>
      {markListLoading ? (
        <SkeletonLoader type="card" count={3} />
      ) : markListData.length > 0 ? (
        <div className={styles.markListGrid}>
          {markListData.map((subject, index) => (
            <div key={index} className={styles.subjectCard}>
              <div className={styles.subjectCardHeader}>
                <h3 className={styles.subjectTitle}>{subject.subject_name}</h3>
                <span className={`${styles.badge} ${subject.pass_status === 'Pass' ? styles.badgePass : styles.badgeFail}`}>
                  {subject.pass_status}
                </span>
              </div>
              
              <div className={styles.scoresList}>
                {subject.components && subject.components.map((comp, idx) => (
                  <div key={idx} className={styles.scoreItem}>
                    <span className={styles.scoreName}>{comp.name}</span>
                    <span className={styles.scoreValue}>{comp.score}/{comp.max}</span>
                  </div>
                ))}
              </div>
              
              <div className={styles.totalScore}>
                <span className={styles.totalScoreLabel}>Total Score</span>
                <span className={styles.totalScoreValue}>{subject.total}/100</span>
              </div>
              
              <div className={styles.termBadge}>Term {subject.term_number}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <FiList />
          </div>
          <h3 className={styles.emptyStateTitle}>No Marks Yet</h3>
          <p className={styles.emptyStateText}>Your academic results will appear here.</p>
        </div>
      )}
    </div>
  );

  const renderClassTab = () => (
    <ClassCommunicationTab
      userType="student"
      userId={student?.school_id}
      userName={student?.student_name}
      userClass={student?.class}
    />
  );

  const renderSettingsTab = () => (
    <SettingsTab userId={username} userType="student" appType="student" appName="Student App" />
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'class':
        return renderClassTab();
      case 'posts':
        return renderPostsTab();
      case 'marklist':
        return renderMarkListTab();
      case 'settings':
        return renderSettingsTab();
      default:
        return renderProfileTab();
    }
  };

  if (isLoading) {
    return (
      <MobileProfileLayout title="Student Profile" onLogout={handleLogout}>
        <SkeletonLoader type="profile" />
        <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  if (error) {
    return (
      <MobileProfileLayout title="Student Profile" onLogout={handleLogout}>
        <div className={styles.errorContainer}>
          <p>{error}</p>
          <button onClick={fetchProfile} className={styles.retryButton}>
            Try Again
          </button>
        </div>
        <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  if (!student) {
    return (
      <MobileProfileLayout title="Student Profile" onLogout={handleLogout}>
        <div className={styles.errorContainer}>
          <p>Student not found.</p>
        </div>
        <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      </MobileProfileLayout>
    );
  }

  return (
    <MobileProfileLayout 
      title="Student Profile" 
      onLogout={handleLogout}
      onRefresh={handleRefresh}
    >
      {renderContent()}
      <BottomNavigation items={navItems} activeItem={activeTab} onItemClick={setActiveTab} />
      <toast.ToastContainer />
    </MobileProfileLayout>
  );
};

export default StudentProfile;
