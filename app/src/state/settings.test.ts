import type { DrillSettings } from "./AppState";
import { reconcileSettings, type RemoteSettingsStore } from "./settings";

const DEFAULTS: DrillSettings = {
  mode: "random",
  stopBy: "count",
  count: 10,
  durationMs: 30000,
  delayMs: 0,
  allowImmediateRepeat: false,
};
const TWEAKED: DrillSettings = {
  mode: "path",
  stopBy: "time",
  count: 15,
  durationMs: 45000,
  delayMs: 1500,
  allowImmediateRepeat: true,
};

class FakeRemoteSettings implements RemoteSettingsStore {
  row: DrillSettings | null = null;
  saves: DrillSettings[] = [];
  failLoad: string | null = null;
  seed(s: DrillSettings | null): this {
    this.row = s;
    return this;
  }
  async load(): Promise<DrillSettings | null> {
    if (this.failLoad) throw new Error(this.failLoad);
    return this.row;
  }
  async save(_userId: string, s: DrillSettings): Promise<void> {
    this.saves.push(s);
    this.row = s;
  }
}

test("an account's saved settings win on sign-in — the user's changed values", async () => {
  const remote = new FakeRemoteSettings().seed(TWEAKED);
  const out = await reconcileSettings("u1", DEFAULTS, remote);
  expect(out).toEqual(TWEAKED); // adopted the account's settings
  expect(remote.saves).toEqual([]); // nothing written — the row already existed
});

test("a fresh account is seeded from the device's current settings, not reset", async () => {
  const remote = new FakeRemoteSettings().seed(null); // no row yet
  const out = await reconcileSettings("u1", TWEAKED, remote);
  expect(out).toEqual(TWEAKED); // kept the device's current settings
  expect(remote.saves).toEqual([TWEAKED]); // and seeded the account with them
  expect(remote.row).toEqual(TWEAKED); // persisted
});

test("a load failure rejects and writes nothing", async () => {
  const remote = new FakeRemoteSettings();
  remote.failLoad = "network down";
  await expect(reconcileSettings("u1", DEFAULTS, remote)).rejects.toThrow(
    "network down",
  );
  expect(remote.saves).toEqual([]);
});
