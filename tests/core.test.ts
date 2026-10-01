import { beforeEach, describe, expect, it, vi } from "vitest";
import { SimulatedBridge } from "../src/bridge/simulator";
import { CommandEngine } from "../src/core/engine";
import {
  assertState,
  validateCommand,
  type Command,
  type Snapshot,
} from "../src/core/contracts";
import {
  DisabledOpenAIProvider,
  ManualDemoProvider,
} from "../src/providers/provider";
let bridge: SimulatedBridge;
let engine: CommandEngine;
let snapshot: Snapshot;
let command: Command;
const signal = () => new AbortController().signal;
beforeEach(async () => {
  bridge = new SimulatedBridge();
  bridge.latencyMs = 0;
  bridge.load();
  engine = new CommandEngine(bridge, 500);
  snapshot = await engine.inspect();
  command = {
    version: 1,
    id: "test:1",
    type: "setParameter",
    projectId: snapshot.projectId,
    epoch: snapshot.epoch,
    expectedRevision: 0,
    channelId: "ch:kick",
    parameter: "faderDb",
    expected: -8,
    value: -9,
  };
});
function propose(c = command) {
  return engine.propose(c, "Manual test");
}
async function apply(c = command) {
  propose(c);
  return engine.apply(c.id, engine.approve(c.id));
}

describe("untrusted commands", () => {
  it.each([null, [], {}, { ...command, type: "eval" }])(
    "rejects malformed input %j",
    (input) => {
      expect(() => validateCommand(input)).toThrow();
    },
  );
  it.each([
    { type: "rawMidi" },
    { version: 2 },
    { parameter: "plugin" },
    { value: NaN },
    { value: Infinity },
    { value: -70 },
    { value: -4 },
    { value: -8 },
    { expectedRevision: -1 },
    { id: "../escape" },
    { code: "console.log(1)" },
  ])("rejects invalid command %j", (change) => {
    expect(() => validateCommand({ ...command, ...change })).toThrow();
  });
  it("accepts boundary changes for fader and pan", () => {
    expect(validateCommand({ ...command, value: -5 }).value).toBe(-5);
    expect(
      validateCommand({
        ...command,
        parameter: "pan",
        expected: 0.75,
        value: 1,
      }).value,
    ).toBe(1);
    expect(() =>
      validateCommand({
        ...command,
        parameter: "pan",
        expected: 0,
        value: 0.26,
      }),
    ).toThrow("Maximum change");
  });
  it("detaches proposals from caller mutation", async () => {
    const p = propose();
    p.command.value = 6;
    command.value = 6;
    expect(
      (await engine.apply(p.command.id, engine.approve(p.command.id))).after,
    ).toBe(-9);
  });
});

describe("approval and journal", () => {
  it("preview never writes and forged approval fails", async () => {
    propose();
    await expect(engine.apply(command.id, {})).rejects.toThrow("approval");
    expect((await engine.inspect()).revision).toBe(0);
  });
  it("reject revokes approval", async () => {
    propose();
    const token = engine.approve(command.id);
    engine.reject(command.id);
    await expect(engine.apply(command.id, token)).rejects.toThrow("pending");
  });
  it("approval is bound to exact proposal", async () => {
    propose();
    const token = engine.approve(command.id);
    propose({ ...command, id: "test:2" });
    await expect(engine.apply("test:2", token)).rejects.toThrow("approval");
  });
  it("applies, verifies, journals and restores original value", async () => {
    const e = await apply();
    expect(e.status).toBe("verified");
    expect(e.before).toBe(-8);
    expect(e.after).toBe(-9);
    expect((await engine.restore(e.id, "restore:1")).status).toBe("verified");
    expect((await engine.inspect()).channels[0]?.faderDb).toBe(-8);
    expect(engine.journal[0]?.restored).toBe(true);
    await expect(engine.restore(e.id, "restore:2")).rejects.toThrow(
      "No verified",
    );
  });
  it("supports pan readback and rollback", async () => {
    const e = await apply({
      ...command,
      parameter: "pan",
      expected: 0,
      value: -0.2,
    });
    expect(e.after).toBe(-0.2);
    expect((await engine.restore(e.id, "restore:pan")).after).toBe(0);
  });
  it("rejects duplicate IDs before and after execution", async () => {
    await apply();
    expect(() => propose()).toThrow("already used");
    await expect(engine.apply(command.id, {})).rejects.toThrow("pending");
    await expect(engine.restore(command.id, command.id)).rejects.toThrow(
      "already used",
    );
  });
  it("journal getter cannot mutate internal state", async () => {
    await apply();
    engine.journal[0]!.before = 0;
    expect((await engine.restore(command.id, "restore:safe")).after).toBe(-8);
  });
});

