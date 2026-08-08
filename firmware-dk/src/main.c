/*
 * ZoneDash DK reference peripheral (bench tool, nRF52840-DK / Zephyr).
 *
 * It impersonates the central unit's BLE GATT service so the phone app's REAL
 * BLE stack (BleCentralTransport -> BlePlxPeripheral -> radio) can be exercised
 * end to end without the ESP32-S3 brain. On a Control write it decodes the same
 * byte format the app encodes (app/src/ble/codec.ts, pinned by
 * docs/ble-vectors.json) and plays a scripted scenario back over Status/Results
 * notifications: pairing round -> session run -> a chunked Results dump.
 *
 * This is NOT product firmware and it is NOT in CI — it is board-dependent and
 * validated only on the DK. The values it emits are freeform (a bench script);
 * only the BYTE LAYOUT is contractual and mirrors codec.ts field for field. If
 * that layout ever changes, change it in codec.ts + ble-vectors.json first, then
 * mirror it here.
 *
 * Wire format (little-endian), mirroring codec.ts:
 *   Control write  [1, op, ...payload]
 *   Status notify  [1, kind, ...]   kind 1 session,2 pairing,3 progress,4 resolved
 *   Results notify [1, count(u16), ...records(29B)]  chunked by concatenation
 */
#include <zephyr/kernel.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/logging/log.h>
#include <string.h>

LOG_MODULE_REGISTER(zonedash_dk, LOG_LEVEL_INF);

/* ── Wire constants (keep in lock-step with codec.ts) ───────────────────────*/
#define CONTROL_VERSION 1
#define STATUS_VERSION 1
#define RESULTS_VERSION 1

enum control_op {
	OP_START_SESSION = 1,
	OP_STOP_SESSION = 2,
	OP_START_PAIRING = 3, /* +N */
	OP_DUMP_RESULTS = 4,
	OP_LOAD_DRILL = 5, /* +blob */
	OP_SELECT_SPOT = 6, /* +spot */
	OP_EXTEND_PAIRING = 7, /* +N */
	OP_UNDO_PAIR = 8,
	OP_ARM_LIVE = 9, /* +position */
	OP_FINISH_PAIRING = 10,
};

/* Status kinds */
#define ST_SESSION 1
#define ST_PAIRING 2
#define ST_PROGRESS 3
#define ST_RESOLVED 4

/* SessionState wire order (codec.ts SESSION_STATE) */
#define SESS_IDLE 0
#define SESS_PAIRING 1
#define SESS_RUNNING 2
#define SESS_DONE 3

#define MAX_TARGETS 8
#define RESULTS_HEADER 3
#define RECORD_BYTES 29
#define MAX_RECS 16 /* bench cap on scripted steps */
#define PAIR_CURRENT_NONE 0xFF

/* ── 128-bit UUIDs, exactly app/src/ble/contract.ts ─────────────────────────*/
static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(
	BT_UUID_128_ENCODE(0x5a17e900, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb));
static const struct bt_uuid_128 control_uuid = BT_UUID_INIT_128(
	BT_UUID_128_ENCODE(0x5a17e901, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb));
static const struct bt_uuid_128 status_uuid = BT_UUID_INIT_128(
	BT_UUID_128_ENCODE(0x5a17e902, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb));
static const struct bt_uuid_128 results_uuid = BT_UUID_INIT_128(
	BT_UUID_128_ENCODE(0x5a17e903, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb));

/* ── State ──────────────────────────────────────────────────────────────────*/
static struct bt_conn *current_conn;

/* Pairing round */
static uint8_t pair_total;
static uint8_t pair_bound[MAX_TARGETS];
static uint8_t pair_count;
static int pair_current = -1; /* <0 = none prompted */
static bool pair_awaiting;
static int pair_phase; /* 0 -> awaiting, 1 -> bind */

/* Drill / session */
static uint8_t drill_mode;
static uint8_t drill_num_pos = MAX_TARGETS;
static uint16_t drill_steps = 1;
static bool session_running;
static uint16_t sess_step;
static int sess_phase; /* 0 -> arm, 1 -> resolve */

/* Recorded hits, for the dump */
struct rec {
	uint16_t seq;
	uint8_t pos;
	uint64_t tlit;
	uint64_t thit;
	uint32_t react;
	uint32_t move;
	bool miss;
	uint8_t sensor;
};
static struct rec recs[MAX_RECS];
static uint16_t rec_count;

/* Results dump, sent frame-by-frame from a work item (can't sleep in the BLE
 * RX callback). Built once at DumpResults, then drained. */
static uint8_t dump_buf[RESULTS_HEADER + MAX_RECS * RECORD_BYTES];
static uint16_t dump_total;
static uint16_t dump_off;

