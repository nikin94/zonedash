/**
 * Host tests for BleCentralTransport — the whole transport logic (command
 * mapping, notification decoding, and the connection/session state machine)
 * against a fake GattPeripheral. No radio, no react-native-ble-plx: the only
 * board-dependent code is the concrete ble-plx adapter, written at the bench.
 *
 * Wire bytes come from the shared golden fixture (docs/ble-vectors.json), the
 * same one codec.test.ts and the future brain decoder assert against — so a
 * command's outgoing bytes and an incoming notification round-trip through the
 * exact contract, not test-local literals.
 */
import { BleCentralTransport } from "./BleCentralTransport";
import { CHAR } from "./contract";
import type { GattPeripheral } from "./gatt";
import type { HitRecord } from "./contract";
import type { StatusEvent, Unsubscribe } from "./transport";
import rawVectors from "../../../docs/ble-vectors.json";

interface Vectors {
  control: { name: string; bytes: number[] }[];
  status: { name: string; bytes: number[]; event: StatusEvent }[];
  results: { name: string; bytes: number[]; records: HitRecord[] }[];
}
const vectors = rawVectors as unknown as Vectors;

const controlBytes = (name: string): number[] => {
  const v = vectors.control.find((c) => c.name === name);
  if (!v) throw new Error(`no control vector ${name}`);
  return v.bytes;
};
const statusBytes = (name: string): number[] => {
  const v = vectors.status.find((s) => s.name === name);
  if (!v) throw new Error(`no status vector ${name}`);
  return v.bytes;
};
const resultsVector = (name: string) => {
  const v = vectors.results.find((r) => r.name === name);
  if (!v) throw new Error(`no results vector ${name}`);
  return v;
};

/** A GattPeripheral test double: records writes, lets a test push notification
 *  frames into the transport's subscribers, and fire an unsolicited link drop. */
class FakeGatt implements GattPeripheral {
  writes: { char: string; bytes: number[] }[] = [];
  failConnect: string | null = null;
  private statusCbs = new Set<(b: Uint8Array) => void>();
  private resultsCbs = new Set<(b: Uint8Array) => void>();
  private dropCbs = new Set<(r?: string) => void>();

  async connect(): Promise<void> {
    if (this.failConnect) throw new Error(this.failConnect);
  }
  async disconnect(): Promise<void> {}
  async write(char: string, bytes: Uint8Array): Promise<void> {
    this.writes.push({ char, bytes: Array.from(bytes) });
  }
  subscribe(char: string, onFrame: (b: Uint8Array) => void): Unsubscribe {
    const set = char === CHAR.status ? this.statusCbs : this.resultsCbs;
    set.add(onFrame);
    return () => set.delete(onFrame);
  }
  onDisconnect(cb: (r?: string) => void): Unsubscribe {
    this.dropCbs.add(cb);
    return () => this.dropCbs.delete(cb);
  }

  // ── test drivers ──
  pushStatus(bytes: number[]): void {
    this.statusCbs.forEach((cb) => cb(Uint8Array.from(bytes)));
  }
  pushResults(bytes: number[]): void {
    this.resultsCbs.forEach((cb) => cb(Uint8Array.from(bytes)));
  }
  drop(reason?: string): void {
    this.dropCbs.forEach((cb) => cb(reason));
  }
  get lastWrite(): { char: string; bytes: number[] } {
    return this.writes[this.writes.length - 1];
  }
}

const connected = async () => {
  const gatt = new FakeGatt();
  const t = new BleCentralTransport(gatt);
  const events: StatusEvent[] = [];
  t.onStatus((e) => events.push(e));
  await t.connect();
  return { gatt, t, events };
};

test("connect walks connecting -> connected and emits both", async () => {
  const { t, events } = await connected();
  expect(t.connectionState).toBe("connected");
  expect(events).toEqual([
    { kind: "connection", state: "connecting", reason: undefined },
    { kind: "connection", state: "connected", reason: undefined },
  ]);
});

test("a failed connect surfaces error state and rethrows", async () => {
  const gatt = new FakeGatt();
  gatt.failConnect = "no unit found";
  const t = new BleCentralTransport(gatt);
  const events: StatusEvent[] = [];
  t.onStatus((e) => events.push(e));

  await expect(t.connect()).rejects.toThrow("no unit found");
  expect(t.connectionState).toBe("error");
  expect(events.at(-1)).toEqual({ kind: "connection", state: "error", reason: "no unit found" });
});

