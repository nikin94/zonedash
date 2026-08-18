// ZoneDash central unit (ESP32-S3, Matrix Portal S3) — ESP-NOW bring-up + hit
// cycle. Builds on the proven radio link: the brain discovers a target by its
// Hello, pings it (round-trip proof), then runs a simple ARM cycle so the whole
// hit path can be exercised end to end without a display, BLE, or the drill
// engine. It Syncs its clock to the node, Arms it, and waits for a Pressed —
// then logs the reaction time (t_hit − t_arm, both in the brain's clock domain)
// and re-arms after a beat. On the target, a BOOT-button press stands in for the
// sensor (still in transit). The drill engine / HUB75 / BLE layer on top later.
//
// The HUB75 panel is NOT needed for this step: bring-up is observed over
// USB-serial @ 115200 (docs/architecture.md "Testing without the app"). This
// file can't be host-compiled (Arduino + esp_now); flash it with
// `pio run -e brain -t upload` and read the serial log.
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_timer.h>
#include <esp_wifi.h>

#include <cstdio>
#include <cstring>

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#include "layout.h"  // host-tested panel geometry (lib/display)
#include "pairing.h" // Mac type (reused; full pairing round is the next increment)
#include "protocol.h"

using namespace zd;

static const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Discovered nodes this session — a flat MAC list, capped at the physical max.
// This is deliberately NOT the pairing TargetMap (that binds MAC→court slot in a
// pairing round, the next increment); here we only prove who is on the air.
static Mac g_nodes[MAX_TARGETS];
static uint8_t g_node_count = 0;

// Arm-cycle state: drives Sync → Arm → (await Pressed) → re-arm against node 0,
// so a single target proves the full hit path. Multi-node arming waits for the
// pairing round + drill engine.
static uint32_t g_session_id = 0;
static bool g_synced = false;      // Sync sent for this session
static bool g_awaiting_hit = false;
static uint16_t g_seq = 0;         // step index, bumped per Arm
static uint64_t g_arm_us = 0;      // brain clock at the last Arm (reaction base)
static uint32_t g_next_arm_ms = 0; // when to Arm next (post-Sync / post-hit beat)
static uint32_t g_arm_deadline_ms = 0; // re-arm if no press by here

static constexpr uint32_t REARM_DELAY_MS = 1500;  // beat between hit and next Arm
static constexpr uint32_t ARM_TIMEOUT_MS = 15000; // missed-press safety re-arm

// Display state read by render_display: the last reaction shown in the status
// strip (-1 = none yet) and a brief green flash on the hit dot.
static double g_last_rt_ms = -1.0;
static uint32_t g_hit_flash_until = 0;
static constexpr uint32_t HIT_FLASH_MS = 300;

static bool mac_eq(const uint8_t* a, const Mac& b) {
  return memcmp(a, b.data(), 6) == 0;
}

// Returns true if this MAC is newly seen (added to the list); false if known or
// the list is full.
static bool remember_node(const uint8_t* mac) {
  for (uint8_t i = 0; i < g_node_count; i++)
    if (mac_eq(mac, g_nodes[i])) return false;
  if (g_node_count >= MAX_TARGETS) return false;
  memcpy(g_nodes[g_node_count].data(), mac, 6);
  g_node_count++;
  return true;
}

static bool add_peer(const uint8_t mac[6]) {
  if (esp_now_is_peer_exist(mac)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

// Surface an addressed tx that never reached its peer — a unicast Arm/Sync/Ping
// to a node that dropped off (a Pressed we're waiting on then simply never
// comes). Success is silent to keep the log readable; only a FAIL is news.
static void on_sent(const uint8_t* mac, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) return;
  Serial.printf("[tx-fail] -> %02x:%02x:%02x:%02x:%02x:%02x\n", mac[0], mac[1],
                mac[2], mac[3], mac[4], mac[5]);
}

static void send_ping(const uint8_t mac[6]) {
  Header ping = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Ping)};
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&ping), sizeof(ping));
}

// Broadcast the central clock so the node can map its local µs into this domain.
static void send_sync(const uint8_t mac[6], uint32_t session, uint64_t central_us) {
  Sync s = {};
  s.hdr.version = PROTOCOL_VERSION;
  s.hdr.type = static_cast<uint8_t>(MsgType::Sync);
  s.session_id = session;
  s.t_central_us = central_us;
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&s), sizeof(s));
}

