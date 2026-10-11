# Truy cập dữ liệu NewsBrief cho Claude và công cụ khác

## Cách 1 – API chỉ-đọc (khuyến nghị)
Mọi yêu cầu gửi kèm header `Authorization: Bearer <READONLY_API_TOKEN>`.

| Endpoint | Nội dung |
|---|---|
| `GET /api/v1/schema` | Mô tả bảng, trường và endpoint |
| `GET /api/v1/articles?from=2026-10-01&to=2026-10-31&q=investment&category=kinh-te&limit=100&offset=0` | Danh sách tin (thêm `full=1` để lấy cả nguyên văn và bản dịch) |
| `GET /api/v1/articles/:id` | Một tin đầy đủ |
| `GET /api/v1/digests?kind=daily\|topic\|weekly&from=&to=` | Các bản tổng hợp |
| `GET /api/v1/figures?from=&to=&q=` | Toàn bộ số liệu kèm nguồn, ngày, báo, link |
| `GET /api/v1/stats` | Thống kê theo lĩnh vực, nguồn |

Khi cần Claude phân tích dữ liệu, có thể cung cấp địa chỉ trang và token, hoặc tải JSON từ các endpoint trên rồi gửi cho Claude.

## Cách 2 – Tài khoản MySQL chỉ-đọc
Trong hPanel → Databases → tạo thêm một user MySQL, chỉ cấp quyền `SELECT` trên database NewsBrief, bật Remote MySQL nếu truy vấn từ bên ngoài.

Bảng chính:
- `articles`: url, source_name, lang (en/no), title_original, title_vi, published_at, brief_date, content_original, full_text, translation_vi, tin_a_vi, key_figures (JSON: figure, context, source, type), category (chinh-tri / kinh-te / van-hoa-xa-hoi), relations, relevance (0–100)
- `digests`: kind (daily/topic/weekly), brief_date, topic, date_from, date_to, content_vi, article_ids
- `sources`, `settings`, `runs`
