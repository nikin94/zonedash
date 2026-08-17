// ZoneDash target node (ESP32-C3) — ESP-NOW bring-up + hit stub.
// Proves the radio link and the hit path before any sensor exists: the node
// broadcasts a Hello heartbeat so the brain can discover it by MAC, answers a
// unicast Ping with an immediate Hello (round-trip proof), records the clock
// offset from a Sync beacon (clock_sync), and — once Armed — reports a Pressed
// hit stamped in the central clock domain. The trigger is STUBBED by the
// onboard BOOT button (pins.h PIN_HIT_STUB) so Arm → Pressed works with zero
// wiring; the VL53L1X / piezo drop in for the button in the next increment.
//
// Bring-up is observed over USB-serial @ 115200 (see docs/architecture.md
// "Testing without the app"). This file can't be host-compiled (Arduino +
// esp_now); it is flashed with `pio run -e target -t upload` and validated on
// the board — the serial log is the source of truth.
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_timer.h>
#include <esp_wifi.h>

#include <cstring>

#include "clock_sync.h"
#include "pins.h"
#include "protocol.h"

using namespace zd;

// Node firmware version reported in Hello — distinct from the wire PROTOCOL_VERSION.
static constexpr uint8_t FW_VERSION = 1;
// How often the node re-announces itself so a brain that boots later still finds
// it (and a link drop shows as a stalled heartbeat in the brain's log).
static constexpr uint32_t HELLO_INTERVAL_MS = 2000;

static const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Set by a Sync beacon: central_clock = clock.toCentral(local_us).
static ClockSync g_clock;
static uint32_t g_session_id = 0;
static bool g_armed = false;
static uint8_t g_armed_position = 0;
static uint16_t g_armed_seq = 0;

// The brain's MAC, learned from ANY brain→target message (Sync/Arm/Ping) so
// Pressed can be UNICAST back to it (a hit is addressed, not broadcast). Learning
// from every brain message — not only the one-shot Ping — is what makes this
// survive a target reset: the brain re-pings only on first discovery, so a node
// that reboots (the C3 USB-CDC reset) would otherwise never re-learn the MAC and
// silently broadcast its hits. The first Arm after a reboot re-teaches it.
static uint8_t g_brain_mac[6] = {};
static bool g_have_brain = false;

// True for exactly one send: set right before a Pressed unicast so the send-cb
// logs THAT tx's delivery status (OK/FAIL) without spamming on every Hello.
static volatile bool g_log_tx = false;

static bool add_peer(const uint8_t mac[6]);

// Remember the brain from any message it sends us, and register it as a unicast
// peer so an addressed Pressed can go straight back.
static void learn_brain(const uint8_t* src) {
  if (g_have_brain && memcmp(g_brain_mac, src, 6) == 0) return;
  memcpy(g_brain_mac, src, 6);
  g_have_brain = true;
  add_peer(g_brain_mac);
}

// Battery telemetry comes later with the ADC divider (bom.md); report 0 until
// then so the Hello field is honest rather than a made-up voltage.
static uint16_t read_batt_mv() { return 0; }

