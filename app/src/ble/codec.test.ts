/**
 * Codec tests. The GOLDEN VECTORS — the actual cross-language byte contract —
 * live in a language-neutral fixture, docs/ble-vectors.json, NOT as literals in
 * this file. That fixture is the SHARED pin: this test loads it today, and the
 * future C++ brain-decoder test must load the SAME file, so a byte edit breaks
 * both language builds at once (the drift guard protocol.h gives the ESP-NOW
 * side). Change a vector in the JSON, never here.
 *
 * The tests below the golden loops are BEHAVIOUR, not byte pins: range guards,
 * version/kind/truncation rejects, and the pooled-buffer (nonzero byteOffset)
 * path a real BLE stack hands us. Those stay inline.
 */
import {
  CONTROL_VERSION,
  type ControlMessage,
  decodeResults,
  decodeStatus,
  encodeControl,
  RESULTS_VERSION,
  STATUS_VERSION,
} from "./codec";
import { ControlOp, type HitRecord } from "./contract";
import type { StatusEvent } from "./transport";
// The SHARED, cross-language fixture — the same file the future C++ brain test
// loads. It lives at the repo root, outside the app package; only this test (and
// tsc) ever read it — the app bundle never imports a test file, so Metro is not
// involved. Edit a byte there, and both language builds must be re-pinned.
import rawVectors from "../../../docs/ble-vectors.json";

interface Vectors {
  controlVersion: number;
  statusVersion: number;
  resultsVersion: number;
  control: { name: string; message: ControlMessage; bytes: number[] }[];
  status: { name: string; bytes: number[]; event: StatusEvent }[];
  results: { name: string; bytes: number[]; records: HitRecord[] }[];
}

// The JSON is structurally inferred; assert our contract shape over it once here.
const vectors = rawVectors as unknown as Vectors;

// Compare as plain number[] so a failure prints readable bytes, not a typed-array.
const asArray = (u: Uint8Array) => Array.from(u);
// Build a notification buffer from its literal wire bytes.
const buf = (arr: number[]) => Uint8Array.from(arr);

// The fixture carries its own version numbers; they must agree with the codec's
// constants, or the shared pin and the code have already drifted.
test("fixture versions match the codec constants", () => {
  expect(vectors.controlVersion).toBe(CONTROL_VERSION);
  expect(vectors.statusVersion).toBe(STATUS_VERSION);
  expect(vectors.resultsVersion).toBe(RESULTS_VERSION);
});

describe("Control encode — golden vectors (docs/ble-vectors.json)", () => {
  for (const v of vectors.control) {
    test(v.name, () => {
      expect(asArray(encodeControl(v.message))).toEqual(v.bytes);
    });
  }
});

describe("Status decode — golden vectors (docs/ble-vectors.json)", () => {
  for (const v of vectors.status) {
    test(v.name, () => {
      expect(decodeStatus(buf(v.bytes))).toEqual(v.event);
    });
  }
});

describe("Results decode — golden vectors (docs/ble-vectors.json)", () => {
  for (const v of vectors.results) {
    test(v.name, () => {
      expect(decodeResults(buf(v.bytes))).toEqual(v.records);
    });
  }
});

// ── Behaviour: encode range guards ───────────────────────────────────────────

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

// ── Behaviour: decode rejects ────────────────────────────────────────────────

test("decodeStatus rejects a wrong version, an unknown kind, and a short buffer", () => {
  expect(() => decodeStatus(buf([2, 1, 0, 0]))).toThrow(/status version/);
  expect(() => decodeStatus(buf([STATUS_VERSION, 99, 0, 0]))).toThrow(/unknown status kind/);
  expect(() => decodeStatus(buf([STATUS_VERSION, 1, 0]))).toThrow(/need 4 bytes/); // session truncated
  expect(() => decodeStatus(buf([STATUS_VERSION, 3, 44]))).toThrow(/need 5 bytes/); // progress truncated
});

test("decodeResults rejects a wrong version and a truncated record", () => {
  expect(() => decodeResults(buf([9, 0, 0]))).toThrow(/results version/);
  // count says 1 but only a partial record follows.
  expect(() => decodeResults(buf([RESULTS_VERSION, 1, 0, 0, 0, 4]))).toThrow(/need 32 bytes/);
});

// ── Behaviour: pooled buffer (nonzero byteOffset) ────────────────────────────
// A real BLE stack hands notifications as a slice of a pooled buffer (Buffer /
// subarray), so the bytes rarely start at byteOffset 0. Decode a fixture vector
// wrapped in a larger pool to prove DataView is scoped to the slice, not the
// whole backing buffer.
test("decoders read a slice at a nonzero byteOffset (pooled buffer), not the whole pool", () => {
  const session = vectors.status.find((v) => v.name === "session.running")!;
  const results = vectors.results.find((v) => v.name === "single.hit.tof")!;

  const pool = new Uint8Array([0xde, 0xad, 0xbe, ...session.bytes, 0xff]);
  const slice = pool.subarray(3, 3 + session.bytes.length);
  expect(slice.byteOffset).toBeGreaterThan(0);
  expect(decodeStatus(slice)).toEqual(session.event);

  const rPool = new Uint8Array([0, 0, 0, 0, 0, ...results.bytes]);
  expect(decodeResults(rPool.subarray(5))).toEqual(results.records);
});
