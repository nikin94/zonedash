-- ZoneDash cloud user settings — one row per Supabase Auth user holding the
-- drill settings a coach tweaks (app/src/state/AppState.ts DrillSettings): the
-- inter-target delay and whether a target may light twice in a row. This is the
-- cloud mirror of the device-local prefs (app/src/state/prefs.ts) so a signed-in
-- user's settings follow the account across devices instead of resetting to the
-- defaults on a reinstall / new device. Signed-out / offline stays purely local.
--
-- UNLIKE public.sessions (an immutable append-only archive), settings are a
-- single MUTABLE row per user — a coach changes the delay repeatedly — so this
-- table has an UPDATE policy and the app upserts with
-- `insert … on conflict (user_id) do update` (see supabaseSettings.save).
--
-- The columns mirror DrillSettings field for field (snake_case here); the sync
-- adapter (app/src/state/supabaseSettings.ts) maps rowToSettings / settingsToRow.
-- Defaults match DEFAULT_SETTINGS so a bare insert (should it ever happen) lands
-- on the app's own defaults.
--
-- Apply with `supabase db push` (or paste into the SQL editor) on project
-- berbrcafejaytymceape. Every statement is idempotent, so a re-paste is safe.
-- See app/supabase/README.md.

create table if not exists public.user_settings (
  user_id                uuid        not null references auth.users (id) on delete cascade,
  delay_ms               integer     not null default 0,      -- inter-target delay, ms
  allow_immediate_repeat boolean     not null default false,  -- may a target light twice in a row
  updated_at             timestamptz not null default now(),
  primary key (user_id)
);

-- Row-level security: a user can only ever see and write their OWN settings row.
-- Every policy pins user_id to the authenticated uid, so the publishable key
-- (shipped in the app) can't read or edit across accounts — RLS is the boundary,
-- not the key. (`enable row level security` is idempotent; the policies are
-- dropped first so a re-paste doesn't fail on "policy already exists".)
alter table public.user_settings enable row level security;

drop policy if exists "settings are readable by their owner" on public.user_settings;
create policy "settings are readable by their owner"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "a user inserts only their own settings" on public.user_settings;
create policy "a user inserts only their own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

-- Settings are MUTABLE (a coach changes them) — the one place this table differs
-- from the immutable sessions table, which has no update policy on purpose.
drop policy if exists "a user updates only their own settings" on public.user_settings;
create policy "a user updates only their own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
