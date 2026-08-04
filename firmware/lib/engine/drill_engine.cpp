#include "drill_engine.h"

namespace zd {

Action DrillEngine::start(const DrillConfig& cfg, uint64_t now, Rng rng) {
  cfg_ = cfg;
  rng_ = std::move(rng);
  state_ = State::Idle;
  seq_ = 0;
  last_pos_ = 0xFF;
  have_first_ = false;
  have_prev_hit_ = false;
  hits_.clear();
  end_us_ = now + static_cast<uint64_t>(cfg_.duration_ms) * 1000;

  if (cfg_.mode == DrillMode::Live) {
    state_ = State::WaitOperator; // operator arms the first target
    return {};
  }
  if (cfg_.mode == DrillMode::Path && cfg_.path.empty()) {
    state_ = State::Done;
    return {ActionType::Finished, 0, 0};
  }
  return arm_at(pick_next(), now);
}

Action DrillEngine::arm_at(uint8_t position, uint64_t now) {
  cur_pos_ = position;
  last_pos_ = position;
  t_lit_us_ = now;
  if (!have_first_) {
    first_lit_us_ = now;
    have_first_ = true;
  }
  state_ = State::Armed;
  return {ActionType::Arm, position, seq_};
}

Action DrillEngine::on_hit(uint8_t position, uint64_t now) {
  if (state_ != State::Armed) return {};   // nothing lit / not our phase
  if (position != cur_pos_) return {};     // only the armed target counts

  HitRecord h;
  h.seq = seq_;
  h.position = cur_pos_;
  h.t_lit_us = t_lit_us_;
  h.t_hit_us = now;
  h.reaction_ms = static_cast<uint32_t>((now - t_lit_us_) / 1000);
  h.movement_ms =
      have_prev_hit_ ? static_cast<uint32_t>((now - last_hit_us_) / 1000) : 0;
  hits_.push_back(h);
  last_hit_us_ = now;
  have_prev_hit_ = true;

  return advance_or_finish(now);
}

Action DrillEngine::advance_or_finish(uint64_t now) {
  seq_++;
  // Live is coach-in-the-loop: the engine never self-advances — it waits for the
  // operator's next set_next. This holds whether the step ended in a hit or a
  // timeout miss, so both paths funnel through here.
  if (cfg_.mode == DrillMode::Live) {
    state_ = State::WaitOperator;
    return {};
  }
  if (reached_end(now)) {
    state_ = State::Done;
    return {ActionType::Finished, 0, 0};
  }
  if (cfg_.delay_ms > 0) {
    state_ = State::Delaying;
    next_arm_us_ = now + static_cast<uint64_t>(cfg_.delay_ms) * 1000;
    return {};
  }
  return arm_at(pick_next(), now);
}

Action DrillEngine::poll(uint64_t now) {
  // Time-limit end wins whether we're armed or waiting between targets.
  if (cfg_.mode == DrillMode::TimeLimited &&
      (state_ == State::Armed || state_ == State::Delaying) &&
      now >= end_us_) {
    state_ = State::Done;
    return {ActionType::Finished, 0, 0};
  }
  if (state_ == State::Delaying && now >= next_arm_us_) {
    return arm_at(pick_next(), now);
  }
  if (state_ == State::Armed && cfg_.timeout_ms > 0 &&
      now - t_lit_us_ >= static_cast<uint64_t>(cfg_.timeout_ms) * 1000) {
    HitRecord h;
    h.seq = seq_;
    h.position = cur_pos_;
    h.t_lit_us = t_lit_us_;
    h.t_hit_us = 0;
    h.reaction_ms = cfg_.timeout_ms;
    h.miss = true;
    hits_.push_back(h);
    return advance_or_finish(now); // a miss still advances the drill
  }
  return {};
}

Action DrillEngine::set_next(uint8_t position, uint64_t now) {
  if (cfg_.mode != DrillMode::Live) return {};
  if (state_ != State::WaitOperator && state_ != State::Armed) return {};
  return arm_at(position, now);
}

Action DrillEngine::stop(uint64_t) {
  state_ = State::Done;
  return {ActionType::Finished, 0, 0};
}

uint8_t DrillEngine::pick_next() {
  if (cfg_.mode == DrillMode::Path) {
    return seq_ < cfg_.path.size() ? cfg_.path[seq_] : 0;
  }
  const uint8_t n = cfg_.num_positions ? cfg_.num_positions : 1;
  if (n <= 1) return 0; // can't avoid a repeat with one position
  uint8_t p = rng_ ? static_cast<uint8_t>(rng_() % n) : 0;
  if (!cfg_.allow_immediate_repeat && last_pos_ != 0xFF) {
    // Reroll off the last position; bounded, with a deterministic fallback so a
    // degenerate RNG can never spin forever.
    for (int i = 0; i < 8 && p == last_pos_; ++i)
      p = static_cast<uint8_t>((rng_ ? rng_() : 0) % n);
    if (p == last_pos_) p = static_cast<uint8_t>((last_pos_ + 1) % n);
  }
  return p;
}

bool DrillEngine::reached_end(uint64_t now) const {
  switch (cfg_.mode) {
    case DrillMode::Random:      return seq_ >= cfg_.count;
    case DrillMode::Path:        return seq_ >= cfg_.path.size();
    case DrillMode::TimeLimited: return now >= end_us_;
    default:                     return false; // Live never self-finishes
  }
}

DrillSummary DrillEngine::summary() const {
  DrillSummary s;
  uint64_t sum_r = 0;
  uint32_t best = 0xFFFFFFFF;
  uint64_t last_res = first_lit_us_;
  for (const auto& h : hits_) {
    if (h.miss) {
      s.misses++;
      continue;
    }
    s.hits++;
    sum_r += h.reaction_ms;
    if (h.reaction_ms < best) best = h.reaction_ms;
    if (h.t_hit_us > last_res) last_res = h.t_hit_us;
  }
  s.avg_reaction_ms = s.hits ? static_cast<uint32_t>(sum_r / s.hits) : 0;
  s.best_reaction_ms = s.hits ? best : 0;
  s.total_ms =
      have_first_ ? static_cast<uint32_t>((last_res - first_lit_us_) / 1000) : 0;
  return s;
}

} // namespace zd
