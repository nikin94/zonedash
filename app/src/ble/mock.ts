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
  /** Simulated time between pairing taps / drill steps. */
  stepMs?: number;
  /** Every n-th step of a session is a timeout miss (0 = never). Only takes
   *  effect when the drill has timeoutMs > 0 — matching lib/engine, a drill
   *  without a timeout can never miss. */
  missEvery?: number;
  /** Make connect() fail — exercises the error path real BLE will hit
   *  (Bluetooth off, device not found, permissions denied). */
  failConnect?: boolean;
}

const clampPositions = (n: number) => Math.max(1, Math.min(8, Math.floor(n) || 1));

export class MockCentralTransport implements CentralTransport {
  connectionState: ConnectionState = "disconnected";

  private readonly latencyMs: number;
  private readonly stepMs: number;
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

  constructor(opts: MockOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 150;
    this.stepMs = opts.stepMs ?? 900;
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
    // Two-tap semantics per lib/pairing: first physical tap makes a candidate
    // (awaitingConfirm — "again?"), the second binds. A candidate replaced by
    // another stray MAC re-emits the same confirm state; undo isn't modeled.
    this.after(this.stepMs / 2, () => this.emitPairing(true));
    this.after(this.stepMs, () => {
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
  }

  async extendPairing(numTargets: number): Promise<void> {
    this.assertConnected();
    const p = this.pairing;
    if (!p) throw new Error("no pairing round"); // never paired — use startPairing
    const total = clampPositions(numTargets);
    // Mirror PairingRound::extend: growth only, binds untouched.
    if (total <= p.total) throw new Error("extend must grow the round");
    p.total = total;
    p.current = null;
    this.session = "pairing"; // a completed round resumes
    this.emitSession();
    // Same shape as startPairing: the round waits for the next spot pick.
    this.after(this.latencyMs, () => this.emitPairing(false));
  }

  async undoPairing(): Promise<void> {
    this.assertConnected();
    const p = this.pairing;
    if (!p) throw new Error("no pairing round");
    // Mid-prompt the central refuses — the in-flight bind must resolve or be
    // cancelled first, otherwise its late events would race the rollback.
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
    this.emitSession();

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
