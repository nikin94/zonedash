/*
 * ZoneDash DK wire codec — pure byte layout, no Zephyr. See dk_wire.h. Every
 * offset here mirrors app/src/ble/codec.ts and is pinned by the shared fixture
 * docs/ble-vectors.json via test/test_dk_wire.cpp.
 */
#include "dk_wire.h"

/* Little-endian writers — both the phone and the DK are LE, like protocol.h. */
static void put_u16(uint8_t *p, uint16_t v)
{
	p[0] = (uint8_t)v;
	p[1] = (uint8_t)(v >> 8);
}
static void put_u32(uint8_t *p, uint32_t v)
{
	for (int i = 0; i < 4; i++) {
		p[i] = (uint8_t)(v >> (8 * i));
	}
}
static void put_u64(uint8_t *p, uint64_t v)
{
	for (int i = 0; i < 8; i++) {
		p[i] = (uint8_t)(v >> (8 * i));
	}
}
static uint16_t rd_u16(const uint8_t *p)
{
	return (uint16_t)(p[0] | ((uint16_t)p[1] << 8));
}

size_t dk_encode_session(uint8_t state, uint8_t online, uint8_t *out)
{
	out[0] = DK_STATUS_VERSION;
	out[1] = DK_ST_SESSION;
	out[2] = state;
	out[3] = online;
	return 4;
}

size_t dk_encode_pairing(uint8_t total, const uint8_t *bound, uint8_t count,
			 int current, bool awaiting, uint8_t *out)
{
	uint8_t c = count > DK_MAX_TARGETS ? DK_MAX_TARGETS : count;
	bool done = total > 0 && count >= total;

	out[0] = DK_STATUS_VERSION;
	out[1] = DK_ST_PAIRING;
	out[2] = total;
	out[3] = count;
	out[4] = current < 0 ? DK_PAIR_CURRENT_NONE : (uint8_t)current;
	out[5] = (uint8_t)((awaiting ? DK_FLAG_AWAITING : 0) | (done ? DK_FLAG_DONE : 0));
	for (uint8_t i = 0; i < c; i++) {
		out[6 + i] = bound[i];
	}
	return (size_t)(6 + c);
}

size_t dk_encode_progress(uint16_t seq, uint8_t pos, uint8_t *out)
{
	out[0] = DK_STATUS_VERSION;
	out[1] = DK_ST_PROGRESS;
	put_u16(out + 2, seq);
	out[4] = pos;
	return 5;
}

size_t dk_encode_resolved(uint16_t seq, uint8_t pos, bool miss, uint32_t react,
			  uint8_t *out)
{
	out[0] = DK_STATUS_VERSION;
	out[1] = DK_ST_RESOLVED;
	put_u16(out + 2, seq);
	out[4] = pos;
	out[5] = (uint8_t)(miss ? DK_FLAG_MISS : 0);
	put_u32(out + 6, react);
	return 10;
}

size_t dk_results_size(uint16_t count)
{
	return (size_t)DK_RESULTS_HEADER + (size_t)count * DK_RECORD_BYTES;
}

size_t dk_encode_results(const struct dk_hit *recs, uint16_t count, uint8_t *out)
{
	out[0] = DK_RESULTS_VERSION;
	put_u16(out + 1, count);
	for (uint16_t i = 0; i < count; i++) {
		uint8_t *r = out + DK_RESULTS_HEADER + (size_t)i * DK_RECORD_BYTES;
		const struct dk_hit *s = &recs[i];
		put_u16(r, s->seq);
		r[2] = s->pos;
		put_u64(r + 3, s->tlit);
		put_u64(r + 11, s->thit);
		put_u32(r + 19, s->react);
		put_u32(r + 23, s->move);
		r[27] = (uint8_t)(s->miss ? DK_FLAG_MISS : 0);
		r[28] = s->sensor;
	}
	return dk_results_size(count);
}

bool dk_decode_drill(const uint8_t *p, uint16_t n, uint8_t *mode,
		     uint8_t *num_positions, uint16_t *steps)
{
	if (n < 18) {
		return false;
	}
	uint8_t m = p[0];
	uint8_t num = p[1] ? p[1] : 1;
	uint16_t count = rd_u16(p + 2);
	uint8_t path_len = p[17];

	*mode = m;
	*num_positions = num;
	*steps = (m == 1 /* path */) ? path_len : count;
	return true;
}
