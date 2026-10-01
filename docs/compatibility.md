# Compatibility plan — checked 2026-10-01

**All real Cubase adapters are unimplemented and untested.** The executable milestone is the simulator. Exact user edition is unknown; version strings alone do not establish a capability or licensing entitlement.

| Host target (Windows x64) | Candidate adapter          | Planned limits                                                                                                                                                                     |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cubase 11                 | Generic Remote / MCU       | Limited configured controls; no MIDI Remote API. Read-only until stable mapping, automation knowledge and feedback safety are proven. Requires an existing working legacy license. |
| Cubase 12                 | MIDI Remote API 1.0        | Basic bindings. Probe mapping/feedback; no assumed DirectAccess or complete introspection.                                                                                         |
| Cubase 13.0.0–13.0.49     | API 1.1                    | Includes touch/idle additions; do not assume DirectAccess.                                                                                                                         |
| Cubase 13.0.50+           | API 1.2                    | DirectAccess candidate; verify lifecycle, IDs and value conversions.                                                                                                               |
| Cubase 14                 | Feature-probed MIDI Remote | Do not infer an exact API surface from the major version; probe every required method.                                                                                             |
| Cubase 15 before 15.0.20  | Feature-probed MIDI Remote | Do not assume the 1.3 additions.                                                                                                                                                   |
| Cubase 15.0.20+           | API 1.3                    | Richer inspection/plugin-manager capability candidates; plugin assignment remains outside this milestone.                                                                          |

Steinberg's [release index](https://steinbergmedia.github.io/midiremote_api_doc/versions/) lists the API 1.0–1.3 host baselines and recommends feature detection. Its [DirectAccess guide](https://steinbergmedia.github.io/midiremote_api_doc/advanced-topics/direct-access/) describes lifecycle, runtime traversal, conversion and inspection. DirectAccess access does not by itself prove safe concurrent writes or complete rollback.

The adapter handshake must report actual edition/version and independently probe stable identity, readable parameters, automation state, write exclusion, readback and supported units. An absent or ambiguous probe disables the affected write. Never claim feature parity among these hosts. Current simulator capabilities are explicitly simulated fader/pan only; plugins, automation writes and audio analysis are unavailable.

No licensing activation, legacy-license recovery, driver installation or Cubase project access is part of this prototype. Cubase 11 needs an already-working legacy license as specified by the project brief; license viability cannot be established by this container. MixConsole snapshots are not complete automation rollback. Future real writes require a user-authorized project copy plus a value journal and a tested conflict/recovery policy.
