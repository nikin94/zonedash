# Display UI (HUB75 64×64) — screen spec

Screen-by-screen spec for the central unit's P3 64×64 panel, written **before
firmware** so the display code implements a design instead of improvising one.
Diagrams are ASCII sketches on a half-scale grid (1 char ≈ 2 px).

## Design constraints (read first)

- **Two viewing distances.** The player reads the panel from **6–7 m away,
  mid-movement**; the operator reads it from arm's length during setup. At P3
  pitch the panel is 192×192 mm, so a 7 px glyph is ~21 mm tall — readable up
  close, **not glanceable at 6 m**. Rule: **drill-time screens communicate with
  big geometry and color, never with text**; text (menus, stats, prompts) is for
  setup/summary screens the operator reads up close.
- **Power is content-dependent.** Sparse dark-background screens keep the draw
  in the ~0.5–1 A budget the battery/boost path is sized for (`bom.md`). No
  full-screen white fills, ever; global brightness capped in firmware.
- **No mirroring problem — the screen is the source of truth.** The pairing
  round binds physical targets to **on-screen dots** directly (operator prompts
  a dot, someone taps a physical unit). Whatever spatial convention the screen
  draws is self-consistent by construction; no left/right flip logic needed.
- **Reaction timestamps** are stamped at panel flush, not command issue
  (`architecture.md`, photon latency) — the UI loop must expose its flush hook.

## Layout grid

Common frame for all screens: a **12 px status strip** (top) + a **52 px main
area**. The main area holds the layout map (drill/pairing) or large text
(countdown/summary).

```
┌────────────────────────────┐  y 0–11  status strip (5×7 font, dim)
│ [state]   [time]   [batt]  │          batt = central unit's own cell, read
├────────────────────────────┤  y 12–63 main area (52 px)   via a local ADC
                                        divider — NOT from radio (Hello.batt_mv
                                        carries target batteries only)
│                            │
│         main area          │
│                            │
└────────────────────────────┘
```

## The layout map (shared component)

An abstract rectangle with up to `MAX_TARGETS = 8` slot dots on its perimeter —
4 corners + 4 mid-sides — drawn as large as the main area allows (~48×48 px).
With N < 8 active slots only the bound slots are drawn. Dots are 5×5 px at rest.

```
  ═══════ NET ═══════    top edge = net side (the panel itself stands
  0 ──── 1 ──── 2        at the net, facing the player)
  │             │
  7             3        canonical spots 0..7, clockwise from net-left;
  │             │        geometric meaning is assigned by the pairing
  6 ──── 5 ──── 4        prompts, not hardcoded
```

**Phone parity:** the operator app renders this same canonical map with the
same indices and net-at-top orientation (`app/src/screens/CourtMap.tsx`).
During pairing each bind's spot arrives from the operator's map tap
(`SelectPairSpot`, one canonical index) and the panel lights that spot — so the
phone and the panel always light **the same dot**. The brain drives the round;
both UIs are renderers over its Status events.

Dot states: **off** (unbound/unused), **dim white** (bound, idle), **bright
accent, pulsing** (armed target), **green flash 300 ms** (hit), **red flash
300 ms** (miss/timeout), **blinking red** (node offline).

## Screens

### 1. Idle / ready

Operator-distance screen after boot or between sessions.

```
│ ZD          ready    ▂▄▆█ │   status: name, state, battery gauge
│                            │
│        ┌─────────┐         │   map, all dots dim (bound) / off
│        ·         ·         │
│        │         │         │
│        ·         ·         │
│        └─────────┘         │
│   PAIR to begin            │   5×7 hint line
```

### 2. Pairing round

Per `architecture.md`: interactive — the operator picks each bind's spot on the
phone map (`SelectPairSpot`); the panel mirrors it. Two-tap confirm per bind.

- Waiting for the operator's pick: all unbound spots dim, hint line `PICK SPOT`
  (the phone shows "tap the map").
- Picked spot: **bright accent, pulsing** (~2 Hz) — the same dot the phone
  lights.
- Status strip: `PAIR 3/8` (bound so far / total).
- Hint line: `PRESS HERE` → after first tap of a candidate MAC: `AGAIN?`
  (the confirm state from `lib/pairing/` `Tap::Await`).
