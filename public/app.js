/* NewsBrief – giao diện (chữ giao diện lấy từ i18n.js qua t(); nội dung bản tin là tiếng Việt) */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CATS = ['chinh-tri', 'kinh-te', 'van-hoa-xa-hoi'];
const catLabel = c => (CATS.includes(c) ? t('cat.' + c) : '');
const isMobile = () => matchMedia('(max-width: 820px)').matches;

const state = { today: null, date: null, cat: '', dayItems: [], calMonth: null, range: 'week', selected: null, selectedPane: '#reader', runTimer: null, dailyHour: 8 };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json', 'X-Lang': LANG }, credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error(t('auth.required')); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('err.http', { status: res.status }));
  return data;
}

function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove('show'), 2600); }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vi = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const num = n => Number(n).toLocaleString(LOCALE());

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
const plain = s => String(s || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s/gm, '');

async function copy(text, label) {
  try { await navigator.clipboard.writeText(plain(text)); }
  catch { const ta = document.createElement('textarea'); ta.value = plain(text); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(t('copied', { label }));
}

// ---------- Ngôn ngữ giao diện ----------
$$('[data-lang-toggle]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); setLang(LANG === 'en' ? 'vi' : 'en'); }));
// Vẽ lại các phần do JS tạo khi đổi ngôn ngữ
window.onLangChange = () => {
  $('#logoutBtn').textContent = state.admin ? t('auth.logout') : t('auth.adminLogin');
  showAutoNote(state.dailyHour);
  if (!state.today) return;
  setDate(state.date || state.today, { keepReader: true });
  const view = location.hash.slice(1);
  if (view === 'topic') loadTopicHistory();
  if (view === 'search' && $('#searchList').children.length) doSearch();
  if (view === 'settings' && state.admin) loadSettings();
  if (state.selected) openArticle(state.selected, state.selectedPane, true);
};

// ---------- Đăng nhập ----------
function showLogin() {
  $('#app').hidden = true; $('#login').hidden = false;
  $('#loginBack').hidden = !state.publicAccess; // chế độ công khai: cho phép quay lại xem không đăng nhập
  $('#pw').focus();
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/login', { method: 'POST', body: { password: $('#pw').value } }); $('#login').hidden = true; $('#pw').value = ''; boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#loginBack').onclick = e => { e.preventDefault(); $('#login').hidden = true; $('#app').hidden = false; };
// Quản trị: đăng xuất (nếu chế độ công khai đang bật thì quay về chế độ chỉ xem). Khách: mở trang đăng nhập.
$('#logoutBtn').onclick = async () => {
  if (!state.admin) return showLogin();
  await api('/logout', { method: 'POST' });
  boot();
};

// ---------- Điều hướng ----------
function go(view) {
  if (view === 'settings' && !state.admin) return showLogin(); // khách bấm "Cài đặt" → đăng nhập quản trị
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + view);
  $$('[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  if (view === 'topic') loadTopicHistory();
  if (view === 'settings') loadSettings();
  if (view === 'search' && !$('#searchList').children.length) doSearch();
  location.hash = view;
  window.scrollTo(0, 0);
}
$$('[data-view]').forEach(a => a.addEventListener('click', () => go(a.dataset.view)));
// Chữ NewsBrief góc trên bên trái: về trang chủ (Bản tin ngày)
$('#homeLink').addEventListener('click', e => { e.preventDefault(); go('day'); });

// ---------- Lịch ----------
async function renderCal() {
  const month = state.calMonth;
  const counts = {};
  try { (await api('/calendar?month=' + month)).forEach(r => counts[r.d] = r.n); } catch { }
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  let html = `<div class="cal-head"><button aria-label="${esc(t('cal.prev'))}" data-m="-1">‹</button><span>${esc(monthLabel(y, m))}</span><button aria-label="${esc(t('cal.next'))}" data-m="1">›</button></div><div class="cal-grid">`;
  html += weekdaysShort().map(d => `<span class="wd">${d}</span>`).join('');
  html += '<span></span>'.repeat(offset);
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    const cls = [counts[ds] ? 'has' : '', ds === state.date ? 'sel' : '', ds === state.today ? 'today' : ''].join(' ');
    html += `<button class="${cls}" data-d="${ds}" ${ds > state.today ? 'disabled' : ''} title="${counts[ds] ? esc(t('cal.count', { n: counts[ds] })) : ''}">${d}</button>`;
  }
  $('#cal').innerHTML = html + '</div>';
  $$('#cal [data-d]').forEach(b => b.onclick = () => { go('day'); setDate(b.dataset.d); });
  $$('#cal [data-m]').forEach(b => b.onclick = () => { const dt = new Date(Date.UTC(y, m - 1 + Number(b.dataset.m), 1)); state.calMonth = dt.toISOString().slice(0, 7); renderCal(); });
}

// ---------- Bản tin ngày ----------
async function setDate(d, opts = {}) {
  state.date = d; $('#datePick').value = d;
  const dt = new Date(d + 'T12:00:00Z');
  $('#dayNum').textContent = `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  $('#dayWeek').textContent = `${weekday(dt)}, ${vi(d)}${d === state.today ? ' · ' + t('day.today') : ''}`;
  if (state.calMonth !== d.slice(0, 7)) state.calMonth = d.slice(0, 7);
  renderCal();
  await Promise.all([loadDay(opts), loadDigest()]);
}

async function loadDay(opts = {}) {
  const list = $('#dayList');
  list.innerHTML = `<li class="empty">${esc(t('common.loading'))}</li>`;
  state.dayItems = await api('/articles?date=' + state.date);
  renderList(list, state.dayItems.filter(a => !state.cat || a.category === state.cat), '#reader');
  const done = state.dayItems.filter(a => a.status === 'done').length;
  $('#dayCount').textContent = state.dayItems.length
    ? t('day.count', { done }) + (state.dayItems.length > done ? t('day.countPending', { n: state.dayItems.length - done }) : '')
    : t('day.noArticles');
  if (!opts.keepReader && !isMobile() && state.dayItems.length && !state.selected) openArticle(state.dayItems[0].id, '#reader');
  if (!state.dayItems.length) $('#reader').innerHTML = '';
}

function renderList(el, items, readerSel) {
  if (!items.length) {
    el.innerHTML = readerSel === '#reader'
      ? `<li class="empty"><strong>${esc(t('day.emptyTitle'))}</strong>${esc(t('day.emptyBody', { hour: state.dailyHour }) + (state.admin ? t('day.emptyAdmin') : ''))}</li>`
      : `<li class="empty"><strong>${esc(t('search.emptyTitle'))}</strong>${esc(t('search.emptyBody'))}</li>`;
    return;
  }
  el.innerHTML = items.map(a => {
    const vn = /vi[eệ]t nam|vietnam|asean/i.test(a.relations || '') ? 'vn' : '';
    return `<li class="item ${vn} ${state.selected === a.id ? 'sel' : ''}" data-id="${a.id}" tabindex="0">
      <h4>${esc(a.title_vi || a.title_original)}</h4>
      ${a.title_vi ? `<p class="orig">${esc(a.title_original)}</p>` : ''}
      <div class="meta"><span class="cat">${esc(catLabel(a.category))}</span><span>${esc(a.source_name)}</span><span>${esc(t(a.lang === 'no' ? 'lang.no' : 'lang.en'))}</span>
      ${readerSel === '#reader2' ? `<span>${vi(a.brief_date)}</span>` : ''}
      ${a.full_text ? '' : `<span class="badge">${esc(t('badge.partial'))}</span>`}
      ${a.status !== 'done' ? `<span class="badge warn">${esc(t(a.status === 'error' ? 'badge.error' : 'badge.processing'))}</span>` : ''}</div>
    </li>`;
  }).join('');
  el.querySelectorAll('.item').forEach(li => {
    const open = () => openArticle(Number(li.dataset.id), readerSel);
    li.onclick = open; li.onkeydown = e => { if (e.key === 'Enter') open(); };
  });
}

async function openArticle(id, readerSel, keepTab = false) {
  const pane = $(readerSel);
  const prevTab = keepTab ? pane.querySelector('[data-tab].active')?.dataset.tab : null;
  state.selected = id; state.selectedPane = readerSel;
  $$('.item').forEach(li => li.classList.toggle('sel', Number(li.dataset.id) === id));
  if (!keepTab) pane.innerHTML = `<div class="reader"><p class="empty">${esc(t('common.loading'))}</p></div>`;
  if (isMobile() && !keepTab) pane.classList.add('open');
  const a = await api('/articles/' + id);
  const figs = a.key_figures || [];
  pane.innerHTML = `<article class="reader">
    <button class="back" data-back>${esc(t('reader.back'))}</button>
    <div class="meta"><span class="cat">${esc(catLabel(a.category))}</span>${a.relations ? `<span>${esc(a.relations)}</span>` : ''}</div>
    <h1>${esc(a.title_vi || a.title_original)}</h1>
    ${a.title_vi ? `<p class="orig-title">${esc(a.title_original)}</p>` : ''}
    <div class="src-line"><span>${esc(a.source_name)}</span><span>${a.published_at ? vi(a.published_at) + ' ' + String(a.published_at).slice(11, 16) : vi(a.brief_date)}</span>
      <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(t('reader.openOriginal'))}</a>
      ${a.full_text ? '' : `<span class="badge">${esc(t('reader.partial'))}</span>`}</div>
    ${a.status === 'error' ? `<p class="err">${esc(t('reader.error', { msg: a.error_msg || '' }))}</p>` : ''}
    ${a.status === 'pending' ? `<p class="empty">${esc(t('reader.pending'))}</p>` : ''}
    <div class="tabs" role="tablist">
      <button class="active" data-tab="tina">${esc(t('tab.tina'))}</button>
      <button data-tab="trans">${esc(t('tab.trans'))}</button>
      <button data-tab="orig">${esc(t('tab.orig'))}</button>
      <button data-tab="figs">${esc(t('tab.figs', { n: figs.length }))}</button>
    </div>
    <div data-panel="tina"><div class="tab-tools"><button class="btn small" data-copy="tina">${esc(t('copy.tina'))}</button></div><div class="prose tin-a" lang="vi">${md(a.tin_a_vi) || `<p>${esc(t('common.none'))}</p>`}</div></div>
    <div data-panel="trans" hidden>${a.translation_vi
      ? `<div class="tab-tools"><button class="btn small" data-copy="trans">${esc(t('copy.trans'))}</button><button class="btn ghost small admin-only" data-translate>${esc(t('trans.retranslate'))}</button></div><div class="prose" lang="vi">${md(a.translation_vi)}</div>`
      : a.translate_requested
        ? `<p class="empty">${esc(t('trans.requested'))}</p>`
        : `<p class="empty">${esc(t('trans.notYet'))}</p><div class="tab-tools admin-only"><button class="btn small" data-translate>${esc(t('trans.full'))}</button></div>`}</div>
    <div data-panel="orig" hidden><div class="tab-tools"><button class="btn small" data-copy="orig">${esc(t('copy.orig'))}</button></div><div class="prose" lang="${a.lang === 'no' ? 'nb' : 'en'}">${md(a.content_original)}</div></div>
    <div data-panel="figs" hidden><div class="tab-tools"><button class="btn small" data-copy="figs">${esc(t('copy.figs'))}</button></div>
      ${figs.length ? `<ul class="figs" lang="vi">${figs.map(f => `<li><span class="v">${esc(f.figure)}</span><span class="c">${esc(f.context)}</span><span class="s">${esc(t('figs.source', { src: f.source }))}${f.type ? ' · ' + esc(f.type) : ''}</span></li>`).join('')}</ul>` : `<p class="empty">${esc(t('figs.none'))}</p>`}</div>
    <p class="reason">${esc(t('reader.relevance', { n: a.relevance ?? '–' }))}${a.relevance_reason ? ' · ' + esc(a.relevance_reason) : ''}
<span class="admin-only"> · <button class="btn ghost small" data-reprocess>${esc(t('reader.reprocess'))}</button></span></p>
  </article>`;
  const src = t('copy.sourceWord');
  const texts = {
    tina: a.tin_a_vi, trans: `${a.title_vi || ''}\n\n${a.translation_vi || ''}\n\n${src}: ${a.source_name} – ${a.url}`, orig: `${a.title_original}\n\n${a.content_original || ''}\n\n${a.url}`,
    figs: figs.map(f => `- ${f.figure}: ${f.context} (${src}: ${f.source}${f.type ? '; ' + f.type : ''})`).join('\n'),
  };
  const showTab = name => {
    pane.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    pane.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== name);
  };
  pane.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  if (prevTab) showTab(prevTab);
  pane.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(texts[b.dataset.copy], t('label.' + b.dataset.copy)));
  pane.querySelector('[data-back]').onclick = () => pane.classList.remove('open');
  pane.querySelector('[data-reprocess]').onclick = async e => {
    e.target.disabled = true; e.target.textContent = t('reader.reprocessing');
    try {
      const r = await api(`/articles/${id}/reprocess`, { method: 'POST' });
      toast(t(r.status === 'pending' ? 'reprocess.queued' : 'reprocess.done'));
      openArticle(id, readerSel);
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };
  const trBtn = pane.querySelector('[data-translate]');
  if (trBtn) trBtn.onclick = async e => {
    const label = e.target.textContent;
    e.target.disabled = true; e.target.textContent = t('trans.working');
    try {
      let st = await api(`/articles/${id}/translate`, { method: 'POST' });
      while (st.state === 'running') {
        await new Promise(r => setTimeout(r, 5000));
        st = await api(`/articles/${id}/translate`);
      }
      if (st.state === 'error') throw new Error(t('trans.error', { msg: st.error }));
      toast(t(st.state === 'queued' ? 'trans.queued' : 'trans.done'));
      if (state.selected === id) { await openArticle(id, readerSel); pane.querySelector('[data-tab="trans"]').click(); }
    } catch (err) { toast(err.message); e.target.disabled = false; e.target.textContent = label; }
  };
  if (!keepTab) pane.scrollTop = 0;
}

async function loadDigest(open) {
  const d = await api('/digest/daily?date=' + state.date).catch(() => null);
  $('#digestBox').hidden = !d && !state.dayItems.length;
  $('#digestBody').innerHTML = d ? md(d.content_vi) : `<p>${esc(t(state.admin ? 'digest.noneAdmin' : 'digest.none'))}</p>`;
  $('#digestBody').lang = 'vi';
  $('#digestMeta').textContent = d ? t('digest.updated', { time: String(d.created_at).slice(11, 16) }) : '';
  $('#digestBox')._text = d?.content_vi || '';
  if (open) $('#digestBox').open = true;
}
$('#digestCopy').onclick = () => copy($('#digestBox')._text, t('digest.label'));
$('#digestRegen').onclick = async e => {
  e.target.disabled = true; e.target.textContent = t('digest.regenerating');
  try { await api('/digest/daily', { method: 'POST', body: { date: state.date, length: $('#digestLen').value } }); await loadDigest(true); toast(t('digest.created')); }
  catch (err) { toast(err.message); }
  e.target.disabled = false; e.target.textContent = t('digest.regen');
};

$('#datePick').onchange = e => e.target.value && setDate(e.target.value);
$$('#dayFilters .chip').forEach(c => c.onclick = () => {
  $$('#dayFilters .chip').forEach(x => x.classList.toggle('active', x === c));
  state.cat = c.dataset.cat;
  renderList($('#dayList'), state.dayItems.filter(a => !state.cat || a.category === state.cat), '#reader');
});

// Cập nhật ngay + theo dõi tiến độ
$('#runBtn').onclick = async () => {
  try { await api('/run', { method: 'POST', body: { date: state.date === state.today ? undefined : state.date } }); toast(t('run.started')); pollRun(); }
  catch (err) { toast(err.message); pollRun(); }
};
async function pollRun() {
  clearTimeout(state.runTimer);
  const s = await api('/run/status').catch(() => ({ running: false }));
  $('#progress').hidden = !s.running; $('#runBtn').disabled = !!s.running;
  if (s.running) {
    $('#progText').textContent = s.total ? t('run.progress', { step: tStep(s.step), done: s.done, total: s.total }) : tStep(s.step);
    $('#progBar').style.width = s.total ? `${15 + 85 * s.done / s.total}%` : '10%';
    state.runTimer = setTimeout(pollRun, 4000);
    if (s.total && s.done && s.done !== state._lastDone) { state._lastDone = s.done; loadDay(); }
  } else if (state._wasRunning) { toast(t('run.done')); loadDay(); loadDigest(); renderCal(); }
  state._wasRunning = s.running;
}

// ---------- Tổng hợp chủ đề ----------
$('#topicForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#tBtn'); btn.disabled = true; btn.textContent = t('topic.working');
  const box = $('#topicResult'); box.hidden = false;
  box.innerHTML = `<p class="empty">${esc(t($('#tScan').checked ? 'topic.searchingScan' : 'topic.searching'))}</p>`;
  try {
    const { jobId } = await api('/topic', { method: 'POST', body: { topic: $('#tTopic').value, days: $('#tDays').value, length: $('#tLen').value, scan: $('#tScan').checked } });
    let job;
    do { await new Promise(r => setTimeout(r, 3000)); job = await api('/jobs/' + jobId); } while (job.state === 'running');
    if (job.state === 'error') throw new Error(job.error);
    showTopic({ ...job.result, topic: $('#tTopic').value });
    loadTopicHistory();
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  btn.disabled = false; btn.textContent = t('topic.submit');
});

function showTopic(r) {
  const box = $('#topicResult'); box.hidden = false;
  box.innerHTML = `<div class="head"><span>${esc(r.topic || '')} · ${vi(r.from || r.date_from)} – ${vi(r.to || r.date_to)}</span><button class="btn small" id="tCopy">${esc(t('common.copy'))}</button></div>
    <div class="prose" lang="vi">${md(r.content || r.content_vi)}</div>
    ${r.articles?.length ? `<ol class="refs">${r.articles.map(a => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a> — ${esc(a.source)}, ${vi(a.date)}</li>`).join('')}</ol>` : ''}`;
  $('#tCopy').onclick = () => copy((r.content || r.content_vi) + (r.articles?.length ? `\n\n${t('topic.sources')}:\n` + r.articles.map((a, i) => `[${i + 1}] ${a.title} – ${a.source}, ${vi(a.date)}: ${a.url}`).join('\n') : ''), t('digest.label'));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadTopicHistory() {
  const rows = await api('/digests?kind=topic').catch(() => []);
  $('#topicHistory').innerHTML = rows.length ? rows.map(d => `<li data-id="${d.id}"><span>${esc(d.topic)}</span><small>${vi(d.date_from)} – ${vi(d.date_to)}</small></li>`).join('') : `<li class="empty">${esc(t('topic.noneSaved'))}</li>`;
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
  const today = state.today;
  if (state.range === 'day') p.set('date', today);
  if (state.range === 'week') p.set('from', addDays(today, -6));
  if (state.range === 'month') p.set('from', addDays(today, -29));
  if (state.range === 'custom') { if ($('#sFrom').value) p.set('from', $('#sFrom').value); if ($('#sTo').value) p.set('to', $('#sTo').value); }
  if ($('#sQ').value.trim()) p.set('q', $('#sQ').value.trim());
  if ($('#sCat').value) p.set('category', $('#sCat').value);
  p.set('limit', '300');
  const rows = await api('/articles?' + p).catch(err => { toast(err.message); return []; });
  $('#sCount').textContent = t('search.count', { n: rows.length });
  renderList($('#searchList'), rows, '#reader2');
}

// ---------- Cài đặt ----------
async function loadSettings() {
  const s = await api('/settings');
  state.mode = s.ai_mode || 'claude_plan';
  $$('#stMode input[name="ai_mode"]').forEach(r => r.checked = r.value === state.mode);
  state.env = s.env || {};
  showEnvHints();
  const u = s.translate_usage;
  const reset = u ? new Intl.DateTimeFormat(LOCALE(), { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(u.resetAt)) : '';
  $('#stUsage').textContent = u ? t('usage.line', { period: u.period, used: num(u.used), limit: num(u.limit), reset }) : '';
  $('#stN').value = s.articles_per_day; $('#stHour').value = s.daily_hour; $('#stMin').value = s.min_relevance;
  $('#stPublic').checked = s.public_access !== '0';
  $('#stPublicWarn').hidden = !!(s.env && s.env.appPassword);
  $('#stMail').value = s.weekly_to; $('#stWeekly').checked = s.weekly_enabled === '1'; $('#stSamples').value = s.tin_a_samples || '';
  const d = new Date(state.today + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7;
  if (!$('#wFrom').value) { $('#wFrom').value = addDays(state.today, -dow - 7); $('#wTo').value = addDays(state.today, -dow - 1); }
  loadSources(); loadRuns();
}
// Cho biết biến môi trường cần cho từng chế độ đã được đặt trên server chưa.
function showEnvHints() {
  const env = state.env || {};
  const hint = (el, ok, name) => { el.className = ok ? 'ok' : 'missing'; el.textContent = t(ok ? 'env.has' : 'env.missing', { name }); };
  hint($('#stMode [data-env="anthropic"]'), env.anthropic, 'ANTHROPIC_API_KEY');
  hint($('#stMode [data-env="agent"]'), env.agent, 'AGENT_API_TOKEN');
  hint($('#stMode [data-env="translate"]'), env.google, 'GOOGLE_TRANSLATE_API_KEY');
}

$('#settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = $('#stMode input[name="ai_mode"]:checked')?.value || 'claude_plan';
  await api('/settings', { method: 'PUT', body: { ai_mode: mode, public_access: $('#stPublic').checked ? '1' : '0', articles_per_day: $('#stN').value, daily_hour: $('#stHour').value, min_relevance: $('#stMin').value, weekly_to: $('#stMail').value, weekly_enabled: $('#stWeekly').checked ? '1' : '0', tin_a_samples: $('#stSamples').value } });
  state.mode = mode; state.publicAccess = $('#stPublic').checked;
  showAutoNote($('#stHour').value);
  $('#stSaved').textContent = t('st.saved'); setTimeout(() => $('#stSaved').textContent = '', 2500);
});
$('#wDownload').onclick = () => { location.href = `/api/weekly/docx?from=${$('#wFrom').value}&to=${$('#wTo').value}`; };
$('#wSend').onclick = async e => {
  e.target.disabled = true; $('#wMsg').textContent = t('weekly.sending');
  try { const r = await api('/weekly/send', { method: 'POST', body: { from: $('#wFrom').value, to: $('#wTo').value } }); $('#wMsg').textContent = t('weekly.sent', { count: r.count, to: r.sentTo }); }
  catch (err) { $('#wMsg').textContent = err.message; }
  e.target.disabled = false;
};
async function loadSources() {
  const rows = await api('/sources');
  $('#srcTable').innerHTML = `<tr><th>${esc(t('src.th.on'))}</th><th>${esc(t('src.th.source'))}</th><th>${esc(t('src.th.lang'))}</th><th title="${esc(t('src.th.paywallTitle'))}">${esc(t('src.th.paywall'))}</th><th>${esc(t('src.th.filter'))}</th><th>${esc(t('src.th.status'))}</th><th></th></tr>` + rows.map(s => `
    <tr data-id="${s.id}"><td><input type="checkbox" data-f="enabled" ${s.enabled ? 'checked' : ''}></td>
    <td><strong>${esc(s.name)}</strong><br><small>${esc(s.url)}</small></td><td>${esc(t(s.lang === 'no' ? 'src.langNo' : 'src.langEn'))}</td>
    <td><input type="checkbox" data-f="paywall" ${s.paywall ? 'checked' : ''}></td><td><input type="checkbox" data-f="filter_keywords" ${s.filter_keywords ? 'checked' : ''}></td>
    <td class="${s.last_error ? 'err' : ''}">${s.last_error ? esc(s.last_error) : (s.last_ok_at ? 'OK ' + vi(s.last_ok_at) : '–')}</td>
    <td><button class="btn ghost small" data-del>${esc(t('common.delete'))}</button></td></tr>`).join('');
  $$('#srcTable input[data-f]').forEach(cb => cb.onchange = () => api('/sources/' + cb.closest('tr').dataset.id, { method: 'PUT', body: { [cb.dataset.f]: cb.checked } }).then(() => toast(t('src.updated'))));
  $$('#srcTable [data-del]').forEach(b => b.onclick = async () => { if (confirm(t('src.confirmDelete'))) { await api('/sources/' + b.closest('tr').dataset.id, { method: 'DELETE' }); loadSources(); } });
}
$('#srcForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/sources', { method: 'POST', body: { name: $('#srcName').value, url: $('#srcUrl').value, lang: $('#srcLang').value, paywall: $('#srcPay').checked } }); e.target.reset(); loadSources(); toast(t('src.added')); }
  catch (err) { toast(err.message); }
});
async function loadRuns() {
  const rows = await api('/runs');
  $('#runList').innerHTML = rows.map(r => { const s = typeof r.stats === 'string' ? JSON.parse(r.stats || '{}') : (r.stats || {});
    return `<li data-id="${r.id}"><span>${r.status === 'done' ? '✓' : r.status === 'error' ? '✗' : '…'} ${vi(r.started_at)} ${String(r.started_at).slice(11, 16)} · ${esc(t(r.trigger_by === 'manual' ? 'runs.manual' : 'runs.auto'))}</span><small>${esc(t('runs.stats', { processed: s.processed ?? 0, candidates: s.candidates ?? 0 }) + (s.errors ? t('runs.errors', { n: s.errors }) : '') + (s.queued ? t('runs.queued', { n: s.queued }) : ''))}</small></li>`; }).join('') || `<li class="empty">${esc(t('runs.none'))}</li>`;
  $$('#runList [data-id]').forEach(li => li.onclick = async () => { const r = await api('/runs/' + li.dataset.id); alert(r.log || t('runs.noLog')); });
}

