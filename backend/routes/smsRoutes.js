const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sendSMS } = require('../services/SMSService');

const normalizePhone = (raw) => {
  let phone = String(raw || '').replace(/[^0-9+]/g, '');
  if (!phone) return '';
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (phone.startsWith('0') && phone.length >= 9 && phone.length <= 10) phone = '251' + phone.slice(1);
  return phone;
};

// List classes_schema tables (G1, G2, ...) for this branch
async function getClassTables() {
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name`
  );
  return result.rows.map(r => r.table_name);
}

// GET /api/sms/recipients?group=all|guardians|students|staff&class=G5&q=...
// Candidate recipients: guardians (from class tables), students (via guardian phone), staff.
router.get('/recipients', async (req, res) => {
  try {
    const { group = 'all', class: className = '', q = '' } = req.query;
    const seen = new Map();
    const push = (name, phone, type, cls) => {
      const p = normalizePhone(phone);
      if (!p || p.length < 9 || seen.has(p)) return;
      seen.set(p, true);
      entries.push({ name, phone: p, type, class: cls || '' });
    };

    const entries = [];
    const tables = await getClassTables();

    if (group === 'all' || group === 'guardians' || group === 'students') {
      for (const t of tables) {
        if (className && t !== className) continue;
        let rows = [];
        try {
          const colsResult = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'classes_schema' AND table_name = $1`,
            [t]
          );
          const cols = new Set(colsResult.rows.map(r => r.column_name));
          const colsToSelect = ['student_name', 'guardian_name', 'guardian_phone']
            .concat(cols.has('guardian_2nd_phone') ? ['guardian_2nd_phone'] : []);
          const r = await pool.query(
            `SELECT ${colsToSelect.map(c => `"${c}"`).join(', ')} FROM classes_schema."${t}"`
          );
          rows = r.rows;
        } catch (e) {
          console.error(`Error reading class table ${t}:`, e.message);
          continue;
        }
        for (const row of rows) {
          if (group === 'all' || group === 'guardians') {
            const gname = (row.guardian_name || '').trim();
            push(gname || `${(row.student_name || '').trim()} guardian`, row.guardian_phone, 'guardian', t);
            if (row.guardian_2nd_phone) push(`${gname || 'Guardian'} (2nd)`, row.guardian_2nd_phone, 'guardian', t);
          }
          if (group === 'all' || group === 'students') {
            push((row.student_name || '').trim(), row.guardian_phone, 'student', t);
          }
        }
      }
    }

    if (group === 'all' || group === 'staff') {
      try {
        const r = await pool.query(
          `SELECT first_name, middle_name, last_name, phone_number FROM public.staff WHERE phone_number IS NOT NULL AND phone_number != ''`
        );
        for (const row of r.rows) {
          const name = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ').trim();
          push(name || 'Staff', row.phone_number, 'staff', '');
        }
      } catch (e) {
        console.error('Error fetching staff recipients:', e.message);
      }
    }

    const filtered = q
      ? entries.filter(e => e.name.toLowerCase().includes(q.toLowerCase()) || e.phone.includes(q.replace(/[^0-9+]/g, '')))
      : entries;

    res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('Error fetching SMS recipients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sms/send — send a custom message to the given recipients
router.post('/send', async (req, res) => {
  try {
    const { message, recipients } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients selected' });
    }

    const list = recipients.slice(0, 500);
    const text = String(message).trim();
    const segmentsPerSms = Math.max(1, Math.ceil(text.length / 159));

    const results = [];
    const queue = [...list];
    const CONCURRENCY = 5;

    async function worker() {
      while (queue.length > 0) {
        const r = queue.shift();
        const phone = normalizePhone(r.phone);
        if (!phone || phone.length < 9) {
          results.push({ ...r, success: false, error: 'Invalid phone number', provider: null });
          continue;
        }
        const result = await sendSMS(phone, text, null, {
          templateKey: 'manual_compose',
          recipientName: r.name || null
        });
        results.push({ ...r, success: result.success, error: result.error || null, provider: result.provider });
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));

    const sent = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      success: true,
      data: {
        total: results.length,
        sent: sent.length,
        failed: failed.length,
        credits: segmentsPerSms * results.length,
        segmentsPerSms,
        results
      }
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sms/templates — get all SMS templates for current branch
router.get('/templates', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, template_key, template_text, is_active FROM sms_templates ORDER BY template_key'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching SMS templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/sms/templates/:key — update a template
router.put('/templates/:key', async (req, res) => {
  try {
    const { template_text } = req.body;
    const { key } = req.params;

    if (!template_text) {
      return res.status(400).json({ success: false, error: 'template_text is required' });
    }

    const result = await pool.query(
      'UPDATE sms_templates SET template_text = $1, updated_at = NOW() WHERE template_key = $2 RETURNING id, template_key, template_text, is_active',
      [template_text, key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating SMS template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sms/counter — SMS totals grouped by template for the current branch
router.get('/counter', async (req, res) => {
  try {
    const totals = await pool.query(
      `SELECT
         COUNT(*) AS total_sends,
         COALESCE(SUM(segments), 0)::int AS total_segments,
         COUNT(*) FILTER (WHERE status = 'sent') AS sent,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW())) AS today_sends,
         COALESCE(SUM(segments) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0)::int AS today_segments
       FROM sms_logs`
    );
    const byTemplate = await pool.query(
      `SELECT template_key,
              COUNT(*) AS sends,
              COALESCE(SUM(segments), 0)::int AS segments,
              COUNT(*) FILTER (WHERE status = 'sent') AS sent,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM sms_logs
       GROUP BY template_key
       ORDER BY sends DESC`
    );
    res.json({
      success: true,
      data: {
        totals: totals.rows[0],
        byTemplate: byTemplate.rows
      }
    });
  } catch (error) {
    console.error('Error fetching SMS counter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sms/logs — recent SMS sends with optional filters
router.get('/logs', async (req, res) => {
  try {
    const { template, status, limit = 50, offset = 0 } = req.query;
    const where = [];
    const params = [];
    if (template) {
      params.push(template);
      where.push(`template_key = $${params.length}`);
    }
    if (status === 'sent' || status === 'failed') {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    params.push(lim);
    params.push(off);
    const result = await pool.query(
      `SELECT id, template_key, recipient_name, phone, status, provider, error, segments, created_at
       FROM sms_logs ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching SMS logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: get rendered template for a branch
async function getRenderedTemplate(templateKey, variables) {
  try {
    const result = await pool.query(
      'SELECT template_text FROM sms_templates WHERE template_key = $1 AND is_active = true',
      [templateKey]
    );
    if (result.rows.length === 0) return null;
    let text = result.rows[0].template_text;
    for (const [key, val] of Object.entries(variables)) {
      text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val || '');
    }
    return text;
  } catch (e) {
    console.error('Error rendering SMS template:', e.message);
    return null;
  }
}

module.exports = router;
module.exports.getRenderedTemplate = getRenderedTemplate;
