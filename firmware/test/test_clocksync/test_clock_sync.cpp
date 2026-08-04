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

// Two samples over a wide-enough base → linear fit passes exactly through both
// anchors and corrects a drifting local clock at points in between.
static void test_skew_fit() {
  ClockSync cs;
  cs.addSample(0, 0);
  // Over 100 s the local clock ran 5 ms fast: 50 ppm — a real crystal figure,
  // and well past the min-base gate, so the skew is trusted.
  cs.addSample(100000000, 100005000);
  ZD_EQ(cs.toCentral(0), 0);
  ZD_EQ(cs.toCentral(100005000), 100000000); // endpoints map exactly
  ZD_EQ(cs.toCentral(50002500), 50000000);   // midpoint interpolates on the fit
  // rate = 100000000/100005000 ≈ 0.99995 → ~ -50 ppm.
  ZD_CHECK(cs.skewPpm() < -45 && cs.skewPpm() > -55);
}

// A short base is NOT trusted for skew — jitter over a fraction of a second
// would otherwise read as huge drift. Stay offset-only until the base is wide.
static void test_short_base_offset_only() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(100000, 100050); // 100 ms base, 50 µs apart → 500 ppm if trusted
  ZD_EQ(cs.skewPpm(), 0);       // gated: no skew estimate yet
  ZD_EQ(cs.toCentral(200000), 200000); // offset-only pass-through (offset 0)
}

// The fitted rate is clamped to a plausible bound, so a wild sample can't skew
// the whole session even past the base gate.
static void test_skew_clamped() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(130000000, 100000000); // absurd 30% drift over a 100 s base
  ZD_CHECK(cs.skewPpm() <= 200 && cs.skewPpm() >= 199); // clamped to +200 ppm
}

// Skew correction also extrapolates past the last anchor.
static void test_skew_extrapolate() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(100000000, 100005000);
  ZD_EQ(cs.toCentral(200010000), 200000000);
}

// A later re-sync that crosses the base gate turns skew on and refines the fit.
static void test_resync_updates() {
  ClockSync cs;
  cs.addSample(0, 0);
  cs.addSample(100000, 100050); // early, tiny base → skew not trusted
  ZD_EQ(cs.skewPpm(), 0);
  cs.addSample(60000000, 60003000); // 60 s base, 50 ppm → now trusted
  ZD_EQ(cs.toCentral(60003000), 60000000); // maps through the newest anchor
  ZD_CHECK(cs.skewPpm() < -45 && cs.skewPpm() > -55);
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
  ZD_RUN(test_short_base_offset_only);
  ZD_RUN(test_skew_clamped);
  ZD_RUN(test_skew_extrapolate);
  ZD_RUN(test_resync_updates);
  ZD_RUN(test_reset);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails == 0 ? 0 : 1;
}
