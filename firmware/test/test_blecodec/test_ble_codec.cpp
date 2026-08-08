// Host tests for the BLE Control decoder — the brain's mirror of the app
// encoder (app/src/ble/codec.ts encodeControl).
//
// The golden vectors are NOT written here: the test loads the SHARED fixture
// docs/ble-vectors.json — the same file app/src/ble/codec.test.ts asserts
// against — and decodes each `control` vector's bytes, checking the result
// matches that vector's `message`. So editing a byte in the fixture breaks THIS
// build and the app build together: the cross-language pin, exactly as
// protocol.h + static_assert pins the ESP-NOW packets. (Verified by hand: flip a
// byte in the fixture and this suite fails.)
//
// The fixture path defaults to ../docs/ble-vectors.json — run_native.sh runs the
// binary from firmware/, so that resolves to the repo-root docs/. Pass a path as
// argv[1] to override.
#include "ble_codec.h"

#include <string>

#include "../zd_test.h"
#include "json.h"

using namespace zd;
using zdjson::Value;

static const char* g_fixture_path = "../docs/ble-vectors.json";

// message.op -> ControlOp (the wire number IS the enum value).
static ControlOp op_of(const Value& message) {
  return static_cast<ControlOp>(message["op"].as_int());
}

static std::vector<uint8_t> bytes_of(const Value& vec) {
  std::vector<uint8_t> out;
  for (const Value& n : vec["bytes"].as_array())
    out.push_back(static_cast<uint8_t>(n.as_int()));
  return out;
}

static DrillMode mode_of(const std::string& m) {
  if (m == "random") return DrillMode::Random;
  if (m == "path") return DrillMode::Path;
  if (m == "live") return DrillMode::Live;
  if (m == "time") return DrillMode::TimeLimited;
  Value::fail("unknown drill mode in fixture");
}

// Build the DrillConfig a vector's `message.config` describes, starting from the
// struct defaults so an omitted field expects the SAME default the app encoder
// wrote onto the wire (count 10, duration 60000, delay 0, timeout 0).
static DrillConfig expected_config(const Value& cfg) {
  DrillConfig c; // struct member defaults mirror codec.ts's `?? default`
  c.mode = mode_of(cfg["mode"].as_string());
  c.num_positions = static_cast<uint8_t>(cfg["numPositions"].as_int());
  if (cfg.has("count")) c.count = static_cast<uint16_t>(cfg["count"].as_int());
  if (cfg.has("durationMs")) c.duration_ms = cfg["durationMs"].as_uint32();
  if (cfg.has("delayMs")) c.delay_ms = cfg["delayMs"].as_uint32();
  if (cfg.has("timeoutMs")) c.timeout_ms = cfg["timeoutMs"].as_uint32();
  if (cfg.has("allowImmediateRepeat"))
    c.allow_immediate_repeat = cfg["allowImmediateRepeat"].as_bool();
  if (cfg.has("path")) {
    c.path.clear();
    for (const Value& p : cfg["path"].as_array())
      c.path.push_back(static_cast<uint8_t>(p.as_int()));
  }
  return c;
}

// Decode every `control` vector in the shared fixture and assert the decoded
// command equals that vector's `message`. This is the cross-language pin.
static void test_control_golden_vectors() {
  Value root = zdjson::parse_file(g_fixture_path);

  // The fixture carries its own version; it must agree with the decoder, or the
  // pin and the code have already drifted.
  ZD_EQ(root["controlVersion"].as_int(), CONTROL_VERSION);

  // Guard the pin against drift-by-deletion: an emptied (or silently shrunk)
  // `control` array would let the loop below run zero assertions and pass
  // vacuously. Pin catches a byte edit; this pins coverage itself. Bump the
  // floor when vectors are added on purpose.
  const zdjson::Array& control = root["control"].as_array();
  ZD_CHECK(control.size() >= 12);

  for (const Value& v : control) {
    const std::vector<uint8_t> bytes = bytes_of(v);
    const Value& message = v["message"];
    const ControlOp op = op_of(message);

    ControlMsg msg;
    const bool ok = decode_control(bytes.data(), bytes.size(), msg);
    ZD_CHECK(ok);
    if (!ok) continue;

    ZD_EQ(static_cast<int>(msg.op), static_cast<int>(op));

    switch (op) {
      case ControlOp::StartPairing:
      case ControlOp::ExtendPairing:
        ZD_EQ(msg.num_targets, message["numTargets"].as_int());
        break;
      case ControlOp::SelectPairSpot:
        ZD_EQ(msg.spot, message["spot"].as_int());
        break;
      case ControlOp::ArmLiveTarget:
        ZD_EQ(msg.position, message["position"].as_int());
        break;
      case ControlOp::LoadDrill: {
        const DrillConfig want = expected_config(message["config"]);
        ZD_EQ(static_cast<int>(msg.config.mode), static_cast<int>(want.mode));
        ZD_EQ(msg.config.num_positions, want.num_positions);
        ZD_EQ(msg.config.count, want.count);
        ZD_EQ(msg.config.duration_ms, want.duration_ms);
        ZD_EQ(msg.config.delay_ms, want.delay_ms);
        ZD_EQ(msg.config.timeout_ms, want.timeout_ms);
        ZD_EQ(msg.config.allow_immediate_repeat, want.allow_immediate_repeat);
        ZD_EQ(msg.config.path.size(), want.path.size());
        for (size_t i = 0; i < want.path.size() && i < msg.config.path.size(); ++i)
          ZD_EQ(msg.config.path[i], want.path[i]);
        break;
      }
      default:
        break; // payload-less ops: the op check above is the whole contract
    }
  }
}

