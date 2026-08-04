// ZoneDash ESP-NOW protocol — the single source of truth for the on-wire
// packet format shared by the brain (ESP32-S3) and the targets (ESP32-C3).
// Change here once; both builds pick it up.
#pragma once
#include <stdint.h>

namespace zd {

// Bump on any breaking layout change; both sides reject a mismatch.
constexpr uint8_t PROTOCOL_VERSION = 1;

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

} // namespace zd
