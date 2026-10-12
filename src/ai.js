// Mọi lời gọi Claude API tập trung tại đây.
const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('./config');

let client;
function getClient() {
  if (!config.anthropic.key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY');
  // SDK tự thử lại (429, 5xx, lỗi mạng) với backoff; timeout rộng cho bài dài.
  if (!client) client = new Anthropic({ apiKey: config.anthropic.key, maxRetries: 4, timeout: 20 * 60 * 1000 });
  return client;
}

// Dùng streaming để kết nối không bị ngắt khi Claude viết lâu (bài dịch dài).
// Sonnet 5.5 / Haiku 5.5: không nhận temperature khác mặc định (lỗi 400); thinking luôn bật và
// dùng chung max_tokens với câu trả lời, nên max_tokens cần dư. effort: low|medium|high (bỏ trống = mặc định của model).
async function callClaude({ system, user, model, maxTokens = 8000, effort }) {
  let msg;
  try {
    msg = await getClient().messages.stream({
      model: model || config.anthropic.model,
      max_tokens: maxTokens,
      ...(effort ? { output_config: { effort } } : {}),
      system,
      messages: [{ role: 'user', content: user }],
    }).finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API ${e.status ?? ''}: ${e.error?.error?.message || e.message}`);
    throw e;
  }
  if (msg.stop_reason === 'refusal') throw new Error(`Claude từ chối xử lý (${msg.stop_details?.category || 'không rõ lý do'})`);
  if (msg.stop_reason === 'max_tokens') console.warn(`Claude API: phản hồi bị cắt do chạm max_tokens=${maxTokens}`);
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function tag(text, name) {
  const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : '';
}

function parseJsonLoose(s) {
  const clean = s.replace(/```json|```/g, '').trim();
  const start = clean.search(/[\[{]/);
  const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
  return JSON.parse(clean.slice(start, end + 1));
}

// ---------- Chuẩn mực chung cho mọi tác vụ ----------
const CORE_RULES = `Bạn là cán bộ ngoại giao Việt Nam dày dạn kinh nghiệm công tác tại Đại sứ quán Việt Nam tại Na Uy, đồng thời là biên tập viên tin quốc tế chuyên nghiệp.
NGUYÊN TẮC BẮT BUỘC:
1. Chỉ sử dụng thông tin có trong văn bản nguồn được cung cấp. Tuyệt đối không bịa, không suy diễn, không bổ sung kiến thức bên ngoài như thể đó là nội dung bài báo.
2. Giữ nguyên và đầy đủ mọi số liệu, tỷ lệ, mốc thời gian, đơn vị tiền tệ (NOK, USD, EUR…), tên tổ chức và NGUỒN của số liệu/dự báo (ví dụ: "theo Cục Thống kê Na Uy (SSB)", "Norges Bank dự báo…"). Không làm tròn, không quy đổi trừ khi bài gốc đã quy đổi.
3. Thuật ngữ chuyên ngành dịch chuẩn theo cách dùng của Bộ Ngoại giao và báo chí chính thống Việt Nam (ví dụ: Stortinget = Quốc hội Na Uy; Statsministeren = Thủ tướng; Utenriksdepartementet = Bộ Ngoại giao; Statens pensjonsfond utland/oljefondet = Quỹ Hưu trí Chính phủ toàn cầu (Quỹ Dầu mỏ); Norges Bank = Ngân hàng Trung ương Na Uy; EØS-avtalen = Hiệp định Khu vực Kinh tế châu Âu (EEA); statsbudsjettet = ngân sách nhà nước). Lần đầu nêu tên riêng nước ngoài có thể kèm nguyên văn trong ngoặc.
4. Văn phong: trang trọng, khách quan, súc tích, chuẩn mực của văn bản đối ngoại và báo chí chính thống. Dùng "Na Uy", "Việt Nam", "ASEAN", "EU", "Liên bang Nga", "Trung Quốc", "Hoa Kỳ".
5. Nếu văn bản nguồn chỉ là phần công khai/trích đoạn (bài có thu phí), chỉ xử lý phần đó và không phỏng đoán phần còn lại.`;

// ---------- 1. Chấm điểm mức độ liên quan (theo lô) ----------
async function scoreCandidates(items) {
  const list = items.map((it, i) => `[${i}] (${it.source}; ${it.lang}) ${it.title}\n    ${(it.summary || '').slice(0, 300)}`).join('\n');
  const system = `${CORE_RULES}
Nhiệm vụ: sàng lọc tin cho bản tin đối ngoại hàng ngày của Đại sứ quán Việt Nam tại Na Uy.
Thứ tự ưu tiên (điểm cao → thấp):
- Quan hệ Na Uy – Việt Nam (cao nhất); Na Uy – ASEAN / các nước Đông Nam Á.
- Chính trị: chính sách đối ngoại, an ninh của Na Uy; quan hệ Na Uy với Bắc Âu, EU, Hoa Kỳ, Trung Quốc, Nga và các nước lớn; NATO; chính sách mới và dự luật gây tranh cãi của Chính phủ/Quốc hội Na Uy.
- Kinh tế: chính sách kinh tế, đầu tư (gồm Quỹ Dầu mỏ, Norfund), thương mại, doanh nghiệp, năng lượng, thủy sản, hàng hải của Na Uy; an sinh xã hội Na Uy.
- Diễn biến về các nước lớn, EU, ASEAN, tổ chức đa phương, điểm nóng CÓ tác động trực tiếp đến Na Uy – Bắc Âu – Việt Nam – Đông Nam Á.
- Văn hóa – xã hội: điểm thấp hơn, trừ khi liên quan Việt Nam/cộng đồng người Việt.
Loại bỏ: thể thao, giải trí, tai nạn/hình sự địa phương, thời tiết, quảng cáo, tin không liên quan.
Trả về DUY NHẤT một mảng JSON, mỗi phần tử: {"i": số thứ tự, "score": 0-100, "category": "chinh-tri"|"kinh-te"|"van-hoa-xa-hoi", "relations": "chuỗi ngắn các cặp/nhóm liên quan, vd: Na Uy-Việt Nam; Na Uy-EU", "reason": "lý do ngắn bằng tiếng Việt"}.`;
  const text = await callClaude({ system, user: `Danh sách tin ứng viên:\n${list}`, model: config.anthropic.modelFast, maxTokens: 12000, effort: 'low' });
  return parseJsonLoose(text);
}

function sourceBlock(a) {
  return `Bài báo nguồn
- Tiêu đề: ${a.title_original}
- Báo: ${a.source_name}
- Ngôn ngữ: ${a.lang === 'no' ? 'tiếng Na Uy' : 'tiếng Anh'}
- Ngày đăng: ${a.published_at || 'không rõ'}
- Đường dẫn: ${a.url}
- ${a.full_text ? 'Toàn văn' : 'CHỈ CÓ PHẦN CÔNG KHAI/TRÍCH ĐOẠN'}:
"""
${(a.content_original || '').slice(0, 24000)}
"""`;
}

// ---------- 2. Xử lý một bài (tự động): tiêu đề, tin A, số liệu — không dịch toàn văn để tiết kiệm chi phí ----------
async function processArticle(a, tinASamples) {
  const samples = tinASamples && tinASamples.trim()
    ? `MẪU TIN A THAM KHẢO (bắt chước cấu trúc, độ dài và văn phong, KHÔNG lấy nội dung):\n${tinASamples.trim()}`
    : `KHUÔN TIN A MẶC ĐỊNH: 1 dòng tiêu đề ngắn gọn, in đậm bằng **…**; tiếp theo 1 đoạn 80–150 chữ mở đầu bằng thời gian (vd: "Ngày 10/10/2026,"), nêu chủ thể – sự kiện – nội dung chính – số liệu then chốt kèm nguồn; kết thúc bằng nguồn trong ngoặc, vd: "(Theo NRK, 10/10/2026)".`;
  const system = `${CORE_RULES}
${samples}`;
  const user = `${sourceBlock(a)}

Hãy trả lời đúng theo định dạng sau, không thêm gì ngoài các thẻ:
<title_vi>Tiêu đề dịch sang tiếng Việt</title_vi>
<tin_a>Tin A tóm tắt bằng tiếng Việt theo mẫu.</tin_a>
<key_figures>Mảng JSON các số liệu/phân tích định lượng có trong bài: [{"figure":"giá trị kèm đơn vị","context":"nội dung bằng tiếng Việt","source":"nguồn của số liệu theo bài, hoặc tên báo nếu bài không nêu","type":"thực tế|dự báo|ước tính"}]. Trả [] nếu không có.</key_figures>`;
  const text = await callClaude({ system, user, maxTokens: 10000, effort: 'medium' });
  let figures = [];
  try { figures = parseJsonLoose(tag(text, 'key_figures') || '[]'); } catch { figures = []; }
  const tinA = tag(text, 'tin_a');
  if (!tinA) throw new Error('Phản hồi AI thiếu tin A');
  return {
    title_vi: tag(text, 'title_vi'),
    tin_a_vi: tinA,
    key_figures: Array.isArray(figures) ? figures : [],
  };
}

// ---------- 2b. Dịch toàn văn (chỉ chạy khi người dùng yêu cầu) ----------
async function translateArticle(a) {
  const user = `${sourceBlock(a)}

Hãy trả lời đúng theo định dạng sau, không thêm gì ngoài thẻ:
<translation>Bản dịch ĐẦY ĐỦ, trung thành toàn bộ văn bản nguồn sang tiếng Việt, giữ cấu trúc đoạn. Không lược bỏ câu nào chứa số liệu.</translation>`;
  const text = await callClaude({ system: CORE_RULES, user, maxTokens: 24000, effort: 'medium' });
  const translation = tag(text, 'translation');
  if (!translation) throw new Error('Phản hồi AI thiếu bản dịch');
  return translation;
}

const LENGTHS = {
  short: 'khoảng nửa trang A4 (~300–400 chữ)',
  medium: 'khoảng 1 trang A4 (~600–800 chữ)',
  long: 'khoảng 2 trang A4 (~1.200–1.500 chữ)',
};

function articlesBlock(articles) {
  return articles.map((a, i) => {
    const figs = (a.key_figures || []).map(f => `  • ${f.figure} – ${f.context} (nguồn: ${f.source}${f.type ? ', ' + f.type : ''})`).join('\n');
    return `[${i + 1}] ${a.title_vi || a.title_original} — ${a.source_name}, ${a.published_at || a.brief_date}\nTin A: ${a.tin_a_vi || ''}\n${figs ? 'Số liệu:\n' + figs : ''}`;
  }).join('\n\n');
}

// ---------- 3. Tổng hợp tin trong ngày ----------
async function dailyDigest(dateLabel, articles, length = 'short') {
  const system = `${CORE_RULES}
Nhiệm vụ: viết BẢN TỔNG HỢP TIN TRONG NGÀY bằng tiếng Việt từ các tin A đã có.
Yêu cầu: tiêu đề "Tổng hợp tin ngày ${dateLabel}"; sắp xếp theo thứ tự: Quan hệ Na Uy – Việt Nam/ASEAN → Chính trị – đối ngoại → Kinh tế → Văn hóa – xã hội. Mỗi tin là 1 đoạn ngắn gọn (2–4 câu), giữ số liệu then chốt kèm nguồn, cuối đoạn ghi nguồn báo trong ngoặc kèm số thứ tự tin, vd: "(NRK) [3]". Có thể gộp các tin cùng sự kiện vào một đoạn. Tổng độ dài ${LENGTHS[length] || LENGTHS.short}; nếu quá nhiều tin thì gộp/lược tin ít quan trọng nhưng không bỏ số liệu then chốt. Không dùng thông tin ngoài danh sách.`;
  return callClaude({ system, user: `Các tin trong ngày:\n\n${articlesBlock(articles)}`, maxTokens: 12000 });
}

// ---------- 4. Tổng hợp theo chủ đề ----------
async function topicDigest(topic, dateFrom, dateTo, articles, length = 'medium') {
  const system = `${CORE_RULES}
Nhiệm vụ: viết BÀI TỔNG HỢP THEO CHỦ ĐỀ "${topic}" giai đoạn ${dateFrom} – ${dateTo}, bằng tiếng Việt, văn phong báo cáo của cơ quan đại diện ngoại giao.
Cấu trúc: tiêu đề; 1 đoạn khái quát; các ý chính theo diễn biến thời gian hoặc theo nhóm vấn đề; mục "Số liệu đáng chú ý" liệt kê đầy đủ số liệu kèm nguồn; 1 đoạn nhận định ngắn về tác động đối với Na Uy/Việt Nam/ASEAN — CHỈ dựa trên nội dung các tin và ghi rõ đây là nhận định tổng hợp. Mỗi ý dẫn số thứ tự tin nguồn, vd: [2][5]. Độ dài ${LENGTHS[length] || LENGTHS.medium}. Nếu các tin không đủ thông tin về chủ đề, nói rõ điều đó thay vì suy diễn.`;
  return callClaude({ system, user: `Các tin liên quan:\n\n${articlesBlock(articles)}`, maxTokens: 16000 });
}

// ---------- 5. Lời dẫn tổng hợp tuần ----------
async function weeklyOverview(label, articles) {
  const system = `${CORE_RULES}
Viết phần "Tổng quan tuần ${label}" (khoảng 1 trang A4) bằng tiếng Việt: các điểm nổi bật về quan hệ Na Uy – Việt Nam/ASEAN, chính trị – đối ngoại, kinh tế – đầu tư – thương mại, văn hóa – xã hội; nêu số liệu then chốt kèm nguồn; dẫn số thứ tự tin [n].`;
  return callClaude({ system, user: articlesBlock(articles), maxTokens: 12000 });
}

module.exports = { callClaude, scoreCandidates, processArticle, translateArticle, dailyDigest, topicDigest, weeklyOverview, LENGTHS };
