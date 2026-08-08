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

#include "dk_wire.h" /* the pure byte layout — pinned against the shared fixture */

LOG_MODULE_REGISTER(zonedash_dk, LOG_LEVEL_INF);

/* Control opcodes (byte 1, after the version). Mirrors codec.ts ControlOp. The
 * Status/Results byte layout and every wire constant now live in dk_wire.h,
 * host-tested against docs/ble-vectors.json (test/test_dk_wire.cpp) — the DK is
 * no longer a second, unpinned copy of the format. */
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

#define MAX_RECS 16	    /* bench cap on scripted steps */
#define DUMP_MAX_RETRIES 50 /* ~1 s of -ENOMEM retries before the dump gives up */

/* ── 128-bit UUIDs, exactly app/src/ble/contract.ts ─────────────────────────*/
/* The service UUID appears twice — the GATT object and the advertising data —
 * so its raw encoding is named once here to keep the two copies in step. */
#define ZD_SERVICE_UUID_ENCODE                                                            \
	BT_UUID_128_ENCODE(0x5a17e900, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)
static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(ZD_SERVICE_UUID_ENCODE);
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
static uint8_t pair_bound[DK_MAX_TARGETS];
static uint8_t pair_count;
static int pair_current = -1; /* <0 = none prompted */
static bool pair_awaiting;
static int pair_phase; /* 0 -> awaiting, 1 -> bind */

/* Drill / session */
static uint8_t drill_mode;
static uint8_t drill_num_pos = DK_MAX_TARGETS;
static uint16_t drill_steps = 1;
static bool session_running;
static uint16_t sess_step;
static int sess_phase; /* 0 -> arm, 1 -> resolve */

/* Recorded hits, for the dump (the wire record struct from dk_wire.h). */
static struct dk_hit recs[MAX_RECS];
static uint16_t rec_count;

/* Results dump, sent frame-by-frame from a work item (can't sleep in the BLE
 * RX callback). Built once at DumpResults, then drained. */
static uint8_t dump_buf[DK_RESULTS_HEADER + MAX_RECS * DK_RECORD_BYTES];
static uint16_t dump_total;
static uint16_t dump_off;
static uint8_t dump_retries; /* -ENOMEM backoffs on the current frame */

static struct k_work_delayable pair_work;
static struct k_work_delayable sess_work;
static struct k_work_delayable live_work;
static struct k_work_delayable dump_work;
static struct k_work_delayable hello_work;
static uint8_t live_pos;

/* ── Little-endian writers ──────────────────────────────────────────────────*/
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

/* ── Status emitters — dk_wire.c builds the bytes (pinned to the fixture); this
 *    layer only feeds live scenario state in and hands the frame to notify. ── */
static void emit_session(uint8_t state, uint8_t online)
{
	uint8_t b[DK_STATUS_MAX_LEN];
	notify_status(b, (uint16_t)dk_encode_session(state, online, b));
}

static void emit_pairing(void)
{
	uint8_t b[DK_STATUS_MAX_LEN];
	size_t n = dk_encode_pairing(pair_total, pair_bound, pair_count, pair_current,
				     pair_awaiting, b);
	notify_status(b, (uint16_t)n);
}

static void emit_progress(uint16_t seq, uint8_t pos)
{
	uint8_t b[DK_STATUS_MAX_LEN];
	notify_status(b, (uint16_t)dk_encode_progress(seq, pos, b));
}

static void emit_resolved(uint16_t seq, uint8_t pos, bool miss, uint32_t react)
{
	uint8_t b[DK_STATUS_MAX_LEN];
	notify_status(b, (uint16_t)dk_encode_resolved(seq, pos, miss, react, b));
}

/* ── Scenario helpers ───────────────────────────────────────────────────────*/
static void record_hit(uint16_t seq, uint8_t pos, uint32_t react)
{
	if (rec_count >= MAX_RECS) {
		return;
	}
	struct dk_hit *r = &recs[rec_count++];
	r->seq = seq;
	r->pos = pos;
	r->tlit = (uint64_t)seq * 1000000ull;
	r->thit = r->tlit + (uint64_t)react * 1000ull;
	r->react = react;
	r->move = 0;
	r->miss = 0;
	r->sensor = 0; /* ToF */
}

