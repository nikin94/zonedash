// Tests for the drill engine — deterministic (injected RNG, caller-supplied
// time), so every run is repeatable. Covers all four modes plus the delay /
// no-repeat / timeout / summary behaviour.
#include "drill_engine.h"
#include "zd_test.h"

using namespace zd;

static constexpr uint64_t MS = 1000; // µs per ms

// A fixed-sequence RNG so target picks are predictable.
struct SeqRng {
  const uint32_t* vals;
  size_t n, i = 0;
  uint32_t operator()() { return vals[i++ % n]; }
};

// ── Random, count-limited ─────────────────────────────────────────
static void test_random_count() {
  DrillConfig c;
  c.mode = DrillMode::Random;
  c.num_positions = 4;
  c.count = 3;
  c.allow_immediate_repeat = true; // isolate: don't reroll here
  uint32_t seq[] = {0, 1, 2};
  SeqRng rng{seq, 3};

  DrillEngine e;
  Action a = e.start(c, 1000 * MS, [&] { return rng(); });
  ZD_CHECK(a.type == ActionType::Arm);
  ZD_EQ(a.position, 0);
  ZD_EQ(a.seq, 0);

  a = e.on_hit(0, 1200 * MS); // reaction 200ms
  ZD_CHECK(a.type == ActionType::Arm);
  ZD_EQ(a.position, 1);
  ZD_EQ(a.seq, 1);

  a = e.on_hit(1, 1500 * MS); // reaction 300ms, movement 300ms
  ZD_CHECK(a.type == ActionType::Arm);
  ZD_EQ(a.position, 2);

  a = e.on_hit(2, 1600 * MS); // 3rd hit -> finished
  ZD_CHECK(a.type == ActionType::Finished);
  ZD_CHECK(!e.running());

  ZD_EQ(e.hits().size(), 3);
  ZD_EQ(e.hits()[0].reaction_ms, 200);
  ZD_EQ(e.hits()[0].movement_ms, 0);   // first hit: no movement baseline
  ZD_EQ(e.hits()[1].movement_ms, 300); // 1500 - 1200
}

// ── Wrong-target hits are ignored (single-target arming) ──────────
static void test_ignores_wrong_target() {
  DrillConfig c;
  c.mode = DrillMode::Random;
  c.num_positions = 4;
  c.count = 2;
  c.allow_immediate_repeat = true;
  uint32_t seq[] = {0, 1};
  SeqRng rng{seq, 2};

  DrillEngine e;
  e.start(c, 0, [&] { return rng(); }); // arms position 0
  Action a = e.on_hit(3, 100 * MS);     // not the armed target
  ZD_CHECK(a.type == ActionType::None);
  ZD_EQ(e.hits().size(), 0);
  a = e.on_hit(0, 100 * MS); // correct target
  ZD_CHECK(a.type == ActionType::Arm);
}

// ── No immediate repeat: reroll off the last position ─────────────
static void test_no_repeat() {
  DrillConfig c;
  c.mode = DrillMode::Random;
  c.num_positions = 3;
  c.count = 4;
  c.allow_immediate_repeat = false;
  // RNG keeps returning 0; engine must break the tie so we never see the same
  // position twice running.
  uint32_t seq[] = {0};
  SeqRng rng{seq, 1};

  DrillEngine e;
  Action a = e.start(c, 0, [&] { return rng(); });
  uint8_t prev = a.position;
  uint64_t t = 0;
  for (int i = 0; i < 3; ++i) {
    t += 100 * MS;
    a = e.on_hit(prev, t);
    if (a.type == ActionType::Arm) {
      ZD_CHECK(a.position != prev); // never repeats
      prev = a.position;
    }
  }
}

// ── allow_immediate_repeat lets the same position recur ───────────
static void test_allow_repeat() {
  DrillConfig c;
  c.mode = DrillMode::Random;
  c.num_positions = 3;
  c.count = 2;
  c.allow_immediate_repeat = true;
  uint32_t seq[] = {1}; // always 1
  SeqRng rng{seq, 1};

  DrillEngine e;
  Action a = e.start(c, 0, [&] { return rng(); });
  ZD_EQ(a.position, 1);
  a = e.on_hit(1, 100 * MS);
  ZD_EQ(a.position, 1); // repeat allowed
}

// ── Delay: no arm until the gap elapses ───────────────────────────
static void test_delay() {
  DrillConfig c;
  c.mode = DrillMode::Random;
  c.num_positions = 4;
  c.count = 2;
  c.delay_ms = 500;
  c.allow_immediate_repeat = true;
  uint32_t seq[] = {0, 2};
  SeqRng rng{seq, 2};

  DrillEngine e;
  e.start(c, 0, [&] { return rng(); }); // arm 0
  Action a = e.on_hit(0, 1000 * MS);    // delaying, next at 1500ms
  ZD_CHECK(a.type == ActionType::None);
  ZD_CHECK(e.running());

  a = e.poll(1400 * MS); // too early
  ZD_CHECK(a.type == ActionType::None);
  a = e.poll(1500 * MS); // delay elapsed -> arm
  ZD_CHECK(a.type == ActionType::Arm);
  ZD_EQ(a.position, 2);
}

