/**
 * Transport seam between the app and the central unit. The UI only ever talks
 * to this interface; implementations encode it onto a wire:
 *  - MockCentralTransport (mock.ts) — in-app simulator, runs in Expo Go.
 *  - BleCentralTransport (later) — react-native-ble-plx over the GATT contract
 *    in contract.ts; each method maps 1:1 to a ControlOp write.
 */
import type { HitRecord, PairingProgress } from "./contract";

/** Mirrors the firmware DrillConfig (drill_engine.h) — the LoadDrill payload. */
export interface DrillConfig {
  mode: "random" | "path" | "live" | "time";
  numPositions: number; // active targets, 1..8
  count?: number; // random mode reps
  durationMs?: number; // time mode window
  delayMs?: number; // gap before the next target lights
  timeoutMs?: number; // 0/undefined = no auto-miss
  allowImmediateRepeat?: boolean;
  path?: number[]; // path mode: positions in order
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected";

export type SessionState = "idle" | "pairing" | "running" | "done";

/** Decoded Status-characteristic notifications. */
export type StatusEvent =
  | { kind: "connection"; state: ConnectionState }
  | { kind: "session"; state: SessionState; targetsOnline: number }
  | { kind: "pairing"; progress: PairingProgress }
  | { kind: "progress"; seq: number; position: number }; // armed target changed

export type Unsubscribe = () => void;

export interface CentralTransport {
  readonly connectionState: ConnectionState;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** ControlOp.StartPairing (payload: 1 byte N). */
  startPairing(numPositions: number): Promise<void>;
  /** ControlOp.LoadDrill. */
  loadDrill(config: DrillConfig): Promise<void>;
  /** ControlOp.StartSession. */
  startSession(): Promise<void>;
  /** ControlOp.StopSession. */
  stopSession(): Promise<void>;
  /** ControlOp.DumpResults — resolves with the session's hit records. */
  dumpResults(): Promise<HitRecord[]>;

  onStatus(listener: (event: StatusEvent) => void): Unsubscribe;
}
