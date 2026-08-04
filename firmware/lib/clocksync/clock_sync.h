// ZoneDash clock sync — maps a target's local monotonic clock (µs) onto the
// brain's central clock domain, so hit timestamps from any node are directly
// comparable. Pure logic: the caller supplies both clocks; no hardware here,
// so it runs and tests on the host.
//
// One Sync sample gives an offset (central = local + offset). Two or more give
// skew too: crystals drift tens of ppm, which over a multi-minute session is
// milliseconds — enough to bias reaction times — so once a second sample lands
// we fit a line through the first and latest points instead of a fixed offset.
#pragma once
#include <stdint.h>

namespace zd {

class ClockSync {
 public:
  // Record a sync point: the central time carried in a Sync beacon, and the
  // local time when this node stamped its receipt.
  void addSample(uint64_t t_central_us, uint64_t t_local_us);

  bool synced() const { return count_ > 0; }
  uint32_t sampleCount() const { return count_; }

  // Convert a local timestamp into the central domain. Offset+skew once two
  // samples exist, offset-only with one, and pass-through when unsynced (the
  // caller should gate on synced()).
  uint64_t toCentral(uint64_t t_local_us) const;

  // Rate of the central clock vs the local one, in parts-per-million. 0 until a
  // second sample lands; exposed for drift diagnostics / logging.
  double skewPpm() const;

  void reset();

 private:
  // First and most-recent samples are enough for a two-point fit of a slowly
  // drifting crystal — no history buffer needed.
  uint64_t first_central_ = 0, first_local_ = 0;
  uint64_t last_central_ = 0, last_local_ = 0;
  uint32_t count_ = 0;

  // central-per-local rate; 1.0 with a single sample.
  double rate() const;
};

} // namespace zd
