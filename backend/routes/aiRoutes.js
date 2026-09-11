// SKOOLIFIC AI — Complete Route Handler
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const rag = require('../services/ragPipeline');
const orchestrator = require('../services/aiOrchestrator');
const embedder = require('../services/embeddingService');
const textExtractor = require('../services/textExtractor');
const { optionalAuth } = require('../middleware/auth');
const { aiLimiter, aiUploadLimiter } = require('../middleware/aiRateLimiter');
const promptBuilders = require('../services/promptBuilders');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'ai_books');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ─── Health (no auth) ─────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', module: 'skoolific-ai', version: '1.0.0' });
});

// ─── All routes below use optional auth ──────────────────────
router.use(optionalAuth);

// ─── BOOKS ────────────────────────────────────────────────────

// Upload book(s)
router.post('/books/upload', aiUploadLimiter, ...branchSafeUpload(upload.array('files', 20)), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const metadata = JSON.parse(req.body.metadata || '{}');
    const results = [];

    for (const file of files) {
      // Create book record
      const bookResult = await db.query(
        `INSERT INTO ai_schema.books
         (title, grade, subject, term, chapter, publisher, language, academic_year, description, tags, author, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [metadata.title || file.originalname, metadata.grade || '', metadata.subject || '',
         metadata.term || '', metadata.chapter || '', metadata.publisher || '',
         metadata.language || 'English', metadata.academicYear || '',
         metadata.description || '', metadata.tags || [], metadata.author || '',
         req.user?.id || 0]
      );
      const bookId = bookResult.rows[0].id;

      // Create file record
      const fileResult = await db.query(
        `INSERT INTO ai_schema.book_files (book_id, file_name, file_path, file_format, file_size, page_count, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [bookId, file.originalname, file.path, path.extname(file.originalname).slice(1),
         file.size, metadata.pageCount || 0, metadata.language || 'English']
      );
      const fileId = fileResult.rows[0].id;

      // Extract text based on file type
      const extracted = await textExtractor.extract(file.path);
      const content = extracted.text;

      // Update page count from extractor if available
      if (extracted.pageCount) {
        await db.query(`UPDATE ai_schema.book_files SET page_count = $1 WHERE id = $2`, [extracted.pageCount, fileId]);
      }

      // Chunk and index
      const chunks = rag.chunkText(content);
      await rag.indexBook(bookId, chunks, fileId, {
        pageNumber: metadata.pageCount ? Math.ceil(metadata.pageCount / chunks.length) : null,
        chapter: metadata.chapter || null,
        topic: metadata.title || file.originalname,
        keywords: metadata.tags || []
      });

      // Update book file count
      await db.query(`UPDATE ai_schema.books SET file_count = file_count + 1 WHERE id = $1`, [bookId]);

      results.push({ bookId, fileId, chunkCount: chunks.length });
    }

    res.json({ success: true, data: results, message: `${files.length} file(s) uploaded and indexed` });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

// List books
router.get('/books', async (req, res) => {
  try {
    const { status, grade, subject } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`b.status = $${idx++}`); params.push(status); }
    if (grade) { conditions.push(`b.grade = $${idx++}`); params.push(grade); }
    if (subject) { conditions.push(`b.subject = $${idx++}`); params.push(subject); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT b.*, (SELECT COUNT(*) FROM ai_schema.book_files bf WHERE bf.book_id = b.id) as file_count
       FROM ai_schema.books b ${where} ORDER BY b.created_at DESC`, params
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Book detail
router.get('/books/:id', async (req, res) => {
  try {
    const book = await db.query(`SELECT * FROM ai_schema.books WHERE id = $1`, [req.params.id]);
    if (!book.rows.length) return res.status(404).json({ error: 'Book not found' });
    const files = await db.query(`SELECT * FROM ai_schema.book_files WHERE book_id = $1`, [req.params.id]);
    res.json({ success: true, data: { ...book.rows[0], files: files.rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete book
router.delete('/books/:id', async (req, res) => {
  try {
    const book = await db.query(`SELECT * FROM ai_schema.books WHERE id = $1`, [req.params.id]);
    if (!book.rows.length) return res.status(404).json({ error: 'Book not found' });

    // Delete physical files
    const files = await db.query(`SELECT file_path FROM ai_schema.book_files WHERE book_id = $1`, [req.params.id]);
    for (const f of files.rows) {
      try { fs.unlinkSync(f.file_path); } catch {}
    }

    await db.query(`DELETE FROM ai_schema.books WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Book deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reindex book embeddings
router.post('/books/:id/reindex', async (req, res) => {
  try {
    const chunks = await db.query(
      `SELECT bc.* FROM ai_schema.book_chunks bc WHERE bc.book_id = $1 ORDER BY bc.chunk_index`, [req.params.id]
    );
    for (const chunk of chunks.rows) {
      const embedding = await embedder.embedText(chunk.chunk_text);
      if (embedding) {
        await db.query(
          `UPDATE ai_schema.book_chunks SET embedding = $1::double precision[] WHERE id = $2`,
          [`{${embedding.join(',')}}`, chunk.id]
        );
      }
    }
    await db.query(`UPDATE ai_schema.books SET embedding_status = 'indexed' WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Embeddings rebuilt', chunkCount: chunks.rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Book chunks
router.get('/books/:id/chunks', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await db.query(
      `SELECT id, chunk_index, chunk_text, page_number, chapter, topic, token_count, created_at
       FROM ai_schema.book_chunks WHERE book_id = $1
       ORDER BY chunk_index LIMIT $2 OFFSET $3`,
      [req.params.id, parseInt(limit), offset]
    );
    const total = await db.query(`SELECT COUNT(*) FROM ai_schema.book_chunks WHERE book_id = $1`, [req.params.id]);
    res.json({ success: true, data: result.rows, total: parseInt(total.rows[0].count), page: parseInt(page) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GENERATION ──────────────────────────────────────────────

const genHandler = (feature, promptBuilder) => async (req, res) => {
  try {
    const result = await orchestrator.generate({
      feature,
      promptBuilder,
      params: req.body,
      teacherId: req.user?.id || 0,
      filters: { grade: req.body.grade, subject: req.body.subject }
    });
    if (!result.success) return res.status(404).json({ error: result.message, sources: result.sources });
    res.json(result);
  } catch (e) {
    console.error(`${feature} error:`, e);
    res.status(500).json({ error: `Failed to generate: ${e.message}` });
  }
};

router.post('/generate/lesson-plan', aiLimiter, genHandler('lesson_plan', promptBuilders.buildLessonPlanPrompt));
router.post('/generate/lesson-note', aiLimiter, genHandler('lesson_note', promptBuilders.buildLessonNotePrompt));
router.post('/generate/homework', aiLimiter, genHandler('homework', promptBuilders.buildHomeworkPrompt));
router.post('/generate/worksheet', aiLimiter, genHandler('worksheet', promptBuilders.buildWorksheetPrompt));
router.post('/generate/quiz', aiLimiter, genHandler('quiz', promptBuilders.buildQuizPrompt));
router.post('/generate/exam', aiLimiter, genHandler('exam', promptBuilders.buildExamPrompt));
router.post('/generate/scramble-exam', aiLimiter, genHandler('scramble_exam', promptBuilders.buildScrambleExamPrompt));
router.post('/generate/rubric', aiLimiter, genHandler('rubric', promptBuilders.buildRubricPrompt));
router.post('/generate/activities', aiLimiter, genHandler('activities', promptBuilders.buildActivitiesPrompt));
router.post('/generate/project', aiLimiter, genHandler('project', promptBuilders.buildProjectPrompt));
router.post('/generate/assessment', aiLimiter, genHandler('assessment', promptBuilders.buildAssessmentPrompt));
router.post('/generate/parent-report', aiLimiter, genHandler('parent_report', promptBuilders.buildParentReportPrompt));

// ─── CHAT ─────────────────────────────────────────────────────

router.post('/chat', aiLimiter, async (req, res) => {
  try {
    const { query, sessionId } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const startTime = Date.now();
    const result = await orchestrator.chat({
      query,
      teacherId: req.user?.id || 0,
      filters: { grade: req.body.grade, subject: req.body.subject }
    });

    // Save chat message
    if (sessionId) {
      try {
        await db.query(
          `INSERT INTO ai_schema.chat_history (teacher_id, session_id, role, message, retrieved_sources, confidence)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.user?.id || 0, sessionId, 'assistant', result.answer || '',
           JSON.stringify(result.sources || []), result.confidence || 0]
        );
      } catch {}
    }

    res.json({ success: true, data: result });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: 'Chat failed: ' + e.message });
  }
});

