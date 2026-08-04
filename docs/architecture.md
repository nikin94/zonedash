# Architecture (draft v1)

How the three sides fit together: **phone (operator app)** ⇄ **central unit
(display + brain)** ⇄ **8 targets**. This doc covers the drill engine, clock
sync, the on-wire packet format, radio coexistence, and the phone/BLE data model.
A design draft — the repo is scaffolded but firmware/app are skeletons.

```
        BLE (bursts, between runs)          ESP-NOW (realtime, ~1–3 ms)
 ┌───────────┐  config ───────►  ┌──────────────────┐  "light up" ──►  ┌──────────┐
 │  Phone    │                   │  Central unit    │                  │ Target 1 │
 │  (Expo    │  ◄─── results     │  ESP32-S3        │  ◄── "pressed"   │  …       │
 │  app)     │                   │  brain+display   │                  │ Target 8 │
 └───────────┘                   └──────────────────┘                  └──────────┘
                                   drives HUB75 panel
```

## Repo layout

Single monorepo — the two shared contracts (ESP-NOW packets, BLE GATT) can't
drift when they live in one place and change in one commit.

```
zonedash/
├── docs/
├── firmware/                  PlatformIO — three envs, shared libs
│   ├── platformio.ini           env:brain (S3) + env:target (C3) + env:native (tests)
│   ├── lib/protocol/protocol.h  ESP-NOW packet format (brain ⇄ target)
│   ├── lib/engine/              drill engine (host-tested, hardware-free)
│   ├── lib/clocksync/           local→central clock mapping (offset + skew)
│   ├── test/                    native tests (custom harness: test/zd_test.h)
│   ├── lib/engine/              drill engine — pure C++, no hardware, host-tested
│   ├── src/
│   │   ├── brain/               ESP32-S3: engine, HUB75, ESP-NOW, BLE, Ed25519
│   │   └── target/              ESP32-C3: ToF/piezo, timestamp, ESP-NOW
│   └── test/test_engine/        drill engine tests (custom harness, host)
└── app/                       Expo app (deferred)
    └── src/ble/contract.ts      BLE GATT mirror (the one C++ ⇄ TS seam)
```

`build_src_filter` in `platformio.ini` selects `src/brain/` vs `src/target/`
per env; `lib/protocol/` + `lib/engine/` auto-link into both. The **drill engine
is hardware-free** (time in µs from the caller, RNG injected), so it's fully
unit-tested on the host — `pio test -e native`, or directly with clang++/g++.

## Roles

- **Central unit (ESP32-S3):** owns the **drill engine** (sequence, timing,
  result buffer), drives the **HUB75 panel** (court layout + lit target + score/
  time), speaks **ESP-NOW** to the targets and **BLE** to the phone. Because the
  realtime loop lives here, the drill keeps running even if the phone backgrounds,
  disconnects, or is put away.
- **Targets (ESP32-C3 ×8):** dumb-ish edge nodes. Wait for a "you are the target"
  command, sense the trigger (ToF or piezo), **timestamp the hit against a synced
  clock**, send a "pressed" packet, sleep. No sequencing logic on the node.
- **Phone (Expo app):** operator + analytics. Uploads a drill config, starts/stops
  a session, downloads buffered results. Never in the realtime loop.

## Timing & clock sync (the accuracy backbone)

Interval accuracy depends on **where** the timestamp is stamped, not on transport
latency. Plan:

1. **Session clock sync.** At session start the central unit broadcasts a sync
   beacon; each target records the (central, local) pair. All later target
   timestamps are reported in the central clock domain. A single sample gives a
   fixed offset; a second (from a periodic re-sync) adds **skew** — a two-point
   linear fit that corrects crystal drift (tens of ppm ≈ ms over a session).
   Implemented hardware-free in `lib/clocksync/` (`ClockSync`), host-tested.
2. **Two measured intervals:**
   - **Movement time** = `pressed[n] − pressed[n−1]` — both events on targets,
     both in the synced domain. Robust.
   - **Reaction time** = `pressed[n] − lit[n]`. `lit[n]` is stamped on the central
     unit (it drives the display); `pressed[n]` on the target. Because both are in
     the central domain (after sync), the subtraction is valid to ~1 ms.
3. **Buffering is fine.** Targets may batch events and forward when convenient;
   the timestamps carry the truth, so radio jitter never corrupts the numbers.

Open detail: display **photon latency** (command → LED actually visibly on) is a
few ms of panel refresh; if we want reaction time to the *visible* photon, stamp
`lit[n]` at the panel flush, not at the command issue. Decide during calibration.

