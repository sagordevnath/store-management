-- Managix hosted SaaS schema.
-- Apply in the Supabase SQL editor before deploying the API.

create table if not exists public.workspaces (
  workspace_id text primary key,
  db jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  tombstones jsonb not null default '[]'::jsonb
);

create index if not exists workspaces_updated_at_idx
  on public.workspaces (updated_at desc);

create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces(workspace_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (user_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists "workspace anon full access" on public.workspaces;
revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
grant select, insert, update, delete on public.workspaces to service_role;
grant select, insert, update, delete on public.workspace_members to service_role;

create or replace function public.create_workspace_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id text;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select workspace_id
    into v_workspace_id
    from public.workspace_members
    where user_id = p_user_id;

  if v_workspace_id is not null then
    return v_workspace_id;
  end if;

  v_workspace_id := gen_random_uuid()::text;
  insert into public.workspaces (workspace_id) values (v_workspace_id);
  insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner');

  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace_for_user(uuid) from public, anon, authenticated;
grant execute on function public.create_workspace_for_user(uuid) to service_role;
