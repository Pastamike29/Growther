-- Daily per-account allowance for the authenticated, adult-only meal scan Edge Function.
create table public.meal_scan_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  scan_count smallint not null check (scan_count between 1 and 10),
  primary key (user_id, usage_day)
);

alter table public.meal_scan_usage enable row level security;
revoke all on table public.meal_scan_usage from public, anon, authenticated;

create or replace function public.consume_meal_scan_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scan_count smallint;
begin
  if v_user_id is null then
    return false;
  end if;

  insert into public.meal_scan_usage as u (user_id, usage_day, scan_count)
  values (v_user_id, CURRENT_DATE, 1)
  on conflict (user_id, usage_day) do update
    set scan_count = u.scan_count + 1
    where u.scan_count < 10
  returning scan_count into v_scan_count;

  return v_scan_count is not null;
end;
$$;

revoke all on function public.consume_meal_scan_quota() from public, anon;
grant execute on function public.consume_meal_scan_quota() to authenticated;
