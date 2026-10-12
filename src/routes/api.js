const express = require('express');
const config = require('../config');
const { q, getSettings, setSetting } = require('../db');
const auth = require('../auth');
const pipeline = require('../pipeline');
const agent = require('../agent');
const translator = require('../translator');
const { topicSummary } = require('../topics');
const weekly = require('../weekly');
const scheduler = require('../scheduler');
const { ymd } = require('../util');

const r = express.Router();
const jobs = new Map(); // job chạy nền (tổng hợp chủ đề…)

const LIST_COLS = 'id, url, source_name, source_domain, lang, title_original, title_vi, published_at, brief_date, full_text, tin_a_vi, category, relations, relevance, status, error_msg';
const fig = a => { if (a && typeof a.key_figures === 'string') a.key_figures = JSON.parse(a.key_figures || '[]'); return a; };
// Thông báo theo ngôn ngữ giao diện (trình duyệt gửi header X-Lang: en | vi)
const L = (req, vi, en) => (req.get('x-lang') === 'en' ? en : vi);
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });

// ---------- Đăng nhập ----------
r.post('/login', (req, res) => {
  if (!config.appPassword || auth.safeEq(req.body.password || '', config.appPassword)) {
    res.cookie(auth.COOKIE, auth.makeToken(), { httpOnly: true, sameSite: 'lax', secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: 30 * 24 * 3600 * 1000 });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: L(req, 'Sai mật khẩu', 'Wrong password') });
});
r.post('/logout', (req, res) => { res.clearCookie(auth.COOKIE); res.json({ ok: true }); });
// Chế độ công khai (mặc định, Cài đặt → "Cho phép xem không cần đăng nhập"): khách chỉ được các yêu cầu GET
// đọc dữ liệu dưới đây; mọi thao tác tốn phí hoặc thay đổi dữ liệu (cập nhật, dịch, tổng hợp, cài đặt, xóa) vẫn cần đăng nhập.
const PUBLIC_GET = [/^\/articles$/, /^\/articles\/\d+$/, /^\/articles\/\d+\/translate$/, /^\/calendar$/, /^\/digest\/daily$/, /^\/digests$/, /^\/digests\/\d+$/, /^\/run\/status$/];
const isAdmin = req => !config.appPassword || auth.verify(req.cookies[auth.COOKIE]);
// Lỗi CSDL không được làm trang trắng: coi như công khai (mặc định) và 8 giờ.
const viewSettings = () => getSettings().then(s => ({ publicAccess: s.public_access !== '0', dailyHour: parseInt(s.daily_hour || '8', 10) }))
  .catch(() => ({ publicAccess: true, dailyHour: 8 }));

r.get('/me', wrap(async (req, res) => {
  const admin = isAdmin(req);
  const { publicAccess, dailyHour } = await viewSettings();
  res.json({ loggedIn: admin, admin, publicAccess, today: ymd(), dailyHour });
}));

// ---------- Cron dự phòng (Hostinger Cron Jobs gọi URL này) ----------
r.get('/cron/tick', wrap(async (req, res) => {
  if (!config.cronKey || !auth.safeEq(req.query.key || '', config.cronKey)) return res.status(401).json({ error: 'Sai khóa' });
  scheduler.tick('cron');
  res.json({ ok: true, at: new Date().toISOString() });
}));

