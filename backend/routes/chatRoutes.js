// routes/chatRoutes.js - Real-time Chat System
const express = require('express');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/chat-attachments');
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
const initializeChatTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_message_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create conversation_participants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        user_type VARCHAR(50) NOT NULL,
        user_name VARCHAR(255),
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_read_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT unique_conversation_user UNIQUE(conversation_id, user_id)
      )
    `);

    // Create messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR(255) NOT NULL,
        sender_type VARCHAR(50) NOT NULL,
        sender_name VARCHAR(255),
        message_text TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP WITH TIME ZONE,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);

    // Create message_attachments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_attachments (
        id SERIAL PRIMARY KEY,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100),
        file_size INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_participants_user_id ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_participants_conversation_id ON conversation_participants(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON message_attachments(message_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Chat tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing chat tables:', error.message);
  } finally {
    client.release();
  }
};

// Initialize tables on startup
initializeChatTables().catch(error => {
  console.error('Failed to initialize chat tables:', error.message);
});

// ==================== CONVERSATIONS ====================

// GET /api/chat/conversations - Get all conversations for current user
router.get('/conversations', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await pool.query(`
      SELECT 
        c.id,
        c.type,
        c.created_at,
        c.updated_at,
        c.last_message_at,
        (
          SELECT json_agg(json_build_object(
            'user_id', cp.user_id,
            'user_type', cp.user_type,
            'user_name', cp.user_name,
            'last_read_at', cp.last_read_at
          ))
          FROM conversation_participants cp
          WHERE cp.conversation_id = c.id
        ) as participants,
        (
          SELECT json_build_object(
            'id', m.id,
            'sender_id', m.sender_id,
            'sender_name', m.sender_name,
            'message_text', m.message_text,
            'created_at', m.created_at,
            'read_at', m.read_at
          )
          FROM messages m
          WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*)
          FROM messages m
          LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
          WHERE m.conversation_id = c.id 
            AND m.is_deleted = FALSE
            AND m.sender_id != $1
            AND (m.created_at > cp.last_read_at OR cp.last_read_at IS NULL)
        ) as unread_count
      FROM conversations c
      INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// POST /api/chat/conversations - Create new conversation
router.post('/conversations', async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, participants } = req.body;
    
    if (!type || !participants || participants.length < 2) {
      return res.status(400).json({ error: 'Type and at least 2 participants required' });
    }

    await client.query('BEGIN');

    // Check if conversation already exists between these users
    const participantIds = participants.map(p => p.user_id).sort();
    const existingConv = await client.query(`
      SELECT c.id, c.created_at
      FROM conversations c
      WHERE c.id IN (
        SELECT conversation_id
        FROM conversation_participants
        WHERE user_id = ANY($1)
        GROUP BY conversation_id
        HAVING COUNT(DISTINCT user_id) = $2
      )
      AND c.type = $3
      ORDER BY c.created_at DESC
      LIMIT 1
    `, [participantIds, participantIds.length, type]);

    if (existingConv.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({ id: existingConv.rows[0].id, existing: true });
    }

    // Create new conversation
    const convResult = await client.query(`
      INSERT INTO conversations (type)
      VALUES ($1)
      RETURNING id, type, created_at, updated_at
    `, [type]);

    const conversation = convResult.rows[0];

    // Add participants
    for (const participant of participants) {
      await client.query(`
        INSERT INTO conversation_participants (conversation_id, user_id, user_type, user_name)
        VALUES ($1, $2, $3, $4)
      `, [conversation.id, participant.user_id, participant.user_type, participant.user_name]);
    }

    await client.query('COMMIT');
    res.status(201).json(conversation);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  } finally {
    client.release();
  }
});

