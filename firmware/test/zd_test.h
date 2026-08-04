// Zero-dependency test harness — runs on the host (clang++/g++) and doubles as
// the PlatformIO `test_framework = custom` entry point. No Unity, no allocation.
#pragma once
#include <cstdint>
#include <cstdio>

static int zd_checks = 0;
static int zd_fails = 0;

#define ZD_CHECK(cond)                                                    \
  do {                                                                    \
    ++zd_checks;                                                          \
    if (!(cond)) {                                                        \
      ++zd_fails;                                                         \
      std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);       \
    }                                                                     \
  } while (0)

#define ZD_EQ(a, b)                                                       \
  do {                                                                    \
    ++zd_checks;                                                          \
    long long _a = (long long)(a), _b = (long long)(b);                   \
    if (_a != _b) {                                                       \
      ++zd_fails;                                                         \
      std::printf("  FAIL %s:%d  %s == %s  (%lld vs %lld)\n", __FILE__,   \
                  __LINE__, #a, #b, _a, _b);                              \
    }                                                                     \
  } while (0)

#define ZD_RUN(fn)                                                        \
  do {                                                                    \
    int before = zd_fails;                                                \
    fn();                                                                 \
    std::printf("  %-28s %s\n", #fn, before == zd_fails ? "ok" : "FAIL"); \
  } while (0)
