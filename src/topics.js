// Tổng hợp theo chủ đề người dùng nhập.
const { q, getSettings } = require('./db');
const ai = require('./ai');
const { gdeltSearch, extractArticle, hash, domainOf } = require('./fetcher');
const { ymd, addDays, toMysql } = require('./util');
const { processOne, modeOf, FULL_TEXT_MIN } = require('./pipeline');
const { compileDigest } = require('./heuristic');

function parseFigs(a) { a.key_figures = typeof a.key_figures === 'string' ? JSON.parse(a.key_figures || '[]') : (a.key_figures || []); return a; }

async function findArticles(topic, from, to, limit = 40) {
  const terms = topic.split(/[,;]+|\s+/).map(t => t.trim()).filter(t => t.length > 1);
  let rows = await q(`SELECT *, MATCH(title_original, title_vi, tin_a_vi, translation_vi, content_original) AGAINST (? IN NATURAL LANGUAGE MODE) AS rel
      FROM articles WHERE status = 'done' AND brief_date BETWEEN ? AND ?
      HAVING rel > 0 ORDER BY rel DESC LIMIT ?`, [topic, from, to, limit]);
  if (!rows.length && terms.length) {
    const likes = terms.map(() => '(title_original LIKE ? OR title_vi LIKE ? OR tin_a_vi LIKE ? OR content_original LIKE ?)').join(' OR ');
    const params = terms.flatMap(t => Array(4).fill(`%${t}%`));
    rows = await q(`SELECT * FROM articles WHERE status = 'done' AND brief_date BETWEEN ? AND ? AND (${likes}) ORDER BY brief_date DESC LIMIT ?`, [from, to, ...params, limit]);
  }
  return rows.map(parseFigs);
}

// Quét thêm nguồn mới qua GDELT cho chủ đề (tối đa vài bài, dịch & lưu vào CSDL như tin thường).
async function scanFresh(topic, days, log) {
  const settings = await getSettings();
  const timespan = `${Math.min(Math.max(days, 1), 90)}d`;
  const found = [];
  for (const lang of ['english', 'norwegian']) {
    try { found.push(...await gdeltSearch(topic, lang, timespan, 15)); } catch (e) { log(`GDELT: ${e.message}`); }
    await new Promise(r => setTimeout(r, 5500));
  }
  const fresh = [];
  for (const c of found.slice(0, 20)) {
    if (fresh.length >= 6) break;
    const ex = await q('SELECT id FROM articles WHERE url_hash = ?', [hash(c.url)]);
    if (ex.length) continue;
    try {
      const { text } = await extractArticle(c.url);
      if (!text || text.length < FULL_TEXT_MIN) continue; // chỉ nhận bài đọc được toàn văn
      const bd = c.published && !isNaN(c.published) ? ymd(c.published) : ymd();
      const r = await q(`INSERT IGNORE INTO articles (url, url_hash, source_name, source_domain, lang, title_original, published_at, brief_date, content_original, full_text, relevance, relevance_reason)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [c.url.slice(0, 690), hash(c.url), c.source, domainOf(c.url), c.lang, c.title.slice(0, 590), toMysql(c.published), bd, text, 1, 50, `Tìm theo chủ đề: ${topic}`.slice(0, 490)]);
      if (!r.insertId) continue;
      const a = (await q('SELECT * FROM articles WHERE id = ?', [r.insertId]))[0];
      await processOne(a, settings);
      fresh.push(a.id);
    } catch (e) { log(`Bỏ qua ${c.url}: ${e.message}`); }
  }
  return fresh;
}

async function topicSummary({ topic, days = 7, length = 'medium', scan = false }) {
  const to = ymd();
  const from = addDays(to, -(Math.max(1, parseInt(days, 10)) - 1));
  const log = m => console.log('[topic]', m);
  if (scan) await scanFresh(topic, days, log);
  const arts = await findArticles(topic, from, to);
  if (!arts.length) return { content: `Không tìm thấy tin nào về "${topic}" trong giai đoạn ${from} – ${to}. Hãy thử từ khóa khác hoặc bật "Quét thêm nguồn mới".`, articles: [], from, to };
  arts.sort((a, b) => String(a.brief_date).localeCompare(String(b.brief_date)));
  const mode = modeOf(await getSettings());
  // Chỉ chế độ Claude API viết bài tổng hợp bằng AI; các chế độ khác ghép danh sách tin A theo lĩnh vực.
  const content = mode === 'api'
    ? await ai.topicDigest(topic, from, to, arts, length)
    : compileDigest(`Tổng hợp chủ đề "${topic}" (${from} – ${to})`, arts, 'Danh sách tin A liên quan, ghép tự động (không dùng AI ở chế độ hiện tại).');
  const r = await q("INSERT INTO digests (kind, topic, date_from, date_to, length_opt, content_vi, article_ids) VALUES ('topic', ?, ?, ?, ?, ?, ?)",
    [topic.slice(0, 290), from, to, length, content, JSON.stringify(arts.map(a => a.id))]);
  return { id: r.insertId, content, from, to, articles: arts.map(a => ({ id: a.id, title: a.title_vi || a.title_original, source: a.source_name, date: a.brief_date, url: a.url })) };
}

module.exports = { topicSummary, findArticles };
