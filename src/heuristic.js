// Xử lý không dùng AI (chế độ "free" và bước lọc sơ bộ của chế độ gói Claude):
// chấm điểm & phân loại bằng từ khóa, ghép bản tổng hợp từ các tin A.
const { viDate } = require('./util');

// [từ khóa, điểm, nhóm quan hệ]
const WEIGHTS = [
  [['vietnam', 'viet nam', 'vietnamese', 'hanoi', 'ho chi minh', 'vietnamesisk'], 45, 'Việt Nam'],
  [['asean', 'southeast asia', 'sørøst-asia', 'indonesia', 'malaysia', 'thailand', 'philippines', 'singapore', 'cambodia', 'laos', 'myanmar', 'brunei'], 25, 'ASEAN'],
  [['norway', 'norwegian', 'oslo', 'norge', 'norsk', 'regjeringen', 'stortinget', 'statsminister', 'utenriksminister', 'støre', 'eide'], 20, 'Na Uy'],
  [['oljefond', 'wealth fund', 'norfund', 'norad', 'equinor', 'norges bank', 'statsbudsjett', 'rentebeslutning'], 15, 'Na Uy'],
  [['nordic', 'scandinavia', 'sweden', 'denmark', 'finland', 'iceland', 'arctic', 'svalbard', 'nordisk'], 8, 'Bắc Âu'],
  [['european union', 'brussels', ' eu ', 'eøs', 'eea', 'efta'], 8, 'EU'],
  [['china', 'beijing', 'kina'], 6, 'Trung Quốc'],
  [['russia', 'moscow', 'russland', 'ukraine'], 6, 'Nga'],
  [['united states', 'washington', 'white house', ' usa '], 6, 'Hoa Kỳ'],
  [['nato'], 6, 'NATO'],
  [['tariff', 'sanction', 'trade', 'investment', 'toll', 'sanksjon', 'handel', 'investering', 'frihandel', 'seafood', 'sjømat', 'salmon', 'laks', 'shipping', 'offshore wind', 'havvind'], 5, null],
];
const NEGATIVE = ['football', 'fotball', 'sport', 'celebrity', 'kjendis', 'weather', 'været', 'crime', 'krim', 'accident', 'ulykke', 'premier league', 'eliteserien'];

const CATEGORY = {
  'kinh-te': ['econom', 'trade', 'investment', 'tariff', 'market', 'bank', 'inflation', 'interest rate', 'oil', 'gas', 'energy', 'company', 'business', 'fund', 'export', 'import', 'seafood', 'shipping',
    'økonomi', 'handel', 'investering', 'toll', 'marked', 'rente', 'olje', 'energi', 'selskap', 'næringsliv', 'fond', 'eksport', 'sjømat', 'budsjett', 'skatt', 'aksje', 'børs'],
  'van-hoa-xa-hoi': ['culture', 'education', 'health', 'school', 'university', 'festival', 'migrant', 'immigra', 'community', 'social', 'welfare',
    'kultur', 'utdanning', 'helse', 'skole', 'universitet', 'innvandr', 'samfunn', 'velferd', 'trygd', 'nav '],
};

function scoreCandidate(c) {
  const t = ` ${`${c.title} ${c.summary || ''}`.toLowerCase()} `;
  let score = 0; const groups = new Set(); const hits = [];
  for (const [words, w, group] of WEIGHTS) {
    const hit = words.find(k => t.includes(k));
    if (hit) { score += w; hits.push(hit.trim()); if (group) groups.add(group); }
  }
  if (NEGATIVE.some(k => t.includes(k))) score -= 30;
  let category = 'chinh-tri'; let best = 0;
  for (const [cat, words] of Object.entries(CATEGORY)) {
    const n = words.filter(k => t.includes(k)).length;
    if (n > best) { best = n; category = cat; }
  }
  const g = [...groups];
  const relations = g.includes('Na Uy') && g.length > 1 ? g.filter(x => x !== 'Na Uy').map(x => `Na Uy-${x}`).join('; ') : g.join('; ');
  return {
    score: Math.max(0, Math.min(100, score)),
    category,
    relations,
    reason: hits.length ? `Lọc từ khóa: ${hits.slice(0, 5).join(', ')}` : 'Lọc từ khóa: không khớp từ khóa ưu tiên',
  };
}

// Đoạn mở đầu bài (để dịch làm tin A khi không dùng AI)
function lead(a, maxChars = 700) {
  const paras = String(a.content_original || '').split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 40);
  let out = '';
  for (const p of paras) { if (out && out.length + p.length > maxChars) break; out += (out ? '\n\n' : '') + p; }
  return out.slice(0, maxChars * 1.5) || String(a.content_original || '').slice(0, maxChars);
}

function tinA(titleVi, leadVi, a) {
  const d = a.published_at || a.brief_date;
  return `**${titleVi}**\n${leadVi}\n(Theo ${a.source_name}${d ? ', ' + viDate(d) : ''} – bản dịch máy, chưa biên tập)`;
}

const CAT_ORDER = [['chinh-tri', 'Chính trị – đối ngoại'], ['kinh-te', 'Kinh tế'], ['van-hoa-xa-hoi', 'Văn hóa – xã hội']];
const plain = s => String(s || '').replace(/\*\*/g, '').replace(/\n?\(Theo [^)]*\)\s*$/, '').trim();

// Bản tổng hợp dạng danh sách: tiêu đề + tin A của từng bài, nhóm theo lĩnh vực.
function compileDigest(title, articles, note) {
  const idx = new Map(articles.map((a, i) => [a.id, i + 1]));
  const parts = [`# ${title}`];
  if (note) parts.push(`(${note})`);
  for (const [cat, label] of CAT_ORDER) {
    const list = articles.filter(a => (a.category || 'chinh-tri') === cat);
    if (!list.length) continue;
    parts.push(`## ${label}`);
    list.forEach(a => {
      const body = plain(a.tin_a_vi).replace(/^[^\n]*\n/, '').trim();
      parts.push(`**${a.title_vi || a.title_original}** – ${body} (${a.source_name}) [${idx.get(a.id)}]`);
    });
  }
  return parts.join('\n\n');
}

module.exports = { scoreCandidate, lead, tinA, compileDigest };
