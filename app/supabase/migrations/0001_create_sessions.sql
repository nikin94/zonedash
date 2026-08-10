-- ZoneDash cloud session store — one row per finished drill session, owned by a
-- Supabase Auth user. This is the cloud mirror of the device-local history
-- (app/src/state/history.ts): a signed-in user's sessions sync here so history
-- follows the account across devices. Signed-out / offline stays local-only —
-- this table is never touched without an authenticated user.
--
-- The columns mirror the app's SessionSummary (app/src/domain/session.ts) field
-- for field; the sync layer (app/src/state/sync.ts) reads/writes them verbatim.
-- Sessions are IMMUTABLE once finished (id = the completion timestamp), so this
-- is an append-only archive — the merge policy is union-by-id, never an update.
--
-- Apply with `supabase db push` (or paste into the SQL editor) on project
-- berbrcafejaytymceape. See app/supabase/README.md.

create table if not exists public.sessions (
  -- App-side stable id (String(endedAt)); unique per user, not globally — two
  -- users can finish at the same millisecond.
  id            text     not null,
  user_id       uuid     not null references auth.users (id) on delete cascade,
  ended_at      bigint   not null,          -- epoch ms (exceeds int32)
  mode          text     not null,          -- "random" | "path" | "live"
  num_positions smallint not null,          -- active targets, 1..8
  attempts      integer  not null,          -- resolved attempts this session
  total_ms      integer  not null,          -- sum of reaction times
  avg_ms        integer,                     -- null = no attempts (≠ 0.00 s)
  best_ms       integer,                     -- null = no attempts
  created_at    timestamptz not null default now(),
  primary key (user_id, id)
);

-- Newest-first reads per user, matching the history view's order.
create index if not exists sessions_user_ended_at_idx
  on public.sessions (user_id, ended_at desc);

-- Row-level security: a user can only ever see and write their OWN sessions.
-- Every policy pins user_id to the authenticated uid, so the anon key (shipped
-- in the app) can't read across accounts — RLS is the boundary, not the key.
alter table public.sessions enable row level security;

create policy "sessions are readable by their owner"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "a user inserts only their own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

-- Sessions are immutable, but an owner may re-upsert an identical row on sync;
-- allow update only on the owner's own rows (never a foreign user_id).
create policy "a user updates only their own sessions"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "a user deletes only their own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);