static struct k_work_delayable pair_work;
static struct k_work_delayable sess_work;
static struct k_work_delayable live_work;
static struct k_work_delayable dump_work;
static struct k_work_delayable hello_work;
static uint8_t live_pos;

/* ── Little-endian writers ──────────────────────────────────────────────────*/
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

/* Attribute layout of the service defined below. Notifies target the char VALUE
 * attribute (declaration index + 1):
 *   [0] primary          [1] control decl  [2] control value
 *   [3] status decl      [4] status value  [5] status ccc
 *   [6] results decl     [7] results value [8] results ccc
 */
#define ATTR_STATUS_VALUE 4
#define ATTR_RESULTS_VALUE 7

/* Forward decl — the service object is defined after the write handler. */
extern const struct bt_gatt_service_static zonedash_svc;

static void notify_status(const uint8_t *d, uint16_t len)
{
	if (!current_conn) {
		return;
	}
	int err = bt_gatt_notify(current_conn, &zonedash_svc.attrs[ATTR_STATUS_VALUE], d, len);
	if (err) {
		LOG_WRN("status notify failed (%d) — app subscribed yet?", err);
	}
}

/* ── Status emitters (byte layout = codec.ts decodeStatus) ──────────────────*/
static void emit_session(uint8_t state, uint8_t online)
{
	uint8_t b[4] = {STATUS_VERSION, ST_SESSION, state, online};
	notify_status(b, sizeof(b));
}

static void emit_pairing(void)
{
	uint8_t b[6 + MAX_TARGETS];
	bool done = pair_total > 0 && pair_count >= pair_total;

	b[0] = STATUS_VERSION;
	b[1] = ST_PAIRING;
	b[2] = pair_total;
	b[3] = pair_count;
	b[4] = pair_current < 0 ? PAIR_CURRENT_NONE : (uint8_t)pair_current;
	b[5] = (uint8_t)((pair_awaiting ? 0x01 : 0) | (done ? 0x02 : 0));
	for (uint8_t i = 0; i < pair_count && i < MAX_TARGETS; i++) {
		b[6 + i] = pair_bound[i];
	}
	notify_status(b, (uint16_t)(6 + pair_count));
}

static void emit_progress(uint16_t seq, uint8_t pos)
{
	uint8_t b[5] = {STATUS_VERSION, ST_PROGRESS, 0, 0, pos};
	put_u16(b + 2, seq);
	notify_status(b, sizeof(b));
}

static void emit_resolved(uint16_t seq, uint8_t pos, bool miss, uint32_t react)
{
	uint8_t b[10] = {STATUS_VERSION, ST_RESOLVED, 0, 0, pos, (uint8_t)(miss ? 0x01 : 0)};
	put_u16(b + 2, seq);
	put_u32(b + 6, react);
	notify_status(b, sizeof(b));
}

/* ── Scenario helpers ───────────────────────────────────────────────────────*/
static void record_hit(uint16_t seq, uint8_t pos, uint32_t react)
{
	if (rec_count >= MAX_RECS) {
		return;
	}
	struct rec *r = &recs[rec_count++];
	r->seq = seq;
	r->pos = pos;
	r->tlit = (uint64_t)seq * 1000000ull;
	r->thit = r->tlit + (uint64_t)react * 1000ull;
	r->react = react;
	r->move = 0;
	r->miss = false;
	r->sensor = 0; /* ToF */
}

static void start_session(void)
{
	session_running = true;
	sess_step = 0;
	sess_phase = 0;
	rec_count = 0;
	emit_session(SESS_RUNNING, pair_count);
	k_work_reschedule(&sess_work, K_MSEC(500));
}

static void stop_session(void)
{
	session_running = false;
	k_work_cancel_delayable(&sess_work);
	emit_session(SESS_DONE, pair_count);
}

static void parse_drill(const uint8_t *p, uint16_t n)
{
	if (n < 18) {
		return;
	}
	drill_mode = p[0];
	drill_num_pos = p[1] ? p[1] : 1;
	uint16_t count = (uint16_t)(p[2] | (p[3] << 8));
	uint8_t path_len = p[17];

	drill_steps = (drill_mode == 1 /* path */) ? path_len : count;
	if (drill_steps == 0) {
		drill_steps = 1;
	}
	if (drill_steps > MAX_RECS) {
		drill_steps = MAX_RECS;
	}
}

