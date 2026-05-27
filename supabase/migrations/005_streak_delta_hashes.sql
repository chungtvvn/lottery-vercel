-- Migration 005: Delta sync support for DB-backed streak statistics.
-- The daily generator uses these fingerprints to skip historical_streaks
-- rewrites when a pattern's full streak history did not change.

alter table public.streak_statistics
  add column if not exists stats_hash text,
  add column if not exists streaks_hash text;

create index if not exists idx_streak_statistics_delta_lookup
  on public.streak_statistics(category_type, pattern_key)
  include (stats_hash, streaks_hash);