// Register a peer once at the pinned channel; unencrypted for the prototype.
static bool add_peer(const uint8_t mac[6]) {
  if (esp_now_is_peer_exist(mac)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

static void send_hello() {
  Hello h = {};
  h.hdr.version = PROTOCOL_VERSION;
  h.hdr.type = static_cast<uint8_t>(MsgType::Hello);
  h.fw_version = FW_VERSION;
  h.batt_mv = read_batt_mv();
  esp_now_send(BROADCAST, reinterpret_cast<const uint8_t*>(&h), sizeof(h));
}

// Report a hit: stamp it in the CENTRAL clock domain (so the brain can diff it
// against its Arm time), and unicast to the brain if known, else broadcast.
static void send_pressed(uint8_t position, uint16_t seq, uint64_t t_hit_us) {
  Pressed p = {};
  p.hdr.version = PROTOCOL_VERSION;
  p.hdr.type = static_cast<uint8_t>(MsgType::Pressed);
  p.session_id = g_session_id;
  p.position = position;
  p.seq = seq;
  p.t_hit_us = t_hit_us;
  p.sensor = static_cast<uint8_t>(Sensor::Piezo); // stub button ~ contact trigger
  const uint8_t* dst = g_have_brain ? g_brain_mac : BROADCAST;
  g_log_tx = true; // ask the send-cb to report THIS tx's delivery status
  esp_now_send(dst, reinterpret_cast<const uint8_t*>(&p), sizeof(p));
}

// Delivery status for the Pressed tx (esp_now_send only queues; this fires when
// the frame is actually acked/dropped on air). Gated by g_log_tx so a failed
// Hello beacon doesn't spam — we only care whether the HIT got through.
static void on_sent(const uint8_t* mac, esp_now_send_status_t status) {
  if (!g_log_tx) return;
  g_log_tx = false;
  Serial.printf("[tx] pressed -> %02x:%02x:%02x:%02x:%02x:%02x status=%s\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
                status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
}

// One dispatch, fed by whichever recv-callback signature the installed Arduino
// core uses (shimmed below). `src`/`rssi` are logged for link diagnostics.
static void handle_recv(const uint8_t* src, int rssi, const uint8_t* data,
                        int len) {
  MsgType type;
  if (!peek_header(data, static_cast<size_t>(len), type)) return; // reject junk
  switch (type) {
    case MsgType::Sync: {
      learn_brain(src); // any brain message teaches us its MAC (reset-safe)
      const Sync* s = reinterpret_cast<const Sync*>(data);
      g_session_id = s->session_id;
      g_clock.addSample(s->t_central_us, static_cast<uint64_t>(esp_timer_get_time()));
      Serial.printf("[sync] session=%u central=%llu synced=%d\n", g_session_id,
                    (unsigned long long)s->t_central_us, (int)g_clock.synced());
      break;
    }
    case MsgType::Arm: {
      learn_brain(src); // re-teaches the brain MAC after a target reboot
      const Arm* a = reinterpret_cast<const Arm*>(data);
      g_session_id = a->session_id; // same id as the Sync; defensive if Sync missed
      g_armed = true;
      g_armed_position = a->position;
      g_armed_seq = a->seq;
      Serial.printf("[arm] pos=%u seq=%u — press BOOT to hit\n", g_armed_position,
                    g_armed_seq);
      break;
    }
    case MsgType::Disarm:
      g_armed = false;
      Serial.println("[disarm]");
      break;
    case MsgType::Ping:
      // Round-trip proof + learn the brain's MAC so Pressed can be addressed.
      learn_brain(src);
      Serial.printf("[ping] from %02x:%02x:%02x:%02x:%02x:%02x rssi=%d\n",
                    src[0], src[1], src[2], src[3], src[4], src[5], rssi);
      send_hello();
      break;
    default:
      break; // Hello/Pressed/Ack are target→brain; ignore if echoed back
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

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_PIEZO_ADC, INPUT);
  pinMode(PIN_HIT_STUB, INPUT_PULLUP); // onboard BOOT button — active LOW

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  Serial.printf("[boot] target fw=%u mac=%02x:%02x:%02x:%02x:%02x:%02x ch=%u\n",
                FW_VERSION, mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
                ESPNOW_CHANNEL);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[fatal] esp_now_init failed");
    return;
  }
  esp_now_register_recv_cb(on_recv);
  esp_now_register_send_cb(on_sent); // surface Pressed delivery (OK/FAIL)
  add_peer(BROADCAST);
  send_hello(); // announce at once so a listening brain finds us immediately
}

void loop() {
  const uint32_t now = millis();

  static uint32_t last_hello = 0;
  if (now - last_hello >= HELLO_INTERVAL_MS) {
    last_hello = now;
    send_hello();
  }

  // Hit stub: while Armed, a BOOT-button press (falling edge) fires one Pressed.
  // g_armed clears on send, so a single arm yields exactly one hit — no debounce
  // needed for bounce within the window. The VL53L1X / piezo replaces this poll.
  static bool prev_pressed = false;
  const bool pressed = digitalRead(PIN_HIT_STUB) == LOW;
  if (g_armed && pressed && !prev_pressed) {
    const uint64_t local_us = static_cast<uint64_t>(esp_timer_get_time());
    const uint64_t t_hit = g_clock.synced() ? g_clock.toCentral(local_us) : local_us;
    send_pressed(g_armed_position, g_armed_seq, t_hit);
    g_armed = false;
    Serial.printf("[hit] sent pos=%u seq=%u t_hit=%llu\n", g_armed_position,
                  g_armed_seq, (unsigned long long)t_hit);
  }
  prev_pressed = pressed;

  delay(5); // light poll cadence — plenty for a hand press, keeps CPU idle
}
