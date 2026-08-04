// Host tests for the ESP-NOW wire contract. The real lock is two-sided:
//  - compile time: size + per-field offset static_asserts in protocol.h;
//  - run time: golden expected-byte buffers below, which pin the exact on-wire
//    bytes (offsets AND little-endianness — both ESP32 chips are LE, and these
//    tests are what make that a checked contract instead of an assumption).
// A memcpy round-trip on one machine proves nothing (it passes under any
// layout), so encode/decode is verified against the golden bytes instead.
#include "protocol.h"

#include <cstring> // memcpy, memcmp

#include "../zd_test.h"

using namespace zd;

// Pressed carries the widest field mix. Golden wire image, little-endian:
//   [0]    version = 1
//   [1]    type    = 11 (Pressed)
//   [2:6]  session_id = 0xDEADBEEF
//   [6]    position   = 5
//   [7:9]  seq        = 4321 (0x10E1)
//   [9:17] t_hit_us   = 0x0123456789ABCDEF
//   [17]   sensor     = 1 (Piezo)
static const uint8_t PRESSED_WIRE[18] = {
    0x01, 0x0B,                                     // hdr
    0xEF, 0xBE, 0xAD, 0xDE,                         // session_id
    0x05,                                           // position
    0xE1, 0x10,                                     // seq
    0xEF, 0xCD, 0xAB, 0x89, 0x67, 0x45, 0x23, 0x01, // t_hit_us
    0x01,                                           // sensor
};

// Encoding a Pressed must produce exactly the golden bytes.
static void test_pressed_encodes_to_wire() {
  Pressed p{};
  p.hdr = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Pressed)};
  p.session_id = 0xDEADBEEF;
  p.position = 5;
  p.seq = 4321;
  p.t_hit_us = 0x0123456789ABCDEFull;
  p.sensor = static_cast<uint8_t>(Sensor::Piezo);

  uint8_t buf[sizeof(Pressed)];
  std::memcpy(buf, &p, sizeof(p));
  ZD_CHECK(std::memcmp(buf, PRESSED_WIRE, sizeof(PRESSED_WIRE)) == 0);
}

// Decoding the golden bytes must yield the exact field values.
static void test_pressed_decodes_from_wire() {
  Pressed p{};
  std::memcpy(&p, PRESSED_WIRE, sizeof(p));
  ZD_EQ(p.hdr.version, PROTOCOL_VERSION);
  ZD_EQ(p.hdr.type, static_cast<uint8_t>(MsgType::Pressed));
  ZD_EQ(p.session_id, 0xDEADBEEF);
  ZD_EQ(p.position, 5);
  ZD_EQ(p.seq, 4321);
  ZD_CHECK(p.t_hit_us == 0x0123456789ABCDEFull);
  ZD_EQ(p.sensor, static_cast<uint8_t>(Sensor::Piezo));
}

// Sync's 64-bit central clock is the timing anchor — pin its wire image too.
static void test_sync_wire_bytes() {
  static const uint8_t SYNC_WIRE[14] = {
      0x01, 0x01,                                     // hdr (version, Sync)
      0x07, 0x00, 0x00, 0x00,                         // session_id = 7
      0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, // t_central_us
  };
  Sync s{};
  s.hdr = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Sync)};
  s.session_id = 7;
  s.t_central_us = 0xFFFFFFFF00ull;

  uint8_t buf[sizeof(Sync)];
  std::memcpy(buf, &s, sizeof(s));
  ZD_CHECK(std::memcmp(buf, SYNC_WIRE, sizeof(SYNC_WIRE)) == 0);

  Sync r{};
  std::memcpy(&r, SYNC_WIRE, sizeof(r));
  ZD_EQ(r.session_id, 7);
  ZD_CHECK(r.t_central_us == 0xFFFFFFFF00ull);
}

// peek_header accepts a full well-formed packet and reports its type.
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
  uint8_t buf[sizeof(Hello)] = {static_cast<uint8_t>(PROTOCOL_VERSION + 1),
                                static_cast<uint8_t>(MsgType::Hello)};
  MsgType t = MsgType::Ping;
  ZD_CHECK(!peek_header(buf, sizeof(buf), t));
}

// A buffer too short to hold even a Header is rejected.
static void test_peek_truncated() {
  uint8_t one = PROTOCOL_VERSION;
  MsgType t = MsgType::Ping;
  ZD_CHECK(!peek_header(&one, 1, t));
  ZD_CHECK(!peek_header(nullptr, 0, t));
}

// A valid header whose buffer doesn't cover the typed payload is rejected —
// a true return must guarantee a full decode with no out-of-bounds read.
static void test_peek_truncated_typed() {
  uint8_t buf[3] = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Arm), 0x01};
  MsgType t = MsgType::Ping;
  ZD_CHECK(!peek_header(buf, sizeof(buf), t)); // Arm needs 9 bytes, got 3
  // One byte short of the full packet still fails; exact length passes.
  Arm a{};
  a.hdr = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Arm)};
  uint8_t full[sizeof(Arm)];
  std::memcpy(full, &a, sizeof(a));
  ZD_CHECK(!peek_header(full, sizeof(Arm) - 1, t));
  ZD_CHECK(peek_header(full, sizeof(Arm), t));
}

// An unknown message type is rejected even with a plausible length.
static void test_peek_unknown_type() {
  uint8_t buf[8] = {PROTOCOL_VERSION, 99};
  MsgType t = MsgType::Ping;
  ZD_CHECK(!peek_header(buf, sizeof(buf), t));
}

int main() {
  std::printf("protocol tests\n");
  ZD_RUN(test_pressed_encodes_to_wire);
  ZD_RUN(test_pressed_decodes_from_wire);
  ZD_RUN(test_sync_wire_bytes);
  ZD_RUN(test_peek_valid);
  ZD_RUN(test_peek_bad_version);
  ZD_RUN(test_peek_truncated);
  ZD_RUN(test_peek_truncated_typed);
  ZD_RUN(test_peek_unknown_type);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
