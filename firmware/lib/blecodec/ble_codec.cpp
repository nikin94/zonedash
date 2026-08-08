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

// Little-endian writers, symmetric to the readers above — the encoders below put
// the same bytes the app's DataView reads back with `littleEndian = true`.
void wr_u16(uint8_t* p, uint16_t v) {
  p[0] = static_cast<uint8_t>(v & 0xFF);
  p[1] = static_cast<uint8_t>((v >> 8) & 0xFF);
}
void wr_u32(uint8_t* p, uint32_t v) {
  p[0] = static_cast<uint8_t>(v & 0xFF);
  p[1] = static_cast<uint8_t>((v >> 8) & 0xFF);
  p[2] = static_cast<uint8_t>((v >> 16) & 0xFF);
  p[3] = static_cast<uint8_t>((v >> 24) & 0xFF);
}
void wr_u64(uint8_t* p, uint64_t v) {
  for (int i = 0; i < 8; ++i) p[i] = static_cast<uint8_t>((v >> (8 * i)) & 0xFF);
}

// Status notification kinds (byte 1, after the version) — mirrors codec.ts
// StatusKind.
constexpr uint8_t STATUS_SESSION = 1;
constexpr uint8_t STATUS_PAIRING = 2;
constexpr uint8_t STATUS_PROGRESS = 3;
constexpr uint8_t STATUS_RESOLVED = 4;

constexpr uint8_t CURRENT_SPOT_NONE = 0xFF; // pairing: no spot prompted now
constexpr uint8_t FLAG_AWAITING = 1u << 0;  // pairing flags
constexpr uint8_t FLAG_DONE = 1u << 1;
constexpr uint8_t FLAG_MISS = 1u << 0;      // resolved / hit-record flags

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

size_t encode_status_session(BleSessionState state, uint8_t targets_online,
                             uint8_t* out, size_t cap) {
  if (out == nullptr || cap < 4) return 0;
  out[0] = STATUS_VERSION;
  out[1] = STATUS_SESSION;
  out[2] = static_cast<uint8_t>(state);
  out[3] = targets_online;
  return 4;
}

size_t encode_status_pairing(const PairingStatus& p, uint8_t* out, size_t cap) {
  // Every spot field must fit the active layout — never silently truncate a bad
  // value onto the wire (the same rule current_spot is held to, applied to its
  // neighbours: total, bound_count, and each bound spot).
  if (p.total > MAX_TARGETS) return 0;
  if (p.bound_count > MAX_TARGETS) return 0;
  // current_spot is -1 (none) or a real spot 0..MAX_TARGETS-1. Reject any other
  // negative: an unexpected -2/-100 must fail loud, not masquerade as "none".
  if (p.current_spot < -1 || p.current_spot >= MAX_TARGETS) return 0;
  const size_t n = 6 + p.bound_count;
  if (out == nullptr || cap < n) return 0;
  if (p.bound_count > 0 && p.bound_spots == nullptr) return 0;
  for (uint8_t i = 0; i < p.bound_count; ++i)
    if (p.bound_spots[i] >= MAX_TARGETS) return 0; // a bound spot off the layout

  out[0] = STATUS_VERSION;
  out[1] = STATUS_PAIRING;
  out[2] = p.total;
  out[3] = p.bound_count;
  out[4] = p.current_spot < 0 ? CURRENT_SPOT_NONE
                              : static_cast<uint8_t>(p.current_spot);
  out[5] = static_cast<uint8_t>((p.awaiting_confirm ? FLAG_AWAITING : 0) |
                                (p.done ? FLAG_DONE : 0));
  for (uint8_t i = 0; i < p.bound_count; ++i) out[6 + i] = p.bound_spots[i];
  return n;
}

size_t encode_status_progress(uint16_t seq, uint8_t position, uint8_t* out,
                              size_t cap) {
  if (out == nullptr || cap < 5) return 0;
  out[0] = STATUS_VERSION;
  out[1] = STATUS_PROGRESS;
  wr_u16(out + 2, seq);
  out[4] = position;
  return 5;
}

size_t encode_status_resolved(uint16_t seq, uint8_t position, bool miss,
                              uint32_t reaction_ms, uint8_t* out, size_t cap) {
  // 10 bytes: [ver, kind, seq(2), position, flags, reaction_ms(4)] — the u32 at
  // offset 6 spans bytes 6..9.
  if (out == nullptr || cap < 10) return 0;
  out[0] = STATUS_VERSION;
  out[1] = STATUS_RESOLVED;
  wr_u16(out + 2, seq);
  out[4] = position;
  out[5] = miss ? FLAG_MISS : 0;
  wr_u32(out + 6, reaction_ms);
  return 10;
}

size_t encode_results(const HitRecord* records, const Sensor* sensors,
                      uint16_t count, uint8_t* out, size_t cap) {
  const size_t n = results_size(count);
  if (out == nullptr || cap < n) return 0;
  if (count > 0 && (records == nullptr || sensors == nullptr)) return 0;

  out[0] = RESULTS_VERSION;
  wr_u16(out + 1, count);
  for (uint16_t i = 0; i < count; ++i) {
    uint8_t* r = out + RESULTS_HEADER_BYTES + static_cast<size_t>(i) * RESULTS_RECORD_BYTES;
    const HitRecord& h = records[i];
    wr_u16(r, h.seq);
    r[2] = h.position;
    wr_u64(r + 3, h.t_lit_us);
    wr_u64(r + 11, h.t_hit_us);
    wr_u32(r + 19, h.reaction_ms);
    wr_u32(r + 23, h.movement_ms);
    r[27] = h.miss ? FLAG_MISS : 0;
    r[28] = static_cast<uint8_t>(sensors[i]);
  }
  return n;
}

namespace {
// Usable notification payload at `mtu` — 0 when the MTU can't even fit the ATT
// overhead (a degenerate link the caller must not chunk over).
size_t frame_payload(size_t mtu) {
  return mtu > ATT_NOTIFY_OVERHEAD ? mtu - ATT_NOTIFY_OVERHEAD : 0;
}
} // namespace

size_t results_frame_count(size_t total_len, size_t mtu) {
  const size_t cap = frame_payload(mtu);
  if (cap == 0 || total_len == 0) return 0;
  return (total_len + cap - 1) / cap; // ceil-divide into full-payload slices
}

ResultsFrame results_frame(const uint8_t* buffer, size_t total_len, size_t mtu,
                           size_t index) {
  ResultsFrame f;
  const size_t cap = frame_payload(mtu);
  if (buffer == nullptr || cap == 0) return f;
  const size_t offset = index * cap;
  if (offset >= total_len) return f; // past the end (also catches total_len == 0)
  f.data = buffer + offset;
  const size_t rest = total_len - offset;
  f.len = rest < cap ? rest : cap; // the last frame is short
  return f;
}

} // namespace zd
