#include "layout.h"

namespace zd {
namespace {
// The layout rectangle inside the main area: an inset box so a 5x5 dot at any
// corner stays fully on-panel (below the status strip, clear of the edges).
// Perimeter order is CLOCKWISE FROM NET-LEFT — the canonical 0..7 the phone map
// uses, so a bind lit here matches the dot the app lights.
constexpr int LX0 = 10, LY0 = 18, LX1 = 54, LY1 = 58;
constexpr int XMID = (LX0 + LX1) / 2;
constexpr int YMID = (LY0 + LY1) / 2;

const Point kSpots[MAX_TARGETS] = {
    {LX0, LY0},  // 0 net-left  (top-left, net edge)
    {XMID, LY0}, // 1 net-mid
    {LX1, LY0},  // 2 net-right
    {LX1, YMID}, // 3 right-mid
    {LX1, LY1},  // 4 back-right
    {XMID, LY1}, // 5 back-mid
    {LX0, LY1},  // 6 back-left
    {LX0, YMID}, // 7 left-mid
};
} // namespace

Point spot_xy(uint8_t canonical) {
  if (canonical >= MAX_TARGETS) return {0, 0};
  return kSpots[canonical];
}

} // namespace zd
