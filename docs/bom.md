# Bill of Materials (draft v1)

Parts for the **prototype-first** plan: build **one** target node with both
sensors, validate on court, then replicate the target ×8. Prices are rough
hobby-market estimates (EUR), for sizing only.

## A. Central unit (display + brain) — ×1

The one "smart" box: runs the drill engine, drives the HUB75 panel, talks
ESP-NOW to the targets and BLE to the phone.

| Part | Purpose | Notes | ~€ |
|------|---------|-------|----|
| **ESP32-S3** dev board (e.g. S3-DevKitC-1, ≥8 MB flash / 2 MB PSRAM) | Brain + display driver + dual radio | S3 chosen for PSRAM + LX7 headroom for HUB75 DMA | 8–12 |
| **HUB75 RGB matrix, P3, 64×64** | Player-facing prompt + score/time | *Owner already has it* | — |
| HUB75 ribbon + power pigtail | Panel wiring | Usually ships with panel | 1–2 |
| **LiPo 3.7 V 10000 mAh** | Display power | *Owner already has it* | — |
| **XL6009 boost** 3.7→5 V | Panel + S3 5 V rail | *Owner has it*; verify ≥3 A headroom | — |
| **TP4056** (or 2 A IP5306) charge controller | Case-charge the big cell | *Owner has TP4056*; 2 A charger = faster fill | 1–3 |
| Logic-level considerations | HUB75 is 5 V; S3 GPIO is 3.3 V | May need a 74AHCT245 level shifter for clean color | 1 |
| Fuse + power switch + bulk cap (1000 µF) | Panel inrush / safety | Panel inrush is real at 5 V/several A | 2 |

**Radio-coexistence caution (see architecture.md):** BLE (to phone) + ESP-NOW
(to targets) share the S3's single 2.4 GHz radio. Workable, but timed — the
prototype must prove it before committing.

## B. Target node — ×1 for prototype, then ×8

Each target: read the trigger, timestamp it, send a tiny ESP-NOW packet.

| Part | Purpose | Notes | ~€ |
|------|---------|-------|----|
| **ESP32-C3 super-mini** | Node MCU (BLE5 + ESP-NOW, ~5 µA deep sleep) | Cheap, small, low power | 2–3 |
| **VL53L1X ToF module** (I²C) | v1 contactless trigger | ~50 Hz, short/narrow cone aimed knee-high | 3–5 |
| **Piezo disc (35 mm)** | Fallback tap trigger (same board) | ⚠️ prototype-only, not in the ×8 build; needs a 1 MΩ bleed + clamp diodes on the ADC pin | 1 |
| **LiPo 3.7 V ~400–500 mAh** | Node power | Small; deep sleep between sessions | 3–4 |
| **TP4056** charge controller | Case-charging | One per node | 0.5 |
| pogo pins / magnetic contacts (2) | Case charge contacts | Earbud-style dock | 1 |
| Optional status LED (1 addressable) | Node health / pairing feedback | NOT the prompt (prompt is on the display) | 0.2 |
| 3D-printed stand + enclosure | Knee-height, stable, racket-safe | Printed by owner | — |

**Prototype target = ESP32-C3 + VL53L1X + piezo on one board** so we can A/B the
two triggers on court without a rebuild.

## C. Charging case

| Option | What it is | When |
|--------|-----------|------|
| **Mains-powered dock (recommended v1)** | Case = slots wired to a 5 V PSU; plug into the hall outlet | Simplest/cheapest; no case battery |
| Battery-powered case | Case has its own big cell to charge units off-grid | Only if no outlet near the court |

Slots: 8 small (targets) + 1 large (display block). Each slot delivers 5 V to the
unit's TP4056 via contacts.

## Prototype shopping list (minimum to start)

To validate the two riskiest unknowns (ToF-vs-piezo trigger, and BLE+ESP-NOW
coexistence) before buying ×8:

1. 1× ESP32-S3 dev board
2. 1× ESP32-C3 super-mini
3. 1× VL53L1X module
4. 1× piezo disc (35 mm) + 1 MΩ resistor + clamp diodes (ADC protection)
5. 2× small LiPo + 2× TP4056 (one node, one bench)
6. Owner's panel + big LiPo + XL6009 + TP4056

Everything else (7 more target nodes, the case, stands) is ordered **after** the
court test confirms the trigger and radio choices.

**No standalone 5 V mains PSU needed.** Display power has only two configs: bench
= laptop USB (S3 + panel at low brightness — enough for UI/logic dev), final =
LiPo → XL6009 boost → 5 V. A separate 5 V adapter would only fill the narrow gap
"bench at full brightness before the battery path is wired" — which is covered by
breadboarding the LiPo+boost path directly. Skippable; a £5 later-order if
low-brightness bench proves insufficient.

_Last updated: 2026-08-03. Draft — refine part numbers before ordering._
