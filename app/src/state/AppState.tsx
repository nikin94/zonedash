import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { MockCentralTransport } from "../ble/mock";
import type { CentralTransport, ConnectionState } from "../ble/transport";

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
}

const Ctx = createContext<AppState | null>(null);

/**
 * App-wide state shared across the navigation stack: the transport seam, the
 * connection it reports, the drill settings, and the paired layout lifted from
 * pairing events. `transport` is injectable for tests; the app default is the
 * in-app mock until real BLE lands.
 */
export const AppStateProvider = ({
  transport: injected,
  children,
}: {
  transport?: CentralTransport;
  children: ReactNode;
}) => {
  const transport = useMemo(() => injected ?? new MockCentralTransport(), [injected]);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [settings, setSettings] = useState<DrillSettings>(DEFAULT_SETTINGS);
  const [pairedSpots, setPairedSpots] = useState<number[]>([]);
  const [courtRotation, setCourtRotation] = useState(0);

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
        if (e.state !== "connected") setPairedSpots([]);
      }
      if (e.kind === "pairing" && e.progress.done) {
        setPairedSpots(e.progress.boundSpots);
      }
    });
    return () => {
      unsub();
      transport.disconnect();
    };
  }, [transport]);

  const rotateCourt = useCallback(() => setCourtRotation((r) => (r + 1) % 4), []);

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
    }),
    [transport, connection, connectionError, settings, pairedSpots, courtRotation, rotateCourt],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAppState = (): AppState => {
  const state = useContext(Ctx);
  if (state === null) throw new Error("useAppState outside AppStateProvider");
  return state;
};
