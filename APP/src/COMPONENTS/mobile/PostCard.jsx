import React, { useState } from 'react';
import { FiHeart, FiMessageCircle, FiShare2, FiMoreHorizontal, FiBookmark, FiExternalLink, FiDownload, FiSend } from 'react-icons/fi';
import { useApp } from '../../context/AppContext';
import styles from './PostCard.module.css';

const PostCard = ({ post, onLike }) => {
  const { theme } = useApp();
  const [isLiking, setIsLiking] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [imageIndex, setImageIndex] = useState(0);

  const handleLike = async () => {
    if (isLiking) return;
    
    setIsLiking(true);
    setShowHeartAnimation(true);
    setIsLiked(!isLiked);
    
    try {
      await onLike(post.id);
    } finally {
      setIsLiking(false);
      setTimeout(() => setShowHeartAnimation(false), 600);
    }
  };

  const handleDoubleTap = () => {
    if (!isLiked) {
      handleLike();
    } else {
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 600);
    }
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title,
          text: post.body,
          url: window.location.href
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAudiences = (audiences) => {
    if (!Array.isArray(audiences) || audiences.length === 0) return 'Everyone';
    return audiences
      .map(a => a.charAt(0).toUpperCase() + a.slice(1).replace('_', ' '))
      .join(', ');
  };

  const getAuthorInitial = () => {
    return post.author_name?.charAt(0)?.toUpperCase() || 'A';
  };

  const getMediaItems = () => {
    if (!post.media || post.media.length === 0) return [];
    return post.media.filter(m => m.mimetype?.startsWith('image/') || m.mimetype?.startsWith('video/'));
  };

  const mediaItems = getMediaItems();
  const hasMultipleMedia = mediaItems.length > 1;

  const renderMedia = () => {
    if (mediaItems.length === 0) return null;

    return (
      <div className={styles.mediaContainer} onDoubleClick={handleDoubleTap}>
        <div className={styles.mediaSlider} style={{ transform: `translateX(-${imageIndex * 100}%)` }}>
          {mediaItems.map((m, idx) => {
            const mediaUrl = `/Uploads/posts/${m.filename}`;
            
            if (m.mimetype?.startsWith('image/')) {
              return (
                <div key={idx} className={styles.mediaSlide}>
                  <img 
                    src={mediaUrl} 
                    alt={m.originalname || 'Post media'} 
                    className={styles.mediaImage}
                    loading="lazy"
                  />
                </div>
              );
            }
            
            if (m.mimetype?.startsWith('video/')) {
              return (
                <div key={idx} className={styles.mediaSlide}>
                  <video 
                    src={mediaUrl} 
                    controls 
                    className={styles.mediaVideo}
                    preload="metadata"
                  />
                </div>
              );
            }
            return null;
          })}
        </div>

        {/* Heart animation overlay */}
        {showHeartAnimation && (
          <div className={styles.heartOverlay}>
            <FiHeart className={styles.heartAnimation} />
          </div>
        )}

        {/* Media indicators */}
        {hasMultipleMedia && (
          <>
            <div className={styles.mediaIndicators}>
              {mediaItems.map((_, idx) => (
                <span 
                  key={idx} 
                  className={`${styles.indicator} ${idx === imageIndex ? styles.indicatorActive : ''}`}
                  onClick={() => setImageIndex(idx)}
                />
              ))}
            </div>
            <div className={styles.mediaCounter}>{imageIndex + 1}/{mediaItems.length}</div>
          </>
        )}
      </div>
    );
  };

  const renderFileAttachments = () => {
    const files = post.media?.filter(m => !m.mimetype?.startsWith('image/') && !m.mimetype?.startsWith('video/')) || [];
    if (files.length === 0) return null;

    return (
      <div className={styles.attachments}>
        {files.map((m, idx) => {
          const mediaUrl = `/Uploads/posts/${m.filename}`;
          return (
            <a key={idx} href={mediaUrl} download className={styles.attachmentLink}>
              <FiDownload />
              <span>{m.originalname || 'Download file'}</span>
            </a>
          );
        })}
      </div>
    );
  };

  const themeColor = theme?.primaryColor || '#e74c3c';

  return (
    <article className={`${styles.postCard} ${theme?.mode === 'dark' ? styles.darkMode : ''}`}>
      {/* Post Header - Author Info */}
      <header className={styles.postHeader}>
        <div className={styles.authorInfo}>
          <div 
            className={styles.authorAvatar}
            style={{ background: `linear-gradient(135deg, ${theme?.primaryColor || '#7c3aed'}, ${theme?.secondaryColor || '#8b5cf6'})` }}
          >
            {post.author_image ? (
              <img src={post.author_image} alt={post.author_name} />
            ) : (
              <span>{getAuthorInitial()}</span>
            )}
          </div>
          <div className={styles.authorDetails}>
            <span className={styles.authorName}>{post.author_name || 'School Admin'}</span>
            <span className={styles.postMeta}>
              {formatDate(post.created_at)} • {formatAudiences(post.audiences)}
            </span>
          </div>
        </div>
        <button className={styles.moreBtn} aria-label="More options">
          <FiMoreHorizontal />
        </button>
      </header>

      {/* Post Content */}
      <div className={styles.postContent}>
        {post.title && <h3 className={styles.postTitle}>{post.title}</h3>}
        <p className={styles.postBody}>{post.body}</p>
      </div>

      {/* Link Preview */}
      {post.link && (
        <a 
          href={post.link} 
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.linkPreview}
        >
          <div className={styles.linkContent}>
            <FiExternalLink className={styles.linkIcon} />
            <div className={styles.linkInfo}>
              <span className={styles.linkTitle}>Open Link</span>
              <span className={styles.linkUrl}>{new URL(post.link).hostname}</span>
            </div>
          </div>
        </a>
      )}

      {/* Media Gallery */}
      {renderMedia()}

      {/* File Attachments */}
      {renderFileAttachments()}

      {/* Action Buttons */}
      <div className={styles.actionBar}>
        <div className={styles.leftActions}>
          <button 
            className={`${styles.actionBtn} ${isLiked ? styles.liked : ''}`}
            onClick={handleLike}
            disabled={isLiking}
            aria-label="Like"
          >
            <FiHeart className={styles.actionIcon} style={isLiked ? { fill: themeColor, color: themeColor } : {}} />
          </button>
          <button 
            className={styles.actionBtn}
            onClick={() => setShowComments(!showComments)}
            aria-label="Comment"
          >
            <FiMessageCircle className={styles.actionIcon} />
          </button>
          <button 
            className={styles.actionBtn}
            onClick={handleShare}
            aria-label="Share"
          >
            <FiShare2 className={styles.actionIcon} />
          </button>
        </div>
        <button 
          className={`${styles.actionBtn} ${isSaved ? styles.saved : ''}`}
          onClick={handleSave}
          aria-label="Save"
        >
          <FiBookmark className={styles.actionIcon} style={isSaved ? { fill: '#333' } : {}} />
        </button>
      </div>

      {/* Likes Count */}
      <div className={styles.likesSection}>
        <span className={styles.likesCount}>
          {(post.localLikes || post.likes || 0) > 0 && (
            <><strong>{post.localLikes || post.likes || 0}</strong> {(post.localLikes || post.likes || 0) === 1 ? 'like' : 'likes'}</>
          )}
        </span>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className={styles.commentsSection}>
          <div className={styles.commentsList}>
            {/* Placeholder comments - in real app, fetch from API */}
            <div className={styles.noComments}>No comments yet. Be the first to comment!</div>
          </div>
          <div className={styles.commentInput}>
            <input 
              type="text"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className={styles.commentField}
            />
            <button 
              className={styles.sendBtn}
              disabled={!commentText.trim()}
              style={{ color: commentText.trim() ? themeColor : '#ccc' }}
            >
              <FiSend />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

export default PostCard;
