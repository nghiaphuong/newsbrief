/* NewsBrief – giao diện */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CAT = { 'chinh-tri': 'Chính trị', 'kinh-te': 'Kinh tế', 'van-hoa-xa-hoi': 'Văn hóa – XH' };
const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const isMobile = () => matchMedia('(max-width: 820px)').matches;

const state = { today: null, date: null, cat: '', dayItems: [], calMonth: null, range: 'week', selected: null, runTimer: null };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error('Cần đăng nhập'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vi = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Văn bản AI (**đậm**, # tiêu đề, - gạch đầu dòng) → HTML an toàn
function md(text) {
  const lines = String(text || '').split(/\n/);
  let html = ''; let inList = false;
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
    let inner = esc(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    if (/^#{1,4}\s/.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += `<h3>${inner.replace(/^#{1,4}\s/, '')}</h3>`; continue; }
    if (/^[-*•]\s/.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inner.replace(/^[-*•]\s/, '')}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p>${inner}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}
const plain = t => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s/gm, '');

async function copy(text, label) {
  try { await navigator.clipboard.writeText(plain(text)); }
  catch { const ta = document.createElement('textarea'); ta.value = plain(text); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(`Đã sao chép ${label}`);
}

// ---------- Đăng nhập ----------
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/login', { method: 'POST', body: { password: $('#pw').value } }); $('#login').hidden = true; boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logoutBtn').onclick = async () => { await api('/logout', { method: 'POST' }); showLogin(); };

// ---------- Điều hướng ----------
function go(view) {
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + view);
  $$('[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  if (view === 'topic') loadTopicHistory();
  if (view === 'settings') loadSettings();
  if (view === 'search' && !$('#searchList').children.length) doSearch();
  location.hash = view;
  window.scrollTo(0, 0);
}
$$('[data-view]').forEach(a => a.addEventListener('click', () => go(a.dataset.view)));

// ---------- Lịch ----------
async function renderCal() {
  const month = state.calMonth;
  const counts = {};
  try { (await api('/calendar?month=' + month)).forEach(r => counts[r.d] = r.n); } catch { }
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  let html = `<div class="cal-head"><button aria-label="Tháng trước" data-m="-1">‹</button><span>Tháng ${m}/${y}</span><button aria-label="Tháng sau" data-m="1">›</button></div><div class="cal-grid">`;
  html += ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => `<span class="wd">${d}</span>`).join('');
  html += '<span></span>'.repeat(offset);
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    const cls = [counts[ds] ? 'has' : '', ds === state.date ? 'sel' : '', ds === state.today ? 'today' : ''].join(' ');
    html += `<button class="${cls}" data-d="${ds}" ${ds > state.today ? 'disabled' : ''} title="${counts[ds] ? counts[ds] + ' tin' : ''}">${d}</button>`;
  }
  $('#cal').innerHTML = html + '</div>';
  $$('#cal [data-d]').forEach(b => b.onclick = () => { go('day'); setDate(b.dataset.d); });
  $$('#cal [data-m]').forEach(b => b.onclick = () => { const dt = new Date(Date.UTC(y, m - 1 + Number(b.dataset.m), 1)); state.calMonth = dt.toISOString().slice(0, 7); renderCal(); });
}

// ---------- Bản tin ngày ----------
async function setDate(d) {
  state.date = d; $('#datePick').value = d;
  const dt = new Date(d + 'T12:00:00Z');
  $('#dayNum').textContent = `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  $('#dayWeek').textContent = `${WD[dt.getUTCDay()]}, ${vi(d)}${d === state.today ? ' · hôm nay' : ''}`;
  if (state.calMonth !== d.slice(0, 7)) state.calMonth = d.slice(0, 7);
  renderCal();
  await Promise.all([loadDay(), loadDigest()]);
}

async function loadDay() {
  const list = $('#dayList');
  list.innerHTML = '<li class="empty">Đang tải…</li>';
  state.dayItems = await api('/articles?date=' + state.date);
  renderList(list, state.dayItems.filter(a => !state.cat || a.category === state.cat), '#reader');
  const done = state.dayItems.filter(a => a.status === 'done').length;
  $('#dayCount').textContent = state.dayItems.length ? `${done} tin đã xử lý${state.dayItems.length > done ? ` · ${state.dayItems.length - done} đang chờ/lỗi` : ''}` : 'Chưa có tin';
  if (!isMobile() && state.dayItems.length && !state.selected) openArticle(state.dayItems[0].id, '#reader');
  if (!state.dayItems.length) $('#reader').innerHTML = '';
}

function renderList(el, items, readerSel) {
  if (!items.length) {
    el.innerHTML = readerSel === '#reader'
      ? `<li class="empty"><strong>Chưa có tin cho ngày này</strong>Bản tin tự động chạy lúc 8 giờ sáng. Bấm "Cập nhật ngay" để lấy tin ngay.</li>`
      : `<li class="empty"><strong>Không tìm thấy tin phù hợp</strong>Thử từ khóa khác hoặc mở rộng khoảng thời gian.</li>`;
    return;
  }
  el.innerHTML = items.map(a => {
    const vn = /vi[eệ]t nam|vietnam|asean/i.test(a.relations || '') ? 'vn' : '';
    return `<li class="item ${vn} ${state.selected === a.id ? 'sel' : ''}" data-id="${a.id}" tabindex="0">
      <h4>${esc(a.title_vi || a.title_original)}</h4>
      ${a.title_vi ? `<p class="orig">${esc(a.title_original)}</p>` : ''}
      <div class="meta"><span class="cat">${CAT[a.category] || ''}</span><span>${esc(a.source_name)}</span><span>${a.lang === 'no' ? 'Tiếng Na Uy' : 'Tiếng Anh'}</span>
      ${readerSel === '#reader2' ? `<span>${vi(a.brief_date)}</span>` : ''}
      ${a.full_text ? '' : '<span class="badge">phần công khai</span>'}
      ${a.status !== 'done' ? `<span class="badge warn">${a.status === 'error' ? 'lỗi xử lý' : 'đang xử lý'}</span>` : ''}</div>
    </li>`;
  }).join('');
  el.querySelectorAll('.item').forEach(li => {
    const open = () => openArticle(Number(li.dataset.id), readerSel);
    li.onclick = open; li.onkeydown = e => { if (e.key === 'Enter') open(); };
  });
}

async function openArticle(id, readerSel) {
  state.selected = id;
  $$('.item').forEach(li => li.classList.toggle('sel', Number(li.dataset.id) === id));
  const pane = $(readerSel);
  pane.innerHTML = '<div class="reader"><p class="empty">Đang tải…</p></div>';
  if (isMobile()) pane.classList.add('open');
  const a = await api('/articles/' + id);
  const figs = a.key_figures || [];
  pane.innerHTML = `<article class="reader">
    <button class="back" data-back>‹ Danh sách</button>
    <div class="meta"><span class="cat">${CAT[a.category] || ''}</span>${a.relations ? `<span>${esc(a.relations)}</span>` : ''}</div>
    <h1>${esc(a.title_vi || a.title_original)}</h1>
    ${a.title_vi ? `<p class="orig-title">${esc(a.title_original)}</p>` : ''}
    <div class="src-line"><span>${esc(a.source_name)}</span><span>${a.published_at ? vi(a.published_at) + ' ' + String(a.published_at).slice(11, 16) : vi(a.brief_date)}</span>
      <a href="${esc(a.url)}" target="_blank" rel="noopener">Mở bài gốc ↗</a>
      ${a.full_text ? '' : '<span class="badge">Chỉ có phần công khai của bài</span>'}</div>
    ${a.status === 'error' ? `<p class="err">Lỗi xử lý: ${esc(a.error_msg)}</p>` : ''}
    ${a.status === 'pending' ? '<p class="empty">Bài đang chờ xử lý. Ở chế độ gói Claude Team/Pro, tin A và số liệu sẽ có sau lượt chạy Claude tiếp theo.</p>' : ''}
    <div class="tabs" role="tablist">
      <button class="active" data-tab="tina">Tin A</button>
      <button data-tab="trans">Bản dịch</button>
      <button data-tab="orig">Nguyên văn</button>
      <button data-tab="figs">Số liệu (${figs.length})</button>
    </div>
    <div data-panel="tina"><div class="tab-tools"><button class="btn small" data-copy="tina">Sao chép tin A</button></div><div class="prose tin-a">${md(a.tin_a_vi) || '<p>Chưa có.</p>'}</div></div>
    <div data-panel="trans" hidden>${a.translation_vi
      ? `<div class="tab-tools"><button class="btn small" data-copy="trans">Sao chép bản dịch</button><button class="btn ghost small" data-translate>Dịch lại</button></div><div class="prose">${md(a.translation_vi)}</div>`
      : a.translate_requested
        ? '<p class="empty">Đã yêu cầu dịch toàn văn. Bản dịch sẽ có sau lượt chạy Claude (gói Team/Pro) tiếp theo.</p>'
        : `<p class="empty">Bài này chưa được dịch toàn văn (chỉ dịch khi cần để tiết kiệm chi phí).</p><div class="tab-tools"><button class="btn small" data-translate>Dịch toàn văn</button></div>`}</div>
    <div data-panel="orig" hidden><div class="tab-tools"><button class="btn small" data-copy="orig">Sao chép nguyên văn</button></div><div class="prose" lang="${a.lang === 'no' ? 'nb' : 'en'}">${md(a.content_original)}</div></div>
    <div data-panel="figs" hidden><div class="tab-tools"><button class="btn small" data-copy="figs">Sao chép số liệu</button></div>
      ${figs.length ? `<ul class="figs">${figs.map(f => `<li><span class="v">${esc(f.figure)}</span><span class="c">${esc(f.context)}</span><span class="s">Nguồn: ${esc(f.source)}${f.type ? ' · ' + esc(f.type) : ''}</span></li>`).join('')}</ul>` : '<p class="empty">Bài không có số liệu định lượng.</p>'}</div>
    <p class="reason">Mức liên quan ${a.relevance ?? '–'}/100${a.relevance_reason ? ' · ' + esc(a.relevance_reason) : ''}
      · <button class="btn ghost small" data-reprocess>Tóm tắt lại</button></p>
  </article>`;
  const texts = {
    tina: a.tin_a_vi, trans: `${a.title_vi || ''}\n\n${a.translation_vi || ''}\n\nNguồn: ${a.source_name} – ${a.url}`, orig: `${a.title_original}\n\n${a.content_original || ''}\n\n${a.url}`,
    figs: figs.map(f => `- ${f.figure}: ${f.context} (Nguồn: ${f.source}${f.type ? '; ' + f.type : ''})`).join('\n'),
  };
  const labels = { tina: 'tin A', trans: 'bản dịch', orig: 'nguyên văn', figs: 'số liệu' };
  pane.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    pane.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
    pane.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
  });
  pane.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(texts[b.dataset.copy], labels[b.dataset.copy]));
  pane.querySelector('[data-back]').onclick = () => pane.classList.remove('open');
  pane.querySelector('[data-reprocess]').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Đang xử lý… (1–2 phút)';
    try {
      const r = await api(`/articles/${id}/reprocess`, { method: 'POST' });
      toast(r.status === 'pending' ? 'Đã đưa vào hàng đợi cho Claude (gói Team/Pro)' : 'Đã xử lý lại');
      openArticle(id, readerSel);
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };
  const trBtn = pane.querySelector('[data-translate]');
  if (trBtn) trBtn.onclick = async e => {
    const label = e.target.textContent;
    e.target.disabled = true; e.target.textContent = 'Đang dịch… (1–3 phút)';
    try {
      let st = await api(`/articles/${id}/translate`, { method: 'POST' });
      while (st.state === 'running') {
        await new Promise(r => setTimeout(r, 5000));
        st = await api(`/articles/${id}/translate`);
      }
      if (st.state === 'error') throw new Error('Lỗi dịch: ' + st.error);
      toast(st.state === 'queued' ? 'Đã đưa vào hàng đợi; Claude sẽ dịch ở lượt chạy tiếp theo' : 'Đã dịch toàn văn');
      if (state.selected === id) { await openArticle(id, readerSel); pane.querySelector('[data-tab="trans"]').click(); }
    } catch (err) { toast(err.message); e.target.disabled = false; e.target.textContent = label; }
  };
  pane.scrollTop = 0;
}

async function loadDigest(open) {
  const d = await api('/digest/daily?date=' + state.date).catch(() => null);
  $('#digestBox').hidden = !d && !state.dayItems.length;
  $('#digestBody').innerHTML = d ? md(d.content_vi) : '<p>Chưa có bản tổng hợp. Bấm "Tạo lại" để tạo.</p>';
  $('#digestMeta').textContent = d ? `cập nhật ${String(d.created_at).slice(11, 16)}` : '';
  $('#digestBox')._text = d?.content_vi || '';
  if (open) $('#digestBox').open = true;
}
$('#digestCopy').onclick = () => copy($('#digestBox')._text, 'bản tổng hợp');
$('#digestRegen').onclick = async e => {
  e.target.disabled = true; e.target.textContent = 'Đang tạo…';
  try { await api('/digest/daily', { method: 'POST', body: { date: state.date, length: $('#digestLen').value } }); await loadDigest(true); toast('Đã tạo bản tổng hợp'); }
  catch (err) { toast(err.message); }
  e.target.disabled = false; e.target.textContent = 'Tạo lại';
};

$('#datePick').onchange = e => e.target.value && setDate(e.target.value);
$$('#dayFilters .chip').forEach(c => c.onclick = () => {
  $$('#dayFilters .chip').forEach(x => x.classList.toggle('active', x === c));
  state.cat = c.dataset.cat;
  renderList($('#dayList'), state.dayItems.filter(a => !state.cat || a.category === state.cat), '#reader');
});

// Cập nhật ngay + theo dõi tiến độ
$('#runBtn').onclick = async () => {
  try { await api('/run', { method: 'POST', body: { date: state.date === state.today ? undefined : state.date } }); toast('Đã bắt đầu cập nhật'); pollRun(); }
  catch (err) { toast(err.message); pollRun(); }
};
async function pollRun() {
  clearTimeout(state.runTimer);
  const s = await api('/run/status').catch(() => ({ running: false }));
  $('#progress').hidden = !s.running; $('#runBtn').disabled = !!s.running;
  if (s.running) {
    $('#progText').textContent = `${s.step}${s.total ? ` · ${s.done}/${s.total} tin` : ''}`;
    $('#progBar').style.width = s.total ? `${15 + 85 * s.done / s.total}%` : '10%';
    state.runTimer = setTimeout(pollRun, 4000);
    if (s.total && s.done && s.done !== state._lastDone) { state._lastDone = s.done; loadDay(); }
  } else if (state._wasRunning) { toast('Cập nhật xong'); loadDay(); loadDigest(); renderCal(); }
  state._wasRunning = s.running;
}

// ---------- Tổng hợp chủ đề ----------
$('#topicForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#tBtn'); btn.disabled = true; btn.textContent = 'Đang tổng hợp…';
  const box = $('#topicResult'); box.hidden = false;
  box.innerHTML = `<p class="empty">Đang tìm và tổng hợp tin${$('#tScan').checked ? ', kèm quét nguồn mới (có thể mất vài phút)' : ''}…</p>`;
  try {
    const { jobId } = await api('/topic', { method: 'POST', body: { topic: $('#tTopic').value, days: $('#tDays').value, length: $('#tLen').value, scan: $('#tScan').checked } });
    let job;
    do { await new Promise(r => setTimeout(r, 3000)); job = await api('/jobs/' + jobId); } while (job.state === 'running');
    if (job.state === 'error') throw new Error(job.error);
    showTopic({ ...job.result, topic: $('#tTopic').value });
    loadTopicHistory();
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  btn.disabled = false; btn.textContent = 'Tổng hợp';
});

function showTopic(r) {
  const box = $('#topicResult'); box.hidden = false;
  box.innerHTML = `<div class="head"><span>${esc(r.topic || '')} · ${vi(r.from || r.date_from)} – ${vi(r.to || r.date_to)}</span><button class="btn small" id="tCopy">Sao chép</button></div>
    <div class="prose">${md(r.content || r.content_vi)}</div>
    ${r.articles?.length ? `<ol class="refs">${r.articles.map(a => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a> — ${esc(a.source)}, ${vi(a.date)}</li>`).join('')}</ol>` : ''}`;
  $('#tCopy').onclick = () => copy((r.content || r.content_vi) + (r.articles?.length ? '\n\nNguồn:\n' + r.articles.map((a, i) => `[${i + 1}] ${a.title} – ${a.source}, ${vi(a.date)}: ${a.url}`).join('\n') : ''), 'bản tổng hợp');
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadTopicHistory() {
  const rows = await api('/digests?kind=topic').catch(() => []);
  $('#topicHistory').innerHTML = rows.length ? rows.map(d => `<li data-id="${d.id}"><span>${esc(d.topic)}</span><small>${vi(d.date_from)} – ${vi(d.date_to)}</small></li>`).join('') : '<li class="empty">Chưa có bản tổng hợp nào.</li>';
  $$('#topicHistory [data-id]').forEach(li => li.onclick = async () => {
    const d = await api('/digests/' + li.dataset.id);
    let articles = [];
    const ids = typeof d.article_ids === 'string' ? JSON.parse(d.article_ids || '[]') : (d.article_ids || []);
    if (ids.length) articles = (await Promise.all(ids.slice(0, 40).map(id => api('/articles/' + id).catch(() => null)))).filter(Boolean).map(a => ({ title: a.title_vi || a.title_original, source: a.source_name, date: a.brief_date, url: a.url }));
    showTopic({ ...d, articles });
  });
}

// ---------- Lưu trữ & tìm kiếm ----------
$$('#sRange button').forEach(b => b.onclick = () => {
  $$('#sRange button').forEach(x => x.classList.toggle('active', x === b));
  state.range = b.dataset.r; $('#sCustom').hidden = state.range !== 'custom';
  if (state.range !== 'custom') doSearch();
});
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); doSearch(); });
async function doSearch() {
  const p = new URLSearchParams();
  const t = state.today;
  if (state.range === 'day') p.set('date', t);
  if (state.range === 'week') p.set('from', addDays(t, -6));
  if (state.range === 'month') p.set('from', addDays(t, -29));
  if (state.range === 'custom') { if ($('#sFrom').value) p.set('from', $('#sFrom').value); if ($('#sTo').value) p.set('to', $('#sTo').value); }
  if ($('#sQ').value.trim()) p.set('q', $('#sQ').value.trim());
  if ($('#sCat').value) p.set('category', $('#sCat').value);
  p.set('limit', '300');
  const rows = await api('/articles?' + p).catch(err => { toast(err.message); return []; });
  $('#sCount').textContent = `${rows.length} tin`;
  renderList($('#searchList'), rows, '#reader2');
}

