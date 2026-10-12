// Chế độ gói Claude Team/Pro: tác vụ Claude Code (chạy bằng tài khoản Claude của người dùng) lấy việc
// qua GET /api/agent/jobs và gửi kết quả qua POST /api/agent/results. Xem docs/CLAUDE_PLAN.md.
const { q, getSettings } = require('./db');
const ai = require('./ai');
const { buildDailyDigest } = require('./pipeline');
const { ymd, viDate, addDays } = require('./util');

const CATS = ['chinh-tri', 'kinh-te', 'van-hoa-xa-hoi'];
const parseFigs = a => { a.key_figures = typeof a.key_figures === 'string' ? JSON.parse(a.key_figures || '[]') : (a.key_figures || []); return a; };
const doneArticles = date => q("SELECT * FROM articles WHERE brief_date = ? AND status = 'done' ORDER BY relevance DESC", [date]);

// Ngày cần Claude viết bản tổng hợp: có tin đã xử lý, không còn tin chờ, và chưa có bản do AI viết.
async function digestDates(maxDates) {
  return q(`SELECT a.brief_date d FROM articles a
      LEFT JOIN digests g ON g.kind = 'daily' AND g.brief_date = a.brief_date
      WHERE a.brief_date >= ? GROUP BY a.brief_date
      HAVING SUM(a.status = 'done') > 0 AND SUM(a.status = 'pending') = 0
         AND (MAX(g.id) IS NULL OR SUM(g.length_opt = 'list') > 0)
      ORDER BY a.brief_date DESC LIMIT ?`, [addDays(ymd(), -7), maxDates]);
}

async function counts() {
  const [p] = await q("SELECT COUNT(*) n FROM articles WHERE status = 'pending'");
  const [t] = await q("SELECT COUNT(*) n FROM articles WHERE translate_requested = 1 AND status <> 'skipped'");
  return { articles: p.n, translations: t.n, digests: (await digestDates(30)).length };
}

async function getJobs({ limit = 10 } = {}) {
  const settings = await getSettings();
  limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 30);
  const articles = (await q(`SELECT id, url, source_name, lang, title_original, published_at, brief_date, full_text, content_original
      FROM articles WHERE status = 'pending' ORDER BY brief_date DESC, relevance DESC LIMIT ?`, [limit]))
    .map(a => ({ ...a, content_original: String(a.content_original || '').slice(0, 12000) }));
  const translations = (await q(`SELECT id, url, source_name, lang, title_original, full_text, content_original
      FROM articles WHERE translate_requested = 1 AND status <> 'skipped' ORDER BY id LIMIT ?`, [Math.max(1, Math.ceil(limit / 3))]))
    .map(a => ({ ...a, content_original: String(a.content_original || '').slice(0, 24000) }));
  const digests = [];
  for (const { d } of await digestDates(2)) {
    const arts = (await doneArticles(d)).map(parseFigs);
    digests.push({ brief_date: d, date_label: viDate(d), articles: ai.articlesBlock(arts) });
  }
  return { instructions: ai.agentInstructions(settings), articles, translations, digests, remaining: await counts() };
}

async function applyResults(body = {}) {
  const applied = { articles: 0, skipped: 0, translations: 0, digests: 0, errors: [] };
  const touched = new Set();
  for (const r of Array.isArray(body.articles) ? body.articles : []) {
    const id = parseInt(r.id, 10);
    const [a] = await q('SELECT id, brief_date FROM articles WHERE id = ?', [id]);
    if (!a) { applied.errors.push(`Bài ${r.id}: không tồn tại`); continue; }
    const relevance = Math.max(0, Math.min(100, Math.round(Number(r.relevance) || 0)));
    if (r.discard) {
      await q("UPDATE articles SET status = 'skipped', relevance = ?, relevance_reason = ? WHERE id = ?", [relevance, String(r.reason || '').slice(0, 490), id]);
      applied.skipped++;
      continue;
    }
    if (!r.tin_a_vi || !String(r.tin_a_vi).trim()) { applied.errors.push(`Bài ${id}: thiếu tin_a_vi`); continue; }
    await q(`UPDATE articles SET title_vi = ?, tin_a_vi = ?, key_figures = ?, category = ?, relations = ?, relevance = ?, relevance_reason = ?,
        status = 'done', error_msg = NULL WHERE id = ?`,
      [String(r.title_vi || '').slice(0, 590), String(r.tin_a_vi), JSON.stringify(Array.isArray(r.key_figures) ? r.key_figures : []),
        CATS.includes(r.category) ? r.category : 'chinh-tri', String(r.relations || '').slice(0, 250), relevance, String(r.reason || '').slice(0, 490), id]);
    applied.articles++;
    touched.add(String(a.brief_date).slice(0, 10));
  }
  for (const r of Array.isArray(body.translations) ? body.translations : []) {
    if (!r.translation_vi || !String(r.translation_vi).trim()) { applied.errors.push(`Bản dịch ${r.id}: rỗng`); continue; }
    const res = await q('UPDATE articles SET translation_vi = ?, translate_requested = 0 WHERE id = ?', [String(r.translation_vi), parseInt(r.id, 10)]);
    if (res.affectedRows) applied.translations++; else applied.errors.push(`Bản dịch ${r.id}: bài không tồn tại`);
  }
  const written = new Set();
  for (const r of Array.isArray(body.digests) ? body.digests : []) {
    const d = String(r.brief_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !r.content_vi) { applied.errors.push(`Tổng hợp ${r.brief_date}: thiếu ngày hoặc nội dung`); continue; }
    const arts = await doneArticles(d); // cùng thứ tự đánh số như lúc giao việc
    await q("DELETE FROM digests WHERE kind = 'daily' AND brief_date = ?", [d]);
    await q("INSERT INTO digests (kind, brief_date, length_opt, content_vi, article_ids) VALUES ('daily', ?, 'claude', ?, ?)",
      [d, String(r.content_vi), JSON.stringify(arts.map(a => a.id))]);
    applied.digests++; written.add(d);
  }
  // Ngày có tin mới xử lý mà chưa có bản tổng hợp mới: ghép bản tạm, Claude viết lại ở lượt sau.
  const settings = await getSettings();
  for (const d of touched) if (!written.has(d)) await buildDailyDigest(d, () => {}, 'short', { ...settings, ai_mode: 'claude_plan' });
  return { ok: true, applied, remaining: await counts() };
}

module.exports = { getJobs, applyResults };
