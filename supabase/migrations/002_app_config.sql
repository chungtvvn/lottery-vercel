create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

grant select on public.app_config to anon, authenticated;
grant all on public.app_config to service_role;

drop policy if exists "Public read app_config" on public.app_config;
create policy "Public read app_config"
  on public.app_config for select
  to anon, authenticated
  using (true);

drop policy if exists "Service write app_config" on public.app_config;
create policy "Service write app_config"
  on public.app_config for all
  to service_role
  using (true)
  with check (true);

insert into public.app_config (key, value)
values (
  'stats_config',
  '{
    "GAP_STRATEGY": "COMBINED",
    "GAP_BUFFER_PERCENT": 0,
    "GAP_THRESHOLD_PERCENT": 0,
    "USE_CONFIDENCE_SCORE": false,
    "EXCLUSION_STRATEGY": "4tier",
    "INITIAL_BET_AMOUNT": 10,
    "BET_STEP_AMOUNT": 5
  }'::jsonb
)
on conflict (key) do nothing;
