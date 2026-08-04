/**
 * Mock central unit — an in-app simulator behind the CentralTransport seam, so
 * every screen can be built and tested in Expo Go before the real BLE link
 * (dev-client + react-native-ble-plx) or the S3 hardware exists.
 *
 * Behavior mirrors the firmware cores: pairing prompts slots in order
 * (lib/pairing), a session arms one target at a time and resolves each step as
 * a hit or a timeout miss (lib/engine). Timings are configurable so tests can
 * run on fake timers.
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
  /** Simulated time between pairing taps / drill hits. */
  stepMs?: number;
  /** Every n-th step of a session is a timeout miss (0 = never). */
  missEvery?: number;
}

export class MockCentralTransport implements CentralTransport {
  connectionState: ConnectionState = "disconnected";

  private readonly latencyMs: number;
  private readonly stepMs: number;
  private readonly missEvery: number;

  private listeners = new Set<(e: StatusEvent) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private session: SessionState = "idle";
  private drill: DrillConfig = { mode: "random", numPositions: 8, count: 10 };
  private paired = 0; // targets bound by the last pairing round
  private hits: HitRecord[] = [];

  constructor(opts: MockOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 150;
    this.stepMs = opts.stepMs ?? 900;
    this.missEvery = opts.missEvery ?? 4;
  }

  async connect(): Promise<void> {
    if (this.connectionState !== "disconnected") return;
    this.setConnection("connecting");
    await this.wait(this.latencyMs);
    this.setConnection("connected");
    this.emitSession();
  }

  async disconnect(): Promise<void> {
    this.clearTimers();
    this.session = "idle";
    this.setConnection("disconnected");
  }

  async startPairing(numPositions: number): Promise<void> {
    this.assertConnected();
    const total = Math.max(1, Math.min(8, numPositions));
    this.session = "pairing";
    this.paired = 0;
    this.emitSession();
    // One simulated confirm-tap per slot, then done (currentPrompt = -1).
    for (let slot = 0; slot <= total; slot++) {
      this.after(this.latencyMs + slot * this.stepMs, () => {
        const progress: PairingProgress = {
          currentPrompt: slot < total ? slot : -1,
          total,
        };
        this.emit({ kind: "pairing", progress });
        if (slot === total) {
          this.paired = total;
          this.session = "idle";
          this.emitSession();
        }
      });
    }
  }

  async loadDrill(config: DrillConfig): Promise<void> {
    this.assertConnected();
    this.drill = config;
  }

  async startSession(): Promise<void> {
    this.assertConnected();
    if (this.session === "running") return;
    this.session = "running";
    this.hits = [];
    this.emitSession();

    const steps =
      this.drill.mode === "path"
        ? (this.drill.path?.length ?? 0)
        : (this.drill.count ?? 10);
    const n = this.drill.numPositions;
    let prevHitUs = 0;
    for (let seq = 0; seq < steps; seq++) {
      this.after(this.latencyMs + seq * this.stepMs, () => {
        const position =
          this.drill.mode === "path" ? this.drill.path![seq] : (seq * 3 + 1) % n;
        this.emit({ kind: "progress", seq, position });

        const miss = this.missEvery > 0 && (seq + 1) % this.missEvery === 0;
        const tLitUs = seq * this.stepMs * 1000;
        const reactionMs = miss ? (this.drill.timeoutMs ?? 1500) : 380 + seq * 37;
        const tHitUs = miss ? 0 : tLitUs + reactionMs * 1000;
        this.hits.push({
          seq,
          position,
          tLitUs,
          tHitUs,
          reactionMs,
          movementMs: miss || prevHitUs === 0 ? 0 : Math.round((tHitUs - prevHitUs) / 1000),
          sensor: "tof",
          miss,
        });
        if (!miss) prevHitUs = tHitUs;

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
    if (this.session === "running" || this.session === "pairing") {
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

  private emitSession() {
    this.emit({
      kind: "session",
      state: this.session,
      targetsOnline: this.paired,
    });
  }

  private setConnection(state: ConnectionState) {
    this.connectionState = state;
    this.emit({ kind: "connection", state });
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
