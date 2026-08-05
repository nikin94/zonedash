/**
 * Mock central unit — an in-app simulator behind the CentralTransport seam, so
 * every screen can be built and tested in Expo Go before the real BLE link
 * (dev-client + react-native-ble-plx) or the S3 hardware exists.
 *
 * Behavior mirrors the firmware cores: a pairing round binds N targets one by
 * one, each at an operator-picked court spot with a two-tap confirm
 * (lib/pairing); a session arms one target at a time and resolves each step as
 * a hit or a timeout miss (lib/engine — misses exist only when timeoutMs > 0).
 * Timings are configurable so tests can run on fake timers.
 */
import type { HitRecord, PairingProgress } from "./contract";
import type {
  CentralTransport,
  ConnectionState,
  DrillConfig,
  SessionState,
  StatusEvent,
  Unsubscribe,
} from "./transport";

export interface MockOptions {
  /** Simulated link latency for connect and command round-trips. */
  latencyMs?: number;
  /** Simulated time between auto-run drill steps (random/path/time). */
  stepMs?: number;
  /** Fixed override for the simulated human tap latency (see TAP_MIN/MAX_MS).
   *  The app leaves it random; tests set a small deterministic value. */
  tapDelayMs?: number;
  /** Every n-th step of a session is a timeout miss (0 = never). Only takes
   *  effect when the drill has timeoutMs > 0 — matching lib/engine, a drill
   *  without a timeout can never miss. */
  missEvery?: number;
  /** Make connect() fail — exercises the error path real BLE will hit
   *  (Bluetooth off, device not found, permissions denied). */
  failConnect?: boolean;
}

const clampPositions = (n: number) => Math.max(1, Math.min(8, Math.floor(n) || 1));

// Simulated human tap latency — the gap the mock waits before a "physical"
// target tap registers: each pairing-confirm tap, and (in live mode) both the
// arm after the operator's pick and the athlete's hit. Randomised in this
// range so the flow feels human-paced instead of instant.
const TAP_MIN_MS = 750;
const TAP_MAX_MS = 1000;

export class MockCentralTransport implements CentralTransport {
  connectionState: ConnectionState = "disconnected";

  private readonly latencyMs: number;
  private readonly stepMs: number;
  private readonly tapDelayMs?: number;
  private readonly missEvery: number;
  private readonly failConnect: boolean;

  private listeners = new Set<(e: StatusEvent) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private connectPromise: Promise<void> | null = null;
  private session: SessionState = "idle";
  private drill: DrillConfig = { mode: "random", numPositions: 8, count: 10 };
  private paired = 0; // targets bound by the last pairing round
  private pairing: { total: number; bound: number[]; current: number | null } | null = null;
  private hits: HitRecord[] = [];
  private liveArmed = false; // a live target is lit or in flight — ignore taps
  private liveSeq = 0; // step counter for the current live session

  constructor(opts: MockOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 150;
    this.stepMs = opts.stepMs ?? 900;
    this.tapDelayMs = opts.tapDelayMs;
    this.missEvery = opts.missEvery ?? 4;
    this.failConnect = opts.failConnect ?? false;
  }

  connect(): Promise<void> {
    if (this.connectionState === "connected") return Promise.resolve();
    // A second call while connecting joins the in-flight attempt.
    if (this.connectPromise) return this.connectPromise;
    this.setConnection("connecting");
    this.connectPromise = (async () => {
      await this.wait(this.latencyMs);
      if (this.failConnect) {
        this.setConnection("error", "mock: connect failed");
        throw new Error("connect failed");
      }
      this.setConnection("connected");
      this.emitSession();
    })().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.clearTimers();
    this.session = "idle";
    this.setConnection("disconnected");
  }

  async startPairing(numTargets: number): Promise<void> {
    this.assertConnected();
    const total = clampPositions(numTargets);
    this.session = "pairing";
    this.paired = 0;
    this.pairing = { total, bound: [], current: null };
    this.emitSession();
    // The round opens waiting for the operator's first spot pick — nothing is
    // prompted until selectPairingSpot arrives.
    this.after(this.latencyMs, () => this.emitPairing(false));
  }

