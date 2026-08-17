// ZoneDash ESP-NOW protocol — the single source of truth for the on-wire
// packet format shared by the brain (ESP32-S3) and the targets (ESP32-C3).
// Change here once; both builds pick it up.
#pragma once
#include <stddef.h> // size_t
#include <stdint.h>

namespace zd {

// Bump on any breaking layout change; both sides reject a mismatch.
constexpr uint8_t PROTOCOL_VERSION = 1;

// Physical target count — the largest active layout (4 corners + 4 mid-sides).
constexpr uint8_t MAX_TARGETS = 8;

// ESP-NOW radio channel both builds pin to, so brain and targets never have to
// negotiate one (architecture.md "channel discipline" — the mitigation for the
// S3's single shared radio). Change here once; both sides read it. Host-safe:
// a plain constant, no hardware include, so the native protocol tests still
// compile.
constexpr uint8_t ESPNOW_CHANNEL = 1;

// Which sensor registered a hit (logged so we can A/B ToF vs piezo on court).
enum class Sensor : uint8_t { ToF = 0, Piezo = 1 };

enum class MsgType : uint8_t {
  // Brain → target
  Sync = 1,    // clock-sync beacon at session start
  Arm = 2,     // "you are the current target" — start sensing
  Disarm = 3,  // clear / end
  Ping = 4,    // liveness / RSSI probe
  // Target → brain
  Hello = 10,   // pairing / health announce
  Pressed = 11, // a hit
  Ack = 12,
};

// Every packet starts with this so a receiver can dispatch before decoding.
struct __attribute__((packed)) Header {
  uint8_t version; // PROTOCOL_VERSION
  uint8_t type;    // MsgType
};

// ── Brain → target ──────────────────────────────────────
struct __attribute__((packed)) Sync {
  Header hdr;
  uint32_t session_id;
  uint64_t t_central_us; // central clock at send; target derives its offset
};

struct __attribute__((packed)) Arm {
  Header hdr;
  uint32_t session_id;
  uint8_t position; // logical slot in the active layout (0..N-1)
  uint16_t seq;     // step index within the drill
};

struct __attribute__((packed)) Disarm {
  Header hdr;
  uint32_t session_id;
};

// ── Target → brain ──────────────────────────────────────
struct __attribute__((packed)) Hello {
  Header hdr;
  uint8_t fw_version;
  uint16_t batt_mv;
};

struct __attribute__((packed)) Pressed {
  Header hdr;
  uint32_t session_id;
  uint8_t position;
  uint16_t seq;
  uint64_t t_hit_us; // in the central clock domain (after Sync)
  uint8_t sensor;    // Sensor
};

// Compile-time layout locks: size AND per-field offset of every packet are
// pinned here, so a field reorder, a same-size type swap, or a lost `packed`
// breaks the build instead of silently desyncing brain and target. (A size
// check alone would miss reordering two same-size fields.) Update a number here
// only when the wire format changes on purpose — and bump PROTOCOL_VERSION.
static_assert(sizeof(Header) == 2, "Header size changed");
static_assert(offsetof(Header, version) == 0, "Header layout changed");
static_assert(offsetof(Header, type) == 1, "Header layout changed");

static_assert(sizeof(Sync) == 14, "Sync size changed");
static_assert(offsetof(Sync, session_id) == 2, "Sync layout changed");
static_assert(offsetof(Sync, t_central_us) == 6, "Sync layout changed");

static_assert(sizeof(Arm) == 9, "Arm size changed");
static_assert(offsetof(Arm, session_id) == 2, "Arm layout changed");
static_assert(offsetof(Arm, position) == 6, "Arm layout changed");
static_assert(offsetof(Arm, seq) == 7, "Arm layout changed");

static_assert(sizeof(Disarm) == 6, "Disarm size changed");
static_assert(offsetof(Disarm, session_id) == 2, "Disarm layout changed");

static_assert(sizeof(Hello) == 5, "Hello size changed");
static_assert(offsetof(Hello, fw_version) == 2, "Hello layout changed");
static_assert(offsetof(Hello, batt_mv) == 3, "Hello layout changed");

static_assert(sizeof(Pressed) == 18, "Pressed size changed");
static_assert(offsetof(Pressed, session_id) == 2, "Pressed layout changed");
static_assert(offsetof(Pressed, position) == 6, "Pressed layout changed");
static_assert(offsetof(Pressed, seq) == 7, "Pressed layout changed");
static_assert(offsetof(Pressed, t_hit_us) == 9, "Pressed layout changed");
static_assert(offsetof(Pressed, sensor) == 17, "Pressed layout changed");

// ESP-NOW payloads cap at 250 bytes; the largest packet must stay well under.
static_assert(sizeof(Pressed) <= 250, "packet exceeds ESP-NOW payload cap");

// On-wire size for each message type; 0 = unknown (reject). Ping/Ack carry no
// payload structs yet (deferred to the recv path) — header-only for now.
inline size_t wire_size(MsgType t) {
  switch (t) {
    case MsgType::Sync:    return sizeof(Sync);
    case MsgType::Arm:     return sizeof(Arm);
    case MsgType::Disarm:  return sizeof(Disarm);
    case MsgType::Hello:   return sizeof(Hello);
    case MsgType::Pressed: return sizeof(Pressed);
    case MsgType::Ping:
    case MsgType::Ack:     return sizeof(Header);
  }
  return 0;
}

// Validate a received buffer before decoding: protocol version must match and
// `len` must cover the FULL packet for its type (not just the header), so a
// caller that decodes after a true return can never read out of bounds. An
// unknown type is rejected. One gate, used identically by brain and target.
inline bool peek_header(const uint8_t* buf, size_t len, MsgType& type) {
  if (buf == nullptr || len < sizeof(Header)) return false;
  if (buf[0] != PROTOCOL_VERSION) return false; // byte 0 is Header::version
  const MsgType t = static_cast<MsgType>(buf[1]); // byte 1 is Header::type
  const size_t need = wire_size(t);
  if (need == 0 || len < need) return false; // unknown type / truncated payload
  type = t;
  return true;
}

} // namespace zd
