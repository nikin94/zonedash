# ZoneDash — agent handover guide

The onboarding document for an AI (or human) engineer taking over this project:
what ZoneDash is, where everything lives, the exact working flow from task to
merge, the hard-won technical facts that are NOT obvious from the code, and the
current state of hardware and backlog. Read this first; the deep design docs it
links to are the source of truth for their own areas.

The owner (H, GitHub `nikin94`) communicates in **Russian** in chat. All
artifacts — code, comments, commit messages, PR descriptions, docs — are
**strictly in English**.

---

## 1. What the project is

A wireless court reaction / footwork trainer for badminton. Up to 8 battery
targets stand on one half of the court; a central unit ("brain") lights them in
a drill sequence, the player reaches the lit target, the hit is timestamped, the
next target lights. The system records per-hit reaction times.

```
Phone (Expo operator app)
   │  BLE (bursts: configure drill, pull results — never in the realtime loop)
   ▼
Brain = Adafruit MatrixPortal S3 (ESP32-S3) + HUB75 LED panel, at the net
   │  ESP-NOW (realtime, ~1–3 ms)
   ▼
Targets = ESP32-C3 super-mini nodes + trigger sensor (VL53L1X ToF / piezo)
```

Deep dives: `docs/concept.md` (product), `docs/architecture.md` (system design,
protocols, pairing, serial-first testing — the most important doc),
`docs/display-ui.md` (screen-by-screen panel spec), `docs/bom.md` (hardware),
`docs/enclosure.md`, `docs/solana.md` (parked blockchain layer),
`docs/history-v0.md` (app session log v0), `docs/ble-vectors.json` (BLE wire
contract — the BLE analogue of `protocol.h`).

## 2. Repo layout

```
zonedash/
├── docs/          Design docs (see above) — written BEFORE code; keep them true
├── firmware/      PlatformIO, one project → two device builds + host tests
│   ├── platformio.ini   envs: brain (S3), target (C3), native (host tests)
│   ├── lib/             HOST-TESTABLE pure modules — protocol, engine, pairing,
│   │                    clocksync, serialcmd, blecodec, display(layout)
│   ├── src/brain/       ESP32-S3 main.cpp (Arduino + esp_now — NOT host-compilable)
│   ├── src/target/      ESP32-C3 main.cpp + pins.h (same constraint)
│   └── test/            zd_test.h harness + per-lib suites; run_native.sh
├── firmware-dk/   nRF52840-DK Zephyr app — BENCH TOOL, impersonates the brain's
│                  BLE GATT so the app's real BLE path is testable without the S3.
│                  Outside PlatformIO and mostly outside CI (only its pure C wire
│                  codec is host-tested).
└── app/           Expo / React Native operator app (runs on a mock transport —
                   no hardware needed for app work)
```

Git: single repo `nikin94/zonedash`, default branch `main`, PRs target `main`.

## 3. The working flow (task → merge)

This is the contract with the owner. Follow it exactly.

1. **Task intake.** H states a task in chat (Russian), often loosely. If the
   requirement is ambiguous — ask, or present ranked alternatives with a
   recommendation. Big product pieces (statistics, video section) are
   *discussion-first*: agree scope before writing code.
2. **Branch** off fresh `main`. Naming in the wild: `fw/<topic>` for firmware
   (`fw/espnow-bringup`, `fw/hit-pipeline`, `fw/multi-node`), `fix/…` /
   `docs/…` / feature-style for app work (`fix/app-history-entry-slide`).
3. **Implement small.** Minimal useful increment; reuse existing components and
   libs before writing new ones; no speculative abstractions. Comments explain
   constraints the code can't show, in the codebase's existing voice.
4. **Test before pushing.**
   - Firmware: `cd firmware && sh test/run_native.sh` — host-compiles and runs
     every suite against `lib/` only. Must be 0 failures.
   - App: `cd app && npm run typecheck && npm test` (jest). Every behavior
     change gets a test. **Mutation-check** new tests: re-introduce the bug →
     the new test must fail; break the feature the other way → its positive
     test must fail; restore → green. Report this in the PR.
   - Formatting: prettier for the app; keep firmware style consistent manually.
5. **PR.** Push, open a PR with a **detailed English description** (what, why,
   design decisions, how to verify on hardware if relevant), set
   **assignee `nikin94`** (`gh pr create … && gh pr edit N --add-assignee nikin94`).
6. **Report in chat** (Russian): what was done, PR link, decisions and why,
   exact verification steps for H (commands, expected serial output / UI
   behavior). For firmware, always include the flash commands and the exact log
   lines that mean success vs failure.
7. **Hardware validation loop** (firmware PRs): H flashes and pastes serial
   logs / photos; you iterate on the branch until the increment is proven on
   real boards. A firmware PR is not "done" until confirmed on hardware.
