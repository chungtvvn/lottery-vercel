-- Drop tables if they exist
DROP TABLE IF EXISTS "public"."cache_store";
DROP TABLE IF EXISTS "public"."lottery_results";

-- Create lottery_results table
CREATE TABLE "public"."lottery_results" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "date" date NOT NULL,
    "jackpot" text,
    "first" text,
    "second" text,
    "third" text,
    "fourth" text,
    "fifth" text,
    "sixth" text,
    "seventh" text,
    "special" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("id"),
    UNIQUE ("date")
);

-- Create cache_store table
CREATE TABLE "public"."cache_store" (
    "key" text NOT NULL,
    "data" jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("key")
);

-- Bật Row Level Security (RLS) để có thể cấu hình policy sau này (nếu cần)
ALTER TABLE "public"."lottery_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cache_store" ENABLE ROW LEVEL SECURITY;

-- Cấp quyền read public, CHÚ Ý DÙNG LỆNH IF NOT EXISTS VỚI POLICY DO NÓ KHÔNG CÓ LỆNH CREATE OR REPLACE
DO $$
BEGIN
    DROP POLICY IF EXISTS "Cho phép đọc lottery_results" ON "public"."lottery_results";
    DROP POLICY IF EXISTS "Cho phép đọc cache_store" ON "public"."cache_store";
    
    CREATE POLICY "Cho phép đọc lottery_results" ON "public"."lottery_results" FOR SELECT USING (true);
    CREATE POLICY "Cho phép đọc cache_store" ON "public"."cache_store" FOR SELECT USING (true);
END
$$;