// Dòng "Tự động cập nhật vào … giờ Na Uy" theo giờ hẹn trong Cài đặt
function showAutoNote(hour) {
  const h = Number.isFinite(Number(hour)) ? Number(hour) : 8;
  state.dailyHour = h;
  let time;
  if (LANG === 'en') {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    time = h === 12 ? '12:00 noon' : `${h12}:00 ${h < 12 ? 'a.m.' : 'p.m.'}`;
  } else {
    time = `${h}:00 ${t(h < 11 ? 'time.morning' : h < 13 ? 'time.noon' : h < 18 ? 'time.afternoon' : 'time.evening')}`;
  }
  $('#autoNote').textContent = t('day.autoNote', { time });
}

// ---------- Khởi động ----------
async function boot() {
  applyI18n();
  const me = await api('/me').catch(() => null);
  if (!me) return;
  state.admin = !!me.admin; state.publicAccess = !!me.publicAccess;
  if (!me.admin && !me.publicAccess) return showLogin();
  // Khách (chế độ công khai): ẩn các nút tốn phí/thay đổi dữ liệu (lớp .admin-only)
  document.body.classList.toggle('viewer', !me.admin);
  $('#logoutBtn').textContent = me.admin ? t('auth.logout') : t('auth.adminLogin');
  $('#login').hidden = true;
  $('#app').hidden = false;
  state.today = me.today; state.calMonth = me.today.slice(0, 7);
  showAutoNote(me.dailyHour);
  await setDate(me.today);
  const v = location.hash.slice(1);
  if (['topic', 'search'].includes(v) || (v === 'settings' && me.admin)) go(v);
  else go('day');
  pollRun();
}
boot();