// GET /api/chat/conversations/:id - Get conversation details
router.get('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        c.*,
        json_agg(json_build_object(
          'user_id', cp.user_id,
          'user_type', cp.user_type,
          'user_name', cp.user_name,
          'joined_at', cp.joined_at,
          'last_read_at', cp.last_read_at
        )) as participants
      FROM conversations c
      LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// ==================== MESSAGES ====================

// GET /api/chat/conversations/:id/messages - Get messages in conversation
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;

    let query = `
      SELECT 
        m.*,
        (
          SELECT json_agg(json_build_object(
            'id', ma.id,
            'filename', ma.filename,
            'original_name', ma.original_name,
            'file_type', ma.file_type,
            'file_size', ma.file_size
          ))
          FROM message_attachments ma
          WHERE ma.message_id = m.id
        ) as attachments
      FROM messages m
      WHERE m.conversation_id = $1 AND m.is_deleted = FALSE
    `;

    const params = [id];

    if (before) {
      query += ` AND m.created_at < $2`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json(result.rows.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/chat/conversations/:id/messages - Send message
router.post('/conversations/:id/messages', ...branchSafeUpload(upload.array('attachments', 5)), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { senderId, senderType, senderName, messageText } = req.body;
    const files = req.files || [];

    if ((!messageText || messageText.trim() === '') && files.length === 0) {
      return res.status(400).json({ error: 'Message text or attachments required' });
    }

    await client.query('BEGIN');

    // Insert message
    const messageResult = await client.query(`
      INSERT INTO messages (conversation_id, sender_id, sender_type, sender_name, message_text)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, senderId, senderType, senderName, messageText || '']);

    const message = messageResult.rows[0];

    // Insert attachments
    const attachments = [];
    for (const file of files) {
      const attachmentResult = await client.query(`
        INSERT INTO message_attachments (message_id, filename, original_name, file_type, file_size)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [message.id, file.filename, file.originalname, file.mimetype, file.size]);
      
      attachments.push(attachmentResult.rows[0]);
    }

    // Update conversation last_message_at
    await client.query(`
      UPDATE conversations
      SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    await client.query('COMMIT');

    res.status(201).json({
      ...message,
      attachments
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  } finally {
    client.release();
  }
});

// PUT /api/chat/messages/read - Mark messages as read
router.put('/messages/read', async (req, res) => {
  try {
    const { conversationId, userId } = req.body;

    if (!conversationId || !userId) {
      return res.status(400).json({ error: 'conversationId and userId required' });
    }

    // Update last_read_at for this user in this conversation
    await pool.query(`
      UPDATE conversation_participants
      SET last_read_at = CURRENT_TIMESTAMP
      WHERE conversation_id = $1 AND user_id = $2
    `, [conversationId, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// ==================== CONTACTS ====================

// GET /api/chat/contacts/guardians - Get all guardians
router.get('/contacts/guardians', async (req, res) => {
  try {
    // Get all class tables from classes_schema
    const tablesResult = await pool.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', 
      ['classes_schema']
    );
    
    const classes = tablesResult.rows.map(row => row.table_name);
    
    console.log('Found class tables:', classes);
    
    if (classes.length === 0) {
      console.log('No class tables found');
      return res.json([]);
    }

    // Aggregate guardians from all class tables
    const guardiansMap = new Map();
    
    for (const className of classes) {
      try {
        // First check what columns exist in this table
        const columnsResult = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' AND table_name = $1
        `, [className]);
        
        const columns = columnsResult.rows.map(r => r.column_name);
        console.log(`Columns in ${className}:`, columns);
        
        // Build query based on available columns
        const hasGuardianName = columns.includes('guardian_name');
        const hasGuardianPhone = columns.includes('guardian_phone');
        const hasGuardianRelation = columns.includes('guardian_relation');
        const hasStudentName = columns.includes('student_name');
        const hasIsActive = columns.includes('is_active');
        
        if (!hasGuardianName) {
          console.log(`Skipping ${className} - no guardian_name column`);
          continue;
        }
        
        let query = `SELECT `;
        const selectFields = [];
        
        if (hasGuardianName) selectFields.push('guardian_name');
        if (hasGuardianPhone) selectFields.push('guardian_phone');
        if (hasGuardianRelation) selectFields.push('guardian_relation');
        if (hasStudentName) selectFields.push('student_name');
        
        query += selectFields.join(', ');
        query += ` FROM classes_schema."${className}" WHERE guardian_name IS NOT NULL AND guardian_name != ''`;
        
        if (hasIsActive) {
          query += ` AND (is_active = TRUE OR is_active IS NULL)`;
        }
        
        const result = await pool.query(query);
        
        console.log(`Found ${result.rows.length} guardians in ${className}`);
        
        for (const row of result.rows) {
          // Use guardian_phone as unique key (or guardian_name if no phone)
          const key = (hasGuardianPhone && row.guardian_phone) ? row.guardian_phone : row.guardian_name;
          
          if (guardiansMap.has(key)) {
            // Add student to existing guardian
            const guardian = guardiansMap.get(key);
            if (hasStudentName && row.student_name) {
              guardian.students.push({
                name: row.student_name,
                class: className
              });
            }
          } else {
            // Create new guardian entry
            guardiansMap.set(key, {
              id: key,
              name: row.guardian_name,
              phone: (hasGuardianPhone && row.guardian_phone) ? row.guardian_phone : '',
              relation: (hasGuardianRelation && row.guardian_relation) ? row.guardian_relation : '',
              type: 'guardian',
              students: (hasStudentName && row.student_name) ? [{
                name: row.student_name,
                class: className
              }] : []
            });
          }
        }
      } catch (err) {
        console.warn(`Could not fetch from classes_schema.${className}:`, err.message);
      }
    }
    
    const guardians = Array.from(guardiansMap.values());
    guardians.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    console.log(`Returning ${guardians.length} unique guardians`);
    res.json(guardians);
  } catch (error) {
    console.error('Error fetching guardians:', error);
    res.status(500).json({ error: 'Failed to fetch guardians' });
  }
});

