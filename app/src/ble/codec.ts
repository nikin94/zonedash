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
 * with static_asserts. Keep both sides in lock-step; bump CONTROL_VERSION when
 * the format moves.
 *
 * Versioning — every Control write LEADS with CONTROL_VERSION, exactly as every
 * ESP-NOW packet leads with protocol.h Header.version and peek_header rejects a
 * mismatch. Without it, an app and a brain on different format revisions would
 * silently decode stale bytes into the wrong struct — the very drift the version
 * byte exists to catch. The brain's (TODO) decoder MUST reject a leading byte it
 * doesn't recognise before reading the opcode.
 *
 * Format — every Control write is `[CONTROL_VERSION, opcode, ...payload]`, all
 * multi-byte fields LITTLE-ENDIAN (both the phone and the ESP32 brain are LE,
 * like the ESP-NOW packets in protocol.h):
 *
 *   op                       bytes (after the leading version byte)
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
 *
 * MTU caveat for the (unwritten) transport: a LoadDrill with a long path can
 * exceed the default 23-byte ATT MTU (20 payload). BleCentralTransport MUST
 * negotiate a larger MTU (or use write-long) before sending, or a long-path
 * config silently truncates. Flagged here so it surfaces at design time, not on
 * the DK bench. (The ESP-NOW side pins its own bound via static_assert.)
 */
import { ControlOp } from "./contract";
import type { DrillConfig } from "./transport";

/** Control wire-format revision — the leading byte of every write. Bump when
 *  the byte layout changes on purpose (and update the brain's decoder). */
export const CONTROL_VERSION = 1;

/** Largest active layout (mirrors protocol.h MAX_TARGETS) — the real bound for a
 *  target count (1..MAX_TARGETS) and a slot index (0..MAX_TARGETS-1). */
export const MAX_TARGETS = 8;

/** Fixed head of the LoadDrill blob, before the variable-length path. */
const DRILL_HEAD = 18;

/** allow_immediate_repeat lives in bit 0 of the flags byte. */
const FLAG_ALLOW_REPEAT = 1 << 0;

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

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

/**
 * Assert an integer is within [lo, hi], else throw. Every field on the wire is a
 * fixed width, so a wrong value must fail loud in a test — NOT silently wrap
 * (DataView setUint16/32 take the value mod 2^16/2^32) or clamp when it becomes
 * bytes. Used for every width: u8 slots/counts, the u16 rep count, the u32
 * timing fields — one rule, not just the single-byte ones.
 */
const range = (v: number, lo: number, hi: number, field: string): number => {
  if (!Number.isInteger(v) || v < lo || v > hi) {
    throw new RangeError(`${field} out of range [${lo}, ${hi}]: ${v}`);
  }
  return v;
};

/** Serialize a DrillConfig into its wire blob (the LoadDrill payload). */
const encodeDrill = (c: DrillConfig): Uint8Array => {
  const numPositions = range(c.numPositions, 1, MAX_TARGETS, "numPositions");
  const path = c.path ?? [];
  const buf = new Uint8Array(DRILL_HEAD + path.length);
  const view = new DataView(buf.buffer);

  buf[0] = MODE_WIRE[c.mode];
  buf[1] = numPositions;
  // count is a u16; duration/delay/timeout are u32 — absent optionals fall back
  // to the firmware struct defaults so the brain gets the value it would anyway.
  // All guarded before the write: an out-of-width value throws, never wraps.
  view.setUint16(2, range(c.count ?? 10, 0, U16_MAX, "count"), true);
  view.setUint32(4, range(c.durationMs ?? 60000, 0, U32_MAX, "durationMs"), true);
  view.setUint32(8, range(c.delayMs ?? 0, 0, U32_MAX, "delayMs"), true);
  view.setUint32(12, range(c.timeoutMs ?? 0, 0, U32_MAX, "timeoutMs"), true);
  buf[16] = c.allowImmediateRepeat ? FLAG_ALLOW_REPEAT : 0;
  // path_len is a u8; each entry must be a slot in the active layout, so it
  // can't arm a target that isn't there.
  buf[17] = range(path.length, 0, 0xff, "path length");
  path.forEach((p, i) => {
    buf[DRILL_HEAD + i] = range(p, 0, numPositions - 1, `path[${i}]`);
  });
  return buf;
};

/** The opcode + payload for a message, before the leading version byte. */
const encodeBody = (msg: ControlMessage): Uint8Array => {
  switch (msg.op) {
    case ControlOp.StartSession:
    case ControlOp.StopSession:
    case ControlOp.DumpResults:
    case ControlOp.UndoPairBind:
    case ControlOp.FinishPairing:
      return Uint8Array.of(msg.op);
    case ControlOp.StartPairing:
      return Uint8Array.of(msg.op, range(msg.numTargets, 1, MAX_TARGETS, "numTargets"));
    case ControlOp.ExtendPairing:
      return Uint8Array.of(msg.op, range(msg.numTargets, 1, MAX_TARGETS, "numTargets"));
    case ControlOp.SelectPairSpot:
      return Uint8Array.of(msg.op, range(msg.spot, 0, MAX_TARGETS - 1, "spot"));
    case ControlOp.ArmLiveTarget:
      return Uint8Array.of(msg.op, range(msg.position, 0, MAX_TARGETS - 1, "position"));
    case ControlOp.LoadDrill:
      return Uint8Array.of(msg.op, ...encodeDrill(msg.config));
  }
};

/**
 * Encode a Control message to the bytes written to CHAR.control. Deterministic
 * and side-effect free — the golden vectors in codec.test.ts pin every case.
 * Every write leads with CONTROL_VERSION (see the versioning note above).
 */
export const encodeControl = (msg: ControlMessage): Uint8Array =>
  Uint8Array.of(CONTROL_VERSION, ...encodeBody(msg));
