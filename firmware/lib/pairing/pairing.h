// ZoneDash pairing round — builds the MAC→position map before a session.
// The central unit prompts each active slot in turn ("Press here"); whichever
// target presses is bound to that slot. Pure logic, host-testable: feed taps,
// read the resulting map. See docs/architecture.md "Target identity".
#pragma once
#include <array>
#include <cstdint>

#include "../protocol/protocol.h" // MAX_TARGETS

namespace zd {

// A target's hardware identity — its 6-byte ESP-NOW MAC.
using Mac = std::array<uint8_t, 6>;

// position (0..count-1) → the MAC bound to that slot in this session's layout.
struct TargetMap {
  uint8_t count = 0; // number of bound slots so far
  std::array<Mac, MAX_TARGETS> macs{};

  // Position of a MAC, or -1 if it isn't bound.
  int position_of(const Mac& mac) const;
  const Mac& mac_at(uint8_t position) const { return macs[position]; }
};

// Drives the "prompt a slot, bind whoever presses" round.
class PairingRound {
 public:
  // Begin binding `num_positions` slots (clamped to 1..MAX_TARGETS); prompts
  // position 0. Discards any previous map.
  void begin(uint8_t num_positions);

  // A target pressed. Binds it to the current prompt unless it's already bound
  // (a stray re-tap), then advances. Returns the next prompt position, or -1
  // when the round is complete (or not running).
  int on_tap(const Mac& mac);

  bool done() const { return prompt_ < 0 && target_ > 0; }
  int current_prompt() const { return prompt_; } // slot prompted; -1 = done/idle
  const TargetMap& map() const { return map_; }

 private:
  TargetMap map_;
  uint8_t target_ = 0; // total slots to bind this round
  int prompt_ = -1;    // slot being prompted; -1 = idle/done
};

} // namespace zd
