# OpenAI integration — disabled, documentation only

The current UI uses `ManualDemoProvider`: user-selected values become local proposals. It does not generate AI advice. `DisabledOpenAIProvider` always throws. There is no SDK, API request, environment-variable activation switch or key requirement in this milestone. No credentials were inspected or created.

The current [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview) describes managed sessions, orchestration and environments. This is the future integration target, not a legacy Assistants API implementation. The [function tools guide](https://developers.openai.com/api/docs/guides/agents-api/tools/functions) describes application-handled calls and results. Reviewed 2026-10-01.

## Future implementation checklist

1. Obtain explicit authorization for API access and project-data disclosure. Keep a key in the trusted local host's secure credential storage, never a renderer bundle, `VITE_*` variable, tracked file or public repository. Confirm API/project access separately from key presence. Default to disabled.
2. Use the current public TypeScript SDK's `client.beta.agents` surface; verify the installed version and current docs at implementation time. The consulted Agents skill specifies `openai >= 7.15.0`. Default managed sessions to an OpenAI-hosted environment if an environment is needed; do not treat that environment as the Windows desktop.
3. Expose only read-only project inspection and bounded `propose_parameter_change` functions. The latter returns a pending proposal ID, not a write acknowledgment. Validate function arguments through the local safe core. Model tools must never include approve, apply, restore, arbitrary code, raw MIDI, shell or plugin execution.
4. Handle `agent.session.requires_action` from the session's pending `required_actions`. Return `agent.session.input.tool_result` using the associated `turn_id` and `call_id`. Persist session/turn/call IDs and tool results; reconnect and reconcile rather than replaying side effects. Observer disconnect does not establish cancellation or completion.
5. Only trusted user interaction in the desktop host can authorize an immutable preview. A model's text saying “approved” is not approval. Track actual turn outcomes and provider errors in the UI; never label a manual fallback as a live agent.
6. Gate any live test behind authorization and bounded spend. Add mocked session/required-action/reconnect tests first. Nothing in this milestone verifies live Agents API access.

[Hosted computer use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) does not control native Cubase on the user's Windows machine; it is not the adapter. The [GPT-6 Astra model reference](https://developers.openai.com/api/docs/models/gpt-6-astra) lists audio as unsupported. Any future audio analysis needs local DSP and, optionally, a separately authorized audio-capable model. No present code interprets audio. Render/export capture, objective loudness measurements, loudness-matched A/B and mix-quality evaluation are deferred.
