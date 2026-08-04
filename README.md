# ZoneDash

A wireless court reaction / footwork trainer for badminton (extensible to other
court sports). Targets are placed around one player's half of the court; a
central unit lights them in a chosen sequence, the player reaches the lit target,
it clears, the next lights, and the system records the timing.

Rebuild of a wired Raspberry-Pi prototype into a wireless system: **phone
(operator app) ⇄ central unit (display + brain) ⇄ 8 targets**.

## Monorepo layout

```
zonedash/
├── docs/          Design docs (concept, architecture, BOM, enclosure, Solana)
├── firmware/      PlatformIO project — two builds:
│   ├── src/brain/   ESP32-S3: drill engine, HUB75 display, ESP-NOW, BLE
│   ├── src/target/  ESP32-C3: ToF/piezo trigger, timestamp, ESP-NOW
│   └── lib/protocol/  Shared on-wire packet format (brain ⇄ target)
└── app/           React Native (Expo) operator app — deferred until the
                   hardware link is proven; see docs/architecture.md
```

**Why a monorepo:** two shared contracts must never drift — the ESP-NOW packet
format (brain ⇄ target, both C++) and the BLE GATT contract (brain ⇄ app, C++ ⇄
TS). One repo keeps each contract in a single source of truth and lets a format
change touch both sides in one commit.

## Docs

- [`docs/concept.md`](docs/concept.md) — product concept + decisions
- [`docs/architecture.md`](docs/architecture.md) — system design, protocol, timing
- [`docs/bom.md`](docs/bom.md) — bill of materials + prototype shopping list
- [`docs/enclosure.md`](docs/enclosure.md) — 3D-printed enclosures
- [`docs/solana.md`](docs/solana.md) — optional on-chain layer (parked)

## Status

Prototype-first: build **one** target node + the central unit, validate the two
riskiest unknowns on court (ToF-vs-piezo trigger, BLE+ESP-NOW coexistence), then
replicate the target ×8. Firmware and app are skeletons; hardware on order.
