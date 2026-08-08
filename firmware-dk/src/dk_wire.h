/*
 * ZoneDash DK wire codec — the pure byte layout of the BLE Status/Results the
 * reference peripheral emits, and the LoadDrill fields it reads. Split out of
 * main.c so it has ZERO Zephyr dependency and can be host-compiled and asserted
 * against the SHARED fixture docs/ble-vectors.json — the same file the app
 * (app/src/ble/codec.ts) and the ESP32 brain (firmware/lib/blecodec) pin
 * against. test/test_dk_wire.cpp does exactly that, so editing a byte in the
 * fixture breaks THIS build too, not just the other two: without this the DK —
 * the harness whose whole job is to validate the wire — was a third, unpinned
 * copy of the format that could silently drift.
 *
 * Keep the constants and offsets in lock-step with codec.ts; the fixture test is
 * the mechanical guard, not this comment.
 */
#ifndef ZONEDASH_DK_WIRE_H
#define ZONEDASH_DK_WIRE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Characteristic wire versions (codec.ts CONTROL/STATUS/RESULTS_VERSION). */
#define DK_CONTROL_VERSION 1
#define DK_STATUS_VERSION 1
#define DK_RESULTS_VERSION 1

/* Status notification kinds (byte 1, after the version). */
#define DK_ST_SESSION 1
#define DK_ST_PAIRING 2
#define DK_ST_PROGRESS 3
#define DK_ST_RESOLVED 4

/* SessionState wire order (codec.ts SESSION_STATE). */
#define DK_SESS_IDLE 0
#define DK_SESS_PAIRING 1
#define DK_SESS_RUNNING 2
#define DK_SESS_DONE 3

#define DK_MAX_TARGETS 8
#define DK_RESULTS_HEADER 3
#define DK_RECORD_BYTES 29
#define DK_PAIR_CURRENT_NONE 0xFF

/* pairing flags byte (bit0 awaiting, bit1 done); resolved/record flags (bit0 miss) */
#define DK_FLAG_AWAITING 0x01
#define DK_FLAG_DONE 0x02
#define DK_FLAG_MISS 0x01

/* Largest Status frame: pairing header (6) + one bound spot per target. */
#define DK_STATUS_MAX_LEN (6 + DK_MAX_TARGETS)

/* One hit record on the wire — mirrors codec.ts HitRecord plus the sensor the
 * brain splices in from the ESP-NOW Pressed packet. */
struct dk_hit {
	uint16_t seq;
	uint8_t pos;
	uint64_t tlit;
	uint64_t thit;
	uint32_t react;
	uint32_t move;
	uint8_t miss;   /* 0 / 1 */
	uint8_t sensor; /* 0 tof, 1 piezo */
};

/* ── Status encoders — write the notification bytes into `out` (>= the frame's
 *    length; DK_STATUS_MAX_LEN covers the largest) and return that length. ──── */
size_t dk_encode_session(uint8_t state, uint8_t online, uint8_t *out);
size_t dk_encode_pairing(uint8_t total, const uint8_t *bound, uint8_t count,
			 int current, bool awaiting, uint8_t *out);
size_t dk_encode_progress(uint16_t seq, uint8_t pos, uint8_t *out);
size_t dk_encode_resolved(uint16_t seq, uint8_t pos, bool miss, uint32_t react,
			  uint8_t *out);

/* Total length of a Results buffer holding `count` records. */
size_t dk_results_size(uint16_t count);

/* Results encoder — the single logical buffer [version, count(u16), ...records];
 * `out` must hold dk_results_size(count). The transport chunks it across
 * notifications (mirrors codec.ts decodeResults). Returns the buffer length. */
size_t dk_encode_results(const struct dk_hit *recs, uint16_t count, uint8_t *out);

/* Decode the fields the bench scenario needs from a LoadDrill blob (the bytes
 * AFTER the opcode). Mirrors codec.ts encodeDrill offsets: mode@0, num@1,
 * count(u16)@2, path_len@17. `steps` = path_len for path mode (1), else count.
 * Returns false on a short blob (< the 18-byte head). */
bool dk_decode_drill(const uint8_t *p, uint16_t n, uint8_t *mode,
		     uint8_t *num_positions, uint16_t *steps);

#ifdef __cplusplus
}
#endif

#endif /* ZONEDASH_DK_WIRE_H */
