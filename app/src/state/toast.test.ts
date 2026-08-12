import {
  dismissToast,
  getToast,
  showToast,
  TOAST_DEFAULT_MS,
  type Toast,
} from "./toast";

afterEach(() => dismissToast()); // the store is a module singleton — reset it

test("showToast sets the current toast with the default duration and tone", () => {
  expect(getToast()).toBeNull();
  showToast("Session complete");
  const t = getToast() as Toast;
  expect(t.message).toBe("Session complete");
  expect(t.tone).toBe("neutral");
  expect(t.durationMs).toBe(TOAST_DEFAULT_MS);
});

test("opts override tone and duration", () => {
  showToast("Saved", { tone: "success", durationMs: 1200 });
  const t = getToast() as Toast;
  expect(t.tone).toBe("success");
  expect(t.durationMs).toBe(1200);
});

test("each showToast gets a fresh, monotonically increasing id", () => {
  const a = showToast("one");
  const b = showToast("two");
  expect(b).toBeGreaterThan(a);
  expect(getToast()?.message).toBe("two"); // the newer one replaces the older
});

test("dismissToast clears the current toast", () => {
  showToast("bye");
  dismissToast();
  expect(getToast()).toBeNull();
});

test("dismissToast(id) only clears when that id is still the one showing", () => {
  const stale = showToast("first");
  showToast("second"); // a newer toast replaced the first
  dismissToast(stale); // a stale timer firing for the first must NOT clear the second
  expect(getToast()?.message).toBe("second");
});
