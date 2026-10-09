-- Set the shared photo-scan and typed-meal estimate allowance to seven requests per account per UTC day.
begin;

update public.meal_scan_usage
set scan_count = 7
where scan_count > 7;

alter table public.meal_scan_usage
  drop constraint if exists meal_scan_usage_scan_count_check;
alter table public.meal_scan_usage
  add constraint meal_scan_usage_scan_count_check check (scan_count between 1 and 7);

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
    where u.scan_count < 7
  returning scan_count into v_scan_count;

  return v_scan_count is not null;
end;
$$;

revoke all on function public.consume_meal_scan_quota() from public, anon;
grant execute on function public.consume_meal_scan_quota() to authenticated;

commit;
