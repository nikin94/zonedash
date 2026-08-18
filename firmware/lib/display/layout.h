// ZoneDash HUB75 panel layout geometry — where each canonical court spot is
// drawn on the 64x64 panel. Pure logic (no Arduino, no Protomatter), so the
// brain's display code renders a design that is host-tested here instead of
// improvised on-device. See docs/display-ui.md for the screen spec.
#pragma once
#include <cstdint>

#include "../protocol/protocol.h" // MAX_TARGETS

namespace zd {

// A point on the 64x64 panel grid.
struct Point {
  int x;
  int y;
};

// Panel + layout frame (docs/display-ui.md "Layout grid"): a 12 px status strip
// on top (y 0..STATUS_H-1), the layout map below it in the main area.
constexpr int PANEL_W = 64;
constexpr int PANEL_H = 64;
constexpr int STATUS_H = 12;

// Centre pixel of the resting dot for a canonical spot (0..7, CLOCKWISE FROM
// NET-LEFT) — the SAME order and net-at-top orientation the phone's CourtMap
// uses, so the panel and the app always light the same dot (display-ui.md
// "Phone parity"). Out-of-range returns {0,0} rather than reading past the map.
Point spot_xy(uint8_t canonical);

} // namespace zd
