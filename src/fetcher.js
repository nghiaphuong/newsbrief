// Thu thập tin ứng viên từ RSS + GDELT và trích xuất toàn văn (khi bài công khai).
const crypto = require('crypto');
const Parser = require('rss-parser');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { q } = require('./db');
const { KEYWORDS } = require('./sources');

const UA = 'Mozilla/5.0 (compatible; NewsBriefBot/1.0; +internal embassy news monitoring)';
const parser = new Parser({ timeout: 20000, headers: { 'User-Agent': UA } });

const hash = s => crypto.createHash('sha1').update(s).digest('hex');
const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const strip = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'cmpid'].forEach(p => url.searchParams.delete(p));
    url.hash = '';
    return url.toString();
  } catch { return u; }
}

function matchesKeywords(text) {
  const t = ` ${text.toLowerCase()} `;
  return KEYWORDS.some(k => t.includes(k));
}

async function fetchRss(sources, sinceHours, log) {
  const since = Date.now() - sinceHours * 3600 * 1000;
  const out = [];
  await Promise.all(sources.map(async src => {
    try {
      const feed = await parser.parseURL(src.url);
      let n = 0;
      for (const item of feed.items || []) {
        const link = item.link || item.guid;
        if (!link || !/^https?:/.test(link)) continue;
        const d = item.isoDate ? new Date(item.isoDate) : (item.pubDate ? new Date(item.pubDate) : null);
        if (d && !isNaN(d) && d.getTime() < since) continue;
        const title = strip(item.title);
        const summary = strip(item.contentSnippet || item.content || item.summary || '');
        if (src.filter_keywords && !matchesKeywords(`${title} ${summary}`)) continue;
        out.push({ url: normalizeUrl(link), title, summary, source: src.name, lang: src.lang, paywall: !!src.paywall, published: d && !isNaN(d) ? d : null });
        n++;
      }
      await q('UPDATE sources SET last_ok_at = NOW(), last_error = NULL WHERE id = ?', [src.id]);
      log(`RSS ${src.name}: ${n} tin phù hợp`);
    } catch (e) {
      await q('UPDATE sources SET last_error = ? WHERE id = ?', [String(e.message).slice(0, 490), src.id]);
      log(`RSS ${src.name}: LỖI ${e.message}`);
    }
  }));
  return out;
}

// GDELT DOC 2.0 API – quét báo chí toàn cầu (miễn phí, không cần khóa).
const GDELT_QUERIES = [
  { q: '(Norway OR Norwegian) (Vietnam OR ASEAN OR "Southeast Asia")', lang: 'english' },
  { q: '(Norway OR Norwegian) (China OR Russia OR "United States" OR EU OR NATO OR tariff OR sanctions)', lang: 'english' },
  { q: '(Norway OR Norwegian) (investment OR trade OR "wealth fund" OR Equinor OR economy)', lang: 'english' },
  { q: '(Vietnam OR ASEAN) (Nordic OR Scandinavia OR Europe OR EU) (trade OR investment OR agreement)', lang: 'english' },
  { q: '(Vietnam OR ASEAN OR "Sørøst-Asia" OR Kina OR Russland OR USA OR EU)', lang: 'norwegian' },
];

async function gdeltSearch(query, lang = 'english', timespan = '1d', max = 50) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:${lang}`)}&mode=artlist&format=json&sort=datedesc&maxrecords=${max}&timespan=${timespan}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  const txt = await res.text();
  if (!txt.trim().startsWith('{')) return [];
  const data = JSON.parse(txt);
  return (data.articles || []).map(a => ({
    url: normalizeUrl(a.url),
    title: strip(a.title),
    summary: '',
    source: a.domain,
    lang: lang === 'norwegian' ? 'no' : 'en',
    paywall: false,
    published: a.seendate ? new Date(a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) : null,
  }));
}

async function fetchGdelt(log, timespan = '1d') {
  const out = [];
  for (const g of GDELT_QUERIES) {
    try {
      const items = await gdeltSearch(g.q, g.lang, timespan);
      out.push(...items);
      log(`GDELT "${g.q.slice(0, 50)}…": ${items.length} tin`);
    } catch (e) { log(`GDELT lỗi: ${e.message}`); }
    await new Promise(r => setTimeout(r, 5500)); // GDELT giới hạn ~1 yêu cầu/5 giây
  }
  return out;
}

async function collectCandidates(log, sinceHours = 30) {
  const sources = await q('SELECT * FROM sources WHERE enabled = 1');
  const [rss, gd] = await Promise.all([fetchRss(sources, sinceHours, log), fetchGdelt(log)]);
  const all = [...rss, ...gd];
  // Khử trùng lặp theo URL và tiêu đề; bỏ bài đã có trong CSDL
  const seenUrl = new Set(); const seenTitle = new Set(); const uniq = [];
  for (const c of all) {
    const tKey = c.title.toLowerCase().replace(/[^a-z0-9æøåäö]+/g, '').slice(0, 80);
    if (!c.title || seenUrl.has(c.url) || seenTitle.has(tKey)) continue;
    seenUrl.add(c.url); seenTitle.add(tKey); uniq.push(c);
  }
  if (!uniq.length) return [];
  const hashes = uniq.map(c => hash(c.url));
  const existing = await q('SELECT url_hash FROM articles WHERE url_hash IN (?)', [hashes]);
  const ex = new Set(existing.map(r => r.url_hash));
  return uniq.filter(c => !ex.has(hash(c.url)));
}

// Trích xuất nội dung chính của bài (chỉ phần được công bố công khai).
async function extractArticle(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'en,nb;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { url: res.url, virtualConsole: vc });
  const reader = new Readability(dom.window.document);
  const art = reader.parse();
  dom.window.close();
  let text = '';
  if (art?.content) {
    const d2 = new JSDOM(`<body>${art.content}</body>`, { virtualConsole: vc });
    const blocks = [...d2.window.document.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, td')]
      .map(el => el.textContent.replace(/\s+/g, ' ').trim())
      .filter(t => t.length > 1);
    text = [...new Set(blocks)].join('\n\n');
    d2.window.close();
  }
  if (text.length < 200) text = (art?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text, finalUrl: res.url };
}

module.exports = { collectCandidates, extractArticle, gdeltSearch, hash, domainOf, normalizeUrl };
