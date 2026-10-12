# Chế độ "Gói Claude Team/Pro"

Ở chế độ này server **không gọi Claude API** (không tốn API credits). Server chỉ thu thập tin, lọc sơ bộ bằng từ khóa và đưa bài vào hàng đợi. Một tác vụ **Claude Code** chạy theo lịch bằng tài khoản Claude của bạn (gói có quyền dùng Claude Code) sẽ:

- chấm mức liên quan, loại bài không phù hợp;
- viết tiêu đề tiếng Việt, tin A, trích số liệu;
- viết bản tổng hợp tin trong ngày;
- dịch toàn văn các bài bạn đã bấm "Dịch toàn văn".

Mức sử dụng được tính vào hạn mức của gói Claude. Kết quả chỉ xuất hiện trên web sau mỗi lượt tác vụ chạy (không tức thì như chế độ API).

## 1. Trên Hostinger

1. Tạo một chuỗi ngẫu nhiên dài (ví dụ bằng lệnh PowerShell trong hướng dẫn biến môi trường) và thêm biến môi trường **`AGENT_API_TOKEN`** = chuỗi đó. Khởi động lại app.
2. Vào trang web → **Cài đặt** → **Chế độ xử lý tin** → chọn **2. Gói Claude Team/Pro** → **Lưu cài đặt**. Dòng gợi ý phải hiện "✓ Đã có AGENT_API_TOKEN".

## 2. Trên máy tính chạy Claude Code

1. Clone repo (nếu chưa có): `git clone https://github.com/nghiaphuong/newsbrief.git`
2. Tạo file **`.newsbrief-agent.env`** ở thư mục gốc repo (file này đã được loại khỏi git, không bị đẩy lên GitHub):

   ```
   NEWSBRIEF_URL=https://ten-mien-cua-ban
   NEWSBRIEF_AGENT_TOKEN=<giá trị AGENT_API_TOKEN>
   ```

3. Kiểm tra kết nối: `node tools/claude-agent.js pull` → phải thấy "Đã tải …" hoặc "NO_JOBS".
4. Chạy thử một lượt: mở Claude Code trong thư mục repo và gõ lệnh **`/newsbrief`**.

## 3. Đặt lịch chạy tự động

**Cách A – Claude desktop app (khuyên dùng):** trong Claude desktop, tạo **Scheduled task** với thư mục làm việc là repo NewsBrief, lời nhắc `/newsbrief`, lịch chạy hằng ngày sau giờ cập nhật tự động của app (ví dụ app cập nhật lúc 8:00 thì đặt 8:30, thêm 12:30 và 16:30 để xử lý các bài dịch theo yêu cầu). Máy tính cần bật và mở Claude desktop vào giờ chạy.

**Cách B – Claude Code trên cloud (claude.ai/code, Routines):** tạo routine dùng repo `nghiaphuong/newsbrief`, lời nhắc `/newsbrief`, đặt hai biến môi trường `NEWSBRIEF_URL` và `NEWSBRIEF_AGENT_TOKEN` trong cấu hình môi trường của routine. Không cần máy tính bật.

## Cách hoạt động (kỹ thuật)

- `GET /api/agent/jobs?limit=8` (header `Authorization: Bearer <AGENT_API_TOKEN>`): trả `instructions` (cùng chuẩn mực với chế độ API, lấy từ `src/ai.js`), `articles` (bài chờ xử lý), `translations` (bài được yêu cầu dịch), `digests` (ngày cần viết bản tổng hợp) và số việc còn lại.
- `POST /api/agent/results`: nhận `{articles, translations, digests}`. Bài có `"discard": true` được đánh dấu "skipped" và ẩn khỏi danh sách.
- `tools/claude-agent.js` lo phần gọi API; Claude chỉ đọc `.newsbrief/jobs.json` và viết `.newsbrief/results.json` theo lệnh `.claude/commands/newsbrief.md`.
- Khi chuyển từ chế độ khác sang chế độ này, các bài cũ giữ nguyên; chỉ bài mới được đưa vào hàng đợi.
