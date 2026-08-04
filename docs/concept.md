# Court Reaction Trainer — Concept

A footwork / movement-and-reaction trainer for badminton (extensible to other
court sports). Targets are placed around one player's half of the court; a
controller lights them in a chosen sequence, the player runs to "hit" the lit
target, it clears, the next lights, and the system records the timing and the
overall result.

## Existing prototype (v0)

- **8 targets** around the perimeter of one player's half of the court:
  4 in the corners + 1 at the midpoint of each side.
- Targets are **physical buttons**, each wired to a **Raspberry Pi with a
  touchscreen**.
- The Pi runs the program: it defines the press order, times the presses, and
  shows the results.
- A separate **LED display** faces the player and shows which target to hit
  next — the lit diode maps to a specific button.
- Loop: the operator sets a drill on the Pi → the player watches the display →
  runs and presses the matching button → that light clears, the next one lights
  → repeat. Interval and total time are measured.

## Goal for the rebuild

Move from a wired Raspberry-Pi prototype to a **wireless system that is
configured and driven from a React Native (Expo, dev-client) app**. We have full
freedom to redesign the hardware and choose the transports; custom native
modules on the app side are on the table if a transport needs them.

## Constraints

- **Range:** ~7–10 m (half a badminton court plus margin; a bit more is fine).
- **Timing:** must record accurate per-press times and the overall result.
- **Environment:** indoor, open line-of-sight (a court) — good conditions for
  2.4 GHz radio.

## Open design decisions (to work out together)

1. **Transport(s)** between targets ⇄ controller ⇄ display ⇄ app.
2. **Where the realtime loop lives** — on an embedded gateway, or on the phone.
3. **Target technology** — physical buttons vs pressure pads vs contactless
   proximity / time-of-flight sensors.
4. **Display model** — keep the separate central display, or make each target
   self-illuminate (which would remove the central display entirely).

## Design notes (draft — not decided yet)

### Timing accuracy: buffering is fine (confirmed)

Interval accuracy depends on **where** the timestamp is taken, not on transport
latency. If each target timestamps its own events against a clock that is synced
to the controller at the start of a session, then the intervals we care about
(movement time between presses, reaction time from prompt to press) are accurate
to ~1 ms **regardless of transport jitter** — so events can be buffered on the
node and uploaded later, exactly as hoped.

Transport latency then only affects how "instant" the next light *feels* after a
press. A reactive loop under ~100 ms is imperceptible, and that loop is best kept
**local (on a gateway)** rather than routed through the phone — so the drill
keeps running smoothly even if the phone backgrounds or briefly disconnects.

The one thing that must be handled carefully: the prompt (LED lights) and the
press are potentially on **different devices / clock domains**. To measure
reaction time accurately, either the sequencing device owns the clock and both
events funnel to it, or all nodes share a synced clock. Movement-time-only drills
are simpler (one target owns both "lit" and "pressed").

### Connectivity options (leading candidates)

- **Gateway + ESP-NOW star (recommended default).** Each target is an ESP32 node
  talking to a single ESP32 **gateway** over ESP-NOW (connectionless, ~1–3 ms,
  scales past 8 nodes, battery-friendly with deep sleep). The gateway runs the
  drill engine (sequencing, timing, result buffering). The phone connects to the
  **gateway only** (one BLE or Wi-Fi link) to upload drills and download results.
  Keeps the realtime loop off the phone and avoids juggling 8 BLE connections.
- **Phone as BLE central to 8 target peripherals.** No custom gateway, but the
  phone must hold ~8 BLE connections and sit inside the realtime loop — fragile
  on iOS (background/kill), and 8 connections is near platform limits.
- **Wi-Fi (SoftAP + TCP/UDP).** More bandwidth than we need for a button press,
  higher power and latency. Overkill unless we later stream richer sensor data.

### Target technology options

- **Physical buttons (v0).** Robust, cheap, unambiguous, tactile. Player must
  make contact. Good for a reliable v1 baseline.
- **Floor pressure pads / mats.** Natural for footwork (step to trigger), but
  durability and placement are harder.
- **Contactless proximity / ToF (e.g. VL53L1X) or IR break-beam.** Player
  "reaches" the zone with a racket or hand — no contact, faster, closer to real
  play (shadow badminton). Needs zone calibration and false-trigger handling.
- **Self-illuminating smart target.** _Rejected:_ the targets sit behind /
  around the player, outside direct sight — the player looks forward, so the
  prompt must be on a display in front, not on the target itself.

## Decisions so far (2026-08-03 session 2)

### Prompt / display: central display stays

