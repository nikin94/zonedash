# ZoneDash app

React Native (Expo SDK 57) operator app. Currently a runnable shell with a
connect flow driven by a **mock central unit** — screens are built against the
transport seam first, then pointed at the real hardware (see
[`../docs/architecture.md`](../docs/architecture.md), build order).

## Transport seam

The UI only talks to the `CentralTransport` interface
([`src/ble/transport.ts`](src/ble/transport.ts)); each method maps 1:1 to a
`ControlOp` in the GATT contract. Implementations:

- **`MockCentralTransport`** ([`src/ble/mock.ts`](src/ble/mock.ts)) — in-app
  simulator of pairing rounds and drill sessions (mirrors `lib/pairing` /
  `lib/engine` behavior). Runs in Expo Go; what all screens are developed
  against.
- **BLE implementation (later)** — `react-native-ble-plx` over the contract in
  [`src/ble/contract.ts`](src/ble/contract.ts), added together with the
  dev-client switch.

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
