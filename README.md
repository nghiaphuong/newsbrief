# NewsBrief – Bản tin đối ngoại Na Uy · Việt Nam · ASEAN

Ứng dụng Node.js + MySQL tự động tìm, sàng lọc, dịch và tóm tắt tin tức tiếng Anh và tiếng Na Uy phục vụ công tác nghiên cứu, báo cáo tại Đại sứ quán Việt Nam tại Na Uy.

## Chức năng
- **Bản tin hằng ngày** lúc 8:00 (giờ Oslo), tối đa 20 tin/ngày (chỉnh được), nút **Cập nhật ngay**.
- Nguồn: RSS của báo chí và cơ quan nhà nước Na Uy, báo quốc tế, báo về ASEAN/Việt Nam, kết hợp quét toàn cầu qua GDELT. Bật/tắt/thêm nguồn trong **Cài đặt**.
- Claude chấm điểm mức liên quan (chế độ 1, 2; chế độ miễn phí dùng từ khóa) theo thứ tự ưu tiên: Na Uy–Việt Nam → Na Uy–ASEAN → chính trị/đối ngoại → kinh tế (chính sách, đầu tư, thương mại, doanh nghiệp) → văn hóa–xã hội.
- Mỗi bài: nguyên văn, **tin A**, **bảng số liệu kèm nguồn**, link bài gốc; nút sao chép từng phần.
- **Bản dịch đầy đủ theo yêu cầu**: bấm "Dịch toàn văn" trong tab Bản dịch (không dịch tự động để tiết kiệm chi phí Claude API).
- **Tổng hợp tin trong ngày** (nửa trang / 1 trang / 2 trang).
- **Tổng hợp theo chủ đề**: tự nhập chủ đề, chọn độ dài và số ngày; tùy chọn quét thêm nguồn mới.
- **Lưu trữ vĩnh viễn**, tìm theo ngày / tuần / tháng / khoảng tùy chọn / từ khóa (Anh, Na Uy, Việt).
- **Email bản tin tuần** (sáng thứ Hai) kèm file Word: tổng quan tuần, tổng hợp từng ngày, tin A, số liệu, bản dịch (bài đã dịch toàn văn), nguyên văn và link gốc.
- **API chỉ-đọc** `/api/v1/*` để Claude hoặc công cụ khác truy vấn dữ liệu (xem `docs/CLAUDE_ACCESS.md`).
- Giao diện riêng cho desktop (3 cột), máy tính bảng và di động (thanh tab dưới, khung đọc toàn màn hình); tự chuyển chế độ sáng/tối.

## Ba chế độ xử lý (Cài đặt → Chế độ xử lý tin)
| Chế độ | Chấm điểm & tin A | Tổng hợp | Dịch toàn văn | Chi phí |
|---|---|---|---|---|
| 1. Claude API | Claude, ngay trên server | Claude viết | Claude, ngay khi bấm | Ước tính 15–25 USD/tháng với 20 tin/ngày (`ANTHROPIC_API_KEY`) |
| 2. Gói Claude Team/Pro (**mặc định**) | Claude Code chạy theo lịch bằng tài khoản của bạn | Claude viết (bản tổng hợp ngày); chủ đề & tuần là danh sách ghép | Claude, ở lượt chạy tiếp theo | 0 USD thêm nếu đã có gói; tính vào hạn mức gói (`AGENT_API_TOKEN`, xem `docs/CLAUDE_PLAN.md`) |
| 3. Miễn phí | Lọc từ khóa; dịch máy tiêu đề + đoạn mở đầu; không trích số liệu | Danh sách ghép từ tin A | Google Translate, ngay khi bấm | 0 USD: app tự dừng ở 500.000 ký tự/tháng tính phí của Google (`GOOGLE_TRANSLATE_API_KEY`) |

## Nguyên tắc nội dung
- Chỉ dịch/tóm tắt từ văn bản nguồn; không bịa nguồn, không suy diễn.
- Giữ nguyên mọi số liệu cùng nguồn trích dẫn/dự báo; số liệu được tách riêng để dễ đưa vào báo cáo.
- Chỉ lấy bài đọc được toàn văn: bỏ qua nguồn thu phí (paywall) và bài chỉ tải được trích đoạn (dưới 1.500 ký tự).
- Trang có đăng nhập và `noindex` vì lưu toàn văn bài báo để sử dụng nội bộ.

## Triển khai trên Hostinger (Node.js Web App)
1. hPanel → Databases → tạo database MySQL + user.
2. Websites → Add website → Node.js Web App → Import Git Repository → chọn `newsbrief`, nhánh `main`.
   - Framework: Express · Entry file: `server.js` · Node 20/22 · Build: để trống hoặc `npm run build`.
3. Đặt biến môi trường theo `.env.example` (DB_*, APP_PASSWORD, SESSION_SECRET, SMTP_*, CRON_KEY, READONLY_API_TOKEN, và khóa của chế độ xử lý bạn dùng: ANTHROPIC_API_KEY / AGENT_API_TOKEN / GOOGLE_TRANSLATE_API_KEY).
4. Deploy. Bảng dữ liệu tự tạo khi khởi động.
5. (Khuyến nghị) hPanel → Advanced → Cron Jobs, mỗi 10 phút:
   `curl -s "https://<tên-miền>/api/cron/tick?key=<CRON_KEY>" >/dev/null`
   để bảo đảm lịch 8:00 và email tuần vẫn chạy khi tiến trình Node tạm ngủ.

## Chạy thử trên máy
```bash
cp .env.example .env   # điền thông tin
npm install
npm start              # http://localhost:3000
npm run run-now        # chạy ngay một lượt lấy tin
```

## Cấu trúc
```
server.js              Khởi động Express, migrate CSDL, bật lịch
src/config.js          Biến môi trường
src/schema.sql         Cấu trúc bảng (articles, digests, sources, settings, runs)
src/sources.js         Nguồn RSS mặc định + từ khóa lọc sơ bộ
src/fetcher.js         Thu thập RSS/GDELT, trích nội dung bài
src/ai.js              Prompt & lời gọi Claude (chấm điểm, dịch, tin A, số liệu, tổng hợp)
src/pipeline.js        Quy trình bản tin ngày (theo chế độ xử lý)
src/heuristic.js       Lọc từ khóa, tin A dịch máy, bản tổng hợp ghép (không dùng AI)
src/translator.js      Dịch máy Google + bộ đếm hạn mức 500.000 ký tự/tháng (chế độ miễn phí)
src/agent.js           Giao việc / nhận kết quả cho Claude Code (chế độ gói Claude)
tools/claude-agent.js  Công cụ dòng lệnh cho tác vụ Claude Code (pull/push)
.claude/commands/newsbrief.md  Lệnh /newsbrief cho Claude Code
src/topics.js          Tổng hợp theo chủ đề
src/weekly.js          File Word + email tuần
src/scheduler.js       Lịch 8:00 / email thứ Hai, có cơ chế chạy bù
src/routes/api.js      REST API (giao diện + /api/v1 chỉ-đọc)
public/                Giao diện web
```
