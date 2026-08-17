// ZoneDash target node (ESP32-C3) — ESP-NOW bring-up.
// Proves the radio link before any sensor exists: the node broadcasts a Hello
// heartbeat so the brain can discover it by MAC, answers a unicast Ping with an
// immediate Hello (round-trip proof), and records the clock offset from a Sync
// beacon (clock_sync wiring, ready for the hit path). The trigger path
// (VL53L1X / piezo) is the NEXT increment — a hit is stubbed by a boot button
// for now so Arm → Pressed can be exercised without the sensors that are still
// in transit.
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

// One dispatch, fed by whichever recv-callback signature the installed Arduino
// core uses (shimmed below). `src`/`rssi` are logged for link diagnostics.
static void handle_recv(const uint8_t* src, int rssi, const uint8_t* data,
                        int len) {
  MsgType type;
  if (!peek_header(data, static_cast<size_t>(len), type)) return; // reject junk
  switch (type) {
    case MsgType::Sync: {
      const Sync* s = reinterpret_cast<const Sync*>(data);
      g_session_id = s->session_id;
      g_clock.addSample(s->t_central_us, static_cast<uint64_t>(esp_timer_get_time()));
      Serial.printf("[sync] session=%u central=%llu synced=%d\n", g_session_id,
                    (unsigned long long)s->t_central_us, (int)g_clock.synced());
      break;
    }
    case MsgType::Arm: {
      const Arm* a = reinterpret_cast<const Arm*>(data);
      g_armed = true;
      g_armed_position = a->position;
      g_armed_seq = a->seq;
      Serial.printf("[arm] pos=%u seq=%u\n", g_armed_position, g_armed_seq);
      break;
    }
    case MsgType::Disarm:
      g_armed = false;
      Serial.println("[disarm]");
      break;
    case MsgType::Ping:
      // Round-trip proof: answer an addressed liveness probe with a fresh Hello.
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
  add_peer(BROADCAST);
  send_hello(); // announce at once so a listening brain finds us immediately
}

void loop() {
  static uint32_t last = 0;
  const uint32_t now = millis();
  if (now - last >= HELLO_INTERVAL_MS) {
    last = now;
    send_hello();
  }
  // TODO(next): while g_armed, poll VL53L1X / piezo (or the stub button); on a
  // hit, stamp t_hit via g_clock.toCentral(esp_timer_get_time()) and send
  // Pressed(position, seq), then g_armed = false.
  (void)g_armed_position;
  (void)g_armed_seq;
}