static void start_session(void)
{
	session_running = true;
	sess_step = 0;
	sess_phase = 0;
	rec_count = 0;
	emit_session(DK_SESS_RUNNING, pair_count);
	k_work_reschedule(&sess_work, K_MSEC(500));
}

static void stop_session(void)
{
	session_running = false;
	k_work_cancel_delayable(&sess_work);
	emit_session(DK_SESS_DONE, pair_count);
}

static void parse_drill(const uint8_t *p, uint16_t n)
{
	uint16_t steps;
	/* dk_decode_drill reads the fields at the pinned offsets. `steps` is the
	 * scripted step count: path_len for path mode, else the config `count`.
	 * Note the bench simplification — a time-limited drill here runs `count`
	 * steps, not a real duration_ms window. */
	if (!dk_decode_drill(p, n, &drill_mode, &drill_num_pos, &steps)) {
		return;
	}
	if (steps == 0) {
		steps = 1;
	}
	if (steps > MAX_RECS) {
		steps = MAX_RECS; /* bench cap on scripted steps */
	}
	drill_steps = steps;
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
		if (pair_current >= 0 && pair_count < DK_MAX_TARGETS) {
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
			emit_session(DK_SESS_DONE, pair_count);
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
		/* TX buffers full — retry this same frame shortly, but bounded so a
		 * wedged link can't spin the workqueue forever. */
		if (++dump_retries > DUMP_MAX_RETRIES) {
			LOG_WRN("results dump: TX stalled, giving up");
			dump_off = dump_total; /* let the app's dump timeout fire */
			return;
		}
		k_work_reschedule(&dump_work, K_MSEC(20));
		return;
	}
	dump_retries = 0; /* a frame went out — reset the backoff */
	dump_off += n;
	if (dump_off < dump_total) {
		k_work_reschedule(&dump_work, K_MSEC(15));
	}
}

static void send_results(void)
{
	/* dk_encode_results lays the whole [version, count, ...records] buffer out
	 * at the pinned offsets; the work item then chunks it across notifications. */
	dump_total = (uint16_t)dk_encode_results(recs, rec_count, dump_buf);
	dump_off = 0;
	dump_retries = 0;
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
	if (len < 2 || b[0] != DK_CONTROL_VERSION) {
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
			/* Move the session into `pairing` too (the mock does), so a
			 * screen reading session state during a round stays in step. */
			emit_session(DK_SESS_PAIRING, pair_count);
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
				emit_session(DK_SESS_RUNNING, pair_count);
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
	bool on = value == BT_GATT_CCC_NOTIFY;
	LOG_INF("status notifications %s", on ? "on" : "off");
	/* The app has just subscribed — this is the first moment a Status notify is
	 * actually delivered, so send the initial session snapshot from HERE (off a
	 * work item), not from a fixed post-connect timer that races the subscribe. */
	if (on && current_conn) {
		k_work_reschedule(&hello_work, K_NO_WAIT);
	}
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
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, ZD_SERVICE_UUID_ENCODE),
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
	k_work_cancel_delayable(&hello_work);
	pair_total = 0;
	pair_count = 0;
	pair_current = -1;
	pair_awaiting = false;
	session_running = false;
	sess_step = 0;
	rec_count = 0;
	dump_off = 0;
	dump_total = 0;
	dump_retries = 0;
}

static void hello_work_fn(struct k_work *w)
{
	ARG_UNUSED(w);
	/* Scheduled from status_ccc_changed the moment the app subscribes. Emit the
	 * CURRENT session state (idle right after connect) so a subscribe — even a
	 * late or repeat one mid-scenario — rehydrates the app snapshot correctly. */
	emit_session(session_running ? DK_SESS_RUNNING : DK_SESS_IDLE, pair_count);
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
	/* The initial idle snapshot is emitted from status_ccc_changed once the app
	 * subscribes — not on a timer here (it would race the subscribe). */
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
