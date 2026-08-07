/**
 * BLE Control-characteristic codec — the byte encoding for every command the
 * app writes to the central unit (contract.ts CHAR.control). This is the
 * app-side half of the one cross-language seam: the firmware brain must decode
 * these exact bytes (its BLE receive path is still a TODO — src/brain/main.cpp).
 *
 * There is no existing byte format to mirror: contract.ts only names the opcodes
 * and the payload each carries in prose, and protocol.h is the *ESP-NOW* wire
 * (brain <-> targets), not BLE. So this file DEFINES the Control wire format.
 * The pin is the golden-vector table below (and codec.test.ts): the future
 * brain/DK decoder asserts the same bytes, the way protocol.h pins its structs
 * with static_asserts. Keep both sides in lock-step; bump a version if it moves.
 *
 * Format — every Control write is `[opcode, ...payload]`, all multi-byte fields
 * LITTLE-ENDIAN (both the phone and the ESP32 brain are LE, like the ESP-NOW
 * packets in protocol.h):
 *
 *   op                       bytes
 *   ─────────────────────────────────────────────────────────────────────────
 *   StartSession   (1)       [1]
 *   StopSession    (2)       [2]
 *   StartPairing   (3)       [3, N]                    N = targets to bind (u8)
 *   DumpResults    (4)       [4]
 *   LoadDrill      (5)       [5, <DrillConfig blob>]   see below
 *   SelectPairSpot (6)       [6, spot]                 canonical court spot (u8)
 *   ExtendPairing  (7)       [7, N]                    new total (u8)
 *   UndoPairBind   (8)       [8]
 *   ArmLiveTarget  (9)       [9, position]             live slot index (u8)
 *   FinishPairing  (10)      [10]
 *
 * DrillConfig blob (mirrors the firmware struct drill_engine.h::DrillConfig,
 * field for field, so the brain fills it directly):
 *   u8   mode          0 random, 1 path, 2 live, 3 time (DrillMode enum order)
 *   u8   num_positions
 *   u16  count
 *   u32  duration_ms
 *   u32  delay_ms
 *   u32  timeout_ms
 *   u8   flags         bit0 = allow_immediate_repeat (rest reserved, 0)
 *   u8   path_len
 *   u8[] path          path_len entries, each a slot index
 * -> an 18-byte fixed head plus the path.
 */
import { ControlOp } from "./contract";
import type { DrillConfig } from "./transport";

/** Largest active layout (mirrors protocol.h MAX_TARGETS) — the u8 range for a
 *  target count / slot index. */
export const MAX_TARGETS = 8;

/** Fixed head of the LoadDrill blob, before the variable-length path. */
const DRILL_HEAD = 18;

/** allow_immediate_repeat lives in bit 0 of the flags byte. */
const FLAG_ALLOW_REPEAT = 1 << 0;

/**
 * DrillConfig.mode -> its wire byte. MUST match the firmware DrillMode enum
 * declaration order (drill_engine.h): Random 0, Path 1, Live 2, TimeLimited 3.
 * The app folds Random/TimeLimited into one UI "Random" with a stop-by toggle,
 * but the wire mode is the engine's, so "time" is its own value here.
 */
const MODE_WIRE: Record<DrillConfig["mode"], number> = {
  random: 0,
  path: 1,
  live: 2,
  time: 3,
};

/**
 * A typed Control message — one per ControlOp, carrying exactly the payload that
 * op needs. This is the seam BleCentralTransport encodes: each transport method
 * builds one of these and writes `encodeControl(msg)` to CHAR.control.
 */
export type ControlMessage =
  | { op: ControlOp.StartSession }
  | { op: ControlOp.StopSession }
  | { op: ControlOp.DumpResults }
  | { op: ControlOp.UndoPairBind }
  | { op: ControlOp.FinishPairing }
  | { op: ControlOp.StartPairing; numTargets: number }
  | { op: ControlOp.ExtendPairing; numTargets: number }
  | { op: ControlOp.SelectPairSpot; spot: number }
  | { op: ControlOp.ArmLiveTarget; position: number }
  | { op: ControlOp.LoadDrill; config: DrillConfig };

/** Assert a value fits in a u8 — a wrong number must fail loud in a test, not
 *  silently wrap when it becomes a single byte on the wire. */
const u8 = (v: number, field: string): number => {
  if (!Number.isInteger(v) || v < 0 || v > 0xff) {
    throw new RangeError(`${field} out of u8 range: ${v}`);
  }
  return v;
};

/** Serialize a DrillConfig into its wire blob (the LoadDrill payload). */
const encodeDrill = (c: DrillConfig): Uint8Array => {
  const path = c.path ?? [];
  const buf = new Uint8Array(DRILL_HEAD + path.length);
  const view = new DataView(buf.buffer);

  buf[0] = MODE_WIRE[c.mode];
  buf[1] = u8(c.numPositions, "numPositions");
  // count is a u16; duration/delay/timeout are u32 — absent optionals fall back
  // to the firmware struct defaults so the brain gets the value it would anyway.
  view.setUint16(2, c.count ?? 10, true);
  view.setUint32(4, c.durationMs ?? 60000, true);
  view.setUint32(8, c.delayMs ?? 0, true);
  view.setUint32(12, c.timeoutMs ?? 0, true);
  buf[16] = c.allowImmediateRepeat ? FLAG_ALLOW_REPEAT : 0;
  buf[17] = u8(path.length, "path length");
  path.forEach((p, i) => {
    buf[DRILL_HEAD + i] = u8(p, `path[${i}]`);
  });
  return buf;
};

/**
 * Encode a Control message to the bytes written to CHAR.control. Deterministic
 * and side-effect free — the golden vectors in codec.test.ts pin every case.
 */
export const encodeControl = (msg: ControlMessage): Uint8Array => {
  switch (msg.op) {
    case ControlOp.StartSession:
    case ControlOp.StopSession:
    case ControlOp.DumpResults:
    case ControlOp.UndoPairBind:
    case ControlOp.FinishPairing:
      return Uint8Array.of(msg.op);
    case ControlOp.StartPairing:
      return Uint8Array.of(msg.op, u8(msg.numTargets, "numTargets"));
    case ControlOp.ExtendPairing:
      return Uint8Array.of(msg.op, u8(msg.numTargets, "numTargets"));
    case ControlOp.SelectPairSpot:
      return Uint8Array.of(msg.op, u8(msg.spot, "spot"));
    case ControlOp.ArmLiveTarget:
      return Uint8Array.of(msg.op, u8(msg.position, "position"));
    case ControlOp.LoadDrill:
      return Uint8Array.of(msg.op, ...encodeDrill(msg.config));
  }
};