/* ── Work handlers (run on the system workqueue — may sleep) ─────────────────*/
static void pair_work_fn(struct k_work *w)
{
	ARG_UNUSED(w);
	if (pair_phase == 0) {
		pair_awaiting = true; /* "press again to confirm" */
		emit_pairing();
		pair_phase = 1;
		k_work_reschedule(&pair_work, K_MSEC(400));
	} else {
		if (pair_current >= 0 && pair_count < MAX_TARGETS) {
			pair_bound[pair_count++] = (uint8_t)pair_current;
		}
		pair_current = -1;
		pair_awaiting = false;
		emit_pairing(); /* carries done:true once bound == total */
	}
}

static void sess_work_fn(struct k_work *w)
{
	ARG_UNUSED(w);
	if (!session_running) {
		return;
	}
	uint8_t pos = drill_num_pos ? (uint8_t)(sess_step % drill_num_pos) : 0;

	if (sess_phase == 0) {
		emit_progress(sess_step, pos);
		sess_phase = 1;
		k_work_reschedule(&sess_work, K_MSEC(400));
	} else {
		uint32_t react = 300u + sess_step * 25u;
		emit_resolved(sess_step, pos, false, react);
		record_hit(sess_step, pos, react);
		sess_step++;
		sess_phase = 0;
		if (sess_step >= drill_steps) {
			session_running = false;
			emit_session(SESS_DONE, pair_count);
		} else {
			k_work_reschedule(&sess_work, K_MSEC(500));
		}
	}
}

static void live_work_fn(struct k_work *w)
{
	ARG_UNUSED(w);
	uint32_t react = 420;
	emit_resolved(sess_step, live_pos, false, react);
	record_hit(sess_step, live_pos, react);
	sess_step++;
}

static void dump_work_fn(struct k_work *w)
{
	ARG_UNUSED(w);
	if (!current_conn || dump_off >= dump_total) {
		return;
	}
	uint16_t mtu = bt_gatt_get_mtu(current_conn);
	uint16_t chunk = (mtu > 3) ? (uint16_t)(mtu - 3) : 20;
	uint16_t n = MIN(chunk, (uint16_t)(dump_total - dump_off));

	int err = bt_gatt_notify(current_conn, &zonedash_svc.attrs[ATTR_RESULTS_VALUE],
				 dump_buf + dump_off, n);
	if (err == -ENOMEM) {
		/* TX buffers full — retry this same frame shortly. */
		k_work_reschedule(&dump_work, K_MSEC(20));
		return;
	}
	dump_off += n;
	if (dump_off < dump_total) {
		k_work_reschedule(&dump_work, K_MSEC(15));
	}
}

static void send_results(void)
{
	dump_buf[0] = RESULTS_VERSION;
	put_u16(dump_buf + 1, rec_count);
	for (uint16_t i = 0; i < rec_count; i++) {
		uint8_t *r = dump_buf + RESULTS_HEADER + i * RECORD_BYTES;
		struct rec *s = &recs[i];
		put_u16(r, s->seq);
		r[2] = s->pos;
		put_u64(r + 3, s->tlit);
		put_u64(r + 11, s->thit);
		put_u32(r + 19, s->react);
		put_u32(r + 23, s->move);
		r[27] = (uint8_t)(s->miss ? 0x01 : 0);
		r[28] = s->sensor;
	}
	dump_total = (uint16_t)(RESULTS_HEADER + rec_count * RECORD_BYTES);
	dump_off = 0;
	k_work_reschedule(&dump_work, K_NO_WAIT);
}

/* ── Control-characteristic write: decode + drive the scenario ──────────────*/
static ssize_t control_write(struct bt_conn *conn, const struct bt_gatt_attr *attr,
			     const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
	ARG_UNUSED(conn);
	ARG_UNUSED(attr);
	ARG_UNUSED(offset);
	ARG_UNUSED(flags);

	const uint8_t *b = buf;
	if (len < 2 || b[0] != CONTROL_VERSION) {
		LOG_WRN("drop control write (len %u, ver %u)", len, len ? b[0] : 0);
		return len; /* ack the write; a real central would drop it too */
	}

	uint8_t op = b[1];
	LOG_INF("control op %u (len %u)", op, len);

	switch (op) {
	case OP_START_PAIRING:
		if (len >= 3) {
			pair_total = b[2];
			pair_count = 0;
			pair_current = -1;
			pair_awaiting = false;
			emit_pairing();
		}
		break;
	case OP_SELECT_SPOT:
		if (len >= 3) {
			pair_current = b[2];
			pair_awaiting = false;
			pair_phase = 0;
			emit_pairing(); /* "press here" */
			k_work_reschedule(&pair_work, K_MSEC(400));
		}
		break;
	case OP_EXTEND_PAIRING:
		if (len >= 3) {
			pair_total = b[2];
			emit_pairing();
		}
		break;
	case OP_UNDO_PAIR:
		if (pair_count > 0) {
			pair_count--;
		}
		pair_current = -1;
		pair_awaiting = false;
		emit_pairing();
		break;
	case OP_FINISH_PAIRING:
		pair_total = pair_count;
		pair_current = -1;
		pair_awaiting = false;
		emit_pairing();
		break;
	case OP_LOAD_DRILL:
		parse_drill(b + 2, (uint16_t)(len - 2));
		break;
	case OP_START_SESSION:
		start_session();
		break;
	case OP_STOP_SESSION:
		stop_session();
		break;
	case OP_ARM_LIVE:
		if (len >= 3) {
			if (!session_running) {
				session_running = true;
				sess_step = 0;
				rec_count = 0;
				emit_session(SESS_RUNNING, pair_count);
			}
			live_pos = b[2];
			emit_progress(sess_step, live_pos);
			k_work_reschedule(&live_work, K_MSEC(400));
		}
		break;
	case OP_DUMP_RESULTS:
		send_results();
		break;
	default:
		LOG_WRN("unknown control op %u", op);
		break;
	}
	return len;
}

