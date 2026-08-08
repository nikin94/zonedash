import { createTransport } from "./createTransport";
import { MockCentralTransport } from "./mock";

// Only the default (mock) path is exercised here: the BLE branch require()s
// react-native-ble-plx, whose native BleManager can't load under jest. That path
// is bench-validated, not unit-tested (see BlePlxPeripheral).
describe("createTransport", () => {
  const prev = process.env.EXPO_PUBLIC_BLE;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_BLE;
    else process.env.EXPO_PUBLIC_BLE = prev;
  });

  test("defaults to the mock transport when BLE is not opted in", () => {
    delete process.env.EXPO_PUBLIC_BLE;
    expect(createTransport()).toBeInstanceOf(MockCentralTransport);
  });

  test("any value other than the opt-in flag stays on the mock", () => {
    process.env.EXPO_PUBLIC_BLE = "0";
    expect(createTransport()).toBeInstanceOf(MockCentralTransport);
  });
});
