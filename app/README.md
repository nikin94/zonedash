# ZoneDash app

React Native (Expo, dev-client) operator app. **Deferred** until the hardware
link is proven — the firmware + court prototype come first (see
[`../docs/architecture.md`](../docs/architecture.md), build order).

Scope when built:

- Connect / pair with the central unit over BLE.
- Drill library (author, edit, pick).
- Start/stop + live session view (progress, current target).
- Post-session results, history, export; optional on-chain achievements.

BLE transport: `react-native-ble-plx` via dev-client + config plugin (prebuild).
The GATT contract lives in [`src/ble/contract.ts`](src/ble/contract.ts) and must
stay in sync with the brain firmware.