  async selectPairingSpot(spot: number): Promise<void> {
    this.assertConnected();
    const p = this.pairing;
    if (!p || this.session !== "pairing") throw new Error("no pairing round");
    const s = Math.floor(spot);
    if (s < 0 || s >= 8) throw new Error("bad spot");
    // A prompt already in flight or an already-bound spot: ignore, like the
    // central unit would.
    if (p.current !== null || p.bound.includes(s)) return;
    p.current = s;
    this.emitPairing(false); // "press here" — the LED panel lights this spot too
    // Two-tap semantics per lib/pairing: the first physical tap makes a
    // candidate (awaitingConfirm — "again?"), the second binds. Each tap is
    // human-paced (tapDelay) and chained, so they land a beat apart rather
    // than instantly. (A candidate replaced by a stray MAC / undo isn't
    // modeled; a cancel/disconnect clears these timers.)
    this.after(this.tapDelay(), () => {
      this.emitPairing(true); // candidate
      this.after(this.tapDelay(), () => {
        p.bound.push(s);
        p.current = null;
        if (p.bound.length >= p.total) {
          this.paired = p.total;
          this.session = "idle";
          this.emitPairing(false); // done snapshot
          this.emitSession();
        } else {
          this.emitPairing(false); // back to "pick the next spot"
        }
      });
    });
  }

  async completePairingNow(): Promise<void> {
    this.assertConnected();
    const p = this.pairing;
    if (!p || this.session !== "pairing") throw new Error("no pairing round");
    // Dev shortcut: fill every remaining slot from the lowest free canonical
    // spot and finish the round at once. The map still ends with all targets
    // bound (green + check), so the handoff animation reads the same.
    p.current = null;
    for (let s = 0; s < 8 && p.bound.length < p.total; s++) {
      if (!p.bound.includes(s)) p.bound.push(s);
    }
    this.paired = p.total;
    this.session = "idle";
    this.emitPairing(false); // done snapshot — every target bound
    this.emitSession();
  }

  async extendPairing(numTargets: number): Promise<void> {
    this.assertConnected();
    const p = this.pairing;
    if (!p) throw new Error("no pairing round"); // never paired — use startPairing
    const total = clampPositions(numTargets);
    // Same mid-prompt gate as undoPairing: an in-flight bind's timers would
    // still fire and push a bind into the resumed round — resolve it first.
    // (Unreachable from the UI — extend is only offered from done — but the
    // seam contract stays symmetric for the real central.)
    if (p.current !== null) throw new Error("prompt in flight");
    // Mirror PairingRound::extend: growth only, binds untouched.
    if (total <= p.total) throw new Error("extend must grow the round");
    p.total = total;
    this.session = "pairing"; // a completed round resumes
    this.emitSession();
    // Same shape as startPairing: the round waits for the next spot pick.
    this.after(this.latencyMs, () => this.emitPairing(false));
  }

  async undoPairing(): Promise<void> {
    this.assertConnected();
    const p = this.pairing;
    if (!p) throw new Error("no pairing round");
    // Mid-prompt the central refuses — the seam has no per-prompt cancel, so
    // the operator lets the in-flight bind resolve and undoes it right after
    // (resolve-then-undo); a mid-prompt rollback would race the bind's late
    // events. NOTE: the firmware core does NOT enforce this — undo_last()
    // called mid-prompt would double-rollback; the brain's receive path owns
    // the refusal (see pairing.h contract).
    if (p.current !== null) throw new Error("prompt in flight");
    if (p.bound.length === 0) throw new Error("nothing to undo");
    p.bound.pop();
    // Undoing out of a completed round resumes it (PairingRound::undo_last
    // reactivates the round the same way: count drops below target).
    if (this.session !== "pairing") {
      this.session = "pairing";
      this.paired = p.bound.length;
      this.emitSession();
    }
    this.emitPairing(false); // back to "pick the next spot"
  }

  async loadDrill(config: DrillConfig): Promise<void> {
    this.assertConnected();
    this.drill = { ...config, numPositions: clampPositions(config.numPositions) };
  }