// ---------- Cài đặt ----------
async function loadSettings() {
  const s = await api('/settings');
  state.mode = s.ai_mode || 'api';
  $$('#stMode input[name="ai_mode"]').forEach(r => r.checked = r.value === state.mode);
  $('#stProvider').value = s.translate_provider || 'deepl';
  state.env = s.env || {};
  showEnvHints();
  $('#stN').value = s.articles_per_day; $('#stHour').value = s.daily_hour; $('#stMin').value = s.min_relevance;
  $('#stMail').value = s.weekly_to; $('#stWeekly').checked = s.weekly_enabled === '1'; $('#stSamples').value = s.tin_a_samples || '';
  const d = new Date(state.today + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7;
  if (!$('#wFrom').value) { $('#wFrom').value = addDays(state.today, -dow - 7); $('#wTo').value = addDays(state.today, -dow - 1); }
  loadSources(); loadRuns();
}
// Cho biết biến môi trường cần cho từng chế độ đã được đặt trên server chưa.
function showEnvHints() {
  const env = state.env || {};
  const hint = (el, ok, okText, missText) => { el.className = ok ? 'ok' : 'missing'; el.textContent = ok ? okText : missText; };
  hint($('#stMode [data-env="anthropic"]'), env.anthropic, '✓ Đã có ANTHROPIC_API_KEY', '⚠ Chưa đặt ANTHROPIC_API_KEY trên server');
  hint($('#stMode [data-env="agent"]'), env.agent, '✓ Đã có AGENT_API_TOKEN', '⚠ Chưa đặt AGENT_API_TOKEN trên server');
  const p = $('#stProvider').value;
  hint($('#stMode [data-env="translate"]'), p === 'google' ? env.google : env.deepl,
    p === 'google' ? '✓ Đã có GOOGLE_TRANSLATE_API_KEY' : '✓ Đã có DEEPL_API_KEY',
    p === 'google' ? '⚠ Chưa đặt GOOGLE_TRANSLATE_API_KEY trên server' : '⚠ Chưa đặt DEEPL_API_KEY trên server');
}
$('#stProvider').onchange = showEnvHints;

$('#settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = $('#stMode input[name="ai_mode"]:checked')?.value || 'api';
  await api('/settings', { method: 'PUT', body: { ai_mode: mode, translate_provider: $('#stProvider').value, articles_per_day: $('#stN').value, daily_hour: $('#stHour').value, min_relevance: $('#stMin').value, weekly_to: $('#stMail').value, weekly_enabled: $('#stWeekly').checked ? '1' : '0', tin_a_samples: $('#stSamples').value } });
  state.mode = mode;
  $('#stSaved').textContent = 'Đã lưu.'; setTimeout(() => $('#stSaved').textContent = '', 2500);
});
$('#wDownload').onclick = () => { location.href = `/api/weekly/docx?from=${$('#wFrom').value}&to=${$('#wTo').value}`; };
$('#wSend').onclick = async e => {
  e.target.disabled = true; $('#wMsg').textContent = 'Đang tạo file và gửi…';
  try { const r = await api('/weekly/send', { method: 'POST', body: { from: $('#wFrom').value, to: $('#wTo').value } }); $('#wMsg').textContent = `Đã gửi ${r.count} tin tới ${r.sentTo}.`; }
  catch (err) { $('#wMsg').textContent = err.message; }
  e.target.disabled = false;
};
async function loadSources() {
  const rows = await api('/sources');
  $('#srcTable').innerHTML = `<tr><th>Bật</th><th>Nguồn</th><th>Ngôn ngữ</th><th>Thu phí</th><th>Lọc từ khóa</th><th>Tình trạng</th><th></th></tr>` + rows.map(s => `
    <tr data-id="${s.id}"><td><input type="checkbox" data-f="enabled" ${s.enabled ? 'checked' : ''}></td>
    <td><strong>${esc(s.name)}</strong><br><small>${esc(s.url)}</small></td><td>${s.lang === 'no' ? 'Na Uy' : 'Anh'}</td>
    <td><input type="checkbox" data-f="paywall" ${s.paywall ? 'checked' : ''}></td><td><input type="checkbox" data-f="filter_keywords" ${s.filter_keywords ? 'checked' : ''}></td>
    <td class="${s.last_error ? 'err' : ''}">${s.last_error ? esc(s.last_error) : (s.last_ok_at ? 'OK ' + vi(s.last_ok_at) : '–')}</td>
    <td><button class="btn ghost small" data-del>Xóa</button></td></tr>`).join('');
  $$('#srcTable input[data-f]').forEach(cb => cb.onchange = () => api('/sources/' + cb.closest('tr').dataset.id, { method: 'PUT', body: { [cb.dataset.f]: cb.checked } }).then(() => toast('Đã cập nhật nguồn')));
  $$('#srcTable [data-del]').forEach(b => b.onclick = async () => { if (confirm('Xóa nguồn này?')) { await api('/sources/' + b.closest('tr').dataset.id, { method: 'DELETE' }); loadSources(); } });
}
$('#srcForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/sources', { method: 'POST', body: { name: $('#srcName').value, url: $('#srcUrl').value, lang: $('#srcLang').value, paywall: $('#srcPay').checked } }); e.target.reset(); loadSources(); toast('Đã thêm nguồn'); }
  catch (err) { toast(err.message); }
});
async function loadRuns() {
  const rows = await api('/runs');
  $('#runList').innerHTML = rows.map(r => { const s = typeof r.stats === 'string' ? JSON.parse(r.stats || '{}') : (r.stats || {});
    return `<li data-id="${r.id}"><span>${r.status === 'done' ? '✓' : r.status === 'error' ? '✗' : '…'} ${vi(r.started_at)} ${String(r.started_at).slice(11, 16)} · ${r.trigger_by === 'manual' ? 'thủ công' : 'tự động'}</span><small>${s.processed ?? 0} tin xử lý · ${s.candidates ?? 0} ứng viên${s.errors ? ` · ${s.errors} lỗi` : ''}${s.queued ? ` · ${s.queued} chờ Claude` : ''}</small></li>`; }).join('') || '<li class="empty">Chưa có lượt cập nhật.</li>';
  $$('#runList [data-id]').forEach(li => li.onclick = async () => { const r = await api('/runs/' + li.dataset.id); alert(r.log || 'Không có nhật ký'); });
}

// ---------- Khởi động ----------
async function boot() {
  const me = await api('/me').catch(() => null);
  if (!me) return;
  if (!me.loggedIn) return showLogin();
  $('#app').hidden = false;
  state.today = me.today; state.calMonth = me.today.slice(0, 7);
  await setDate(me.today);
  const v = location.hash.slice(1);
  if (['topic', 'search', 'settings'].includes(v)) go(v);
  pollRun();
}
boot();
