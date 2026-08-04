#include "clock_sync.h"

#include <cmath>

namespace zd {

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
  // One sample (or two at the same local instant) → assume the clocks tick at
  // the same rate; correction is offset-only.
  if (last_local_ == first_local_) return 1.0;
  const int64_t dc = (int64_t)(last_central_ - first_central_);
  const int64_t dl = (int64_t)(last_local_ - first_local_);
  return (double)dc / (double)dl;
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
