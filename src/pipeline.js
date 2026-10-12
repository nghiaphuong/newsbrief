// Quy trình hằng ngày: thu thập → sàng lọc → trích toàn văn → tin A + số liệu → tổng hợp ngày.
// Ba chế độ (Cài đặt → Chế độ xử lý):
//  - api:         Claude API làm mọi bước (tốn API credits).
//  - claude_plan: server chỉ thu thập & lọc từ khóa, đưa bài vào hàng đợi; tác vụ Claude Code chạy bằng
//                 gói Claude Team/Pro lấy việc qua /api/agent/* và gửi kết quả về (src/agent.js).
//  - free:        không dùng AI: lọc từ khóa, dịch máy (DeepL/Google), tổng hợp dạng danh sách.
const { q, getSettings } = require('./db');
const ai = require('./ai');
const heuristic = require('./heuristic');
const translator = require('./translator');
const { collectCandidates, extractArticle, hash, domainOf } = require('./fetcher');
const { ymd, viDate, toMysql, pool } = require('./util');

const MODES = ['api', 'claude_plan', 'free'];
const modeOf = s => (MODES.includes(s.ai_mode) ? s.ai_mode : 'api');

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

// Tiêu đề + tin A bằng dịch máy (chế độ free): dịch tiêu đề và đoạn mở đầu bài.
async function processFree(article, settings) {
  const [titleVi, leadVi] = await translator.translateTexts([article.title_original, heuristic.lead(article)], article.lang, settings.translate_provider);
  return { title_vi: titleVi, tin_a_vi: heuristic.tinA(titleVi, leadVi, article), key_figures: [] };
}

// Xử lý một bài theo chế độ hiện hành. Trả { queued: true } nếu bài được đưa vào hàng đợi cho Claude.
async function processOne(article, settings) {
  const mode = modeOf(settings);
  if (mode === 'claude_plan') {
    await q("UPDATE articles SET status = 'pending', error_msg = NULL WHERE id = ?", [article.id]);
    return { queued: true };
  }
  await q("UPDATE articles SET status = 'processing' WHERE id = ?", [article.id]);
  try {
    const res = mode === 'free' ? await processFree(article, settings) : await ai.processArticle(article, settings.tin_a_samples || '');
    // Không đụng tới translation_vi: bản dịch toàn văn (nếu đã có) được giữ nguyên.
    await q(`UPDATE articles SET title_vi = ?, tin_a_vi = ?, key_figures = ?, status = 'done', error_msg = NULL WHERE id = ?`,
      [String(res.title_vi || '').slice(0, 590), res.tin_a_vi, JSON.stringify(res.key_figures), article.id]);
    return { queued: false };
  } catch (e) {
    await q("UPDATE articles SET status = 'error', error_msg = ? WHERE id = ?", [String(e.message).slice(0, 490), article.id]);
    throw e;
  }
}

// Dịch toàn văn theo yêu cầu (nút "Dịch toàn văn" trong khung đọc bài). Chạy nền vì có thể mất vài phút,
// trình duyệt hỏi trạng thái qua translateStatus(). Chế độ gói Claude: chỉ đánh dấu yêu cầu, Claude dịch ở lượt sau.
const translating = new Map(); // id -> { state: 'running' | 'error', error }
async function startTranslate(article, settings) {
  const mode = modeOf(settings);
  if (mode === 'claude_plan') {
    await q('UPDATE articles SET translate_requested = 1 WHERE id = ?', [article.id]);
    return { state: 'queued' };
  }
  if (translating.get(article.id)?.state === 'running') return translateStatus(article.id);
  translating.set(article.id, { state: 'running' });
  const job = mode === 'free'
    ? translator.translateLong(article.content_original, article.lang, settings.translate_provider)
    : ai.translateArticle(article);
  job
    .then(translation => q('UPDATE articles SET translation_vi = ?, translate_requested = 0 WHERE id = ?', [translation, article.id]))
    .then(() => translating.delete(article.id))
    .catch(e => { console.error(`Dịch bài ${article.id}:`, e.message); translating.set(article.id, { state: 'error', error: e.message }); });
  return translateStatus(article.id);
}
function translateStatus(id) { return translating.get(id) || { state: 'idle' }; }

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

// Chấm điểm: Claude API theo lô; các chế độ khác lọc bằng từ khóa.
async function scoreAll(cands, mode, log) {
  if (mode !== 'api') return cands.map(c => ({ ...c, score: heuristic.scoreCandidate(c) }));
  const scored = [];
  for (let i = 0; i < cands.length; i += 60) {
    const batch = cands.slice(i, i + 60);
    try {
      const res = await ai.scoreCandidates(batch);
      res.forEach(s => { if (batch[s.i]) scored.push({ ...batch[s.i], score: s }); });
    } catch (e) { log(`Lỗi chấm điểm lô ${i}: ${e.message}`); }
  }
  return scored;
}

// Ngưỡng điểm & số bài lấy theo chế độ. Điểm từ khóa có thang thấp hơn điểm AI nên dùng ngưỡng riêng;
// chế độ gói Claude lấy dư 50% vì Claude sẽ loại bớt bài không đủ liên quan.
function selection(mode, settings, need) {
  if (mode === 'free') return { minRel: 20, quota: need };
  if (mode === 'claude_plan') return { minRel: 10, quota: Math.ceil(need * 1.5) };
  return { minRel: parseInt(settings.min_relevance || '45', 10), quota: need };
}

