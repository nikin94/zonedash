#include "serial_cmd.h"

#include <cctype>

namespace zd {
namespace {

// Split on runs of ASCII whitespace. Empty input -> empty vector.
std::vector<std::string> tokenize(const std::string& line) {
  std::vector<std::string> out;
  std::string cur;
  for (char c : line) {
    if (std::isspace(static_cast<unsigned char>(c))) {
      if (!cur.empty()) { out.push_back(cur); cur.clear(); }
    } else {
      cur.push_back(c);
    }
  }
  if (!cur.empty()) out.push_back(cur);
  return out;
}

std::string lower(std::string s) {
  for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return s;
}

// Parse a whole token as a decimal uint32. Rejects empty / non-digit input.
bool parse_uint(const std::string& tok, uint32_t& out) {
  if (tok.empty()) return false;
  uint64_t v = 0;
  for (char c : tok) {
    if (c < '0' || c > '9') return false;
    v = v * 10 + static_cast<uint32_t>(c - '0');
    if (v > 0xFFFFFFFFull) return false; // overflow guard
  }
  out = static_cast<uint32_t>(v);
  return true;
}

// Parse "a,b,c" into positions, each validated against `n`.
bool parse_path(const std::string& tok, uint8_t n, std::vector<uint8_t>& out,
                std::string& err) {
  std::string cur;
  auto flush = [&]() -> bool {
    uint32_t v;
    if (!parse_uint(cur, v)) { err = "bad position: " + cur; return false; }
    if (v >= n) { err = "position out of range: " + cur; return false; }
    out.push_back(static_cast<uint8_t>(v));
    cur.clear();
    return true;
  };
  for (char c : tok) {
    if (c == ',') { if (!flush()) return false; }
    else cur.push_back(c);
  }
  if (!flush()) return false;
  if (out.empty()) { err = "empty path"; return false; }
  return true;
}

// Apply "key=value" / flag params common to the drill modes. Unknown key -> error.
bool apply_param(const std::string& tok, DrillConfig& d, std::string& err) {
  if (tok == "repeat") { d.allow_immediate_repeat = true; return true; }
  auto eq = tok.find('=');
  if (eq == std::string::npos) { err = "bad param: " + tok; return false; }
  std::string key = tok.substr(0, eq);
  uint32_t v;
  if (!parse_uint(tok.substr(eq + 1), v)) { err = "bad number in: " + tok; return false; }
  if (key == "count") {
    if (v > 0xFFFF) { err = "count too large (max 65535)"; return false; }
    d.count = static_cast<uint16_t>(v);
  }
  else if (key == "delay") d.delay_ms = v;
  else if (key == "timeout") d.timeout_ms = v;
  else if (key == "dur") d.duration_ms = v;
  else { err = "unknown param: " + key; return false; }
  return true;
}

// A mode token is a keyword; anything else (a digit / comma list) is a path.
bool looks_like_path(const std::string& tok) {
  return !tok.empty() && (tok[0] >= '0' && tok[0] <= '9');
}

ParsedCommand parse_drill(const std::vector<std::string>& t) {
  ParsedCommand c;
  c.type = CmdType::Drill;
  if (t.size() < 3) { c.error = "usage: drill N <rand|path|live|time|list> [params]"; return c; }

  uint32_t n;
  if (!parse_uint(t[1], n) || n < 1 || n > MAX_TARGETS) {
    c.error = "N must be 1.." + std::to_string(MAX_TARGETS);
    return c;
  }
  c.drill.num_positions = static_cast<uint8_t>(n);

  size_t next = 3; // first param token after mode (+ optional path arg)
  std::string mode = lower(t[2]);
  if (mode == "rand") {
    c.drill.mode = DrillMode::Random;
  } else if (mode == "live") {
    c.drill.mode = DrillMode::Live;
  } else if (mode == "time") {
    c.drill.mode = DrillMode::TimeLimited;
  } else if (mode == "path") {
    c.drill.mode = DrillMode::Path;
    if (t.size() < 4) { c.error = "path needs a position list, e.g. path 0,3,5,1"; return c; }
    if (!parse_path(t[3], c.drill.num_positions, c.drill.path, c.error)) return c;
    next = 4;
  } else if (looks_like_path(t[2])) {
    c.drill.mode = DrillMode::Path; // shorthand: `drill 6 0,3,5,1`
    if (!parse_path(t[2], c.drill.num_positions, c.drill.path, c.error)) return c;
  } else {
    c.error = "unknown mode: " + t[2];
    return c;
  }

  for (size_t i = next; i < t.size(); ++i)
    if (!apply_param(t[i], c.drill, c.error)) return c;
  return c;
}

} // namespace

ParsedCommand parse_command(const std::string& line) {
  ParsedCommand c;
  auto t = tokenize(line);
  if (t.empty()) return c; // Empty

  std::string verb = lower(t[0]);
  if (verb == "pair") {
    c.type = CmdType::Pair;
    // N is explicit so the round never depends on hidden state. WHERE each
    // target stands is picked per bind with `spot X` (BLE: SelectPairSpot).
    uint32_t n;
    if (t.size() != 2 || !parse_uint(t[1], n) || n < 1 || n > MAX_TARGETS) {
      c.error = "usage: pair N (1.." + std::to_string(MAX_TARGETS) + ")";
      return c;
    }
    c.num_positions = static_cast<uint8_t>(n);
    return c;
  }
  if (verb == "extend") {
    c.type = CmdType::Extend;
    // Grow the round to N total, keeping existing binds (PairingRound::extend).
    // Whether N actually exceeds the current bound count is round state — the
    // caller checks it; the parser only validates the range.
    uint32_t n;
    if (t.size() != 2 || !parse_uint(t[1], n) || n < 2 || n > MAX_TARGETS) {
      c.error = "usage: extend N (2.." + std::to_string(MAX_TARGETS) + ")";
      return c;
    }
    c.num_positions = static_cast<uint8_t>(n);
    return c;
  }
  if (verb == "spot") {
    c.type = CmdType::Spot;
    uint32_t s;
    if (t.size() != 2 || !parse_uint(t[1], s) || s >= MAX_TARGETS) {
      c.error = "usage: spot S (0.." + std::to_string(MAX_TARGETS - 1) + ")";
      return c;
    }
    c.spot = static_cast<uint8_t>(s);
    return c;
  }
  if (verb == "undo")  { c.type = CmdType::Undo;  return c; }
  if (verb == "nodes") { c.type = CmdType::Nodes; return c; }
  if (verb == "start") { c.type = CmdType::Start; return c; }
  if (verb == "stop")  { c.type = CmdType::Stop;  return c; }
  if (verb == "dump")  { c.type = CmdType::Dump;  return c; }
  if (verb == "sync")  { c.type = CmdType::Sync;  return c; }
  if (verb == "drill") return parse_drill(t);
  if (verb == "sensor") {
    c.type = CmdType::Sensor;
    if (t.size() != 2) { c.error = "usage: sensor tof|piezo"; return c; }
    std::string s = lower(t[1]);
    if (s == "tof") c.sensor = Sensor::ToF;
    else if (s == "piezo") c.sensor = Sensor::Piezo;
    else c.error = "sensor must be tof or piezo";
    return c;
  }

  c.type = CmdType::Unknown;
  c.error = "unknown command: " + t[0];
  return c;
}

} // namespace zd
