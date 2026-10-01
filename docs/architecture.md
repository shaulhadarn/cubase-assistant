# Architecture and safety boundary

## Current implementation

```text
Local web UI ── preview ──> ProposalProvider (manual / OpenAI disabled)
     │                         │ typed candidate, no bridge access
     │                         ▼
     ├─ explicit Apply ──> CommandEngine ──> Bridge ──> SimulatedBridge
     └─ explicit Restore       │                        fictional state
                         before/after journal
```

The dependency-free TypeScript core has no DOM, network or OpenAI dependency. Vite bundles the small native-DOM UI; Vitest exercises the core and Playwright drives a real browser. TypeScript strict mode and a lockfile keep the foundation maintainable without adding a frontend framework for a single screen. All dependencies are development tooling.

A proposal is a single parameter assignment. Runtime validation rejects extra fields, invalid versions/types/IDs, nonfinite numbers, out-of-range values and excessive deltas. Track names are display-only and escaped in HTML. IDs are stable only within the project epoch. The provider receives a snapshot and returns a candidate, never an engine, bridge, approval token or executable tool.

Apply requires a local UI-generated, single-use token bound to the stored proposal. The stored command is copied on ingress; consumers receive copies. The engine marks each proposal consumed, reserves its command ID, acquires the bridge writer, records an attempt, checks the latest state, dispatches compare-and-set, then reads back the exact value and next revision. A global revision deliberately treats unrelated edits as conflicts. The simulator rechecks identity/revision/value/automation immediately before a synchronous commit, so an edit between inspection and writing is caught. Unknown or active automation is always blocked.

A failure before dispatch is `failed`. Any failure after dispatch is conservatively `uncertain`, even when a simulator error suggests nothing committed. The journal never presents a requested value as verified readback. An uncertain write blocks further writes on that engine. Timeouts/cancellation signal abort to the bridge; the simulator prevents late commits. Bridge implementations must honor cancellation and settle; **the current coordinator is not safe to attach to an arbitrary noncooperative native transport**. Do not release a real writer merely because a request timed out: quarantine the transport and reconcile a durable outcome first.

Restore is a separate explicit UI action. It uses the original journal's before value, the verified after value and after revision; it refuses intervening edits, epoch changes, automation or duplicate IDs. It is intentionally not a general undo stack: after later edits (even a later restore) older entries become stale. The UI reports the conflict without overwriting it. The journal and deduplication ledger exist only in memory, scoped to one engine session. The simulator also rejects committed command IDs across engines within one project epoch. One bridge lease serializes concurrent engines; across processes a future host must enforce a single authority. Browser tabs each own independent fictional projects.

## Future Windows host

Use an Electron main process as the proposed Windows x64 host, keeping this UI as a sandboxed renderer with context isolation and Node integration disabled. This choice reuses the TypeScript core and permits a later Windows MIDI adapter behind a narrow preload IPC surface; Electron is **not installed or implemented in this milestone**. Validate renderer IPC at runtime. Host approval and journal logic in the main process, separate proposal-provider access from trusted user actions, restrict navigation, and expose no raw filesystem, shell or MIDI IPC. Use a single-instance lock and one writer lease per project/transport. Test keyboard/accessibility and Windows high-DPI behavior before packaging.

Before real writes: durable write-ahead journal and deduplication ledger, project-copy workflow, runtime decoding of every bridge response, parameter unit conversion/tolerances, crash recovery, heartbeat/epoch invalidation and native race testing. A browser boolean or model-provided field must never grant approval. Current TypeScript interfaces are not wire validation; native support remains unavailable until these requirements are met.

## Future virtual-MIDI / ES5 contract

`src/bridge/native-contract.ts` defines logical request/response version 1. These are design types, not working MIDI messages. The Windows host owns virtual-MIDI routing. A Cubase MIDI Remote script must use an ES5-compatible implementation and feature-probe each host API; never send JavaScript source or model-generated raw MIDI to it.

1. `hello` negotiates protocol, host version, edition (possibly unknown), API version, capabilities and a fresh epoch. Unknown capabilities default to false. Unknown protocol versions fail closed.
2. `inspect` returns stable session-scoped channel IDs, units, values, automation knowledge and a coherent revision. Never use channel index/title as an identity. A project switch, reconnect, mapping deactivation or loss of identity tracking invalidates the epoch.
3. `compareAndSet` carries request ID, command ID, exclusive host lease, deadline and the full validated command. Both sides validate size, identity, allowlist and bounds. Only a tested adapter with reliable stale-state exclusion may advertise `compareAndSet: true`; MIDI Remote alone does not promise atomic compare-and-set. Otherwise stay read-only.
4. `cancel` is best-effort. Acknowledgments distinguish verified, not committed and unknown. Correlate responses with request, command and epoch; reject late/reordered responses. Duplicate commands with identical payload return the stored outcome; same ID/different payload is an error. Never re-execute an unknown outcome.
5. Physical MIDI framing remains deferred: specify bounded message size, 7-bit encoding, sequence/fragment IDs, checksum, reassembly deadline and negotiated transport identity before implementation. No SysEx vendor identifier, driver or framing scheme is assumed here.

DirectAccess instances must follow activation/deactivation lifecycle. Runtime object IDs are not promised durable across reloads. Cubase fader process values need tested conversions to dB; do not assume normalized values are dB or generic pan semantics match every channel type. Native compare-and-set, automation detection and readback must be demonstrated per supported host/edition before enabling writes.
