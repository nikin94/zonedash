// ZoneDash serial operator protocol — the parser for the line-based ASCII
// commands the bench operator sends over USB-serial (see architecture.md).
// Pure and host-testable: parse a line into a structured command; the caller
// executes it. Each command maps 1:1 to a future BLE Control write, so the
// engine is driven identically over serial or BLE.
#pragma once
#include <cstdint>
#include <string>

#include "../engine/drill_engine.h" // DrillConfig / DrillMode (reused, not duplicated)
#include "../protocol/protocol.h"   // Sensor, MAX_TARGETS

namespace zd {

enum class CmdType : uint8_t {
  Empty,   // blank / whitespace-only line — no-op
  Pair,    // enter pairing round
  Nodes,   // list paired targets
  Drill,   // load a drill (fills `drill`)
  Start,   // run the loaded drill
  Stop,    // abort + disarm all
  Dump,    // print session hit records as CSV
  Sensor,  // select trigger for the A/B test (fills `sensor`)
  Sync,    // force a clock re-sync beacon
  Unknown, // unrecognized verb (see `error`)
};

struct ParsedCommand {
  CmdType type = CmdType::Empty;
  std::string error;           // non-empty => malformed; human-readable reason
  DrillConfig drill;           // valid when type == Drill && ok()
  Sensor sensor = Sensor::ToF; // valid when type == Sensor && ok()

  bool ok() const { return error.empty(); }
};

// Parse one protocol line. Case-insensitive verb, tolerant of extra
// whitespace, never throws. A blank line is Empty (ok); a bad line keeps its
// best-guessed type and carries a reason in `error`.
ParsedCommand parse_command(const std::string& line);

} // namespace zd
