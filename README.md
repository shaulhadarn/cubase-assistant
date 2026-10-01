# Cubase Assistant

A local, desktop-ready mixing companion foundation for **Windows x64 / Cubase 11–15**. This milestone is **simulator only**: it does not connect to Cubase, process audio, call OpenAI, or require an API key. All project data is fictional. No waveform, loudness measurement, or mix-quality claim is generated.

## Run locally

Install Node.js 22.12+ (Node 24 recommended), then:

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite. Click **Load demo project**, select a channel, adjust the proposed fader or pan value, and click **Preview change**. The project stays unchanged until **Apply change**. A verified journal entry offers **Restore original**. **Reject** discards a proposal. Lead vocal fader automation deliberately blocks writes; its pan can still be changed.

Expand **Simulator fault controls** to inject an intervening user edit or a slow bridge. Reloading the demo creates a new project epoch and clears the in-memory journal. This is a reset of fictional state, not a real project recovery mechanism.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build
npm run preview
```

`npm run check` runs build/typecheck, core tests and browser tests. On a restricted Linux container with Chromium already installed:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ui
```

On Windows PowerShell, an optional installed-browser override is `$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\path\to\chrome.exe'`. Without that override, Playwright uses its installed Chromium. The simulator requires no drivers, credentials or user project files.

## What works

- Stable channel IDs, project/connection epochs, revisions and parameter values.
- Strict runtime command allowlist: one fader or pan value per proposal, no raw MIDI or executable payloads.
- Explicit approval bound to an immutable proposal, reject, one writer per bridge, ID deduplication within the engine session.
- Fader limits −60 to +6 dB, at most ±3 dB per change; pan −1 to +1, at most ±0.25. These are prototype policy limits, not Cubase's complete parameter range.
- Atomic simulated compare-and-set; automation, identity, revision and expected-value checks at commit time.
- Cancellation/deadlines, verified readback, before/requested/after journal and guarded restore.
- Uncertain post-dispatch outcomes quarantine further writes. Reload resets the simulator; native recovery is deferred.

## Project map

| Path                            | Responsibility                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/core`                      | Typed commands, validation, approval, transaction coordination and journal |
| `src/bridge/simulator.ts`       | In-memory DAW simulator with atomic checks and fault controls              |
| `src/bridge/native-contract.ts` | Future versioned transport types; no native implementation                 |
| `src/providers`                 | Proposal-only provider interface, manual demo, disabled OpenAI provider    |
| `src/main.ts`, `src/style.css`  | Practical local UI, no framework/runtime dependencies                      |
| `tests`                         | Core adversarial tests and real-browser happy/error flows                  |
| `docs`                          | Architecture, compatibility, integration plan and prioritized build tasks  |

See [validation evidence](docs/validation.md), [architecture](docs/architecture.md), [compatibility](docs/compatibility.md), [OpenAI boundary](docs/openai.md), and [next build tasks](docs/build-tasks.md). Windows/Cubase integration, licensing, audio analysis and live OpenAI access have **not** been tested. This is not a Windows installer.