// ── Behaviour: rejects (mirror the app encoder's "throw, don't put a wrong
// value on the wire" — the brain drops a malformed write, never half-acts) ──

static void test_rejects_bad_frames() {
  ControlMsg m;
  // A version the decoder doesn't know.
  const uint8_t bad_version[] = {2, 1};
  ZD_CHECK(!decode_control(bad_version, sizeof(bad_version), m));
  // An unknown opcode.
  const uint8_t unknown_op[] = {CONTROL_VERSION, 99};
  ZD_CHECK(!decode_control(unknown_op, sizeof(unknown_op), m));
  // Too short to hold even version + opcode; and a null buffer.
  const uint8_t one[] = {CONTROL_VERSION};
  ZD_CHECK(!decode_control(one, sizeof(one), m));
  ZD_CHECK(!decode_control(nullptr, 0, m));
  // A payload-less op that carries a stray payload byte.
  const uint8_t start_with_junk[] = {CONTROL_VERSION, 1, 7};
  ZD_CHECK(!decode_control(start_with_junk, sizeof(start_with_junk), m));
  // A one-byte-payload op that is missing its payload.
  const uint8_t pair_no_arg[] = {CONTROL_VERSION, 3};
  ZD_CHECK(!decode_control(pair_no_arg, sizeof(pair_no_arg), m));
}

static void test_rejects_out_of_range() {
  ControlMsg m;
  // num_targets must be 1..MAX_TARGETS.
  const uint8_t too_many[] = {CONTROL_VERSION, 3, MAX_TARGETS + 1};
  ZD_CHECK(!decode_control(too_many, sizeof(too_many), m));
  const uint8_t zero_targets[] = {CONTROL_VERSION, 3, 0};
  ZD_CHECK(!decode_control(zero_targets, sizeof(zero_targets), m));
  // spot / position must be 0..MAX_TARGETS-1.
  const uint8_t spot_oob[] = {CONTROL_VERSION, 6, MAX_TARGETS};
  ZD_CHECK(!decode_control(spot_oob, sizeof(spot_oob), m));
}

static void test_rejects_bad_drill_blob() {
  ControlMsg m;
  // A LoadDrill blob one byte short of the 18-byte head.
  uint8_t short_blob[2 + 17] = {CONTROL_VERSION, 5};
  ZD_CHECK(!decode_control(short_blob, sizeof(short_blob), m));

  // A well-formed head (path mode, num_positions 4) whose path_len says 1 but
  // whose single slot (4) is outside the active layout [0,3].
  uint8_t bad_path[2 + 18 + 1] = {0};
  bad_path[0] = CONTROL_VERSION;
  bad_path[1] = 5;      // LoadDrill
  bad_path[2] = 1;      // mode: path
  bad_path[3] = 4;      // num_positions
  bad_path[2 + 17] = 1; // path_len = 1
  bad_path[2 + 18] = 4; // slot 4 — out of [0,3]
  ZD_CHECK(!decode_control(bad_path, sizeof(bad_path), m));

  // Same head, but the buffer omits the byte its path_len promises.
  uint8_t truncated_path[2 + 18] = {0};
  truncated_path[0] = CONTROL_VERSION;
  truncated_path[1] = 5;
  truncated_path[2] = 1;
  truncated_path[3] = 4;
  truncated_path[2 + 17] = 1; // path_len = 1, but no slot byte follows
  ZD_CHECK(!decode_control(truncated_path, sizeof(truncated_path), m));

  // An unknown mode byte.
  uint8_t bad_mode[2 + 18] = {0};
  bad_mode[0] = CONTROL_VERSION;
  bad_mode[1] = 5;
  bad_mode[2] = 9; // no such DrillMode
  bad_mode[3] = 4;
  ZD_CHECK(!decode_control(bad_mode, sizeof(bad_mode), m));
}

