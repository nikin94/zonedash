/**
 * Golden-vector tests for the Control-write codec. These byte arrays ARE the
 * cross-language contract: the firmware brain's BLE decoder must produce the
 * same struct from the same bytes. Verify a vector by hand before changing it —
 * a "fix" here that isn't matched in the firmware silently desyncs the seam.
 */
import { ControlOp } from "./contract";
import { encodeControl } from "./codec";

// Compare as plain number[] so a failure prints readable bytes, not a typed-array.
const bytes = (u: Uint8Array) => Array.from(u);

test("payload-less ops encode to a single opcode byte", () => {
  expect(bytes(encodeControl({ op: ControlOp.StartSession }))).toEqual([1]);
  expect(bytes(encodeControl({ op: ControlOp.StopSession }))).toEqual([2]);
  expect(bytes(encodeControl({ op: ControlOp.DumpResults }))).toEqual([4]);
  expect(bytes(encodeControl({ op: ControlOp.UndoPairBind }))).toEqual([8]);
  expect(bytes(encodeControl({ op: ControlOp.FinishPairing }))).toEqual([10]);
});

test("one-byte-payload ops encode as [opcode, value]", () => {
  expect(bytes(encodeControl({ op: ControlOp.StartPairing, numTargets: 8 }))).toEqual([3, 8]);
  expect(bytes(encodeControl({ op: ControlOp.ExtendPairing, numTargets: 3 }))).toEqual([7, 3]);
  expect(bytes(encodeControl({ op: ControlOp.SelectPairSpot, spot: 5 }))).toEqual([6, 5]);
  expect(bytes(encodeControl({ op: ControlOp.ArmLiveTarget, position: 2 }))).toEqual([9, 2]);
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
  // Full output is [opcode, ...blob], so a blob field's index is its blob
  // offset + 1: mode at 1, duration at 5..8, flags at 17.
  expect(out[1]).toBe(3); // mode: time
  expect(out[17]).toBe(1); // flags: allow_immediate_repeat on
  // duration_ms u32 = 45000 (0xAFC8) little-endian
  expect(out.slice(5, 9)).toEqual([200, 175, 0, 0]);
});

test("an out-of-range byte field throws instead of silently wrapping", () => {
  expect(() =>
    encodeControl({ op: ControlOp.SelectPairSpot, spot: 300 }),
  ).toThrow(/u8 range/);
  expect(() =>
    encodeControl({ op: ControlOp.ArmLiveTarget, position: -1 }),
  ).toThrow(/u8 range/);
});
