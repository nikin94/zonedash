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
// TODO: BLE GATT server (control / status / results). Both wire DIRECTIONS are
//   codec'd in lib/blecodec: decode_control turns an app Control write into a
//   command/DrillConfig, and encode_status_* / encode_results turn brain state
//   into Status/Results notification bytes (mirroring codec.ts decodeStatus /
//   decodeResults). Both directions are pinned against the SHARED fixture
//   docs/ble-vectors.json by test/test_blecodec (which loads the SAME file the
//   app test does, so a byte edit breaks both builds — the cross-language pin,
//   like protocol.h + static_assert for ESP-NOW). Results chunking is codec'd
//   too: results_frame_count / results_frame cut the encode_results buffer into
//   notification-sized slices the app reassembles by concatenation. Still TODO:
//   the GATT server itself — feed characteristic writes to decode_control, and
//   push the encoder bytes as notifications (loop results_frame at the
//   negotiated MTU for a dump; see architecture.md).
//   See docs/architecture.md "Byte-level wire format" + "BLE SessionState
//   translation".
// TODO: Ed25519 device key + sign session result.

void setup() {
  Serial.begin(115200);
  // TODO: init radio, display, BLE; run the serial operator console.
}

void loop() {
  // TODO: serve serial commands (start/stop/random/dump) + tick the engine.
}
