// ESP32-C3 super-mini pin map for a target node.
// GPIO8/9 are strapping pins — reassign if boot glitches.
#pragma once

constexpr int PIN_TOF_SDA = 6;
constexpr int PIN_TOF_SCL = 7;
constexpr int PIN_TOF_INT = 8;   // VL53L1X data-ready IRQ (wake from sleep)
constexpr int PIN_TOF_XSHUT = 9; // VL53L1X reset / address
constexpr int PIN_PIEZO_ADC = 0; // ADC1-0; needs 1MΩ bleed + clamp diodes

// Bring-up hit stub: the super-mini's ONBOARD BOOT button, wired to GPIO9 with
// an external pull-up (it's the strapping pin). Standing in for the trigger
// until the VL53L1X arrives, it lets Arm → Pressed be exercised with ZERO extra
// wiring — press BOOT to fake a hit. Strapping only matters at boot/reset, so
// reading it as a button at runtime is safe. Same GPIO as PIN_TOF_XSHUT on
// purpose: the ToF isn't wired yet, and when it is, the sensor REPLACES this
// stub outright (no button in the ×8 build), so the pin reverts to XSHUT then.
constexpr int PIN_HIT_STUB = 9;