8. **Merge — ONLY on H's explicit word** («мерж»). Never merge on your own
   judgement. Merge procedure:
   ```
   gh pr checks N                       # all green
   gh run view <runId> --json headSha   # run head == PR head (re-run if stale)
   gh pr merge N --merge --delete-branch
   git checkout main && git pull --ff-only && git fetch -p
   ```
   H may also say «отменить» — then close the PR instead.
9. **After merge:** update the Pentagon status report; record durable learnings
   (memory/knowledge). Keep the backlog notes current.

CI (`.github/workflows/ci.yml`), three required checks:
- **firmware native tests** — `firmware/test/run_native.sh` (lib/ only; the
  Arduino `src/` never builds in CI — see §4).
- **DK wire codec tests** — `firmware-dk/test/run_native.sh` (pure C byte
  layout pinned to the shared fixture).
- **app typecheck + tests** — tsc + jest.

## 4. Firmware: the split reality (critical to understand)

**The agent cannot compile or flash device firmware.** PlatformIO is not
installed on the dev machine used by the agent, and `src/brain|target` depend on
Arduino + `esp_now.h`, which cannot be host-compiled. The division of labor:

- Agent writes code, keeps `lib/` host-tested (CI-green), reasons from datasheets
  and docs, and ships flash instructions.
- **H flashes** (`pio run -e target|brain -t upload`) **and pastes serial logs**
  (115200). The serial log is the source of truth; the agent iterates from it.
- Because firmware is outside any OTA path, this loop loses nothing — it is the
  intended workflow (see "Testing without the app" in `architecture.md`).

Design consequence: put every piece of logic that *can* be pure into `lib/`
(host-tested, CI-guarded); keep `src/*/main.cpp` as thin glue. The wire contract
is double-locked: `static_assert`s on struct offsets in `protocol.h` + golden
expected-byte host tests.

### Toolchain gotchas already fixed — do not regress them

- **C++ standard:** arduino-esp32 defaults device builds to `gnu++11`, but host
  tests run `-std=c++17`. Both device envs are pinned to `gnu++17` via
  `build_unflags = -std=gnu++11` in `[env]`. This closed a real
  "green-in-CI, red-on-flash" bug (a C++14 digit separator).
- **C3 serial:** the super-mini has *native* USB Serial/JTAG (HWCDC), not
  TinyUSB. `[env:target]` needs BOTH `-DARDUINO_USB_MODE=1` and
  `-DARDUINO_USB_CDC_ON_BOOT=1`, otherwise `Serial` doesn't even compile.
- **Arduino macro collisions:** `binary.h` defines `B0`, `B1`, … as macros — a
  constant named `B1` breaks the build. Prefix pin constants (`PIN_B1`).
- **Native USB drops early output:** anything printed before the host opens the
  port is lost, and reset tears the port down. Diagnostic firmware uses a
  periodic heartbeat + key echo; expect to re-open the monitor after RESET.
- **Upload port auto-detect is unreliable** with several devices attached — it
  has grabbed the C3 instead of the S3 and even a Bluetooth audio device. Tell H
  to unplug other boards or pass `--upload-port /dev/cu.usbmodemXXXX`.
- **Bootloader entry:** C3 = hold BOOT, tap RST, release; MatrixPortal S3 =
  double-click RESET.

### Radio / protocol facts

- ESP-NOW pinned to `ESPNOW_CHANNEL` (in host-safe `protocol.h`); targets learn
  the brain MAC from **any** brain message (reset-safe), and both sides register
  `esp_now_register_send_cb` so unicast delivery failures are visible
  (`status=OK/FAIL` in logs).
- Brain currently re-Syncs before every Arm (covers node reboots). Once the
  drill engine lands, Sync moves to session start — a known cleanup.
- The S3 shares one 2.4 GHz radio between BLE and ESP-NOW; coexistence is the
  project's #1 hardware risk (BLE is kept out of the realtime loop by design).
  Any change that adds radio or display DMA load must re-verify `[ping]`/`[hit]`
  still flow with everything running.

## 5. Hardware state at handover

