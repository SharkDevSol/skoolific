// routes/classCommunicationRoutes.js - Class Communication for Teachers and Students
const express = require('express');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/class-messages');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

// Initialize database tables
const initializeClassCommunicationTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create class_messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_messages (
        id SERIAL PRIMARY KEY,
        teacher_id VARCHAR(255) NOT NULL,
        teacher_name VARCHAR(255) NOT NULL,
        class_name VARCHAR(100) NOT NULL,
        message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for efficient querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_messages_class_name 
      ON class_messages(class_name)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_messages_created_at 
      ON class_messages(created_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_messages_teacher_id 
      ON class_messages(teacher_id)
    `);

    // Create class_message_attachments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_message_attachments (
        id SERIAL PRIMARY KEY,
        message_id INTEGER REFERENCES class_messages(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100),
        file_size INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_message_id 
      ON class_message_attachments(message_id)
    `);

    await client.query('COMMIT');
    console.log('✅ Class communication tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing class communication tables:', error.message);
  } finally {
    client.release();
  }
};

// Initialize tables on startup
initializeClassCommunicationTables().catch(error => {
  console.error('Failed to initialize class communication tables:', error.message);
});

// ==================== API ENDPOINTS ====================

// GET /api/class-communication/teacher-classes/:teacherName
// Get all classes a teacher is assigned to teach (from subject assignments)
router.get('/teacher-classes/:teacherName', async (req, res) => {
  try {
    const { teacherName } = req.params;
    
    // Get classes from subject-class assignments in mark list system
    const subjectAssignments = await pool.query(`
      SELECT DISTINCT scm.class_name
      FROM subjects_of_school_schema.teachers_subjects ts
      JOIN subjects_of_school_schema.subject_class_mappings scm 
        ON ts.subject_class = scm.subject_class
      WHERE ts.teacher_name = $1
      ORDER BY scm.class_name
    `, [teacherName]);
    
    const classes = subjectAssignments.rows.map(row => row.class_name);
    
    // If no subject assignments found, fallback to schedule-based classes
    if (classes.length === 0) {
      const scheduleResult = await pool.query(`
        SELECT DISTINCT class_name
        FROM school_schema_points.teachers_period
        WHERE teacher_name = $1
        ORDER BY class_name
      `, [teacherName]);
      
      const scheduleClasses = scheduleResult.rows.map(row => row.class_name);
      return res.json({ classes: scheduleClasses });
    }
    
    res.json({ classes });
  } catch (error) {
    console.error('Error fetching teacher classes:', error);
    res.status(500).json({ error: 'Failed to fetch teacher classes' });
  }
});

// GET /api/class-communication/messages/:className
// Get all messages for a class (teacher view)
router.get('/messages/:className', async (req, res) => {
  try {
    const { className } = req.params;
    
    // Get messages with attachments
    const messagesResult = await pool.query(`
      SELECT 
        m.id,
        m.teacher_id,
        m.teacher_name,
        m.class_name,
        m.message,
        m.created_at
      FROM class_messages m
      WHERE m.class_name = $1
      ORDER BY m.created_at ASC
    `, [className]);
    
    // Get attachments for all messages
    const messageIds = messagesResult.rows.map(m => m.id);
    let attachmentsMap = {};
    
    if (messageIds.length > 0) {
      const attachmentsResult = await pool.query(`
        SELECT 
          id,
          message_id,
          filename,
          original_name,
          file_type,
          file_size
        FROM class_message_attachments
        WHERE message_id = ANY($1)
      `, [messageIds]);
      
      attachmentsResult.rows.forEach(att => {
        if (!attachmentsMap[att.message_id]) {
          attachmentsMap[att.message_id] = [];
        }
        attachmentsMap[att.message_id].push({
          id: att.id,
          filename: att.filename,
          original_name: att.original_name,
          file_type: att.file_type,
          file_size: att.file_size
        });
      });
    }
    
    // Combine messages with attachments
    const messages = messagesResult.rows.map(msg => ({
      ...msg,
      attachments: attachmentsMap[msg.id] || []
    }));
    
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/class-communication/messages
// Send a new message to a class
router.post('/messages', ...branchSafeUpload(upload.array('attachments', 5)), async (req, res) => {
  const client = await pool.connect();
  try {
    const { teacherId, teacherName, className, message } = req.body;
    const files = req.files || [];
    
    // Validate: message or attachments required
    if ((!message || message.trim() === '') && files.length === 0) {
      return res.status(400).json({ 
        error: 'Message content or at least one attachment is required' 
      });
    }
    
    await client.query('BEGIN');
    
    // Insert message
    const messageResult = await client.query(`
      INSERT INTO class_messages (teacher_id, teacher_name, class_name, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id, teacher_id, teacher_name, class_name, message, created_at
    `, [teacherId, teacherName, className, message || '']);
    
    const newMessage = messageResult.rows[0];
    const attachments = [];
    
    // Insert attachments if any
    for (const file of files) {
      const attachmentResult = await client.query(`
        INSERT INTO class_message_attachments 
        (message_id, filename, original_name, file_type, file_size)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, filename, original_name, file_type, file_size
      `, [newMessage.id, file.filename, file.originalname, file.mimetype, file.size]);
      
      attachments.push(attachmentResult.rows[0]);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: {
        ...newMessage,
        attachments
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  } finally {
    client.release();
  }
});

// GET /api/class-communication/student-messages/:className
// Get all messages for a student's class (from all teachers)
router.get('/student-messages/:className', async (req, res) => {
  try {
    const { className } = req.params;
    
    // Get all messages for this class from all teachers
    const messagesResult = await pool.query(`
      SELECT 
        m.id,
        m.teacher_id,
        m.teacher_name,
        m.class_name,
        m.message,
        m.created_at
      FROM class_messages m
      WHERE m.class_name = $1
      ORDER BY m.created_at ASC
    `, [className]);
    
    // Get attachments for all messages
    const messageIds = messagesResult.rows.map(m => m.id);
    let attachmentsMap = {};
    
    if (messageIds.length > 0) {
      const attachmentsResult = await pool.query(`
        SELECT 
          id,
          message_id,
          filename,
          original_name,
          file_type,
          file_size
        FROM class_message_attachments
        WHERE message_id = ANY($1)
      `, [messageIds]);
      
      attachmentsResult.rows.forEach(att => {
        if (!attachmentsMap[att.message_id]) {
          attachmentsMap[att.message_id] = [];
        }
        attachmentsMap[att.message_id].push({
          id: att.id,
          filename: att.filename,
          original_name: att.original_name,
          file_type: att.file_type,
          file_size: att.file_size
        });
      });
    }
    
    // Combine messages with attachments
    const messages = messagesResult.rows.map(msg => ({
      ...msg,
      attachments: attachmentsMap[msg.id] || []
    }));
    
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching student messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET /api/class-communication/attachments/:attachmentId
// Download an attachment
router.get('/attachments/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    
    const result = await pool.query(`
      SELECT filename, original_name, file_type
      FROM class_message_attachments
      WHERE id = $1
    `, [attachmentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = result.rows[0];
    const filePath = path.join(uploadsDir, attachment.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

module.exports = router;
