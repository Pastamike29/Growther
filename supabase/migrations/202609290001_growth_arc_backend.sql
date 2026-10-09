-- Growth Arc MVP backend: private user records with strict per-user access.
-- Apply once to a NEW Supabase project. Do not put a Supabase secret key in the app.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Explorer' check (char_length(nickname) between 1 and 24),
  -- Cloud pilot is adult-only. Expand only after appropriate youth privacy/guardian safeguards exist.
  age_band text check (age_band in ('18–24', '25+')),
  nutrition_reference text not null default 'general'
    check (nutrition_reference in ('general', 'female', 'male')),
  goal text not null default 'Build a steady routine'
    check (char_length(goal) <= 80),
  activity_level text not null default 'New to exercise'
    check (char_length(activity_level) <= 80),
  diet_preference text not null default 'No preference'
    check (char_length(diet_preference) <= 80),
  character_key text not null default 'cat-1'
    check (character_key ~ '^[a-z0-9-]{1,40}$'),
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.sleep_logs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  bedtime time not null,
  wake_time time not null,
  duration_minutes smallint not null check (duration_minutes between 1 and 1440),
  created_at timestamptz not null default pg_catalog.now(),
  unique (user_id, sleep_date)
);

create table public.nutrition_logs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  meal_name text not null check (char_length(meal_name) between 1 and 160),
  meal_slot text not null default 'snack'
    check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  protein_g numeric(7, 1) not null default 0 check (protein_g between 0 and 1000),
  calcium_mg numeric(8, 1) not null default 0 check (calcium_mg between 0 and 10000),
  vitamin_d_iu numeric(8, 1) not null default 0 check (vitamin_d_iu between 0 and 100000),
  estimate_source text not null default 'manual_estimate'
    check (estimate_source in ('manual_estimate', 'scan_estimate', 'package_label')),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.exercise_logs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_key text not null check (exercise_key ~ '^[a-z0-9-]{1,60}$'),
  completed_on date not null default current_date,
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.rest_day_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  first_rest_day smallint not null check (first_rest_day between 0 and 6),
  second_rest_day smallint check (second_rest_day between 0 and 6),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, week_start),
  check (second_rest_day is null or second_rest_day <> first_rest_day)
);

create table public.saved_meals (
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_key text not null check (meal_key ~ '^[a-z0-9-]{1,80}$'),
  saved_on date not null default current_date,
  primary key (user_id, meal_key)
);

-- Logs and uploads require an adult profile to exist first.
create or replace function public.can_use_cloud_data()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.age_band in ('18–24', '25+')
  );
$$;

revoke all on function public.can_use_cloud_data() from public, anon;
grant execute on function public.can_use_cloud_data() to authenticated;

create index sleep_logs_user_date_idx on public.sleep_logs (user_id, sleep_date desc);
create index nutrition_logs_user_date_idx on public.nutrition_logs (user_id, logged_on desc);
create index exercise_logs_user_date_idx on public.exercise_logs (user_id, completed_on desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Explicit grants plus RLS: a public/publishable key alone cannot read or mutate these rows.
alter table public.profiles enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.rest_day_plans enable row level security;
alter table public.saved_meals enable row level security;

revoke all on table public.profiles, public.sleep_logs, public.nutrition_logs,
  public.exercise_logs, public.rest_day_plans, public.saved_meals from anon, authenticated;

grant select, insert, update, delete on table public.profiles, public.sleep_logs,
  public.nutrition_logs, public.exercise_logs, public.rest_day_plans,
  public.saved_meals to authenticated;

create policy "profile_owner_only" on public.profiles
for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and age_band in ('18–24', '25+'));

create policy "sleep_owner_only" on public.sleep_logs
for all to authenticated
using ((select auth.uid()) = user_id and (select public.can_use_cloud_data()))
with check ((select auth.uid()) = user_id and (select public.can_use_cloud_data()));

create policy "nutrition_owner_only" on public.nutrition_logs
for all to authenticated
using ((select auth.uid()) = user_id and (select public.can_use_cloud_data()))
with check ((select auth.uid()) = user_id and (select public.can_use_cloud_data()));

create policy "exercise_owner_only" on public.exercise_logs
for all to authenticated
using ((select auth.uid()) = user_id and (select public.can_use_cloud_data()))
with check ((select auth.uid()) = user_id and (select public.can_use_cloud_data()));

create policy "rest_plan_owner_only" on public.rest_day_plans
for all to authenticated
using ((select auth.uid()) = user_id and (select public.can_use_cloud_data()))
with check ((select auth.uid()) = user_id and (select public.can_use_cloud_data()));

create policy "saved_meal_owner_only" on public.saved_meals
for all to authenticated
using ((select auth.uid()) = user_id and (select public.can_use_cloud_data()))
with check ((select auth.uid()) = user_id and (select public.can_use_cloud_data()));

-- Optional meal photos. Private by default; paths must start with the signed-in user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "meal_photo_read_own_folder" on storage.objects
for select to authenticated
using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.can_use_cloud_data()));

create policy "meal_photo_upload_own_folder" on storage.objects
for insert to authenticated
with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.can_use_cloud_data()));

create policy "meal_photo_delete_own_folder" on storage.objects
for delete to authenticated
using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.can_use_cloud_data()));
