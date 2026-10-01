import {
  assertState,
  checkAbort,
  fail,
  validateCommand,
  type Bridge,
  type Command,
  type JournalEntry,
  type Proposal,
} from "./contracts";
export class CommandEngine {
  private proposals = new Map<string, Proposal>();
  private approvals = new WeakMap<object, string>();
  private entries: JournalEntry[] = [];
  private usedIds = new Set<string>();
  private active?: AbortController;
  private uncertain = false;
  constructor(
    private readonly bridge: Bridge,
    private readonly timeoutMs = 2500,
  ) {}
  get journal() {
    return structuredClone(this.entries);
  }
  get busy() {
    return !!this.active;
  }
  async inspect() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.bridge.inspect(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
  propose(input: unknown, rationale: string): Proposal {
    const command = validateCommand(input);
    if (this.usedIds.has(command.id))
      fail("DUPLICATE", "Command ID already used. Create a fresh proposal.");
    if (typeof rationale !== "string" || rationale.length > 1000)
      fail("INVALID", "Invalid rationale.");
    this.usedIds.add(command.id);
    const proposal: Proposal = { command, rationale, status: "pending" };
    this.proposals.set(command.id, proposal);
    return structuredClone(proposal);
  }
  reject(id: string) {
    this.pending(id).status = "rejected";
  }
  private pending(id: string) {
    const p = this.proposals.get(id);
    if (!p || p.status !== "pending")
      fail("PROPOSAL", "Proposal is no longer pending.");
    return p;
  }
  /** Trusted UI boundary only. Never expose approve/apply/restore to an agent tool. */
  approve(id: string): object {
    this.pending(id);
    const token = Object.freeze({});
    this.approvals.set(token, id);
    return token;
  }
  async apply(id: string, approval: object) {
    const p = this.pending(id);
    if (!approval || this.approvals.get(approval) !== id)
      fail("APPROVAL", "Explicit Apply approval is required.");
    if (this.busy) fail("BUSY", "A write is already in progress.");
    this.approvals.delete(approval);
    p.status = "consumed";
    return this.execute(p.command, "apply");
  }
  cancel() {
    this.active?.abort();
  }
  /** Restore is itself an explicit user action and only undoes the last verified state.
   * Global revision matching intentionally refuses even unrelated intervening edits. */
  async restore(originalId: string, newId: string) {
    if (this.busy) fail("BUSY", "A write is already in progress.");
    const entry = this.entries.find(
      (e) => e.id === originalId && e.kind === "apply",
    );
    if (!entry || entry.status !== "verified" || entry.restored)
      fail("ROLLBACK", "No verified change available to restore.");
    if (this.usedIds.has(newId)) fail("DUPLICATE", "Command ID already used.");
    const command = validateCommand({
      ...entry.command,
      id: newId,
      expectedRevision: entry.afterRevision,
      expected: entry.command.value,
      value: entry.before,
    });
    this.usedIds.add(newId);
    const restored = await this.execute(command, "restore", originalId);
    if (restored.status === "verified") entry.restored = true;
    return restored;
  }
  private async execute(
    command: Command,
    kind: "apply" | "restore",
    originalId?: string,
  ) {
    if (this.uncertain)
      fail(
        "UNCERTAIN",
        "Readback was inconclusive. Reload the simulator to reset; native recovery requires reconciliation.",
      );
    const release = this.bridge.acquireWriter();
    const controller = new AbortController();
    this.active = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const entry: JournalEntry = {
      id: command.id,
      kind,
      originalId,
      command: structuredClone(command),
      at: new Date().toISOString(),
      before: command.expected,
      status: "pending",
      restored: false,
    };
    this.entries.push(entry);
    let dispatched = false;
    try {
      const before = await this.bridge.inspect(controller.signal);
      assertState(before, command);
      checkAbort(controller.signal);
      dispatched = true;
      await this.bridge.compareAndSet(command, controller.signal);
      const after = await this.bridge.inspect(controller.signal);
      if (
        after.projectId !== command.projectId ||
        after.epoch !== command.epoch ||
        after.revision !== command.expectedRevision + 1 ||
        after.channels.find((t) => t.id === command.channelId)?.[
          command.parameter
        ] !== command.value
      )
        fail("READBACK", "Readback did not match the approved change.");
      entry.status = "verified";
      entry.after = command.value;
      entry.afterRevision = after.revision;
    } catch (error) {
      // Once dispatched, assume unknown outcome even on timeout/cancellation. Never blindly retry.
      entry.status = dispatched ? "uncertain" : "failed";
      entry.error =
        error instanceof Error ? error.message : "Unknown bridge error.";
      if (dispatched) this.uncertain = true;
    } finally {
      clearTimeout(timer);
      this.active = undefined;
      release();
    }
    return structuredClone(entry);
  }
}