// GET /api/chat/contacts/teachers - Get all teachers
router.get('/contacts/teachers', async (req, res) => {
  try {
    // Get all staff schemas (teachers, administrative_staff, supportive_staff)
    const schemasResult = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name IN ('teachers', 'administrative_staff', 'supportive_staff')
    `);

    const teachers = [];

    for (const schema of schemasResult.rows) {
      const schemaName = schema.schema_name;
      
      const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name != 'staff_counter'
      `, [schemaName]);

      for (const table of tablesResult.rows) {
        const tableName = table.table_name;
        
        try {
          const teachersResult = await pool.query(`
            SELECT name, phone, global_staff_id, role
            FROM "${schemaName}"."${tableName}"
            WHERE role = 'Teacher' AND (is_active = TRUE OR is_active IS NULL)
          `);

          teachersResult.rows.forEach(teacher => {
            teachers.push({
              id: `teacher_${teacher.global_staff_id}`,
              name: teacher.name,
              phone: teacher.phone,
              type: 'teacher',
              global_id: teacher.global_staff_id
            });
          });
        } catch (err) {
          console.warn(`Could not fetch from ${schemaName}.${tableName}:`, err.message);
        }
      }
    }

    teachers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// GET /api/chat/contacts/admins - Get all admins
router.get('/contacts/admins', async (req, res) => {
  try {
    const admins = [];
    
    // Get admins from administrative_staff schema
    const schemasResult = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'administrative_staff'
    `);

    if (schemasResult.rows.length > 0) {
      const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'administrative_staff' AND table_name != 'staff_counter'
      `);

      for (const table of tablesResult.rows) {
        const tableName = table.table_name;
        
        try {
          const adminsResult = await pool.query(`
            SELECT name, phone, global_staff_id, role
            FROM "administrative_staff"."${tableName}"
            WHERE (role = 'Admin' OR role = 'Super Admin' OR role LIKE '%Admin%') 
              AND (is_active = TRUE OR is_active IS NULL)
          `);

          adminsResult.rows.forEach(admin => {
            admins.push({
              id: `admin_${admin.global_staff_id}`,
              name: admin.name,
              phone: admin.phone,
              type: 'admin',
              role: admin.role,
              global_id: admin.global_staff_id
            });
          });
        } catch (err) {
          console.warn(`Could not fetch admins from ${tableName}:`, err.message);
        }
      }
    }

    // Also add a default system admin if no admins found
    if (admins.length === 0) {
      admins.push({
        id: 'admin_system',
        name: 'School Administration',
        phone: '',
        type: 'admin',
        role: 'Admin'
      });
    }

    admins.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// GET /api/chat/attachments/:id - Download attachment
router.get('/attachments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT filename, original_name, file_type
      FROM message_attachments
      WHERE id = $1
    `, [id]);

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
