import { base64ToBytes, bytesToBase64 } from "./base64";

const arr = (u: Uint8Array) => Array.from(u);

test("encodes known vectors with correct padding", () => {
  expect(bytesToBase64(Uint8Array.of())).toBe("");
  expect(bytesToBase64(Uint8Array.of(1, 2, 3))).toBe("AQID"); // exact 3-byte group
  expect(bytesToBase64(Uint8Array.of(1))).toBe("AQ=="); // 1 byte -> 2 pad
  expect(bytesToBase64(Uint8Array.of(1, 2))).toBe("AQI="); // 2 bytes -> 1 pad
  // A real Control frame: [CONTROL_VERSION, LoadDrill, mode, ...] high bytes too.
  expect(bytesToBase64(Uint8Array.of(255, 0, 255))).toBe("/wD/");
});

test("decodes known vectors, honouring padding", () => {
  expect(arr(base64ToBytes(""))).toEqual([]);
  expect(arr(base64ToBytes("AQID"))).toEqual([1, 2, 3]);
  expect(arr(base64ToBytes("AQ=="))).toEqual([1]);
  expect(arr(base64ToBytes("AQI="))).toEqual([1, 2]);
  expect(arr(base64ToBytes("/wD/"))).toEqual([255, 0, 255]);
});

test("round-trips every byte value and varied lengths", () => {
  for (let len = 0; len <= 40; len++) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff);
    expect(arr(base64ToBytes(bytesToBase64(bytes)))).toEqual(arr(bytes));
  }
  // Full 0..255 alphabet coverage in one blob.
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  expect(arr(base64ToBytes(bytesToBase64(all)))).toEqual(arr(all));
});

test("decode ignores line breaks and rejects a stray non-alphabet character", () => {
  expect(arr(base64ToBytes("AQ\nID"))).toEqual([1, 2, 3]); // wrapped base64
  expect(() => base64ToBytes("AQ*D")).toThrow(/invalid base64/);
});
