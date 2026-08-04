#include "pairing.h"

namespace zd {

int TargetMap::position_of(const Mac& mac) const {
  for (uint8_t i = 0; i < count; ++i)
    if (macs[i] == mac) return i;
  return -1;
}

void PairingRound::begin(uint8_t num_positions) {
  uint8_t n = num_positions;
  if (n < 1) n = 1;
  if (n > MAX_TARGETS) n = MAX_TARGETS;
  map_ = TargetMap{};
  target_ = n;
  prompt_ = 0;
}

int PairingRound::on_tap(const Mac& mac) {
  if (prompt_ < 0) return -1;                      // round not running
  if (map_.position_of(mac) >= 0) return prompt_;  // already bound — ignore re-tap
  // Slots bind in prompt order, so count == prompt_ while the round runs.
  map_.macs[map_.count] = mac;
  ++map_.count;
  ++prompt_;
  if (prompt_ >= target_) prompt_ = -1; // all slots bound
  return prompt_;
}

} // namespace zd
