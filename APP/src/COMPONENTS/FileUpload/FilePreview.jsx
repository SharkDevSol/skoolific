import React, { useState, useEffect } from 'react';
import { X, File, FileText, Image as ImageIcon, Video, Music, Archive } from 'lucide-react';
import styles from './FilePreview.module.css';

/**
 * FilePreview component for displaying file information and preview
 * 
 * @component
 * @param {Object} props - Component props
 * @param {File} props.file - File object to preview
 * @param {function} props.onRemove - Callback function when remove button is clicked
 * @param {boolean} [props.showPreview=true] - Show image preview for image files
 * @param {number} [props.progress] - Upload progress (0-100)
 * @param {boolean} [props.disabled=false] - Disabled state
 */
const FilePreview = ({
  file,
  onRemove,
  showPreview = true,
  progress,
  disabled = false
}) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageError, setImageError] = useState(false);

  /**
   * Format file size to human-readable format
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  /**
   * Get file icon based on file type
   */
  const getFileIcon = () => {
    const fileType = file.type;
    
    if (fileType.startsWith('image/')) {
      return <ImageIcon size={24} />;
    } else if (fileType.startsWith('video/')) {
      return <Video size={24} />;
    } else if (fileType.startsWith('audio/')) {
      return <Music size={24} />;
    } else if (fileType.includes('pdf') || fileType.includes('document')) {
      return <FileText size={24} />;
    } else if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('compressed')) {
      return <Archive size={24} />;
    } else {
      return <File size={24} />;
    }
  };

  /**
   * Create preview URL for image files
   */
  useEffect(() => {
    const looksLikeImage = file.type?.startsWith('image/') ||
      (!file.type && /\.(jpe?g|png|gif|webp|bmp|svg|heic)$/i.test(file.name || ''));
    if (showPreview && looksLikeImage) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Cleanup function to revoke object URL
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [file, showPreview]);

  /**
   * Handle image load error
   */
  const handleImageError = () => {
    setImageError(true);
  };

  /**
   * Handle remove button click
   */
  const handleRemove = (e) => {
    e.stopPropagation();
    if (!disabled && onRemove) {
      onRemove();
    }
  };

  /**
   * Handle keyboard interaction for remove button
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRemove(e);
    }
  };

  const isImage = (showPreview && !imageError) && (
    file.type?.startsWith('image/') ||
    (!file.type && /\.(jpe?g|png|gif|webp|bmp|svg|heic)$/i.test(file.name || ''))
  );

  return (
    <div className={`${styles.filePreview} ${disabled ? styles.disabled : ''}`}>
      {/* File icon or image preview */}
      <div className={styles.fileIconContainer}>
        {isImage && previewUrl ? (
          <img
            src={previewUrl}
            alt={file.name}
            className={styles.imagePreview}
            onError={handleImageError}
          />
        ) : (
          <div className={styles.fileIcon}>
            {getFileIcon()}
          </div>
        )}
      </div>
      
      {/* File information */}
      <div className={styles.fileInfo}>
        <p className={styles.fileName} title={file.name}>
          {file.name}
        </p>
        <p className={styles.fileSize}>
          {formatFileSize(file.size)}
        </p>
        
        {/* Upload progress bar */}
        {progress !== undefined && progress < 100 && (
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label={`Upload progress: ${progress}%`}
            />
          </div>
        )}
      </div>
      
      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        onKeyDown={handleKeyDown}
        className={styles.removeButton}
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        tabIndex={0}
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default FilePreview;
