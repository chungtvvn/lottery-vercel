-- Lottery Stats: Supabase Free starter schema
-- Mục tiêu giai đoạn 1: lưu dữ liệu thô + cache/prediction/backtest nhỏ.
-- Chưa đưa các file thống kê JSON lớn 50-70MB vào DB để tránh vượt giới hạn Free.

create extension if not exists pgcrypto;

create table if not exists public.lottery_results (
  draw_date date primary key,
  special smallint,
  prize1 smallint,
  prize2_1 smallint,
  prize2_2 smallint,
  prize3_1 smallint,
  prize3_2 smallint,
  prize3_3 smallint,
  prize3_4 smallint,
  prize3_5 smallint,
  prize3_6 smallint,
  prize4_1 smallint,
  prize4_2 smallint,
  prize4_3 smallint,
  prize4_4 smallint,
  prize5_1 smallint,
  prize5_2 smallint,
  prize5_3 smallint,
  prize5_4 smallint,
  prize5_5 smallint,
  prize5_6 smallint,
  prize6_1 smallint,
  prize6_2 smallint,
  prize6_3 smallint,
  prize7_1 smallint,
  prize7_2 smallint,
  prize7_3 smallint,
  prize7_4 smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pattern_definitions (
  pattern_key text primary key,
  pattern_name text not null,
  category text not null,
  pattern_type text,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cache_store (
  cache_key text primary key,
  namespace text not null default 'default',
  data jsonb not null,
  is_public boolean not null default true,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_prediction_runs (
  id uuid primary key default gen_random_uuid(),
  prediction_date date not null unique,
  source_draw_date date references public.lottery_results(draw_date),
  strategy_version text not null default 'supabase-free-v1',
  summary jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create table if not exists public.daily_prediction_items (
  id bigserial primary key,
  run_id uuid not null references public.daily_prediction_runs(id) on delete cascade,
  pattern_key text,
  pattern_name text not null,
  tier smallint,
  priority_score numeric(6, 2),
  status text,
  excluded_numbers smallint[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_number_decisions (
  run_id uuid not null references public.daily_prediction_runs(id) on delete cascade,
  number smallint not null check (number between 0 and 99),
  decision text not null check (decision in ('bet', 'exclude', 'hold', 'skip')),
  priority_rank integer,
  source_item_ids bigint[] not null default '{}',
  reason jsonb not null default '{}'::jsonb,
  primary key (run_id, number)
);

create table if not exists public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  method_key text not null,
  config jsonb not null default '{}'::jsonb,
  start_date date,
  end_date date,
  status text not null default 'completed',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.backtest_yearly_results (
  run_id uuid not null references public.backtest_runs(id) on delete cascade,
  year integer not null,
  total_days integer not null default 0,
  bet_days integer not null default 0,
  hit_days integer not null default 0,
  miss_days integer not null default 0,
  profit numeric(14, 2) not null default 0,
  stake numeric(14, 2) not null default 0,
  payout numeric(14, 2) not null default 0,
  details jsonb not null default '{}'::jsonb,
  primary key (run_id, year)
);

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_prediction_items_run_priority
  on public.daily_prediction_items(run_id, priority_score desc nulls last);

create index if not exists idx_daily_prediction_items_pattern
  on public.daily_prediction_items(pattern_key);

create index if not exists idx_cache_store_namespace
  on public.cache_store(namespace, updated_at desc);

create index if not exists idx_backtest_runs_method_created
  on public.backtest_runs(method_key, created_at desc);

create index if not exists idx_job_runs_type_status_created
  on public.job_runs(job_type, status, created_at desc);

alter table public.lottery_results enable row level security;
alter table public.pattern_definitions enable row level security;
alter table public.cache_store enable row level security;
alter table public.daily_prediction_runs enable row level security;
alter table public.daily_prediction_items enable row level security;
alter table public.daily_number_decisions enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.backtest_yearly_results enable row level security;
alter table public.job_runs enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select on public.lottery_results to anon, authenticated;
grant select on public.pattern_definitions to anon, authenticated;
grant select on public.cache_store to anon, authenticated;
grant select on public.daily_prediction_runs to anon, authenticated;
grant select on public.daily_prediction_items to anon, authenticated;
grant select on public.daily_number_decisions to anon, authenticated;
grant select on public.backtest_runs to anon, authenticated;
grant select on public.backtest_yearly_results to anon, authenticated;

grant all on public.lottery_results to service_role;
grant all on public.pattern_definitions to service_role;
grant all on public.cache_store to service_role;
grant all on public.daily_prediction_runs to service_role;
grant all on public.daily_prediction_items to service_role;
grant all on public.daily_number_decisions to service_role;
grant all on public.backtest_runs to service_role;
grant all on public.backtest_yearly_results to service_role;
grant all on public.job_runs to service_role;
grant usage, select on all sequences in schema public to service_role;

drop policy if exists "Public read lottery_results" on public.lottery_results;
create policy "Public read lottery_results"
  on public.lottery_results for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read pattern_definitions" on public.pattern_definitions;
create policy "Public read pattern_definitions"
  on public.pattern_definitions for select
  to anon, authenticated
  using (enabled = true);

drop policy if exists "Public read cache_store" on public.cache_store;
create policy "Public read cache_store"
  on public.cache_store for select
  to anon, authenticated
  using (is_public = true and (expires_at is null or expires_at > now()));

drop policy if exists "Public read daily_prediction_runs" on public.daily_prediction_runs;
create policy "Public read daily_prediction_runs"
  on public.daily_prediction_runs for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read daily_prediction_items" on public.daily_prediction_items;
create policy "Public read daily_prediction_items"
  on public.daily_prediction_items for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read daily_number_decisions" on public.daily_number_decisions;
create policy "Public read daily_number_decisions"
  on public.daily_number_decisions for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read backtest_runs" on public.backtest_runs;
create policy "Public read backtest_runs"
  on public.backtest_runs for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read backtest_yearly_results" on public.backtest_yearly_results;
create policy "Public read backtest_yearly_results"
  on public.backtest_yearly_results for select
  to anon, authenticated
  using (true);

drop policy if exists "Service write lottery_results" on public.lottery_results;
create policy "Service write lottery_results"
  on public.lottery_results for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write pattern_definitions" on public.pattern_definitions;
create policy "Service write pattern_definitions"
  on public.pattern_definitions for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write cache_store" on public.cache_store;
create policy "Service write cache_store"
  on public.cache_store for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write daily_prediction_runs" on public.daily_prediction_runs;
create policy "Service write daily_prediction_runs"
  on public.daily_prediction_runs for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write daily_prediction_items" on public.daily_prediction_items;
create policy "Service write daily_prediction_items"
  on public.daily_prediction_items for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write daily_number_decisions" on public.daily_number_decisions;
create policy "Service write daily_number_decisions"
  on public.daily_number_decisions for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write backtest_runs" on public.backtest_runs;
create policy "Service write backtest_runs"
  on public.backtest_runs for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write backtest_yearly_results" on public.backtest_yearly_results;
create policy "Service write backtest_yearly_results"
  on public.backtest_yearly_results for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service write job_runs" on public.job_runs;
create policy "Service write job_runs"
  on public.job_runs for all
  to service_role
  using (true)
  with check (true);
