#include "clock_sync.h"

#include <cmath>

namespace zd {
namespace {
// A two-point skew fit is only trustworthy once the samples span a real
// interval: over a short base, µs-level RX jitter on the beacon timestamp turns
// into hundreds of thousands of phantom ppm. Below this, stay offset-only.
constexpr int64_t MIN_SKEW_BASE_US = 20'000'000; // 20 s
// A real crystal pair drifts tens of ppm; clamp the estimate to a plausible
// bound so one bad sample can't bias the whole session.
constexpr double MAX_SKEW = 200e-6; // ±200 ppm
} // namespace

void ClockSync::addSample(uint64_t t_central_us, uint64_t t_local_us) {
  if (count_ == 0) {
    first_central_ = t_central_us;
    first_local_ = t_local_us;
  }
  last_central_ = t_central_us;
  last_local_ = t_local_us;
  ++count_;
}

double ClockSync::rate() const {
  const int64_t dl = (int64_t)(last_local_ - first_local_);
  // Too little baseline (one sample, or samples too close) → offset-only.
  if (dl < MIN_SKEW_BASE_US) return 1.0;
  const int64_t dc = (int64_t)(last_central_ - first_central_);
  double r = (double)dc / (double)dl;
  if (r > 1.0 + MAX_SKEW) r = 1.0 + MAX_SKEW;
  if (r < 1.0 - MAX_SKEW) r = 1.0 - MAX_SKEW;
  return r;
}

uint64_t ClockSync::toCentral(uint64_t t_local_us) const {
  if (count_ == 0) return t_local_us; // unsynced — nothing to map against
  // Work relative to the first anchor so the doubles stay small and precise
  // even when the raw µs counters are large.
  const int64_t dl = (int64_t)(t_local_us - first_local_);
  const int64_t dc = (int64_t)llround(rate() * (double)dl);
  return (uint64_t)((int64_t)first_central_ + dc);
}

double ClockSync::skewPpm() const {
  if (count_ < 2) return 0.0;
  return (rate() - 1.0) * 1e6;
}

void ClockSync::reset() {
  first_central_ = first_local_ = 0;
  last_central_ = last_local_ = 0;
  count_ = 0;
}

} // namespace zd
