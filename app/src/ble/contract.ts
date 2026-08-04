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
  StartPairing = 3, // MAC→position pairing round
  DumpResults = 4,
  LoadDrill = 5, // push a drill config (mode, N, sequence, timing) — "Control: config"
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
