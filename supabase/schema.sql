-- =============================================================================
-- Managix — Supabase schema
-- =============================================================================
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- before pointing the Managix server at your Supabase project.
--
-- The backend is document-sync style: each workspace (one shop / device group)
-- stores its whole business document (products, sales, purchases, customers,
-- suppliers, expenses, staff, settings) as a single JSONB document, plus a
-- tombstones array so deletions survive last-writer-wins merges.
-- =============================================================================

create table if not exists public.workspaces (
  workspace_id text primary key,
  db            jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  tombstones    jsonb not null default '[]'::jsonb
);

-- Helpful for "what changed recently" debugging / audit.
create index if not exists workspaces_updated_at_idx
  on public.workspaces (updated_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- The Express server talks to Supabase with the service role key (bypasses RLS).
-- If you instead expose Supabase directly to browsers with the anon key, this
-- policy lets any visitor read/write workspaces — fine for a demo, tighten by
-- auth.uid() for production.
-- -----------------------------------------------------------------------------
alter table public.workspaces enable row level security;

drop policy if exists "workspace anon full access" on public.workspaces;
create policy "workspace anon full access"
  on public.workspaces
  for all
  using (true)
  with check (true);
