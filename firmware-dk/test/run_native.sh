#!/usr/bin/env sh
# Host-compile and run the DK wire codec test. The Zephyr app itself can't build
# in CI (needs the nRF Connect SDK), but its byte-layout functions (src/dk_wire.c)
# are pure C — so they ARE host-tested and pinned against the shared fixture
# docs/ble-vectors.json, exactly like firmware/test/test_blecodec. See
# firmware-dk/README.md "Status".
set -eu
cd "$(dirname "$0")/.." # -> firmware-dk/
CC="${CC:-cc}"
CXX="${CXX:-c++}"
WARN="-Wall -Wextra -Werror"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Compile dk_wire.c honestly as C (as Zephyr does — the extern "C" header keeps
# linkage compatible), then link it into the C++ test, which reuses the ESP32
# test tree's tiny JSON reader (json.h) and assert harness (zd_test.h).
$CC -std=c11 $WARN -I src -c src/dk_wire.c -o "$tmp/dk_wire.o"
$CXX -std=c++17 $WARN -I src -I ../firmware/test/test_blecodec -I ../firmware/test \
	test/test_dk_wire.cpp "$tmp/dk_wire.o" -o "$tmp/dk_wire"
# Runs from firmware-dk/, so the default ../docs/ble-vectors.json resolves; an
# explicit fixture path can be passed through for a drift check.
"$tmp/dk_wire" "$@"