// ---------- API chỉ-đọc cho Claude / công cụ ngoài ----------
const v1 = express.Router();
v1.use(auth.requireReadonlyToken);
v1.get('/schema', (req, res) => res.json({
  tables: {
    articles: 'id, url, source_name, lang(en|no), title_original, title_vi, published_at, brief_date, content_original, full_text, translation_vi, tin_a_vi, key_figures(JSON: figure, context, source, type), category(chinh-tri|kinh-te|van-hoa-xa-hoi), relations, relevance(0-100)',
    digests: 'id, kind(daily|topic|weekly), brief_date, topic, date_from, date_to, content_vi, article_ids',
  },
  endpoints: ['/api/v1/articles?from=YYYY-MM-DD&to=YYYY-MM-DD&q=&category=&limit=&offset=&full=1', '/api/v1/articles/:id', '/api/v1/digests?kind=&from=&to=', '/api/v1/figures?from=&to=&q=', '/api/v1/stats'],
}));
v1.get('/articles', wrap(async (req, res) => {
  const { sql, params } = buildArticleQuery(req.query, req.query.full === '1' ? '*' : LIST_COLS + ', key_figures');
  res.json((await q(sql, params)).map(fig));
}));
v1.get('/articles/:id', wrap(async (req, res) => { const a = (await q('SELECT * FROM articles WHERE id = ?', [req.params.id]))[0]; a ? res.json(fig(a)) : res.status(404).json({ error: 'Không có' }); }));
v1.get('/digests', wrap(async (req, res) => {
  const w = []; const p = [];
  if (req.query.kind) { w.push('kind = ?'); p.push(req.query.kind); }
  if (req.query.from) { w.push('COALESCE(brief_date, date_to) >= ?'); p.push(req.query.from); }
  if (req.query.to) { w.push('COALESCE(brief_date, date_from) <= ?'); p.push(req.query.to); }
  res.json(await q(`SELECT * FROM digests ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`, p));
}));
v1.get('/figures', wrap(async (req, res) => {
  const { sql, params } = buildArticleQuery({ ...req.query, limit: 500 }, 'id, url, source_name, brief_date, title_vi, title_original, key_figures');
  const out = [];
  (await q(sql, params)).map(fig).forEach(a => (a.key_figures || []).forEach(f => out.push({ article_id: a.id, date: a.brief_date, article: a.title_vi || a.title_original, outlet: a.source_name, url: a.url, ...f })));
  res.json(out);
}));
v1.get('/stats', wrap(async (req, res) => res.json({
  articles: (await q("SELECT COUNT(*) n, MIN(brief_date) first_date, MAX(brief_date) last_date FROM articles WHERE status='done'"))[0],
  by_category: await q("SELECT category, COUNT(*) n FROM articles WHERE status='done' GROUP BY category"),
  by_source: await q("SELECT source_name, COUNT(*) n FROM articles WHERE status='done' GROUP BY source_name ORDER BY n DESC LIMIT 50"),
})));
r.use('/v1', v1);

// ---------- Chế độ gói Claude Team/Pro: tác vụ Claude Code lấy việc & gửi kết quả ----------
const agentApi = express.Router();
agentApi.use(auth.requireAgentToken);
agentApi.get('/jobs', wrap(async (req, res) => res.json(await agent.getJobs({ limit: req.query.limit }))));
agentApi.post('/results', wrap(async (req, res) => res.json(await agent.applyResults(req.body))));
r.use('/agent', agentApi);

// ---------- Từ đây trở xuống: quản trị cần đăng nhập; khách xem được phần đọc nếu bật chế độ công khai ----------
r.use((req, res, next) => {
  if (isAdmin(req)) return next();
  if (req.method !== 'GET' || !PUBLIC_GET.some(p => p.test(req.path))) return res.status(401).json({ error: L(req, 'Chưa đăng nhập', 'Not signed in') });
  viewSettings().then(v => (v.publicAccess ? next() : res.status(401).json({ error: L(req, 'Chưa đăng nhập', 'Not signed in') })));
});

