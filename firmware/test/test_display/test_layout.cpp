// Host tests for the panel layout geometry (lib/display/layout). The 8 canonical
// spots must match the phone's CourtMap order (clockwise from net-left) so the
// panel and the app light the SAME dot (docs/display-ui.md "Phone parity").
#include "layout.h"

#include "../zd_test.h"

using namespace zd;

// Every spot lands in the main area (below the 12 px status strip) and on-panel
// with room around it for a 5x5 dot.
static void test_spots_on_panel_main_area() {
  for (uint8_t i = 0; i < MAX_TARGETS; i++) {
    const Point p = spot_xy(i);
    ZD_CHECK(p.x >= 2 && p.x <= PANEL_W - 3);
    ZD_CHECK(p.y >= STATUS_H + 2 && p.y <= PANEL_H - 3);
  }
}

// The 8 slots are distinct — no two share a pixel.
static void test_spots_distinct() {
  for (uint8_t i = 0; i < MAX_TARGETS; i++)
    for (uint8_t j = i + 1; j < MAX_TARGETS; j++) {
      const Point a = spot_xy(i), b = spot_xy(j);
      ZD_CHECK(!(a.x == b.x && a.y == b.y));
    }
}

// Canonical order is clockwise from net-left: 0,1,2 across the top (net) edge;
// down the right (2,3,4); across the bottom (4,5,6); up the left (6,7,0) — so
// the panel and phone agree which physical corner each index means.
static void test_canonical_clockwise() {
  const Point s0 = spot_xy(0), s1 = spot_xy(1), s2 = spot_xy(2), s3 = spot_xy(3);
  const Point s4 = spot_xy(4), s5 = spot_xy(5), s6 = spot_xy(6), s7 = spot_xy(7);
  // Top (net) edge: 0,1,2 share the min y, left to right.
  ZD_EQ(s0.y, s1.y);
  ZD_EQ(s1.y, s2.y);
  ZD_CHECK(s0.x < s1.x && s1.x < s2.x);
  // Bottom edge: 6,5,4 share the max y, left to right.
  ZD_EQ(s4.y, s5.y);
  ZD_EQ(s5.y, s6.y);
  ZD_CHECK(s6.x < s5.x && s5.x < s4.x);
  ZD_CHECK(s0.y < s4.y); // top edge above bottom edge
  // Sides: 7 on the left column, 3 on the right column, both mid-height.
  ZD_EQ(s7.x, s0.x);
  ZD_EQ(s3.x, s2.x);
  ZD_CHECK(s0.y < s7.y && s7.y < s6.y); // 7 between top-left and bottom-left
  ZD_CHECK(s2.y < s3.y && s3.y < s4.y); // 3 between top-right and bottom-right
}

// Out-of-range is a safe {0,0}, never a read past the table.
static void test_out_of_range() {
  const Point p = spot_xy(MAX_TARGETS);
  ZD_EQ(p.x, 0);
  ZD_EQ(p.y, 0);
}

int main() {
  std::printf("display layout tests\n");
  ZD_RUN(test_spots_on_panel_main_area);
  ZD_RUN(test_spots_distinct);
  ZD_RUN(test_canonical_clockwise);
  ZD_RUN(test_out_of_range);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
