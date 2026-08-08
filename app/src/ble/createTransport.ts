import { MockCentralTransport } from "./mock";
import type { CentralTransport } from "./transport";

/**
 * Pick the transport at app start. Default = MockCentralTransport, so Expo Go and
 * the jest suite run with no native module. A dev-client build opts into the real
 * central by setting EXPO_PUBLIC_BLE=1 (an Expo public env var, inlined at build
 * time).
 *
 * The ble-plx modules are require()'d lazily inside the opt-in branch — never at
 * module load — so react-native-ble-plx (and its native BleManager) is only
 * pulled in by a build that asked for it, keeping the mock/test path free of it.
 * This is the same seam boundary gatt.ts describes: nothing on the default path
 * imports the library.
 */
export const createTransport = (): CentralTransport => {
  if (process.env.EXPO_PUBLIC_BLE === "1") {
    const { BlePlxPeripheral } =
      require("./BlePlxPeripheral") as typeof import("./BlePlxPeripheral");
    const { BleCentralTransport } =
      require("./BleCentralTransport") as typeof import("./BleCentralTransport");
    return new BleCentralTransport(new BlePlxPeripheral());
  }
  return new MockCentralTransport();
};
