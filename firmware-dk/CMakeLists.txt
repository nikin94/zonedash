# ZoneDash DK reference peripheral — a Zephyr / nRF Connect SDK application.
# Bench tool ONLY: it impersonates the central unit's BLE GATT service on an
# nRF52840-DK so the phone app's real BLE stack (BlePlxPeripheral -> radio) can
# be exercised end to end without the ESP32-S3 brain. It is NOT the product
# firmware and is deliberately outside the ESP32 PlatformIO tree (firmware/) and
# outside CI — see README.md.
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zonedash_dk)

target_sources(app PRIVATE src/main.c src/dk_wire.c)
