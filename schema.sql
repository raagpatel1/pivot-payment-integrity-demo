-- ============================================================
-- PIVOT demo — Supabase schema (auth + persistence)
-- Paste this whole file into: Supabase dashboard › SQL Editor › New query › Run
-- ============================================================
-- The synthetic dataset (providers, veterans, claims, flagged claims) stays in the
-- app (data.js). Supabase persists only the MUTATIONS + audit trail, so state
-- survives sessions and is shared across users (analyst ⇄ supervisor).

-- Persisted overlay on each flagged claim (keyed by its id, e.g. "20481")
create table if not exists public.case_state (
  claim_id         text primary key,
  status           text,
  assignee         text,
  decision_outcome text,          -- confirm | dismiss | escalate | null
  rationale        text,
  review_state     text,          -- pending | approved | returned | final | null
  return_note      text,
  case_link        text,          -- explicit case assignment: new:<leadId> or an existing caseKey
  decision_reason  text,          -- coded reason from the decision dropdown (e.g. COD-01)
  updated_by       text,
  updated_at       timestamptz default now()
);
-- additive migrations for existing installs:
alter table public.case_state add column if not exists case_link text;
alter table public.case_state add column if not exists decision_reason text;

-- Per-case closure state (keyed by the case's primary provider id)
create table if not exists public.case_closure (
  provider_id text primary key,
  reason      text,          -- coded close reason (e.g. CL-01)
  reason_text text,          -- the reason's label at time of closing
  narrative   text,          -- the supervisor's closing narrative
  closed_by   text,
  updated_at  timestamptz default now()
);
-- additive migrations for existing installs:
alter table public.case_closure add column if not exists reason_text text;
alter table public.case_closure add column if not exists narrative text;

-- Immutable audit trail
create table if not exists public.audit_log (
  id        bigint generated always as identity primary key,
  ts        timestamptz default now(),
  action    text not null,
  detail    text,
  user_name text
);

-- ---- Row-level security ----
-- Only authenticated users (i.e. after login) can read/write the shared demo state.
alter table public.case_state enable row level security;
alter table public.audit_log  enable row level security;

drop policy if exists "auth read case_state"   on public.case_state;
drop policy if exists "auth write case_state"  on public.case_state;
drop policy if exists "auth update case_state" on public.case_state;
create policy "auth read case_state"   on public.case_state for select to authenticated using (true);
create policy "auth write case_state"  on public.case_state for insert to authenticated with check (true);
create policy "auth update case_state" on public.case_state for update to authenticated using (true) with check (true);

alter table public.case_closure enable row level security;
drop policy if exists "auth read case_closure"   on public.case_closure;
drop policy if exists "auth write case_closure"  on public.case_closure;
drop policy if exists "auth update case_closure" on public.case_closure;
drop policy if exists "auth delete case_closure" on public.case_closure;
create policy "auth read case_closure"   on public.case_closure for select to authenticated using (true);
create policy "auth write case_closure"  on public.case_closure for insert to authenticated with check (true);
create policy "auth update case_closure" on public.case_closure for update to authenticated using (true) with check (true);
create policy "auth delete case_closure" on public.case_closure for delete to authenticated using (true);

drop policy if exists "auth read audit"  on public.audit_log;
drop policy if exists "auth write audit" on public.audit_log;
create policy "auth read audit"  on public.audit_log for select to authenticated using (true);
create policy "auth write audit" on public.audit_log for insert to authenticated with check (true);

-- Realtime (optional, enables live analyst⇄supervisor updates later)
do $$ begin
  alter publication supabase_realtime add table public.case_state;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.audit_log;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.case_closure;
exception when duplicate_object then null; end $$;

-- ---- Reset helper (for the "Reset demo" button) ----
create or replace function public.reset_demo() returns void language sql security definer as $$
  delete from public.case_state; delete from public.audit_log; delete from public.case_closure;
$$;
grant execute on function public.reset_demo() to authenticated;
