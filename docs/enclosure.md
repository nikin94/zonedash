# Enclosures & mechanical build (3D-print oriented)

How to build the three physical parts yourself on an FDM 3D printer: the
**target node**, the **display + brain unit**, and the **charging case**. This is
a design guide (dimensions, print orientation, tolerances, fasteners) — not final
CAD. Print the target node first, prove it on court, then commit to 8×.

> Assumes an FDM printer (0.4 mm nozzle, PLA/PETG). PETG preferred for anything
> that takes racket impact or lives in a hot gym bag; PLA is fine for the case
> dock. Nothing here needs a resin printer.

## Shared 3D-print rules of thumb

- **Wall thickness:** 3 perimeters (≈1.2 mm) minimum on load-bearing walls; 4 on
  the target node (it gets hit).
- **Tolerances (design these into the model, don't sand later):**
  - Snap/slip fit for a PCB in a pocket: **+0.3–0.4 mm** per side.
  - Press-fit for a magnet/pin: **+0.05–0.1 mm** (tight; a drop of CA glue backs
    it up).
  - Lid that slides into a rail: **+0.2 mm**.
- **Threaded fasteners → heat-set brass inserts** (M2/M3), not screwing into
  plastic. Hole = insert's outer minus ~0.2 mm, sunk with a soldering iron. Far
  more durable across the repeated open/close of 8 nodes.
- **Print orientation drives strength.** Layers split along the Z build
  direction, so orient a part with impact/stress running **across** layers, not
  along them (see each part below).
- **Cable/USB/pin openings:** model as real cutouts; leave **+0.5 mm** clearance
  so a USB-C plug or JST connector seats without filing.

---

## 1. Target node (×8 in production, ×2 for prototype)

Small floor-standing puck/post that sits at the side line and presents a **ToF
sensor window** aimed at where the racket head arrives (≈knee height, close in).

### Internal stack (what the shell must hold)

- ESP32-C3 Super Mini (≈22 × 18 mm)
- VL53L1X ToF module, its lens facing out through a window
- LiPo ~400–500 mAh (≈30 × 20 × 5 mm — measure yours, cells vary a lot)
- 2× pogo-pad contacts on the base (VBAT+ / GND) + a small charge PCB / TP4056
- optional piezo disc (prototype only), bonded to the strike face

### Form & geometry

- **Low, wide, heavy-based post.** It must not tip when a player lunges near it or
  clips it with a foot. Two ways to get stability, ideally both:
  - a **wide flared foot** (Ø ~90–110 mm) with a low centre of mass — battery sits
    at the very bottom;
  - a **weight pocket** in the base (drop in a steel washer stack / sand / lead
    shot, or print with a heavy infill bottom).
- **Height:** stand the ToF window at the racket-head contact height you measured
  (~knee, ~40–55 cm). Either print the post tall, or make a short puck that clamps
  to a cheap adjustable stand — decide after the court test tells us the real
  height and whether one height suits all positions.
- **ToF window:** a recessed opening with the sensor set **~2–3 mm behind the
  face** so a racket can't smack the lens. VL53L1X emits/receives ~940 nm IR —
  leave it **open air** if you can (best signal). If you must cover it for
  protection, use a thin **IR-transparent** window (a slice of dark IR filter or
  thin clear PETG), never painted/opaque plastic, and validate range through it.
- **Angle the face** slightly (5–15° up or down) so the cone points at the
  incoming racket head, not at passing legs deeper in the room — reduces false
  triggers. Make the sensor mount a **separate tilting insert** so you can tune
  the angle on the prototype without reprinting the whole shell.

### Print orientation & assembly

- Print the **body upright** (open top), lid separate — impact hits the side
  walls across layers, which is the strong direction.
- **Base and lid** join with 3× M2 heat-set inserts + screws, or a bayonet twist
  if you want tool-less battery access.
- Pogo contacts on the **bottom** (so the node charges standing in its case slot);
  align them to a keyed flat or magnet so orientation in the slot is forced.

---

## 2. Display + brain unit (×1)

Front-of-court box: **HUB75 64×64 P3 panel** on the face, **MatrixPortal-S3**
behind it, **10000 mAh LiPo + XL6009 boost** in the base, one power switch, USB-C
port reachable for serial/dev.

### Geometry

- **Two-shell box:** a thin **front bezel/frame** that holds the panel flush +
  clean, and a **deeper back box** for the electronics and battery.
- The P3 64×64 panel is ~**192 × 192 mm** active — bigger than most beds only if
  you add a full surround. Print the bezel as **4 corner frames / edge strips**
  that bolt together, or a picture-frame in 2 halves, so it fits a 220 mm bed.
- **Panel mount:** HUB75 panels have **M3 magnetic standoff holes** on the back —
  model matching bosses in the bezel and bolt to them (don't rely on glue).
- **Tilt/stand:** a foldable kickstand leg or a detachable A-frame so it faces the
  player at eye line. Keep the centre of mass low (battery in the base).
- **Ventilation:** the panel + boost get warm at brightness — add slots on the
  back box; don't fully seal it.
- **Ports:** cut a **USB-C** window (dev/serial), a **power switch** hole, and the
  pogo/charge contacts on the base if it also docks. Because this cell is big and
  the box is heavy, docking is optional — a plain barrel/USB-C charge port on the
  box is a fine alternative to case-docking it.

### Print orientation

- Back box printed **open-face-up** (it's a tub), lid = the bezel side.
- Bezel strips printed flat for clean front faces.

---

## 3. Charging case / dock

Holds and charges the 8 targets (earbud-case model). Simplest viable version
first; fancy later.

### Minimum viable (recommended first)

- **A tray with 8 keyed slots.** Each slot: a pocket shaped to the node's base +
  **2 pogo-pins** wired to a shared 5 V rail + an **alignment magnet** (or keyed
  flat) so the node drops in one way and its two base contacts land on the pins.
- **5 V feed:** a single USB-C / barrel input → 5 V rail → all 8 slots in
  parallel. Each node's onboard TP4056 limits its own charge current, so the case
  is "dumb" (just distributes 5 V). No per-slot electronics needed.
- **Pogo-pins:** through-hole pogo receptacles pressed into printed bosses (press
  fit +0.05 mm + CA glue), soldered to the rail underneath. Route wires in a
  channel under the tray; print the tray with a **removable bottom plate** for
  access.

### Print notes

- Print the **tray flat** (slots facing up) — no supports, clean pin bosses.
- **Slot tolerance +0.4 mm** so a node seats without forcing (pins have limited
  travel, ~1.5–2 mm — don't rely on jamming the node in).
- Add a **lid** (optional) only once dimensions are frozen; a simple friction lid
  or elastic strap is enough for a gym bag.
- The **display** is too big for this tray — either give it its own slot in a
  larger case lid, or (simpler) charge it via its own port and only case-charge
  the 8 targets. Decide once both boxes are modelled.

---

## Suggested build / print order

1. **Prototype target node ×1** (rough shell — even a taped-up box) to prove the
   ToF window geometry, sensor tilt, and contact height on court. Cheap, throwaway.
2. Refine the node model from what the court test teaches (height, angle, window),
   print the **final node ×1**, confirm, then **×8**.
3. **Display box** — can be built in parallel; it doesn't depend on the court test.
4. **Charging tray** last, once the node base + display footprint are frozen (its
   slots are cut to match them).

## Tooling / materials shopping (beyond electronics BOM)

- Filament: **PETG** (nodes + display box), PLA optional (tray).
- **Heat-set brass inserts** M2 + M3 + a soldering-iron insert tip.
- **Pogo-pins** (through-hole, spring, ~2 mm travel) ×~20 (2/node + spares).
- **Small magnets** (Ø4–6 mm discs) for slot alignment, ×~16 + spares.
- M2 / M3 machine screws assortment.
- Optional: **IR-transparent window** material for the ToF face (validate range).

_Last updated: 2026-08-03. Draft — dimensions firm up after the court test._