Self-illuminating targets are out (targets are out of the player's line of
sight). The prompt lives on a **central display facing the player**, showing the
court layout + the lit target, plus score / time / stats. Hardware: a **HUB75
RGB LED matrix (P3, 64×64)** the owner already has, driven by an **ESP32-S3**
(`ESP32-HUB75-MatrixPanel-DMA`).

### Target trigger: contactless (ToF) preferred — the racket-strings insight

The player reaches targets with the **head of the racket (the open strings /
frame)**, not the hand. This *reverses* the case for plain buttons: striking
racket strings against a hard 3D-printed button would **damage the strings**
(the delicate, expensive part). So the racket-reach scenario rules out hard
buttons and points to either **contactless** or a **soft** trigger.

- **Contactless = ToF proximity (preferred).** ToF measures distance to the
  nearest surface in its cone. Even though the strings are an open mesh, the
  **racket frame is solid and reflects well** — the ~26 cm head arc entering the
  cone triggers it. So "detect the racket head" works via the frame; the open
  strings don't matter. Preferred over IR break-beam (needs an emitter+receiver
  pair and per-target alignment).
  - *Real risks (must be validated on court):* **false triggers** from the
    body/leg/arm passing near a target that isn't the current one → mitigate in
    **software** first: VL53L1X `SHORT` mode + a hard distance threshold + an
    "object entered the near zone then cleared" gate, aiming a narrow cone at the
    reach height/depth. (A multizone ToF, VL53L5CX 8×8, was considered as a
    hardware fallback but **dropped** — pricier/heavier; software + the piezo tap
    cover the same risk.) **Fast thin head** under-sampling → 30–50 Hz poll
    (VL53L1X-class) catches the dwell during reach + retract.
- **Fallback = soft "pad on a spring" with piezo / accelerometer (LIS3DH
  tap-detect).** Gentle on strings, unambiguous (physical hit), low power,
  instant — actually *simpler* to make reliable than ToF.
- **De-risk plan (agreed direction):** build **one prototype node carrying BOTH
  sensors** (ToF + piezo tap) on the same ESP32 board, test on court with a real
  racket (head detection, false-trigger rate, mount geometry) BEFORE committing
  to 8 units. Winner gets tiled ×8; the loser is a drop-in fallback with no
  enclosure redesign.

### Power: charging case for everything (targets AND display)

- **8 targets = per-node LiPo, charged in a case** (earbud-style: drop in →
  charge, take out → run). Minimal user interaction. Session = minutes of active
  use; deep sleep (µA) between sessions → a small 300–500 mAh cell gives hours
  active / weeks standby.
- **Display is also battery-powered (corrects an earlier over-cautious note).**
  A HUB75 panel only pulls several amps at *full-white max brightness*, which our
  sparse content (court layout + a few lit cells + score/time) never shows —
  realistically ~0.5–1 A @ 5 V. Owner's **3.7 V 10000 mAh LiPo (37 Wh)** gives
  **~6–12 h** active, i.e. a full training day with margin (arguably oversized —
  fine). Needs a **3.7 V → 5 V boost** (feeds the panel + ESP32-S3). It charges
  in the case too, with two caveats from the big cell: use a **2 A+ charger**
  (a 1 A TP4056 = ~10 h to fill), and the display block is **physically large**,
  so "one case for all" means a **big case / dock slot** for it.
