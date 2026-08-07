/**
 * Golden-vector tests for the Control-write codec. These byte arrays ARE the
 * cross-language contract: the firmware brain's BLE decoder must produce the
 * same struct from the same bytes. Verify a vector by hand before changing it —
 * a "fix" here that isn't matched in the firmware silently desyncs the seam.
 *
 * Every write leads with CONTROL_VERSION (currently 1) — the first byte of each
 * vector below.
 */
import {
  CONTROL_VERSION,
  decodeResults,
  decodeStatus,
  encodeControl,
  RESULTS_VERSION,
  STATUS_VERSION,
} from "./codec";
import { ControlOp } from "./contract";

// Compare as plain number[] so a failure prints readable bytes, not a typed-array.
const bytes = (u: Uint8Array) => Array.from(u);
// Build a notification buffer from its literal wire bytes.
const buf = (arr: number[]) => Uint8Array.from(arr);

const V = CONTROL_VERSION; // 1 — the leading version byte on every write

test("payload-less ops encode to [version, opcode]", () => {
  expect(bytes(encodeControl({ op: ControlOp.StartSession }))).toEqual([V, 1]);
  expect(bytes(encodeControl({ op: ControlOp.StopSession }))).toEqual([V, 2]);
  expect(bytes(encodeControl({ op: ControlOp.DumpResults }))).toEqual([V, 4]);
  expect(bytes(encodeControl({ op: ControlOp.UndoPairBind }))).toEqual([V, 8]);
  expect(bytes(encodeControl({ op: ControlOp.FinishPairing }))).toEqual([V, 10]);
});

test("one-byte-payload ops encode as [version, opcode, value]", () => {
  expect(bytes(encodeControl({ op: ControlOp.StartPairing, numTargets: 8 }))).toEqual([V, 3, 8]);
  expect(bytes(encodeControl({ op: ControlOp.ExtendPairing, numTargets: 3 }))).toEqual([V, 7, 3]);
  expect(bytes(encodeControl({ op: ControlOp.SelectPairSpot, spot: 5 }))).toEqual([V, 6, 5]);
  expect(bytes(encodeControl({ op: ControlOp.ArmLiveTarget, position: 2 }))).toEqual([V, 9, 2]);
});

test("LoadDrill (random) serializes the DrillConfig blob little-endian", () => {
  const out = bytes(
    encodeControl({
      op: ControlOp.LoadDrill,
      config: {
        mode: "random",
        numPositions: 8,
        count: 20,
        delayMs: 500,
        // durationMs / timeoutMs absent -> firmware defaults (60000 / 0)
      },
    }),
  );
  expect(out).toEqual([
    V, // version
    5, // LoadDrill
    0, // mode: random
    8, // num_positions
    20, 0, // count u16 = 20
    96, 234, 0, 0, // duration_ms u32 = 60000 (0xEA60)
    244, 1, 0, 0, // delay_ms u32 = 500 (0x01F4)
    0, 0, 0, 0, // timeout_ms u32 = 0
    0, // flags: allow_immediate_repeat off
    0, // path_len
  ]);
});

test("LoadDrill (path) appends the slot sequence after the fixed head", () => {
  const out = bytes(
    encodeControl({
      op: ControlOp.LoadDrill,
      config: { mode: "path", numPositions: 6, path: [2, 0, 5] },
    }),
  );
  expect(out).toEqual([
    V, // version
    5, // LoadDrill
    1, // mode: path
    6, // num_positions
    10, 0, // count u16 = 10 (default)
    96, 234, 0, 0, // duration_ms u32 = 60000 (default)
    0, 0, 0, 0, // delay_ms u32 = 0 (default)
    0, 0, 0, 0, // timeout_ms u32 = 0
    0, // flags
    3, // path_len
    2, 0, 5, // path
  ]);
});

