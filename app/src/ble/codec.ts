/**
 * BLE codec — the byte encoding for all three characteristics of the one
 * cross-language seam (contract.ts CHAR): the app WRITES Control (encodeControl)
 * and DECODES Status + Results notifications (decodeStatus / decodeResults). The
 * firmware brain does the mirror: decode Control, encode Status/Results. Its BLE
 * path is still a TODO (src/brain/main.cpp), so these bytes ARE the spec it must
 * match — pinned by the golden vectors in codec.test.ts, the way protocol.h pins
 * its ESP-NOW structs with static_asserts.
 *
 * There is no existing byte format to mirror: contract.ts only names the opcodes
 * and the payload each carries in prose, and protocol.h is the *ESP-NOW* wire
 * (brain <-> targets), not BLE. So this file DEFINES the Control wire format.
 *
 * The pin is a SHARED, language-neutral fixture — docs/ble-vectors.json — NOT a
 * literal in one language's test. codec.test.ts loads and asserts against it, and
 * the future C++ brain/DK decoder test MUST load and assert against the same file,
 * so a byte edit breaks both builds at once — the cross-language drift guard the
 * monorepo exists for, the same one protocol.h + static_asserts give the ESP-NOW
 * side (a shared header physically compiled into both). Keep both sides in
 * lock-step; bump CONTROL_VERSION (and the fixture's controlVersion) when the
 * format moves.
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
import type { HitRecord } from "./contract";
import { ControlOp } from "./contract";
import type { DrillConfig, SessionState, StatusEvent } from "./transport";

/** Control wire-format revision — the leading byte of every write. Bump when
 *  the byte layout changes on purpose (and update the brain's decoder). */
export const CONTROL_VERSION = 1;

/** Largest active layout (mirrors protocol.h MAX_TARGETS) — the real bound for a
 *  target count (1..MAX_TARGETS) and a slot index (0..MAX_TARGETS-1). */
export const MAX_TARGETS = 8;

/** Fixed head of the LoadDrill blob, before the variable-length path. */
const DRILL_HEAD = 18;

/** ATT MTU the transport negotiates on connect (BlePlxPeripheral requests this).
 *  A LoadDrill write must fit ONE ATT payload of this MTU — the transport does no
 *  write-long — so the authored path is bounded by what's left after the fixed
 *  head. Single-sourced here (the wire-format owner) and imported by the adapter,
 *  so the requested MTU and the path cap can never drift apart. */
export const LOADDRILL_MTU = 185;

/** Longest authored path a LoadDrill can carry and still fit one ATT write at
 *  LOADDRILL_MTU. Budget: MTU − 3 (ATT write header) − 2 (CONTROL_VERSION +
 *  opcode) − DRILL_HEAD, leaving one byte per path slot. 185 → 162 — far above
 *  any real drill, so it's a wire-safety guard the operator never feels, not a
 *  UX limit. The path builder caps appends here; encodeControl still range-checks
 *  each slot regardless. */
export const MAX_DRILL_PATH = LOADDRILL_MTU - 3 - 2 - DRILL_HEAD;

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
 * and side-effect free — the shared golden vectors (docs/ble-vectors.json) pin
 * every case. Every write leads with CONTROL_VERSION (see the versioning note).
 */
export const encodeControl = (msg: ControlMessage): Uint8Array =>
  Uint8Array.of(CONTROL_VERSION, ...encodeBody(msg));

