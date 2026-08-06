/**
 * BLE GATT contract — the app's mirror of the brain firmware's service.
 * The one cross-language seam (C++ ⇄ TS): keep these in lock-step with the
 * firmware. See docs/architecture.md "Phone ⇄ central".
 *
 * Placeholder UUIDs — regenerate a real 128-bit base once and pin both sides.
 */
export const ZONEDASH_SERVICE_UUID = "5a17e900-0000-1000-8000-00805f9b34fb";

export const CHAR = {
  /** write: start/stop, select drill, drill config (sequence, timing, mode) */
  control: "5a17e901-0000-1000-8000-00805f9b34fb",
  /** notify: session state, connected-target count, live progress */
  status: "5a17e902-0000-1000-8000-00805f9b34fb",
  /** notify/read: buffered per-hit records (chunked if large) */
  results: "5a17e903-0000-1000-8000-00805f9b34fb",
} as const;

/**
 * Control opcodes (byte 0 of a Control write). Mirrors the serial operator
 * commands (firmware/lib/serialcmd), minus the dev-only ones: `sensor` (A/B
 * bench test) and `sync` (internal re-sync) are serial-only and not exposed
 * over BLE.
 */
export enum ControlOp {
  StartSession = 1,
  StopSession = 2,
  StartPairing = 3, // open a pairing round; payload: 1 byte N (targets to bind, 1..8)
  DumpResults = 4,
  LoadDrill = 5, // push a drill config (mode, N, sequence, timing) — "Control: config"
  SelectPairSpot = 6, // pairing: payload 1 byte — canonical court spot (0..7) for the next bind
  ExtendPairing = 7, // grow the round to N total (1 byte), keeping bound targets — PairingRound::extend / serial `extend N`
  UndoPairBind = 8, // unbind the most recent target and re-prompt its pick — PairingRound::undo_last / serial `undo`; no payload
  ArmLiveTarget = 9, // live mode: arm slot index (0..numPositions-1) as the next target — DrillEngine::set_next / serial `next S`; payload 1 byte
}

/**
 * Pairing progress, notified on the Status characteristic during a pairing
 * round. The round is interactive: the operator picks each bind's court spot
 * on the phone map (SelectPairSpot) — spots are free-form, e.g. 3 targets all
 * on the left side — the central unit lights that same spot on the LED panel,
 * and a two-tap confirm on the physical target binds it (firmware
 * lib/pairing Tap::Await → Bound). Repeats until `total` targets are bound.
 */
export interface PairingProgress {
  total: number; // N — targets to bind this round
  boundSpots: number[]; // canonical spots bound so far, in bind order
  /** Spot currently prompted on the map + LED panel, or null while the round
   *  waits for the operator's next SelectPairSpot (and after done). */
  currentSpot: number | null;
  /** True while the prompted spot has a candidate MAC waiting for its second
   *  confirm tap — the UI shows "press again to confirm" ("AGAIN?"). */
  awaitingConfirm: boolean;
  done: boolean; // all `total` targets bound
}

/**
 * One recorded hit, as decoded from the Results characteristic. Mirrors the
 * firmware HitRecord (drill_engine.h) plus `sensor`, which the brain splices in
 * from the ESP-NOW Pressed packet (the engine record itself has no sensor).
 */
export interface HitRecord {
  seq: number;
  position: number;
  tLitUs: number;
  tHitUs: number; // 0 on a miss
  reactionMs: number;
  movementMs: number;
  sensor: "tof" | "piezo";
  miss: boolean;
}
