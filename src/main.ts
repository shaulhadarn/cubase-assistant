import "./style.css";
import { SimulatedBridge } from "./bridge/simulator";
import { CommandEngine } from "./core/engine";
import {
  assertState,
  type Parameter,
  type Proposal,
  type Snapshot,
} from "./core/contracts";
import { ManualDemoProvider } from "./providers/provider";

const bridge = new SimulatedBridge();
let engine = new CommandEngine(bridge);
const provider = new ManualDemoProvider();
let snapshot: Snapshot | undefined;
let selected = "ch:kick";
let proposal: Proposal | undefined;
let busy = false;
let message = "Load the demo project to explore the safe change workflow.";
let error = false;
const root = document.querySelector<HTMLDivElement>("#app")!;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const format = (n: number, parameter: Parameter) =>
  parameter === "faderDb"
    ? `${n.toFixed(1)} dB`
    : n === 0
      ? "Center"
      : `${Math.round(Math.abs(n) * 100)}% ${n < 0 ? "L" : "R"}`;
function render() {
  const ch = snapshot?.channels.find((c) => c.id === selected);
  const connected = bridge.connected && !!snapshot;
  const pending = proposal?.status === "pending";
  root.innerHTML = `
    <header><div class="brand"><span class="mark">ca</span><div>Cubase Assistant<small>LOCAL MIX COMPANION</small></div></div><span class="badge">SIMULATOR ONLY</span><div class="connection ${connected ? "online" : ""}"><i></i>${connected ? "Demo bridge connected" : "Disconnected"}</div></header>
    <main><div class="intro"><div><p class="eyebrow">WORKSPACE / FOUNDATION 01</p><h1>A considered change.<br><span>Always in your control.</span></h1><p class="muted">Inspect a mix, preview one adjustment, and restore with confidence.</p></div><div class="session-actions"><button id="load" ${busy ? "disabled" : ""}>${snapshot ? "Reload demo project" : "Load demo project"}</button><button id="disconnect" class="secondary" ${!connected || busy ? "disabled" : ""}>Disconnect</button></div></div>
    <div class="notice"><strong>Simulated project · fictional values</strong><span>No Cubase connection, audio playback, waveform, or analysis. OpenAI is disabled.</span></div>
    <div class="workspace"><section class="panel tracks"><div class="panel-title"><div><p class="eyebrow">01 / INSPECT</p><h2>Channels</h2></div><span class="count">${snapshot?.channels.length ?? 0} tracks</span></div><p class="session-name">${snapshot ? escape(snapshot.name) : "No project loaded"}</p><div class="track-head"><span>CHANNEL / STABLE ID</span><span>FADER</span><span>PAN</span></div><div class="track-list">${snapshot?.channels.map((t) => `<button class="track ${selected === t.id ? "selected" : ""}" data-track="${escape(t.id)}" ${busy ? "disabled" : ""}><span><b>${escape(t.name)}</b><small>${escape(t.id)} · ${t.kind}${t.automation.faderDb !== "off" ? " · automation read" : ""}</small></span><span>${format(t.faderDb, "faderDb")}</span><span>${format(t.pan, "pan")}</span></button>`).join("") ?? '<div class="empty">Your demo channels will appear here.<br>Nothing is connected to a real DAW.</div>'}</div><div class="metadata">${snapshot ? `Project ${escape(snapshot.projectId)}<br>Epoch ${escape(snapshot.epoch)} · revision ${snapshot.revision}` : "Stable IDs are scoped to the loaded project epoch."}</div></section>
    <section class="panel controls"><div class="panel-title"><div><p class="eyebrow">02 / PROPOSE</p><h2>${ch ? escape(ch.name) : "Selected channel"}</h2></div><span class="pill">Manual · no AI</span></div><p class="muted">Create one bounded adjustment. Values stay unchanged until you click Apply.</p><form id="proposal-form"><label for="parameter">Parameter</label><select id="parameter" ${!connected || busy ? "disabled" : ""}><option value="faderDb">Fader · dB</option><option value="pan">Pan · −1 left to +1 right</option></select><label for="target">Proposed value</label><div class="value-input"><input id="target" type="number" step="0.1" min="-60" max="6" value="${ch ? ch.faderDb - 1 : -9}" required ${!connected || busy ? "disabled" : ""}><span id="unit">dB</span></div><p id="limit" class="hint">Up to ±3 dB per change · range −60 to +6 dB</p><p id="automation" class="warning">${ch?.automation.faderDb !== "off" && ch ? "Fader blocked: automation is active." : "Automation off · eligible for preview"}</p><button type="submit" ${!connected || busy ? "disabled" : ""}>Preview change <span>→</span></button></form><div class="preview"><p class="eyebrow">APPROVAL PREVIEW</p>${proposal ? `<div class="change"><span>${format(proposal.command.expected, proposal.command.parameter)}</span><span class="arrow">→</span><strong>${format(proposal.command.value, proposal.command.parameter)}</strong></div><p>${escape(proposal.command.channelId)} · ${proposal.command.parameter === "pan" ? "Pan" : "Fader"}</p><p class="hint">${escape(proposal.rationale)}</p><div class="preview-actions"><button id="apply" ${!pending || busy || !connected ? "disabled" : ""}>Apply change</button><button id="reject" class="secondary" ${!pending || busy ? "disabled" : ""}>Reject</button></div><small>Proposal ${escape(proposal.status)} · revision ${proposal.command.expectedRevision}</small>` : '<p class="muted">Review the exact before and after values here.</p>'}</div></section></div>
    <div class="status ${error ? "error" : ""}" role="${error ? "alert" : "status"}"><span>${escape(message)}</span>${busy ? '<button id="cancel" class="secondary">Cancel operation</button>' : ""}</div>
    <section class="panel journal"><div class="panel-title"><div><p class="eyebrow">03 / VERIFY & RESTORE</p><h2>Change journal</h2></div><span class="pill">Session memory only</span></div>${engine.journal.length ? `<div class="table-wrap"><table><thead><tr><th>Action / channel</th><th>Before</th><th>Requested</th><th>Readback</th><th>Result</th><th>Recovery</th></tr></thead><tbody>${engine.journal.map((e) => `<tr><td>${e.kind === "apply" ? "Adjust" : "Restore"} · ${escape(e.command.channelId)}<small>${escape(e.id.slice(0, 8))} · ${new Date(e.at).toLocaleTimeString()}</small></td><td>${format(e.before, e.command.parameter)}</td><td>${format(e.command.value, e.command.parameter)}</td><td>${e.after === undefined ? "Unverified" : format(e.after, e.command.parameter)}</td><td><span class="result ${e.status}">${e.status}</span>${e.error ? `<small class="warning">${escape(e.error)}</small>` : ""}</td><td>${e.kind === "apply" && e.status === "verified" ? `<button data-restore="${escape(e.id)}" class="secondary" ${e.restored || busy || !connected ? "disabled" : ""}>${e.restored ? "Restored" : "Restore original"}</button>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No changes yet. Every attempted write will show its before value and verified outcome here.</div>'}<p class="hint">Restore requires the exact verified project revision. Intervening edits are never overwritten. Reloading resets this fictional session and journal.</p></section>
    <section class="bottom"><div><h3>Capability boundaries</h3><div class="capabilities"><span class="supported">✓ Simulated fader & pan</span><span>Unavailable · Native Cubase</span><span>Unavailable · Plugin control</span><span>Blocked · Automation writes</span><span>Unavailable · Audio analysis</span><span>Disabled · OpenAI Agents API</span></div></div><details><summary>Simulator fault controls</summary><p class="hint">Exercise stale previews and write deadlines. These controls only change fictional data.</p><button id="user-edit" class="secondary" ${!connected || busy ? "disabled" : ""}>Simulate user fader edit</button><label class="slow"><input id="slow" type="checkbox" ${bridge.latencyMs > 1000 ? "checked" : ""} ${busy ? "disabled" : ""}> Slow bridge (timeout)</label></details></section>
    <footer>WINDOWS x64 TARGET · CUBASE 11–15 CAPABILITY PLAN<span>Local simulator · no network requests to AI or Cubase</span></footer></main>`;
  bind();
}
async function action(task: () => Promise<void>) {
  busy = true;
  error = false;
  message = "Working with the simulated bridge…";
  render();
  try {
    await task();
  } catch (e) {
    error = true;
    message = e instanceof Error ? e.message : "Unexpected error.";
  } finally {
    busy = false;
    render();
  }
}
async function refresh() {
  snapshot = await engine.inspect();
}
function bind() {
  document.querySelector("#load")?.addEventListener(
    "click",
    () =>
      void action(async () => {
        bridge.latencyMs = 120;
        bridge.load();
        engine = new CommandEngine(bridge);
        proposal = undefined;
        await refresh();
        message =
          "Fictional demo loaded. Select a channel and preview an adjustment.";
      }),
  );
  document.querySelector("#disconnect")?.addEventListener("click", () => {
    bridge.disconnect();
    message =
      "Disconnected. Displayed values are the last snapshot; writes are blocked.";
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-track]").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.dataset.track!;
      render();
    }),
  );
  document
    .querySelector<HTMLSelectElement>("#parameter")
    ?.addEventListener("change", (event) => {
      const p = (event.target as HTMLSelectElement).value as Parameter;
      const ch = snapshot?.channels.find((c) => c.id === selected);
      const input = document.querySelector<HTMLInputElement>("#target")!;
      input.min = p === "pan" ? "-1" : "-60";
      input.max = p === "pan" ? "1" : "6";
      input.step = p === "pan" ? "0.05" : "0.1";
      input.value = String(
        ch ? (p === "pan" ? Math.min(1, ch.pan + 0.1) : ch.faderDb - 1) : 0,
      );
      document.querySelector("#unit")!.textContent =
        p === "pan" ? "L / R" : "dB";
      document.querySelector("#limit")!.textContent =
        p === "pan"
          ? "Up to ±0.25 per change · range −1 to +1"
          : "Up to ±3 dB per change · range −60 to +6 dB";
      document.querySelector("#automation")!.textContent =
        ch?.automation[p] !== "off"
          ? "Blocked: automation is active or unknown."
          : "Automation off · eligible for preview";
    });
  document
    .querySelector("#proposal-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const parameter = document.querySelector<HTMLSelectElement>("#parameter")!
        .value as Parameter;
      const target =
        document.querySelector<HTMLInputElement>("#target")!.valueAsNumber;
      void action(async () => {
        if (!snapshot || !bridge.connected)
          throw new Error("Load a demo project first.");
        const candidate = await provider.propose(
          { snapshot, channelId: selected, parameter, target },
          new AbortController().signal,
        );
        assertState(snapshot, candidate.command);
        if (proposal?.status === "pending") engine.reject(proposal.command.id);
        proposal = engine.propose(candidate.command, candidate.rationale);
        message =
          "Preview ready. No values have changed. Apply or reject this proposal.";
      });
    });
  document.querySelector("#apply")?.addEventListener(
    "click",
    () =>
      void action(async () => {
        if (!proposal) return;
        const entry = await engine.apply(
          proposal.command.id,
          engine.approve(proposal.command.id),
        );
        proposal.status = "consumed";
        message =
          entry.status === "verified"
            ? "Change applied and readback verified. You can restore the original value below."
            : (entry.error ?? "Write not verified.");
        error = entry.status !== "verified";
        if (bridge.connected) {
          try {
            await refresh();
          } catch {
            /* Journal remains authoritative when inspection fails. */
          }
        }
      }),
  );
  document.querySelector("#reject")?.addEventListener("click", () => {
    if (proposal) {
      engine.reject(proposal.command.id);
      proposal.status = "rejected";
      message = "Proposal rejected. No values changed.";
      render();
    }
  });
  document.querySelector("#cancel")?.addEventListener("click", () => {
    engine.cancel();
    message = "Cancellation requested. Waiting for the bridge outcome…";
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach((b) =>
    b.addEventListener(
      "click",
      () =>
        void action(async () => {
          const entry = await engine.restore(
            b.dataset.restore!,
            crypto.randomUUID(),
          );
          message =
            entry.status === "verified"
              ? "Original value restored and readback verified."
              : (entry.error ?? "Restore not verified.");
          error = entry.status !== "verified";
          await refresh();
        }),
    ),
  );
  document.querySelector("#user-edit")?.addEventListener(
    "click",
    () =>
      void action(async () => {
        const ch = snapshot?.channels.find((c) => c.id === selected);
        if (!ch) return;
        bridge.userEdit(ch.id, "faderDb", ch.faderDb + 0.5);
        await refresh();
        message =
          "Simulated user edit: fader +0.5 dB. Existing previews are now stale.";
      }),
  );
  document
    .querySelector<HTMLInputElement>("#slow")
    ?.addEventListener("change", (event) => {
      bridge.latencyMs = (event.target as HTMLInputElement).checked
        ? 3000
        : 120;
    });
}
render();
