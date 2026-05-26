-- Migration 004: Query indexes for DB-backed statistics runtime.
-- These indexes support category/subcategory lookups without scanning all streak rows.

create index if not exists idx_streak_statistics_category_lookup
  on public.streak_statistics(category_type, category, subcategory);

create index if not exists idx_historical_streaks_category_lookup
  on public.historical_streaks(category_type, category, subcategory, end_date desc);

create index if not exists idx_historical_streaks_pattern_length
  on public.historical_streaks(pattern_key, length, end_date desc);
