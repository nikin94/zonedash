// ZoneDash drill engine — the pure sequencing/timing core of the brain.
// No Arduino, no radio, no GPIO: time comes in as µs from the caller and
// randomness is injected, so the whole thing is deterministic and host-testable.
// The engine emits Actions (light a target, finish) that the caller executes.
#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <vector>

namespace zd {

enum class DrillMode : uint8_t {
  Random,      // random order, `count` reps
  Path,        // fixed operator-authored sequence
  Live,        // operator picks each next target on demand
  TimeLimited, // random order, run for `duration_ms` — max targets in the window
};

struct DrillConfig {
  DrillMode mode = DrillMode::Random;
  uint8_t num_positions = 8;   // active layout size; random modes pick [0,num_positions)
  uint16_t count = 10;         // reps for Random (Path uses path length; others ignore)
  uint32_t duration_ms = 60000; // TimeLimited window
  uint32_t delay_ms = 0;       // gap after a hit before the next target lights
  bool allow_immediate_repeat = false; // may the same position light twice running
  uint32_t timeout_ms = 0;     // 0 = none; else a target auto-misses after this
  std::vector<uint8_t> path;   // Path mode: positions in order
};

struct HitRecord {
  uint16_t seq = 0;
  uint8_t position = 0;
  uint64_t t_lit_us = 0;
  uint64_t t_hit_us = 0;      // 0 on a miss
  uint32_t reaction_ms = 0;  // t_hit - t_lit (timeout value on a miss)
  uint32_t movement_ms = 0;  // t_hit[n] - t_hit[n-1]; 0 for the first hit
  bool miss = false;
};

struct DrillSummary {
  uint16_t hits = 0;
  uint16_t misses = 0;
  uint32_t total_ms = 0;        // first lit -> last resolved hit
  uint32_t avg_reaction_ms = 0; // over hits only
  uint32_t best_reaction_ms = 0;
};

enum class ActionType : uint8_t { None, Arm, Finished };
struct Action {
  ActionType type = ActionType::None;
  uint8_t position = 0; // Arm: which target to light
  uint16_t seq = 0;     // Arm: step index
};

class DrillEngine {
 public:
  using Rng = std::function<uint32_t()>; // returns a 32-bit random value

  // Begin a drill. Returns the first Action: Arm for auto modes, None for Live
  // (which waits for the operator's first set_next).
  Action start(const DrillConfig& cfg, uint64_t now_us, Rng rng);

  // A target reported a hit. Returns the next Action.
  Action on_hit(uint8_t position, uint64_t now_us);

  // Time-driven transitions: delay expiry, per-target timeout, time-limit end.
  // Call regularly; returns None when nothing is due.
  Action poll(uint64_t now_us);

  // Live mode only: the operator lights the next target. Returns Arm (or None).
  Action set_next(uint8_t position, uint64_t now_us);

  // Force-finish (manual stop / Live end). Returns Finished.
  Action stop(uint64_t now_us);

  bool running() const {
    return state_ == State::Armed || state_ == State::Delaying ||
           state_ == State::WaitOperator;
  }
  const std::vector<HitRecord>& hits() const { return hits_; }
  DrillSummary summary() const;

 private:
  enum class State : uint8_t { Idle, Armed, Delaying, WaitOperator, Done };

  Action arm_at(uint8_t position, uint64_t now_us);
  Action advance_or_finish(uint64_t now_us); // shared tail after a resolved step
  uint8_t pick_next();
  bool reached_end(uint64_t now_us) const;

  DrillConfig cfg_;
  Rng rng_;
  State state_ = State::Idle;
  uint16_t seq_ = 0;
  uint8_t cur_pos_ = 0;
  uint8_t last_pos_ = 0xFF; // 0xFF = none yet (for no-repeat)
  uint64_t t_lit_us_ = 0;
  uint64_t first_lit_us_ = 0;
  uint64_t last_hit_us_ = 0;
  uint64_t next_arm_us_ = 0; // Delaying -> arm at this time
  uint64_t end_us_ = 0;      // TimeLimited absolute end
  bool have_first_ = false;
  bool have_prev_hit_ = false;
  std::vector<HitRecord> hits_;
};

} // namespace zd
