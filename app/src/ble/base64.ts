/**
 * Base64 <-> bytes for the BLE adapter. react-native-ble-plx moves characteristic
 * values as base64 STRINGS, but the whole transport above the radio seam speaks
 * Uint8Array (ble/codec.ts). BlePlxPeripheral is the one place that converts, so
 * this pair is its only real logic — pure and host-tested, keeping the untested
 * board surface down to the library's own calls.
 *
 * Dependency-free on purpose: RN has no Buffer/atob by default, and pulling a
 * base64 package for ~30 lines isn't worth it. Standard base64 (RFC 4648), with
 * `=` padding on encode; decode tolerates padding and stops at the first `=`.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reverse map (char code -> 6-bit value), -1 for any non-alphabet byte. */
const INV = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? ALPHABET[b2 & 0x3f] : "=";
  }
  return out;
};

export const base64ToBytes = (b64: string): Uint8Array => {
  // Count real (non-padding, non-whitespace) symbols first, so the output is
  // sized exactly — every 4 symbols carry 3 bytes, a trailing 2/3 carry 1/2.
  let symbols = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64.charCodeAt(i);
    if (c === 61 /* = */) break; // padding marks the end of data
    if (c === 10 || c === 13 || c === 32 /* \n \r space */) continue;
    symbols++;
  }
  const out = new Uint8Array(Math.floor((symbols * 6) / 8));
  let bits = 0;
  let nbits = 0;
  let o = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64.charCodeAt(i);
    if (c === 61) break;
    if (c === 10 || c === 13 || c === 32) continue;
    const v = c < 128 ? INV[c] : -1;
    if (v < 0) throw new Error(`invalid base64 character: ${b64[i]}`);
    bits = (bits << 6) | v;
    nbits += 6;
    if (nbits >= 8) {
      nbits -= 8;
      out[o++] = (bits >> nbits) & 0xff; // the leftover <8 bits are zero-padding
    }
  }
  return out;
};