function buildArticleQuery(qs, cols = LIST_COLS) {
  const w = []; const p = [];
  if (qs.date) { w.push('brief_date = ?'); p.push(qs.date); }
  if (qs.from) { w.push('brief_date >= ?'); p.push(qs.from); }
  if (qs.to) { w.push('brief_date <= ?'); p.push(qs.to); }
  if (qs.category) { w.push('category = ?'); p.push(qs.category); }
  if (qs.status) { w.push('status = ?'); p.push(qs.status); } else w.push("status <> 'skipped'"); // bài Claude đã loại
  if (qs.q) {
    w.push('(MATCH(title_original, title_vi, tin_a_vi, translation_vi, content_original) AGAINST (? IN BOOLEAN MODE) OR title_original LIKE ? OR title_vi LIKE ? OR tin_a_vi LIKE ?)');
    const like = `%${qs.q}%`; const ft = qs.q.replace(/[+\-<>()~*"@]/g, ' ').trim() || qs.q; p.push(ft, like, like, like);
  }
  const limit = Math.min(parseInt(qs.limit || '100', 10), 500);
  const offset = parseInt(qs.offset || '0', 10);
  return { sql: `SELECT ${cols} FROM articles ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY brief_date DESC, relevance DESC LIMIT ? OFFSET ?`, params: [...p, limit, offset] };
}

r.get('/articles', wrap(async (req, res) => {
  const { sql, params } = buildArticleQuery(req.query);
  res.json(await q(sql, params));
}));
r.get('/articles/:id', wrap(async (req, res) => {
  const a = (await q('SELECT * FROM articles WHERE id = ?', [req.params.id]))[0];
  a ? res.json(fig(a)) : res.status(404).json({ error: L(req, 'Không tìm thấy', 'Not found') });
}));
r.post('/articles/:id/reprocess', wrap(async (req, res) => {
  const a = (await q('SELECT * FROM articles WHERE id = ?', [req.params.id]))[0];
  if (!a) return res.status(404).json({ error: L(req, 'Không tìm thấy', 'Not found') });
  await pipeline.processOne(a, await getSettings());
  res.json(fig((await q('SELECT * FROM articles WHERE id = ?', [a.id]))[0]));
}));
r.post('/articles/:id/translate', wrap(async (req, res) => {
  const a = (await q('SELECT * FROM articles WHERE id = ?', [req.params.id]))[0];
  if (!a) return res.status(404).json({ error: L(req, 'Không tìm thấy', 'Not found') });
  res.json(await pipeline.startTranslate(a, await getSettings()));
}));
r.get('/articles/:id/translate', (req, res) => res.json(pipeline.translateStatus(Number(req.params.id))));
r.delete('/articles/:id', wrap(async (req, res) => { await q('DELETE FROM articles WHERE id = ?', [req.params.id]); res.json({ ok: true }); }));

r.get('/calendar', wrap(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : ymd().slice(0, 7);
  res.json(await q("SELECT brief_date d, COUNT(*) n FROM articles WHERE status='done' AND brief_date LIKE ? GROUP BY brief_date", [`${month}-%`]));
}));

// ---------- Tổng hợp ngày ----------
r.get('/digest/daily', wrap(async (req, res) => {
  const d = (await q("SELECT * FROM digests WHERE kind='daily' AND brief_date = ? ORDER BY id DESC LIMIT 1", [req.query.date || ymd()]))[0];
  res.json(d || null);
}));
r.post('/digest/daily', wrap(async (req, res) => {
  const date = req.body.date || ymd();
  const content = await pipeline.buildDailyDigest(date, console.log, req.body.length || 'short');
  res.json({ brief_date: date, content_vi: content });
}));

// ---------- Chạy cập nhật ----------
r.post('/run', wrap(async (req, res) => {
  if (pipeline.status().running) return res.status(409).json({ error: L(req, 'Đang cập nhật…', 'An update is already running…'), status: pipeline.status() });
  pipeline.runDaily('manual', { limit: req.body.limit, date: req.body.date }).catch(e => console.error('Manual run:', e.message));
  setTimeout(() => res.json({ ok: true, status: pipeline.status() }), 300);
}));
r.get('/run/status', (req, res) => res.json(pipeline.status()));
r.get('/runs', wrap(async (req, res) => res.json(await q('SELECT id, kind, trigger_by, status, started_at, finished_at, stats FROM runs ORDER BY id DESC LIMIT 30'))));
r.get('/runs/:id', wrap(async (req, res) => res.json((await q('SELECT * FROM runs WHERE id = ?', [req.params.id]))[0] || null)));

// ---------- Tổng hợp theo chủ đề (chạy nền) ----------
r.post('/topic', wrap(async (req, res) => {
  const { topic, days, length, scan } = req.body;
  if (!topic || !topic.trim()) return res.status(400).json({ error: L(req, 'Nhập chủ đề', 'Enter a topic') });
  const id = Date.now().toString(36);
  jobs.set(id, { state: 'running' });
  topicSummary({ topic: topic.trim(), days: days || 7, length: length || 'medium', scan: !!scan })
    .then(result => jobs.set(id, { state: 'done', result }))
    .catch(e => jobs.set(id, { state: 'error', error: e.message }));
  res.json({ jobId: id });
}));
r.get('/jobs/:id', (req, res) => res.json(jobs.get(req.params.id) || { state: 'unknown' }));
r.get('/digests', wrap(async (req, res) => res.json(await q('SELECT id, kind, brief_date, topic, date_from, date_to, length_opt, created_at, LEFT(content_vi, 300) preview FROM digests WHERE kind = ? ORDER BY id DESC LIMIT 100', [req.query.kind || 'topic']))));
r.get('/digests/:id', wrap(async (req, res) => res.json((await q('SELECT * FROM digests WHERE id = ?', [req.params.id]))[0] || null)));

// ---------- Báo cáo tuần ----------
r.get('/weekly/docx', wrap(async (req, res) => {
  const range = req.query.from && req.query.to ? { from: req.query.from, to: req.query.to } : weekly.lastWeekRange();
  const rep = await weekly.buildWeeklyDocx(range.from, range.to);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${rep.filename}"`);
  res.send(rep.buffer);
}));
r.post('/weekly/send', wrap(async (req, res) => {
  const range = req.body.from && req.body.to ? { from: req.body.from, to: req.body.to } : undefined;
  res.json(await weekly.sendWeekly(range));
}));

// ---------- Cài đặt & nguồn ----------
const EDITABLE = ['articles_per_day', 'daily_hour', 'min_relevance', 'weekly_enabled', 'weekly_to', 'tin_a_samples', 'ai_mode', 'public_access'];
const ALLOWED = { ai_mode: ['api', 'claude_plan', 'free'], public_access: ['0', '1'] };
// Kèm cho giao diện biết khóa nào đã đặt trong biến môi trường (không trả giá trị khóa) và hạn mức Google đã dùng.
const withEnv = async s => ({
  ...s,
  env: { appPassword: !!config.appPassword, anthropic: !!config.anthropic.key, google: !!config.googleTranslateKey, agent: !!config.agentToken },
  translate_usage: await translator.usage().catch(() => null),
});
r.get('/settings', wrap(async (req, res) => res.json(await withEnv(await getSettings()))));
r.put('/settings', wrap(async (req, res) => {
  for (const k of EDITABLE) {
    if (req.body[k] === undefined) continue;
    if (ALLOWED[k] && !ALLOWED[k].includes(req.body[k])) return res.status(400).json({ error: L(req, `Giá trị không hợp lệ cho ${k}`, `Invalid value for ${k}`) });
    await setSetting(k, req.body[k]);
  }
  res.json(await withEnv(await getSettings()));
}));
r.get('/sources', wrap(async (req, res) => res.json(await q('SELECT * FROM sources ORDER BY region, name'))));
r.post('/sources', wrap(async (req, res) => {
  const { name, url, lang, region, paywall, filter_keywords } = req.body;
  if (!name || !/^https?:\/\//.test(url || '')) return res.status(400).json({ error: L(req, 'Cần tên và URL RSS hợp lệ', 'A name and a valid RSS URL are required') });
  await q('INSERT INTO sources (name, url, lang, region, paywall, filter_keywords) VALUES (?,?,?,?,?,?)', [name, url, lang || 'en', region || 'intl', paywall ? 1 : 0, filter_keywords === false ? 0 : 1]);
  res.json({ ok: true });
}));
r.put('/sources/:id', wrap(async (req, res) => {
  const f = []; const p = [];
  ['enabled', 'paywall', 'filter_keywords'].forEach(k => { if (req.body[k] !== undefined) { f.push(`${k} = ?`); p.push(req.body[k] ? 1 : 0); } });
  if (f.length) await q(`UPDATE sources SET ${f.join(', ')} WHERE id = ?`, [...p, req.params.id]);
  res.json({ ok: true });
}));
r.delete('/sources/:id', wrap(async (req, res) => { await q('DELETE FROM sources WHERE id = ?', [req.params.id]); res.json({ ok: true }); }));

module.exports = r;