## Sequencer: single-target arming (chosen) — spatial false-triggers come free

The drill always awaits a press from **exactly one** target — the currently lit
one. **Chosen model: arm only the current target; ignore all others.** This falls
out of the sequencer for free and closes the whole "false trigger on the *wrong*
target" class **without a multizone sensor or clever filtering**: a body / leg /
racket crossing target 3's cone on the way to target 5 is discarded, because only
target 5 is armed. (This is why VL53L5CX was dropped.) Bonus: un-armed targets
idle in low power (no 50 Hz ToF poll) and only ramp up when armed — battery win.

**Residual risk (single-target geometry only).** Everything is filtered *except*
a false trigger on the *current* target — e.g. a leg/torso crossing its cone
slightly before the racket head arrives, firing early. The sequencer can't reject
this (it *is* the awaited target); the effect is a smeared timestamp (reaction/
movement a few tens of ms short), not a mis-scored hit. Mitigation is therefore a
**single-target problem**, much simpler: aim a narrow, short cone at the racket-
head arrival height so a leg passes at a different depth/height and doesn't trip
it early. Tuned on court; piezo remains the fallback for exactly this case.

Rejected alternative: "listen to all, count only the current." Costs battery,
but yields a *wrong-target* metric (ran to the wrong place). Deferred — could add
as an optional accuracy stat later; default stays single-target arming.

## On-wire packet format (ESP-NOW, central ⇄ targets)

Tiny fixed structs, versioned. Sketch (not final):

```
Central → target:
  SYNC     { type, session_id, t_central }          // clock sync beacon
  ARM      { type, session_id, target_id, seq }     // "you are the next target"
  DISARM   { type, session_id }                      // clear / end
  PING     { type }                                  // liveness / RSSI

Target → central:
  HELLO    { type, target_id, fw, batt_mv }          // pairing / health
  PRESSED  { type, session_id, target_id, seq, t_hit, sensor }  // the hit
  ACK/NACK { type, session_id, seq }
```

- ESP-NOW payloads cap at 250 bytes — these are well under.
- `sensor` field marks ToF vs piezo, so the court A/B test is logged per hit.
- Every message carries `session_id` + `seq` so stale/duplicate packets from a
  buffered node can't double-count.

## Target identity & addressing (two layers)

Identity and court position are **separate concerns** — conflating them is a bug.

- **Layer 1 — hardware identity (fixed).** Every ESP32-C3 has a unique **MAC**
  burned into the chip; it's the node's permanent serial. The central unit
  addresses ESP-NOW packets and attributes hits by MAC. 8 targets = 8 MACs,
  nothing assigned by hand.
- **Layer 2 — court position (assignable).** Targets are physically
  interchangeable — the unit that stood in the left corner yesterday can stand in
  the right today. So "where does this target stand" is a separate `MAC → position`
  map, built fresh each session and held on the central unit.

**Layout is not fixed — the active set is chosen per session.** The v0 prototype
used 6 points; the full kit is 8, but a session may use **4, 5, 6, or 8** targets,
and the layout isn't tied to a badminton court (other venues / free placement).
So the position map is a **dynamic list of the N active targets for this session**,
not a hardcoded 8-slot court grid. `N` is picked when the drill/session is set up;
positions are just labels/order in that set, with the geometric meaning ("far-left
corner") supplied by the pairing prompts, not baked into firmware.

**How the map is built — pairing round (chosen).** The operator picks how many
targets are in play (N) — passed explicitly, never inferred: serial `pair N`, and
the BLE `StartPairing` op carries a 1-byte N payload. The central unit then walks
the slots one by one: it prompts on the display — e.g. **"Press here"** with the
target's slot highlighted on the court/layout diagram — the person taps that
physical target, and after a confirming second tap the unit binds that MAC to the
slot → "next." N binds build the whole map. Self-calibrating: it doesn't matter
which physical unit went where, or the order in the case, or how many are used.
(Rejected: fixed numbered stickers — simpler code but demands placement discipline
and breaks on a swapped corner; RSSI/range auto-localization — unreliable indoors.)

**Two-tap confirm (robustness).** A bind takes **two consecutive taps from the
same MAC**: the first makes it the slot's candidate ("press again to confirm"),
the second binds. This rejects a stray single trigger — a ball bounce, a ToF
ghost, piezo cross-talk from an unbound node — that would otherwise silently
mis-bind the wrong target and corrupt the whole session's map. A different unbound
MAC just replaces the candidate; an already-bound MAC is ignored. `undo_last()`
re-prompts the most recent slot for operator correction.

The round's logic is the hardware-free `lib/pairing/` core (`PairingRound` +
`TargetMap`): it prompts slots in order, confirm-binds the tapping MAC, ignores
stray re-taps of already-bound nodes, and yields the `MAC → position` map (with a
bounds-checked `mac_at`). Board firmware just feeds it `Pressed` MACs and renders
the current prompt; progress is surfaced to the app as `PairingProgress`
(`currentPrompt`, `total`) on the Status characteristic.

