create table if not exists public.or_planner_sync (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  planner_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.or_planner_sync enable row level security;

drop policy if exists "Users can read their own planner" on public.or_planner_sync;
drop policy if exists "Users can insert their own planner" on public.or_planner_sync;
drop policy if exists "Users can update their own planner" on public.or_planner_sync;

create policy "Users can read their own planner"
on public.or_planner_sync
for select
using (auth.uid() = user_id);

create policy "Users can insert their own planner"
on public.or_planner_sync
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own planner"
on public.or_planner_sync
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
