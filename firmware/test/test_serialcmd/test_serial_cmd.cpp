// Host tests for the serial operator-command parser.
#include "serial_cmd.h"

#include "../zd_test.h"

using namespace zd;

static void test_empty_and_whitespace() {
  ZD_CHECK(parse_command("").type == CmdType::Empty);
  ZD_CHECK(parse_command("   \t  ").type == CmdType::Empty);
  ZD_CHECK(parse_command("").ok());
}

static void test_simple_verbs() {
  ZD_CHECK(parse_command("finish").type == CmdType::Finish);
  ZD_CHECK(parse_command("undo").type == CmdType::Undo);
  ZD_CHECK(parse_command("nodes").type == CmdType::Nodes);
  ZD_CHECK(parse_command("start").type == CmdType::Start);
  ZD_CHECK(parse_command("stop").type == CmdType::Stop);
  ZD_CHECK(parse_command("dump").type == CmdType::Dump);
  ZD_CHECK(parse_command("sync").type == CmdType::Sync);
  ZD_CHECK(parse_command("start").ok());
}

static void test_pair() {
  auto c = parse_command("pair 8");
  ZD_CHECK(c.type == CmdType::Pair);
  ZD_CHECK(c.ok());
  ZD_EQ(c.num_positions, 8);
  ZD_CHECK(parse_command("PAIR 4").ok()); // case-insensitive
  // N is mandatory and range-checked — no hidden fallback.
  ZD_CHECK(parse_command("pair").type == CmdType::Pair);
  ZD_CHECK(!parse_command("pair").ok());   // missing N
  ZD_CHECK(!parse_command("pair 0").ok()); // N too small
  ZD_CHECK(!parse_command("pair 9").ok()); // N too big (> MAX_TARGETS)
  ZD_CHECK(!parse_command("pair x").ok()); // not a number
}

// `extend N` grows the round keeping binds (PairingRound::extend / BLE ExtendPairing).
static void test_extend() {
  auto c = parse_command("extend 6");
  ZD_CHECK(c.type == CmdType::Extend);
  ZD_CHECK(c.ok());
  ZD_EQ(c.num_positions, 6);
  ZD_CHECK(parse_command("EXTEND 3").ok());  // case-insensitive
  ZD_CHECK(!parse_command("extend").ok());   // missing N
  ZD_CHECK(!parse_command("extend 1").ok()); // grow target must be >= 2
  ZD_CHECK(!parse_command("extend 9").ok()); // > MAX_TARGETS
  ZD_CHECK(!parse_command("extend x").ok()); // not a number
}

// `spot S` picks the court spot for the next bind (BLE: SelectPairSpot).
static void test_spot() {
  auto c = parse_command("spot 5");
  ZD_CHECK(c.type == CmdType::Spot);
  ZD_CHECK(c.ok());
  ZD_EQ(c.spot, 5);
  ZD_CHECK(parse_command("SPOT 0").ok()); // case-insensitive, 0 is valid
  ZD_CHECK(!parse_command("spot").ok());   // missing S
  ZD_CHECK(!parse_command("spot 8").ok()); // >= MAX_TARGETS
  ZD_CHECK(!parse_command("spot x").ok()); // not a number
}

// `next S` arms slot S as the live next target (BLE: ArmLiveTarget / set_next).
static void test_next() {
  auto c = parse_command("next 3");
  ZD_CHECK(c.type == CmdType::Next);
  ZD_CHECK(c.ok());
  ZD_EQ(c.position, 3);
  ZD_CHECK(parse_command("NEXT 0").ok()); // case-insensitive, 0 is valid
  ZD_CHECK(!parse_command("next").ok());   // missing S
  ZD_CHECK(!parse_command("next 8").ok()); // >= MAX_TARGETS
  ZD_CHECK(!parse_command("next x").ok()); // not a number
}

static void test_case_and_whitespace_tolerant() {
  ZD_CHECK(parse_command("START").type == CmdType::Start);
  ZD_CHECK(parse_command("  Stop  ").type == CmdType::Stop);
  auto c = parse_command("  drill   4   rand  ");
  ZD_CHECK(c.ok());
  ZD_EQ(c.drill.num_positions, 4);
}

static void test_unknown() {
  auto c = parse_command("frobnicate 1 2");
  ZD_CHECK(c.type == CmdType::Unknown);
  ZD_CHECK(!c.ok());
}

