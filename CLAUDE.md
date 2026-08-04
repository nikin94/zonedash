# CLAUDE.md

Entry point for any agent or contributor joining ZoneDash with an empty context.
Read this first, then `docs/` for the system design.

## What this is

A wireless court reaction / footwork trainer for badminton. Targets ring one
player's half of the court; a central unit lights them in sequence, the player
reaches the lit target, it clears, the next lights, and timing is recorded.
Rebuild of a wired Raspberry-Pi prototype (`docs/history-v0.md`).

Three sides: **phone (operator app) ⇄ central unit (display + brain) ⇄ 8 targets.**
The realtime loop lives on the central unit, never on the phone.

## Repo map

```
docs/          Design + decisions — read before touching code
firmware/      PlatformIO: one project, two builds (brain=ESP32-S3, target=ESP32-C3)
  lib/         Hardware-free, host-testable cores (engine, clocksync, protocol)
  src/         Board firmware (brain/, target/) — needs Espressif toolchain + real boards
  test/        Native test suites (run on the host, no hardware)
app/           React Native (Expo) operator app — runnable shell (see app/README.md)
```

Start with `docs/concept.md` (product + decisions), then `docs/architecture.md`
(protocol, timing, radio, BLE, serial, build order).

## Working agreement (non-negotiable)

- **One feature = one branch + one PR.** No direct pushes to `main` (it is
  branch-protected; pushes are rejected).
- **Never merge a PR yourself.** Open it, add the owner as assignee, wait for an
  explicit "merge" from the owner. This holds even when CI is green.
- **English only** in all code, comments, PR titles/descriptions, and docs.
  (Russian is for owner ⇄ agent chat only, never in the repo.)
- **Tests are mandatory** for every code change where testable. New logic goes in
  a host-testable `lib/` module with a matching `test/test_<lib>/` suite.
- **Keep code comments short and to the point** — explain the non-obvious, skip
  narration.
- **Keep docs current.** A decision or design change lands in `docs/` in the same
  PR that makes it.

## Git identity

Commit as `Serhiy <nikin1994@gmail.com>`:

```
git -c user.name="Serhiy" -c user.email="nikin1994@gmail.com" commit ...
```

## Running the tests

Host-only, no hardware needed (needs `clang++` or `g++`):

```
cd firmware && ./test/run_native.sh
```

It auto-discovers every `test/test_<lib>/` suite against its `lib/<lib>/`,
compiles with `-Wall -Wextra`, and exits non-zero on any failure. The same
script runs in CI (`.github/workflows/ci.yml`) on every push to `main` and every
PR — a green run is a required check before merge.

Adding a new core: put it in `lib/<name>/`, add `test/test_<name>/test_<name>.cpp`
that includes `../zd_test.h` and returns non-zero on failure — the runner and CI
pick it up with no config change.

App checks (Jest via jest-expo + `tsc --noEmit`), also run in CI:

```
cd app && npm install && npm run typecheck && npm test
```

## Status

Prototype-first. Hardware on order (VL53L1X ToF is the long-lead item). The
hardware-free cores (drill engine, clock sync, serial command parser, pairing
round, wire protocol) are written and tested; board firmware stays a skeleton
until boards arrive. The Expo app is a runnable shell (no BLE yet).
