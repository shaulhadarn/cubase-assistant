import type { Capabilities, Command, Snapshot } from "../core/contracts";
/** Design contract only: not a working MIDI transport or Steinberg SDK implementation. */
export type NativeRequest =
  | { protocol: 1; requestId: string; operation: "hello" }
  | { protocol: 1; requestId: string; operation: "inspect"; epoch: string }
  | {
      protocol: 1;
      requestId: string;
      operation: "compareAndSet";
      leaseId: string;
      deadlineUnixMs: number;
      command: Command;
    }
  | {
      protocol: 1;
      requestId: string;
      operation: "cancel";
      targetRequestId: string;
      epoch: string;
    };
export type NativeResponse =
  | {
      protocol: 1;
      requestId: string;
      ok: true;
      result: {
        kind: "hello";
        hostVersion: string;
        edition: string | null;
        apiVersion: string | null;
        capabilities: Capabilities;
        epoch: string;
      };
    }
  | {
      protocol: 1;
      requestId: string;
      ok: true;
      result: { kind: "snapshot"; snapshot: Snapshot };
    }
  | {
      protocol: 1;
      requestId: string;
      ok: true;
      result: {
        kind: "write";
        commandId: string;
        status: "verified" | "not-committed" | "unknown";
        snapshot?: Snapshot;
      };
    }
  | {
      protocol: 1;
      requestId: string;
      ok: false;
      error: {
        code: string;
        message: string;
        outcome: "not-committed" | "unknown";
      };
    };
export const nativeAdapterStatus =
  "Unavailable: Windows bridge and ES5 MIDI Remote adapter have not been implemented or tested.";