- **Case can be a mains-powered dock** (plug into the hall's outlet) — simplest
  and cheapest; it only needs its own battery if you want to charge units away
  from an outlet.
- **Charging contact = spring-loaded pogo-pins, not wireless (decided).** Two
  contacts per node (VBAT+ / GND); the case dock has pogo-pins that press onto
  them; the case feeds 5 V to every slot and each node's own **TP4056** manages
  its cell. Chosen over Qi wireless: higher efficiency / less heat in a closed
  8-slot case, tolerant of small misalignment (Qi needs near-perfect coil
  overlap), cheaper and smaller (no receiver coil + IC per node). Optional
  **magnets** per slot (earbud-style) so a node self-aligns to one orientation
  and the contacts always meet. Wireless only reconsidered if a fully sealed
  (sweat/waterproof, no exposed contacts) node ever becomes a priority.
- **Bench note:** on the prototype the display is powered from a **5 V
  adapter** (or the laptop USB at reduced brightness — `setBrightness ~20–40%`);
  the LiPo + XL6009 boost is left for the packaged-display stage, so power and
  logic aren't debugged at once.
- **Reasoning correction (kept):** a rechargeable battery does **not** imply
  Wi-Fi. Full Wi-Fi (station + AP association) is the most power-hungry option and
  overkill for tiny button events. The right transport is **ESP-NOW** — same
  ESP32 Wi-Fi radio, but connectionless (~1–3 ms, far lower power, simpler).

### Architecture direction

- **Transport:** targets ⇄ **gateway** over **ESP-NOW** (star); phone ⇄ gateway
  over a single BLE or Wi-Fi link.
- **Drill engine on the gateway ESP32**, not the phone — realtime loop stays
  local (survives phone background/disconnect). Phone = operator + analytics.
- **Raspberry Pi likely dropped** — the phone app replaces the Pi's touchscreen
  operator role; the gateway ESP32 holds the engine. (Open: confirm no need for
  a courtside Pi/large screen.)
- **Possible consolidation:** gateway + display could be one ESP32-S3 unit
  (engine + ESP-NOW to targets + BLE/Wi-Fi to phone + drives its own HUB75
  panel). Elegant but has a radio-coexistence nuance (BLE + Wi-Fi/ESP-NOW on one
  chip) — to be resolved in `docs/architecture.md`.

## Decisions so far (2026-08-03 session 3)

### Three nodes, brain in the display, no Raspberry Pi

Confirmed: **phone (operator/app) ⇄ central unit (display + brain, ESP32-S3) ⇄
8 targets**. The Pi is gone. The central unit runs the drill engine, drives its
own HUB75 panel, talks ESP-NOW to targets and BLE to the phone.

### Phone link = BLE (realtime loop stays off the phone)

The drill runs on the central unit; the phone only (a) uploads the drill config
and (b) downloads buffered results — short bursts between sessions, never during
the run. So iOS/Android BLE-background limits are low-stakes here. GATT stays
minimal: one control characteristic (write config) + one results characteristic
(notify/read). No 8-connection juggling. iOS-vs-Android specifics + the on-wire
data model go in `docs/architecture.md`.

### Target MCU: ESP32-C3 (a full ESP32 per target is overkill)

A dual-core ESP32 on each target is more than "read a sensor, timestamp, send a
tiny packet" needs, and burns more power. Chosen: **ESP32-C3 super-mini (~€2)** —
single-core RISC-V, BLE5 + **ESP-NOW**, ~5 µA deep sleep, I²C for the ToF + an
input for the piezo. Keeps the ESP-NOW star (no BLE juggling). Full ESP32 is
reserved for the **central unit** (HUB75 DMA + engine + dual radio).

### Reach geometry: close, low (~knee) — good for ToF (confirmed)

Targets stand near the **side lines, slightly off the corner**; the player
reaches **close** to the unit, like a button — but allowing for fast, imprecise
movement, so the racket head arrives around **knee height (~0.4–0.5 m)**. So the
ToF zone is a **short, narrow cone** aimed low — which *reduces* false triggers
(a body/leg passing by is usually deeper and rejected by the distance
threshold). Stand height ≈ knee, sensor tilted slightly up toward the incoming
racket head; final tilt/range dialed in on the court prototype.

### Owner's existing parts — verdict

- **nRF52811 (E73-2G4M04S1F) modules — held in reserve (confirmed).** Nordic
  BLE 5.1 SoC (+ 802.15.4 / proprietary ESB); genuinely lower power than any
  ESP32, but **cannot do ESP-NOW**. Using them for targets would change the radio
  story: either 8 BLE connections on the brain, or Nordic ESB with an added nRF
  co-radio on the central unit. Owner agreed the all-Espressif (ESP-NOW) route is
  better — nRF pack kept for a **future wearable** (on-player sensor, BLE-native).
- **TP4056 (1 A Li-ion charger) — used now.** One per node for case-charging the
  LiPos. Perfect for the small target cells; the big display cell fills in ~10 h
  at 1 A (overnight-fine; a 2 A charger if we want faster).
- **XL6009 (boost DC-DC) — used now.** The display's **3.7 V → 5 V** step-up for
  the HUB75 panel + ESP32-S3. Fine for our sparse ~0.5–1 A draw; a beefier
  buck-boost later if we push brightness.

### Locked for the build spec

All major architecture decisions are now settled:

- **3 sides:** phone (operator app) ⇄ central unit (display + brain, ESP32-S3)
  ⇄ 8 targets (ESP32-C3), over ESP-NOW; phone ⇄ central over BLE.
- **Targets:** ESP32-C3 nodes, ToF trigger (v1) + piezo tap fallback on the same
  board, LiPo case-charged, knee-height stands.
- **Display:** owner's HUB75 P3 64×64, driven by the central ESP32-S3, powered by
  the 10000 mAh LiPo via XL6009 boost, case-charged via TP4056-class chargers.
- **Prototype-first:** build ONE target node with both sensors, validate on court,
  then replicate ×8.

Next: a concrete **BOM** (exact parts per node) and `docs/architecture.md` (drill
engine, clock sync, on-wire packet format, radio coexistence, BLE GATT + the
phone data model, iOS/Android notes).

_Last updated: 2026-08-03._
