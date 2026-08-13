import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";

import { createTransport } from "../ble/createTransport";
import type {
  CentralTransport,
  ConnectionState,
  StatusEvent,
} from "../ble/transport";
import type { SessionSummary } from "../domain/session";
import type { AuthEvent, AuthProvider, AuthStatus, AuthUser } from "./auth";
import { createAccountsBackend } from "./createAccountsBackend";
import { appendSession } from "./history";
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

/**
 * The app-wide state, now a zustand store instead of a context value. Every
 * field below is a selectable slice: a component subscribes to just what it
 * reads (`useAppStore(s => s.connection)`), so an unrelated slice changing (a
 * pairing event, a sign-in) no longer re-renders it — the win over the old
 * single context value that re-created on every change.
 *
 * `transport`, `auth` and `remoteHistory` are STABLE seams set once at store
 * creation, so selecting them never triggers a re-render; the reactive state
 * and the actions follow.
 */
export interface AppState {
  /** The BLE seam — stable for the store's life, so reading it never re-renders. */
  transport: CentralTransport;
  connection: ConnectionState;
  /** Reason for the error state, when there is one. */
  connectionError: string | null;
  settings: DrillSettings;
  setSettings: (next: DrillSettings) => void;
  /** The sticky runner/player name a coach sets on the drill-setup page —
   *  attributed to every finished session so results can be told apart per
   *  athlete. Empty string = unset (sessions carry no name). Durable (prefs),
   *  so it survives a restart and stays until the coach changes it. */
  playerName: string;
  setPlayerName: (next: string) => void;
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
  /** Persist a finished session — always to the device-local log, and, when
   *  signed in with a cloud backend, pushed to the account's archive right away
   *  (best-effort, off the critical path). So a run reaches the cloud the moment
   *  it finishes, not only at the next sign-in reconcile. Signed-out / offline
   *  stays purely local, exactly as before. */
  recordSession: (summary: SessionSummary) => void;
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
  /** Whether the login gate has been passed — by signing in OR by choosing
   *  "continue offline". Durable (prefs), so the gate stays down across
   *  relaunches; an explicit sign-out reopens it (back to the login screen). */
  authGatePassed: boolean;
  /** Dismiss the login gate without signing in (continue local-only). Sets the
   *  durable flag so the gate stays gone. */
  skipAuthGate: () => void;
  /** Monotonic counter bumped whenever the device-local history changes behind
   *  the UI's back — right now, after a sign-in sync merges the cloud archive
   *  into the local store. The history list keys a re-read off it, so synced
   *  sessions appear at once instead of only after a tab round-trip. */
  historyVersion: number;
  /** True once device-local prefs have loaded. Gates the save effect (so the
   *  initial load isn't echoed back as a redundant write) AND the login gate
   *  (so a returning user's stored "gate passed" is known before the first
   *  paint — no gate flash before the app). */
  hydrated: boolean;
}

/**
 * The internal slice — the wiring the provider's effects call into. Kept off the
 * public `AppState` type so screens can't reach it; the store instance still
 * carries these methods.
 */
interface AppStoreInternal extends AppState {
  /** The seams the actions/effects close over (auth, cloud store). */
  auth: AuthProvider;
  remoteHistory: RemoteHistoryStore | null;
  /** Adopt the loaded prefs (settings + court orientation), then mark hydrated. */
  _adoptPrefs: (p: Awaited<ReturnType<typeof loadPrefs>>) => void;
  /** Fold a transport Status event into connection / paired layout / handoff. */
  _handleStatus: (e: StatusEvent) => void;
  /** Fold an auth event into status / user / error. */
  _handleAuth: (e: AuthEvent) => void;
  /** Bump historyVersion after a sign-in sync merges the cloud archive. */
  _bumpHistory: () => void;
  /** Cancel any in-flight pairing → drill handoff (link drop / unmount). */
  _cancelHandoff: () => void;
}

export type AppStore = StoreApi<AppStoreInternal>;

/**
 * Build a fresh store bound to the given seams. A factory (not a module
 * singleton) so tests can inject a mock transport/auth and get an isolated tree
 * — the same isolation the old provider gave, now with selector subscriptions.
 */
