-- ZoneDash — extend the per-user settings row with the full drill setup.
--
-- 0003 stored only the SettingsPanel toggles (delay, immediate-repeat). The
-- coach also wants their MODE and stop condition (hit count / duration window)
-- to follow the account, not reset to the defaults on a reinstall / new device
-- (app/src/state/AppState.ts DrillSettings). These columns mirror those fields
-- so the same reconcile/upsert path (supabaseSettings.ts) carries them.
--
-- Every column is NOT NULL with a default matching DEFAULT_SETTINGS, so
-- `add column if not exists` BACKFILLS any row written by 0003 with the app's
-- own defaults — an existing settings row upgrades cleanly, no null config.
--
-- CHECK constraints pin mode/stop_by to the same unions the app uses (UiMode /
-- StopBy), so rowToSettings' cast back to those types is a real DB invariant.
--
-- Idempotent (`add column if not exists`; the constraints are added only when
-- absent), so a re-paste on project berbrcafejaytymceape is safe. Apply with
-- `supabase db push` or the SQL editor. See app/supabase/README.md.

alter table public.user_settings
  add column if not exists mode        text    not null default 'random',
  add column if not exists stop_by     text    not null default 'count',
  add column if not exists count       integer not null default 10,
  add column if not exists duration_ms integer not null default 30000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_mode_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_mode_check
      check (mode in ('random', 'path', 'live'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_stop_by_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_stop_by_check
      check (stop_by in ('count', 'time'));
  end if;
end $$;
