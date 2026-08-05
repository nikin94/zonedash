#include "pairing.h"

namespace zd {

int TargetMap::position_of(const Mac& mac) const {
  for (uint8_t i = 0; i < count; ++i)
    if (macs[i] == mac) return i;
  return -1;
}

bool TargetMap::mac_at(uint8_t position, Mac& out) const {
  if (position >= count) return false;
  out = macs[position];
  return true;
}

void PairingRound::begin(uint8_t num_positions) {
  uint8_t n = num_positions;
  if (n < 1) n = 1;
  if (n > MAX_TARGETS) n = MAX_TARGETS;
  map_ = TargetMap{};
  target_ = n;
  have_candidate_ = false;
}

PairingRound::Tap PairingRound::on_tap(const Mac& mac) {
  if (!active()) return Tap::Ignored;             // idle or already complete
  if (map_.position_of(mac) >= 0) return Tap::Ignored; // stray re-tap of a bound node

  // First tap (or a different MAC than the pending one) → candidate awaiting
  // confirmation, not yet bound.
  if (!have_candidate_ || !(mac == candidate_)) {
    candidate_ = mac;
    have_candidate_ = true;
    return Tap::Await;
  }

  // Second consecutive tap by the same candidate → confirm the bind. Slots fill
  // in prompt order, so the write index is the current bound count.
  map_.macs[map_.count] = mac;
  ++map_.count;
  have_candidate_ = false;
  return Tap::Bound;
}

bool PairingRound::extend(uint8_t num_positions) {
  if (target_ == 0) return false; // idle round — nothing to extend
  uint8_t n = num_positions;
  if (n > MAX_TARGETS) n = MAX_TARGETS;
  if (n <= target_) return false; // shrink / no-op refused
  target_ = n;
  have_candidate_ = false;
  return true;
}

int PairingRound::undo_last() {
  if (map_.count > 0) {
    --map_.count;
    map_.macs[map_.count] = Mac{};
  }
  have_candidate_ = false;
  return current_prompt();
}

} // namespace zd
