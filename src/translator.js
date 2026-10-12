// Dịch máy miễn phí (chế độ "free"): DeepL API Free hoặc Google Cloud Translation v2.
// Cả hai đều có hạn mức miễn phí ~500.000 ký tự/tháng; vượt hạn mức sẽ báo lỗi.
const config = require('./config');

const MAX_CHARS_PER_REQUEST = 25000;

// Gom các đoạn thành từng lô không vượt giới hạn ký tự/số đoạn của mỗi lần gọi.
function batches(texts, maxItems) {
  const out = []; let cur = []; let size = 0;
  for (const t of texts) {
    if (cur.length && (size + t.length > MAX_CHARS_PER_REQUEST || cur.length >= maxItems)) { out.push(cur); cur = []; size = 0; }
    cur.push(t); size += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function deepl(texts, lang) {
  if (!config.deeplKey) throw new Error('Chưa cấu hình DEEPL_API_KEY');
  const host = config.deeplKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `DeepL-Auth-Key ${config.deeplKey}` },
    body: JSON.stringify({ text: texts, source_lang: lang === 'no' ? 'NB' : 'EN', target_lang: 'VI', preserve_formatting: true }),
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 456) throw new Error('DeepL: đã hết hạn mức ký tự miễn phí của tháng');
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.translations.map(t => t.text);
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

// Dịch một mảng đoạn văn (giữ nguyên thứ tự). lang: 'en' | 'no'.
async function translateTexts(texts, lang, provider = 'deepl') {
  const fn = provider === 'google' ? google : deepl;
  const out = [];
  for (const b of batches(texts, provider === 'google' ? 100 : 50)) out.push(...await fn(b, lang));
  return out;
}

// Dịch văn bản dài theo từng đoạn (tách ở dòng trống), ghép lại giữ cấu trúc đoạn.
async function translateLong(text, lang, provider) {
  const paras = String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .flatMap(p => p.length > MAX_CHARS_PER_REQUEST ? p.match(new RegExp(`[\\s\\S]{1,${MAX_CHARS_PER_REQUEST}}`, 'g')) : [p]);
  if (!paras.length) return '';
  return (await translateTexts(paras, lang, provider)).join('\n\n');
}

module.exports = { translateTexts, translateLong };
