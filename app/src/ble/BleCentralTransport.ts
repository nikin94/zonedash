/**
 * BleCentralTransport — the real CentralTransport, over a GattPeripheral. It is
 * the first consumer of ble/codec.ts: every command method encodes a Control
 * frame and writes it; every Status/Results notification is decoded back into
 * the exact StatusEvent / HitRecord shapes MockCentralTransport emits, so the UI
 * is unchanged whether it runs on the mock (Expo Go) or the real link.
 *
 * The radio lives entirely behind the injected GattPeripheral (see gatt.ts): the
 * command mapping, the notification decoding, and the connection/session state
 * machine below are pure and fully host-tested against a fake peripheral. The
 * concrete ble-plx adapter is a separate bench-time module — this file never
 * imports react-native-ble-plx, so it (and its tests) stay Expo-Go-safe.
 *
 * The `connection` StatusEvent is the one event NOT decoded from the wire: link
 * up/down is a stack fact, so the transport synthesises it from connect() /
 * disconnect() / the peripheral's onDisconnect — never from a brain notification.
 * The `sessionSnapshot` is likewise assembled here, from the observed Status
 * events plus the config the app last loadDrill'd (the brain doesn't re-notify a
 * drill's mode/params), so a freshly-mounted screen rehydrates the same way it
 * does off the mock.
 */
import { CHAR } from "./contract";
import type { HitRecord } from "./contract";
import { decodeResults, decodeStatus, encodeControl, type ControlMessage } from "./codec";
import { ControlOp } from "./contract";
import type { GattPeripheral } from "./gatt";
import type {
  CentralTransport,
  ConnectionState,
  DrillConfig,
  SessionSnapshot,
  SessionState,
  StatusEvent,
  Unsubscribe,
} from "./transport";

/** A pending dumpResults() awaiting the next Results frame. */
interface DumpWaiter {
  resolve: (records: HitRecord[]) => void;
  reject: (err: Error) => void;
}

export class BleCentralTransport implements CentralTransport {
  connectionState: ConnectionState = "disconnected";

  private readonly peripheral: GattPeripheral;
  private listeners = new Set<(e: StatusEvent) => void>();
  private subs: Unsubscribe[] = []; // status / results / onDisconnect, torn down on unlink

  // Snapshot state, assembled from observed events + the last loaded config.
  private session: SessionState = "idle";
  private armedPosition: number | null = null;
  private resolvedCount = 0;
  // The brain never re-notifies a drill's config, so the mode/params come from
  // the LoadDrill the app itself sent — cached here for the snapshot.
  private loaded: Pick<DrillConfig, "mode" | "count" | "durationMs" | "path"> = {
    mode: "random",
  };

  // One in-flight dumpResults at a time — the reply is the next Results frame.
  private pendingDump: DumpWaiter | null = null;
  // A connect() in flight, so parallel calls join it instead of opening a
  // second link + a duplicate subscription (the mock guards the same way).
  private connectPromise: Promise<void> | null = null;

  constructor(peripheral: GattPeripheral) {
    this.peripheral = peripheral;
  }

  get sessionSnapshot(): SessionSnapshot {
    return {
      state: this.session,
      mode: this.loaded.mode,
      armedPosition: this.armedPosition,
      resolvedCount: this.resolvedCount,
      count: this.loaded.count,
      durationMs: this.loaded.durationMs,
      path: this.loaded.path,
    };
  }

  connect(): Promise<void> {
    if (this.connectionState === "connected") return Promise.resolve();
    // A real connect takes seconds; a second call while connecting must join the
    // in-flight attempt, not open a second link and double-subscribe (every
    // notification would then fold twice). Same join the mock does.
    if (this.connectPromise) return this.connectPromise;
    this.setConnection("connecting");
    this.connectPromise = (async () => {
      try {
        await this.peripheral.connect();
      } catch (err) {
        this.setConnection("error", err instanceof Error ? err.message : "connect failed");
        throw err;
      }
      // Subscribe once the service is discovered, before reporting connected, so
      // the first post-connect notification can't slip past an unsubscribed link.
      this.subs.push(
        this.peripheral.subscribe(CHAR.status, (b) => this.onStatusFrame(b)),
        this.peripheral.subscribe(CHAR.results, (b) => this.onResultsFrame(b)),
        this.peripheral.onDisconnect((reason) => this.onLinkLost(reason)),
      );
      this.setConnection("connected");
    })().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.teardown();
    await this.peripheral.disconnect();
    this.setConnection("disconnected");
  }

  startPairing(numTargets: number): Promise<void> {
    return this.send({ op: ControlOp.StartPairing, numTargets });
  }

  selectPairingSpot(spot: number): Promise<void> {
    return this.send({ op: ControlOp.SelectPairSpot, spot });
  }

