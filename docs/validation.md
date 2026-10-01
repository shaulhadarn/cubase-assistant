# Foundation validation

Local evidence collected 2026-10-01 in the Linux Codex cloud container, Node 24.19.0.

- `npm run typecheck` — strict TypeScript compilation passed.
- `npm run build` — production Vite bundle passed.
- `npm test` — 51 core tests covering untrusted commands, bounds, approval binding, duplicate IDs (including across engines), staleness/ABA edits, project identity/reloads, automation, capabilities, disconnects, races before and after commit, timeouts, cancellation, journal integrity and guarded restore.
- `npm run test:ui` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` — 8 real-browser flows: preview/apply/restore; reject/pan; bounds/automation; stale apply/disconnect; stale rollback; cancellation; deadline; narrow-window overflow.
- A separate visual browser check captured the [simulator preview](images/simulator-preview.png); no page errors were observed.

Initial typecheck identified missing Node types in the Playwright configuration; `@types/node` was added and the check passed. Downloading Playwright's bundled Chromium failed with HTTP 403 (`Domain forbidden`); installed system Chromium provided the successful browser run. The test configuration supports that explicit override while defaulting to Playwright's bundled browser on ordinary machines.

A Windows/Linux GitHub Actions matrix is provided. Local Linux results do not establish Windows packaging, native Cubase interoperability or licensing. No real Cubase session, audio, user project, OpenAI request or credential was used. Native safety, durable recovery and live provider tests are deferred as described in the build tasks.