static void send_arm(const uint8_t mac[6], uint32_t session, uint8_t position,
                     uint16_t seq) {
  Arm a = {};
  a.hdr.version = PROTOCOL_VERSION;
  a.hdr.type = static_cast<uint8_t>(MsgType::Arm);
  a.session_id = session;
  a.position = position;
  a.seq = seq;
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&a), sizeof(a));
}

static void handle_recv(const uint8_t* src, int rssi, const uint8_t* data,
                        int len) {
  MsgType type;
  if (!peek_header(data, static_cast<size_t>(len), type)) return; // reject junk
  switch (type) {
    case MsgType::Hello: {
      const Hello* h = reinterpret_cast<const Hello*>(data);
      const bool is_new = remember_node(src);
      Serial.printf("[%s] %02x:%02x:%02x:%02x:%02x:%02x rssi=%d fw=%u batt=%umV%s\n",
                    is_new ? "new " : "beat", src[0], src[1], src[2], src[3],
                    src[4], src[5], rssi, h->fw_version, h->batt_mv,
                    is_new ? "  (pinging back)" : "");
      if (is_new) {
        add_peer(src); // register before the first unicast to it
        send_ping(src);
      }
      break;
    }
    case MsgType::Pressed: {
      const Pressed* p = reinterpret_cast<const Pressed*>(data);
      // Reaction = hit − arm, both in the brain's clock (target maps t_hit into
      // it via Sync). Guard a hit stamped before the arm (unsynced / stray).
      const double rt_ms =
          p->t_hit_us > g_arm_us ? (p->t_hit_us - g_arm_us) / 1000.0 : 0.0;
      Serial.printf("[hit] pos=%u seq=%u reaction=%.1fms sensor=%u\n", p->position,
                    p->seq, rt_ms, p->sensor);
      g_awaiting_hit = false;
      g_next_arm_ms = millis() + REARM_DELAY_MS;
      g_last_rt_ms = rt_ms;                          // show it in the status strip
      g_hit_flash_until = millis() + HIT_FLASH_MS;   // flash the hit dot green
      break;
    }
    default:
      break; // Sync/Arm/Disarm/Ping are brain→target; ignore if echoed back
  }
}

#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void on_recv(const esp_now_recv_info_t* info, const uint8_t* data,
                    int len) {
  handle_recv(info->src_addr, info->rx_ctrl ? info->rx_ctrl->rssi : 0, data, len);
}
#else
static void on_recv(const uint8_t* src, const uint8_t* data, int len) {
  handle_recv(src, 0, data, len);
}
#endif

// ── HUB75 display (ESP32-HUB75-MatrixPanel-DMA on MatrixPortal S3) ───────────
// Fixed MatrixPortal S3 HUB75 pin map (Adafruit) in this lib's i2s_pins order:
// r1,g1,b1, r2,g2,b2, a,b,c,d,e, lat,oe,clk. A 64x64 panel uses 5 address lines
// (A..E, the E pin); a 64x32 would drop E — pass e=-1 and PANEL_H=32 if the
// image comes out vertically doubled. The FM6126A driver init (mxconfig.driver)
// is what Protomatter lacked; without it this generic panel showed garbage.
// Brightness is capped low + a sparse dark screen keeps the draw inside a
// USB-bench power budget (no 5 V boost needed to develop the UI).
static HUB75_I2S_CFG::i2s_pins DISP_PINS = {
    42, 41, 40, 38, 39, 37, // r1 g1 b1 r2 g2 b2
    45, 36, 48, 35, 21,     // a b c d e
    47, 14, 2,              // lat oe clk
};
static MatrixPanel_I2S_DMA* matrix = nullptr;
static bool g_display_ok = false;

// Render one frame: a 12 px status strip (name + last reaction) over the 8-slot
// layout map. Only node 0 exists this increment, so its dot tracks the live
// arm/hit state; the others are dim "off" markers so the court map still reads.
// Dim colours cap the panel draw for USB-bench power.
static void render_display() {
  if (!g_display_ok) return;
  const uint32_t now = millis();
  matrix->fillScreen(0);

  matrix->setTextColor(matrix->color565(220, 220, 220));
  matrix->setCursor(1, 2);
  matrix->print("ZD");
  if (g_last_rt_ms >= 0) {
    char buf[12];
    snprintf(buf, sizeof(buf), "%dms", (int)(g_last_rt_ms + 0.5));
    matrix->setCursor(PANEL_W - (int)strlen(buf) * 6, 2);
    matrix->print(buf);
  }

  for (uint8_t i = 0; i < MAX_TARGETS; i++) {
    const Point p = spot_xy(i);
    uint16_t col = matrix->color565(60, 60, 60); // unbound / off marker
    int half = 1;                                // every spot visible for now
    if (i == 0 && g_node_count > 0) {
      if (now < g_hit_flash_until) {
        col = matrix->color565(0, 255, 0); // hit flash (green)
        half = 2;
      } else if (g_awaiting_hit) {
        col = matrix->color565(90, 70, 255); // armed (accent)
        half = 2;
      } else {
        col = matrix->color565(180, 180, 180); // bound, idle (dim white)
        half = 1;
      }
    }
    matrix->fillRect(p.x - half, p.y - half, 2 * half + 1, 2 * half + 1, col);
  }
  // Single-buffered: the draw is live, no flush call needed.
}