test("allow_immediate_repeat sets flags bit 0; time mode is wire value 3", () => {
  const out = bytes(
    encodeControl({
      op: ControlOp.LoadDrill,
      config: {
        mode: "time",
        numPositions: 4,
        durationMs: 45000,
        allowImmediateRepeat: true,
      },
    }),
  );
  // Full write is [version, opcode, ...blob], so a blob field's index is its
  // blob offset + 2: mode at 2, duration at 6..9, flags at 18.
  expect(out[2]).toBe(3); // mode: time
  expect(out[18]).toBe(1); // flags: allow_immediate_repeat on
  // duration_ms u32 = 45000 (0xAFC8) little-endian
  expect(out.slice(6, 10)).toEqual([200, 175, 0, 0]);
});

test("an out-of-range byte field throws instead of silently wrapping", () => {
  expect(() =>
    encodeControl({ op: ControlOp.SelectPairSpot, spot: 300 }),
  ).toThrow(/out of range/);
  expect(() =>
    encodeControl({ op: ControlOp.ArmLiveTarget, position: -1 }),
  ).toThrow(/out of range/);
});

// The u16/u32 config fields are guarded the same way — an over-width count
// would otherwise wrap (setUint16 takes it mod 2^16: 70000 -> 4464) and put a
// silently wrong rep count on the wire.
test("an over-u16 count throws instead of wrapping on the wire", () => {
  expect(() =>
    encodeControl({
      op: ControlOp.LoadDrill,
      config: { mode: "random", numPositions: 8, count: 70000 },
    }),
  ).toThrow(/count out of range/);
});

// A path slot outside the active layout would arm a target that isn't bound.
test("a path entry at or beyond num_positions throws", () => {
  expect(() =>
    encodeControl({
      op: ControlOp.LoadDrill,
      config: { mode: "path", numPositions: 4, path: [0, 4] }, // 4 is out of [0,3]
    }),
  ).toThrow(/path\[1\] out of range/);
});

// ── Status decode ────────────────────────────────────────────────────────────
// Same golden-vector discipline in the brain->app direction: these bytes ARE the
// contract the brain's Status encoder must produce. SV/RV are the leading version
// byte on every notification.
const SV = STATUS_VERSION; // 1
const RV = RESULTS_VERSION; // 1

// Decode + narrow the union to the expected kind, so a field access is typed
// (and a wrong kind fails loudly rather than reading undefined).
const sessionOf = (b: number[]) => {
  const e = decodeStatus(buf(b));
  if (e.kind !== "session") throw new Error(`expected session, got ${e.kind}`);
  return e;
};
const pairingOf = (b: number[]) => {
  const e = decodeStatus(buf(b));
  if (e.kind !== "pairing") throw new Error(`expected pairing, got ${e.kind}`);
  return e.progress;
};

test("session decodes state (wire order) and the online-target count", () => {
  expect(decodeStatus(buf([SV, 1, 2, 3]))).toEqual({
    kind: "session",
    state: "running", // wire 2 = running (idle 0, pairing 1, running 2, done 3)
    targetsOnline: 3,
  });
  expect(sessionOf([SV, 1, 0, 0]).state).toBe("idle");
  expect(sessionOf([SV, 1, 3, 8]).state).toBe("done");
});

test("pairing decodes bound spots, the prompted spot, and the flag bits", () => {
  // total 3, boundCount 2, currentSpot 5, flags 0 (nothing set), spots [0, 2].
  expect(decodeStatus(buf([SV, 2, 3, 2, 5, 0, 0, 2]))).toEqual({
    kind: "pairing",
    progress: {
      total: 3,
      boundSpots: [0, 2],
      currentSpot: 5,
      awaitingConfirm: false,
      done: false,
    },
  });
  // currentSpot 0xFF = none; flags bit1 = done; three spots.
  expect(pairingOf([SV, 2, 3, 3, 0xff, 0b10, 0, 2, 6])).toMatchObject({
    currentSpot: null,
    done: true,
    awaitingConfirm: false,
    boundSpots: [0, 2, 6],
  });
  // flags bit0 = awaitingConfirm.
  expect(pairingOf([SV, 2, 2, 1, 4, 0b01, 4])).toMatchObject({
    awaitingConfirm: true,
    currentSpot: 4,
  });
});