// ── Status / Results ENCODE (brain -> app) against the same fixture ──────────
// The mirror direction of the app decoders: build each vector's `event` /
// `records` into the brain-side inputs, encode, and assert the bytes equal the
// vector's `bytes`. Same cross-language pin, encode side.

// Assert an encoder wrote exactly `want`.
static void expect_bytes(const char* name, const uint8_t* got, size_t got_len,
                         const std::vector<uint8_t>& want) {
  ZD_EQ(got_len, want.size());
  bool eq = got_len == want.size();
  for (size_t i = 0; eq && i < want.size(); ++i)
    if (got[i] != want[i]) eq = false;
  ZD_CHECK(eq);
  if (!eq) std::printf("    %s: encoded bytes differ from fixture\n", name);
}

static BleSessionState session_state_of(const std::string& s) {
  if (s == "idle") return BleSessionState::Idle;
  if (s == "pairing") return BleSessionState::Pairing;
  if (s == "running") return BleSessionState::Running;
  if (s == "done") return BleSessionState::Done;
  Value::fail("unknown session state in fixture");
}

static Sensor sensor_of(const std::string& s) {
  if (s == "tof") return Sensor::ToF;
  if (s == "piezo") return Sensor::Piezo;
  Value::fail("unknown sensor in fixture");
}

// Encode every `status` vector from its `event` and assert it matches `bytes`.
static void test_status_golden_vectors() {
  Value root = zdjson::parse_file(g_fixture_path);
  ZD_EQ(root["statusVersion"].as_int(), STATUS_VERSION);

  const zdjson::Array& vecs = root["status"].as_array();
  // Coverage floor: an emptied/shrunk array would run zero asserts and pass
  // vacuously — the pin must catch dropped vectors, not only edited bytes.
  ZD_CHECK(vecs.size() >= 7);

  uint8_t buf[64];
  for (const Value& v : vecs) {
    const std::vector<uint8_t> want = bytes_of(v);
    const Value& e = v["event"];
    const std::string& kind = e["kind"].as_string();
    size_t n = 0;

    if (kind == "session") {
      n = encode_status_session(session_state_of(e["state"].as_string()),
                                static_cast<uint8_t>(e["targetsOnline"].as_int()),
                                buf, sizeof(buf));
    } else if (kind == "pairing") {
      const Value& pr = e["progress"];
      std::vector<uint8_t> spots;
      for (const Value& s : pr["boundSpots"].as_array())
        spots.push_back(static_cast<uint8_t>(s.as_int()));
      PairingStatus p;
      p.total = static_cast<uint8_t>(pr["total"].as_int());
      p.bound_spots = spots.data();
      p.bound_count = static_cast<uint8_t>(spots.size());
      p.current_spot = pr["currentSpot"].is_null() ? -1 : pr["currentSpot"].as_int();
      p.awaiting_confirm = pr["awaitingConfirm"].as_bool();
      p.done = pr["done"].as_bool();
      n = encode_status_pairing(p, buf, sizeof(buf));
    } else if (kind == "progress") {
      n = encode_status_progress(static_cast<uint16_t>(e["seq"].as_int()),
                                 static_cast<uint8_t>(e["position"].as_int()),
                                 buf, sizeof(buf));
    } else if (kind == "resolved") {
      n = encode_status_resolved(static_cast<uint16_t>(e["seq"].as_int()),
                                 static_cast<uint8_t>(e["position"].as_int()),
                                 e["miss"].as_bool(), e["reactionMs"].as_uint32(),
                                 buf, sizeof(buf));
    } else {
      Value::fail("unknown status kind in fixture");
    }
    expect_bytes(v["name"].as_string().c_str(), buf, n, want);
  }
}

