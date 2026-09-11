// File utility functions for List pages
import { FiFile, FiImage, FiFileText } from 'react-icons/fi';

// File type categories based on extension
const FILE_TYPE_MAP = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
  pdf: ['pdf'],
  word: ['doc', 'docx'],
  excel: ['xls', 'xlsx', 'csv'],
  powerpoint: ['ppt', 'pptx'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
  video: ['mp4', 'avi', 'mov', 'wmv', 'mkv'],
  audio: ['mp3', 'wav', 'ogg', 'flac']
};

// Patterns to detect file upload fields by name
const FILE_FIELD_PATTERNS = [
  '_file', '_upload', '_image', '_photo', '_document',
  '_certificate', '_proof', '_attachment', '_cv', '_resume',
  'image_staff', 'image_student', 'profile_image', 'filesa',
  'civi', 'passport', 'license', 'diploma', 'degree', 'transcript'
];

// All supported file extensions
const ALL_FILE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'tar', 'gz',
  'mp4', 'avi', 'mov', 'wmv', 'mkv',
  'mp3', 'wav', 'ogg', 'flac'
];

/**
 * Check if a value looks like a file path/name
 * @param {string} value - The value to check
 * @returns {boolean} - True if value looks like a file
 */
export const looksLikeFile = (value) => {
  if (!value || typeof value !== 'string') return false;
  
  // Check if it starts with /uploads or /Uploads (case-insensitive)
  const lowerValue = value.toLowerCase();
  if (lowerValue.startsWith('/uploads') || lowerValue.includes('/uploads/')) return true;
  
  // Check if it has a file extension
  const ext = value.split('.').pop()?.toLowerCase() || '';
  return ALL_FILE_EXTENSIONS.includes(ext);
};

/**
 * Detect file type from filename extension
 * @param {string} filename - The filename or path
 * @returns {string} - File type category
 */
export const getFileType = (filename) => {
  if (!filename || typeof filename !== 'string') return 'unknown';
  
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  for (const [type, extensions] of Object.entries(FILE_TYPE_MAP)) {
    if (extensions.includes(ext)) return type;
  }
  
  return 'file';
};

/**
 * Get appropriate icon component for file type
 * @param {string} type - File type from getFileType
 * @returns {object} - Object with icon component and color class
 */
export const getFileIcon = (type) => {
  const iconMap = {
    image: { icon: FiImage, colorClass: 'fileIconImage', color: '#10b981' },
    pdf: { icon: FiFileText, colorClass: 'fileIconPdf', color: '#ef4444' },
    word: { icon: FiFileText, colorClass: 'fileIconWord', color: '#3b82f6' },
    excel: { icon: FiFileText, colorClass: 'fileIconExcel', color: '#22c55e' },
    powerpoint: { icon: FiFileText, colorClass: 'fileIconPpt', color: '#f97316' },
    video: { icon: FiFile, colorClass: 'fileIconVideo', color: '#8b5cf6' },
    audio: { icon: FiFile, colorClass: 'fileIconAudio', color: '#ec4899' },
    archive: { icon: FiFile, colorClass: 'fileIconArchive', color: '#eab308' },
    file: { icon: FiFile, colorClass: 'fileIconDefault', color: '#64748b' },
    unknown: { icon: FiFile, colorClass: 'fileIconDefault', color: '#64748b' }
  };
  
  return iconMap[type] || iconMap.file;
};

/**
 * Check if a field name represents a file upload field
 * @param {string} fieldName - The field name to check
 * @returns {boolean} - True if field is a file upload field
 */
export const isFileField = (fieldName) => {
  if (!fieldName || typeof fieldName !== 'string') return false;
  const lowerName = fieldName.toLowerCase();
  return FILE_FIELD_PATTERNS.some(pattern => lowerName.includes(pattern));
};

/**
 * Check if a field contains a file (by checking both field name and value)
 * @param {string} fieldName - The field name
 * @param {any} value - The field value
 * @returns {boolean} - True if field contains a file
 */
export const isFileValue = (fieldName, value) => {
  // First check by field name pattern
  if (isFileField(fieldName)) return true;
  
  // Then check if the value looks like a file path
  return looksLikeFile(value);
};

/**
 * Construct full URL for file access
 * @param {string} filename - The filename or path
 * @param {string} type - 'staff' or 'student'
 * @returns {string} - Full URL to access the file
 */
export const getFileUrl = (filename, type = 'staff') => {
  // Handle null, undefined, or non-string values
  if (!filename) return '';
  
  // If it's a File object, return empty (can't create URL for unuploaded file)
  if (typeof filename === 'object') return '';
  
  // Convert to string if it's not already
  const fileStr = String(filename).trim();
  
  // Reject placeholder values that are not real file paths
  if (!fileStr || fileStr === '{}' || fileStr === '[]' || fileStr === '[object Object]' || fileStr === 'null' || fileStr === 'undefined') {
    return '';
  }
  
  // API base URL from environment variable
  const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
  
  // If already a full URL
  if (fileStr.startsWith('http')) {
    return fileStr;
  }
  
  // If already a full path starting with /uploads or /Uploads (case-insensitive)
  if (fileStr.toLowerCase().startsWith('/uploads')) {
    return `${API_BASE}${fileStr}`;
  }
  
  // Default to Uploads folder (matching backend storage)
  return `${API_BASE}/Uploads/${fileStr}`;
};

/**
 * Format field name to readable label
 * @param {string} key - Field key/name
 * @returns {string} - Formatted label
 */
export const formatLabel = (key) => {
  if (!key) return '';
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Check if file type can be previewed in browser
 * @param {string} type - File type from getFileType
 * @returns {boolean} - True if file can be previewed
 */
export const canPreview = (type) => {
  return ['image', 'pdf'].includes(type);
};

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} - File extension without dot
 */
export const getFileExtension = (filename) => {
  if (!filename || typeof filename !== 'string') return '';
  return filename.split('.').pop()?.toLowerCase() || '';
};

/**
 * Extract just the filename from a path
 * @param {string} path - Full path or filename
 * @returns {string} - Just the filename
 */
export const getFileName = (path) => {
  if (!path || typeof path !== 'string') return '';
  return path.split('/').pop() || path;
};

export default {
  getFileType,
  getFileIcon,
  isFileField,
  isFileValue,
  looksLikeFile,
  getFileUrl,
  formatLabel,
  canPreview,
  getFileExtension,
  getFileName
};
