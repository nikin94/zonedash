// ZoneDash central unit (ESP32-S3, Matrix Portal S3) — ESP-NOW bring-up.
// The first hardware increment: prove the radio before the engine, display, or
// BLE are wired. The brain listens for target Hello beacons, discovers each
// node by its MAC (logging RSSI / fw / battery), registers it as a unicast peer
// and sends one Ping back — which the target answers with a Hello, proving the
// link works in BOTH directions. Later increments layer the drill engine, the
// HUB75 panel, BLE, and Ed25519 on top of this proven link (see the TODO ladder
// that used to fill this file — tracked in docs/architecture.md).
//
// The HUB75 panel is NOT needed for this step: bring-up is observed over
// USB-serial @ 115200 (docs/architecture.md "Testing without the app"). This
// file can't be host-compiled (Arduino + esp_now); flash it with
// `pio run -e brain -t upload` and read the serial log.
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include <cstring>

#include "pairing.h" // Mac type (reused; full pairing round is the next increment)
#include "protocol.h"

using namespace zd;

static const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Discovered nodes this session — a flat MAC list, capped at the physical max.
// This is deliberately NOT the pairing TargetMap (that binds MAC→court slot in a
// pairing round, the next increment); here we only prove who is on the air.
static Mac g_nodes[MAX_TARGETS];
static uint8_t g_node_count = 0;

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

static void send_ping(const uint8_t mac[6]) {
  Header ping = {PROTOCOL_VERSION, static_cast<uint8_t>(MsgType::Ping)};
  esp_now_send(mac, reinterpret_cast<const uint8_t*>(&ping), sizeof(ping));
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
      Serial.printf("[hit] pos=%u seq=%u t_hit=%llu sensor=%u\n", p->position,
                    p->seq, (unsigned long long)p->t_hit_us, p->sensor);
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
  add_peer(BROADCAST);
}

void loop() {
  // Nothing to poll yet — discovery is interrupt-driven via the recv callback.
  // Next increment: serial operator console (lib/serialcmd) + drill engine tick.
  delay(1000);
}
