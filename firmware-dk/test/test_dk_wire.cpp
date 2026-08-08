/*
 * Host tests for the DK reference peripheral's wire codec (src/dk_wire.c).
 *
 * These are the pin that stops the DK — the harness whose whole job is to
 * validate the BLE wire — from being a third, silently-drifting copy of the byte
 * format. The test loads the SHARED fixture docs/ble-vectors.json (the SAME file
 * app/src/ble/codec.test.ts and firmware/test/test_blecodec assert against) and
 * checks that the DK's encoders reproduce every Status/Results vector's `bytes`,
 * and that its LoadDrill decoder reads the fields at the right offsets. Edit a
 * byte in the fixture and this build fails too — the cross-language drift guard
 * now covers the bench validator as well.
 *
 * C++ so it can reuse the ESP32 test tree's tiny JSON reader and harness; the
 * unit under test (dk_wire.c) is plain C, linked in via the extern "C" header.
 */
#include <string>
#include <vector>

#include "dk_wire.h"

// From firmware/test/ — the same shared golden-vector loader + assert harness.
#include "json.h"
#include "zd_test.h"

using zdjson::Value;

static const char *g_fixture_path = "../docs/ble-vectors.json";

static std::vector<uint8_t> bytes_of(const Value &vec)
{
	std::vector<uint8_t> out;
	for (const Value &n : vec["bytes"].as_array()) {
		out.push_back((uint8_t)n.as_int());
	}
	return out;
}

static void expect_bytes(const char *name, const uint8_t *got, size_t got_len,
			 const std::vector<uint8_t> &want)
{
	ZD_EQ(got_len, want.size());
	bool eq = got_len == want.size();
	for (size_t i = 0; eq && i < want.size(); i++) {
		eq = got[i] == want[i];
	}
	ZD_CHECK(eq);
	if (!eq) {
		std::printf("    %s: encoded bytes differ from fixture\n", name);
	}
}

static uint8_t session_state_byte(const std::string &s)
{
	if (s == "idle") return DK_SESS_IDLE;
	if (s == "pairing") return DK_SESS_PAIRING;
	if (s == "running") return DK_SESS_RUNNING;
	if (s == "done") return DK_SESS_DONE;
	Value::fail("unknown session state in fixture");
}

static uint8_t sensor_byte(const std::string &s)
{
	if (s == "tof") return 0;
	if (s == "piezo") return 1;
	Value::fail("unknown sensor in fixture");
}

static uint8_t mode_byte(const std::string &s)
{
	if (s == "random") return 0;
	if (s == "path") return 1;
	if (s == "live") return 2;
	if (s == "time") return 3;
	Value::fail("unknown drill mode in fixture");
}

// Encode every Status vector the DK actually emits (session/pairing/progress/
// resolved) from its `event` and assert the bytes match the fixture.
static void test_status_encoders()
{
	Value root = zdjson::parse_file(g_fixture_path);
	ZD_EQ(root["statusVersion"].as_int(), DK_STATUS_VERSION);

	const zdjson::Array &vecs = root["status"].as_array();
	ZD_CHECK(vecs.size() >= 7); // coverage floor — a shrunk fixture must fail

	for (const Value &v : vecs) {
		const std::vector<uint8_t> want = bytes_of(v);
		const Value &e = v["event"];
		const std::string kind = e["kind"].as_string();
		uint8_t out[DK_STATUS_MAX_LEN];
		size_t n = 0;

		if (kind == "session") {
			n = dk_encode_session(session_state_byte(e["state"].as_string()),
					      (uint8_t)e["targetsOnline"].as_int(), out);
		} else if (kind == "pairing") {
			const Value &p = e["progress"];
			std::vector<uint8_t> bound;
			for (const Value &b : p["boundSpots"].as_array()) {
				bound.push_back((uint8_t)b.as_int());
			}
			int current = p["currentSpot"].is_null()
					      ? -1
					      : p["currentSpot"].as_int();
			n = dk_encode_pairing((uint8_t)p["total"].as_int(),
					      bound.data(), (uint8_t)bound.size(), current,
					      p["awaitingConfirm"].as_bool(), out);
		} else if (kind == "progress") {
			n = dk_encode_progress((uint16_t)e["seq"].as_int(),
					       (uint8_t)e["position"].as_int(), out);
		} else if (kind == "resolved") {
			n = dk_encode_resolved((uint16_t)e["seq"].as_int(),
					       (uint8_t)e["position"].as_int(),
					       e["miss"].as_bool(),
					       e["reactionMs"].as_uint32(), out);
		} else {
			Value::fail("unexpected status kind in fixture");
		}
		expect_bytes(v["name"].as_string().c_str(), out, n, want);
	}
}

