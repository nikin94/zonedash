// Tiny recursive-descent JSON reader — JUST enough to load the shared BLE
// fixture (docs/ble-vectors.json) in the C++ host test, so that test asserts
// against the SAME file the app test does instead of transcribing its bytes.
// Host-only test support (uses the STL freely, like the engine/serialcmd tests);
// never compiled into firmware. Not a general JSON library: it handles the
// object / array / string / number / bool / null the fixture uses and aborts on
// anything malformed — a parse failure must be loud, never a silent empty value
// that would mask fixture drift.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <map>
#include <string>
#include <vector>

namespace zdjson {

struct Value;
using Array = std::vector<Value>;
using Object = std::map<std::string, Value>;

enum class Type { Null, Bool, Number, String, Array, Object };

struct Value {
  Type type = Type::Null;
  bool b = false;
  double num = 0;
  std::string str;
  Array arr;
  Object obj;

  // Typed accessors — each aborts (loud, never silent) if the shape is wrong or
  // a key is missing, so a fixture the test doesn't understand fails the run
  // rather than reading a zero.
  const Value& operator[](const char* key) const {
    if (type != Type::Object) fail("not an object");
    auto it = obj.find(key);
    if (it == obj.end()) fail((std::string("missing key: ") + key).c_str());
    return it->second;
  }
  bool has(const char* key) const {
    return type == Type::Object && obj.find(key) != obj.end();
  }
  int as_int() const {
    if (type != Type::Number) fail("not a number");
    return static_cast<int>(num);
  }
  bool as_bool() const {
    if (type != Type::Bool) fail("not a bool");
    return b;
  }
  const std::string& as_string() const {
    if (type != Type::String) fail("not a string");
    return str;
  }
  const Array& as_array() const {
    if (type != Type::Array) fail("not an array");
    return arr;
  }
  bool is_null() const { return type == Type::Null; }

  [[noreturn]] static void fail(const char* msg) {
    std::fprintf(stderr, "json: %s\n", msg);
    std::exit(2);
  }
};

class Parser {
 public:
  explicit Parser(const std::string& src) : s_(src) {}

  Value parse() {
    Value v = value();
    skip_ws();
    if (i_ != s_.size()) Value::fail("trailing content after JSON");
    return v;
  }

 private:
  const std::string& s_;
  size_t i_ = 0;

  void skip_ws() {
    while (i_ < s_.size()) {
      char c = s_[i_];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') ++i_;
      else break;
    }
  }
  char peek() {
    skip_ws();
    if (i_ >= s_.size()) Value::fail("unexpected end of input");
    return s_[i_];
  }
  void expect(char c) {
    if (peek() != c) Value::fail("unexpected character");
    ++i_;
  }
  bool consume(const char* lit) {
    skip_ws();
    size_t n = 0;
    while (lit[n]) ++n;
    if (s_.compare(i_, n, lit) == 0) { i_ += n; return true; }
    return false;
  }

  Value value() {
    char c = peek();
    if (c == '{') return object();
    if (c == '[') return array();
    if (c == '"') return string_value();
    if (c == 't' || c == 'f') return bool_value();
    if (c == 'n') { if (!consume("null")) Value::fail("bad null"); return Value{}; }
    return number_value();
  }

  Value object() {
    Value v;
    v.type = Type::Object;
    expect('{');
    if (peek() == '}') { ++i_; return v; }
    for (;;) {
      std::string key = raw_string();
      expect(':');
      v.obj.emplace(key, value());
      char c = peek();
      if (c == ',') { ++i_; continue; }
      if (c == '}') { ++i_; break; }
      Value::fail("expected , or } in object");
    }
    return v;
  }

  Value array() {
    Value v;
    v.type = Type::Array;
    expect('[');
    if (peek() == ']') { ++i_; return v; }
    for (;;) {
      v.arr.push_back(value());
      char c = peek();
      if (c == ',') { ++i_; continue; }
      if (c == ']') { ++i_; break; }
      Value::fail("expected , or ] in array");
    }
    return v;
  }

  // The fixture uses only plain ASCII strings (keys, mode names) — no escapes
  // beyond the quote, which is all this needs to handle.
  std::string raw_string() {
    expect('"');
    std::string out;
    while (i_ < s_.size() && s_[i_] != '"') {
      if (s_[i_] == '\\') { // pass an escaped char through verbatim
        ++i_;
        if (i_ >= s_.size()) Value::fail("bad string escape");
      }
      out.push_back(s_[i_++]);
    }
    if (i_ >= s_.size()) Value::fail("unterminated string");
    ++i_; // closing quote
    return out;
  }

  Value string_value() {
    Value v;
    v.type = Type::String;
    v.str = raw_string();
    return v;
  }

  Value bool_value() {
    Value v;
    v.type = Type::Bool;
    if (consume("true")) v.b = true;
    else if (consume("false")) v.b = false;
    else Value::fail("bad bool");
    return v;
  }

  Value number_value() {
    skip_ws();
    size_t start = i_;
    while (i_ < s_.size()) {
      char c = s_[i_];
      if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' ||
          c == 'e' || c == 'E') ++i_;
      else break;
    }
    if (i_ == start) Value::fail("expected a number");
    Value v;
    v.type = Type::Number;
    v.num = std::strtod(s_.substr(start, i_ - start).c_str(), nullptr);
    return v;
  }
};

// Read a file whole, aborting loudly if it can't be opened — a missing fixture
// must fail the test, never let it pass vacuously.
inline std::string read_file(const char* path) {
  std::FILE* f = std::fopen(path, "rb");
  if (!f) {
    std::fprintf(stderr, "json: cannot open %s\n", path);
    std::exit(2);
  }
  std::string out;
  char buf[4096];
  size_t n;
  while ((n = std::fread(buf, 1, sizeof(buf), f)) > 0) out.append(buf, n);
  std::fclose(f);
  return out;
}

inline Value parse_file(const char* path) {
  return Parser(read_file(path)).parse();
}

} // namespace zdjson