// ─────────────────────────────────────────────────────────────────────────────
// Notification decoders (the brain -> app direction).
//
// The app READS two notifying characteristics. Each notification LEADS with its
// own version byte — same drift guard as CONTROL_VERSION — so a stale brain and
// a newer app fail loud instead of decoding garbage. A malformed or short buffer
// throws; the transport treats a throw as "drop this notification", never as a
// wrongly-shaped StatusEvent handed to the UI.
//
// NOTE: the `connection` StatusEvent is NOT on the wire — link up/down is a
// BLE-stack fact the transport synthesises, not something the brain notifies. So
// decodeStatus only produces session / pairing / progress / resolved.
//
// NOTE on `miss`: these decoders faithfully carry the miss bit (resolved.miss,
// HitRecord.miss) even though the app dropped misses UI-wide (#17, hits-only). A
// serial/bench-driven brain with a configured timeout can still emit a miss, so
// the decoder must not lie about the wire; the hits-only UI simply ignores it.
// Decode faithfully, render selectively — the miss path is live, not dead code.
//
// Status (CHAR.status)  `[STATUS_VERSION, kind, ...payload]`, LE:
//   Session  (1)  [1, state, targetsOnline]                   state u8, count u8
//   Pairing  (2)  [2, total, boundCount, currentSpot, flags, ...boundSpots]
//                   currentSpot 0xFF = none; flags bit0 awaitingConfirm, bit1 done
//   Progress (3)  [3, seq(u16), position]                     armed target changed
//   Resolved (4)  [4, seq(u16), position, flags, reactionMs(u32)]  flags bit0 miss
//
// Results (CHAR.results)  `[RESULTS_VERSION, count(u16), ...records]`:
//   record (29 bytes, mirrors firmware HitRecord + the spliced Pressed.sensor):
//     seq(u16) position(u8) tLitUs(u64) tHitUs(u64) reactionMs(u32)
//     movementMs(u32) flags(u8: bit0 miss) sensor(u8: 0 tof, 1 piezo)
//
// Results CHUNKING — a real session's records (10 hits = 293 bytes) exceed one
// ATT notification (~182 bytes at MTU 185), so the brain splits the SINGLE logical
// buffer above across consecutive Results notifications. There is NO per-frame
// header: the frames simply concatenate back into `[version, count, ...records]`.
// The header (version + count) rides the FIRST frame, so the reader knows the
// total length (RESULTS_HEADER + count*RECORD_BYTES) as soon as it arrives and
// accumulates until it has that many bytes — see resultsLength(). decodeResults
// runs on the reassembled whole. (BleCentralTransport does the reassembly.)

/** Status/Results wire revisions — each notification's leading byte. Independent
 *  of CONTROL_VERSION (separate characteristics can move separately), but bump
 *  in lock-step with the brain's encoder for that characteristic. */
export const STATUS_VERSION = 1;
export const RESULTS_VERSION = 1;

/** Status notification kinds (byte 1, after the version). */
enum StatusKind {
  Session = 1,
  Pairing = 2,
  Progress = 3,
  Resolved = 4,
}

/**
 * Wire byte -> SessionState. App-defined order (there is no firmware
 * SessionState enum yet — the brain's BLE encoder must adopt this order). Bump
 * STATUS_VERSION if it ever changes.
 *
 * BLE SessionState is NOT the engine's `enum class State` (drill_engine.h) and
 * has no 1:1 mapping: the engine's Armed/Delaying/WaitOperator all collapse to
 * `running`, and `pairing` is a PairingRound phase the engine never sees. The
 * brain SYNTHESISES this state from both sources — that translation table (which
 * engine State + pairing phase -> which BLE SessionState) is documented in
 * docs/architecture.md "BLE SessionState translation", so the brain's (TODO)
 * encoder implements a spec, not a re-invented mapping.
 */
const SESSION_STATE: readonly SessionState[] = ["idle", "pairing", "running", "done"];

/** Wire byte -> sensor, matching protocol.h `enum class Sensor { ToF=0, Piezo=1 }`. */
const SENSOR: readonly HitRecord["sensor"][] = ["tof", "piezo"];

const CURRENT_SPOT_NONE = 0xff; // pairing: no spot prompted right now
const FLAG_AWAITING = 1 << 0; // pairing flags
const FLAG_DONE = 1 << 1;
const FLAG_MISS = 1 << 0; // resolved / hit-record flags
const RECORD_BYTES = 29;
/** Results header before the records: [version(u8), count(u16)]. */
const RESULTS_HEADER = 3;

/** Guard a buffer is at least `n` bytes before reading `what`, else throw. */
const need = (bytes: Uint8Array, n: number, what: string): void => {
  if (bytes.length < n) {
    throw new RangeError(`${what}: need ${n} bytes, got ${bytes.length}`);
  }
};

/** Look up an enum-like table by wire byte, throwing on an unknown value rather
 *  than yielding `undefined` that would slip into a StatusEvent. */
const lookup = <T>(table: readonly T[], i: number, what: string): T => {
  const v = table[i];
  if (v === undefined) throw new RangeError(`unknown ${what} wire value: ${i}`);
  return v;
};

