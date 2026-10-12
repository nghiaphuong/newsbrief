/* NewsBrief – giao diện hai ngôn ngữ Anh/Việt (mặc định tiếng Anh). Nội dung bản tin (tin A, bản dịch,
   bản tổng hợp) vẫn là tiếng Việt; chỉ chữ của giao diện được dịch.
   HTML: data-i18n="khóa" (chữ), data-i18n-ph (placeholder), data-i18n-title (title), data-i18n-aria (aria-label).
   JS: t('khóa', { biến }) – chỗ {biến} trong chuỗi được thay bằng giá trị. */
const I18N = {
  en: {
    'doc.title': 'NewsBrief · Foreign Affairs News Brief',
    'lang.switch': 'Tiếng Việt',
    'lang.switchAria': 'Chuyển sang tiếng Việt',
    'login.tagline': 'Foreign affairs news brief: Norway – Vietnam – ASEAN',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.back': '‹ Back to browsing without signing in',
    'brand.title': 'Home (Daily brief)',
    'nav.day': 'Daily brief', 'nav.topic': 'Topic digests', 'nav.search': 'Archive & search', 'nav.settings': 'Settings',
    'tab.day': 'Today', 'tab.topic': 'Topics', 'tab.search': 'Search', 'tab.settings': 'Settings',
    'auth.logout': 'Sign out', 'auth.adminLogin': 'Admin sign-in', 'auth.required': 'Sign-in required',
    'common.copy': 'Copy', 'common.loading': 'Loading…', 'common.none': 'None yet.', 'common.delete': 'Delete',
    'err.http': 'Error {status}',
    'day.pickDate': 'Pick a date', 'day.run': 'Update now', 'day.today': 'today',
    'day.count': '{done} processed', 'day.countPending': ' · {n} pending/failed', 'day.noArticles': 'No articles yet',
    'day.emptyTitle': 'No articles for this day', 'day.emptyBody': 'The brief updates automatically at {hour}:00 (Norway time).',
    'day.emptyAdmin': ' Click "Update now" to fetch news right away.',
    'day.autoNote': 'Updates automatically at {time} Norway time',
    'search.emptyTitle': 'No matching articles', 'search.emptyBody': 'Try other keywords or a wider date range.',
    'digest.title': 'Daily digest', 'digest.regen': 'Regenerate', 'digest.regenerating': 'Generating…',
    'digest.none': 'No digest yet.', 'digest.noneAdmin': 'No digest yet. Click "Regenerate" to create one.',
    'digest.updated': 'updated {time}', 'digest.created': 'Digest created', 'digest.label': 'digest',
    'len.short': 'Half page', 'len.medium': '1 page', 'len.long': '2 pages',
    'cat.all': 'All', 'cat.chinh-tri': 'Politics', 'cat.kinh-te': 'Economy', 'cat.van-hoa-xa-hoi': 'Culture & society', 'cat.any': 'All fields',
    'lang.en': 'English', 'lang.no': 'Norwegian',
    'badge.partial': 'excerpt only', 'badge.error': 'processing error', 'badge.processing': 'processing',
    'reader.back': '‹ List', 'reader.openOriginal': 'Open original ↗', 'reader.partial': 'Only the public part of the article is available',
    'reader.error': 'Processing error: {msg}',
    'reader.pending': 'This article is waiting to be processed. In Claude Team/Pro mode, the brief and figures appear after the next Claude run.',
    'tab.tina': 'Brief (Tin A)', 'tab.trans': 'Translation', 'tab.orig': 'Original', 'tab.figs': 'Figures ({n})',
    'copy.tina': 'Copy brief', 'copy.trans': 'Copy translation', 'copy.orig': 'Copy original', 'copy.figs': 'Copy figures',
    'label.tina': 'brief', 'label.trans': 'translation', 'label.orig': 'original', 'label.figs': 'figures', 'label.command': 'command',
    'copied': 'Copied {label}',
    'trans.retranslate': 'Translate again', 'trans.full': 'Translate full text',
    'trans.requested': 'Full translation requested. It will appear after the next Claude (Team/Pro) run.',
    'trans.notYet': 'This article has not been translated in full (translations are made on request to save costs).',
    'trans.notYetViewer': 'This article has not been translated in full. Translations are made on request to save costs; please sign in as admin to request one.',
    'trans.working': 'Translating… (1–3 min)', 'trans.error': 'Translation error: {msg}',
    'trans.queued': 'Queued – Claude will translate it on the next run', 'trans.done': 'Full text translated',
    'figs.none': 'This article has no quantitative figures.', 'figs.source': 'Source: {src}', 'copy.sourceWord': 'Source',
    'reader.relevance': 'Relevance {n}/100', 'reader.reprocess': 'Summarize again', 'reader.reprocessing': 'Processing… (1–2 min)',
    'reprocess.queued': 'Queued for Claude (Team/Pro plan)', 'reprocess.done': 'Reprocessed',
    'run.started': 'Update started', 'run.done': 'Update finished', 'run.progress': '{step} · {done}/{total} articles',
    'topic.title': 'Topic digests', 'topic.viewerNote': 'Sign in as admin to create new digests; saved digests are listed below.',
    'topic.topic': 'Topic', 'topic.ph': "e.g. Norway's oil fund investing in Asia", 'topic.period': 'Period', 'topic.length': 'Length',
    'topic.scan': 'Also scan new sources', 'topic.submit': 'Create digest', 'topic.working': 'Creating digest…',
    'topic.searching': 'Searching and summarizing articles…', 'topic.searchingScan': 'Searching and summarizing articles, including new sources (may take a few minutes)…',
    'topic.saved': 'Saved digests', 'topic.noneSaved': 'No digests yet.', 'topic.sources': 'Sources',
    'days.1': '1 day', 'days.n': '{n} days', 'days.365': '1 year',
    'search.title': 'Archive & search', 'search.ph': 'Keywords (English, Norwegian or Vietnamese)…', 'search.submit': 'Search',
    'range.day': 'Day', 'range.week': 'Week', 'range.month': 'Month', 'range.all': 'All', 'range.custom': 'Custom',
    'search.count': '{n} articles',
    'settings.title': 'Settings', 'mode.legend': 'News processing mode',
    'mode.api.title': '1. Claude API (uses API credits)',
    'mode.api.desc': 'Processed right on the server. Estimated about USD 15–25/month at 20 articles/day (Sonnet 5.5), billed by usage at console.anthropic.com.',
    'mode.plan.title': '2. Claude Team/Pro plan (default – no extra cost if you already have a plan)',
    'mode.plan.desc': 'The server only collects and filters news; a scheduled Claude Code task running on your Claude account scores articles, writes briefs and digests, and translates on request. Uses no API credits; counts toward your plan’s usage limits. Setup: see docs/CLAUDE_PLAN.md.',
    'mode.free.title': '3. Free, no AI (Google Translate)',
    'mode.free.desc': 'Keyword filtering; the title and opening paragraph are machine-translated as the brief; no figures extracted; digests are compiled lists. The app stops translating at 500,000 characters per Google billing month (Pacific Time) so no charges occur.',
    'env.has': '✓ {name} is set', 'env.missing': '⚠ {name} is not set on the server',
    'usage.line': 'Month {period} (Pacific Time): used {used} / {limit} characters. Resets at {reset} (Oslo time).',
    'st.n': 'Max articles per day', 'st.hour': 'Automatic update hour (Oslo time)', 'st.min': 'Minimum relevance (0–100)',
    'st.minHint': 'Used when Claude scores articles (modes 1 and 2).', 'st.mail': 'Weekly brief recipient email',
    'st.weekly': 'Email the weekly brief (Monday morning)',
    'st.public': 'Allow viewing without signing in (default).',
    'st.publicHint': 'Visitors can only view, search, read and copy; updating, translating, digests and settings still require sign-in. Untick to require sign-in for everything.',
    'st.publicWarn': '⚠ APP_PASSWORD is not set on the server, so everyone has admin rights.',
    'st.samples': 'Sample briefs (Tin A)', 'st.samplesHint': 'Paste a few sample briefs; Claude will imitate their structure and style (not used in free mode).',
    'st.save': 'Save settings', 'st.saved': 'Saved.',
    'weekly.title': 'Weekly brief', 'weekly.from': 'From', 'weekly.to': 'To', 'weekly.download': 'Download Word file', 'weekly.send': 'Send email now',
    'weekly.sending': 'Creating file and sending…', 'weekly.sent': 'Sent {count} articles to {to}.',
    'sources.title': 'News sources', 'src.name': 'Source name', 'src.url': 'RSS URL',
    'src.paywall': 'Paywalled (skipped – full text not readable)', 'src.add': 'Add source', 'src.added': 'Source added', 'src.updated': 'Source updated',
    'src.confirmDelete': 'Delete this source?',
    'src.th.on': 'On', 'src.th.source': 'Source', 'src.th.lang': 'Language', 'src.th.paywall': 'Paywalled (skipped)',
    'src.th.paywallTitle': 'Paywalled sources are skipped because the full text cannot be read', 'src.th.filter': 'Keyword filter', 'src.th.status': 'Status',
    'src.langNo': 'Norwegian', 'src.langEn': 'English',
    'runs.title': 'Update log', 'runs.none': 'No updates yet.', 'runs.noLog': 'No log',
    'runs.manual': 'manual', 'runs.auto': 'automatic', 'runs.stats': '{processed} processed · {candidates} candidates',
    'runs.errors': ' · {n} errors', 'runs.queued': ' · {n} waiting for Claude',
    'cal.prev': 'Previous month', 'cal.next': 'Next month', 'cal.count': '{n} articles',
    'time.morning': 'a.m.', 'time.noon': 'noon', 'time.afternoon': 'p.m.', 'time.evening': 'p.m.',
  },
  vi: {
    'doc.title': 'NewsBrief · Bản tin đối ngoại',
    'lang.switch': 'English',
    'lang.switchAria': 'Switch to English',
    'login.tagline': 'Bản tin đối ngoại Na Uy – Việt Nam – ASEAN',
    'login.password': 'Mật khẩu',
    'login.submit': 'Đăng nhập',
    'login.back': '‹ Quay lại xem không cần đăng nhập',
    'brand.title': 'Về trang chủ (Bản tin ngày)',
    'nav.day': 'Bản tin ngày', 'nav.topic': 'Tổng hợp chủ đề', 'nav.search': 'Lưu trữ & tìm kiếm', 'nav.settings': 'Cài đặt',
    'tab.day': 'Hôm nay', 'tab.topic': 'Chủ đề', 'tab.search': 'Tìm kiếm', 'tab.settings': 'Cài đặt',
    'auth.logout': 'Đăng xuất', 'auth.adminLogin': 'Đăng nhập quản trị', 'auth.required': 'Cần đăng nhập',
    'common.copy': 'Sao chép', 'common.loading': 'Đang tải…', 'common.none': 'Chưa có.', 'common.delete': 'Xóa',
    'err.http': 'Lỗi {status}',
    'day.pickDate': 'Chọn ngày', 'day.run': 'Cập nhật ngay', 'day.today': 'hôm nay',
    'day.count': '{done} tin đã xử lý', 'day.countPending': ' · {n} đang chờ/lỗi', 'day.noArticles': 'Chưa có tin',
    'day.emptyTitle': 'Chưa có tin cho ngày này', 'day.emptyBody': 'Bản tin tự động chạy lúc {hour} giờ (giờ Na Uy).',
    'day.emptyAdmin': ' Bấm "Cập nhật ngay" để lấy tin ngay.',
    'day.autoNote': 'Tự động cập nhật vào {time} giờ Na Uy',
    'search.emptyTitle': 'Không tìm thấy tin phù hợp', 'search.emptyBody': 'Thử từ khóa khác hoặc mở rộng khoảng thời gian.',
    'digest.title': 'Tổng hợp tin trong ngày', 'digest.regen': 'Tạo lại', 'digest.regenerating': 'Đang tạo…',
    'digest.none': 'Chưa có bản tổng hợp.', 'digest.noneAdmin': 'Chưa có bản tổng hợp. Bấm "Tạo lại" để tạo.',
    'digest.updated': 'cập nhật {time}', 'digest.created': 'Đã tạo bản tổng hợp', 'digest.label': 'bản tổng hợp',
    'len.short': 'Nửa trang', 'len.medium': '1 trang', 'len.long': '2 trang',
    'cat.all': 'Tất cả', 'cat.chinh-tri': 'Chính trị', 'cat.kinh-te': 'Kinh tế', 'cat.van-hoa-xa-hoi': 'Văn hóa – XH', 'cat.any': 'Mọi lĩnh vực',
    'lang.en': 'Tiếng Anh', 'lang.no': 'Tiếng Na Uy',
    'badge.partial': 'phần công khai', 'badge.error': 'lỗi xử lý', 'badge.processing': 'đang xử lý',
    'reader.back': '‹ Danh sách', 'reader.openOriginal': 'Mở bài gốc ↗', 'reader.partial': 'Chỉ có phần công khai của bài',
    'reader.error': 'Lỗi xử lý: {msg}',
    'reader.pending': 'Bài đang chờ xử lý. Ở chế độ gói Claude Team/Pro, tin A và số liệu sẽ có sau lượt chạy Claude tiếp theo.',
    'tab.tina': 'Tin A', 'tab.trans': 'Bản dịch', 'tab.orig': 'Nguyên văn', 'tab.figs': 'Số liệu ({n})',
    'copy.tina': 'Sao chép tin A', 'copy.trans': 'Sao chép bản dịch', 'copy.orig': 'Sao chép nguyên văn', 'copy.figs': 'Sao chép số liệu',
    'label.tina': 'tin A', 'label.trans': 'bản dịch', 'label.orig': 'nguyên văn', 'label.figs': 'số liệu', 'label.command': 'lệnh',
    'copied': 'Đã sao chép {label}',
    'trans.retranslate': 'Dịch lại', 'trans.full': 'Dịch toàn văn',
    'trans.requested': 'Đã yêu cầu dịch toàn văn. Bản dịch sẽ có sau lượt chạy Claude (gói Team/Pro) tiếp theo.',
    'trans.notYet': 'Bài này chưa được dịch toàn văn (chỉ dịch khi cần để tiết kiệm chi phí).',
    'trans.notYetViewer': 'Bài này chưa được dịch toàn văn. Bản dịch chỉ được tạo khi có yêu cầu để tiết kiệm chi phí; vui lòng đăng nhập quản trị để yêu cầu dịch.',
    'trans.working': 'Đang dịch… (1–3 phút)', 'trans.error': 'Lỗi dịch: {msg}',
    'trans.queued': 'Đã đưa vào hàng đợi; Claude sẽ dịch ở lượt chạy tiếp theo', 'trans.done': 'Đã dịch toàn văn',
    'figs.none': 'Bài không có số liệu định lượng.', 'figs.source': 'Nguồn: {src}', 'copy.sourceWord': 'Nguồn',
    'reader.relevance': 'Mức liên quan {n}/100', 'reader.reprocess': 'Tóm tắt lại', 'reader.reprocessing': 'Đang xử lý… (1–2 phút)',
    'reprocess.queued': 'Đã đưa vào hàng đợi cho Claude (gói Team/Pro)', 'reprocess.done': 'Đã xử lý lại',
    'run.started': 'Đã bắt đầu cập nhật', 'run.done': 'Cập nhật xong', 'run.progress': '{step} · {done}/{total} tin',
    'topic.title': 'Tổng hợp theo chủ đề', 'topic.viewerNote': 'Đăng nhập quản trị để tạo bản tổng hợp mới; bên dưới là các bản đã lưu.',
    'topic.topic': 'Chủ đề', 'topic.ph': 'Ví dụ: Quỹ Dầu mỏ Na Uy đầu tư vào châu Á', 'topic.period': 'Khoảng thời gian', 'topic.length': 'Độ dài',
    'topic.scan': 'Quét thêm nguồn mới', 'topic.submit': 'Tổng hợp', 'topic.working': 'Đang tổng hợp…',
    'topic.searching': 'Đang tìm và tổng hợp tin…', 'topic.searchingScan': 'Đang tìm và tổng hợp tin, kèm quét nguồn mới (có thể mất vài phút)…',
    'topic.saved': 'Các bản tổng hợp đã lưu', 'topic.noneSaved': 'Chưa có bản tổng hợp nào.', 'topic.sources': 'Nguồn',
    'days.1': '1 ngày', 'days.n': '{n} ngày', 'days.365': '1 năm',
    'search.title': 'Lưu trữ & tìm kiếm', 'search.ph': 'Từ khóa (Anh, Na Uy hoặc Việt)…', 'search.submit': 'Tìm',
    'range.day': 'Ngày', 'range.week': 'Tuần', 'range.month': 'Tháng', 'range.all': 'Tất cả', 'range.custom': 'Tùy chọn',
    'search.count': '{n} tin',
    'settings.title': 'Cài đặt', 'mode.legend': 'Chế độ xử lý tin',
    'mode.api.title': '1. Claude API (dùng API credits)',
    'mode.api.desc': 'Xử lý ngay trên server. Ước tính khoảng 15–25 USD/tháng với 20 tin/ngày (Sonnet 5.5), tính theo lượng dùng tại console.anthropic.com.',
    'mode.plan.title': '2. Gói Claude Team/Pro (mặc định – không phát sinh thêm chi phí nếu đã có gói)',
    'mode.plan.desc': 'Server chỉ thu thập và lọc tin; tác vụ Claude Code chạy theo lịch bằng tài khoản Claude của bạn sẽ chấm điểm, viết tin A, tổng hợp và dịch theo yêu cầu. Không tốn API credits, tính vào hạn mức của gói. Cách cài: xem docs/CLAUDE_PLAN.md.',
    'mode.free.title': '3. Miễn phí, không dùng AI (Google Translate)',
    'mode.free.desc': 'Lọc tin bằng từ khóa; tiêu đề và đoạn mở đầu được dịch máy làm tin A; không trích số liệu; bản tổng hợp là danh sách ghép. App tự dừng dịch khi chạm 500.000 ký tự trong tháng tính phí của Google (giờ Thái Bình Dương) để không phát sinh phí.',
    'env.has': '✓ Đã có {name}', 'env.missing': '⚠ Chưa đặt {name} trên server',
    'usage.line': 'Tháng {period} (giờ Thái Bình Dương): đã dùng {used} / {limit} ký tự. Làm mới lúc {reset} (giờ Oslo).',
    'st.n': 'Số tin tối đa mỗi ngày', 'st.hour': 'Giờ cập nhật tự động (giờ Oslo)', 'st.min': 'Ngưỡng liên quan tối thiểu (0–100)',
    'st.minHint': 'Dùng khi Claude chấm điểm (chế độ 1 và 2).', 'st.mail': 'Email nhận bản tin tuần',
    'st.weekly': 'Gửi email bản tin tuần (sáng thứ Hai)',
    'st.public': 'Cho phép xem không cần đăng nhập (mặc định).',
    'st.publicHint': 'Khách chỉ xem, tìm kiếm, đọc và sao chép tin; cập nhật, dịch, tổng hợp và cài đặt vẫn cần đăng nhập. Bỏ chọn để chuyển về chế độ bắt buộc đăng nhập.',
    'st.publicWarn': '⚠ Chưa đặt APP_PASSWORD trên server nên ai vào cũng có quyền quản trị.',
    'st.samples': 'Mẫu tin A tham khảo', 'st.samplesHint': 'Dán vài mẫu tin A; Claude sẽ bắt chước cấu trúc và văn phong (không áp dụng cho chế độ miễn phí).',
    'st.save': 'Lưu cài đặt', 'st.saved': 'Đã lưu.',
    'weekly.title': 'Bản tin tuần', 'weekly.from': 'Từ', 'weekly.to': 'Đến', 'weekly.download': 'Tải file Word', 'weekly.send': 'Gửi email ngay',
    'weekly.sending': 'Đang tạo file và gửi…', 'weekly.sent': 'Đã gửi {count} tin tới {to}.',
    'sources.title': 'Nguồn tin', 'src.name': 'Tên nguồn', 'src.url': 'URL RSS',
    'src.paywall': 'Có thu phí (sẽ bỏ qua vì không đọc được toàn văn)', 'src.add': 'Thêm nguồn', 'src.added': 'Đã thêm nguồn', 'src.updated': 'Đã cập nhật nguồn',
    'src.confirmDelete': 'Xóa nguồn này?',
    'src.th.on': 'Bật', 'src.th.source': 'Nguồn', 'src.th.lang': 'Ngôn ngữ', 'src.th.paywall': 'Thu phí (bỏ qua)',
    'src.th.paywallTitle': 'Nguồn thu phí bị bỏ qua vì không đọc được toàn văn', 'src.th.filter': 'Lọc từ khóa', 'src.th.status': 'Tình trạng',
    'src.langNo': 'Na Uy', 'src.langEn': 'Anh',
    'runs.title': 'Nhật ký cập nhật', 'runs.none': 'Chưa có lượt cập nhật.', 'runs.noLog': 'Không có nhật ký',
    'runs.manual': 'thủ công', 'runs.auto': 'tự động', 'runs.stats': '{processed} tin xử lý · {candidates} ứng viên',
    'runs.errors': ' · {n} lỗi', 'runs.queued': ' · {n} chờ Claude',
    'cal.prev': 'Tháng trước', 'cal.next': 'Tháng sau', 'cal.count': '{n} tin',
    'time.morning': 'sáng', 'time.noon': 'trưa', 'time.afternoon': 'chiều', 'time.evening': 'tối',
  },
};

