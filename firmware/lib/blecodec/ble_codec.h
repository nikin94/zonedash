// ZoneDash BLE Control-write decoder — the brain's receive path for commands
// the phone app writes to CHAR.control. It is the C++ MIRROR of the app encoder
// app/src/ble/codec.ts (encodeControl): the app turns a command into bytes, the
// brain turns those exact bytes back into a command here.
//
// The byte format is NOT defined here — it is defined once in codec.ts and
// pinned by the SHARED, language-neutral fixture docs/ble-vectors.json (the BLE
// analogue of protocol.h for ESP-NOW). This decoder's host test loads and
// asserts against that SAME file, so a byte edited in the fixture breaks both
// the app build and this build at once — the cross-language drift guard the
// monorepo exists for (docs/architecture.md "Byte-level wire format").
//
// Pure and host-testable: no Arduino, no BLE stack — bytes in, a command out.
// The concrete GATT server that hands these bytes to decode_control is brain
// firmware (still a TODO in src/brain/main.cpp).
#pragma once
#include <cstddef>
#include <cstdint>

#include "../engine/drill_engine.h" // DrillConfig / DrillMode (reused, not duplicated)
#include "../protocol/protocol.h"   // MAX_TARGETS — the same 1..8 target bound

namespace zd {

// Control wire-format revision — the leading byte of every write. Must match
// codec.ts CONTROL_VERSION; a decoder rejects a version it does not know so a
// stale app and a newer brain fail loud instead of misreading bytes.
constexpr uint8_t CONTROL_VERSION = 1;

// Control opcodes (byte 1, after the version). Mirrors codec.ts ControlOp — the
// numbers are the wire contract, keep them in lock-step.
enum class ControlOp : uint8_t {
  StartSession = 1,
  StopSession = 2,
  StartPairing = 3,   // payload: u8 N (targets to bind, 1..MAX_TARGETS)
  DumpResults = 4,
  LoadDrill = 5,      // payload: the DrillConfig blob (see codec.ts)
  SelectPairSpot = 6, // payload: u8 canonical court spot (0..MAX_TARGETS-1)
  ExtendPairing = 7,  // payload: u8 new total (1..MAX_TARGETS)
  UndoPairBind = 8,
  ArmLiveTarget = 9,  // payload: u8 live slot index (0..MAX_TARGETS-1)
  FinishPairing = 10,
};

// A decoded Control message. `op` selects which field carries the payload:
//   StartPairing / ExtendPairing -> num_targets
//   SelectPairSpot               -> spot
//   ArmLiveTarget                -> position
//   LoadDrill                    -> config (reuses the engine's DrillConfig, so
//                                   the brain can drive DrillEngine::start with
//                                   it directly)
//   the payload-less ops carry nothing.
struct ControlMsg {
  ControlOp op = ControlOp::StartSession;
  uint8_t num_targets = 0;
  uint8_t spot = 0;
  uint8_t position = 0;
  DrillConfig config;
};

// Decode a Control write into `out`. Returns false (leaving `out` unspecified)
// on any malformation — wrong version, unknown opcode, wrong length, an
// out-of-range field, or a path slot outside the active layout — mirroring the
// app encoder's "throw rather than put a wrong value on the wire". A false
// return means the brain drops the write, never acts on a half-decoded command.
bool decode_control(const uint8_t* bytes, size_t len, ControlMsg& out);

// ── Status / Results encoders (brain -> app) ────────────────────────────────
// The C++ MIRROR of the app decoders (codec.ts decodeStatus / decodeResults):
// the brain emits these exact bytes as GATT notifications, the app decodes them.
// Same shared-fixture pin — the host test builds each Status/Results vector's
// `event` / `records` from docs/ble-vectors.json, encodes it, and asserts the
// bytes equal that vector's `bytes`.
//
// Every encoder writes into a caller buffer and returns the number of bytes
// written, or 0 on failure (buffer too small, or an out-of-range field — the
// same "never put a wrong value on the wire" rule as the Control decoder). The
// caller sizes the buffer; the *_size helpers give the exact length up front.

// Status/Results wire revisions — the leading byte of every notification. Must
// match codec.ts STATUS_VERSION / RESULTS_VERSION; the app rejects a version it
// does not know. Independent of CONTROL_VERSION (separate characteristics).
constexpr uint8_t STATUS_VERSION = 1;
constexpr uint8_t RESULTS_VERSION = 1;

// The app-facing session state (idle/pairing/running/done) — NOT the engine's
// enum class State. The engine's Armed/Delaying/WaitOperator collapse to
// Running, and Pairing is a PairingRound phase the engine never sees; the brain
// synthesises this from both sources (see docs/architecture.md "BLE SessionState
// translation"). The wire byte IS this enum value; keep the order in lock-step
// with codec.ts SESSION_STATE.
enum class BleSessionState : uint8_t { Idle = 0, Pairing = 1, Running = 2, Done = 3 };

// One Results record on the wire is 29 bytes; the Results buffer is a 3-byte
// header (version + count u16) plus count records. Mirrors codec.ts.
constexpr size_t RESULTS_RECORD_BYTES = 29;
constexpr size_t RESULTS_HEADER_BYTES = 3;

// A pairing-round snapshot, as the brain notifies it. `bound_spots` are the
// canonical court spots bound so far (the brain maps slot -> spot); `current_spot`
// is the spot prompted now, or < 0 for none (encoded as 0xFF on the wire).
struct PairingStatus {
  uint8_t total = 0;
  const uint8_t* bound_spots = nullptr;
  uint8_t bound_count = 0;
  int current_spot = -1;
  bool awaiting_confirm = false;
  bool done = false;
};

// session:  [STATUS_VERSION, 1, state, targets_online]
size_t encode_status_session(BleSessionState state, uint8_t targets_online,
                             uint8_t* out, size_t cap);
// pairing:  [STATUS_VERSION, 2, total, bound_count, current(0xFF=none), flags, ...bound_spots]
size_t encode_status_pairing(const PairingStatus& p, uint8_t* out, size_t cap);
// progress: [STATUS_VERSION, 3, seq(u16), position]
size_t encode_status_progress(uint16_t seq, uint8_t position, uint8_t* out, size_t cap);
// resolved: [STATUS_VERSION, 4, seq(u16), position, flags(bit0 miss), reaction_ms(u32)]
size_t encode_status_resolved(uint16_t seq, uint8_t position, bool miss,
                              uint32_t reaction_ms, uint8_t* out, size_t cap);

// results:  [RESULTS_VERSION, count(u16), ...records]. Each record mirrors the
// engine HitRecord with the sensor the brain splices in from the ESP-NOW Pressed
// packet — records and sensors are passed in parallel (same length `count`).
// The transport chunks the returned buffer across notifications; this produces
// the single logical buffer. Returns 0 if `cap` can't hold the whole thing.
constexpr size_t results_size(uint16_t count) {
  return RESULTS_HEADER_BYTES + static_cast<size_t>(count) * RESULTS_RECORD_BYTES;
}
size_t encode_results(const HitRecord* records, const Sensor* sensors,
                      uint16_t count, uint8_t* out, size_t cap);

} // namespace zd