test("a command before connect throws and writes nothing", async () => {
  const gatt = new FakeGatt();
  const t = new BleCentralTransport(gatt);
  await expect(t.startPairing(4)).rejects.toThrow("not connected");
  expect(gatt.writes).toHaveLength(0);
});

test("each command writes the golden Control bytes to CHAR.control", async () => {
  const { gatt, t } = await connected();

  await t.startPairing(8);
  expect(gatt.lastWrite).toEqual({ char: CHAR.control, bytes: controlBytes("startPairing.8") });

  await t.selectPairingSpot(5);
  expect(gatt.lastWrite.bytes).toEqual(controlBytes("selectPairSpot.5"));

  await t.extendPairing(3);
  expect(gatt.lastWrite.bytes).toEqual(controlBytes("extendPairing.3"));

  await t.armLiveTarget(2);
  expect(gatt.lastWrite.bytes).toEqual(controlBytes("armLiveTarget.2"));

  await t.finishPairing();
  expect(gatt.lastWrite.bytes).toEqual(controlBytes("finishPairing"));

  await t.stopSession();
  expect(gatt.lastWrite.bytes).toEqual(controlBytes("stopSession"));
});

test("loadDrill writes the config blob and caches its params for the snapshot", async () => {
  const { gatt, t } = await connected();
  await t.loadDrill({ mode: "path", numPositions: 6, path: [2, 0, 5] });

  expect(gatt.lastWrite.bytes).toEqual(controlBytes("loadDrill.path"));
  // The wire never echoes a drill's config back, so the snapshot's mode/params
  // come from what the app loaded.
  expect(t.sessionSnapshot).toMatchObject({ mode: "path", path: [2, 0, 5] });
});

test("Status notifications decode, re-emit, and fold into the snapshot", async () => {
  const { gatt, t, events } = await connected();

  // A run starts: state running, the step counter reset.
  gatt.pushStatus(statusBytes("session.running"));
  expect(events.at(-1)).toEqual({ kind: "session", state: "running", targetsOnline: 3 });
  expect(t.sessionSnapshot).toMatchObject({ state: "running", resolvedCount: 0, armedPosition: null });

  // A target lights — the snapshot tracks which slot is armed.
  gatt.pushStatus(statusBytes("progress"));
  expect(events.at(-1)).toMatchObject({ kind: "progress" });
  expect(t.sessionSnapshot.armedPosition).toBe(4);

  // The step resolves — the lit target clears and the counter advances.
  gatt.pushStatus(statusBytes("resolved.hit"));
  expect(events.at(-1)).toMatchObject({ kind: "resolved", miss: false });
  expect(t.sessionSnapshot).toMatchObject({ armedPosition: null, resolvedCount: 1 });
});

test("a malformed notification is dropped, not turned into a bad event", async () => {
  const { gatt, t, events } = await connected();
  const before = events.length;
  gatt.pushStatus([2, 1, 0, 0]); // wrong status version -> decoder throws
  gatt.pushStatus([1, 99, 0, 0]); // unknown kind
  expect(events).toHaveLength(before); // nothing emitted, nothing thrown
  expect(t.connectionState).toBe("connected"); // link unaffected
});

test("dumpResults writes DumpResults and resolves with the next Results frame", async () => {
  const { gatt, t } = await connected();
  const v = resultsVector("multiple");

  const pending = t.dumpResults();
  expect(gatt.lastWrite.bytes).toEqual(controlBytes("dumpResults"));
  gatt.pushResults(v.bytes); // the brain's reply lands as a Results notification
  await expect(pending).resolves.toEqual(v.records);
});

test("an unsolicited link drop synthesises the connection event and resets state", async () => {
  const { gatt, t, events } = await connected();
  gatt.pushStatus(statusBytes("session.running"));

  gatt.drop("out of range");
  expect(t.connectionState).toBe("error");
  expect(events.at(-1)).toEqual({ kind: "connection", state: "error", reason: "out of range" });
  // The session snapshot falls back to idle — the run on the (gone) unit is moot.
  expect(t.sessionSnapshot).toMatchObject({ state: "idle", armedPosition: null });
});

test("a link drop mid-dump rejects the pending results promise", async () => {
  const { gatt, t } = await connected();
  const pending = t.dumpResults();
  gatt.drop();
  await expect(pending).rejects.toThrow(/link lost/);
});