describe("state and capability guards", () => {
  it("rejects stale preview after user edits, even ABA", async () => {
    propose();
    bridge.userEdit("ch:kick", "faderDb", -7);
    bridge.userEdit("ch:kick", "faderDb", -8);
    const e = await engine.apply(command.id, engine.approve(command.id));
    expect(e.status).toBe("failed");
    expect(e.error).toContain("changed since preview");
  });
  it("rejects reloaded project even with same values", async () => {
    propose();
    bridge.load();
    const e = await engine.apply(command.id, engine.approve(command.id));
    expect(e.status).toBe("failed");
    expect(e.error).toContain("identity");
  });
  it("rejects different project identity and removed channels", () => {
    expect(() =>
      assertState({ ...snapshot, projectId: "other" }, command),
    ).toThrow("identity");
    expect(() => assertState({ ...snapshot, channels: [] }, command)).toThrow(
      "no longer exists",
    );
  });
  it("rejects value mismatch even at same revision", () => {
    snapshot.channels[0]!.faderDb = -7;
    expect(() => assertState(snapshot, command)).toThrow("edited");
  });
  it.each(["read", "write", "unknown"] as const)(
    "blocks %s automation",
    (state) => {
      snapshot.channels[0]!.automation.faderDb = state;
      expect(() => assertState(snapshot, command)).toThrow("Automation");
    },
  );
  it.each(["stableIds", "compareAndSet", "readback", "faderDb"] as const)(
    "requires %s capability",
    (cap) => {
      snapshot.capabilities[cap] = false;
      expect(() => assertState(snapshot, command)).toThrow(
        "cannot safely write",
      );
    },
  );
  it("blocks automation in real simulator execution", async () => {
    const e = await apply({
      ...command,
      channelId: "ch:voice",
      expected: -6,
      value: -7,
    });
    expect(e.status).toBe("failed");
    expect(e.error).toContain("Automation");
  });
  it("disconnected inspection/apply fail closed", async () => {
    propose();
    bridge.disconnect();
    await expect(engine.inspect()).rejects.toThrow("disconnected");
    await expect(
      engine.apply(command.id, engine.approve(command.id)),
    ).rejects.toThrow("disconnected");
  });
  it("refuses restore after user edit", async () => {
    await apply();
    bridge.userEdit("ch:kick", "faderDb", -10);
    const e = await engine.restore(command.id, "restore:stale");
    expect(e.status).toBe("failed");
    expect((await engine.inspect()).channels[0]?.faderDb).toBe(-10);
  });
  it("refuses restore across project reload", async () => {
    await apply();
    bridge.load();
    expect((await engine.restore(command.id, "restore:identity")).status).toBe(
      "failed",
    );
  });
});

