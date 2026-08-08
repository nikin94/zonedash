# ZoneDash DK reference peripheral

A **bench tool**, not product firmware. It runs on an **nRF52840-DK** and
impersonates the central unit's BLE GATT service so the phone app's real BLE path
(`BleCentralTransport → BlePlxPeripheral → radio`) can be exercised end to end
**without the ESP32-S3 brain** — the role `docs/architecture.md` reserves for the
owner's dev-kit ("a reference BLE peripheral that impersonates the central
unit's GATT so the Expo app can be tested while the real S3 is busy").

It is deliberately **outside** the ESP32 build (`firmware/`, PlatformIO) and
**outside CI**: it is a Zephyr / nRF Connect SDK app, board-dependent, and can
only be validated on the DK. See "Status" at the bottom.

## What it does

- Advertises `5a17e900-…` (ZONEDASH_SERVICE_UUID) as **ZoneDash-DK**, with the
  three characteristics the app expects — Control (write), Status (notify),
  Results (notify), UUIDs `…e901/e902/e903`, byte-for-byte from
  `app/src/ble/contract.ts`.
- On a **Control write** it decodes the same format the app encodes
  (`app/src/ble/codec.ts`, pinned by `docs/ble-vectors.json`) and plays a
  scripted scenario back over notifications:
  - **Pairing** — `StartPairing(N)` opens a round; each `SelectPairSpot(s)`
    lights the spot, then auto-confirms after ~0.8 s (bind), emitting Pairing
    snapshots until `done`. `Extend` / `Undo` / `Finish` behave as the real
    central would.
  - **Session** — `LoadDrill` + `StartSession` run a scripted drill: Progress
    (target lit) then Resolved (hit) per step, then a `done` session event.
    `ArmLiveTarget` drives a single live step. `StopSession` ends it.
  - **Results** — `DumpResults` replies with the run's records as one logical
    buffer **chunked across notifications** at `MTU-3` bytes each, exactly what
    `BleCentralTransport.onResultsFrame` reassembles. This is the real reason to
    test on hardware: a live MTU + a multi-frame Results reply.

The **values** it emits are a freeform bench script; only the **byte layout** is
contractual and mirrors `codec.ts` field for field. Change the layout in
`codec.ts` + `ble-vectors.json` first, then mirror it in `src/main.c`.

## Prerequisites

- **nRF Connect SDK** (Zephyr) toolchain — nRF Connect for VS Code, or `west` +
  the Zephyr SDK on the CLI. Any **NCS 2.x** works; the BLE APIs used here are
  stable across the line.
- The **nRF52840-DK** over USB (on-board J-Link — no external programmer).
- The phone running a **dev build** of the app with real BLE on:
  `EXPO_PUBLIC_BLE=1` (NOT Expo Go).

## Build & flash

Board string depends on your NCS version (Zephyr hardware-model v2 changed the
separator):

- **NCS ≥ 2.7:** `nrf52840dk/nrf52840`
- **NCS ≤ 2.6:** `nrf52840dk_nrf52840`

```sh
cd firmware-dk
# NCS 2.7+
west build -b nrf52840dk/nrf52840
west flash
# watch the log (RTT or the DK's USB CDC UART)
```

In nRF Connect for VS Code: **Add build configuration** → pick the
`nrf52840dk` board → Build → Flash.

## Run the flow

1. Flash the DK; it logs `advertising as ZoneDash-DK`.
2. Launch the dev app (`EXPO_PUBLIC_BLE=1 npx expo run:ios` / `run:android`).
3. Tap the header status chip to connect — it scans by service UUID and finds
   the DK. Watch the DK log for `connected` and `status/results notifications on`.
4. **Pairing:** tap Start, then tap spots on the court — each confirms itself a
   beat later; the round completes and the drill surface appears.
5. **Session:** pick a mode, Start — Progress/Resolved stream in; the run ends
   with "Session complete".
6. **Results:** the summary pulls via `DumpResults` — the DK chunks it across
   notifications and the app reassembles. A longer run (more steps) forces more
   frames — the reassembly path under a real MTU.

What this validates on real radio: connect + MTU negotiation, Control **encode**,
Status/Results **decode**, multi-frame Results **reassembly**, and the dump
**timeout** (kill the DK mid-dump and the app fails gracefully instead of
hanging).

## Status

Board-dependent, **not in CI**, and not unit-tested — validated only on the DK.
This is an intentional step outside the repo's "green before merge" rule (the
app/firmware codec halves it drives ARE fully tested and pinned; this is the
live-radio harness for them). If a `west build` errors on your NCS version, tell
me the version and the error — the likely culprits are the board string (above)
or a renamed advertising/MTU Kconfig, both quick fixes.
