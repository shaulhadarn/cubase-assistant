import {
  assertState,
  checkAbort,
  fail,
  validateCommand,
  type Bridge,
  type Command,
  type Snapshot,
} from "../core/contracts";
export class SimulatedBridge implements Bridge {
  readonly mode = "simulator" as const;
  connected = false;
  latencyMs = 120;
  private writer = false;
  private generation = 0;
  private committedIds = new Set<string>();
  private state!: Snapshot;
  load() {
    this.generation++;
    this.committedIds.clear();
    this.connected = true;
    this.state = {
      protocol: 1,
      mode: "simulator",
      projectId: "demo:midnight",
      epoch: `load:${this.generation}`,
      revision: 0,
      name: "Midnight • demo session",
      capabilities: {
        stableIds: true,
        compareAndSet: true,
        readback: true,
        faderDb: true,
        pan: true,
        plugins: false,
        audioAnalysis: false,
        automationWrites: false,
      },
      channels: [
        {
          id: "ch:kick",
          name: "Kick",
          kind: "audio",
          faderDb: -8,
          pan: 0,
          automation: { faderDb: "off", pan: "off" },
        },
        {
          id: "ch:bass",
          name: "Bass",
          kind: "audio",
          faderDb: -10,
          pan: 0,
          automation: { faderDb: "off", pan: "off" },
        },
        {
          id: "ch:keys",
          name: "Keys",
          kind: "audio",
          faderDb: -14,
          pan: -0.2,
          automation: { faderDb: "off", pan: "off" },
        },
        {
          id: "ch:voice",
          name: "Lead vocal",
          kind: "audio",
          faderDb: -6,
          pan: 0,
          automation: { faderDb: "read", pan: "off" },
        },
        {
          id: "ch:drums",
          name: "Drum bus",
          kind: "group",
          faderDb: -3,
          pan: 0,
          automation: { faderDb: "off", pan: "off" },
        },
      ],
    };
  }
  disconnect() {
    this.connected = false;
  }
  /** Fault injection only. Represents a user's DAW edit, including ABA revisions. */
  userEdit(channelId: string, parameter: "faderDb" | "pan", value: number) {
    this.ensure();
    const ch = this.state.channels.find((c) => c.id === channelId);
    if (!ch) fail("MISSING", "Missing channel.");
    ch[parameter] = value;
    this.state.revision++;
  }
  private ensure() {
    if (!this.connected)
      fail("DISCONNECTED", "Simulator disconnected. Load the demo project.");
  }
  acquireWriter() {
    this.ensure();
    if (this.writer) fail("BUSY", "Another write is in progress.");
    this.writer = true;
    return () => {
      this.writer = false;
    };
  }
  private async wait(signal: AbortSignal) {
    checkAbort(signal);
    await new Promise<void>((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        reject(new Error("Operation cancelled or timed out."));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", stop);
        resolve();
      }, this.latencyMs);
      signal.addEventListener("abort", stop, { once: true });
    });
    checkAbort(signal);
    this.ensure();
  }
  async inspect(signal: AbortSignal) {
    await this.wait(signal);
    return structuredClone(this.state);
  }
  async compareAndSet(input: Command, signal: AbortSignal) {
    const c = validateCommand(input);
    await this.wait(signal);
    if (this.committedIds.has(c.id))
      fail("DUPLICATE", "Command ID already committed in this project epoch.");
    const channel = assertState(this.state, c);
    // No await between this final check and commit: atomic in the simulator's event loop.
    this.committedIds.add(c.id);
    channel[c.parameter] = c.value;
    this.state.revision++;
  }
}
