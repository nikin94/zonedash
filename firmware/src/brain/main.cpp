// ZoneDash central unit (ESP32-S3) — skeleton.
// Owns the drill engine (sequence, timing, result buffer), drives the HUB75
// display, speaks ESP-NOW to targets and BLE to the app, and signs results
// (Ed25519) for the optional on-chain layer. Single-target arming: only the
// current target is armed, so hits on any other are ignored for free.
//
// Bring-up is driven over USB-serial (no app needed) — see
// docs/architecture.md "Testing without the app".
#include <Arduino.h>

#include "protocol.h"

// TODO: esp_now_init + recv cb (Hello/Pressed); MAC→position pairing map.
// TODO: HUB75 init (ESP32-HUB75-MatrixPanel-DMA): court layout + score/time.
// TODO: drill engine — arm current target, await Pressed, advance, buffer hits.
// TODO: clock sync — broadcast Sync at session start; stamp `lit` on flush.
// TODO: BLE GATT (control / status / results) — byte format defined in
//   app/src/ble/codec.ts, pinned by the SHARED golden fixture docs/ble-vectors.json.
//   The C++ decoder's host test MUST load and assert against that SAME file (as
//   the app test does), so a byte edit breaks both builds — the cross-language
//   pin, like protocol.h + static_assert for ESP-NOW. See docs/architecture.md
//   "Byte-level wire format" + "BLE SessionState translation".
// TODO: Ed25519 device key + sign session result.

void setup() {
  Serial.begin(115200);
  // TODO: init radio, display, BLE; run the serial operator console.
}

void loop() {
  // TODO: serve serial commands (start/stop/random/dump) + tick the engine.
}
