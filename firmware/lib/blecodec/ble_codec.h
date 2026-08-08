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

} // namespace zd