// Encode every `results` vector from its `records` and assert it matches `bytes`.
static void test_results_golden_vectors() {
  Value root = zdjson::parse_file(g_fixture_path);
  ZD_EQ(root["resultsVersion"].as_int(), RESULTS_VERSION);

  const zdjson::Array& vecs = root["results"].as_array();
  ZD_CHECK(vecs.size() >= 4); // coverage floor (see status)

  for (const Value& v : vecs) {
    const std::vector<uint8_t> want = bytes_of(v);
    std::vector<HitRecord> records;
    std::vector<Sensor> sensors;
    for (const Value& r : v["records"].as_array()) {
      HitRecord h;
      h.seq = static_cast<uint16_t>(r["seq"].as_int());
      h.position = static_cast<uint8_t>(r["position"].as_int());
      h.t_lit_us = r["tLitUs"].as_uint64();
      h.t_hit_us = r["tHitUs"].as_uint64();
      h.reaction_ms = r["reactionMs"].as_uint32();
      h.movement_ms = r["movementMs"].as_uint32();
      h.miss = r["miss"].as_bool();
      records.push_back(h);
      sensors.push_back(sensor_of(r["sensor"].as_string()));
    }
    const uint16_t count = static_cast<uint16_t>(records.size());
    std::vector<uint8_t> buf(results_size(count));
    const size_t n = encode_results(records.data(), sensors.data(), count,
                                    buf.data(), buf.size());
    expect_bytes(v["name"].as_string().c_str(), buf.data(), n, want);
  }
}

// Encoders refuse an oversized field / undersized buffer rather than truncating
// — the encode-side of "never put a wrong value on the wire".
static void test_encoders_reject_bad_input() {
  uint8_t buf[64];
  // Buffer too small for even the fixed heads.
  ZD_EQ(encode_status_session(BleSessionState::Idle, 0, buf, 3), 0);
  ZD_EQ(encode_status_progress(0, 0, buf, 4), 0);
  ZD_EQ(encode_status_resolved(0, 0, false, 0, buf, 8), 0);
  // Pairing: a current_spot outside the layout, and a buffer one byte short.
  const uint8_t spots[2] = {0, 2};
  PairingStatus bad_spot;
  bad_spot.total = 3;
  bad_spot.bound_spots = spots;
  bad_spot.bound_count = 2;
  bad_spot.current_spot = MAX_TARGETS; // out of 0..7
  ZD_EQ(encode_status_pairing(bad_spot, buf, sizeof(buf)), 0);
  PairingStatus ok = bad_spot;
  ok.current_spot = 1;
  ZD_EQ(encode_status_pairing(ok, buf, 7), 0);          // needs 6 + 2 = 8
  ZD_EQ(encode_status_pairing(ok, buf, 8), 8);          // exact fit passes
  // An unexpected negative current_spot (not the -1 sentinel) is rejected, not
  // silently coded as "none".
  PairingStatus neg = ok;
  neg.current_spot = -2;
  ZD_EQ(encode_status_pairing(neg, buf, sizeof(buf)), 0);
  // total and each bound spot are gated the same as current_spot.
  PairingStatus big_total = ok;
  big_total.total = MAX_TARGETS + 1;
  ZD_EQ(encode_status_pairing(big_total, buf, sizeof(buf)), 0);
  const uint8_t off_layout[2] = {0, MAX_TARGETS}; // spot 8 is off the layout
  PairingStatus bad_bound = ok;
  bad_bound.bound_spots = off_layout;
  ZD_EQ(encode_status_pairing(bad_bound, buf, sizeof(buf)), 0);
  // Results: a buffer one byte short of the whole logical buffer.
  HitRecord h;
  Sensor s = Sensor::ToF;
  ZD_EQ(encode_results(&h, &s, 1, buf, results_size(1) - 1), 0);
}

int main(int argc, char** argv) {
  if (argc > 1) g_fixture_path = argv[1];
  std::printf("ble_codec tests (fixture: %s)\n", g_fixture_path);
  ZD_RUN(test_control_golden_vectors);
  ZD_RUN(test_rejects_bad_frames);
  ZD_RUN(test_rejects_out_of_range);
  ZD_RUN(test_rejects_bad_drill_blob);
  ZD_RUN(test_status_golden_vectors);
  ZD_RUN(test_results_golden_vectors);
  ZD_RUN(test_encoders_reject_bad_input);
  std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
  return zd_fails ? 1 : 0;
}
