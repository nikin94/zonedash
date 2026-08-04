// Host tests for the ESP-NOW wire contract: round-trip encode/decode through a
// byte buffer (simulating a send/recv) and the header-peek dispatch guard.
// The size locks live as static_asserts in protocol.h — if they trip, this
// suite fails to compile, which is the point.
#include "protocol.h"

#include <cstring> // memcpy

#include "../zd_test.h"

using namespace zd;

// Serialize a struct to bytes and back — fields must survive the trip exactly.
template <typename T>
static T round_trip(const T& in) {
  uint8_t buf[sizeof(T)];
  std::memcpy(buf, &in, sizeof(T));
  T out;
  std::memcpy(&out, buf, sizeof(T));
  return out;
}

// Pressed carries the widest mix of fields (u64 timestamp + smaller ints);
// every field must come back byte-identical.
static void test_pressed_round_trip() {
  Pressed p{};
  p.hdr = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Pressed)};
  p.session_id = 0xDEADBEEF;
  p.position = 5;
  p.seq = 4321;
  p.t_hit_us = 0x0123456789ABCDEFull;
  p.sensor = static_cast<uint8_t>(Sensor::Piezo);

  Pressed q = round_trip(p);
  ZD_EQ(q.hdr.version, PROTOCOL_VERSION);
  ZD_EQ(q.hdr.type, static_cast<uint8_t>(MsgType::Pressed));
  ZD_EQ(q.session_id, 0xDEADBEEF);
  ZD_EQ(q.position, 5);
  ZD_EQ(q.seq, 4321);
  ZD_CHECK(q.t_hit_us == 0x0123456789ABCDEFull);
  ZD_EQ(q.sensor, static_cast<uint8_t>(Sensor::Piezo));
}

// Sync's 64-bit central clock must survive intact (this is the timing anchor).
static void test_sync_round_trip() {
  Sync s{};
  s.hdr = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Sync)};
  s.session_id = 7;
  s.t_central_us = 0xFFFFFFFF00ull;
  Sync r = round_trip(s);
  ZD_EQ(r.session_id, 7);
  ZD_CHECK(r.t_central_us == 0xFFFFFFFF00ull);
}

// peek_header accepts a well-formed buffer and reports its type before decode.
static void test_peek_valid() {
  Arm a{};
  a.hdr = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Arm)};
  a.session_id = 1;
  a.position = 2;
  a.seq = 3;
  uint8_t buf[sizeof(Arm)];
  std::memcpy(buf, &a, sizeof(a));

  MsgType t = MsgType::Ping;
  ZD_CHECK(peek_header(buf, sizeof(buf), t));
  ZD_CHECK(t == MsgType::Arm);
}

// A wrong protocol version is rejected — both sides refuse a mismatch.
static void test_peek_bad_version() {
  uint8_t buf[2] = {static_cast<uint8_t>(PROTOCOL_VERSION + 1),
                    static_cast<uint8_t>(MsgType::Hello)};
  MsgType t = MsgType::Ping;
  ZD_CHECK(!peek_header(buf, sizeof(buf), t));
}

// A buffer too short to hold a Header is rejected (no out-of-bounds read).
static void test_peek_truncated() {
  uint8_t one = PROTOCOL_VERSION;
  MsgType t = MsgType::Ping;
  ZD_CHECK(!peek_header(&one, 1, t));
  ZD_CHECK(!peek_header(nullptr, 0, t));
}

int main() {
  std::printf("protocol tests\n");
  ZD_RUN(test_pressed_round_trip);
  ZD_RUN(test_sync_round_trip);
  ZD_RUN(test_peek_valid);
  ZD_RUN(test_peek_bad_version);
  ZD_RUN(test_peek_truncated);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
