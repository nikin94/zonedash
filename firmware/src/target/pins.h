// ESP32-C3 super-mini pin map for a target node.
// GPIO8/9 are strapping pins — reassign if boot glitches.
#pragma once

constexpr int PIN_TOF_SDA = 6;
constexpr int PIN_TOF_SCL = 7;
constexpr int PIN_TOF_INT = 8;   // VL53L1X data-ready IRQ (wake from sleep)
constexpr int PIN_TOF_XSHUT = 9; // VL53L1X reset / address
constexpr int PIN_PIEZO_ADC = 0; // ADC1-0; needs 1MΩ bleed + clamp diodes
