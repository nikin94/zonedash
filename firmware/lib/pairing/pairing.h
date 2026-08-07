// ZoneDash pairing round — builds the MAC→position map before a session.
// The central unit prompts each active slot in turn ("Press here"); the target
// that presses is bound to that slot. Pure logic, host-testable: feed taps,
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
  // MAC bound to a position. Returns false and leaves `out` untouched if the
  // position isn't bound (>= count) — no silent zero-MAC for out-of-range reads.
  bool mac_at(uint8_t position, Mac& out) const;
};

// Drives the "prompt a slot, bind whoever presses" round.
class PairingRound {
 public:
  // What a tap did, so the board can react (prompt to confirm, advance, ...).
  enum class Tap : uint8_t {
    Ignored, // no active round, round done, or a re-tap of an already-bound node
    Await,   // new candidate for the current slot — ask "press again to confirm"
    Bound,   // same candidate tapped again — MAC bound to the slot, prompt advanced
  };

  // Begin binding `num_positions` slots (clamped to 1..MAX_TARGETS); prompts
  // position 0. Discards any previous map and candidate.
  void begin(uint8_t num_positions);

  // A target pressed. Binding takes TWO consecutive taps from the same MAC: the
  // first makes it the slot's candidate (Await), the second confirms and binds
  // (Bound). This rejects a stray single tap (ball bounce, ToF ghost, piezo
  // cross-talk) that would otherwise mis-bind the wrong node. A different unbound
  // MAC replaces the candidate (Await again); an already-bound MAC is Ignored.
  Tap on_tap(const Mac& mac);

  // Operator correction: unbind the most recent slot and re-prompt it. No-op if
  // nothing is bound. Returns the slot now prompted, or -1 if idle.
  //
  // CONTRACT — the brain gates this, not the core. "Which spot is currently
  // prompted on court" is board state this core never sees (a candidate only
  // exists after the first physical tap), so undo_last() cannot refuse an undo
  // that arrives mid-prompt: called then, it would cancel the in-flight pick
  // AND pop the previous confirmed bind — a double rollback. The brain's
  // receive path MUST reject UndoPairBind / serial `undo` while a spot prompt
  // is active (the transport mock encodes this exact refusal).
  int undo_last();

  // Grow a round to `num_positions` slots WITHOUT discarding existing binds —
  // the map is append-only, so adding targets never invalidates bound pairs.
  // Clamped to MAX_TARGETS; shrinking is refused (which bound slot would go?)
  // as is extending an idle round (nothing to extend — use begin()). Returns
  // true if the target count changed.
  bool extend(uint8_t num_positions);

  // Finish an in-progress round early at however many slots are already bound:
  // trims the target down to the bound count so the round reads as done, keeping
  // every existing bind. The operator's "good enough, stop here" path — the
  // complement of extend (which only grows). No-op (returns false) on an idle
  // round or with nothing bound yet; a mid-prompt candidate is dropped.
  bool finish();

  bool active() const { return target_ > 0 && map_.count < target_; }
  bool done() const { return target_ > 0 && map_.count >= target_; }
  // Slot awaiting a bind (== bound count while running), or -1 when done/idle.
  int current_prompt() const { return active() ? map_.count : -1; }
  const TargetMap& map() const { return map_; }

 private:
  TargetMap map_;
  uint8_t target_ = 0;       // total slots to bind this round (0 = idle)
  Mac candidate_{};          // MAC awaiting a confirming second tap
  bool have_candidate_ = false;
};

} // namespace zd
