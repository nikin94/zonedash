// ZoneDash target node (ESP32-C3) — skeleton.
// Senses a hit (ToF short-mode / piezo fallback), timestamps it against the
// central clock, and reports over ESP-NOW. Only the armed target senses; the
// rest idle low-power. No sequencing logic here.
#include <Arduino.h>

#include "pins.h"
#include "protocol.h"

// Set by a Sync packet: central_clock = local_clock + g_clock_offset_us.
static int64_t g_clock_offset_us = 0;
static uint32_t g_session_id = 0;
static bool g_armed = false;

// TODO: esp_now_init, register recv cb (Sync/Arm/Disarm), send Hello.
// TODO: VL53L1X init in SHORT distance mode, ~50 Hz.

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIEZO_ADC, INPUT);
  // TODO: init radio + ToF, announce Hello.
}

void loop() {
  // TODO: while g_armed, poll ToF (enter-then-clear) + piezo; on hit,
  // stamp t_hit in the central domain and send Pressed. Then idle.
  (void)g_clock_offset_us;
  (void)g_session_id;
  (void)g_armed;
}
