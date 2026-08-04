#!/usr/bin/env sh
# Compile and run every native (host) test suite. Convention: test/test_<lib>/
# pairs with lib/<lib>/ — a new suite that follows it is picked up here for free,
# no edits needed. Used both locally and by CI (.github/workflows/ci.yml).
set -eu
cd "$(dirname "$0")/.." # -> firmware/
CXX="${CXX:-c++}"
FLAGS="-std=c++17 -Wall -Wextra"
tmp="$(mktemp -d)"
fail=0
for dir in test/test_*/; do
  name="$(basename "$dir" | sed 's/^test_//')"
  lib="lib/$name"
  [ -d "$lib" ] || { echo "skip $dir (no $lib)"; continue; }
  # shellcheck disable=SC2086 -- globs must word-split into separate args
  $CXX $FLAGS -I "$lib" $lib/*.cpp ${dir}*.cpp -o "$tmp/$name"
  "$tmp/$name" || fail=1
done
exit $fail
