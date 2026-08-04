# v0 — the wired Raspberry-Pi prototype (history)

The original trainer the owner built over ~1.5 years, before this rebuild. Kept
for context: what it did, what worked, and — most usefully — which problems it
hit that ZoneDash's architecture is specifically chosen to avoid. Source: the
owner's write-up (`Device_en.pdf`).

## What it was

- Badminton **footwork trainer**: buttons around one half-court; a light-board
  facing the player shows which to run to and press; the light clears, the next
  lights, times are recorded.
- Started as a sketch of **6 buttons + a bulb scoreboard**; grew to **8 buttons**
  and **8 LED clusters** in the final build.
- **Raspberry Pi 2** ran the logic (Python), with a small **touchscreen** as the
  operator surface (coach pokes the screen).
- **Scoreboard:** a magnetic board with 8 holes, each holding a quad-LED cluster,
  bright enough to read from the far end of the court.
- **~63 m of two-core wire** ran from the Pi box to the buttons and the board;
  bundled with cable ties, 10-pin plugs into the control box.
- **Buttons:** arcade / slot-machine push-buttons (built for constant hard hits),
  mounted in **upside-down flower pots** for a stable, anti-shock base.
- Control box: Pi + a 220 V→low-voltage board (designed with the owner's father),
  on/off toggle, two 10-pin plugs (buttons + board), touchscreen in a cut slot,
  foam-padded edges.

## The three drill modes (v0) — canonical, carry forward

These are the modes the coaches actually used, so they define ZoneDash's engine:

1. **Random** — random order, a set number of reps; per-button time **and**
   whole-route time recorded. (A rep = light on → press → light off.)
2. **Path** — the coach **pre-builds a route** by pressing the buttons in order;
   the player then runs that fixed sequence.
3. **Single-press (live)** — the coach picks the **next target live**, one at a
   time, reacting to the player. Manual, coach-in-the-loop.

Mode 3 is the one worth flagging: it's **live operator control**, not a
pre-authored drill. In ZoneDash it maps cleanly to the phone (or serial pad)
sending "light target X now" on demand — the engine must support an
externally-driven next-target, not only self-sequencing.

## What ZoneDash inherits vs. fixes

**Inherit (proven good):**
- The **three modes** above.
- **Per-press + total-route timing** as the core metric.
- **Arcade/anti-shock button** as a robust contact reference — informs the piezo
  "soft tap" fallback (a hit-tolerant target that survives constant striking).
- **Weighted / wide stable base** (the flower-pot trick) — our 3D-printed stands
  need the same low centre of gravity.
- **Bright, far-readable prompt** — our HUB75 panel is the direct successor to the
  8-LED board, with far more it can show (court map + score + time).

**Fix (v0's real pain points → our design decisions):**
- **63 m of wire** → the whole reason for the rebuild. Gone: ESP-NOW wireless.
- ⭐ **Wireless attempt failed in v0** — cheap AliExpress RF modules: not enough
  range/power, and **frequency conflicts between buttons** plus latency when
  addressing many. This is the strongest historical validation of our choice:
  **ESP-NOW star + one gateway** is picked precisely because it solves those
  three — MAC-addressed (no channel conflicts), ~1–3 ms, and range/power that a
  half-court easily covers. v0 tried peer RF and drowned; we centralise.
- **Mains 220 V board + wall power** → per-node LiPo + charging case (no mains on
  court, no high-voltage wiring).
- **Pi + touchscreen operator** → the phone app (and serial pad on the bench).
  The Pi is removed; the engine moves onto the gateway ESP32.

## From the build photos (v0 images)

Three things the photos add on top of the write-up:

- **Operator UI metrics (directly reusable).** The touchscreen showed, per run:
  **Total time · Repeats (n/N) · Average time · Fastest attempt · Slowest
  attempt**, with modes Random / Single(=live) / Path and an adjustable attempt
  count. This is the exact stat set the coach found useful — our session summary
  should match it. The engine currently reports avg/best reaction; **add
  worst(slowest) and per-attempt (rep) time** to line up. → future engine PR.
- **Schematic topology (father's board).** Opto-isolators on the 8 button inputs
  to the Pi, transistor drivers (VT1–VT8) for the 8 display-LED clusters, fed by
  a 220 V transformer PSU. The opto-isolation exists **only because** logic and
  LED drive shared a mains supply — going all-low-voltage LiPo/ESP-NOW removes
  that whole layer. Validates the simplification.
- **Final button construction.** Microswitch on an **inverted flower-pot base**
  (wide, heavy, stable) with a large **arcade dome cap** as the strike surface —
  spring-loaded, forgiving. This is our "soft tap target" fallback in physical
  form; a good mechanical reference for the piezo target's dome + weighted base.

## The owner's own stated goal for v1

Verbatim intent from the write-up: *"remove the wires and make a mobile
application for all this"* — and note, building it is what pulled the owner into
mobile development. ZoneDash is exactly that v1.

_Last updated: 2026-08-04 (v0 history captured from Device_en.pdf)._