**Drills operate on positions, not MACs.** The operator authors "corner → mid →
corner…" in position terms; the central unit translates to MACs via the map. So a
drill config is decoupled from hardware — swap a broken target for a fresh one,
re-run pairing, and every drill still works unchanged.

## Radio coexistence (the one real risk on the central unit)

The S3 has a **single 2.4 GHz radio** shared by BLE and Wi-Fi/ESP-NOW. They can
coexist but are **time-sliced**, so heavy simultaneous use adds latency/jitter.
Our mitigation is structural: **the phone (BLE) and the targets (ESP-NOW) are
almost never busy at the same time** — BLE bursts happen *between* runs (config
up, results down), ESP-NOW happens *during* the run. Options, cheapest first:

1. **Time-separate by design (default).** Keep BLE idle during an active drill;
   sync results after. Likely sufficient.
2. **Same Wi-Fi channel discipline.** Pin ESP-NOW to one channel; avoid channel
   hops that stall the BLE stack.
3. **Split radios if needed.** If coexistence proves jittery, move BLE to a
   **separate co-MCU** (e.g. one of the reserve nRF modules as a BLE front-end
   over UART) — falls back to hardware we already own. Only if #1/#2 fail.

**This must be validated on the prototype** before committing to ×8.

## Phone ⇄ central: BLE GATT + data model

Minimal custom GATT service:

| Characteristic | Dir | Payload |
|----------------|-----|---------|
| **Control** | write | start/stop, select drill, drill config (sequence, timing, mode) |
| **Status** | notify | session state, connected-target count, live progress, pairing progress (`currentPrompt`, `total`) |
| **Results** | notify / read | buffered per-hit records (chunked if large) |

Data model (app side):
- **Drill** = active-target count `N` + a **mode** + params. N (4–8) is part of
  the setup, so a drill is portable across layouts. Four modes (three from v0 —
  see `history-v0.md` — plus time-limited):
  - **random** — random order over the N positions, `count` reps.
  - **path** — a fixed, pre-authored sequence the player runs.
  - **live** — the operator picks the next target on demand (coach-in-the-loop);
    the engine has no pre-built sequence, it just lights whatever it's told. This
    means the engine must accept an **externally-driven next-target** command, not
    only self-sequence — a real constraint on the engine API.
  - **time-limited** — random order, run for a fixed `duration_ms`; the score is
    "how many targets in the window." Not count-bounded.
- **Two settings that shape sequencing** (not separate modes):
  - `delay_ms` — gap after a hit before the next target lights (0 = instant).
  - `allow_immediate_repeat` (bool) — may the same target light again right after
    it was just hit. Because a `delay_ms` gap exists before the next target, a
    re-light of the *same* position is meaningful (the player leaves and returns),
    so this is a toggle, not a hardcoded "no-repeat." Default off.
  These replace v0's implicit "no same target twice in a row": it's now a flag on
  the random / time-limited modes, not a fourth mode.