// ── Path: exact sequence, in order, finishes at the end ───────────
static void test_path() {
  DrillConfig c;
  c.mode = DrillMode::Path;
  c.path = {2, 0, 3};

  DrillEngine e;
  Action a = e.start(c, 0, nullptr); // Path needs no RNG
  ZD_EQ(a.position, 2);
  a = e.on_hit(2, 100 * MS);
  ZD_EQ(a.position, 0);
  a = e.on_hit(0, 200 * MS);
  ZD_EQ(a.position, 3);
  a = e.on_hit(3, 300 * MS);
  ZD_CHECK(a.type == ActionType::Finished);
  ZD_EQ(e.hits().size(), 3);
}

// ── Time-limited: keeps arming until the window ends ──────────────
static void test_time_limited() {
  DrillConfig c;
  c.mode = DrillMode::TimeLimited;
  c.num_positions = 4;
  c.duration_ms = 1000; // 1s window from start
  c.allow_immediate_repeat = true;
  uint32_t seq[] = {0, 1, 2, 3};
  SeqRng rng{seq, 4};

  DrillEngine e;
  e.start(c, 0, [&] { return rng(); }); // window ends at 1000ms
  Action a = e.on_hit(0, 300 * MS);
  ZD_CHECK(a.type == ActionType::Arm); // still time left
  a = e.on_hit(a.position, 900 * MS);
  ZD_CHECK(a.type == ActionType::Arm);
  a = e.poll(1000 * MS); // window closed
  ZD_CHECK(a.type == ActionType::Finished);
  ZD_EQ(e.hits().size(), 2);
}

// ── Timeout: a target auto-misses and the drill advances ──────────
static void test_timeout_miss() {
  DrillConfig c;
  c.mode = DrillMode::Random;
  c.num_positions = 4;
  c.count = 2;
  c.timeout_ms = 400;
  c.allow_immediate_repeat = true;
  uint32_t seq[] = {0, 1};
  SeqRng rng{seq, 2};

  DrillEngine e;
  e.start(c, 0, [&] { return rng(); }); // arm 0 at t=0
  Action a = e.poll(300 * MS);          // not yet timed out
  ZD_CHECK(a.type == ActionType::None);
  a = e.poll(400 * MS); // timeout -> miss, advance -> arm next
  ZD_CHECK(a.type == ActionType::Arm);
  ZD_EQ(e.hits().size(), 1);
  ZD_CHECK(e.hits()[0].miss);
  a = e.on_hit(a.position, 500 * MS); // 2nd step done -> finished
  ZD_CHECK(a.type == ActionType::Finished);

  DrillSummary s = e.summary();
  ZD_EQ(s.hits, 1);
  ZD_EQ(s.misses, 1);
}

// ── Live: operator drives each target; stop() finishes ────────────
static void test_live() {
  DrillConfig c;
  c.mode = DrillMode::Live;

  DrillEngine e;
  Action a = e.start(c, 0, nullptr);
  ZD_CHECK(a.type == ActionType::None); // waits for operator
  ZD_CHECK(e.running());

  a = e.set_next(2, 100 * MS);
  ZD_CHECK(a.type == ActionType::Arm);
  ZD_EQ(a.position, 2);
  ZD_EQ(a.seq, 0);

  a = e.on_hit(2, 300 * MS);
  ZD_CHECK(a.type == ActionType::None); // no auto-advance in Live

  a = e.set_next(5, 400 * MS);
  ZD_EQ(a.seq, 1); // seq advanced across hits
  ZD_EQ(a.position, 5);

  a = e.stop(600 * MS);
  ZD_CHECK(a.type == ActionType::Finished);
  ZD_EQ(e.hits().size(), 1);
}

// ── Summary: avg / best / total ───────────────────────────────────
static void test_summary() {
  DrillConfig c;
  c.mode = DrillMode::Path;
  c.path = {0, 1, 2};

  DrillEngine e;
  e.start(c, 1000 * MS, nullptr); // first lit at 1000ms
  e.on_hit(0, 1200 * MS);         // reaction 200
  e.on_hit(1, 1600 * MS);         // reaction 400
  e.on_hit(2, 1900 * MS);         // reaction 300

  DrillSummary s = e.summary();
  ZD_EQ(s.hits, 3);
  ZD_EQ(s.misses, 0);
  ZD_EQ(s.avg_reaction_ms, 300);  // (200+400+300)/3
  ZD_EQ(s.best_reaction_ms, 200);
  ZD_EQ(s.total_ms, 900);         // 1900 - 1000
}

int main() {
  std::printf("drill_engine tests\n");
  ZD_RUN(test_random_count);
  ZD_RUN(test_ignores_wrong_target);
  ZD_RUN(test_no_repeat);
  ZD_RUN(test_allow_repeat);
  ZD_RUN(test_delay);
  ZD_RUN(test_path);
  ZD_RUN(test_time_limited);
  ZD_RUN(test_timeout_miss);
  ZD_RUN(test_live);
  ZD_RUN(test_summary);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