static void test_drill_random_defaults() {
  auto c = parse_command("drill 4 rand");
  ZD_CHECK(c.ok());
  ZD_CHECK(c.type == CmdType::Drill);
  ZD_CHECK(c.drill.mode == DrillMode::Random);
  ZD_EQ(c.drill.num_positions, 4);
  ZD_EQ(c.drill.count, 10);   // unchanged default
  ZD_CHECK(!c.drill.allow_immediate_repeat);
}

static void test_drill_random_params() {
  auto c = parse_command("drill 6 rand count=20 delay=500 timeout=1500 repeat");
  ZD_CHECK(c.ok());
  ZD_EQ(c.drill.num_positions, 6);
  ZD_EQ(c.drill.count, 20);
  ZD_EQ(c.drill.delay_ms, 500);
  ZD_EQ(c.drill.timeout_ms, 1500);
  ZD_CHECK(c.drill.allow_immediate_repeat);
}

static void test_drill_path_explicit() {
  auto c = parse_command("drill 6 path 0,3,5,1");
  ZD_CHECK(c.ok());
  ZD_CHECK(c.drill.mode == DrillMode::Path);
  ZD_EQ(c.drill.path.size(), 4);
  ZD_EQ(c.drill.path[0], 0);
  ZD_EQ(c.drill.path[3], 1);
}

static void test_drill_path_shorthand() {
  auto c = parse_command("drill 6 0,3,5,1");
  ZD_CHECK(c.ok());
  ZD_CHECK(c.drill.mode == DrillMode::Path);
  ZD_EQ(c.drill.path.size(), 4);
}

static void test_drill_live_and_time() {
  auto live = parse_command("drill 8 live");
  ZD_CHECK(live.ok());
  ZD_CHECK(live.drill.mode == DrillMode::Live);

  auto tl = parse_command("drill 5 time dur=30000");
  ZD_CHECK(tl.ok());
  ZD_CHECK(tl.drill.mode == DrillMode::TimeLimited);
  ZD_EQ(tl.drill.duration_ms, 30000);
}

static void test_drill_errors() {
  ZD_CHECK(!parse_command("drill").ok());              // missing args
  ZD_CHECK(!parse_command("drill 4").ok());            // missing mode
  ZD_CHECK(!parse_command("drill 0 rand").ok());       // N too small
  ZD_CHECK(!parse_command("drill 9 rand").ok());       // N too big
  ZD_CHECK(!parse_command("drill 4 rand count=x").ok()); // bad number
  ZD_CHECK(!parse_command("drill 4 rand count=70000").ok()); // count > uint16 max
  ZD_CHECK(!parse_command("drill 4 rand bogus").ok());   // bad param
  ZD_CHECK(!parse_command("drill 4 path 0,9,2").ok());   // position >= N
  ZD_CHECK(!parse_command("drill 4 wobble").ok());       // unknown mode
  // Errors keep the Drill type for context.
  ZD_CHECK(parse_command("drill 9 rand").type == CmdType::Drill);
}

static void test_sensor() {
  auto tof = parse_command("sensor tof");
  ZD_CHECK(tof.ok());
  ZD_CHECK(tof.type == CmdType::Sensor);
  ZD_CHECK(tof.sensor == Sensor::ToF);

  auto pz = parse_command("sensor PIEZO");
  ZD_CHECK(pz.ok());
  ZD_CHECK(pz.sensor == Sensor::Piezo);

  ZD_CHECK(!parse_command("sensor").ok());        // missing arg
  ZD_CHECK(!parse_command("sensor laser").ok());  // bad arg
}

int main() {
  std::printf("serial_cmd tests\n");
  ZD_RUN(test_empty_and_whitespace);
  ZD_RUN(test_simple_verbs);
  ZD_RUN(test_pair);
  ZD_RUN(test_extend);
  ZD_RUN(test_spot);
  ZD_RUN(test_next);
  ZD_RUN(test_case_and_whitespace_tolerant);
  ZD_RUN(test_unknown);
  ZD_RUN(test_drill_random_defaults);
  ZD_RUN(test_drill_random_params);
  ZD_RUN(test_drill_path_explicit);
  ZD_RUN(test_drill_path_shorthand);
  ZD_RUN(test_drill_live_and_time);
  ZD_RUN(test_drill_errors);
  ZD_RUN(test_sensor);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
