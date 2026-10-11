// Danh sách nguồn mặc định (RSS). Có thể bật/tắt/thêm nguồn trong mục "Cài đặt" của trang web.
// filter:false = nguồn chuyên về Na Uy/Việt Nam/ASEAN, không cần lọc từ khóa trước khi AI chấm điểm.
// paywall:true = báo thu phí: chỉ dùng phần công khai, luôn kèm link gốc.
const DEFAULT_SOURCES = [
  // --- Na Uy: nhà nước & báo chí ---
  { name: 'Regjeringen.no – Nyheter', url: 'https://www.regjeringen.no/no/rss/Rss/2581966/?documentType=aktuelt/nyheter', lang: 'no', region: 'norway', filter: false },
  { name: 'Regjeringen.no – Pressemeldinger', url: 'https://www.regjeringen.no/no/rss/Rss/2581966/?documentType=aktuelt/pressemeldinger', lang: 'no', region: 'norway', filter: false },
  { name: 'NRK – Siste nytt', url: 'https://www.nrk.no/nyheter/siste.rss', lang: 'no', region: 'norway' },
  { name: 'NRK – Urix (utenriks)', url: 'https://www.nrk.no/urix/toppsaker.rss', lang: 'no', region: 'norway' },
  { name: 'NRK – Norge', url: 'https://www.nrk.no/norge/toppsaker.rss', lang: 'no', region: 'norway' },
  { name: 'E24 (kinh tế)', url: 'https://e24.no/rss2/', lang: 'no', region: 'norway' },
  { name: 'Aftenposten', url: 'https://www.aftenposten.no/rss', lang: 'no', region: 'norway', paywall: true },
  { name: 'Dagens Næringsliv', url: 'https://services.dn.no/api/feed/rss/', lang: 'no', region: 'norway', paywall: true },
  { name: 'VG', url: 'https://www.vg.no/rss/feed', lang: 'no', region: 'norway' },
  { name: 'ABC Nyheter', url: 'https://www.abcnyheter.no/rss', lang: 'no', region: 'norway' },
  { name: 'Bistandsaktuelt', url: 'https://www.bistandsaktuelt.no/rss', lang: 'no', region: 'norway', filter: false },
  { name: 'The Local Norway', url: 'https://www.thelocal.no/feeds/rss.php', lang: 'en', region: 'norway', filter: false },
  { name: 'High North News', url: 'https://www.highnorthnews.com/en/rss.xml', lang: 'en', region: 'nordic', filter: false },
  { name: 'The Barents Observer', url: 'https://www.thebarentsobserver.com/rss', lang: 'en', region: 'nordic', filter: false },
  // --- Quốc tế ---
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en', region: 'intl' },
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', lang: 'en', region: 'intl' },
  { name: 'The Guardian – World', url: 'https://www.theguardian.com/world/rss', lang: 'en', region: 'intl' },
  { name: 'The Guardian – Business', url: 'https://www.theguardian.com/uk/business/rss', lang: 'en', region: 'intl' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', lang: 'en', region: 'intl' },
  { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', lang: 'en', region: 'intl' },
  { name: 'Euractiv', url: 'https://www.euractiv.com/feed/', lang: 'en', region: 'eu' },
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/', lang: 'en', region: 'eu' },
  // --- Châu Á / ASEAN / Việt Nam ---
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/', lang: 'en', region: 'asean' },
  { name: 'ASEAN Briefing', url: 'https://www.aseanbriefing.com/news/feed/', lang: 'en', region: 'asean', filter: false },
  { name: 'Vietnam Briefing', url: 'https://www.vietnam-briefing.com/news/feed/', lang: 'en', region: 'vietnam', filter: false },
  { name: 'VnExpress International', url: 'https://e.vnexpress.net/rss/news.rss', lang: 'en', region: 'vietnam' },
  { name: 'VnExpress Intl – Business', url: 'https://e.vnexpress.net/rss/business.rss', lang: 'en', region: 'vietnam' },
  { name: 'Viet Nam News – Politics', url: 'https://vietnamnews.vn/rss/politics-laws.rss', lang: 'en', region: 'vietnam' },
  { name: 'Viet Nam News – Economy', url: 'https://vietnamnews.vn/rss/economy.rss', lang: 'en', region: 'vietnam' },
  { name: 'South China Morning Post – Asia', url: 'https://www.scmp.com/rss/3/feed', lang: 'en', region: 'asean', paywall: true },
];

// Từ khóa lọc sơ bộ (chỉ áp dụng cho nguồn filter:true) trước khi AI chấm điểm.
const KEYWORDS = [
  // Na Uy & Bắc Âu
  'norway', 'norwegian', 'oslo', 'nordic', 'scandinavia', 'sweden', 'denmark', 'finland', 'iceland', 'arctic', 'svalbard',
  'norge', 'norsk', 'regjeringen', 'stortinget', 'statsminister', 'utenriksminister', 'oljefondet', 'equinor', 'statsbudsjett',
  'oljefond', 'norfund', 'norad', 'nato', 'eøs', 'eea',
  // Việt Nam & ASEAN
  'vietnam', 'viet nam', 'hanoi', 'ho chi minh', 'asean', 'southeast asia', 'indonesia', 'malaysia', 'thailand', 'philippines',
  'singapore', 'cambodia', 'laos', 'myanmar', 'brunei', 'timor', 'south china sea', 'sørøst-asia', 'østersjøen',
  // Các nước lớn, EU, điểm nóng, kinh tế
  'european union', 'brussels', 'eu ', ' eu-', 'tariff', 'sanction', 'trade war', 'china', 'beijing', 'russia', 'moscow',
  'ukraine', 'united states', 'washington', 'white house', 'g7', 'g20', 'wto', 'imf', 'opec', 'united nations', 'middle east',
  'gaza', 'iran', 'taiwan', 'kina', 'russland', 'usa', 'toll', 'sanksjon', 'handel', 'investering', 'rentebeslutning', 'norges bank',
  'sovereign wealth fund', 'oil price', 'gas price', 'lng', 'shipping', 'seafood', 'sjømat', 'laks', 'salmon', 'offshore wind',
  'havvind', 'blue economy', 'climate finance', 'free trade', 'frihandel', 'efta',
];

module.exports = { DEFAULT_SOURCES, KEYWORDS };
