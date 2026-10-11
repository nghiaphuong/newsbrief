// Quy trình hằng ngày: thu thập → AI sàng lọc → trích toàn văn → dịch + tin A + số liệu → tổng hợp ngày.
const { q, getSettings } = require('./db');
const ai = require('./ai');
const { collectCandidates, extractArticle, hash, domainOf } = require('./fetcher');
const { ymd, viDate, toMysql, pool } = require('./util');

let current = null; // tránh chạy chồng

function status() { return current ? { running: true, ...current.public } : { running: false }; }

async function startRun(kind, trigger) {
  const r = await q('INSERT INTO runs (kind, trigger_by) VALUES (?, ?)', [kind, trigger]);
  const logs = [];
  const ctx = {
    id: r.insertId,
    public: { runId: r.insertId, kind, step: 'Bắt đầu', done: 0, total: 0 },
    log: (m) => { const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${m}`; logs.push(line); console.log(line); },
    logs,
  };
  return ctx;
}

async function finishRun(ctx, ok, stats) {
  await q('UPDATE runs SET status = ?, finished_at = NOW(), stats = ?, log = ? WHERE id = ?',
    [ok ? 'done' : 'error', JSON.stringify(stats || {}), ctx.logs.join('\n').slice(-60000), ctx.id]);
}

async function processOne(article, settings) {
  await q("UPDATE articles SET status = 'processing' WHERE id = ?", [article.id]);
  try {
    const res = await ai.processArticle(article, settings.tin_a_samples || '');
    await q(`UPDATE articles SET title_vi = ?, translation_vi = ?, tin_a_vi = ?, key_figures = ?, status = 'done', error_msg = NULL WHERE id = ?`,
      [res.title_vi.slice(0, 590), res.translation_vi, res.tin_a_vi, JSON.stringify(res.key_figures), article.id]);
  } catch (e) {
    await q("UPDATE articles SET status = 'error', error_msg = ? WHERE id = ?", [String(e.message).slice(0, 490), article.id]);
    throw e;
  }
}

async function insertCandidate(c, briefDate, scoreInfo, log) {
  let content = c.summary || '';
  let full = false;
  try {
    const ex = await extractArticle(c.url);
    if (ex.text && ex.text.length > content.length) content = ex.text;
    full = !c.paywall && ex.text.length > 1500;
  } catch (e) { log(`Không lấy được nội dung ${c.url}: ${e.message}`); }
  if (content.length < 120) { log(`Bỏ qua (nội dung quá ngắn): ${c.title}`); return null; }
  const r = await q(`INSERT IGNORE INTO articles (url, url_hash, source_name, source_domain, lang, title_original, published_at, brief_date,
      content_original, full_text, category, relations, relevance, relevance_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [c.url.slice(0, 690), hash(c.url), c.source.slice(0, 150), domainOf(c.url), c.lang, c.title.slice(0, 590), toMysql(c.published), briefDate,
      content, full ? 1 : 0, scoreInfo.category || null, (scoreInfo.relations || '').slice(0, 250), Math.round(scoreInfo.score || 0), (scoreInfo.reason || '').slice(0, 490)]);
  if (!r.insertId) return null;
  const rows = await q('SELECT * FROM articles WHERE id = ?', [r.insertId]);
  return rows[0];
}

async function runDaily(trigger = 'manual', opts = {}) {
  if (current) throw new Error('Đang có một lượt cập nhật chạy, vui lòng chờ.');
  const ctx = await startRun('daily', trigger);
  current = ctx;
  const stats = { candidates: 0, selected: 0, processed: 0, errors: 0 };
  try {
    const settings = await getSettings();
    const briefDate = opts.date || ymd();
    const already = (await q("SELECT COUNT(*) n FROM articles WHERE brief_date = ? AND status <> 'error'", [briefDate]))[0].n;
    const target = parseInt(opts.limit || settings.articles_per_day || '20', 10);
    const need = Math.max(0, target - already);
    ctx.log(`Ngày ${briefDate}: đã có ${already} tin, cần thêm tối đa ${need}.`);

    if (need > 0) {
      ctx.public.step = 'Thu thập tin từ các nguồn';
      let cands = await collectCandidates(ctx.log);
      stats.candidates = cands.length;
      ctx.log(`Tổng ${cands.length} tin ứng viên mới.`);
      cands = cands.slice(0, 240); // giới hạn chi phí

      ctx.public.step = 'AI sàng lọc mức độ liên quan';
      const scored = [];
      for (let i = 0; i < cands.length; i += 60) {
        const batch = cands.slice(i, i + 60);
        try {
          const res = await ai.scoreCandidates(batch);
          res.forEach(s => { if (batch[s.i]) scored.push({ ...batch[s.i], score: s }); });
        } catch (e) { ctx.log(`Lỗi chấm điểm lô ${i}: ${e.message}`); }
      }
      const minRel = parseInt(settings.min_relevance || '45', 10);
      const picked = scored.filter(c => c.score.score >= minRel).sort((a, b) => b.score.score - a.score.score);
      ctx.log(`${picked.length} tin đạt ngưỡng ${minRel} điểm.`);

      ctx.public.step = 'Lấy nội dung bài';
      const inserted = [];
      for (const c of picked) {
        if (inserted.length >= need) break;
        const a = await insertCandidate(c, briefDate, c.score, ctx.log);
        if (a) inserted.push(a);
      }
      stats.selected = inserted.length;

      ctx.public.step = 'Dịch, viết tin A, trích số liệu';
      ctx.public.total = inserted.length;
      await pool(inserted, 3, async (a) => {
        try { await processOne(a, settings); stats.processed++; ctx.log(`✓ ${a.title_original}`); }
        catch (e) { stats.errors++; ctx.log(`✗ ${a.title_original}: ${e.message}`); }
        ctx.public.done++;
      });
    }

    // Xử lý lại các bài lỗi/đang treo trong ngày
    const retry = await q("SELECT * FROM articles WHERE brief_date = ? AND status IN ('pending','error') LIMIT 10", [briefDate]);
    if (retry.length) {
      const settings2 = await getSettings();
      await pool(retry, 2, async a => { try { await processOne(a, settings2); stats.processed++; } catch { /* đã ghi lỗi */ } });
    }

    ctx.public.step = 'Tổng hợp tin trong ngày';
    await buildDailyDigest(briefDate, ctx.log);
    await finishRun(ctx, true, stats);
    return stats;
  } catch (e) {
    ctx.log(`LỖI: ${e.stack || e.message}`);
    await finishRun(ctx, false, stats);
    throw e;
  } finally {
    current = null;
  }
}

async function buildDailyDigest(briefDate, log = console.log, length = 'short') {
  const arts = await q("SELECT * FROM articles WHERE brief_date = ? AND status = 'done' ORDER BY relevance DESC", [briefDate]);
  if (!arts.length) { log('Không có tin để tổng hợp.'); return null; }
  arts.forEach(a => { a.key_figures = typeof a.key_figures === 'string' ? JSON.parse(a.key_figures || '[]') : (a.key_figures || []); });
  const content = await ai.dailyDigest(viDate(briefDate), arts, length);
  await q("DELETE FROM digests WHERE kind = 'daily' AND brief_date = ?", [briefDate]);
  await q("INSERT INTO digests (kind, brief_date, length_opt, content_vi, article_ids) VALUES ('daily', ?, ?, ?, ?)",
    [briefDate, length, content, JSON.stringify(arts.map(a => a.id))]);
  log('Đã tạo bản tổng hợp ngày.');
  return content;
}

module.exports = { runDaily, buildDailyDigest, processOne, status };
