-- Migration 003: Streak DB Storage Schema
-- Supports O(1) memory and O(C) scaling for lottery pattern streak statistics

CREATE TABLE IF NOT EXISTS public.streak_statistics (
  pattern_key text PRIMARY KEY,
  category_type text NOT NULL,        -- 'number', 'head_tail', 'sum_diff'
  category text NOT NULL,             -- e.g. 'chanChan', 'dau_chan'
  subcategory text,                   -- e.g. 'veLienTiep', 'veSole', or null if flat
  description text,
  longest_streak jsonb,               -- Array of longest streaks
  second_longest_streak jsonb,        -- Array of second longest streaks
  current_streak jsonb,               -- Current ongoing streak object
  average_interval numeric(10, 2),
  days_since_last integer,
  gap_stats jsonb,
  exact_gap_stats jsonb,
  extension_gap_stats jsonb,
  length_history_metrics jsonb,
  history_metrics jsonb,
  reliability jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.historical_streaks (
  id bigserial PRIMARY KEY,
  pattern_key text NOT NULL,
  category_type text NOT NULL,        -- 'number', 'head_tail', 'sum_diff'
  category text NOT NULL,             -- e.g. 'chanChan'
  subcategory text,                   -- e.g. 'veLienTiep'
  start_date date NOT NULL,
  end_date date NOT NULL,
  length integer NOT NULL,
  values text[] NOT NULL,
  dates text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_historical_streaks_pattern_key 
  ON public.historical_streaks(pattern_key);

CREATE INDEX IF NOT EXISTS idx_historical_streaks_end_date 
  ON public.historical_streaks(pattern_key, end_date DESC);

CREATE INDEX IF NOT EXISTS idx_streak_statistics_category_type 
  ON public.streak_statistics(category_type);

-- Row Level Security (RLS) policies
ALTER TABLE public.streak_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_streaks ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.streak_statistics TO anon, authenticated;
GRANT SELECT ON public.historical_streaks TO anon, authenticated;

GRANT ALL ON public.streak_statistics TO service_role;
GRANT ALL ON public.historical_streaks TO service_role;

DROP POLICY IF EXISTS "Public read streak_statistics" ON public.streak_statistics;
CREATE POLICY "Public read streak_statistics"
  ON public.streak_statistics FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read historical_streaks" ON public.historical_streaks;
CREATE POLICY "Public read historical_streaks"
  ON public.historical_streaks FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Service write streak_statistics" ON public.streak_statistics;
CREATE POLICY "Service write streak_statistics"
  ON public.streak_statistics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service write historical_streaks" ON public.historical_streaks;
CREATE POLICY "Service write historical_streaks"
  ON public.historical_streaks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
