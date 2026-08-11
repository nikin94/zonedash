import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createTransport } from "../ble/createTransport";
import type { CentralTransport, ConnectionState } from "../ble/transport";
import type { AuthProvider, AuthStatus, AuthUser } from "./auth";
import { createAccountsBackend } from "./createAccountsBackend";
import { reconcileHistory } from "./historySync";
import { loadPrefs, savePrefs } from "./prefs";
import type { RemoteHistoryStore } from "./sync";

/**
 * Session-wide drill settings, edited on the Settings screen and consumed by
 * the exercise screen when composing the LoadDrill config. Which of them go on
 * the wire still depends on the drill mode (the engine ignores delay in Live).
 * No timeout here on purpose: the app never arms auto-miss, so a run counts
 * hits only.
 */
export interface DrillSettings {
  delayMs: number;
  allowImmediateRepeat: boolean;
}

export const DEFAULT_SETTINGS: DrillSettings = {
  delayMs: 0,
  allowImmediateRepeat: false,
};

// Beat between the final bind and revealing the drill controls — long enough for
// the last dot's fade + green check to register before the surface swaps.
const HANDOFF_DELAY_MS = 700;

/** Which surface the Drill screen shows: the pairing round, or the drill
 *  controls once a completed round has handed off. */
export type DrillView = "pairing" | "drill";

interface AppState {
  transport: CentralTransport;
  connection: ConnectionState;
  /** Reason for the error state, when there is one. */
  connectionError: string | null;
  settings: DrillSettings;
  setSettings: (next: DrillSettings) => void;
  /** Canonical spots bound by the last completed round, in bind (slot) order. */
  pairedSpots: number[];
  /** Court view rotation in clockwise quarter turns (0–3) — the operator moved
   *  around the hall. Purely a display transform: spot identity (SPOT_XY / the
   *  wire) is untouched, so it stays independent of the link and survives a
   *  re-pair or reconnect. */
  courtRotation: number;
  rotateCourt: () => void;
  /** Which surface the Drill screen shows — driven by pairing/connection events
   *  here (not a screen), so it survives tab switches and a Drill-tab remount. */
  drillView: DrillView;
  /** Send the Drill screen back to the pairing surface (Re-pair). */
  resetToPairing: () => void;
  /** Account status off the AuthProvider seam — "signed-out" is the default and
   *  first-class (local-only). */
  authStatus: AuthStatus;
  authUser: AuthUser | null;
  /** Why the last sign-in ended back at signed-out (cancel/failure), or null.
   *  Cleared on any successful transition. */
  authError: string | null;
  /** Start Google sign-in; the UI tracks progress via authStatus. */
  signIn: () => void;
  /** Sign out — back to local-only. */
  signOut: () => void;
  /** Monotonic counter bumped whenever the device-local history changes behind
   *  the UI's back — right now, after a sign-in sync merges the cloud archive
   *  into the local store. The history list keys a re-read off it, so synced
   *  sessions appear at once instead of only after a tab round-trip. */
  historyVersion: number;
}

const Ctx = createContext<AppState | null>(null);

/**
 * App-wide state: the transport seam, the connection it reports, the drill
 * settings, the paired layout lifted from pairing events, and the court view
 * orientation. The durable prefs (settings, orientation) are hydrated from and
 * saved to device storage (prefs.ts) so they survive a restart; the link, the
 * layout, and the session are always fresh each launch. `transport` is
 * injectable for tests; otherwise createTransport() picks the in-app mock (Expo
 * Go / jest) or the real BLE stack (a dev build with EXPO_PUBLIC_BLE=1).
 */
