// Host tests for the pairing round (MAC→position map builder).
#include "pairing.h"

#include "../zd_test.h"

using namespace zd;
using Tap = PairingRound::Tap;

// Distinct sample MACs (double braces to satisfy -Wmissing-braces under -Werror).
static const Mac A{{0x01, 0, 0, 0, 0, 0x0A}};
static const Mac B{{0x02, 0, 0, 0, 0, 0x0B}};
static const Mac C{{0x03, 0, 0, 0, 0, 0x0C}};
static const Mac D{{0x04, 0, 0, 0, 0, 0x0D}};

// Confirm-bind a MAC to the current slot: two consecutive taps (Await, Bound).
static void bind(PairingRound& p, const Mac& m) {
  p.on_tap(m);
  p.on_tap(m);
}

// Prompts slots 0..N-1 in order; a slot only advances once the tap is confirmed.
static void test_prompts_in_order() {
  PairingRound p;
  p.begin(4);
  ZD_EQ(p.current_prompt(), 0);
  ZD_CHECK(p.on_tap(A) == Tap::Await); // first tap: candidate, not bound
  ZD_EQ(p.current_prompt(), 0);        // still slot 0
  ZD_CHECK(p.on_tap(A) == Tap::Bound); // confirm
  ZD_EQ(p.current_prompt(), 1);        // advanced
  bind(p, B);
  bind(p, C);
  ZD_EQ(p.current_prompt(), 3);
  ZD_CHECK(!p.done());
}

// Binds each confirmed MAC to its prompted slot; map lookups both directions.
static void test_binds_map() {
  PairingRound p;
  p.begin(4);
  bind(p, A);
  bind(p, B);
  bind(p, C);
  bind(p, D);
  const TargetMap& m = p.map();
  ZD_EQ(m.count, 4);
  ZD_EQ(m.position_of(A), 0);
  ZD_EQ(m.position_of(C), 2);
  Mac out;
  ZD_CHECK(m.mac_at(1, out) && out == B);
  ZD_CHECK(m.mac_at(3, out) && out == D);
  ZD_CHECK(!m.mac_at(4, out)); // out of range -> false, no silent zero-MAC
  ZD_EQ(m.position_of(Mac{{0xEE, 0, 0, 0, 0, 0}}), -1); // unknown MAC
}

// A single stray tap never binds — the robustness case: an unbound phantom
// (ball bounce / ToF ghost) taps once, then a different node confirms the slot.
static void test_stray_single_tap_no_bind() {
  PairingRound p;
  p.begin(3);
  ZD_CHECK(p.on_tap(A) == Tap::Await); // A becomes the candidate for slot 0
  ZD_CHECK(p.on_tap(B) == Tap::Await); // stray unbound B replaces it — no bind
  ZD_EQ(p.map().count, 0);             // nothing bound yet
  ZD_EQ(p.current_prompt(), 0);        // still on slot 0
  ZD_CHECK(p.on_tap(B) == Tap::Bound); // B confirms -> slot 0 is B, not A
  ZD_EQ(p.map().position_of(B), 0);
  ZD_EQ(p.map().position_of(A), -1);
}

// A re-tap of an already-bound target is ignored — no rebind, no advance.
static void test_ignores_retap() {
  PairingRound p;
  p.begin(3);
  bind(p, A); // A -> slot 0
  ZD_CHECK(p.on_tap(A) == Tap::Ignored); // A already bound: ignored
  ZD_EQ(p.current_prompt(), 1);          // still prompting slot 1
  ZD_EQ(p.map().count, 1);
  bind(p, B); // B -> slot 1
  ZD_EQ(p.map().position_of(B), 1);
}

// Completing the last slot ends the round; further taps are no-ops.
static void test_done() {
  PairingRound p;
  p.begin(2);
  bind(p, A);
  bind(p, B); // last slot bound -> done
  ZD_CHECK(p.done());
  ZD_EQ(p.current_prompt(), -1);
  ZD_CHECK(p.on_tap(C) == Tap::Ignored); // ignored after completion
  ZD_EQ(p.map().count, 2);
}

// Taps before begin() are ignored; the round is neither active nor done.
static void test_tap_before_begin() {
  PairingRound p;
  ZD_CHECK(p.on_tap(A) == Tap::Ignored);
  ZD_CHECK(!p.active());
  ZD_CHECK(!p.done());
  ZD_EQ(p.current_prompt(), -1);
}

// undo_last() unbinds the most recent slot and re-prompts it (operator fix).
// extend() grows a completed round without touching existing binds.
static void test_extend_keeps_binds() {
  PairingRound p;
  p.begin(2);
  bind(p, A);
  bind(p, B);
  ZD_CHECK(p.done());
  ZD_CHECK(p.extend(4)); // 2 bound + 2 more to go
  ZD_CHECK(p.active());
  ZD_CHECK(!p.done());
  ZD_EQ(p.current_prompt(), 2);
  ZD_EQ(p.map().position_of(A), 0); // existing binds untouched
  ZD_EQ(p.map().position_of(B), 1);
  bind(p, C);
  bind(p, D);
  ZD_CHECK(p.done());
  ZD_EQ(p.map().count, 4);
  ZD_EQ(p.map().position_of(D), 3);
}