test("progress and resolved decode seq (u16 LE), position, and reaction", () => {
  expect(decodeStatus(buf([SV, 3, 44, 1, 5]))).toEqual({
    kind: "progress",
    seq: 300, // 0x012C little-endian
    position: 5,
  });
  // seq 2, position 4, flags 0 (hit), reactionMs 820 (0x0334).
  expect(decodeStatus(buf([SV, 4, 2, 0, 4, 0, 52, 3, 0, 0]))).toEqual({
    kind: "resolved",
    seq: 2,
    position: 4,
    miss: false,
    reactionMs: 820,
  });
  // flags bit0 = miss.
  expect(decodeStatus(buf([SV, 4, 9, 0, 1, 1, 136, 19, 0, 0]))).toMatchObject({
    miss: true,
    reactionMs: 5000, // 0x1388
  });
});

test("decodeStatus rejects a wrong version, an unknown kind, and a short buffer", () => {
  expect(() => decodeStatus(buf([2, 1, 0, 0]))).toThrow(/status version/);
  expect(() => decodeStatus(buf([SV, 99, 0, 0]))).toThrow(/unknown status kind/);
  expect(() => decodeStatus(buf([SV, 1, 0]))).toThrow(/need 4 bytes/); // session truncated
  expect(() => decodeStatus(buf([SV, 3, 44]))).toThrow(/need 5 bytes/); // progress truncated
});

// ── Results decode ───────────────────────────────────────────────────────────

test("decodeResults reads a whole hit record, u64 timestamps and the sensor", () => {
  const records = decodeResults(
    buf([
      RV,
      1, 0, // count u16 = 1
      // one record (29 bytes):
      0, 0, // seq u16 = 0
      4, // position
      0, 0, 0, 0, 0, 0, 0, 0, // t_lit_us u64 = 0
      32, 131, 12, 0, 0, 0, 0, 0, // t_hit_us u64 = 820000 (0xC8320)
      52, 3, 0, 0, // reaction_ms u32 = 820
      0, 0, 0, 0, // movement_ms u32 = 0
      0, // flags: hit
      0, // sensor: tof
    ]),
  );
  expect(records).toEqual([
    {
      seq: 0,
      position: 4,
      tLitUs: 0,
      tHitUs: 820000,
      reactionMs: 820,
      movementMs: 0,
      miss: false,
      sensor: "tof",
    },
  ]);
});

test("decodeResults handles an empty set, a miss + piezo, and multiple records", () => {
  expect(decodeResults(buf([RV, 0, 0]))).toEqual([]); // count 0 — no records

  // A miss record (flags bit0, sensor 1 = piezo), t_hit_us = 0 on a miss.
  const miss = decodeResults(
    buf([
      RV, 1, 0,
      7, 0, // seq 7
      2, // position
      0, 0, 0, 0, 0, 0, 0, 0, // t_lit_us
      0, 0, 0, 0, 0, 0, 0, 0, // t_hit_us = 0 (miss)
      136, 19, 0, 0, // reaction_ms = 5000 (timeout)
      0, 0, 0, 0, // movement_ms
      1, // flags: miss
      1, // sensor: piezo
    ]),
  );
  expect(miss[0]).toMatchObject({ seq: 7, miss: true, sensor: "piezo", tHitUs: 0 });
});

test("decodeResults rejects a wrong version and a truncated record", () => {
  expect(() => decodeResults(buf([9, 0, 0]))).toThrow(/results version/);
  // count says 1 but only a partial record follows.
  expect(() => decodeResults(buf([RV, 1, 0, 0, 0, 4]))).toThrow(/need 32 bytes/);
});