- Bound spots turn dim white as they lock in; last bind → brief full-map green
  pulse → Idle (`ready · paired 8`).
- **Operator correction:** serial `undo` calls `PairingRound::undo_last()` —
  the last bound slot un-locks (back to pulsing) and is re-prompted. Shown as
  a dim `UNDO ok` hint line for one beat.

### 3. Countdown

Player-distance screen. Full main area digit, ~40 px tall, one per second:
`3` → `2` → `1` → drill starts. Status strip shows the drill mode
(`RAND 10`, `TIME 60`, `PATH 6`).

**Ordering is part of the timing contract:** `DrillEngine::start()` is called
**only after** the countdown fully completes — the first `Arm` (and so the first
`t_lit`) comes out of `start()` after "1" has been shown. Calling `start()`
first and then playing the countdown would stamp the first target ~3 s before
the player can see it, inflating its reaction time by the countdown length.
Countdown is deliberately a firmware/UI-owned state (the engine has none) —
the one sanctioned exception to "the UI is a renderer."

### 4. Drill run (the core screen)

Player-distance: geometry + color only.

```
│ 04/10              0:23    │   rep counter (or time left), small
│        ┌─────────┐         │
│        ·         ●         │   ● armed target: bright accent,
│        │         │         │     pulsing, 9×9 px (vs 5×5 rest)
│        ·         ·         │
│        └─────────┘         │
│                            │
```

- Only the **armed** dot is emphasized — a moving player finds one bright
  pulsing point in peripheral vision faster than any symbol.
- Hit → armed dot flashes **green** 300 ms; during `delay_ms` the map shows
  all-dim (rest state), then the next dot lights.
- Timeout/miss → **red** flash on the missed dot, then advance (auto modes)
  or wait (Live).
- **Time-limited mode:** status strip swaps the rep counter for remaining
  time; the last 10 s the time blinks.
- **Live mode:** between picks the map is all-dim; status strip `LIVE 07`.

### 5. Session summary

Operator-distance, text-first. Two pages, toggled every 4 s (or by serial/BLE):

```
│ DONE          RAND 10      │      │ DONE                       │
│  hits    9                 │      │  best   412 ms             │
│  miss    1                 │      │  avg    563 ms             │
│  total   1:47              │      │  slow   890 ms             │
```

(`slow` = slowest attempt — the v0 operator metric, `history-v0.md`; backed by
`DrillSummary.worst_reaction_ms`. Page toggle is automatic (every 4 s) or via
the serial console — **serial-only for now**; a BLE opcode is added only if the
app ever renders these pages itself.)

### 6. Error / degraded states

- **Node offline** (misses `Ping`/`Hello` heartbeats): its dot blinks red;
  status strip `NODE 3 LOST`. The engine has **no pause state** — if the lost
  node is the armed one, the drill resolves exactly as the engine does: the
  target times out into a **miss** and advances (when `timeout_ms` is set), or
  keeps waiting for the hit (when it isn't). The UI only overlays the warning;
  it never suspends or mutates the run. The operator can `stop` at any time.
- **Low battery on a target** (`Hello.batt_mv` threshold): dot gets a 1 px
  yellow ring in Idle; listed via serial `nodes`.
- **BLE connected/disconnected:** 3×3 px indicator in the status strip; no
  drill interruption either way (phone is not in the loop).

## Screen-state machine

```
Boot → Idle ⇄ Pairing
        Idle → Countdown → Drill ⇄ (delay/live-wait)
                              Drill → Summary → Idle
any state: node-lost overlay; stop (serial/BLE) → Summary
```

Maps 1:1 onto engine states (`Idle/Armed/Delaying/WaitOperator/Done`) plus the
pairing round — the UI is a renderer over `DrillEngine` + `PairingRound`
outputs, no UI-owned game state.

## Firmware notes (for the implementation PR)

- Adafruit GFX built-in 5×7 font (size 1) for text; countdown digits drawn as
  filled rects (custom ~40 px digits), not scaled font (scaled 5×7 looks
  blocky in a bad way).
- Palette: background always black; chrome dim white (≈20 % value); armed
  accent = one saturated hue; green/red reserved for hit/miss semantics.
- Double-buffered draw (the HUB75 DMA lib supports it); `t_lit` is stamped in
  the flush callback of the frame that first shows the armed dot.