async function runDaily(trigger = 'manual', opts = {}) {
  if (current) throw new Error('Đang có một lượt cập nhật chạy, vui lòng chờ.');
  const ctx = await startRun('daily', trigger);
  current = ctx;
  const stats = { candidates: 0, selected: 0, processed: 0, errors: 0, queued: 0 };
  try {
    const settings = await getSettings();
    const mode = modeOf(settings);
    const briefDate = opts.date || ymd();
    const already = (await q("SELECT COUNT(*) n FROM articles WHERE brief_date = ? AND status NOT IN ('error','skipped')", [briefDate]))[0].n;
    const target = parseInt(opts.limit || settings.articles_per_day || '20', 10);
    const need = Math.max(0, target - already);
    ctx.log(`Chế độ: ${{ api: 'Claude API', claude_plan: 'gói Claude Team/Pro', free: 'miễn phí (dịch máy)' }[mode]}. Ngày ${briefDate}: đã có ${already} tin, cần thêm tối đa ${need}.`);

    if (need > 0) {
      ctx.public.step = 'Thu thập tin từ các nguồn';
      let cands = await collectCandidates(ctx.log);
      stats.candidates = cands.length;
      ctx.log(`Tổng ${cands.length} tin ứng viên mới.`);
      cands = cands.slice(0, 240); // giới hạn chi phí

      ctx.public.step = mode === 'api' ? 'AI sàng lọc mức độ liên quan' : 'Lọc theo từ khóa';
      const scored = await scoreAll(cands, mode, ctx.log);
      const { minRel, quota } = selection(mode, settings, need);
      const picked = scored.filter(c => c.score.score >= minRel).sort((a, b) => b.score.score - a.score.score);
      ctx.log(`${picked.length} tin đạt ngưỡng ${minRel} điểm.`);

      ctx.public.step = 'Lấy nội dung bài';
      const inserted = [];
      for (const c of picked) {
        if (inserted.length >= quota) break;
        const a = await insertCandidate(c, briefDate, c.score, ctx.log);
        if (a) inserted.push(a);
      }
      stats.selected = inserted.length;

      if (mode === 'claude_plan') {
        stats.queued = inserted.length;
        ctx.log(`Đã đưa ${inserted.length} tin vào hàng đợi; Claude (gói Team/Pro) sẽ chấm điểm, viết tin A và tổng hợp ở lượt chạy tiếp theo.`);
      } else {
        ctx.public.step = mode === 'free' ? 'Dịch máy tiêu đề và đoạn mở đầu' : 'Viết tin A, trích số liệu';
        ctx.public.total = inserted.length;
        await pool(inserted, mode === 'free' ? 2 : 3, async (a) => {
          try { await processOne(a, settings); stats.processed++; ctx.log(`✓ ${a.title_original}`); }
          catch (e) { stats.errors++; ctx.log(`✗ ${a.title_original}: ${e.message}`); }
          ctx.public.done++;
        });
      }
    }

    if (mode !== 'claude_plan') {
      // Xử lý lại các bài lỗi/đang treo trong ngày
      const retry = await q("SELECT * FROM articles WHERE brief_date = ? AND status IN ('pending','error') LIMIT 10", [briefDate]);
      if (retry.length) {
        const settings2 = await getSettings();
        await pool(retry, 2, async a => { try { await processOne(a, settings2); stats.processed++; } catch { /* đã ghi lỗi */ } });
      }
      ctx.public.step = 'Tổng hợp tin trong ngày';
      await buildDailyDigest(briefDate, ctx.log, 'short', settings);
    }
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

// Bản ghép không dùng AI được lưu với length_opt = 'list' (chế độ gói Claude: Claude sẽ viết lại ở lượt sau).
async function buildDailyDigest(briefDate, log = console.log, length = 'short', settings) {
  settings = settings || await getSettings();
  const mode = modeOf(settings);
  const arts = await q("SELECT * FROM articles WHERE brief_date = ? AND status = 'done' ORDER BY relevance DESC", [briefDate]);
  if (!arts.length) { log('Không có tin để tổng hợp.'); return null; }
  arts.forEach(a => { a.key_figures = typeof a.key_figures === 'string' ? JSON.parse(a.key_figures || '[]') : (a.key_figures || []); });
  const content = mode === 'api'
    ? await ai.dailyDigest(viDate(briefDate), arts, length)
    : heuristic.compileDigest(`Tổng hợp tin ngày ${viDate(briefDate)}`, arts, mode === 'free'
      ? 'Bản tổng hợp ghép tự động từ các tin A (chế độ miễn phí, không dùng AI).'
      : 'Bản ghép tạm từ các tin A; Claude sẽ viết bản tổng hợp hoàn chỉnh ở lượt xử lý tiếp theo.');
  await q("DELETE FROM digests WHERE kind = 'daily' AND brief_date = ?", [briefDate]);
  await q("INSERT INTO digests (kind, brief_date, length_opt, content_vi, article_ids) VALUES ('daily', ?, ?, ?, ?)",
    [briefDate, mode === 'api' ? length : 'list', content, JSON.stringify(arts.map(a => a.id))]);
  log('Đã tạo bản tổng hợp ngày.');
  return content;
}

module.exports = { runDaily, buildDailyDigest, processOne, startTranslate, translateStatus, status, modeOf };