void setup() {
  Serial.begin(115200);
  delay(200);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  Serial.printf("[boot] brain mac=%02x:%02x:%02x:%02x:%02x:%02x ch=%u — listening\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], ESPNOW_CHANNEL);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[fatal] esp_now_init failed");
    return;
  }
  esp_now_register_recv_cb(on_recv);
  esp_now_register_send_cb(on_sent); // report a unicast that never landed
  add_peer(BROADCAST);

  // Bring the panel up LAST, after the radio, so this one run also proves the
  // HUB75 output and ESP-NOW coexist on the S3 (the BOM's radio-coexistence
  // risk). A begin() failure is non-fatal: the radio cycle keeps running, so a
  // dead panel is told apart from a dead link in the serial log.
  HUB75_I2S_CFG mxconfig(PANEL_W, PANEL_H, 1 /*chain*/, DISP_PINS);
  mxconfig.driver = HUB75_I2S_CFG::FM6126A; // the init Protomatter lacked
  matrix = new MatrixPanel_I2S_DMA(mxconfig);
  g_display_ok = matrix->begin();
  if (g_display_ok) {
    matrix->setBrightness8(128); // ~50% — bench-readable; the UI is sparse (text
                                 // + a few dots), so the draw stays small even
                                 // here. Re-cap lower for battery in the final build.
    matrix->clearScreen();
  }
  Serial.printf("[disp] hub75-dma begin=%d driver=FM6126A (%s)\n",
                (int)g_display_ok, g_display_ok ? "ok" : "FAILED");
}

void loop() {
  const uint32_t now = millis();

  // Redraw at ~20 fps regardless of radio state, so the idle map shows before a
  // node is discovered and the armed/hit dot tracks the cycle after.
  static uint32_t last_render = 0;
  if (g_display_ok && now - last_render >= 50) {
    last_render = now;
    render_display();
  }

  if (g_node_count == 0) {
    delay(50); // nothing discovered yet — discovery is recv-callback driven
    return;
  }
  const uint8_t* node = g_nodes[0].data();

  // Establish the clock once, then let the target record the offset for a beat
  // before the first Arm, so t_hit maps cleanly into the brain's domain.
  if (!g_synced) {
    g_session_id++;
    send_sync(node, g_session_id, static_cast<uint64_t>(esp_timer_get_time()));
    g_synced = true;
    g_next_arm_ms = now + 500;
    Serial.printf("[sync] session=%u sent to node0\n", g_session_id);
  }

  // Arm the node when it's time and we're not already waiting on a hit.
  if (!g_awaiting_hit && static_cast<int32_t>(now - g_next_arm_ms) >= 0) {
    g_seq++;
    // Re-Sync the node's clock on every arm: a target that rebooted (the C3
    // USB-CDC reset) lost its offset, so an Arm without a fresh Sync would stamp
    // t_hit in the node's own domain and the reaction would read 0. One tiny
    // extra packet keeps the hit timestamp comparable across a node reset.
    send_sync(node, g_session_id, static_cast<uint64_t>(esp_timer_get_time()));
    g_arm_us = static_cast<uint64_t>(esp_timer_get_time());
    send_arm(node, g_session_id, 0 /*position*/, g_seq);
    g_awaiting_hit = true;
    g_arm_deadline_ms = now + ARM_TIMEOUT_MS;
    Serial.printf("[arm] node0 seq=%u — press the target's BOOT button\n", g_seq);
  }

  // A missed press must not wedge the cycle: re-arm after the timeout.
  if (g_awaiting_hit && static_cast<int32_t>(now - g_arm_deadline_ms) >= 0) {
    Serial.printf("[arm] timeout seq=%u — no hit, re-arming\n", g_seq);
    g_awaiting_hit = false;
    g_next_arm_ms = now;
  }

  delay(10);
}
