// Host tests for the clock-sync mapping (offset + skew).
#include "clock_sync.h"

#include "../zd_test.h"

using zd::ClockSync;

// Unsynced: no samples yet → pass the local time straight through.
static void test_unsynced() {
  ClockSync cs;
  ZD_CHECK(!cs.synced());
  ZD_EQ(cs.toCentral(1234), 1234);
  ZD_EQ(cs.skewPpm(), 0);
}

// One sample → fixed positive offset (central ahead of local).
static void test_offset_positive() {
  ClockSync cs;
  cs.addSample(/*central*/ 1000, /*local*/ 0);
  ZD_CHECK(cs.synced());
  ZD_EQ(cs.toCentral(0), 1000);
  ZD_EQ(cs.toCentral(500), 1500);
  ZD_EQ(cs.skewPpm(), 0); // one sample → no skew estimate
}

// One sample → negative offset (local ahead of central).
static void test_offset_negative() {
  ClockSync cs;
  cs.addSample(/*central*/ 0, /*local*/ 1000);
  ZD_EQ(cs.toCentral(1000), 0);
  ZD_EQ(cs.toCentral(1500), 500);
}

// Two samples → linear fit passes exactly through both anchors, and corrects
// a drifting local clock at points in between.
static void test_skew_fit() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(1000000, 1010000); // local ran 1.01x fast over the interval
  // Endpoints map exactly.
  ZD_EQ(cs.toCentral(0), 0);
  ZD_EQ(cs.toCentral(1010000), 1000000);
  // Midpoint interpolates on the fitted rate, not a fixed offset.
  ZD_EQ(cs.toCentral(505000), 500000);
  // ~ -9901 ppm (central slower per local tick). Check the sign + magnitude.
  ZD_CHECK(cs.skewPpm() < -9800 && cs.skewPpm() > -10000);
}

// Skew correction also extrapolates past the last anchor.
static void test_skew_extrapolate() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(1000000, 1010000);
  ZD_EQ(cs.toCentral(2020000), 2000000);
}

// A later re-sync updates the latest anchor, refining the fit.
static void test_resync_updates() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(100000, 100050); // early, tiny drift
  const double early = cs.skewPpm();
  cs.addSample(1000000, 1001000); // later, clearer drift
  ZD_EQ(cs.toCentral(1001000), 1000000); // maps through the newest anchor
  ZD_CHECK(cs.skewPpm() != early);
  ZD_EQ(cs.sampleCount(), 3);
}

static void test_reset() {
  ClockSync cs;
  cs.addSample(1000, 0);
  cs.reset();
  ZD_CHECK(!cs.synced());
  ZD_EQ(cs.sampleCount(), 0);
  ZD_EQ(cs.toCentral(42), 42);
}

int main() {
  std::printf("clock_sync tests\n");
  ZD_RUN(test_unsynced);
  ZD_RUN(test_offset_positive);
  ZD_RUN(test_offset_negative);
  ZD_RUN(test_skew_fit);
  ZD_RUN(test_skew_extrapolate);
  ZD_RUN(test_resync_updates);
  ZD_RUN(test_reset);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails == 0 ? 0 : 1;
}
