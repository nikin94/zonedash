# Solana integration — direction (parked for later)

Not building this now. Recorded so we can return to it in depth once the
hardware/firmware prototype works. **Goal per owner:** combine the hobby with
his Solana stack (from Pyra / Quartz), and leave room to expand the trainer's
capabilities later. Learning / portfolio + product-differentiation angle — **not**
a token / move-to-earn play.

## Framing constraint

The blockchain, like the phone, is **never in the realtime loop**. The drill runs
on the central unit in milliseconds; any on-chain action is a **post-session
settlement** (like the results upload), never during a run. Solana latency is a
non-issue here — and also not an advantage. Clean layer separation: the hardware
and court never know blockchain exists.

## Chosen scope (points 1 + 2)

### 1. Device-signed results (the foundation)

- **Ed25519 is Solana's signature scheme, and the ESP32 does Ed25519 natively.**
  So the central unit (or each target) holds its own keypair and **signs the
  session result with its device key**.
- Gives **tamper-evidence** for leaderboards/records: a result carries crypto
  proof it came from a specific certified device, not typed into an app by hand.
- Works **without any transaction** — the signature can just travel with the
  result; put it on-chain only when needed (tournament, prize, badge mint).
- Honest limit — **oracle problem:** the signature proves "this device said so,"
  not "a human actually ran." A sensor can be fooled (waving a hand at the ToF).
  No crypto gives full anti-cheat; don't oversell it.

### 2. Compressed NFTs (cNFT) for achievements / records

- Solana **state compression** = mint millions of NFTs for pennies — the natural
  fit for badges, personal records, "completed the 30-day challenge," medals.
  Each lands as a cNFT in the athlete's wallet. Cheap, plentiful, collectible.

## Rejected (do not build)

- **Move-to-earn token (StepN-style).** Ponzi-tonomics, StepN collapsed, real
  regulatory risk (looks like an unlicensed security). Red flag.
- **Raw training data on-chain "for data ownership."** Pointless and costly; at
  most a hash on-chain + data in a normal DB. Near-zero user benefit on its own.

## How it would flow (when we build it)

1. Central unit signs the session result with its device Ed25519 key.
2. Phone app (already has a Solana RN stack) pulls the signed packet over BLE.
3. App publishes on-chain **when needed** — mint an achievement cNFT, submit to a
   tournament — verifying the device signature first.

## Future expansion hooks (revisit)

- Provably-fair **tournaments with escrow** (stake entry → on-chain escrow →
  device-signed result decides winner → program pays out). Point 3 from the
  discussion — a real product feature, layered on top of point 1. Parked.
- Per-target keypairs vs one central keypair — decide during firmware design
  (central-only is simpler; per-target is stronger attestation).

_Last updated: 2026-08-03. Parked — return after the prototype proves out._
