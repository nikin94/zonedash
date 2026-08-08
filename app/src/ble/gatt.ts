/**
 * GattPeripheral — the thin radio seam under BleCentralTransport. It is the ONE
 * board-dependent boundary: everything above it (the transport's command
 * mapping, notification decoding, and session/connection state machine) is pure
 * and host-tested against a fake; everything below it is the actual BLE stack.
 *
 * This split is deliberate. `react-native-ble-plx` is NOT in Expo Go — it needs
 * a custom dev-client — so importing it anywhere the app bundles would break the
 * Expo Go build the whole app currently runs on. Keeping the library behind this
 * interface means BleCentralTransport (and its tests) never import it: the
 * concrete adapter that wraps ble-plx (BlePlxPeripheral) is a separate, bench-
 * time module written when the nRF DK / real S3 is on hand, and it is the only
 * code the board can prove.
 *
 * A peripheral speaks bytes, not opcodes: writing a Control command and decoding
 * a Status/Results notification are the transport's job (via ble/codec.ts). This
 * seam only moves opaque byte frames to/from a named GATT characteristic and
 * reports link loss.
 */
import type { Unsubscribe } from "./transport";

export interface GattPeripheral {
  /** Scan/connect to the central unit and discover its GATT service. Rejects if
   *  no unit is found or the link can't be established. */
  connect(): Promise<void>;
  /** Tear the link down. Idempotent — safe to call when already disconnected. */
  disconnect(): Promise<void>;

  /** Write a Control frame to a characteristic (with response). The bytes are
   *  already encoded (ble/codec.ts encodeControl); this just puts them on air. */
  write(charUuid: string, bytes: Uint8Array): Promise<void>;

  /** Subscribe to a notifying characteristic (Status / Results). `onFrame` is
   *  called with each raw notification's bytes, in arrival order. The returned
   *  Unsubscribe stops delivery. */
  subscribe(charUuid: string, onFrame: (bytes: Uint8Array) => void): Unsubscribe;

  /** Report an unsolicited link drop (out of range, unit powered off). The
   *  transport turns this into a `connection` StatusEvent — the one event that
   *  is synthesised, not decoded, since link state is a stack fact, not a
   *  notification the brain sends. `reason` is a human-readable cause if known. */
  onDisconnect(cb: (reason?: string) => void): Unsubscribe;
}