export const AppStateProvider = ({
  transport: injected,
  auth: injectedAuth,
  remoteHistory: injectedRemoteHistory,
  children,
}: {
  transport?: CentralTransport;
  /** Injectable for tests; otherwise the accounts backend picks the mock (Expo
   *  Go / jest, no config) or the real Supabase+Google provider. */
  auth?: AuthProvider;
  /** The cloud archive to reconcile local history against on sign-in. Injectable
   *  for tests; otherwise it comes from the accounts backend — the real Supabase
   *  store (same authenticated client as `auth`) when configured, else null
   *  (local-only). `undefined` means "not injected, use the backend default";
   *  an explicit `null` forces local-only. */
  remoteHistory?: RemoteHistoryStore | null;
  children?: ReactNode;
}) => {
  // Tests inject a transport; otherwise createTransport picks mock (Expo Go /
  // jest) or the real BLE stack (dev build, EXPO_PUBLIC_BLE=1).
  const transport = useMemo(() => injected ?? createTransport(), [injected]);
  // The auth provider and cloud store come from ONE backend so they share a
  // Supabase client (its JWT is what RLS scopes cloud rows by). Either can be
  // injected for tests; an injected value wins over the backend default.
  const backend = useMemo(() => createAccountsBackend(), []);
  const auth = useMemo(() => injectedAuth ?? backend.auth, [injectedAuth, backend]);
  const remoteHistory =
    injectedRemoteHistory !== undefined ? injectedRemoteHistory : backend.remoteHistory;
  // Seed from the provider so a freshly-mounted tree reflects an already-active
  // session (same rehydrate reason as connection/session snapshots).
  const [authStatus, setAuthStatus] = useState<AuthStatus>(auth.status);
  const [authUser, setAuthUser] = useState<AuthUser | null>(auth.user);
  const [authError, setAuthError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [drillView, setDrillView] = useState<DrillView>("pairing");
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [settings, setSettings] = useState<DrillSettings>(DEFAULT_SETTINGS);
  const [pairedSpots, setPairedSpots] = useState<number[]>([]);
  const [courtRotation, setCourtRotation] = useState(0);
  // Persisted prefs load asynchronously, so the UI starts at defaults for a
  // frame, then adopts the stored values. `hydrated` gates the save effect
  // below so this initial load never echoes straight back as a redundant write
  // (and a pre-hydration render can't persist defaults over the stored blob).
  const [hydrated, setHydrated] = useState(false);

  // Hydrate device-local prefs once on mount. Only the durable bits (settings,
  // court orientation) — never the link, the paired layout, or the session,
  // which are all fresh each launch.
  useEffect(() => {
    let cancelled = false;
    loadPrefs().then((p) => {
      if (cancelled) return;
      if (p.settings) setSettings(p.settings);
      if (typeof p.courtRotation === "number") {
        setCourtRotation(((p.courtRotation % 4) + 4) % 4); // clamp a corrupt value to 0–3
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the durable prefs whenever they change — but only after hydration,
  // so the load above isn't clobbered by a first-render defaults write.
  useEffect(() => {
    if (!hydrated) return;
    savePrefs({ settings, courtRotation });
  }, [hydrated, settings, courtRotation]);

  // The pairing → drill handoff timer, kept in a ref so its cleanup survives the
  // event closure and a re-pair can cancel it mid-flight.
  const handoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "connection") {
        setConnection(e.state);
        setConnectionError(
          e.state === "error" ? (e.reason ?? "connection failed") : null,
        );
        // The paired layout lives on the brain and is built fresh each session
        // (architecture.md) — this cache is only ever derived from a live
        // pairing.done event. When the link leaves "connected", the cache must
        // die with it: a reconnect may land on a rebooted or different central
        // that has no map, and a stale layout here would let the exercise
        // screen load a drill onto positions that don't exist.
        if (e.state !== "connected") {
          setPairedSpots([]);
          // A dropped link also invalidates the drill surface — fall back to
          // pairing and kill any in-flight handoff so a dead round can't flip.
          if (handoffRef.current !== null) {
            clearTimeout(handoffRef.current);
            handoffRef.current = null;
          }
          setDrillView("pairing");
        }
      }
      if (e.kind === "pairing" && e.progress.done) {
        setPairedSpots(e.progress.boundSpots);
        // Reveal the drill controls a beat later, so the last bind's green check
        // paints first. The null-guard debounces the several done emits within
        // one round; it's cleared after firing so a LATER round hands off again.
        if (handoffRef.current === null) {
          handoffRef.current = setTimeout(() => {
            setDrillView("drill");
            handoffRef.current = null;
          }, HANDOFF_DELAY_MS);
        }
      }
    });
    return () => {
      unsub();
      if (handoffRef.current !== null) {
        clearTimeout(handoffRef.current);
        handoffRef.current = null;
      }
      transport.disconnect();
    };
  }, [transport]);

  const rotateCourt = useCallback(() => setCourtRotation((r) => (r + 1) % 4), []);
  const resetToPairing = useCallback(() => {
    if (handoffRef.current !== null) {
      clearTimeout(handoffRef.current);
      handoffRef.current = null;
    }
    setDrillView("pairing");
  }, []);

  // Track auth transitions off the seam — the account UI renders off this, and
  // the sync effect below keys sign-in on it.
  useEffect(() => {
    const unsub = auth.onAuthChange((e) => {
      setAuthStatus(e.status);
      setAuthUser(e.user);
      // Surface a failed/cancelled sign-in (signed-out WITH a reason); clear it
      // on any other transition so a stale error never lingers.
      setAuthError(e.status === "signed-out" ? (e.reason ?? null) : null);
    });
    return unsub;
  }, [auth]);

  const signIn = useCallback(() => {
    // The event stream drives the UI (signing-in → signed-in / back to
    // signed-out with a reason); swallow the rejection so a cancel isn't an
    // unhandled promise.
    void auth.signInWithGoogle().catch(() => {});
  }, [auth]);
  const signOut = useCallback(() => {
    void auth.signOut().catch(() => {});
  }, [auth]);

  // On sign-in, reconcile device-local history with the account's cloud archive
  // (and, for a fresh account, migrate the local log up). Runs once per sign-in
  // (authUser.id is stable while signed-in). No-op without a backend
  // (remoteHistory null → local-only), so the mock/default path never syncs.
  // Best-effort: a network failure leaves local history intact (nothing is lost,
  // the push is idempotent on id) and the next sign-in retries.
  const userId = authUser?.id ?? null;
  useEffect(() => {
    if (authStatus !== "signed-in" || userId === null || !remoteHistory) return;
    let cancelled = false;
    reconcileHistory(userId, remoteHistory)
      .then(() => {
        // The merged cloud archive is now in the local store — nudge the
        // history list to re-read so an account's sessions from other devices
        // (the whole point of signing in) show up immediately, not only after
        // the operator leaves the Account tab and comes back.
        if (!cancelled) setHistoryVersion((v) => v + 1);
      })
      .catch(() => {
        // swallow — a failed sync leaves local history untouched (nothing lost,
        // the push is idempotent on id) and the next sign-in retries.
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, userId, remoteHistory]);

  const value = useMemo(
    () => ({
      transport,
      connection,
      connectionError,
      settings,
      setSettings,
      pairedSpots,
      courtRotation,
      rotateCourt,
      drillView,
      resetToPairing,
      authStatus,
      authUser,
      authError,
      signIn,
      signOut,
      historyVersion,
    }),
    [
      transport,
      connection,
      connectionError,
      settings,
      pairedSpots,
      courtRotation,
      rotateCourt,
      drillView,
      resetToPairing,
      authStatus,
      authUser,
      authError,
      signIn,
      signOut,
      historyVersion,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAppState = (): AppState => {
  const state = useContext(Ctx);
  if (state === null) throw new Error("useAppState outside AppStateProvider");
  return state;
};