// Tên bước tiến độ do server gửi (tiếng Việt) → tiếng Anh
const STEP_EN = {
  'Bắt đầu': 'Starting',
  'Thu thập tin từ các nguồn': 'Collecting news from sources',
  'AI sàng lọc mức độ liên quan': 'AI relevance screening',
  'Lọc theo từ khóa': 'Keyword filtering',
  'Lấy nội dung bài': 'Fetching article text',
  'Dịch máy tiêu đề và đoạn mở đầu': 'Machine-translating titles and lead paragraphs',
  'Viết tin A, trích số liệu': 'Writing briefs, extracting figures',
  'Tổng hợp tin trong ngày': 'Building the daily digest',
};

const LANGS = ['en', 'vi'];
let LANG = 'en';
try { const saved = localStorage.getItem('nb_lang'); if (LANGS.includes(saved)) LANG = saved; } catch { /* trình duyệt chặn lưu trữ: dùng mặc định */ }

function t(key, vars = {}) {
  const s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
const tStep = step => (LANG === 'en' ? STEP_EN[step] || step : step);
const tDays = n => (Number(n) === 1 ? t('days.1') : Number(n) === 365 ? t('days.365') : t('days.n', { n }));
const LOCALE = () => (LANG === 'en' ? 'en-GB' : 'vi-VN');
const weekday = d => new Intl.DateTimeFormat(LOCALE(), { weekday: 'long', timeZone: 'UTC' }).format(d).replace(/^./, c => c.toUpperCase());
const monthLabel = (y, m) => (LANG === 'en'
  ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
  : `Tháng ${m}/${y}`);
const weekdaysShort = () => (LANG === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);

function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  document.title = t('doc.title');
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-days]').forEach(el => { el.textContent = tDays(el.dataset.days); });
}

function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  LANG = lang;
  try { localStorage.setItem('nb_lang', lang); } catch { /* bỏ qua */ }
  applyI18n();
  if (typeof window.onLangChange === 'function') window.onLangChange();
}