export const createAppStore = ({
  transport,
  auth,
  remoteHistory,
}: {
  transport: CentralTransport;
  auth: AuthProvider;
  remoteHistory: RemoteHistoryStore | null;
}): AppStore => {
  // The pairing → drill handoff timer, a closure var (not reactive state) so a
  // re-pair or a link drop can cancel it mid-flight without a render.
  let handoffTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHandoff = () => {
    if (handoffTimer !== null) {
      clearTimeout(handoffTimer);
      handoffTimer = null;
    }
  };

  return createStore<AppStoreInternal>((set, get) => ({
    transport,
    auth,
    remoteHistory,
    // Seed auth from the seam so a freshly-mounted tree reflects an already-active
    // session (same rehydrate reason as connection/session snapshots).
    connection: "disconnected",
    connectionError: null,
    settings: DEFAULT_SETTINGS,
    playerName: "",
    pairedSpots: [],
    courtRotation: 0,
    drillView: "pairing",
    authStatus: auth.status,
    authUser: auth.user,
    authError: null,
    // The login gate shows until this flips true (via sign-in or "continue").
    // Defaults false; hydrated from prefs, so a returning user skips the gate.
    authGatePassed: auth.status === "signed-in",
    historyVersion: 0,
    hydrated: false,

    setSettings: (next) => set({ settings: next }),
    setPlayerName: (next) => set({ playerName: next }),
    rotateCourt: () =>
      set((s) => ({ courtRotation: (s.courtRotation + 1) % 4 })),
    resetToPairing: () => {
      cancelHandoff();
      set({ drillView: "pairing" });
    },
    recordSession: (summary) => {
      // Scope the write to the CURRENT identity's bucket: a signed-in run lands
      // in that account's log, a signed-out run in the anonymous log — the two
      // histories stay separate, so signing in never inherits the device's
      // anonymous runs (and vice-versa). Device-local first: it's the durable
      // copy the history view reads, signed in or not.
      const { authStatus, authUser } = get();
      const userId =
        authStatus === "signed-in" && authUser !== null ? authUser.id : null;
      void appendSession(summary, userId);
      // Signed in with a cloud backend → archive THIS session to the account
      // straight away, best-effort. insert-or-ignore on (user_id, id) makes it
      // idempotent with the sign-in reconcile, so a duplicate push is harmless
      // and a network failure is swallowed (the next reconcile still catches it).
      if (userId !== null && remoteHistory) {
        void remoteHistory.upsert(userId, [summary]).catch(() => {});
      }
    },
    signIn: () => {
      // The event stream drives the UI (signing-in → signed-in / back to
      // signed-out with a reason); swallow the rejection so a cancel isn't an
      // unhandled promise.
      void auth.signInWithGoogle().catch(() => {});
    },
    signOut: () => {
      void auth.signOut().catch(() => {});
    },
    skipAuthGate: () => set({ authGatePassed: true }),

    _adoptPrefs: (p) =>
      set((s) => ({
        settings: p.settings ?? s.settings,
        playerName:
          typeof p.playerName === "string" ? p.playerName : s.playerName,
        courtRotation:
          typeof p.courtRotation === "number"
            ? ((p.courtRotation % 4) + 4) % 4 // clamp a corrupt value to 0–3
            : s.courtRotation,
        // A stored "gate passed" only ever latches it ON — never un-passes a
        // gate already cleared in this session (e.g. an auto sign-in on boot).
        authGatePassed: s.authGatePassed || p.authGatePassed === true,
        hydrated: true,
      })),

    _handleStatus: (e) => {
      if (e.kind === "connection") {
        set({
          connection: e.state,
          connectionError:
            e.state === "error" ? (e.reason ?? "connection failed") : null,
        });
        // The paired layout lives on the brain and is built fresh each session
        // (architecture.md) — this cache is only ever derived from a live
        // pairing.done event. When the link leaves "connected", the cache must
        // die with it: a reconnect may land on a rebooted or different central
        // that has no map, and a stale layout here would let the exercise
        // screen load a drill onto positions that don't exist.
        if (e.state !== "connected") {
          cancelHandoff();
          set({ pairedSpots: [], drillView: "pairing" });
        }
      }
      if (e.kind === "pairing" && e.progress.done) {
        set({ pairedSpots: e.progress.boundSpots });
        // Reveal the drill controls a beat later, so the last bind's green check
        // paints first. The null-guard debounces the several done emits within
        // one round; it's cleared after firing so a LATER round hands off again.
        if (handoffTimer === null) {
          handoffTimer = setTimeout(() => {
            handoffTimer = null;
            set({ drillView: "drill" });
          }, HANDOFF_DELAY_MS);
        }
      }
    },

    _handleAuth: (e) =>
      set((s) => ({
        authStatus: e.status,
        authUser: e.user,
        // Surface a failed/cancelled sign-in (signed-out WITH a reason); clear it
        // on any other transition so a stale error never lingers.
        authError: e.status === "signed-out" ? (e.reason ?? null) : null,
        // The gate tracks the account choice: signing in passes it, and an
        // explicit sign-out (signed-in → signed-out) REOPENS it, dropping the
        // user back on the login screen. A cancelled/failed sign-in
        // (signing-in → signed-out) leaves it untouched, so the gate stays as it
        // was. The skip path (never signed-in) is unaffected.
        authGatePassed:
          e.status === "signed-in"
            ? true
            : e.status === "signed-out" && s.authStatus === "signed-in"
              ? false
              : s.authGatePassed,
      })),

    _bumpHistory: () => set((s) => ({ historyVersion: s.historyVersion + 1 })),

    _cancelHandoff: cancelHandoff,
  }));
};

