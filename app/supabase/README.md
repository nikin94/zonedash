# ZoneDash Supabase

Cloud backend for **accounts + session history sync**. Signed-out / offline use
is unaffected — the app stays fully local (`src/state/history.ts`) until a user
signs in; this backend is the optional cloud mirror on top of the same
`SessionSummary`.

- **Project ref:** `berbrcafejaytymceape`
- **Auth:** Supabase Auth, Google via a native id token (no browser hand-off) —
  wired in PR-B/PR-C.
- **Data:** one `public.sessions` table, row-level-security scoped to the owner.

## Migrations

`migrations/` is hand-ordered (`0001_…`, `0002_…`). Apply either way:

```sh
# Supabase CLI (from app/):
supabase link --project-ref berbrcafejaytymceape
supabase db push
```

…or paste a migration's SQL into the project's **SQL editor** and run it. Every
statement is idempotent (`if not exists` / `drop policy if exists`), so re-running
a migration is safe.

## Security model

The app ships the **anon (public) key** — that is expected and safe. Every table
enables **RLS** with policies that pin `user_id` to `auth.uid()`, so the anon key
can only ever read/write the signed-in user's own rows, never across accounts.
The service-role key and DB password stay server-side and are never in the app.

Finished sessions are **immutable**: `sessions` has select/insert/delete policies
but **no update policy**, so with RLS on, no client — not even the owner — can
overwrite an archived row's fields. Sync writes are insert-or-ignore, so
append-only is a DB invariant rather than a client convention.