// Build each Results vector's records into the DK's dk_hit form, encode, and
// assert against the fixture's whole logical buffer.
static void test_results_encoder()
{
	Value root = zdjson::parse_file(g_fixture_path);
	ZD_EQ(root["resultsVersion"].as_int(), DK_RESULTS_VERSION);

	const zdjson::Array &vecs = root["results"].as_array();
	ZD_CHECK(vecs.size() >= 4);

	for (const Value &v : vecs) {
		const std::vector<uint8_t> want = bytes_of(v);
		std::vector<struct dk_hit> recs;
		for (const Value &r : v["records"].as_array()) {
			struct dk_hit h;
			h.seq = (uint16_t)r["seq"].as_int();
			h.pos = (uint8_t)r["position"].as_int();
			h.tlit = r["tLitUs"].as_uint64();
			h.thit = r["tHitUs"].as_uint64();
			h.react = r["reactionMs"].as_uint32();
			h.move = r["movementMs"].as_uint32();
			h.miss = r["miss"].as_bool() ? 1 : 0;
			h.sensor = sensor_byte(r["sensor"].as_string());
			recs.push_back(h);
		}
		uint16_t count = (uint16_t)recs.size();
		std::vector<uint8_t> out(dk_results_size(count));
		size_t n = dk_encode_results(recs.data(), count, out.data());
		expect_bytes(v["name"].as_string().c_str(), out.data(), n, want);
	}
}

// Decode each LoadDrill control vector and check the DK reads mode/num/steps at
// the right offsets — the fields its bench scenario drives off.
static void test_drill_decoder()
{
	Value root = zdjson::parse_file(g_fixture_path);
	const zdjson::Array &vecs = root["control"].as_array();
	int drills = 0;

	for (const Value &v : vecs) {
		const Value &msg = v["message"];
		if (msg["op"].as_int() != 5 /* LoadDrill */) {
			continue;
		}
		drills++;
		const std::vector<uint8_t> b = bytes_of(v);
		const Value &cfg = msg["config"];

		uint8_t mode = 0xFF, num = 0;
		uint16_t steps = 0;
		bool ok = dk_decode_drill(b.data() + 2, (uint16_t)(b.size() - 2), &mode,
					  &num, &steps);
		ZD_CHECK(ok);

		ZD_EQ(mode, mode_byte(cfg["mode"].as_string()));
		ZD_EQ(num, cfg["numPositions"].as_int());
		uint16_t want_steps =
			mode == 1 ? (uint16_t)cfg["path"].as_array().size()
				  : (uint16_t)(cfg.has("count") ? cfg["count"].as_int() : 10);
		ZD_EQ(steps, want_steps);
	}
	ZD_CHECK(drills >= 3); // coverage floor for the decode side too
}

// A blob shorter than the 18-byte head is rejected, not read out of bounds.
static void test_drill_decoder_rejects_short()
{
	uint8_t blob[17] = {0};
	uint8_t mode, num;
	uint16_t steps;
	ZD_CHECK(!dk_decode_drill(blob, sizeof(blob), &mode, &num, &steps));
}

int main(int argc, char **argv)
{
	if (argc > 1) {
		g_fixture_path = argv[1];
	}
	std::printf("dk_wire tests (fixture: %s)\n", g_fixture_path);
	ZD_RUN(test_status_encoders);
	ZD_RUN(test_results_encoder);
	ZD_RUN(test_drill_decoder);
	ZD_RUN(test_drill_decoder_rejects_short);
	std::printf("%d checks, %d failures\n", zd_checks, zd_fails);
	return zd_fails ? 1 : 0;
}