  extendPairing(numTargets: number): Promise<void> {
    return this.send({ op: ControlOp.ExtendPairing, numTargets });
  }

  finishPairing(): Promise<void> {
    return this.send({ op: ControlOp.FinishPairing });
  }

  undoPairing(): Promise<void> {
    return this.send({ op: ControlOp.UndoPairBind });
  }

  loadDrill(config: DrillConfig): Promise<void> {
    // Cache the fields the snapshot needs (the wire never echoes them back).
    this.loaded = {
      mode: config.mode,
      count: config.count,
      durationMs: config.durationMs,
      path: config.path,
    };
    return this.send({ op: ControlOp.LoadDrill, config });
  }

  startSession(): Promise<void> {
    return this.send({ op: ControlOp.StartSession });
  }

  armLiveTarget(position: number): Promise<void> {
    return this.send({ op: ControlOp.ArmLiveTarget, position });
  }

  stopSession(): Promise<void> {
    return this.send({ op: ControlOp.StopSession });
  }

  async dumpResults(): Promise<HitRecord[]> {
    this.assertConnected();
    // DumpResults is request/reply: the brain answers a write with exactly one
    // Results notification (see architecture.md), which the results handler
    // resolves this waiter with.
    if (this.pendingDump) throw new Error("a results dump is already in flight");
    const waiter: DumpWaiter = { resolve: () => {}, reject: () => {} };
    const reply = new Promise<HitRecord[]>((resolve, reject) => {
      waiter.resolve = resolve;
      waiter.reject = reject;
    });
    this.pendingDump = waiter;
    try {
      await this.peripheral.write(CHAR.control, encodeControl({ op: ControlOp.DumpResults }));
    } catch (err) {
      // ONE reject channel: `reply` is the only promise ever handed out, so a
      // write failure rejects IT (via `waiter`) — never a second, orphaned
      // rejected promise. On a real link drop mid-write both the write reject and
      // onLinkLost fire in undefined order; the identity guard makes the loser a
      // no-op: if onLinkLost already rejected + cleared this waiter, pendingDump
      // is no longer it, so we don't double-reject. `reply` is always returned,
      // so its rejection is always awaited by the caller.
      if (this.pendingDump === waiter) {
        this.pendingDump = null;
        waiter.reject(err instanceof Error ? err : new Error("results dump write failed"));
      }
    }
    return reply;
  }

  onStatus(listener: (event: StatusEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── internals ──────────────────────────────────────────

  private async send(msg: ControlMessage): Promise<void> {
    this.assertConnected();
    await this.peripheral.write(CHAR.control, encodeControl(msg));
  }

  /** A Status notification: decode, fold into the snapshot, and re-emit. A
   *  malformed/short/wrong-version frame throws in the decoder — drop it rather
   *  than hand the UI a wrongly-shaped event. */
  private onStatusFrame(bytes: Uint8Array): void {
    let event: StatusEvent;
    try {
      event = decodeStatus(bytes);
    } catch {
      return; // drop a corrupt notification silently — never a bad StatusEvent
    }
    switch (event.kind) {
      case "session":
        this.session = event.state;
        // A run restarts the step counter — the snapshot counts THIS session.
        if (event.state === "running") {
          this.resolvedCount = 0;
          this.armedPosition = null;
        }
        break;
      case "progress":
        this.armedPosition = event.position; // a target lit
        break;
      case "resolved":
        this.armedPosition = null; // the lit target cleared
        this.resolvedCount += 1;
        break;
      // pairing / connection carry no snapshot fields.
    }
    this.emit(event);
  }

  /** A Results notification: the reply to a DumpResults write. Decode and hand
   *  it to the waiting dumpResults() (drop it if unsolicited or malformed). */
  private onResultsFrame(bytes: Uint8Array): void {
    let records: HitRecord[];
    try {
      records = decodeResults(bytes);
    } catch {
      return;
    }
    const waiter = this.pendingDump;
    if (waiter) {
      this.pendingDump = null;
      waiter.resolve(records);
    }
  }

  /** An unsolicited link drop (out of range, unit off) — synthesise the
   *  connection event the wire never sends, and fail any in-flight dump. */
  private onLinkLost(reason?: string): void {
    this.teardown();
    this.setConnection("error", reason ?? "link lost");
  }

  private teardown(): void {
    this.subs.forEach((u) => u());
    this.subs = [];
    this.session = "idle";
    this.armedPosition = null;
    if (this.pendingDump) {
      this.pendingDump.reject(new Error("link lost during results dump"));
      this.pendingDump = null;
    }
  }

  private emit(event: StatusEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  private setConnection(state: ConnectionState, reason?: string): void {
    this.connectionState = state;
    this.emit({ kind: "connection", state, reason });
  }

  private assertConnected(): void {
    if (this.connectionState !== "connected") {
      throw new Error("not connected");
    }
  }
}
