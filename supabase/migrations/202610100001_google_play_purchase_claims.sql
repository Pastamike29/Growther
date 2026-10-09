begin;

-- Store only a hash of the Play purchase token. Clients cannot read or write claims.
create table if not exists public.google_play_purchase_claims (
  purchase_token_hash text primary key check (purchase_token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.google_play_purchase_claims enable row level security;
revoke all on table public.google_play_purchase_claims from public, anon, authenticated;

create or replace function public.claim_google_play_purchase_token(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
begin
  if v_user_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into public.google_play_purchase_claims (purchase_token_hash, user_id)
  values (p_token_hash, v_user_id)
  on conflict (purchase_token_hash) do nothing;

  select user_id into v_owner
  from public.google_play_purchase_claims
  where purchase_token_hash = p_token_hash;

  return v_owner = v_user_id;
end;
$$;

revoke all on function public.claim_google_play_purchase_token(text) from public, anon;
grant execute on function public.claim_google_play_purchase_token(text) to authenticated;

commit;
