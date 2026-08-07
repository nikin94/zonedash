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
  | "connected"
  | "error"; // connect failed / link lost; `reason` on the connection event

export type SessionState = "idle" | "pairing" | "running" | "done";

/**
 * A synchronous read of the central's current session, for rehydrating a
 * freshly-mounted screen instead of trusting it to catch future Status events.
 * The `session`/`progress` events fire once, at their moment; a screen that
 * (re)mounts after them would otherwise start blank over a live run. Same
 * reason `connectionState` is exposed as a readable — see DrillPanel.
 */
export interface SessionSnapshot {
  state: SessionState;
  /** The drill mode of the loaded/running config — restores the right UI. */
  mode: DrillConfig["mode"];
  /** Slot index of the currently-lit target, or null when nothing is armed. */
  armedPosition: number | null;
  /** Steps resolved so far this session (hits + misses) — the Step counter. */
  resolvedCount: number;
  // The config that shaped the run, so a remount restores its parameters too —
  // not just its progress. Without these a rehydrated run reads its numbers off
  // the defaults: `Run again` breaks for path (empty sequence) and shows the
  // wrong count/duration for random/time. Path is in slot-index (wire) form,
  // like DrillConfig.path — the panel maps it back onto canonical spots.
  count?: number;
  durationMs?: number;
  path?: number[];
}

/** Decoded Status-characteristic notifications. */
export type StatusEvent =
  | { kind: "connection"; state: ConnectionState; reason?: string }
  | { kind: "session"; state: SessionState; targetsOnline: number }
  | { kind: "pairing"; progress: PairingProgress }
  | { kind: "progress"; seq: number; position: number } // armed target changed
  // A step closed — hit or timeout miss. This is what the live drill screen
  // renders (green/red flash) without owning any game state.
  | { kind: "resolved"; seq: number; position: number; miss: boolean; reactionMs: number };

export type Unsubscribe = () => void;

export interface CentralTransport {
  readonly connectionState: ConnectionState;
  /** Current session, read on (re)mount so the UI reflects a run already in
   *  progress rather than trusting future Status events it may have missed. */
  readonly sessionSnapshot: SessionSnapshot;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** ControlOp.StartPairing (payload: 1 byte N). Opens an interactive round:
   *  each bind's court spot is then picked with selectPairingSpot. */
  startPairing(numTargets: number): Promise<void>;
  /** ControlOp.SelectPairSpot — the operator's map tap: prompt this canonical
   *  spot (0..7) for the next bind. The LED panel lights the same spot. */
  selectPairingSpot(spot: number): Promise<void>;
  /** ControlOp.ExtendPairing (payload: 1 byte new total). Grows a round —
   *  including a completed one — WITHOUT discarding bound targets; the map is
   *  append-only, so adding targets never invalidates existing binds. The
   *  round resumes waiting for the next selectPairingSpot. Shrinking is not a
   *  thing: which bound target would go? That path is a full re-pair. */
  extendPairing(numTargets: number): Promise<void>;
  /** ControlOp.FinishPairing (serial `finish`, no payload). Ends an in-progress
   *  round early at however many targets are already bound — trims the round to
   *  the bound count and completes it, keeping every bind (PairingRound::finish).
   *  The complement of extendPairing. Only valid between binds (not mid-prompt),
   *  and with at least one target bound. */
  finishPairing(): Promise<void>;
  /** ControlOp.UndoPairBind (no payload). Unbinds the most recent target and
   *  reopens its pick — the operator's correction path when the wrong physical
   *  unit got confirmed. Works on a completed round too (it resumes). Only
   *  valid between binds: while a spot is prompted the central refuses an
   *  undo — there is no per-prompt cancel, so let the bind resolve and undo
   *  it right after (resolve-then-undo). */
  undoPairing(): Promise<void>;

  /** DEV/TEST ONLY — bind every remaining target and finish the open round in
   *  one call, so a tester needn't tap through each spot. The real BLE
   *  transport does NOT implement it, so the UI shortcut it drives vanishes
   *  with the mock. */
  completePairingNow?(): Promise<void>;

  /** ControlOp.LoadDrill. */
  loadDrill(config: DrillConfig): Promise<void>;
  /** ControlOp.StartSession. */
  startSession(): Promise<void>;
  /** ControlOp.ArmLiveTarget (serial `next S`) — live mode only: the operator
   *  picks the next target during a running session. `position` is a slot index
   *  (0..numPositions-1); the central lights it and the step resolves on the
   *  hit (DrillEngine::set_next). A no-op while a target is already lit. */
  armLiveTarget(position: number): Promise<void>;
  /** ControlOp.StopSession. */
  stopSession(): Promise<void>;
  /** ControlOp.DumpResults — resolves with the session's hit records. */
  dumpResults(): Promise<HitRecord[]>;

  onStatus(listener: (event: StatusEvent) => void): Unsubscribe;
}