describe("races and transport faults", () => {
  it("allows only one writer across engine instances sharing a bridge", async () => {
    bridge.latencyMs = 10;
    propose();
    const running = engine.apply(command.id, engine.approve(command.id));
    const other = new CommandEngine(bridge);
    other.propose({ ...command, id: "other" }, "test");
    await expect(other.apply("other", other.approve("other"))).rejects.toThrow(
      "write is in progress",
    );
    expect((await running).status).toBe("verified");
  });
  it("CAS catches user edit racing the write", async () => {
    const original = bridge.compareAndSet.bind(bridge);
    vi.spyOn(bridge, "compareAndSet").mockImplementation(async (c, s) => {
      bridge.userEdit("ch:kick", "faderDb", -7);
      await original(c, s);
    });
    const e = await apply();
    expect(e.status).toBe("uncertain");
    expect((await engine.inspect()).channels[0]?.faderDb).toBe(-7);
  });
  it("readback catches user edit after commit and quarantines further writes", async () => {
    const original = bridge.compareAndSet.bind(bridge);
    vi.spyOn(bridge, "compareAndSet").mockImplementation(async (c, s) => {
      await original(c, s);
      bridge.userEdit("ch:kick", "faderDb", -7);
    });
    const e = await apply();
    expect(e.status).toBe("uncertain");
    expect(e.after).toBeUndefined();
    propose({ ...command, id: "new" });
    await expect(engine.apply("new", engine.approve("new"))).rejects.toThrow(
      "inconclusive",
    );
  });
  it("disconnect after commit records unknown outcome, not success", async () => {
    const original = bridge.compareAndSet.bind(bridge);
    vi.spyOn(bridge, "compareAndSet").mockImplementation(async (c, s) => {
      await original(c, s);
      bridge.disconnect();
    });
    expect((await apply()).status).toBe("uncertain");
    expect(engine.journal[0]?.after).toBeUndefined();
  });
  it("cancel before dispatch never writes and releases writer", async () => {
    bridge.latencyMs = 30;
    propose();
    const running = engine.apply(command.id, engine.approve(command.id));
    engine.cancel();
    expect((await running).status).toBe("failed");
    expect(engine.busy).toBe(false);
    expect((await engine.inspect()).revision).toBe(0);
    const release = bridge.acquireWriter();
    release();
  });
  it("timeout before dispatch leaves state unchanged", async () => {
    bridge.latencyMs = 30;
    engine = new CommandEngine(bridge, 5);
    expect((await apply()).status).toBe("failed");
    bridge.latencyMs = 0;
    expect((await bridge.inspect(signal())).revision).toBe(0);
  });
  it("cancellation after dispatch is conservative and prevents late simulator commit", async () => {
    const original = bridge.compareAndSet.bind(bridge);
    vi.spyOn(bridge, "compareAndSet").mockImplementation(async (c, s) => {
      engine.cancel();
      await original(c, s);
    });
    expect((await apply()).status).toBe("uncertain");
    expect((await engine.inspect()).revision).toBe(0);
  });
  it("bridge rejects a pre-aborted signal", async () => {
    const c = new AbortController();
    c.abort();
    await expect(bridge.compareAndSet(command, c.signal)).rejects.toThrow(
      "cancelled",
    );
  });
});

it("provider is explicitly manual and OpenAI remains unavailable", async () => {
  const request = {
    snapshot,
    channelId: "ch:kick",
    parameter: "faderDb" as const,
    target: -9,
  };
  expect(
    (await new ManualDemoProvider().propose(request, signal())).rationale,
  ).toContain("No audio");
  await expect(
    new DisabledOpenAIProvider().propose(request, signal()),
  ).rejects.toThrow("not implemented");
});

it("rejects a repeated committed ID from a second engine, even with a fresh revision", async () => {
  await apply();
  const other = new CommandEngine(bridge);
  other.propose(
    { ...command, expectedRevision: 1, expected: -9, value: -10 },
    "duplicate",
  );
  const result = await other.apply(command.id, other.approve(command.id));
  expect(result.status).toBe("uncertain");
  expect(result.error).toContain("already committed");
  expect((await engine.inspect()).channels[0]?.faderDb).toBe(-9);
});

it("timeout after commit records uncertainty and preserves the actual written state", async () => {
  engine = new CommandEngine(bridge, 20);
  const original = bridge.compareAndSet.bind(bridge);
  vi.spyOn(bridge, "compareAndSet").mockImplementation(async (c, s) => {
    await original(c, s);
    bridge.latencyMs = 100;
  });
  const result = await apply();
  expect(result.status).toBe("uncertain");
  expect(result.after).toBeUndefined();
  bridge.latencyMs = 0;
  expect((await engine.inspect()).channels[0]?.faderDb).toBe(-9);
});

it("project switch racing dispatch prevents writing the new project", async () => {
  const original = bridge.compareAndSet.bind(bridge);
  vi.spyOn(bridge, "compareAndSet").mockImplementation(async (c, s) => {
    bridge.load();
    await original(c, s);
  });
  expect((await apply()).status).toBe("uncertain");
  expect((await engine.inspect()).revision).toBe(0);
});