// Chat history
router.get('/chat/history', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const result = await db.query(
      `SELECT id, role, message, retrieved_sources, confidence, created_at
       FROM ai_schema.chat_history
       WHERE session_id = $1 AND teacher_id = $2
       ORDER BY created_at`,
      [sessionId || '', req.user?.id || 0]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SEARCH ───────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const { q, grade, subject, bookId, page = 1, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const chunks = await rag.retrieve(q, { grade, subject, bookId: parseInt(bookId) || null }, parseInt(limit));
    res.json({ success: true, data: chunks, total: chunks.length, page: parseInt(page) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GENERATION HISTORY ──────────────────────────────────────

router.get('/history', async (req, res) => {
  try {
    const { feature, page = 1, limit = 20 } = req.query;
    const conditions = ['teacher_id = $1'];
    const params = [req.user?.id || 0];
    let idx = 2;

    if (feature) { conditions.push(`feature = $${idx++}`); params.push(feature); }

    const where = conditions.join(' AND ');
    const result = await db.query(
      `SELECT id, feature, grade, subject, topic, confidence, token_count, response_time_ms, is_favorite, created_at
       FROM ai_schema.generations WHERE ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
    );
    const total = await db.query(
      `SELECT COUNT(*) FROM ai_schema.generations WHERE ${where}`, params
    );
    res.json({ success: true, data: result.rows, total: parseInt(total.rows[0].count) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single generation detail
router.get('/history/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM ai_schema.generations WHERE id = $1 AND teacher_id = $2`,
      [req.params.id, req.user?.id || 0]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FAVORITES ────────────────────────────────────────────────

router.post('/favorites', async (req, res) => {
  try {
    const { generationId, notes, action } = req.body;
    if (action === 'remove') {
      await db.query(
        `DELETE FROM ai_schema.favorites WHERE generation_id = $1 AND teacher_id = $2`,
        [generationId, req.user?.id || 0]
      );
      await db.query(`UPDATE ai_schema.generations SET is_favorite = false WHERE id = $1`, [generationId]);
      return res.json({ success: true, message: 'Removed from favorites' });
    }
    await db.query(
      `INSERT INTO ai_schema.favorites (teacher_id, generation_id, notes)
       VALUES ($1,$2,$3) ON CONFLICT (teacher_id, generation_id) DO UPDATE SET notes = $3`,
      [req.user?.id || 0, generationId, notes || '']
    );
    await db.query(`UPDATE ai_schema.generations SET is_favorite = true WHERE id = $1`, [generationId]);
    res.json({ success: true, message: 'Added to favorites' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/favorites', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, f.notes, f.created_at as favorited_at
       FROM ai_schema.favorites f
       JOIN ai_schema.generations g ON g.id = f.generation_id
       WHERE f.teacher_id = $1
       ORDER BY f.created_at DESC`,
      [req.user?.id || 0]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────

router.get('/admin/dashboard', async (req, res) => {
  try {
    const [books, chunks, gensToday, teachers, queue, usage] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM ai_schema.books`),
      db.query(`SELECT COUNT(*) FROM ai_schema.book_chunks`),
      db.query(`SELECT COUNT(*) FROM ai_schema.generations WHERE created_at::date = CURRENT_DATE`),
      db.query(`SELECT COUNT(DISTINCT teacher_id) FROM ai_schema.generations`),
      db.query(`SELECT COUNT(*) FROM ai_schema.embedding_queue WHERE status = 'queued'`),
      db.query(`SELECT feature, SUM(request_count) as count FROM ai_schema.usage_stats GROUP BY feature ORDER BY count DESC`)
    ]);

    res.json({
      success: true,
      data: {
        totalBooks: parseInt(books.rows[0].count),
        totalChunks: parseInt(chunks.rows[0].count),
        generationsToday: parseInt(gensToday.rows[0].count),
        activeTeachers: parseInt(teachers.rows[0].count),
        queueLength: parseInt(queue.rows[0].count),
        usageByFeature: usage.rows
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/storage', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT b.grade, b.subject, COUNT(bc.id) as chunks, SUM(bc.token_count) as total_tokens
       FROM ai_schema.books b
       JOIN ai_schema.book_chunks bc ON bc.book_id = b.id
       GROUP BY b.grade, b.subject ORDER BY b.grade, b.subject`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/queue', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT eq.*, b.title as book_name FROM ai_schema.embedding_queue eq
       JOIN ai_schema.books b ON b.id = eq.book_id
       ORDER BY eq.priority DESC, eq.queued_at LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── USAGE STATS ──────────────────────────────────────────────

router.get('/usage/stats', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT date, feature, SUM(request_count) as requests, SUM(token_count) as tokens
       FROM ai_schema.usage_stats
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY date, feature ORDER BY date`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/usage/daily', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT date, SUM(request_count) as total_requests, SUM(token_count) as total_tokens,
              AVG(response_time_ms) as avg_response_ms
       FROM ai_schema.usage_stats
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY date ORDER BY date`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PROMPT TEMPLATES ─────────────────────────────────────────

router.get('/prompts', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, feature, is_default, is_system, created_at
       FROM ai_schema.prompt_templates ORDER BY feature, name`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/prompts/:id', async (req, res) => {
  try {
    const { name, template } = req.body;
    await db.query(
      `UPDATE ai_schema.prompt_templates SET name = COALESCE($1, name), template = COALESCE($2, template), updated_at = NOW()
       WHERE id = $3`,
      [name, template, req.params.id]
    );
    res.json({ success: true, message: 'Template updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OCR — Extract text from scanned documents ──────────────
router.post('/ocr', ...branchSafeUpload(upload.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ocr = require('../services/ocrService');
    const lang = ocr.detectLanguage(req.file.originalname);
    const result = await ocr.extractText(req.file.path, lang);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── List Classes & Subjects — for dropdowns ──────────────
router.get('/list-classes', async (req, res) => {
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='classes_schema'");
    const classes = tables.rows.map(r => r.table_name);
    let subjects = [];
    try {
      const subjRes = await db.query("SELECT subject_name FROM subjects_of_school_schema.subjects ORDER BY subject_name");
      subjects = subjRes.rows.map(r => r.subject_name);
    } catch(e) { /* subjects table may not exist */ }
    res.json({ success: true, data: { classes, subjects } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── School Config — for term count & school days ────────
router.get('/school-config', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT terms as number_of_terms, school_days, teaching_days_per_week
      FROM schedule_schema.school_config LIMIT 1
    `);
    if (result.rows.length === 0) {
      return res.json({ success: true, data: { number_of_terms: 4, school_days: [1,2,3,4,5], teaching_days_per_week: 5 } });
    }
    const row = result.rows[0];
    const school_days = typeof row.school_days === 'string' ? JSON.parse(row.school_days) : (row.school_days || [1,2,3,4,5]);
    res.json({ success: true, data: { number_of_terms: row.number_of_terms || 4, school_days, teaching_days_per_week: row.teaching_days_per_week || 5 } });
  } catch(e) {
    res.json({ success: true, data: { number_of_terms: 4, school_days: [1,2,3,4,5], teaching_days_per_week: 5 } });
  }
});

module.exports = router;
