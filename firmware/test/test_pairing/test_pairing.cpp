// Host tests for the pairing round (MAC→position map builder).
#include "pairing.h"

#include "../zd_test.h"

using namespace zd;

// Distinct sample MACs (double braces to satisfy -Wmissing-braces under -Werror).
static const Mac A{{0x01, 0, 0, 0, 0, 0x0A}};
static const Mac B{{0x02, 0, 0, 0, 0, 0x0B}};
static const Mac C{{0x03, 0, 0, 0, 0, 0x0C}};
static const Mac D{{0x04, 0, 0, 0, 0, 0x0D}};

// Prompts slots 0..N-1 in order, one per tap.
static void test_prompts_in_order() {
  PairingRound p;
  p.begin(4);
  ZD_EQ(p.current_prompt(), 0);
  ZD_EQ(p.on_tap(A), 1);
  ZD_EQ(p.on_tap(B), 2);
  ZD_EQ(p.on_tap(C), 3);
  ZD_CHECK(!p.done());
}

// Binds each tapped MAC to its prompted slot; map lookups both directions.
static void test_binds_map() {
  PairingRound p;
  p.begin(4);
  p.on_tap(A);
  p.on_tap(B);
  p.on_tap(C);
  p.on_tap(D);
  const TargetMap& m = p.map();
  ZD_EQ(m.count, 4);
  ZD_EQ(m.position_of(A), 0);
  ZD_EQ(m.position_of(C), 2);
  ZD_CHECK(m.mac_at(1) == B);
  ZD_CHECK(m.mac_at(3) == D);
  ZD_EQ(m.position_of(Mac{{0xEE, 0, 0, 0, 0, 0}}), -1); // unknown MAC
}

// A stray re-tap of an already-bound target is ignored — no rebind, no advance.
static void test_ignores_retap() {
  PairingRound p;
  p.begin(3);
  ZD_EQ(p.on_tap(A), 1); // A -> slot 0
  ZD_EQ(p.on_tap(A), 1); // A again: still prompting slot 1
  ZD_EQ(p.map().count, 1);
  ZD_EQ(p.on_tap(B), 2); // B -> slot 1, advances normally
  ZD_EQ(p.map().count, 2);
}

// Completing the last slot ends the round; further taps are no-ops.
static void test_done() {
  PairingRound p;
  p.begin(2);
  p.on_tap(A);
  ZD_EQ(p.on_tap(B), -1); // last slot bound -> done
  ZD_CHECK(p.done());
  ZD_EQ(p.current_prompt(), -1);
  ZD_EQ(p.on_tap(C), -1); // ignored after completion
  ZD_EQ(p.map().count, 2);
}

// N is clamped to 1..MAX_TARGETS.
static void test_clamp() {
  PairingRound p;
  p.begin(0); // -> 1
  p.on_tap(A);
  ZD_CHECK(p.done());
  ZD_EQ(p.map().count, 1);

  p.begin(200); // -> MAX_TARGETS
  int prompt = 0;
  for (uint8_t i = 0; i < MAX_TARGETS; ++i)
    prompt = p.on_tap(Mac{{i, 0, 0, 0, 0, 0}});
  ZD_EQ(prompt, -1);
  ZD_EQ(p.map().count, MAX_TARGETS);
}

// begin() restarts cleanly, discarding a prior map.
static void test_restart() {
  PairingRound p;
  p.begin(4);
  p.on_tap(A);
  p.on_tap(B);
  p.begin(2); // fresh round
  ZD_EQ(p.current_prompt(), 0);
  ZD_EQ(p.map().count, 0);
  ZD_EQ(p.map().position_of(A), -1); // old binding gone
}

int main() {
  std::printf("pairing tests\n");
  ZD_RUN(test_prompts_in_order);
  ZD_RUN(test_binds_map);
  ZD_RUN(test_ignores_retap);
  ZD_RUN(test_done);
  ZD_RUN(test_clamp);
  ZD_RUN(test_restart);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