**Proven on boards:** ESP-NOW discovery + bidirectional link (#86); full hit
path Sync → Arm → Pressed → reaction, hit stubbed by the C3's BOOT button
(GPIO9 = `PIN_HIT_STUB`, reverts to `TOF_XSHUT` when the sensor lands) (#87);
5-node round-robin arming in PR **#90** — check its state, it may still await
H's 5-button run before merge.

**Display track — PARKED, waiting on purchases.** The eBay "MatrixPortal S3" is
almost certainly a **clone without the 74AHCT245 level shifters** a genuine
board has on every HUB75 line; the SZLIGHTALL P3 64×64 panel has strict 5V
logic (TC7262 row decoders, VIH ≥ 3.0V), so three address lines sag below
threshold and rows collapse. Nobody is "broken" — the combination is. H will buy
an **original Adafruit MatrixPortal S3** ($19.95, official channels only — never
"Unbranded") and the **Adafruit #6484 128×64 2mm panel**. When they land:
`PANEL_W=128 / PANEL_H=64` in `lib/display`, `mxconfig(128, 64, 1)`, re-layout
`display-ui.md` for the wide format, and boot the **solo-scan diagnostic** first
(`DISPLAY_STATIC_DIAG` flag in `src/brain/main.cpp` — currently the flag exists
with the full probe toolkit behind it) to confirm geometry before real UI.
Panel-debugging war stories and per-chip facts live in the agent's Pentagon
memory ("display panel facts") and in `main.cpp` comments.

**In transit:** VL53L1X ToF sensors (BOM confirms L1X for ROI support — **verify
the model-ID register over I2C at bring-up, fakes are common**), piezo discs,
clamp diodes. Trigger/sensing work is blocked until they land.

**Power:** 600 mAh LiPos power the C3 targets (3.3V, straight off cell + TP4056
charge only); the 10000 mAh LiPo powers brain+panel and needs a 5V boost —
future buy is an **IP5306-class bare module, I2C variant** (reads state of
charge → drives planned per-target battery LEDs; thresholds to discuss, working
proposal green >40% / amber 15–40% / red <15% + charging state). No 5V battery
chemistry exists; a regulator is mandatory, integrate rather than eliminate.
All development runs USB-tethered — battery hardware is for the final build.

**ESP module authenticity:** C3/S3 silicon is always genuine Espressif; generic
C3 super-minis have no "original" to clone and H's five are proven by the hit
path. Only sensors (VL53L1X) carry a real counterfeit risk.

## 6. App: conventions and constraints

- Expo / React Native, TypeScript. All app work runs on a **mock transport** —
  no hardware needed. Scripts: `npm run typecheck`, `npm test`.
- **Animations:** today RN core `Animated` (native driver) + `react-native-svg`
  (installed, used) for art. **Reanimated migration is approved and scheduled
  as its own PR before any animation-heavy feature** (install via
  `npx expo install react-native-reanimated react-native-gesture-handler`,
  babel plugin LAST in `babel.config`, official jest mock; old and new APIs
  coexist — migrate incrementally: pulseClock rAF, history tab slide,
  skeletons, CourtMap pulses). Lottie is NOT installed (native dep — decide
  per-feature; rebuilds are acceptable since the app is not in stores, but
  prefer OTA-safe changes when equivalent).
- Jest guard for animation loops: `process.env.JEST_WORKER_ID` skips driven
  loops in tests. Shared pulse phase = `pulseClock.ts`.
- History/settings are **identity-bucketed** (anonymous device bucket vs
  signed-in account, with an `_anonSettings` snapshot restored on sign-out).
  Any state feature must respect this isolation.
- UI conventions: mode tabs derive from the drill `MODES` list (a new mode
  auto-appears everywhere); slide animations fire from *tap handlers*, never
  from effects watching state (programmatic changes must not animate — this was
  a real bug, #89); the phone CourtMap and the LED panel share one canonical
  8-spot geometry (`spot_xy`, net at top).

## 7. Roadmap / backlog (order agreed with H)

App/UX track: **(1) Reanimated migration → (2) onboarding & empty states (SVG
art; reusable EmptyState) → (3) isometric/3D court view** (reference:
animatereactnative.com "Isometric Press Grid"; 2D↔3D settings toggle; synergy
with the court heatmap) → PairingPanel content-outside-court → a11y pass.

Firmware track after multi-node: serial operator console (`lib/serialcmd`
ready) + drill engine tick (move Sync to session start); VL53L1X integration
(drop-in for the BOOT stub); HUB75 bring-up on the new Adafruit hardware; BLE
GATT (`lib/blecodec` ready, pinned to `ble-vectors.json`); BLE+ESP-NOW
coexistence test; Ed25519 signing.

Other backlog (each a compact PR): statistics (**discussion-first:
segmentation** by device / player / account), training-videos section
(**discussion-first:** hosting, player dep, content source, placement), replay a
random run, persist Path tapped sequence, progress charts, court heatmap,
export/share session, Maestro E2E, richer mock transport. Parked: Solana layer
(`docs/solana.md`), AR, AI video analysis.

## 8. Operating principles (learned the hard way)

- **Measure before irreversible steps.** H's instinct to test before soldering
  saved the hardware twice. Provide cheap decisive tests (a sweep line, a
  multimeter reading, a static probe) before recommending solder/cut/return.
- **One flash must answer a question.** Never ship a guess; design each
  firmware iteration so any outcome is informative, and prefer reading a
  datasheet / schematic / silkscreen over another blind flash.
- **Admit reversals explicitly.** When new evidence kills a previous diagnosis,
  say so plainly and update the plan — H corrects factual errors (photo
  misreads, wrong assumptions) and expects them acknowledged.
- **Verification steps are part of the deliverable.** Every hand-off to H ends
  with: exact commands, what success looks like, what each failure mode looks
  like.
- **Keep docs true.** Design docs are written before code; when reality
  diverges (library swap, config change), update the doc in the same PR.
