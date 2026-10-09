-- Opt-in whole-app backup row for the current localStorage-based prototype.
-- Apply after 202609290001_growth_arc_backend.sql.

create table public.account_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.account_backups enable row level security;
revoke all on table public.account_backups from anon, authenticated;
grant select, insert, update, delete on table public.account_backups to authenticated;

create policy "account_backup_owner_only" on public.account_backups
for all to authenticated
using ((select auth.uid()) = user_id and (select public.can_use_cloud_data()))
with check ((select auth.uid()) = user_id and (select public.can_use_cloud_data()));

