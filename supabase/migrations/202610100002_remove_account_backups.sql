-- Remove the retired whole-app cloud backup and delete its stored snapshots.
drop table if exists public.account_backups;
