// Guards the BLE contract mirror's internal consistency. Cross-language
// equivalence with the firmware is enforced by review (see CLAUDE.md).
import { CHAR, ControlOp, ZONEDASH_SERVICE_UUID } from "./contract";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("service and characteristic UUIDs are well-formed and distinct", () => {
  const uuids = [ZONEDASH_SERVICE_UUID, ...Object.values(CHAR)];
  for (const u of uuids) expect(u).toMatch(UUID_RE);
  expect(new Set(uuids).size).toBe(uuids.length);
});

test("control opcodes are unique", () => {
  const ops = Object.values(ControlOp).filter((v) => typeof v === "number");
  expect(new Set(ops).size).toBe(ops.length);
});
