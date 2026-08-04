# ZoneDash app

React Native (Expo SDK 57) operator app. Currently a runnable shell — screens
(connect, drill builder, live session, results) land once the BLE link to the
central unit exists (see [`../docs/architecture.md`](../docs/architecture.md),
build order).

## Run

```
cd app
npm install
npm start          # Expo dev server — scan the QR with Expo Go
```

Or launch directly: `npm run ios` / `npm run android`. No dev-client or prebuild
needed yet — that starts when `react-native-ble-plx` (BLE) is added.

## Checks

```
npm run typecheck
npm test
```

Both also run in CI on every PR.

## Scope when built

- Connect / pair with the central unit over BLE.
- Drill library (author, edit, pick).
- Start/stop + live session view (progress, current target).
- Post-session results, history, export; optional on-chain achievements.

BLE transport: `react-native-ble-plx` via dev-client + config plugin (prebuild).
The GATT contract lives in [`src/ble/contract.ts`](src/ble/contract.ts) and must
stay in sync with the brain firmware.
