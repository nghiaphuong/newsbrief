# NewsBrief – Bản tin đối ngoại Na Uy · Việt Nam · ASEAN

Ứng dụng Node.js + MySQL tự động tìm, sàng lọc, dịch và tóm tắt tin tức tiếng Anh và tiếng Na Uy phục vụ công tác nghiên cứu, báo cáo tại Đại sứ quán Việt Nam tại Na Uy.

## Chức năng
- **Bản tin hằng ngày** lúc 8:00 (giờ Oslo), tối đa 20 tin/ngày (chỉnh được), nút **Cập nhật ngay**.
- Nguồn: RSS của báo chí và cơ quan nhà nước Na Uy, báo quốc tế, báo về ASEAN/Việt Nam, kết hợp quét toàn cầu qua GDELT. Bật/tắt/thêm nguồn trong **Cài đặt**.
- AI (Claude) chấm điểm mức liên quan theo thứ tự ưu tiên: Na Uy–Việt Nam → Na Uy–ASEAN → chính trị/đối ngoại → kinh tế (chính sách, đầu tư, thương mại, doanh nghiệp) → văn hóa–xã hội.
- Mỗi bài: nguyên văn, **bản dịch đầy đủ**, **tin A**, **bảng số liệu kèm nguồn**, link bài gốc; nút sao chép từng phần.
- **Tổng hợp tin trong ngày** (nửa trang / 1 trang / 2 trang).
- **Tổng hợp theo chủ đề**: tự nhập chủ đề, chọn độ dài và số ngày; tùy chọn quét thêm nguồn mới.
- **Lưu trữ vĩnh viễn**, tìm theo ngày / tuần / tháng / khoảng tùy chọn / từ khóa (Anh, Na Uy, Việt).
- **Email bản tin tuần** (sáng thứ Hai) kèm file Word: tổng quan tuần, tổng hợp từng ngày, tin A, số liệu, bản dịch, nguyên văn và link gốc.
- **API chỉ-đọc** `/api/v1/*` để Claude hoặc công cụ khác truy vấn dữ liệu (xem `docs/CLAUDE_ACCESS.md`).
- Giao diện riêng cho desktop (3 cột), máy tính bảng và di động (thanh tab dưới, khung đọc toàn màn hình); tự chuyển chế độ sáng/tối.

## Nguyên tắc nội dung
- Chỉ dịch/tóm tắt từ văn bản nguồn; không bịa nguồn, không suy diễn.
- Giữ nguyên mọi số liệu cùng nguồn trích dẫn/dự báo; số liệu được tách riêng để dễ đưa vào báo cáo.
- Không vượt tường phí (paywall): với báo thu phí chỉ dùng phần công khai và gắn nhãn "phần công khai".
- Trang có đăng nhập và `noindex` vì lưu toàn văn bài báo để sử dụng nội bộ.

## Triển khai trên Hostinger (Node.js Web App)
1. hPanel → Databases → tạo database MySQL + user.
2. Websites → Add website → Node.js Web App → Import Git Repository → chọn `newsbrief`, nhánh `main`.
   - Framework: Express · Entry file: `server.js` · Node 20/22 · Build: để trống hoặc `npm run build`.
3. Đặt biến môi trường theo `.env.example` (DB_*, APP_PASSWORD, SESSION_SECRET, ANTHROPIC_API_KEY, SMTP_*, CRON_KEY, READONLY_API_TOKEN).
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
src/pipeline.js        Quy trình bản tin ngày
src/topics.js          Tổng hợp theo chủ đề
src/weekly.js          File Word + email tuần
src/scheduler.js       Lịch 8:00 / email thứ Hai, có cơ chế chạy bù
src/routes/api.js      REST API (giao diện + /api/v1 chỉ-đọc)
public/                Giao diện web
```
