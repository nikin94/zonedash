# ZoneDash Supabase

Cloud backend for **accounts + session history sync**. Signed-out / offline use
is unaffected — the app stays fully local (`src/state/history.ts`) until a user
signs in; this backend is the optional cloud mirror on top of the same
`SessionSummary`.

- **Project ref:** `berbrcafejaytymceape`
- **Auth:** Supabase Auth, Google via a native id token (no browser hand-off) —
  wired in PR-C.
- **Data:** one `public.sessions` table, row-level-security scoped to the owner.
  The client + `RemoteHistoryStore` adapter over it are wired in PR-B
  (`src/state/supabaseClient.ts`, `src/state/supabaseHistory.ts`).

## Environment

The app reads two Expo public env vars; **both must be set** or the app stays
local-only (`src/config/supabase.ts` → `getSupabaseConfig()` returns null):

```
EXPO_PUBLIC_SUPABASE_URL=https://berbrcafejaytymceape.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=…apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=…apps.googleusercontent.com
```

Set them in a local `.env` for `expo run:*`, and as EAS build secrets for
release builds. The Supabase values are from **Project Settings → API** (use the
**publishable key** `sb_publishable_…` — the current key system, not the legacy
`anon` JWT). The Google client ids are from **Google Cloud Console → Credentials**
(see "Activation" below). None of these are secrets — they ship in the client;
the boundary is RLS. The **Supabase secret key and DB password never go in the
app**. Accounts stay off until BOTH the Supabase config and the Google web
client id are set (`getSupabaseConfig()` / `getGoogleConfig()`); missing either,
the app is fully working, signed-out, local-only.

## Activation — Google sign-in (native, no browser)

The native Google flow needs three things you provide, plus a config-plugin edit
and a rebuild. Until then the app runs local-only.

**1. Google Cloud Console → APIs & Services → Credentials — three OAuth clients
in one project** (OAuth consent screen: External, add your email as a test user):

- **Web application** client → its id is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  (also the id-token audience Supabase validates, and Android's client id). No
  redirect URI needed for the native flow.
- **iOS** client (bundle id `com.nikin.zonedash`) → its id is
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and its **reversed client id**
  (`com.googleusercontent.apps.…`) is the `iosUrlScheme` below.
- **Android** client (package `com.nikin.zonedash`) with the debug **SHA-1**:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`
  (add the release SHA-1 later).

**2. Supabase → Authentication → Providers → Google:** paste the **Web** client
id + secret, and add the iOS and Android client ids under **Authorized Client
IDs** so a native id token passes audience validation.

**3. Config plugin** — add to `app.json` `plugins` (needs your **reversed iOS
client id**), then rebuild (`npx expo prebuild --clean && npx expo run:ios`):

```json
[
  "@react-native-google-signin/google-signin",
  { "iosUrlScheme": "com.googleusercontent.apps.YOUR_REVERSED_IOS_CLIENT_ID" }
]
```

**4. Apply the migration** (`0001`, below) so the `sessions` table exists.

With those set, sign-in in the Settings modal exchanges the native Google id
token for a Supabase session (`SupabaseAuthProvider`) and history syncs to the
account (`reconcileHistory` on sign-in).

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

The app ships the **publishable (public) key** — that is expected and safe. Every
table enables **RLS** with policies that pin `user_id` to `auth.uid()`, so the
publishable key can only ever read/write the signed-in user's own rows, never
across accounts. The secret key and DB password stay server-side and are never in
the app.

Finished sessions are **immutable**: `sessions` has select/insert/delete policies
but **no update policy**, so with RLS on, no client — not even the owner — can
overwrite an archived row's fields. Sync writes are insert-or-ignore, so
append-only is a DB invariant rather than a client convention.
