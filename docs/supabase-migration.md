# Supabase Migration Starter

Mục tiêu giai đoạn đầu là dùng Supabase Free để lưu dữ liệu thô và các kết quả tính toán nhỏ. Không đưa toàn bộ `lib/data/statistics/*.json` lên DB ngay vì nhóm file này hiện khoảng 230MB và sẽ nhanh chạm giới hạn Free.

## 1. Tạo project Supabase Free

1. Vào Supabase Dashboard và tạo project mới.
2. Chọn region gần Vercel deployment nhất có thể.
3. Chờ project khởi tạo xong, vào SQL Editor.
4. Chạy toàn bộ SQL trong `supabase/migrations/001_initial_schema.sql`.
5. Chạy tiếp `supabase/migrations/002_app_config.sql` để tạo bảng cấu hình runtime.

## 2. Cấu hình local env

Thêm các biến sau vào `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` có thể public nếu bảng đã bật RLS đúng cách. `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng server/script, không đưa vào frontend.

## 3. Kiểm tra kết nối

```bash
npm run supabase:check
```

Nếu bảng chưa có dữ liệu nhưng kết nối đúng, lệnh sẽ trả về `lottery_results rows: 0`.

## 4. Seed dữ liệu xổ số thô

Chạy thử không ghi:

```bash
npm run supabase:seed:raw -- --dry-run
```

Ghi toàn bộ dữ liệu hiện có từ `lib/data/xsmb-2-digits.json`:

```bash
npm run supabase:seed:raw
```

Dữ liệu thô hiện khoảng hơn 7.000 ngày, rất nhỏ so với giới hạn Free. Sau bước này có thể kiểm tra lại:

```bash
npm run supabase:check
```

## 5. Upload thống kê lớn lên Supabase Storage

Các file `lib/data/statistics/*.json` hiện có file lớn hơn 50MB, vì vậy script sẽ gzip trước khi upload lên Storage private bucket `lottery-stats`.

Chạy thử:

```bash
npm run supabase:seed:stats -- --dry-run
```

Upload:

```bash
npm run supabase:seed:stats
```

Hoặc sync cả raw data và stats:

```bash
npm run supabase:sync
```

## 6. Bật runtime đọc Supabase

Mặc định code sẽ tự dùng Supabase nếu có env hợp lệ. Có thể ép rõ bằng:

```bash
LOTTERY_DATA_SOURCE=supabase
LOTTERY_STATS_SOURCE=supabase-storage
SUPABASE_STATS_BUCKET=lottery-stats
```

Nếu cần fallback local để debug:

```bash
LOTTERY_DATA_SOURCE=local
LOTTERY_STATS_SOURCE=local
```

## 7. Cấu hình Vercel/GitHub Actions

Trên Vercel, thêm Environment Variables:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STATS_BUCKET=lottery-stats
LOTTERY_DATA_SOURCE=supabase
LOTTERY_STATS_SOURCE=supabase-storage
```

Trên GitHub Actions, thêm repository secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Workflow `daily-update.yml` hiện sẽ sync dữ liệu mới lên Supabase sau khi generate. Mặc định không commit static JSON nữa. Nếu muốn giữ hành vi cũ, tạo repository variable:

```bash
COMMIT_STATIC_DATA=1
```

Sau khi deploy, kiểm tra production bằng endpoint:

```bash
/api/system/supabase-status
```

Kết quả đúng cần có `ok: true`, `source: "supabase"`, `rawRows` lớn hơn 0 và `storage.manifestFound: true`.

## 8. Nguyên tắc cho Free plan

- Chỉ lưu raw data và summary/cached result nhỏ.
- Không lưu các JSON lớn 50-70MB vào Postgres JSONB trong giai đoạn này.
- Lưu JSON lớn ở Storage dạng gzip để tránh vượt DB Free 500MB và upload limit mặc định.
- Các backtest nặng nên lưu summary theo năm/ngày, không lưu toàn bộ debug details nếu chưa cần.
- Khi chuyển API sang Supabase, vẫn giữ JSON local làm fallback cho đến khi đối chiếu đúng số liệu.

## 9. Pha tiếp theo

1. Tạo repository layer để service đọc qua adapter thay vì đọc trực tiếp `fs`.
2. Chuyển dần cache nhỏ như latest prediction, yearly backtest summary sang bảng chuyên biệt.
3. Tách các file stats lớn thành bảng/query index hóa, thay vì chỉ lưu snapshot gzip.