/**
 * Decode one Status-characteristic notification into the StatusEvent the UI
 * consumes — the exact shape MockCentralTransport emits, so the BLE transport is
 * a drop-in. Throws on a wrong version, unknown kind, or a truncated buffer.
 */
export const decodeStatus = (bytes: Uint8Array): StatusEvent => {
  need(bytes, 2, "status");
  if (bytes[0] !== STATUS_VERSION) {
    throw new RangeError(`status version ${bytes[0]} != ${STATUS_VERSION}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = bytes[1];
  switch (kind) {
    case StatusKind.Session: {
      need(bytes, 4, "session");
      return {
        kind: "session",
        state: lookup(SESSION_STATE, bytes[2], "session state"),
        targetsOnline: bytes[3],
      };
    }
    case StatusKind.Pairing: {
      need(bytes, 6, "pairing");
      const total = bytes[2];
      const boundCount = bytes[3];
      const currentSpot = bytes[4];
      const flags = bytes[5];
      need(bytes, 6 + boundCount, "pairing bound spots");
      return {
        kind: "pairing",
        progress: {
          total,
          boundSpots: Array.from(bytes.subarray(6, 6 + boundCount)),
          currentSpot: currentSpot === CURRENT_SPOT_NONE ? null : currentSpot,
          awaitingConfirm: (flags & FLAG_AWAITING) !== 0,
          done: (flags & FLAG_DONE) !== 0,
        },
      };
    }
    case StatusKind.Progress: {
      need(bytes, 5, "progress");
      return { kind: "progress", seq: view.getUint16(2, true), position: bytes[4] };
    }
    case StatusKind.Resolved: {
      need(bytes, 9, "resolved");
      return {
        kind: "resolved",
        seq: view.getUint16(2, true),
        position: bytes[4],
        miss: (bytes[5] & FLAG_MISS) !== 0,
        reactionMs: view.getUint32(6, true),
      };
    }
    default:
      throw new RangeError(`unknown status kind: ${kind}`);
  }
};

/**
 * Decode the Results characteristic into hit records — the DumpResults reply.
 * Each record mirrors the firmware HitRecord (drill_engine.h) with the sensor
 * the brain splices in from the ESP-NOW Pressed packet. Throws on a wrong
 * version, a length that isn't a whole number of records, or a short buffer.
 *
 * tLitUs / tHitUs are u64 on the wire but returned as Number: a session's µs
 * timestamps stay far under 2^53 (~285 years of µs), so the narrowing is exact
 * for any real value.
 */
export const decodeResults = (bytes: Uint8Array): HitRecord[] => {
  need(bytes, RESULTS_HEADER, "results header");
  if (bytes[0] !== RESULTS_VERSION) {
    throw new RangeError(`results version ${bytes[0]} != ${RESULTS_VERSION}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(1, true);
  need(bytes, RESULTS_HEADER + count * RECORD_BYTES, "results records");

  const records: HitRecord[] = [];
  for (let i = 0; i < count; i++) {
    const o = RESULTS_HEADER + i * RECORD_BYTES;
    records.push({
      seq: view.getUint16(o, true),
      position: bytes[o + 2],
      tLitUs: Number(view.getBigUint64(o + 3, true)),
      tHitUs: Number(view.getBigUint64(o + 11, true)),
      reactionMs: view.getUint32(o + 19, true),
      movementMs: view.getUint32(o + 23, true),
      miss: (bytes[o + 27] & FLAG_MISS) !== 0,
      sensor: lookup(SENSOR, bytes[o + 28], "sensor"),
    });
  }
  return records;
};

/**
 * Total byte length a complete Results buffer will occupy, read from its header
 * (version + u16 count) — or null while fewer than the 3 header bytes have
 * arrived. The brain chunks a large Results reply across several notifications
 * (see the Results-chunking note above); the transport concatenates frames and
 * only decodeResults() once it holds this many bytes. Throws on a wrong version —
 * the same rejection decodeResults makes, surfaced early so a mis-versioned
 * stream is dropped rather than accumulated toward a length that never comes.
 */
export const resultsLength = (bytes: Uint8Array): number | null => {
  if (bytes.length < RESULTS_HEADER) return null;
  if (bytes[0] !== RESULTS_VERSION) {
    throw new RangeError(`results version ${bytes[0]} != ${RESULTS_VERSION}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return RESULTS_HEADER + view.getUint16(1, true) * RECORD_BYTES;
};