  async startSession(): Promise<void> {
    this.assertConnected();
    if (this.session === "running") return;
    this.session = "running";
    this.hits = [];
    this.liveArmed = false;
    this.liveSeq = 0;
    this.emitSession();

    // Live is operator-driven: the app arms each target with armLiveTarget, so
    // the mock schedules nothing here — it waits for those calls.
    if (this.drill.mode === "live") return;

    const { mode, path } = this.drill;
    // time mode fills its window ("how many in durationMs"), not a rep count.
    const steps =
      mode === "path"
        ? (path?.length ?? 0)
        : mode === "time"
          ? Math.max(1, Math.floor((this.drill.durationMs ?? 60000) / this.stepMs))
          : (this.drill.count ?? 10);
    const n = clampPositions(this.drill.numPositions);
    const timeoutMs = this.drill.timeoutMs ?? 0;
    let prevHitUs = 0;
    for (let seq = 0; seq < steps; seq++) {
      // Deterministic spread; does not model allowImmediateRepeat/no-repeat
      // (the engine's reroll) — fine for a mock, noted so screens don't rely
      // on it.
      const position = mode === "path" ? path![seq] : (seq * 3 + 1) % n;
      const armAt = this.latencyMs + seq * this.stepMs;

      this.after(armAt, () => {
        this.emit({ kind: "progress", seq, position });
      });
      // The step closes mid-slot: hit record lands and `resolved` fires before
      // the next `progress`, exactly what the live screen keys its flash on.
      this.after(armAt + this.stepMs / 2, () => {
        // Like lib/engine: misses only exist when a timeout is configured.
        const miss =
          timeoutMs > 0 && this.missEvery > 0 && (seq + 1) % this.missEvery === 0;
        const tLitUs = seq * this.stepMs * 1000;
        const reactionMs = miss ? timeoutMs : 380 + seq * 37;
        const tHitUs = miss ? 0 : tLitUs + reactionMs * 1000;
        this.hits.push({
          seq,
          position,
          tLitUs,
          tHitUs,
          reactionMs,
          movementMs:
            miss || prevHitUs === 0 ? 0 : Math.round((tHitUs - prevHitUs) / 1000),
          sensor: "tof",
          miss,
        });
        if (!miss) prevHitUs = tHitUs;
        this.emit({ kind: "resolved", seq, position, miss, reactionMs });

        if (seq === steps - 1) {
          this.session = "done";
          this.emitSession();
        }
      });
    }
  }

  async armLiveTarget(position: number): Promise<void> {
    this.assertConnected();
    if (this.session !== "running" || this.drill.mode !== "live") {
      throw new Error("no live session");
    }
    // One target at a time — an extra tap while one is lit or in flight is a
    // no-op, like the central would ignore it.
    if (this.liveArmed) return;
    const n = clampPositions(this.drill.numPositions);
    const pos = ((Math.floor(position) % n) + n) % n;
    const seq = this.liveSeq++;
    this.liveArmed = true;
    // The operator picked a target; it lights up a beat later (tap + link
    // round-trip), then resolves on the athlete's hit a beat after that —
    // both human-paced.
    this.after(this.tapDelay(), () => {
      this.emit({ kind: "progress", seq, position: pos });
      const reactionMs = this.tapDelay();
      this.after(reactionMs, () => {
        this.hits.push({
          seq,
          position: pos,
          tLitUs: 0,
          tHitUs: reactionMs * 1000,
          reactionMs,
          movementMs: 0,
          sensor: "tof",
          miss: false,
        });
        this.liveArmed = false;
        this.emit({ kind: "resolved", seq, position: pos, miss: false, reactionMs });
      });
    });
  }

  async stopSession(): Promise<void> {
    this.assertConnected();
    this.clearTimers();
    // A cancelled pairing round leaves no session to summarize — back to idle;
    // an aborted drill keeps its partial records and reads as done.
    if (this.session === "pairing") {
      this.session = "idle";
      this.pairing = null;
      this.emitSession();
    } else if (this.session === "running") {
      this.session = "done";
      this.emitSession();
    }
  }

  async dumpResults(): Promise<HitRecord[]> {
    this.assertConnected();
    await this.wait(this.latencyMs);
    return [...this.hits];
  }

  onStatus(listener: (event: StatusEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── internals ──────────────────────────────────────────
  private emit(e: StatusEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private emitPairing(awaitingConfirm: boolean) {
    const p = this.pairing;
    if (!p) return;
    const progress: PairingProgress = {
      total: p.total,
      boundSpots: [...p.bound],
      currentSpot: p.current,
      awaitingConfirm,
      done: p.bound.length >= p.total,
    };
    this.emit({ kind: "pairing", progress });
  }

  private emitSession() {
    this.emit({
      kind: "session",
      state: this.session,
      // Count from the last pairing round; a session started without pairing
      // reports 0 even while running (the mock doesn't fake node presence).
      targetsOnline: this.paired,
    });
  }

  private setConnection(state: ConnectionState, reason?: string) {
    this.connectionState = state;
    this.emit({ kind: "connection", state, reason });
  }

  private assertConnected() {
    if (this.connectionState !== "connected") {
      throw new Error("not connected");
    }
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => this.after(ms, resolve));
  }

  /** Human tap latency: a fixed override when configured (tests), otherwise a
   *  fresh random draw in [TAP_MIN_MS, TAP_MAX_MS] per tap. */
  private tapDelay(): number {
    if (this.tapDelayMs !== undefined) return this.tapDelayMs;
    return TAP_MIN_MS + Math.round(Math.random() * (TAP_MAX_MS - TAP_MIN_MS));
  }

  private after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}
