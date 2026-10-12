// Dịch máy cho chế độ "free": Google Cloud Translation – Basic (v2).
// Google miễn phí 500.000 ký tự/tháng (tín dụng 10 USD/tháng), tính MỌI ký tự gửi đi kể cả khoảng trắng,
// và chốt tháng theo giờ Thái Bình Dương (America/Los_Angeles, có giờ mùa hè) như báo cáo Cloud Billing.
// Ứng dụng tự đếm và chặn trước khi gửi để không bao giờ vượt hạn mức miễn phí.
const config = require('./config');
const { q } = require('./db');

const FREE_TIER = 500000;
const LIMIT = Math.min(FREE_TIER, config.googleTranslateMonthlyLimit || FREE_TIER); // chỉ cho phép đặt thấp hơn
const MAX_CHARS_PER_REQUEST = 25000;
const BILLING_TZ = 'America/Los_Angeles';

class QuotaError extends Error {}

// Tháng tính phí của Google (YYYY-MM theo giờ Thái Bình Dương).
function billingPeriod(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: BILLING_TZ, year: 'numeric', month: '2-digit' }).format(d);
}

// Thời điểm hạn mức được làm mới: 00:00 ngày 1 tháng sau theo giờ Thái Bình Dương (UTC-8 hoặc UTC-7).
function nextReset(d = new Date()) {
  const [y, m] = billingPeriod(d).split('-').map(Number);
  for (const offset of [8, 7]) {
    const t = new Date(Date.UTC(y, m, 1, offset)); // Date.UTC tự chuyển tháng 12 → tháng 1 năm sau
    const hourLA = new Intl.DateTimeFormat('en-GB', { timeZone: BILLING_TZ, hour: '2-digit', hourCycle: 'h23' }).format(t);
    if (hourLA === '00') return t;
  }
  return new Date(Date.UTC(y, m, 1, 8));
}

// Đếm thận trọng: độ dài UTF-16 (không bao giờ nhỏ hơn số ký tự Google tính), đoạn rỗng tính 1 ký tự.
const countChars = texts => texts.reduce((n, t) => n + Math.max(1, String(t).length), 0);

// Giữ chỗ hạn mức trước khi gửi (nguyên tử trong MySQL). Ký tự đã giữ không hoàn lại kể cả khi lỗi, cho an toàn.
async function reserve(chars) {
  const period = billingPeriod();
  await q('INSERT IGNORE INTO translate_usage (period, chars) VALUES (?, 0)', [period]);
  const r = await q('UPDATE translate_usage SET chars = chars + ? WHERE period = ? AND chars + ? <= ?', [chars, period, chars, LIMIT]);
  if (!r.affectedRows) {
    const u = await usage();
    throw new QuotaError(`Đã chạm giới hạn dịch miễn phí của tháng (${u.used.toLocaleString('vi-VN')}/${u.limit.toLocaleString('vi-VN')} ký tự; yêu cầu này cần ${chars.toLocaleString('vi-VN')}). Hạn mức làm mới lúc ${u.resetAtOslo} (giờ Oslo).`);
  }
}

async function usage() {
  const period = billingPeriod();
  const [row] = await q('SELECT chars FROM translate_usage WHERE period = ?', [period]);
  const reset = nextReset();
  return {
    period, used: row ? Number(row.chars) : 0, limit: LIMIT, resetAt: reset.toISOString(),
    resetAtOslo: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' }).format(reset),
  };
}

function batches(texts) {
  const out = []; let cur = []; let size = 0;
  for (const t of texts) {
    if (cur.length && (size + t.length > MAX_CHARS_PER_REQUEST || cur.length >= 100)) { out.push(cur); cur = []; size = 0; }
    cur.push(t); size += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function google(texts, lang) {
  if (!config.googleTranslateKey) throw new Error('Chưa cấu hình GOOGLE_TRANSLATE_API_KEY');
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(config.googleTranslateKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: texts, source: lang === 'no' ? 'no' : 'en', target: 'vi', format: 'text' }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Translate ${res.status}: ${data?.error?.message || ''}`.trim());
  return data.data.translations.map(t => t.translatedText);
}

// Dịch một mảng đoạn văn (giữ thứ tự). Giữ chỗ hạn mức cho TOÀN BỘ yêu cầu trước khi gửi lô đầu tiên,
// để không có chuyện dịch dở dang rồi mới phát hiện hết hạn mức. lang: 'en' | 'no'.
async function translateTexts(texts, lang) {
  if (!config.googleTranslateKey) throw new Error('Chưa cấu hình GOOGLE_TRANSLATE_API_KEY');
  await reserve(countChars(texts));
  const out = [];
  for (const b of batches(texts)) out.push(...await google(b, lang));
  return out;
}

// Dịch văn bản dài theo từng đoạn (tách ở dòng trống), ghép lại giữ cấu trúc đoạn.
async function translateLong(text, lang) {
  const paras = String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .flatMap(p => p.length > MAX_CHARS_PER_REQUEST ? p.match(new RegExp(`[\\s\\S]{1,${MAX_CHARS_PER_REQUEST}}`, 'g')) : [p]);
  if (!paras.length) return '';
  return (await translateTexts(paras, lang)).join('\n\n');
}

module.exports = { translateTexts, translateLong, usage, billingPeriod, nextReset, countChars, QuotaError, LIMIT };
