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
-- That immutability is a real DB invariant, not just a client convention: there
-- is NO update policy, so no client (not even the owner, nor a buggy/tampered one
-- holding the publishable key) can overwrite a row's fields after the fact. The sync
-- adapter (PR-B) writes with `insert … on conflict do nothing` — see sync.ts
-- RemoteHistoryStore.upsert.
--
-- Apply with `supabase db push` (or paste into the SQL editor) on project
-- berbrcafejaytymceape. Every statement is idempotent, so a re-paste is safe.
-- See app/supabase/README.md.

create table if not exists public.sessions (
  -- App-side stable id (String(endedAt)); unique per user, not globally — two
  -- users can finish at the same millisecond. NOTE: the id carries no entropy,
  -- so one user finishing two sessions on two devices in the SAME epoch-ms would
  -- collide on (user_id, id) and the second insert is ignored (on conflict do
  -- nothing). At human drill cadence this is effectively unreachable; if it ever
  -- matters, add a device/random suffix to the id (app/src/domain/session.ts).
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
-- Every policy pins user_id to the authenticated uid, so the publishable key
-- (shipped in the app) can't read across accounts — RLS is the boundary, not the key.
-- (`enable row level security` is idempotent; the policies are dropped first so
-- a re-paste doesn't fail on "policy already exists".)
alter table public.sessions enable row level security;

drop policy if exists "sessions are readable by their owner" on public.sessions;
create policy "sessions are readable by their owner"
  on public.sessions for select
  using (auth.uid() = user_id);

drop policy if exists "a user inserts only their own sessions" on public.sessions;
create policy "a user inserts only their own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

-- NO update policy — sessions are immutable. With RLS on and no update policy,
-- an update is denied for everyone, so an owner (or a tampered client) cannot
-- overwrite a finished row's fields. The sync push is insert-or-ignore, so it
-- never needs update. This makes "append-only" a DB invariant, not a convention.

drop policy if exists "a user deletes only their own sessions" on public.sessions;
create policy "a user deletes only their own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);
