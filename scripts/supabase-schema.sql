-- =============================================
-- LOTTERY-STATS: Supabase Database Schema
-- Chạy SQL này trong Supabase SQL Editor
-- =============================================

-- 1. Bảng dữ liệu xổ số thô (7,368+ rows)
CREATE TABLE IF NOT EXISTS lottery_results (
  id SERIAL PRIMARY KEY,
  draw_date DATE NOT NULL UNIQUE,
  special INT,
  prize1 INT,
  prize2_1 INT, prize2_2 INT,
  prize3_1 INT, prize3_2 INT, prize3_3 INT,
  prize3_4 INT, prize3_5 INT, prize3_6 INT,
  prize4_1 INT, prize4_2 INT, prize4_3 INT, prize4_4 INT,
  prize5_1 INT, prize5_2 INT, prize5_3 INT,
  prize5_4 INT, prize5_5 INT, prize5_6 INT,
  prize6_1 INT, prize6_2 INT, prize6_3 INT,
  prize7_1 INT, prize7_2 INT, prize7_3 INT, prize7_4 INT
);

-- Create index for fast date queries
CREATE INDEX IF NOT EXISTS idx_lottery_results_draw_date ON lottery_results(draw_date);

-- 2. Bảng cache pre-computed data
CREATE TABLE IF NOT EXISTS cache_store (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bảng lịch sử dự đoán
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  prediction_date DATE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(prediction_date);

-- 4. Bảng cấu hình ứng dụng
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config
INSERT INTO app_config (key, value) VALUES 
  ('stats_config', '{"GAP_STRATEGY":"COMBINED","GAP_BUFFER_PERCENT":0,"GAP_THRESHOLD_PERCENT":0,"USE_CONFIDENCE_SCORE":false,"EXCLUSION_STRATEGY":"4tier","INITIAL_BET_AMOUNT":10,"BET_STEP_AMOUNT":5}')
ON CONFLICT (key) DO NOTHING;

-- 5. Enable RLS (Row Level Security) nhưng cho phép đọc public
ALTER TABLE lottery_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Policy: cho phép đọc public (anon key)
CREATE POLICY "Public read lottery_results" ON lottery_results FOR SELECT TO anon USING (true);
CREATE POLICY "Public read cache_store" ON cache_store FOR SELECT TO anon USING (true);
CREATE POLICY "Public read predictions" ON predictions FOR SELECT TO anon USING (true);
CREATE POLICY "Public read app_config" ON app_config FOR SELECT TO anon USING (true);

-- Policy: chỉ service_role mới được ghi
CREATE POLICY "Service write lottery_results" ON lottery_results FOR ALL TO service_role USING (true);
CREATE POLICY "Service write cache_store" ON cache_store FOR ALL TO service_role USING (true);
CREATE POLICY "Service write predictions" ON predictions FOR ALL TO service_role USING (true);
CREATE POLICY "Service write app_config" ON app_config FOR ALL TO service_role USING (true);
