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
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, State, type Device, type Subscription } from "react-native-ble-plx";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { LOADDRILL_MTU } from "./codec";
import { ZONEDASH_SERVICE_UUID } from "./contract";
import type { GattPeripheral } from "./gatt";
import type { Unsubscribe } from "./transport";

// Give up the scan after this long so connect() rejects (→ the transport's
// "error" state) instead of hanging while the operator taps the status chip.
const SCAN_TIMEOUT_MS = 10_000;

// How long to wait for the BLE adapter to power on before giving up, so a cold
// start (manager still initialising, state Unknown) doesn't hang the connect.
const ADAPTER_READY_MS = 5_000;

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
    // Android 12+ (API 31+) gates BLE scan/connect behind RUNTIME permissions
    // that ble-plx does not request itself — without this the very first scan
    // fails as "Unauthorized" and no permission prompt ever appears. iOS shows
    // its own Bluetooth prompt on first radio use, so nothing to request there.
    await this.requestAndroidPermissions();
    // A scan issued while the manager is still initialising (state Unknown) or
    // the radio is off also errors as "Unauthorized"/"PoweredOff" — wait for the
    // adapter to be ready, and surface a clear reason if it can't be.
    await this.waitForAdapterReady();
    const found = await this.scanForUnit();
    // requestMTU on connect so the first LoadDrill can't silently truncate.
    this.device = await found.connect({ requestMTU: REQUEST_MTU });
    await this.device.discoverAllServicesAndCharacteristics();
  }

  /** Ask for the Android runtime BLE permissions. No-op on iOS (its prompt is
   *  automatic). With `neverForLocation` set in app.json, only the two BLE
   *  permissions are needed — no location. Rejects if the user denies. */
  private async requestAndroidPermissions(): Promise<void> {
    if (Platform.OS !== "android") return;
    // The runtime permission a BLE scan needs changed at API 31 (Android 12):
    //  - 31+  : BLUETOOTH_SCAN + BLUETOOTH_CONNECT (the new, location-free perms;
    //           our app.json sets neverForLocation). This is the bench target.
    //  - 24–30: a scan is treated as a location operation, so ACCESS_FINE_LOCATION
    //           is what must be granted — the 12+ perms don't exist there.
    // Requesting the wrong set for the OS version silently no-ops and the scan
    // then fails as "Unauthorized", so gate on the API level. NOTE: full 24–30
    // support also needs ACCESS_FINE_LOCATION declared in app.json — intentionally
    // omitted so the app stays location-free (neverForLocation); until it's added
    // the <=30 branch will surface a clear "permission denied" rather than a mute
    // scan. minSdk is 24 but the app targets 12+ devices.
    const wanted =
      Number(Platform.Version) >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const result = await PermissionsAndroid.requestMultiple(wanted);
    const denied = wanted.some(
      (p) => result[p] !== PermissionsAndroid.RESULTS.GRANTED,
    );
    if (denied) {
      throw new Error("Bluetooth permission denied — enable it in Settings");
    }
  }

  /** Resolve once the adapter is PoweredOn; reject with a clear reason on a
   *  terminal state (Unauthorized / PoweredOff / Unsupported) or after a bounded
   *  wait, so connect() never hangs on a radio that never comes up. */
  private waitForAdapterReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let sub: Subscription | null = null;
      const settle = (fn: () => void) => {
        clearTimeout(timer);
        sub?.remove();
        fn();
      };
      const timer = setTimeout(
        () => settle(() => reject(new Error("Bluetooth not ready"))),
        ADAPTER_READY_MS,
      );
      // `true` emits the current state immediately, so an already-on adapter
      // resolves without waiting for a change.
      sub = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) settle(resolve);
        else if (state === State.Unauthorized)
          settle(() => reject(new Error("Bluetooth permission denied — enable it in Settings")));
        else if (state === State.PoweredOff)
          settle(() => reject(new Error("Bluetooth is off — turn it on to connect")));
        else if (state === State.Unsupported)
          settle(() => reject(new Error("this device has no Bluetooth LE")));
        // Unknown / Resetting: keep waiting for the next transition.
      }, true);
    });
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