static void status_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	ARG_UNUSED(attr);
	LOG_INF("status notifications %s", value == BT_GATT_CCC_NOTIFY ? "on" : "off");
}
static void results_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	ARG_UNUSED(attr);
	LOG_INF("results notifications %s", value == BT_GATT_CCC_NOTIFY ? "on" : "off");
}

/* Attribute order MUST match the ATTR_*_VALUE indices above. */
BT_GATT_SERVICE_DEFINE(
	zonedash_svc, BT_GATT_PRIMARY_SERVICE(&service_uuid),
	BT_GATT_CHARACTERISTIC(&control_uuid.uuid, BT_GATT_CHRC_WRITE, BT_GATT_PERM_WRITE, NULL,
			       control_write, NULL),
	BT_GATT_CHARACTERISTIC(&status_uuid.uuid, BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_NONE, NULL,
			       NULL, NULL),
	BT_GATT_CCC(status_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
	BT_GATT_CHARACTERISTIC(&results_uuid.uuid, BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_NONE, NULL,
			       NULL, NULL),
	BT_GATT_CCC(results_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE));

/* ── Advertising: flags + the 128-bit service UUID (app scans by it); name in
 *   the scan response. ───────────────────────────────────────────────────────*/
static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA_BYTES(BT_DATA_UUID128_ALL,
		      BT_UUID_128_ENCODE(0x5a17e900, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)),
};
static const struct bt_data sd[] = {
	BT_DATA(BT_DATA_NAME_COMPLETE, "ZoneDash-DK", sizeof("ZoneDash-DK") - 1),
};

static void advertise(void)
{
	int err = bt_le_adv_start(BT_LE_ADV_CONN, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
	if (err) {
		LOG_ERR("advertising failed to start (%d)", err);
	} else {
		LOG_INF("advertising as ZoneDash-DK");
	}
}

static void reset_scenario(void)
{
	k_work_cancel_delayable(&pair_work);
	k_work_cancel_delayable(&sess_work);
	k_work_cancel_delayable(&live_work);
	k_work_cancel_delayable(&dump_work);
	pair_total = 0;
	pair_count = 0;
	pair_current = -1;
	pair_awaiting = false;
	session_running = false;
	sess_step = 0;
	rec_count = 0;
	dump_off = 0;
	dump_total = 0;
}

static void hello_work_fn(struct k_work *w)
{
	ARG_UNUSED(w);
	/* Nudge the app's session snapshot to idle once it has had time to
	 * subscribe to the Status CCC after connect + discovery. */
	emit_session(SESS_IDLE, 0);
}

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		LOG_ERR("connection failed (0x%02x)", err);
		return;
	}
	current_conn = bt_conn_ref(conn);
	reset_scenario();
	LOG_INF("connected");
	k_work_reschedule(&hello_work, K_MSEC(600));
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	ARG_UNUSED(conn);
	LOG_INF("disconnected (0x%02x)", reason);
	reset_scenario();
	if (current_conn) {
		bt_conn_unref(current_conn);
		current_conn = NULL;
	}
	advertise();
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
};

int main(void)
{
	k_work_init_delayable(&pair_work, pair_work_fn);
	k_work_init_delayable(&sess_work, sess_work_fn);
	k_work_init_delayable(&live_work, live_work_fn);
	k_work_init_delayable(&dump_work, dump_work_fn);
	k_work_init_delayable(&hello_work, hello_work_fn);

	int err = bt_enable(NULL);
	if (err) {
		LOG_ERR("bt_enable failed (%d)", err);
		return 0;
	}
	LOG_INF("ZoneDash DK reference peripheral up");
	advertise();
	return 0;
}
