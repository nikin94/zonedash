/**
 * Golden-vector tests for the Control-write codec. These byte arrays ARE the
 * cross-language contract: the firmware brain's BLE decoder must produce the
 * same struct from the same bytes. Verify a vector by hand before changing it —
 * a "fix" here that isn't matched in the firmware silently desyncs the seam.
 *
 * Every write leads with CONTROL_VERSION (currently 1) — the first byte of each
 * vector below.
 */
import { CONTROL_VERSION, encodeControl } from "./codec";
import { ControlOp } from "./contract";

// Compare as plain number[] so a failure prints readable bytes, not a typed-array.
const bytes = (u: Uint8Array) => Array.from(u);

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
