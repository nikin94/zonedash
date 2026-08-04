#!/usr/bin/env sh
# Compile and run every native (host) test suite. Convention: test/test_<lib>/
# pairs with lib/<lib>/ — a new suite that follows it is picked up here for free,
# no edits needed. Used both locally and by CI (.github/workflows/ci.yml).
set -eu
cd "$(dirname "$0")/.." # -> firmware/
CXX="${CXX:-c++}"
FLAGS="-std=c++17 -Wall -Wextra -Werror"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
for dir in test/test_*/; do
  name="$(basename "$dir" | sed 's/^test_//')"
  lib="lib/$name"
  [ -d "$lib" ] || { echo "skip $dir (no $lib)"; continue; }
  # A lib may be header-only (e.g. protocol/): only pass its .cpp files if any
  # exist, so the compile line doesn't get a literal unmatched glob.
  srcs=""
  for f in "$lib"/*.cpp; do [ -e "$f" ] && srcs="$srcs $f"; done
  # A compile failure in one suite must not abort the rest: run each in an `if`
  # so `set -e` doesn't kill the loop, and record the failure.
  # shellcheck disable=SC2086 -- globs must word-split into separate args
  if $CXX $FLAGS -I "$lib" $srcs ${dir}*.cpp -o "$tmp/$name"; then
    "$tmp/$name" || fail=1
  else
    echo "COMPILE FAILED: $dir"; fail=1
  fi
done
exit $fail
