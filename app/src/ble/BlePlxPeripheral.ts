/**
 * BlePlxPeripheral — the concrete GattPeripheral over react-native-ble-plx, the
 * ONE board-dependent module in the BLE stack. Everything above the seam
 * (BleCentralTransport: command encode, notification decode, session/connection
 * state) is pure and host-tested against a fake; this file is the thin layer that
 * actually touches the radio, so it is validated at the bench, not in jest.
 *
 * It is loaded ONLY by createTransport() when EXPO_PUBLIC_BLE=1 (a dev-client
 * build) — react-native-ble-plx is not in Expo Go, and nothing else imports this
 * file, so the mock/test path never pulls the native module.
 *
 * The seam speaks opaque byte frames; ble-plx speaks base64 strings, so each
 * write/notification round-trips through ble/base64.ts. The GATT service and
 * characteristic UUIDs are the shared contract (ble/contract.ts) the brain's
 * (TODO) GATT server must advertise.
 */
import { BleManager, type Device, type Subscription } from "react-native-ble-plx";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { LOADDRILL_MTU } from "./codec";
import { ZONEDASH_SERVICE_UUID } from "./contract";
import type { GattPeripheral } from "./gatt";
import type { Unsubscribe } from "./transport";

// Give up the scan after this long so connect() rejects (→ the transport's
// "error" state) instead of hanging while the operator taps the status chip.
const SCAN_TIMEOUT_MS = 10_000;

// A LoadDrill with a long path can exceed the 23-byte default ATT MTU (the
// caveat flagged in codec.ts). Ask for a larger one at connect; Android honours
// it, iOS negotiates its own max — either way a full drill config fits a write.
// NOTE: the INBOUND Results reply is NOT made to fit one frame by MTU — a real
// session's records span several notifications regardless of MTU, so the
// transport reassembles them (BleCentralTransport.onResultsFrame). MTU here only
// widens the single outbound Control write. Single-sourced with the path cap
// (codec.ts MAX_DRILL_PATH) so the requested MTU and the bound can't drift.
const REQUEST_MTU = LOADDRILL_MTU;

export class BlePlxPeripheral implements GattPeripheral {
  private manager = new BleManager();
  private device: Device | null = null;

  async connect(): Promise<void> {
    const found = await this.scanForUnit();
    // requestMTU on connect so the first LoadDrill can't silently truncate.
    this.device = await found.connect({ requestMTU: REQUEST_MTU });
    await this.device.discoverAllServicesAndCharacteristics();
  }

  /** Scan for the first device advertising our service UUID, or reject on
   *  timeout / scan error. Stops the scan on every exit path. */
  private scanForUnit(): Promise<Device> {
    return new Promise<Device>((resolve, reject) => {
      const settle = (fn: () => void) => {
        clearTimeout(timer);
        this.manager.stopDeviceScan();
        fn();
      };
      const timer = setTimeout(
        () => settle(() => reject(new Error("no central unit found"))),
        SCAN_TIMEOUT_MS,
      );
      this.manager.startDeviceScan([ZONEDASH_SERVICE_UUID], null, (error, device) => {
        if (error) settle(() => reject(error));
        else if (device) settle(() => resolve(device));
      });
    });
  }

  async disconnect(): Promise<void> {
    const d = this.device;
    this.device = null;
    // Idempotent: a cancel on an already-dropped link rejects; swallow it.
    if (d) await d.cancelConnection().catch(() => {});
  }

  async write(charUuid: string, bytes: Uint8Array): Promise<void> {
    await this.requireDevice().writeCharacteristicWithResponseForService(
      ZONEDASH_SERVICE_UUID,
      charUuid,
      bytesToBase64(bytes),
    );
  }

  subscribe(charUuid: string, onFrame: (bytes: Uint8Array) => void): Unsubscribe {
    const sub: Subscription = this.requireDevice().monitorCharacteristicForService(
      ZONEDASH_SERVICE_UUID,
      charUuid,
      (error, ch) => {
        // Drop errored/empty notifications here; a real link drop comes through
        // onDisconnect, and a malformed frame is caught by the decoder above.
        if (error || !ch?.value) return;
        onFrame(base64ToBytes(ch.value));
      },
    );
    return () => sub.remove();
  }

  onDisconnect(cb: (reason?: string) => void): Unsubscribe {
    const sub = this.requireDevice().onDisconnected((error) => cb(error?.message));
    return () => sub.remove();
  }

  private requireDevice(): Device {
    if (!this.device) throw new Error("peripheral not connected");
    return this.device;
  }
}
