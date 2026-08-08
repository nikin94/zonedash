#include "ble_codec.h"

namespace zd {
namespace {

// Little-endian readers — both the phone and the ESP32 brain are LE, like the
// ESP-NOW packets in protocol.h. Callers guarantee the bytes are in bounds.
uint16_t rd_u16(const uint8_t* p) {
  return static_cast<uint16_t>(p[0] | (static_cast<uint16_t>(p[1]) << 8));
}
uint32_t rd_u32(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

// LoadDrill blob layout (after the opcode byte), mirroring codec.ts DRILL_HEAD:
//   [0]     mode          [1]     num_positions
//   [2..3]  count u16     [4..7]  duration_ms u32
//   [8..11] delay_ms u32  [12..15] timeout_ms u32
//   [16]    flags (bit0 = allow_immediate_repeat)
//   [17]    path_len      [18..]  path (path_len entries)
constexpr size_t DRILL_HEAD = 18;
constexpr uint8_t FLAG_ALLOW_REPEAT = 1u << 0;

// mode byte -> DrillMode, matching the DrillMode enum declaration order used by
// codec.ts MODE_WIRE (Random 0, Path 1, Live 2, TimeLimited 3).
bool decode_mode(uint8_t v, DrillMode& out) {
  switch (v) {
    case 0: out = DrillMode::Random; return true;
    case 1: out = DrillMode::Path; return true;
    case 2: out = DrillMode::Live; return true;
    case 3: out = DrillMode::TimeLimited; return true;
    default: return false;
  }
}

// The LoadDrill payload begins at `p` (the byte after the opcode); `len` is the
// bytes remaining from there to the end of the write.
bool decode_drill(const uint8_t* p, size_t len, DrillConfig& c) {
  if (len < DRILL_HEAD) return false;
  if (!decode_mode(p[0], c.mode)) return false;

  const uint8_t num_positions = p[1];
  if (num_positions < 1 || num_positions > MAX_TARGETS) return false;
  c.num_positions = num_positions;

  c.count = rd_u16(p + 2);
  c.duration_ms = rd_u32(p + 4);
  c.delay_ms = rd_u32(p + 8);
  c.timeout_ms = rd_u32(p + 12);
  c.allow_immediate_repeat = (p[16] & FLAG_ALLOW_REPEAT) != 0;

  const uint8_t path_len = p[17];
  // The blob must be exactly its head plus its declared path — no trailing
  // bytes, no short buffer.
  if (len != DRILL_HEAD + path_len) return false;

  c.path.clear();
  for (uint8_t i = 0; i < path_len; ++i) {
    const uint8_t slot = p[DRILL_HEAD + i];
    // A slot outside the active layout would arm a target that isn't there.
    if (slot >= num_positions) return false;
    c.path.push_back(slot);
  }
  return true;
}

// Ops whose payload is a single u8 that names a target count (1..MAX_TARGETS).
bool decode_count_op(const uint8_t* bytes, size_t len, uint8_t& out) {
  if (len != 3) return false;
  const uint8_t n = bytes[2];
  if (n < 1 || n > MAX_TARGETS) return false;
  out = n;
  return true;
}

// Ops whose payload is a single u8 that names a slot index (0..MAX_TARGETS-1).
bool decode_slot_op(const uint8_t* bytes, size_t len, uint8_t& out) {
  if (len != 3) return false;
  const uint8_t s = bytes[2];
  if (s >= MAX_TARGETS) return false;
  out = s;
  return true;
}

} // namespace

bool decode_control(const uint8_t* bytes, size_t len, ControlMsg& out) {
  if (bytes == nullptr || len < 2) return false;
  if (bytes[0] != CONTROL_VERSION) return false;

  const auto op = static_cast<ControlOp>(bytes[1]);
  out.op = op;
  switch (op) {
    // Payload-less ops: exactly [version, opcode].
    case ControlOp::StartSession:
    case ControlOp::StopSession:
    case ControlOp::DumpResults:
    case ControlOp::UndoPairBind:
    case ControlOp::FinishPairing:
      return len == 2;

    case ControlOp::StartPairing:
    case ControlOp::ExtendPairing:
      return decode_count_op(bytes, len, out.num_targets);

    case ControlOp::SelectPairSpot:
      return decode_slot_op(bytes, len, out.spot);

    case ControlOp::ArmLiveTarget:
      return decode_slot_op(bytes, len, out.position);

    case ControlOp::LoadDrill:
      return decode_drill(bytes + 2, len - 2, out.config);

    default:
      return false; // unknown opcode
  }
}

} // namespace zd
