-- ZoneDash — add the optional runner/player name to a cloud session row.
--
-- A coach can tag a session with the athlete who ran it (app/src/domain/session.ts
-- SessionSummary.playerName). This mirrors that field into the cloud archive so a
-- named run keeps its attribution across devices. NULLABLE — an unnamed run (or an
-- older row from before this column existed) simply carries no name.
--
-- Immutable like every other column: the table still has NO update policy, so a
-- name is written once at insert (see supabaseHistory.summaryToRow) and never
-- changed. The sync push is insert-or-ignore on (user_id, id), so re-pushing an
-- already-archived session never rewrites its name either.
--
-- Idempotent (`add column if not exists`), so a re-paste on project
-- berbrcafejaytymceape is safe. Apply with `supabase db push` or the SQL editor.
-- See app/supabase/README.md.

alter table public.sessions
  add column if not exists player_name text;
