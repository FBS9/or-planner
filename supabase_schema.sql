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


create or replace function public.save_or_planner_sync_if_current(
  p_expected_updated_at timestamptz,
  p_planner_data jsonb
)
returns table(saved boolean, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved_at timestamptz := now();
  v_written_updated_at timestamptz;
  v_current_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.or_planner_sync as sync_row
  set planner_data = p_planner_data,
      updated_at = v_saved_at
  where sync_row.user_id = v_user_id
    and sync_row.updated_at is not distinct from p_expected_updated_at
  returning sync_row.updated_at
  into v_written_updated_at;

  if v_written_updated_at is not null then
    saved := true;
    updated_at := v_written_updated_at;
    return next;
    return;
  end if;

  if p_expected_updated_at is null then
    insert into public.or_planner_sync (user_id, planner_data, updated_at)
    values (v_user_id, p_planner_data, v_saved_at)
    on conflict (user_id) do nothing
    returning or_planner_sync.updated_at
    into v_written_updated_at;

    if v_written_updated_at is not null then
      saved := true;
      updated_at := v_written_updated_at;
      return next;
      return;
    end if;
  end if;

  select sync_row.updated_at
  into v_current_updated_at
  from public.or_planner_sync as sync_row
  where sync_row.user_id = v_user_id;

  saved := false;
  updated_at := v_current_updated_at;
  return next;
end;
$$;