// extend() also works mid-round, and refuses shrink / no-op / idle / overflow.
static void test_extend_guards() {
  PairingRound p;
  ZD_CHECK(!p.extend(4)); // idle — nothing to extend

  p.begin(3);
  bind(p, A);
  ZD_CHECK(p.extend(5));            // mid-round grow is fine
  ZD_EQ(p.current_prompt(), 1);     // prompt position unchanged
  ZD_CHECK(!p.extend(5));           // no-op refused
  ZD_CHECK(!p.extend(2));           // shrink refused
  ZD_CHECK(p.extend(200));          // clamped to MAX_TARGETS
  for (uint8_t i = 1; i < MAX_TARGETS; ++i) bind(p, Mac{{i, 9, 9, 9, 9, i}});
  ZD_CHECK(p.done());
  ZD_EQ(p.map().count, MAX_TARGETS);
}

// A pending (unconfirmed) candidate does not survive an extend.
static void test_extend_clears_candidate() {
  PairingRound p;
  p.begin(1);
  bind(p, A);
  p.extend(2);
  ZD_CHECK(p.on_tap(B) == PairingRound::Tap::Await); // fresh two-tap cycle
  ZD_CHECK(p.on_tap(B) == PairingRound::Tap::Bound);
}

// finish() ends a round early at the current bound count, keeping every bind.
static void test_finish_early() {
  PairingRound p;
  ZD_CHECK(!p.finish()); // idle — nothing to finish

  p.begin(8);
  ZD_CHECK(!p.finish()); // nothing bound yet
  bind(p, A);
  bind(p, B);
  ZD_CHECK(p.active());
  ZD_CHECK(p.finish());          // stop here at 2 of 8
  ZD_CHECK(p.done());
  ZD_CHECK(!p.active());
  ZD_EQ(p.map().count, 2);       // binds kept
  ZD_EQ(p.map().position_of(A), 0);
  ZD_EQ(p.map().position_of(B), 1);
  ZD_CHECK(!p.finish());         // already done — no-op
}

// finish() drops a pending (unconfirmed) candidate, like extend/undo.
static void test_finish_clears_candidate() {
  PairingRound p;
  p.begin(4);
  bind(p, A);
  ZD_CHECK(p.on_tap(B) == PairingRound::Tap::Await); // B is a candidate
  ZD_CHECK(p.finish());                              // stop at 1
  ZD_CHECK(p.done());
  ZD_EQ(p.map().count, 1);
  ZD_EQ(p.map().position_of(B), -1); // the candidate never bound
}

static void test_undo() {
  PairingRound p;
  p.begin(3);
  bind(p, A);
  bind(p, B);
  ZD_EQ(p.current_prompt(), 2);
  ZD_EQ(p.undo_last(), 1); // unbind B, back to prompting slot 1
  ZD_EQ(p.map().count, 1);
  ZD_EQ(p.map().position_of(B), -1);
  ZD_EQ(p.map().position_of(A), 0);
  bind(p, C); // slot 1 now C
  ZD_EQ(p.map().position_of(C), 1);
  p.undo_last(); // remove C
  p.undo_last(); // remove A
  ZD_EQ(p.map().count, 0);
  ZD_EQ(p.undo_last(), 0); // nothing bound: no-op, still prompting slot 0
}

// N is clamped to 1..MAX_TARGETS.
static void test_clamp() {
  PairingRound p;
  p.begin(0); // -> 1
  bind(p, A);
  ZD_CHECK(p.done());
  ZD_EQ(p.map().count, 1);

  p.begin(200); // -> MAX_TARGETS
  for (uint8_t i = 0; i < MAX_TARGETS; ++i)
    bind(p, Mac{{i, 0, 0, 0, 0, 0}});
  ZD_EQ(p.current_prompt(), -1);
  ZD_EQ(p.map().count, MAX_TARGETS);
  ZD_CHECK(p.done());
}

// begin() restarts cleanly, discarding a prior map and any pending candidate.
static void test_restart() {
  PairingRound p;
  p.begin(4);
  bind(p, A);
  p.on_tap(B);  // leave a pending (unconfirmed) candidate for slot 1
  p.begin(2);   // fresh round
  ZD_EQ(p.current_prompt(), 0);
  ZD_EQ(p.map().count, 0);
  ZD_EQ(p.map().position_of(A), -1);      // old binding gone
  ZD_CHECK(p.on_tap(B) == Tap::Await);    // stale candidate gone: B is fresh again
}

int main() {
  std::printf("pairing tests\n");
  ZD_RUN(test_prompts_in_order);
  ZD_RUN(test_binds_map);
  ZD_RUN(test_stray_single_tap_no_bind);
  ZD_RUN(test_ignores_retap);
  ZD_RUN(test_done);
  ZD_RUN(test_tap_before_begin);
  ZD_RUN(test_extend_keeps_binds);
  ZD_RUN(test_extend_guards);
  ZD_RUN(test_extend_clears_candidate);
  ZD_RUN(test_finish_early);
  ZD_RUN(test_finish_clears_candidate);
  ZD_RUN(test_undo);
  ZD_RUN(test_clamp);
  ZD_RUN(test_restart);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
