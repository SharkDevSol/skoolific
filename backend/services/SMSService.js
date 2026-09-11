const axios = require('axios');

const PROVIDER = process.env.SMS_PROVIDER || 'afromessage';

const AFRO_ENDPOINT = 'https://api.afromessage.com/api/send';
const AFRO_TOKEN = process.env.AFRO_TOKEN || '';
const AFRO_SENDER = process.env.AFRO_SENDER || null;

const GEEZSMS_ENDPOINT = 'https://api.geezsms.com/api/v1/sms/send';
const GEEZSMS_TOKEN = process.env.GEEZSMS_TOKEN || '';
const GEEZSMS_SENDER = process.env.GEEZSMS_SENDER || 'SOORA';
// Optional: numeric shortcode ID approved for Ethio Telecom (dashboard → Shortcodes).
// When set, it is used instead of / in addition to the sender name.
const GEEZSMS_SHORTCODE_ID = process.env.GEEZSMS_SHORTCODE_ID || '';

const normalizePhone = (raw) => {
  let phone = String(raw).replace(/[^0-9+]/g, '');
  if (!phone) return '';
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (phone.startsWith('0') && phone.length >= 9 && phone.length <= 10) phone = '251' + phone.slice(1);
  return phone;
};

// Record every SMS attempt into sms_logs (branch-routed via config/db pool).
// Fire-and-forget: a DB failure must never break the actual SMS send.
async function logSmsSend({ templateKey, recipientName, phone, message, status, provider, error, segments }) {
  try {
    const pool = require('../config/db');
    await pool.query(
      `INSERT INTO sms_logs (template_key, recipient_name, phone, message, status, provider, error, segments, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [templateKey || null, recipientName || null, phone || null, message || null, status, provider || null, error || null, segments || 1]
    );
  } catch (e) {
    console.warn('sms_logs write failed:', e.message);
  }
}

const sendSMS = async (to, message, senderId, meta = {}) => {
  // SMS credit count: 1 SMS per 160 chars, so >159 chars = 2 SMS, >319 = 3 SMS...
  const segments = Math.max(1, Math.ceil(String(message).length / 159));
  if (!to) return { success: false, error: 'Invalid phone number' };
  let result;
  try {
    // GeezSMS primary → AfroMessage fallback (some providers reject
    // certain networks/senders; the fallback doubles delivery chances).
    if (PROVIDER === 'geezsms') {
      const res = await sendViaGeezSMS(to, message);
      if (res.success) { result = { ...res, provider: 'geezsms' }; return result; }
      const phone = normalizePhone(to);
      if (!phone) { result = { success: false, error: res.error, phone: to, provider: 'geezsms' }; return result; }
      const fb = await sendViaAfroMessage(phone, message, senderId);
      if (fb.success) { result = { ...fb, provider: 'afromessage', fallbackFrom: 'geezsms' }; return result; }
      result = {
        success: false,
        error: `geezsms: ${res.error}; afromessage: ${fb.error}`,
        phone,
        provider: 'both-failed'
      };
    } else {
      const phone = normalizePhone(to);
      if (!phone) { result = { success: false, error: 'Invalid phone number' }; return result; }
      result = await sendViaAfroMessage(phone, message, senderId);
    }
    return result;
  } catch (e) {
    result = { success: false, error: e.message, phone: to };
    return result;
  } finally {
    logSmsSend({
      templateKey: meta.templateKey,
      recipientName: meta.recipientName,
      phone: result?.phone || to,
      message,
      status: result?.success ? 'sent' : 'failed',
      provider: result?.provider || null,
      error: result?.success ? null : result?.error,
      segments
    });
  }
};

const sendViaAfroMessage = async (phone, message, senderId) => {
  if (!AFRO_TOKEN) return { success: false, error: 'AFRO_TOKEN not configured' };
  const payload = { to: phone, message };
  const sender = senderId || AFRO_SENDER;
  if (sender && sender !== 'Default') payload.from = sender;
  const res = await axios.post(AFRO_ENDPOINT, payload, {
    headers: { Authorization: `Bearer ${AFRO_TOKEN}` }
  });
  const apiSuccess = res.data?.acknowledge === 'success';
  if (!apiSuccess) return { success: false, error: res.data?.response?.errors?.[0] || 'API rejected', response: res.data, phone };
  return { success: true, response: res.data, phone };
};

const sendViaGeezSMS = async (phone, message) => {
  if (!GEEZSMS_TOKEN) return { success: false, error: 'GEEZSMS_TOKEN not configured' };
  phone = normalizePhone(phone);
  if (!phone) return { success: false, error: 'Invalid phone number' };
  let url = `${GEEZSMS_ENDPOINT}?token=${encodeURIComponent(GEEZSMS_TOKEN)}&phone=${encodeURIComponent(phone)}&msg=${encodeURIComponent(message)}&sender=${encodeURIComponent(GEEZSMS_SENDER)}`;
  if (GEEZSMS_SHORTCODE_ID) {
    url += `&shortcode_id=${encodeURIComponent(GEEZSMS_SHORTCODE_ID)}`;
  }
  const res = await axios.get(url);
  const result = res.data;
  if (result && result.error === false) return { success: true, response: result, phone };
  return { success: false, error: result?.msg || result?.message || JSON.stringify(result), response: result, phone };
};

const splitMessage = (text, maxLen = 153) => {
  if (text.length <= 160) return [text];
  const segments = [];
  for (let i = 0; i < text.length; i += maxLen) segments.push(text.substring(i, i + maxLen));
  return segments;
};

module.exports = { sendSMS, splitMessage };