const AppStoreContext = createContext<AppStore | null>(null);

/**
 * App-wide state provider. It builds the store ONCE (seeded with the injected
 * transport/auth/remoteHistory or the real defaults) and runs the side effects
 * that write into it: prefs hydration + persistence, the transport Status
 * subscription (connection / paired layout / handoff), the auth subscription,
 * and the sign-in → history sync. The store reference is stable, so this
 * provider re-rendering never re-renders its subtree — only the slices a child
 * selects do.
 *
 * `transport` / `auth` / `remoteHistory` are injectable for tests; otherwise
 * createTransport() and the accounts backend supply the real seams.
 */
export const AppStateProvider = ({
  transport: injectedTransport,
  auth: injectedAuth,
  remoteHistory: injectedRemoteHistory,
  children,
}: {
  transport?: CentralTransport;
  /** Injectable for tests; otherwise the accounts backend picks the mock (Expo
   *  Go / jest, no config) or the real Supabase+Google provider. */
  auth?: AuthProvider;
  /** The cloud archive to reconcile local history against on sign-in. Injectable
   *  for tests; otherwise it comes from the accounts backend. `undefined` means
   *  "not injected, use the backend default"; an explicit `null` forces
   *  local-only. */
  remoteHistory?: RemoteHistoryStore | null;
  children?: ReactNode;
}) => {
  const [store] = useState<AppStore>(() => {
    // The auth provider and cloud store come from ONE backend so they share a
    // Supabase client (its JWT is what RLS scopes cloud rows by). Either can be
    // injected for tests; an injected value wins over the backend default.
    const backend = createAccountsBackend();
    const transport = injectedTransport ?? createTransport();
    const auth = injectedAuth ?? backend.auth;
    const remoteHistory =
      injectedRemoteHistory !== undefined
        ? injectedRemoteHistory
        : backend.remoteHistory;
    return createAppStore({ transport, auth, remoteHistory });
  });

  // Hydrate device-local prefs once on mount. Only the durable bits (settings,
  // court orientation) — never the link, the paired layout, or the session,
  // which are all fresh each launch.
  useEffect(() => {
    let cancelled = false;
    loadPrefs().then((p) => {
      if (!cancelled) store.getState()._adoptPrefs(p);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Persist the durable prefs whenever they change — but only after hydration,
  // so the load above isn't clobbered by a first-render defaults write.
  const settings = useStore(store, (s) => s.settings);
  const playerName = useStore(store, (s) => s.playerName);
  const courtRotation = useStore(store, (s) => s.courtRotation);
  const authGatePassed = useStore(store, (s) => s.authGatePassed);
  const hydrated = useStore(store, (s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    savePrefs({ settings, playerName, courtRotation, authGatePassed });
  }, [hydrated, settings, playerName, courtRotation, authGatePassed]);

  // The transport Status stream drives connection / paired layout / handoff.
  useEffect(() => {
    const transport = store.getState().transport;
    const unsub = transport.onStatus((e) => store.getState()._handleStatus(e));
    return () => {
      unsub();
      store.getState()._cancelHandoff();
      transport.disconnect();
    };
  }, [store]);

  // Track auth transitions off the seam — the account UI renders off this state.
  useEffect(() => {
    const auth = store.getState().auth;
    const unsub = auth.onAuthChange((e) => store.getState()._handleAuth(e));
    return unsub;
  }, [store]);

  // On sign-in, reconcile device-local history with the account's cloud archive
  // (and migrate a fresh account's local log up). Runs once per sign-in
  // (authUser.id is stable while signed-in). No-op without a backend
  // (remoteHistory null → local-only). Best-effort: a network failure leaves
  // local history intact (idempotent push) and the next sign-in retries.
  const authStatus = useStore(store, (s) => s.authStatus);
  const userId = useStore(store, (s) => s.authUser?.id ?? null);
  useEffect(() => {
    const { remoteHistory } = store.getState();
    if (authStatus !== "signed-in" || userId === null || !remoteHistory) return;
    let cancelled = false;
    reconcileHistory(userId, remoteHistory)
      .then(() => {
        // The merged cloud archive is now in the local store — nudge the history
        // list to re-read so an account's sessions from other devices show up at
        // once, not only after leaving and returning to the Account tab.
        if (!cancelled) store.getState()._bumpHistory();
      })
      .catch(() => {
        // swallow — a failed sync leaves local history untouched.
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, userId, store]);

  return (
    <AppStoreContext.Provider value={store}>
      {children}
    </AppStoreContext.Provider>
  );
};

/**
 * Subscribe to a slice of app state. Pass a selector — the component re-renders
 * only when THAT slice changes (`useAppStore(s => s.connection)`), not on every
 * unrelated update. For several fields at once, wrap the selector in `useShallow`
 * so the shallow-equal object doesn't re-render on an unrelated change.
 */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (store === null) throw new Error("useAppStore outside AppStateProvider");
  return useStore(store, selector);
}