- **Session** = a run of a drill → list of hits `{ seq, target_id, t_lit, t_hit,
  reaction_ms, movement_ms, sensor, miss }` + summary (total time, avg/best
  reaction, hits, misses). `sensor` is NOT part of the engine's `HitRecord`
  (drill_engine.h) — it comes from the ESP-NOW `Pressed` packet and the brain
  splices it in when serializing results. `movement_ms` on a hit that follows a
  miss spans the skipped target (the miss doesn't reset the movement baseline).
- Results pulled at session end and stored locally (later: sync/export).

### iOS vs Android notes

- **Not in the realtime loop** → background-BLE limits (iOS especially) are
  low-stakes; we only need a foreground burst.
- **iOS:** custom 128-bit service UUID; no MAC exposed (peripheral identified by
  CBPeripheral identifier) — pairing UX handled in-app. BLE 5 data-length /
  MTU negotiation helps chunk the results faster.
- **Android:** explicit runtime permissions — `BLUETOOTH_SCAN` /
  `BLUETOOTH_CONNECT` (API 31+), and location permission for scanning on older
  APIs. Handle GATT 133 retries.
- **Expo:** `react-native-ble-plx` via **dev-client + config plugin** (prebuild).
  No custom native module needed unless we later move BLE to a co-MCU with a
  nonstandard framing.

## Testing without the app (serial-first)

The phone is the only *production* I/O, but the prototype needs **none** — the
central unit has direct dev I/O that bypasses the phone entirely:

- **Output — already there:** the HUB75 panel (lit target, score, time) shows the
  drill running.
- **Input / logs — USB-serial from the S3.** Tether the board to a laptop and use
  the **serial console** as a temporary operator pad.

The full loop is exercised over serial: `serial "start" → display lights → player
hits target → ESP-NOW packet → central logs t_hit to serial → next target`. No app.

### Serial operator protocol (dev stand-in for BLE)

Line-based ASCII over USB-serial @ 115200. Each command maps 1:1 to a future BLE
`Control` write, so the drill engine is driven identically either way — BLE just
swaps the transport later.

| Command | Does | BLE equivalent |
|---------|------|----------------|
| `pair N` | Enter pairing round for N slots: prompt each slot, confirm-bind the MAC that presses twice → `MAC→position` map | Control: StartPairing (N byte) |
| `nodes` | List paired targets: `position, MAC, fw, batt_mv, last_rssi` | Status read |
| `drill N seq…` | Load a drill: N active targets + sequence (e.g. `drill 4 rand` or `drill 6 0,3,5,1,…`) + params | Control: config |
| `start` | Run the loaded drill (SYNC broadcast → ARM first target → loop) | Control: start |
| `stop` | Abort the run, DISARM all | Control: stop |
| `dump` | Print the session's hit records as CSV: `seq,pos,t_lit,t_hit,reaction_ms,move_ms,sensor,miss` | Results read |
| `sensor tof\|piezo` | Select which trigger the target reports (court A/B test) | (dev-only) |
| `sync` | Force a clock re-sync beacon; print per-node offsets | (internal) |

The line parser is a pure, host-tested module (`lib/serialcmd/`): it turns a
line into a structured command (filling a `DrillConfig` for `drill`, reusing the
engine's own type so the two can't drift). The command it emits is transport-
agnostic — the future BLE `Control` handler produces the same structs.

Free-running telemetry (not commands) is printed as it happens: `HIT pos=… t=… rssi=…`,
`FALSE pos=… d=…mm` (ToF trigger while not armed — the calibration signal),
`DROP seq=…` (missed/timed-out target). This log is the **source of truth for ToF
calibration** — real trigger distances from a live racket, in numbers.

**Why this is the right order, not a workaround:** the BLE layer is just a
*transport for the same commands* we drive over serial. Nail the logic (drill,
clock sync, sensors, display) on serial — where everything is visible and
debuggable — then wrap the finished commands in BLE and attach the phone. Starting
from the app means debugging radio and drill logic blind, at once; serial-first
splits those risks. Bonus: the serial log is the **source of truth for ToF
calibration** (real trigger distances from a live racket, in numbers).

`nRF52840-DK` (the owner's dev-kit, distinct from the reserve E73 modules) is a
useful **bench tool** here — for debugging the BLE-co-MCU fallback (built-in
J-Link/logs), and later as a **reference BLE peripheral** that impersonates the
central unit's GATT so the Expo app can be tested while the real S3 is busy.

## App (Expo) — deferred until hardware link is proven

The app is downstream of the transport decision (now BLE) and low-risk. Build
order: **firmware + court prototype first**, then the operator app against a
working central unit. Sketch of app scope:

- Connect / pair with the central unit.
- Drill library (author, edit, pick).
- Start/stop + live session view (progress, current target).
- Post-session results + history + export.

## Build order (risk-first)

1. **Prototype target node** (C3 + VL53L1X + piezo) + **central S3** on the bench.
2. **Court test:** ToF-vs-piezo trigger reliability, false triggers, geometry.
3. **Radio coexistence test:** BLE burst + ESP-NOW run on the S3.
   (Steps 1–2 driven entirely over **USB-serial** — no app needed; see
   "Testing without the app".)
4. Lock trigger + radio choices → **replicate targets ×8**, build the case.
5. **Firmware:** drill engine, sync, HUB75 UI.
6. **Expo app** against the finished central unit.

_Last updated: 2026-08-04 (session 4: monorepo scaffolded, serial operator
protocol drafted). Earlier — session 3: pairing round + "Press here" prompt,
configurable N=4–8 active targets, nRF52840-DK noted as dev/bench tool). Draft —
revise as the prototype teaches us._
