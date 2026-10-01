/** All identifiers are scoped to a project epoch. Names and list indices are never identities. */
export type Parameter = "faderDb" | "pan";
export type Automation = "off" | "read" | "write" | "unknown";
export interface Channel {
  id: string;
  name: string;
  kind: "audio" | "group";
  faderDb: number;
  pan: number;
  automation: Record<Parameter, Automation>;
}
export interface Capabilities {
  stableIds: boolean;
  compareAndSet: boolean;
  readback: boolean;
  faderDb: boolean;
  pan: boolean;
  plugins: false;
  audioAnalysis: false;
  automationWrites: false;
}
export interface Snapshot {
  protocol: 1;
  mode: "simulator" | "native";
  projectId: string;
  epoch: string;
  revision: number;
  name: string;
  channels: Channel[];
  capabilities: Capabilities;
}
export interface Command {
  version: 1;
  id: string;
  type: "setParameter";
  projectId: string;
  epoch: string;
  expectedRevision: number;
  channelId: string;
  parameter: Parameter;
  expected: number;
  value: number;
}
export interface Bridge {
  readonly mode: "simulator" | "native";
  acquireWriter(): () => void;
  inspect(signal: AbortSignal): Promise<Snapshot>;
  /** Must atomically check identity/revision/value/automation immediately before mutation.
   * Abort before commit guarantees no write. Abort after dispatch may be uncertain on native transports. */
  compareAndSet(command: Command, signal: AbortSignal): Promise<void>;
}
export interface Proposal {
  command: Command;
  rationale: string;
  status: "pending" | "rejected" | "consumed";
}
export interface JournalEntry {
  id: string;
  kind: "apply" | "restore";
  originalId?: string;
  command: Command;
  at: string;
  status: "pending" | "verified" | "failed" | "uncertain";
  before: number;
  after?: number;
  afterRevision?: number;
  error?: string;
  restored: boolean;
}
export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}
export function fail(code: string, message: string): never {
  throw new CommandError(code, message);
}
export function checkAbort(signal: AbortSignal) {
  if (signal.aborted)
    fail(
      "CANCELLED",
      "Operation cancelled or timed out. Inspect before trying again.",
    );
}
export const limits = {
  faderDb: { min: -60, max: 6, delta: 3 },
  pan: { min: -1, max: 1, delta: 0.25 },
} as const;
export function validateCommand(input: unknown): Command {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("INVALID", "Expected a command object.");
  const c = input as Record<string, unknown>;
  const keys = [
    "version",
    "id",
    "type",
    "projectId",
    "epoch",
    "expectedRevision",
    "channelId",
    "parameter",
    "expected",
    "value",
  ];
  if (
    Object.keys(c).length !== keys.length ||
    Object.keys(c).some((k) => !keys.includes(k))
  )
    fail("INVALID", "Unknown or missing command fields.");
  if (
    c.version !== 1 ||
    c.type !== "setParameter" ||
    (c.parameter !== "faderDb" && c.parameter !== "pan")
  )
    fail("INVALID", "Only version 1 fader/pan commands are allowed.");
  for (const key of ["id", "projectId", "epoch", "channelId"])
    if (
      typeof c[key] !== "string" ||
      !/^[a-zA-Z0-9:_-]{1,120}$/.test(c[key] as string)
    )
      fail("INVALID", `Invalid ${key}.`);
  if (
    !Number.isSafeInteger(c.expectedRevision) ||
    (c.expectedRevision as number) < 0
  )
    fail("INVALID", "Invalid revision.");
  const bounds = limits[c.parameter];
  for (const key of ["expected", "value"])
    if (
      typeof c[key] !== "number" ||
      !Number.isFinite(c[key]) ||
      (c[key] as number) < bounds.min ||
      (c[key] as number) > bounds.max
    )
      fail(
        "BOUNDS",
        `${c.parameter} must be between ${bounds.min} and ${bounds.max}.`,
      );
  if (
    Math.abs((c.value as number) - (c.expected as number)) >
    bounds.delta + 1e-9
  )
    fail("BOUNDS", `Maximum change: ${bounds.delta} per proposal.`);
  if (c.value === c.expected) fail("NO_CHANGE", "Choose a different value.");
  return structuredClone(c) as unknown as Command;
}
export function assertState(s: Snapshot, c: Command) {
  if (s.protocol !== 1 || s.projectId !== c.projectId || s.epoch !== c.epoch)
    fail(
      "IDENTITY",
      "Project or connection identity changed. Inspect and create a new proposal.",
    );
  if (s.revision !== c.expectedRevision)
    fail(
      "STALE",
      "Project changed since preview. Inspect and create a new proposal.",
    );
  if (
    !s.capabilities.stableIds ||
    !s.capabilities.compareAndSet ||
    !s.capabilities.readback ||
    !s.capabilities[c.parameter]
  )
    fail("UNSUPPORTED", "This bridge cannot safely write this parameter.");
  const channel = s.channels.find((t) => t.id === c.channelId);
  if (!channel) fail("MISSING", "Channel no longer exists.");
  if (channel.automation[c.parameter] !== "off")
    fail("AUTOMATION", "Automation-active or unknown parameters are blocked.");
  if (channel[c.parameter] !== c.expected)
    fail("STALE", "Parameter was edited since preview.");
  return channel;
}
